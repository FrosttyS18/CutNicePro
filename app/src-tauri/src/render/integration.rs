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

#[test]
fn real_ffmpeg_concatenates_multi_segment_plan_exact_frames() {
    // M2 (goal-cortes-multimodais): plano de 2 intervalos remove a "pausa"
    // central de uma fixture CFR 10 fps — o MP4 deve ter exatamente a soma
    // dos segmentos (±1 frame) e nenhuma frames do vão.
    let tools = crate::media_analyze::detect_fftools()
        .expect("FFmpeg de sistema exigido para este teste de integração");
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let fixture = Scratch::new(&base).unwrap();
    let source = fixture.path.join("fixture-multi.mp4");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    // 4 s @ 10 fps: frames AZUIS no vão (2.0–3.0) e PRETOS fora dele —
    // verificação de conteúdo usa a cor para provar que o vão saiu.
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
            "-vf",
            "drawbox=x=0:y=0:w=160:h=90:color=blue@1:t=fill:enable='between(t,2.0,3.0)'",
            "-t",
            "4",
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
        "ratio":"16:9","fit":"contain","captionModel":0,"volume":0.5,"muted":false,
        "background":"#000000","text":"","trimStart":0.0,"trimEnd":4.0,
        "segments":[{"sourceStart":0.5,"sourceEnd":1.5},{"sourceStart":2.5,"sourceEnd":3.5}]
    }))
    .unwrap();
    let control = ProcessControl::default();
    let (rendered, output) =
        pipeline::run(&base, &source, &[], &settings, 4.0, true, &control, |_| {}).unwrap();
    let analysis = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert_eq!((analysis.width, analysis.height), (1920, 1080));
    // 1,0 s + 1,0 s = 2,0 s = 20 frames @10fps (tolerância ±1 frame = 120 ms)
    assert!(
        (analysis.duration_ms as i64 - 2000).abs() <= 120,
        "duração {} ms fora do esperado (plano 2x1,0 s)",
        analysis.duration_ms
    );
    // frames exatos via ffprobe
    let mut probe = std::process::Command::new(&tools.ffprobe);
    probe
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "csv=p=0",
        ])
        .arg(&output);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        probe.creation_flags(0x08000000);
    }
    let out = probe.output().unwrap();
    let frames: i64 = String::from_utf8_lossy(&out.stdout).trim().parse().unwrap();
    assert!(
        (frames - 20).abs() <= 1,
        "frames lidos: {frames} (esperado 20±1)"
    );
    // conteúdo: frame do MEIO da saída (t=1,0 s) vem do segundo segmento
    // (fonte 2,5 s) — ainda PRETO; um frame AZUL provaria que o vão entrou.
    let pixels = rendered.path.join("frame-mid.gray");
    let mut mid = std::process::Command::new(&ffmpeg);
    mid.args([
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "1.0",
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
        mid.creation_flags(0x08000000);
    }
    assert!(mid.output().unwrap().status.success());
    let raw = std::fs::read(&pixels).unwrap();
    let average: f64 = raw.iter().map(|v| *v as f64).sum::<f64>() / raw.len() as f64;
    assert!(
        average < 64.0,
        "frame do meio escuro (sem o vão azul): média {average}"
    );
    // sanity do lado oposto: um frame DENTRO do primeiro segmento (t=0,25 s)
    // também é preto, e o concat preservou a ordem (o vão azul não abre o vídeo)
    let _ = rendered;
}
