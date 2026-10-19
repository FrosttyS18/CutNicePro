use super::profiles::{Profile, ProfileStatus};
use super::types::EngineStatus;
use std::path::{Path, PathBuf};

pub struct EngineTools {
    pub ffmpeg: PathBuf,
    pub whisper: PathBuf,
    pub model: PathBuf,
    pub profile: Profile,
    pub gpu: bool,
}

pub fn discover(base: &Path) -> Result<EngineTools, String> {
    discover_profile(base, Profile::Turbo)
}

pub fn discover_profile(base: &Path, profile: Profile) -> Result<EngineTools, String> {
    let root = std::env::var_os("CNP_ENGINE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor/whisper")
            } else {
                base.join("cutnicepro/engine")
            }
        });
    let exe = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    let accelerated = super::gpu::executable(&root);
    let gpu = accelerated.is_some();
    let whisper = accelerated
        .into_iter()
        .chain([
            root.join("bin/Release").join(exe),
            root.join("bin").join(exe),
        ])
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("Motor local ausente. Instale whisper.cpp na pasta de ferramentas do aplicativo.")?;
    let model = root.join("models").join(profile.filename());
    if !model.is_file() {
        return Err("Modelo multilíngue ausente. Instale o modelo antes de transcrever.".into());
    }
    let probe = crate::media_analyze::detect_fftools()
        .ok_or("FFmpeg/ffprobe ausentes. Instale FFmpeg e tente novamente.")?;
    let ffmpeg = probe.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    if !ffmpeg.is_file() {
        return Err("FFmpeg ausente junto ao ffprobe. Repare a instalação do FFmpeg.".into());
    }
    Ok(EngineTools {
        ffmpeg,
        whisper,
        model,
        profile,
        gpu,
    })
}

pub fn status(base: &Path) -> EngineStatus {
    let profiles: Vec<ProfileStatus> = [Profile::Turbo, Profile::Large]
        .into_iter()
        .map(|profile| ProfileStatus {
            id: profile.id(),
            available: discover_profile(base, profile).is_ok(),
        })
        .collect();
    let available = profiles.iter().any(|profile| profile.available);
    let error = if available {
        None
    } else {
        discover(base).err()
    };
    EngineStatus {
        available,
        model: "whisper-large-v3-turbo".into(),
        error,
        profiles,
    }
}
