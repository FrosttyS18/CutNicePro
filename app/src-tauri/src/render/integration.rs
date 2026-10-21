use super::{pipeline, scratch::Scratch, settings::RenderSettings};
use crate::{
    clips::scenes,
    transcription::{
        process::ProcessControl,
        types::{Segment, Word},
    },
};

#[test]
fn real_ffmpeg_renders_trim_ratio_audio_and_subtitle_pixels() {
    let tools = crate::media_analyze::detect_fftools()
        .expect("FFmpeg de sistema exigido para este teste de integração");
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let fixture = Scratch::new(&base).unwrap();
    let source = fixture.path.join("fixture.mp4");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let mut command = std::process::Command::new(&ffmpeg);
    command
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=160x90:r=10",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=16000",
            "-t",
            "3",
            "-c:v",
            "libx264",
            "-threads",
            "2",
            "-c:a",
            "aac",
            "-y",
        ])
        .arg(&source);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(command.output().unwrap().status.success());
    let settings:RenderSettings=serde_json::from_value(serde_json::json!({"ratio":"16:9","fit":"contain","captionModel":1,
        "captionStyle":{"font":"Poppins","size":120,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#02c2be","effect":"none","position":"middle"},
        "volume":0.5,"muted":false,"background":"#000000","text":"","trimStart":1.0,"trimEnd":2.0})).unwrap();
    let segments = vec![Segment {
        id: "s".into(),
        start: 1.0,
        end: 2.0,
        text: "Legenda real".into(),
        words: vec![Word {
            text: "Legenda real".into(),
            start: 1.0,
            end: 2.0,
        }],
    }];
    let control = ProcessControl::default();
    let scenes = scenes::analyze(&source, &fixture.path, 3.0, &control, |_| {}).unwrap();
    assert!(scenes.is_empty());
    let (rendered, output) = pipeline::run(
        &base,
        &source,
        &segments,
        &settings,
        3.0,
        true,
        &control,
        |_| {},
    )
    .unwrap();
    let analysis = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert_eq!((analysis.width, analysis.height), (1920, 1080));
    assert!(analysis.has_audio);
    assert!((analysis.duration_ms as i64 - 1000).abs() < 120);
    let pixels = rendered.path.join("frame.gray");
    let mut command = std::process::Command::new(&ffmpeg);
    command
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "0.5",
            "-i",
        ])
        .arg(&output)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "format=gray",
            "-f",
            "rawvideo",
            "-y",
        ])
        .arg(&pixels);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(command.output().unwrap().status.success());
    let pixels = std::fs::read(pixels).unwrap();
    assert_eq!(pixels.len(), 1920 * 1080);
    assert!(
        pixels.iter().filter(|pixel| **pixel > 180).count() > 1000,
        "texto branco deve estar gravado no vídeo preto"
    );
}

#[test]
fn real_render_applies_clip_edit_decisions() {
    // Atualização 11: o rascunho do editor (proporção 1:1, preencher,
    // ponto focal deslocado, correção de palavra) precisa chegar ao MP4.
    let tools = crate::media_analyze::detect_fftools()
        .expect("FFmpeg de sistema exigido para este teste de integração");
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let fixture = Scratch::new(&base).unwrap();
    let source = fixture.path.join("fixture-edit.mp4");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let mut command = std::process::Command::new(&ffmpeg);
    command
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x180:r=10",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=16000",
            "-t",
            "6",
            "-c:v",
            "libx264",
            "-threads",
            "2",
            "-c:a",
            "aac",
            "-y",
        ])
        .arg(&source);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(command.output().unwrap().status.success());
    let settings: RenderSettings = serde_json::from_value(serde_json::json!({
        "ratio": "1:1", "fit": "cover",
        "focalPoint": { "x": 20, "y": 80 },
        "captionModel": 1,
        "captionStyle": {"font":"Poppins","size":96,"weight":700,"color":"#ffffff","italic":false,
            "underline":false,"uppercase":true,"outline":2,"outlineColor":"#000000","shadow":false,
            "background":"transparent","highlightColor":"#02c2be","effect":"none","position":"middle"},
        "volume": 1.0, "muted": false, "background": "#000000",
        "text": "CORRIGIDA", "trimStart": 1.0, "trimEnd": 4.5
    })).unwrap();
    let segments = vec![Segment {
        id: "s".into(),
        start: 1.0,
        end: 4.5,
        text: "corrigida pela edicao".into(),
        words: vec![Word {
            text: "CORRIGIDA".into(),
            start: 1.1,
            end: 1.6,
        }],
    }];
    let (scratch, output) = pipeline::run(
        &base,
        &source,
        &segments,
        &settings,
        6.0,
        true,
        &ProcessControl::default(),
        |_| {},
    )
    .expect("render do rascunho editado");
    let _ = scratch;
    let probe = std::process::Command::new(&tools.ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
        ])
        .arg(&output)
        .output()
        .unwrap();
    let info: serde_json::Value = serde_json::from_slice(&probe.stdout).unwrap();
    assert_eq!(info["streams"][0]["width"], 1080, "1:1 exige largura 1080");
    assert_eq!(info["streams"][0]["height"], 1080, "1:1 exige altura 1080");
    let duration: f64 = info["format"]["duration"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(
        (duration - 3.5).abs() < 0.25,
        "trim 1,0–4,5 s = 3,5 s (tol. A/V); obtido {duration}"
    );
    std::fs::remove_file(&output).ok();
    std::fs::remove_file(&source).ok();
}
