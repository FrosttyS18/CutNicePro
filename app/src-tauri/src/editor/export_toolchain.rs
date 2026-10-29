use crate::{
    media_source::{SourceGuard, SourceStamp},
    transcription::process::ProcessControl,
};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

#[derive(Clone)]
struct Fingerprint {
    stamps: Vec<SourceStamp>,
    identity: String,
}

#[derive(Default)]
struct FingerprintCache {
    entry: Mutex<Option<Fingerprint>>,
}

impl FingerprintCache {
    fn fingerprint(
        &self,
        paths: &[PathBuf],
        control: &ProcessControl,
        calculate: impl FnOnce(&mut [SourceGuard], &ProcessControl) -> Result<String, String>,
    ) -> Result<String, String> {
        control.check()?;
        let mut sources = Vec::with_capacity(paths.len());
        for path in paths {
            control.check()?;
            sources.push(SourceGuard::open(path).map_err(|error| error.message())?);
        }
        let stamps: Vec<_> = sources
            .iter()
            .map(|source| source.stamp().clone())
            .collect();
        let cached = self
            .entry
            .lock()
            .map_err(|_| "Fingerprint indisponível.".to_string())?
            .as_ref()
            .filter(|entry| entry.stamps == stamps)
            .cloned();
        if let Some(cached) = cached {
            recheck(&sources, control)?;
            return Ok(cached.identity);
        }
        let identity = calculate(&mut sources, control)?;
        recheck(&sources, control)?;
        let mut entry = self
            .entry
            .lock()
            .map_err(|_| "Fingerprint indisponível.".to_string())?;
        control.check()?;
        *entry = Some(Fingerprint {
            stamps,
            identity: identity.clone(),
        });
        Ok(identity)
    }
}

fn recheck(sources: &[SourceGuard], control: &ProcessControl) -> Result<(), String> {
    for source in sources {
        control.check()?;
        source.recheck().map_err(|error| error.message())?;
    }
    control.check()
}

fn digest_sources(sources: &mut [SourceGuard], control: &ProcessControl) -> Result<String, String> {
    let mut hash = Sha256::new();
    hash.update(b"editor-final-export-v1");
    let mut buffer = vec![0_u8; 1024 * 1024];
    for source in sources {
        loop {
            control.check()?;
            let count = source
                .file
                .read(&mut buffer)
                .map_err(|error| error.to_string())?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
    }
    control.check()?;
    Ok(format!("{:x}", hash.finalize()))
}

pub(super) fn identity(control: &ProcessControl) -> Result<String, String> {
    static CACHE: OnceLock<FingerprintCache> = OnceLock::new();
    control.check()?;
    let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg não encontrado")?;
    let paths = [
        std::env::current_exe().map_err(|error| error.to_string())?,
        tools.ffprobe.clone(),
        tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        }),
    ];
    CACHE
        .get_or_init(FingerprintCache::default)
        .fingerprint(&paths, control, digest_sources)
}

#[cfg(test)]
#[path = "export_toolchain_tests.rs"]
mod tests;
