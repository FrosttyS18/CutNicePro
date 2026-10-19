//! Análise de mídia com ffprobe (M2A). Detecção do binário em PATH →
//! links do winget → app-data\bin. Parsing TIPADO de
//! `ffprobe -v quiet -print_format json -show_format -show_streams`
//! (flags explícitas, conforme emenda do mantenedor).

use std::path::PathBuf;
use std::process::Command;

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
    let out = Command::new(&fftools.ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(media_path)
        .output()
        .map_err(|e| format!("falha ao executar ffprobe: {e}"))?;
    if !out.status.success() {
        return Err("ffprobe não conseguiu analisar o arquivo (formato não suportado?)".into());
    }
    parse_probe_output(&out.stdout)
        .ok_or_else(|| "saída do ffprobe em formato inesperado".to_string())
}

pub fn parse_probe_output(json: &[u8]) -> Option<MediaAnalysis> {
    let probe: FfProbeOutput = serde_json::from_slice(json).ok()?;
    let format = probe.format.as_ref()?;
    let duration_s: f64 = format.duration.as_deref()?.parse().ok()?;
    if !(duration_s.is_finite()) || duration_s <= 0.0 {
        return None;
    }
    let video = probe.streams.iter().find(|s| s.codec_type.as_deref() == Some("video"))?;
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
        let audio_only = r#"{"streams":[{"codec_type":"audio","codec_name":"mp3"}],"format":{"duration":"5"}}"#;
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
