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
    has_video: bool,
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
                && data.frames.len() == if has_video { 24 } else { 0 }
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
    for i in 0..if has_video { 24 } else { 0 } {
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
        let input = std::fs::File::open(pcm).map_err(|e| e.to_string())?;
        let bytes = input.metadata().map_err(|e| e.to_string())?.len();
        analysis::peaks_reader(
            input,
            bytes,
            (duration * 120.0).ceil().min(300_000.0) as usize,
        )?
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
    let source = app.state::<MediaStore>().resolve(&media_id, None)?;
    let analysis = source
        .entry
        .analysis
        .as_ref()
        .ok_or("Não foi possível ler a duração deste vídeo.")?;
    let duration = analysis.duration_ms as f64 / 1000.0;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Duração do vídeo inválida.".into());
    }
    let has_audio = analysis.has_audio;
    let has_video = !analysis.video_codec.is_empty();
    let base = crate::app_data_base(&app)?;
    let jobs = app.state::<Arc<PreviewJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let preview = generate(
            &base,
            &source.path,
            &source.entry.sha256,
            duration,
            has_audio,
            has_video,
            &jobs,
        )?;
        source.recheck()?;
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod editor_media_integration {
    use super::*;

    #[test]
    #[ignore = "requires FFmpeg installed"]
    fn audio_and_image_use_real_files_with_bounded_audio_preview() {
        let tools =
            crate::media_analyze::detect_fftools().expect("FFmpeg de integração indisponível");
        let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-editor-preview")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let _cleanup = Scratch(root.clone());
        let control = ProcessControl::default();
        let audio = root.join("voice.wav");
        let mut command = std::process::Command::new(&exe);
        command
            .args([
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=0.25",
                "-c:a",
                "pcm_s16le",
            ])
            .arg(&audio);
        control.run(command, &root.join("fixture.log")).unwrap();
        let analysis = crate::media_analyze::analyze_for_kind(
            &tools,
            &audio,
            &crate::editor::types::MediaKind::Audio,
        )
        .unwrap();
        assert_eq!(analysis.duration_ms, 250);
        assert!(analysis.has_audio);
        assert_eq!(analysis.width, 0);
        let jobs = PreviewJobs::default();
        let preview = generate(&root, &audio, "fixture-audio", 0.25, true, false, &jobs).unwrap();
        assert!(preview.frames.is_empty());
        assert!(preview.peaks.iter().any(|value| *value > 0.01));
        let cached = generate(&root, &audio, "fixture-audio", 0.25, true, false, &jobs).unwrap();
        assert_eq!(cached.peaks, preview.peaks);
        let image = root.join("image.png");
        let mut command = std::process::Command::new(exe);
        command
            .args([
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=320x180",
                "-frames:v",
                "1",
                "-threads",
                "1",
            ])
            .arg(&image);
        control.run(command, &root.join("image.log")).unwrap();
        let analysis = crate::media_analyze::analyze_for_kind(
            &tools,
            &image,
            &crate::editor::types::MediaKind::Image,
        )
        .unwrap();
        assert_eq!(
            (analysis.width, analysis.height, analysis.duration_ms),
            (320, 180, 0)
        );
        assert!(!analysis.has_audio);
    }
}
