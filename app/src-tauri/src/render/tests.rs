use super::{ass, pipeline, settings::RenderSettings};
use crate::transcription::{
    process::ProcessControl,
    types::{Segment, Word},
};

fn settings() -> RenderSettings {
    serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":"cover","captionModel":2,
        "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
            "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
        "volume":0.7,"muted":false,"background":"#000000","text":"","trimStart":2.0,"trimEnd":4.0,"focalPoint":{"x":20,"y":50}})).unwrap()
}
#[test]
fn rejects_invalid_intervals_filters_and_style_injection() {
    let mut value = settings();
    assert_eq!(value.validate(5.0).unwrap(), (2.0, 4.0));
    value.trim_end = Some(6.0);
    assert!(value.validate(5.0).is_err());
    value.trim_end = Some(4.0);
    value.background = "red;movie=http://x".into();
    assert!(value.validate(5.0).is_err());
    value.background = "#000000".into();
    value.caption_style.as_mut().unwrap().font = "bad,Style:Fake".into();
    assert!(value.validate(5.0).is_err());
}
#[test]
fn offsets_real_word_times_and_escapes_subtitle_control_sequences() {
    let segments = vec![Segment {
        id: "s".into(),
        start: 1.0,
        end: 5.0,
        text: "Oi ação {\\move(0,0)}".into(),
        words: vec![
            Word {
                text: "Oi".into(),
                start: 1.0,
                end: 2.2,
            },
            Word {
                text: "ação {\\move(0,0)}".into(),
                start: 2.4,
                end: 3.0,
            },
        ],
    }];
    let ass = ass::build(&segments, &settings(), 2.0, 4.0).unwrap();
    assert!(ass.contains("PlayResX: 1080"));
    assert!(ass.contains("PlayResY: 1920"));
    assert!(ass.contains("Dialogue: 0,0:00:00.00,0:00:00.20"));
    assert!(ass.contains("0:00:00.40,0:00:01.00"));
    assert!(ass.contains("ação"));
    assert!(!ass.contains("{\\move("));
}
#[test]
fn builds_arguments_as_separate_values_and_matches_visible_framing_and_audio() {
    let value = settings();
    let args = pipeline::arguments(
        std::path::Path::new("original with spaces.mp4"),
        std::path::Path::new("out.part.mp4"),
        &value,
        10.0,
        true,
    )
    .unwrap();
    let args: Vec<_> = args.iter().map(|a| a.to_str().unwrap()).collect();
    assert!(args.contains(&"original with spaces.mp4"));
    assert!(args.contains(&"volume=0.7"));
    assert!(args
        .iter()
        .any(|a| a.contains("crop=1080:1920:(iw-ow)*0.2:(ih-oh)*0.5")));
    assert!(args.contains(&"mp4"));
    assert!(args.contains(&"+faststart"));
}
#[test]
fn cancellation_removes_owned_scratch_without_touching_source() {
    let base = std::env::temp_dir().join(format!("cnp-render-cancel-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&base).unwrap();
    let source = base.join("keep.mp4");
    std::fs::write(&source, b"original").unwrap();
    let control = ProcessControl::default();
    control.cancel();
    assert!(pipeline::run(
        &base,
        &source,
        &[],
        &settings(),
        10.0,
        false,
        &control,
        |_| {}
    )
    .is_err());
    assert_eq!(std::fs::read(source).unwrap(), b"original");
    assert_eq!(
        std::fs::read_dir(base.join("cutnicepro/render-temp"))
            .unwrap()
            .count(),
        0
    );
    std::fs::remove_dir_all(base).unwrap();
}

#[test]
#[ignore = "Exporta trecho real e confirma NVENC em hardware compatível"]
fn real_video_export_uses_nvenc_and_preserves_source() {
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/vendor/pipeline-validation");
    let source = base.join("source.mp4");
    let before = std::fs::metadata(&source).unwrap().len();
    let (scratch, output) = pipeline::run(
        &base,
        &source,
        &[],
        &settings(),
        599.098,
        true,
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let encoder = std::fs::read_to_string(scratch.path.join("encoder.txt")).unwrap();
    assert_eq!(std::fs::metadata(&source).unwrap().len(), before);
    std::fs::copy(output, base.join("nvenc-export.mp4")).unwrap();
    std::fs::copy(scratch.path.join("encoder.txt"), base.join("encoder.txt")).unwrap();
    std::fs::copy(
        scratch.path.join("render-nvenc.log"),
        base.join("render-nvenc.log"),
    )
    .unwrap();
    assert_eq!(encoder, "h264_nvenc");
}

#[test]
fn continuous_y_and_per_line_groups_with_pause() {
    let mut value = settings();
    value.caption_style.as_mut().unwrap().y = Some(0.4);
    value.caption_style.as_mut().unwrap().words_per_line = Some(2);
    let segments = vec![Segment {
        id: "s".into(),
        start: 1.0,
        end: 5.0,
        text: "a b c d".into(),
        words: vec![
            Word {
                text: "a".into(),
                start: 1.0,
                end: 1.4,
            },
            Word {
                text: "b".into(),
                start: 1.5,
                end: 1.9,
            },
            // pausa > 0,6s fecha o grupo mesmo antes do limite de palavras
            Word {
                text: "c".into(),
                start: 3.0,
                end: 3.4,
            },
            Word {
                text: "d".into(),
                start: 3.5,
                end: 3.9,
            },
        ],
    }];
    let ass = ass::build(&segments, &value, 2.0, 4.0).unwrap();
    assert!(ass.contains(r"\pos(540.00,768.00)")); // 9:16 → x=1080/2, y=0.4*1920
                                                   // grupos [a b] e [c d]: dois blocos com a posição contínua
    assert_eq!(ass.matches(r"\pos(540.00,768.00)").count() >= 2, true);
    // sem legenda da pausa: "b" termina em 1.9 (< offset 2.0) e não vira diálogo próprio
    assert!(!ass.contains("Dialogue: 0,0:00:00.00,0:00:00.00"));
}

#[test]
fn zoom_geometry_uses_source_anchor_and_crop() {
    let mut value = settings(); // 9:16, cover, focal 20/50
    value.zoom = Some(1.5);
    value.source_width = Some(1920);
    value.source_height = Some(1080);
    value.validate(10.0).unwrap();
    let geometry = value.geometry().unwrap();
    // cover 1080x1920 a partir de 1920x1080: escala máx(1080/1920,1920/1080)=1.7778 * 1.5 = 2.6667
    // rw=5120, rh=2880; crop 1080x1920 ancorado em (5120-1080)*0.2 e (2880-1920)*0.5
    assert!(
        geometry.contains("scale=5120:2880"),
        "geometria: {geometry}"
    );
    assert!(
        geometry.contains("crop=1080:1920:808:480"),
        "geometria: {geometry}"
    );
    assert!(geometry.contains("pad=1080:1920:0:0"));
}

#[test]
fn original_ratio_uses_source_dimensions_capped_at_1920() {
    let mut value = settings();
    value.ratio = "original".into();
    value.source_width = Some(3840);
    value.source_height = Some(2160);
    assert_eq!(value.dimensions().unwrap(), (1920, 1080));
    value.source_width = None;
    assert!(value.dimensions().is_err());
    value.source_width = Some(1280);
    value.source_height = Some(720);
    assert_eq!(value.dimensions().unwrap(), (1280, 720));
}

#[test]
fn effects_filter_matches_supoclip_formula_and_stays_off_when_neutral() {
    let mut value = settings();
    assert!(value.effects_filter().is_none());
    value.effects = Some(super::settings::Effects {
        brightness: 120.0,
        contrast: 90.0,
        saturation: 50.0,
        blur: 2.0,
        hue: 30.0,
    });
    let filter = value.effects_filter().unwrap();
    assert!(
        filter.contains("lutrgb=r='clip(val*1.0800+12.80,0,255)'"),
        "filtro: {filter}"
    );
    assert!(filter.contains("hue=h=30:s=0.5000"));
    assert!(filter.contains("gblur=sigma=2.0000")); // 9:16 → width 1080 → 2*1080/1080
    let args = pipeline::arguments(
        std::path::Path::new("a.mp4"),
        std::path::Path::new("b.mp4"),
        &value,
        10.0,
        true,
    )
    .unwrap();
    let joined = args
        .iter()
        .map(|a| a.to_str().unwrap())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(joined.contains("lutrgb"));
    assert!(joined.contains(",ass=filename=captions.ass")); // efeitos antes das legendas
}

#[test]
fn volume_above_unity_is_accepted_and_zero_still_mutes() {
    let mut value = settings();
    value.volume = 1.5;
    assert!(value.validate(10.0).is_ok());
    value.volume = 2.1;
    assert!(value.validate(10.0).is_err());
    value.volume = 2.0;
    value.muted = true;
    let args = pipeline::arguments(
        std::path::Path::new("a.mp4"),
        std::path::Path::new("b.mp4"),
        &value,
        10.0,
        true,
    )
    .unwrap();
    let joined = args
        .iter()
        .map(|a| a.to_str().unwrap())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(joined.contains("volume=0"));
}

#[test]
#[ignore = "Renderiza com zoom+efeitos+volume reais para verificação de pixels"]
fn real_render_applies_zoom_effects_and_volume() {
    use super::settings::Effects;
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/effects-evidence");
    std::fs::create_dir_all(&base).unwrap();
    let source = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/vendor/pipeline-validation/source.mp4");
    // caso neutro (referência) e caso com decisões da atualização 15
    for (name, zoom, effects, y, per_line, volume) in [
        ("neutro", None, None, None, None, 1.0),
        (
            "editado",
            Some(2.0),
            Some(serde_json::from_value::<Effects>(serde_json::json!({
                "brightness": 160.0, "contrast": 100.0, "saturation": 100.0, "blur": 0.0, "hue": 0.0
            })).unwrap()),
            Some(0.3),
            Some(2),
            1.5,
        ),
    ] {
        let mut value = settings();
        value.ratio = "9:16".into();
        value.fit = "cover".into();
        value.focal_point = None;
        // fixture real do laboratório: 640×360 (zoom exige dimensões da fonte)
        value.source_width = Some(640);
        value.source_height = Some(360);
        value.trim_start = 10.0;
        value.trim_end = Some(12.0);
        value.zoom = zoom;
        value.effects = effects;
        value.volume = volume;
        value.caption_style.as_mut().unwrap().y = y;
        value.caption_style.as_mut().unwrap().words_per_line = per_line;
        value.caption_style.as_mut().unwrap().effect = "karaoke".into();
        let (scratch, output) = pipeline::run(
            &base,
            &source,
            &[],
            &value,
            599.098,
            true,
            &ProcessControl::default(),
            |_| {},
        )
        .unwrap_or_else(|error| panic!("render do caso {name}: {error}"));
        std::fs::copy(output, base.join(format!("{name}.mp4"))).unwrap();
        std::fs::write(base.join(format!("{name}-args.txt")), format!("{:?}", value.geometry().unwrap())).unwrap();
        let _ = scratch;
    }
}
