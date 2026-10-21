use super::{pipeline, scratch::Scratch, settings::RenderSettings};
use crate::transcription::{process::ProcessControl, types::Segment};

/// Matriz de preenchimento para validação VISUAL (atualização 13): renderiza
/// as 6 configurações com fonte de padrão conhecido (testsrc, 320x180) e
/// grava MP4s + a string de geometria efetiva de cada caso em
/// .tooling/test-output/fill-matrix/. A verificação de pixels acontece em
/// tools/dev/verify_fill_matrix.py (evidência em docs/reports/evidence/).
#[test]
#[ignore = "Renderiza 6 MP4s reais para validação visual de preenchimento"]
fn render_fill_matrix() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido");
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/fill-matrix");
    std::fs::create_dir_all(&base).unwrap();
    let fixture = Scratch::new(&base).unwrap();
    let source = fixture.path.join("source-fill.mp4");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let mut command = std::process::Command::new(&ffmpeg);
    command.args([
        "-nostdin", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
        "-t", "3", "-c:v", "libx264", "-threads", "2", "-c:a", "aac", "-y",
    ]).arg(&source);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(command.output().unwrap().status.success());

    let cases: &[(&str, &str, Option<(u32, u32)>)] = &[
        ("9x16-ajustar", "9:16", None),
        ("9x16-preencher", "9:16", None),
        ("1x1-ajustar", "1:1", None),
        ("1x1-preencher", "1:1", None),
        ("1x1-preencher-focal-esq", "1:1", Some((0, 50))),
        ("proporcao-original", "16:9", None),
    ];
    let segments = vec![Segment {
        id: "s".into(),
        start: 0.0,
        end: 2.0,
        text: "legenda de validacao".into(),
        words: vec![],
    }];
    let mut geometry_report = String::new();
    for (name, ratio, focal) in cases {
        let fit = if name.contains("preencher") { "cover" } else { "contain" };
        let settings: RenderSettings = serde_json::from_value(serde_json::json!({
            "ratio": ratio, "fit": fit,
            "focalPoint": focal.map(|(x, y)| serde_json::json!({"x": x, "y": y})),
            "captionModel": 1,
            "captionStyle": {"font":"Poppins","size":80,"weight":700,"color":"#ffffff","italic":false,
                "underline":false,"uppercase":true,"outline":2,"outlineColor":"#000000","shadow":false,
                "background":"transparent","highlightColor":"#02c2be","effect":"none","position":"middle"},
            "volume": 0.0, "muted": false, "background": "#000000",
            "text": "", "trimStart": 0.0, "trimEnd": 2.0
        })).unwrap();
        let (_scratch, output) = pipeline::run(
            &base,
            &source,
            &segments,
            &settings,
            3.0,
            true,
            &ProcessControl::default(),
            |_| {},
        ).expect("render do caso");
        let dest = base.join(format!("{name}.mp4"));
        std::fs::rename(&output, &dest).unwrap();
        geometry_report.push_str(&format!("{name}: {}\n", settings.geometry().unwrap()));
    }
    std::fs::write(base.join("geometry.txt"), geometry_report).unwrap();
    std::fs::remove_file(&source).ok();
}
