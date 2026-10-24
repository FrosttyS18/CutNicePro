mod analysis;
mod ffmpeg;
pub mod thumbnail;
use crate::{media_store::MediaStore, transcription::process::ProcessControl};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct PreviewJobs {
    serial: Mutex<()>,
    control: ProcessControl,
}
impl PreviewJobs {
    pub fn cancel(&self) {
        self.control.cancel();
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    version: u8,
    frames: Vec<Vec<u8>>,
    peaks: Vec<f32>,
    has_audio: bool,
}

struct Scratch(std::path::PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn generate(
    base: &Path,
    media: &Path,
    sha: &str,
    duration: f64,
    has_audio: bool,
    jobs: &PreviewJobs,
) -> Result<Preview, String> {
    let _serial = jobs.serial.lock().map_err(|_| "prévia indisponível")?;
    jobs.control.check()?;
    let root = base.join("cutnicepro/previews");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let cache = root.join(format!("{sha}.json"));
    if let Ok(json) = std::fs::read(&cache) {
        if let Ok(data) = serde_json::from_slice::<Preview>(&json) {
            if data.version == 2
                && data.frames.len() == 24
                && (!has_audio || !data.peaks.is_empty())
            {
                return Ok(data);
            }
        }
    }
    let tools = crate::media_analyze::detect_fftools().ok_or(
        "Não foi possível preparar a linha do tempo. Verifique a instalação do aplicativo.",
    )?;
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = Scratch(root.join(uuid::Uuid::new_v4().to_string()));
    std::fs::create_dir_all(&scratch.0).map_err(|e| e.to_string())?;
    let mut frames = Vec::new();
    for i in 0..24 {
        let image = scratch.0.join(format!("{i}.jpg"));
        let cmd = ffmpeg::thumbnail(&ffmpeg, media, &image, i, 24, duration);
        jobs.control.run(cmd, &scratch.0.join("preview.log"))?;
        let bytes = std::fs::read(&image).map_err(|e| format!("miniatura indisponível: {e}"))?;
        if bytes.is_empty() {
            return Err("miniatura vazia".into());
        }
        frames.push(bytes);
    }
    let peaks = if has_audio {
        let pcm = scratch.0.join("audio.pcm");
        let cmd = ffmpeg::audio(&ffmpeg, media, &pcm);
        jobs.control.run(cmd, &scratch.0.join("audio.log"))?;
        analysis::peaks(
            &std::fs::read(pcm).map_err(|e| e.to_string())?,
            (duration * 120.0).ceil().min(300_000.0) as usize,
        )
    } else {
        vec![]
    };
    let data = Preview {
        version: 2,
        frames,
        peaks,
        has_audio,
    };
    jobs.control.check()?;
    let temporary = root.join(format!("{sha}.tmp"));
    std::fs::write(
        &temporary,
        serde_json::to_vec(&data).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, cache).map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn timeline_preview(app: AppHandle, media_id: String) -> Result<Preview, String> {
    let entry = app
        .state::<MediaStore>()
        .get(&media_id)?
        .filter(|m| !m.unavailable)
        .ok_or("Vídeo indisponível. Importe o arquivo novamente.")?;
    if entry.sha256.len() != 64 || !entry.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Não foi possível abrir este vídeo. Importe o arquivo novamente.".into());
    }
    let analysis = entry
        .analysis
        .as_ref()
        .ok_or("Não foi possível ler a duração deste vídeo.")?;
    let duration = analysis.duration_ms as f64 / 1000.0;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Duração do vídeo inválida.".into());
    }
    let has_audio = analysis.has_audio;
    let base = crate::app_data_base(&app)?;
    let path = app
        .state::<MediaStore>()
        .files_dir()
        .join(format!("{}.{}", entry.sha256, entry.ext));
    let jobs = app.state::<Arc<PreviewJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        generate(&base, &path, &entry.sha256, duration, has_audio, &jobs)
    })
    .await
    .map_err(|e| e.to_string())?
}
