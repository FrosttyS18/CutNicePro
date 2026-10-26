//! Análise de mídia com ffprobe (M2A). Detecção do binário em PATH →
//! links do winget → app-data\bin. Parsing TIPADO de
//! `ffprobe -v quiet -print_format json -show_format -show_streams`
//! (flags explícitas, conforme emenda do mantenedor).

use crate::transcription::process::ProcessControl;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

use serde::Deserialize;

pub use crate::media_store::MediaAnalysis;

#[derive(Debug, Deserialize)]
struct FfProbeOutput {
    #[serde(default)]
    streams: Vec<FfStream>,
    #[serde(default)]
    format: Option<FfFormat>,
}

#[derive(Debug, Deserialize)]
struct FfStream {
    #[serde(default)]
    codec_type: Option<String>,
    #[serde(default)]
    codec_name: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    avg_frame_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfFormat {
    #[serde(default)]
    duration: Option<String>,
}

pub struct FfTools {
    pub ffprobe: PathBuf,
}

pub fn detect_fftools() -> Option<FfTools> {
    crate::media_tools::ffprobe().map(|ffprobe| FfTools { ffprobe })
}

fn parse_fps(rate: &str) -> f64 {
    match rate.split_once('/') {
        Some((n, d)) => {
            let n: f64 = n.parse().unwrap_or(0.0);
            let d: f64 = d.parse().unwrap_or(0.0);
            if d > 0.0 {
                n / d
            } else {
                0.0
            }
        }
        None => rate.parse().unwrap_or(0.0),
    }
}

/// Roda o ffprobe no arquivo e devolve a análise tipada.
pub fn analyze(fftools: &FfTools, media_path: &std::path::Path) -> Result<MediaAnalysis, String> {
    analyze_for_kind(fftools, media_path, &crate::editor::types::MediaKind::Video)
}

pub fn analyze_for_kind(
    fftools: &FfTools,
    media_path: &std::path::Path,
    kind: &crate::editor::types::MediaKind,
) -> Result<MediaAnalysis, String> {
    let out = probe_command(fftools, media_path)
        .output()
        .map_err(|e| format!("falha ao executar ffprobe: {e}"))?;
    if !out.status.success() {
        return Err("ffprobe não conseguiu analisar o arquivo (formato não suportado?)".into());
    }
    parse_probe_for_kind(&out.stdout, kind)
        .ok_or_else(|| "saída do ffprobe em formato inesperado".to_string())
}

fn probe_command(tools: &FfTools, source: &Path) -> Command {
    let mut command = Command::new(&tools.ffprobe);
    command
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(source);
    command
}

#[cfg(all(test, windows))]
#[path = "media_analyze_control_tests.rs"]
mod control_tests;

fn analyze_import_with_timeout(
    tools: &FfTools,
    source: &std::path::Path,
    kind: &crate::editor::types::MediaKind,
    control: Arc<ProcessControl>,
    scratch_root: &Path,
    timeout: Duration,
) -> Result<MediaAnalysis, String> {
    control.check()?;
    let scratch = ProbeScratch(scratch_root.join(format!(".probe-{}", uuid::Uuid::new_v4())));
    std::fs::create_dir(&scratch.0)
        .map_err(|error| format!("análise temporária indisponível: {error}"))?;
    let output = scratch.0.join("metadata.json");
    let deadline = ProbeDeadline::new(control.clone(), timeout);
    let timed_out = deadline.timed_out.clone();
    let result = control.run_to_file(
        &mut probe_command(tools, source),
        &scratch.0.join("probe.log"),
        &output,
    );
    drop(deadline);
    if timed_out.load(Ordering::SeqCst) {
        return Err("Tempo limite da análise de mídia excedido.".into());
    }
    result?;
    control.check()?;
    parse_probe_for_kind(
        &std::fs::read(output).map_err(|error| error.to_string())?,
        kind,
    )
    .ok_or_else(|| "saída do ffprobe em formato inesperado".to_string())
}

pub fn analyze_import(
    tools: &FfTools,
    source: &Path,
    kind: &crate::editor::types::MediaKind,
    control: Arc<ProcessControl>,
    scratch_root: &Path,
) -> Result<MediaAnalysis, String> {
    let bytes = std::fs::metadata(source)
        .map_err(|error| error.to_string())?
        .len();
    let seconds = 30 + bytes.div_ceil(1024 * 1024 * 1024).min(18) * 5;
    analyze_import_with_timeout(
        tools,
        source,
        kind,
        control,
        scratch_root,
        Duration::from_secs(seconds),
    )
}

struct ProbeScratch(PathBuf);
impl Drop for ProbeScratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct ProbeDeadline {
    finished: Option<mpsc::Sender<()>>,
    worker: Option<std::thread::JoinHandle<()>>,
    timed_out: Arc<AtomicBool>,
}
impl ProbeDeadline {
    fn new(control: Arc<ProcessControl>, timeout: Duration) -> Self {
        let (finished, receiver) = mpsc::channel();
        let timed_out = Arc::new(AtomicBool::new(false));
        let state = timed_out.clone();
        let worker = std::thread::spawn(move || {
            if matches!(
                receiver.recv_timeout(timeout),
                Err(mpsc::RecvTimeoutError::Timeout)
            ) {
                state.store(true, Ordering::SeqCst);
                control.cancel();
            }
        });
        Self {
            finished: Some(finished),
            worker: Some(worker),
            timed_out,
        }
    }
}
impl Drop for ProbeDeadline {
    fn drop(&mut self) {
        if let Some(finished) = self.finished.take() {
            let _ = finished.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub fn parse_probe_for_kind(
    json: &[u8],
    kind: &crate::editor::types::MediaKind,
) -> Option<MediaAnalysis> {
    use crate::editor::types::MediaKind;
    if *kind == MediaKind::Video {
        return parse_probe_output(json);
    }
    let probe: FfProbeOutput = serde_json::from_slice(json).ok()?;
    match kind {
        MediaKind::Image => {
            let image = probe
                .streams
                .iter()
                .find(|stream| stream.codec_type.as_deref() == Some("video"))?;
            let (width, height) = (image.width?, image.height?);
            if width == 0 || height == 0 {
                return None;
            }
            Some(MediaAnalysis {
                duration_ms: 0,
                width,
                height,
                video_codec: image.codec_name.clone().unwrap_or_default(),
                audio_codec: None,
                has_audio: false,
                fps: 0.0,
            })
        }
        MediaKind::Audio => {
            let audio = probe
                .streams
                .iter()
                .find(|stream| stream.codec_type.as_deref() == Some("audio"))?;
            let duration: f64 = probe.format?.duration?.parse().ok()?;
            if !duration.is_finite() || duration <= 0.0 {
                return None;
            }
            Some(MediaAnalysis {
                duration_ms: (duration * 1000.0).round() as u64,
                width: 0,
                height: 0,
                video_codec: String::new(),
                audio_codec: audio.codec_name.clone(),
                has_audio: true,
                fps: 0.0,
            })
        }
        MediaKind::Video => None,
    }
}

pub fn parse_probe_output(json: &[u8]) -> Option<MediaAnalysis> {
    let probe: FfProbeOutput = serde_json::from_slice(json).ok()?;
    let format = probe.format.as_ref()?;
    let duration_s: f64 = format.duration.as_deref()?.parse().ok()?;
    if !(duration_s.is_finite()) || duration_s <= 0.0 {
        return None;
    }
    let video = probe
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))?;
    let audio = probe
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"));
    let fps = video
        .avg_frame_rate
        .as_deref()
        .map(parse_fps)
        .filter(|f| f.is_finite() && *f > 0.0)
        .unwrap_or(0.0);
    Some(MediaAnalysis {
        duration_ms: (duration_s * 1000.0).round() as u64,
        width: video.width?,
        height: video.height?,
        video_codec: video.codec_name.clone().unwrap_or_default(),
        audio_codec: audio.and_then(|a| a.codec_name.clone()),
        has_audio: audio.is_some(),
        fps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_images_and_audio_have_real_metadata_without_fake_video() {
        use crate::editor::types::MediaKind;
        let image =
            br#"{"streams":[{"codec_type":"video","codec_name":"png","width":640,"height":480}]}"#;
        let parsed = parse_probe_for_kind(image, &MediaKind::Image).unwrap();
        assert_eq!(
            (parsed.width, parsed.height, parsed.duration_ms),
            (640, 480, 0)
        );
        assert!(!parsed.has_audio);
        let audio=br#"{"streams":[{"codec_type":"audio","codec_name":"pcm_s16le"}],"format":{"duration":"2.5"}}"#;
        let parsed = parse_probe_for_kind(audio, &MediaKind::Audio).unwrap();
        assert_eq!(parsed.duration_ms, 2500);
        assert_eq!(parsed.width, 0);
        assert!(parsed.has_audio);
        assert!(parse_probe_for_kind(image, &MediaKind::Audio).is_none());
        assert!(parse_probe_for_kind(audio, &MediaKind::Image).is_none());
        assert!(parse_probe_output(audio).is_none());
    }

    const SAMPLE: &str = r#"{
      "streams": [
        {
          "codec_type": "video",
          "codec_name": "h264",
          "width": 1280,
          "height": 720,
          "avg_frame_rate": "30000/1001"
        },
        {
          "codec_type": "audio",
          "codec_name": "aac"
        }
      ],
      "format": { "duration": "12.345" }
    }"#;

    #[test]
    fn parses_format_and_streams_explicitly() {
        let a = parse_probe_output(SAMPLE.as_bytes()).expect("parse");
        assert_eq!(a.duration_ms, 12345);
        assert_eq!((a.width, a.height), (1280, 720));
        assert_eq!(a.video_codec, "h264");
        assert_eq!(a.audio_codec.as_deref(), Some("aac"));
        assert!(a.has_audio);
        assert!((a.fps - 29.97).abs() < 0.01);
    }

    #[test]
    fn no_video_or_zero_duration_is_rejected() {
        let audio_only =
            r#"{"streams":[{"codec_type":"audio","codec_name":"mp3"}],"format":{"duration":"5"}}"#;
        assert!(parse_probe_output(audio_only.as_bytes()).is_none());
        let zero = r#"{"streams":[{"codec_type":"video","codec_name":"h264","width":1,"height":1}],"format":{"duration":"0"}}"#;
        assert!(parse_probe_output(zero.as_bytes()).is_none());
    }

    #[test]
    fn detection_finds_ffprobe_when_present() {
        // máquina de dev tem ffprobe instalado (ENGINE-DECISIONS §1);
        // se ausente, o teste apenas registra que None é aceitável.
        match detect_fftools() {
            Some(t) => assert!(t.ffprobe.is_file()),
            None => eprintln!("ffprobe ausente — detecção retornou None (ok para CI sem ffmpeg)"),
        }
    }
}
