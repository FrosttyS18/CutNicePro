use super::{
    checkpoints::{self, Cache, Chunk},
    chunk_text, parser,
    process::ProcessControl,
    tools::EngineTools,
    types::{Segment, Transcript},
};
use std::{path::Path, process::Command};

struct Scratch(std::path::PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub struct Output {
    pub transcript: Transcript,
    pub cache: Cache,
}

#[cfg(test)]
mod reference_audio_tests {
    use super::*;
    use crate::media_store::reference_tests::Fixture;
    use std::{sync::atomic::AtomicBool, time::Duration};

    #[test]
    fn reference_audio_adapter_extracts_real_audio_without_managed_copy() {
        let fixture = Fixture::new();
        let tools =
            crate::media_analyze::detect_fftools().expect("FFmpeg de integração indisponível");
        let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        let original = fixture.0.join("áudio original com espaços.mp4");
        let control = ProcessControl::default();
        let mut command = Command::new(&ffmpeg);
        command
            .args([
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=160x90:d=0.5",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=0.5",
                "-c:v",
                "libx264",
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&original);
        control
            .run(command, &fixture.0.join("fixture.log"))
            .unwrap();
        let verified = crate::media_import::verify_reference(
            &original,
            &AtomicBool::new(false),
            &|_| {},
            Duration::from_secs(10),
        )
        .unwrap();
        let store = fixture.store();
        let analysis = crate::media_analyze::analyze(&tools, verified.path()).unwrap();
        assert!(analysis.has_audio);
        let entry = store
            .publish_reference(
                &verified,
                "mp4",
                "áudio original com espaços.mp4",
                "p1",
                Some(analysis),
            )
            .unwrap();
        drop(verified);
        let source = store.resolve(&entry.media_id, Some("p1")).unwrap();
        let wav = fixture.0.join("extracted.wav");
        control
            .run(
                audio_command(
                    &ffmpeg,
                    &source.path,
                    &wav,
                    &Chunk {
                        start: 0.0,
                        end: 0.5,
                        audio_start: 0.0,
                        audio_end: 0.5,
                    },
                ),
                &fixture.0.join("extract.log"),
            )
            .unwrap();
        source.recheck().unwrap();
        let bytes = std::fs::read(&wav).unwrap();
        assert!(bytes.starts_with(b"RIFF"));
        assert!(bytes.len() > 15_000);
        assert!(std::fs::read_dir(store.files_dir())
            .unwrap()
            .next()
            .is_none());
        assert_eq!(
            std::fs::metadata(&original).unwrap().len(),
            entry.size_bytes
        );
    }
}

fn transcribe(
    media: &Path,
    scratch: &Path,
    chunk: &Chunk,
    tools: &EngineTools,
    control: &ProcessControl,
    progress: impl Fn(u8),
) -> Result<Vec<Segment>, String> {
    let wav = scratch.join("audio.wav");
    control.run(
        audio_command(&tools.ffmpeg, media, &wav, chunk),
        &scratch.join("extract.log"),
    )?;
    let output = scratch.join("result");
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
        .to_string();
    let mut command = Command::new(&tools.whisper);
    command
        .arg("-m")
        .arg(&tools.model)
        .arg("-f")
        .arg(&wav)
        .args([
            "-l",
            "pt",
            "-nfa",
            "-dtw",
            tools.profile.alignment(),
            "-t",
            &threads,
            "-pp",
            "-ojf",
            "-bs",
            "5",
            "-bo",
            "5",
            "-mc",
            "0",
            "-sns",
            "-of",
        ])
        .arg(&output);
    if !tools.gpu {
        command.arg("-ng");
    }
    control.run_with_output(&mut command, &scratch.join("whisper.log"), |line| {
        if let Some(value) = super::progress::whisper_percent(line) {
            progress(value);
        }
    })?;
    control.check()?;
    let json = std::fs::read_to_string(output.with_extension("json"))
        .map_err(|e| format!("o transcritor não gerou um resultado legível: {e}"))?;
    parser::parse(&json, chunk.audio_end - chunk.audio_start)
}

fn audio_command(ffmpeg: &Path, media: &Path, wav: &Path, chunk: &Chunk) -> Command {
    let mut extract = Command::new(ffmpeg);
    extract
        .args([
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-ss",
            &chunk.audio_start.to_string(),
            "-i",
        ])
        .arg(media)
        .args([
            "-t",
            &(chunk.audio_end - chunk.audio_start).to_string(),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(wav);
    extract
}

pub fn run(
    base: &Path,
    media: &Path,
    media_id: &str,
    duration: f64,
    tools: EngineTools,
    control: &ProcessControl,
    stage: impl Fn(&str),
    progress: impl Fn(u8),
) -> Result<Output, String> {
    control.check()?;
    parser::validate(&[], duration)?;
    let cache = Cache::open(base, media, media_id, duration, &tools)?;
    let scratch = Scratch(
        base.join("cutnicepro/transcription-jobs")
            .join(uuid::Uuid::new_v4().to_string()),
    );
    std::fs::create_dir_all(&scratch.0)
        .map_err(|e| format!("não foi possível preparar áudio temporário: {e}"))?;
    let mut all = Vec::new();
    for (index, chunk) in checkpoints::chunks(duration).iter().enumerate() {
        control.check()?;
        let segments = match cache.load(index, chunk) {
            Some(segments) => segments,
            None => {
                stage("transcribing");
                let directory = scratch.0.join(index.to_string());
                std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
                let value = transcribe(media, &directory, chunk, &tools, control, |percent| {
                    progress(
                        ((chunk.start
                            + (chunk.end - chunk.start) * f64::from(percent.min(90)) / 100.0)
                            / duration
                            * 95.0) as u8,
                    );
                })?;
                cache.save(index, chunk, &value)?;
                value
            }
        };
        chunk_text::append(&mut all, segments, chunk, index);
        progress((chunk.end / duration * 95.0) as u8);
    }
    control.check()?;
    parser::validate(&all, duration)?;
    stage("saving");
    Ok(Output {
        transcript: Transcript {
            version: 1,
            media_id: media_id.into(),
            language: "pt".into(),
            model: tools.profile.model().into(),
            segments: all,
        },
        cache,
    })
}
