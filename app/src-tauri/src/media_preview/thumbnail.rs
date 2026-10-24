use super::{PreviewJobs, Scratch};
use crate::{media_store::MediaStore, transcription::process::ProcessControl};
use serde::Serialize;
use std::{path::Path, process::Command, sync::Arc};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct Thumbnail {
    bytes: Vec<u8>,
    width: u32,
    height: u32,
}

fn generate(
    ffmpeg: &Path,
    source: &Path,
    cache: &Path,
    time: f64,
    control: &ProcessControl,
) -> Result<Vec<u8>, String> {
    control.check()?;
    if let Ok(bytes) = std::fs::read(cache) {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }
    let root = cache.parent().ok_or("Cache de miniatura inválido.")?;
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let scratch = Scratch(root.join(uuid::Uuid::new_v4().to_string()));
    std::fs::create_dir_all(&scratch.0).map_err(|e| e.to_string())?;
    let image = scratch.0.join("frame.jpg");
    let mut command = Command::new(ffmpeg);
    command
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-ss",
        ])
        .arg(format!("{time:.3}"))
        .arg("-i")
        .arg(source)
        .args([
            "-map",
            "0:v:0",
            "-an",
            "-frames:v",
            "1",
            "-vf",
            "scale=640:640:force_original_aspect_ratio=decrease",
            "-filter_threads",
            "1",
            "-threads",
            "1",
            "-q:v",
            "4",
            "-y",
        ])
        .arg(&image);
    control.run(command, &scratch.0.join("thumbnail.log"))?;
    let bytes = std::fs::read(&image).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("Não foi possível preparar a miniatura.".into());
    }
    control.check()?;
    if std::fs::rename(&image, cache).is_err() && !cache.is_file() {
        return Err("Não foi possível guardar a miniatura.".into());
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn clip_thumbnail(
    app: AppHandle,
    media_id: String,
    time: f64,
) -> Result<Thumbnail, String> {
    if !time.is_finite() || time < 0.0 {
        return Err("Posição de miniatura inválida.".into());
    }
    let store = app.state::<MediaStore>();
    let entry = store
        .get(&media_id)?
        .filter(|m| !m.unavailable)
        .ok_or("Vídeo indisponível.")?;
    let analysis = entry.analysis.as_ref().ok_or("Vídeo sem análise.")?;
    let duration = analysis.duration_ms as f64 / 1000.0;
    if time >= duration
        || entry.sha256.len() != 64
        || !entry.sha256.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err("Posição de miniatura inválida.".into());
    }
    let (width, height) = (analysis.width, analysis.height);
    let source = store
        .files_dir()
        .join(format!("{}.{}", entry.sha256, entry.ext));
    let cache = crate::app_data_base(&app)?
        .join("cutnicepro/thumbnails")
        .join(format!(
            "{}-{}.jpg",
            entry.sha256,
            (time * 1000.0).round() as u64
        ));
    let jobs = app.state::<Arc<PreviewJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _serial = jobs
            .serial
            .lock()
            .map_err(|_| "Miniaturas indisponíveis.")?;
        let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg indisponível.")?;
        let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        generate(&ffmpeg, &source, &cache, time, &jobs.control).map(|bytes| Thumbnail {
            bytes,
            width,
            height,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnail_is_an_image_cached_without_reopening_the_video() {
        let tools = crate::media_analyze::detect_fftools().expect("FFmpeg de teste disponível");
        let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        let scratch =
            Scratch(std::env::temp_dir().join(format!("cnp-thumbnail-{}", uuid::Uuid::new_v4())));
        std::fs::create_dir_all(&scratch.0).unwrap();
        let video = scratch.0.join("source.mp4");
        let mut fixture = Command::new(&ffmpeg);
        fixture
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=320x180:d=1",
                "-threads",
                "1",
                "-y",
            ])
            .arg(&video);
        let control = ProcessControl::default();
        control
            .run(fixture, &scratch.0.join("fixture.log"))
            .unwrap();
        let cache = scratch.0.join("cache/frame.jpg");
        let bytes = generate(&ffmpeg, &video, &cache, 0.4, &control).unwrap();
        assert!(bytes.starts_with(&[0xff, 0xd8]));
        assert!(bytes.len() < 512 * 1024);
        let cached = generate(
            Path::new("missing-ffmpeg"),
            Path::new("missing-video"),
            &cache,
            0.4,
            &control,
        )
        .unwrap();
        assert_eq!(cached, bytes);
    }
}
