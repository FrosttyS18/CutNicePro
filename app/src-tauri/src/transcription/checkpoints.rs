use super::{parser, tools::EngineTools, types::Segment};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Chunk {
    pub start: f64,
    pub end: f64,
    pub audio_start: f64,
    pub audio_end: f64,
}

pub fn chunks(duration: f64) -> Vec<Chunk> {
    (0..(duration / 180.0).ceil() as usize)
        .map(|index| {
            let start = index as f64 * 180.0;
            let end = (start + 180.0).min(duration);
            Chunk {
                start,
                end,
                audio_start: (start - 2.0).max(0.0),
                audio_end: (end + 2.0).min(duration),
            }
        })
        .collect()
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Record {
    version: u8,
    chunk: Chunk,
    segments: Vec<Segment>,
}

pub struct Cache {
    pub path: PathBuf,
    count: usize,
}

impl Cache {
    pub fn open(
        base: &Path,
        media: &Path,
        media_id: &str,
        duration: f64,
        tools: &EngineTools,
    ) -> Result<Self, String> {
        let mut hash = Sha256::new();
        hash.update(format!(
            "chunks-v1:180:2:pt:beam5:best5:mc0:sns:{media_id}:{duration:.6}:{}:{}",
            tools.profile.model(),
            tools.gpu
        ));
        for file in [media, tools.model.as_path(), tools.whisper.as_path()] {
            let meta = std::fs::metadata(file).map_err(|e| e.to_string())?;
            hash.update(file.to_string_lossy().as_bytes());
            hash.update(meta.len().to_le_bytes());
            hash.update(
                meta.modified()
                    .map_err(|e| e.to_string())?
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos()
                    .to_le_bytes(),
            );
        }
        let value = Self {
            path: base
                .join("cutnicepro/transcription-cache")
                .join(format!("{:x}", hash.finalize())),
            count: chunks(duration).len(),
        };
        std::fs::create_dir_all(&value.path).map_err(|e| e.to_string())?;
        if value.path.join("completed").exists() {
            for index in 0..value.count {
                value.remove(index)?;
            }
            std::fs::remove_file(value.path.join("completed")).map_err(|e| e.to_string())?;
        }
        Ok(value)
    }

    pub fn load(&self, index: usize, chunk: &Chunk) -> Option<Vec<Segment>> {
        let path = self.path.join(format!("{index}.json"));
        if std::fs::metadata(&path).ok()?.len() > 4_000_000 {
            return None;
        }
        let value: Record = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
        (value.version == 1
            && &value.chunk == chunk
            && parser::validate(&value.segments, chunk.audio_end - chunk.audio_start).is_ok())
        .then_some(value.segments)
    }

    pub fn save(&self, index: usize, chunk: &Chunk, segments: &[Segment]) -> Result<(), String> {
        parser::validate(segments, chunk.audio_end - chunk.audio_start)?;
        let record = Record {
            version: 1,
            chunk: chunk.clone(),
            segments: segments.to_vec(),
        };
        crate::file_output::atomic_write(&self.path.join(format!("{index}.json")), |file| {
            serde_json::to_writer(file, &record).map_err(|e| e.to_string())
        })
    }

    fn remove(&self, index: usize) -> Result<(), String> {
        match std::fs::remove_file(self.path.join(format!("{index}.json"))) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn complete(&self) -> Result<(), String> {
        crate::file_output::atomic_write(&self.path.join("completed"), |file| {
            use std::io::Write;
            file.write_all(b"1").map_err(|e| e.to_string())
        })?;
        for index in 0..self.count {
            let _ = self.remove(index);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunks_cover_duration_with_bounded_context() {
        let value = chunks(400.0);
        assert_eq!(value.len(), 3);
        assert_eq!(
            (value[1].start, value[1].audio_start, value[1].audio_end),
            (180.0, 178.0, 362.0)
        );
        assert_eq!(value[2].end, 400.0);
    }
    #[test]
    fn checkpoints_reject_corruption_wrong_bounds_and_reset_after_publication() {
        let path = std::env::temp_dir().join(format!("cnp-checkpoints-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        let cache = Cache {
            path: path.clone(),
            count: 1,
        };
        let chunk = chunks(20.0).remove(0);
        let segments = vec![Segment {
            id: "s".into(),
            start: 0.0,
            end: 1.0,
            text: "Fala real".into(),
            words: vec![],
        }];
        cache.save(0, &chunk, &segments).unwrap();
        assert_eq!(cache.load(0, &chunk).unwrap()[0].text, "Fala real");
        assert!(cache.load(0, &chunks(21.0).remove(0)).is_none());
        std::fs::write(path.join("0.json"), b"{}").unwrap();
        assert!(cache.load(0, &chunk).is_none());
        cache.save(0, &chunk, &segments).unwrap();
        cache.complete().unwrap();
        assert!(path.join("completed").is_file());
        assert!(!path.join("0.json").exists());
        std::fs::remove_dir_all(path).unwrap();
    }
}
