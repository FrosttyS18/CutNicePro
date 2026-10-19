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
