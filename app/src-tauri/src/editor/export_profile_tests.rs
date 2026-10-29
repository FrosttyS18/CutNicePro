use crate::editor::{
    export_options::{Codec, ExportOptions, Format, FrameRate},
    render,
    render_tests::execute,
    types::Composition,
};
use crate::{render::scratch::Scratch, transcription::process::ProcessControl};
use serde_json::json;
use std::{collections::HashMap, path::PathBuf, process::Command};

fn document() -> Composition {
    let settings = json!({"ratio":"original","fit":"cover","captionModel":1,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let edges = [0, 1, 2, 3, 4, 5, 11, 30];
    let mut items: Vec<serde_json::Value> = edges.windows(2).enumerate().map(|(index,edge)|json!({"id":format!("v{index}"),"assetId":"source","trackId":"V1","kind":"video","startFrame":edge[0],"durationFrames":edge[1]-edge[0],"sourceStartUs":edge[0]*1000000/30,"sourceEndUs":edge[1]*1000000/30,"groupId":format!("g{index}"),"followsMain":true,"settings":settings,"captionEdits":{}})).collect();
    items.push(json!({"id":"caption","assetId":"source","trackId":"C1","kind":"caption","startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"caption","followsMain":false,"settings":settings,"captionEdits":{}}));
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"source","mediaId":"source","name":"source.mp4","kind":"video","durationUs":1000000,"width":160,"height":96,"hasAudio":true,"transcript":[{"id":"s1","start":0,"end":1,"text":"Primeira segunda","words":[{"text":"Primeira","start":0,"end":0.4},{"text":"segunda","start":0.6,"end":1}]}]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"C1","name":"Legendas","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false}],"items":items})).unwrap()
}

#[test]
fn real_multiwindow_fps_conversion_preserves_frames_audio_and_caption_clock() {
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-export-profiles"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    execute(
        &ffmpeg,
        &[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=160x96:r=30:d=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "4",
            "-c:a",
            "aac",
        ],
        &source,
        &control,
        &scratch.path.join("fixture.log"),
    );
    let document = document();
    let sources = HashMap::from([("source".into(), source)]);
    let mut previous_ass = None;
    for (frame_rate, frames) in [
        (FrameRate::Fps24, 24),
        (FrameRate::Fps2997, 30),
        (FrameRate::Fps60, 60),
    ] {
        let options = ExportOptions {
            frame_rate,
            ..Default::default()
        };
        let (rendered, path) = render::run_with_options(
            &scratch.path,
            &document,
            &sources,
            &control,
            options,
            |_| {},
        )
        .unwrap();
        crate::editor::export_encoding::validate_output(
            &tools.ffprobe,
            &path,
            &rendered.path,
            options,
            frames,
            &control,
        )
        .unwrap();
        let metadata = crate::media_analyze::analyze(&tools, &path).unwrap();
        assert!(metadata.has_audio);
        assert!((metadata.duration_ms as i64 - 1000).abs() <= 42);
        let ass = std::fs::read(rendered.path.join("caption-6-0.ass")).unwrap();
        if let Some(previous) = &previous_ass {
            assert_eq!(&ass, previous);
        }
        previous_ass = Some(ass);
    }
}

#[test]
fn real_rle_mov_preserves_image_alpha_in_the_composition() {
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-export-alpha"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.png");
    execute(
        &ffmpeg,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=red@0.5:s=160x96:r=30,format=rgba",
            "-frames:v",
            "1",
            "-threads",
            "1",
        ],
        &source,
        &control,
        &scratch.path.join("fixture.log"),
    );
    let settings = json!({"ratio":"original","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let document:Composition=serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"source","mediaId":"source","name":"source.png","kind":"image","durationUs":0,"width":160,"height":96,"hasAudio":false,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"one","assetId":"source","trackId":"V1","kind":"image","startFrame":0,"durationFrames":3,"sourceStartUs":0,"sourceEndUs":0,"groupId":"one","followsMain":false,"settings":settings,"captionEdits":{}}]})).unwrap();
    let options = ExportOptions {
        codec: Codec::Rle,
        format: Format::Mov,
        ..Default::default()
    };
    let (rendered, path) = render::run_with_options(
        &scratch.path,
        &document,
        &HashMap::from([("source".into(), source)]),
        &control,
        options,
        |_| {},
    )
    .unwrap();
    let alpha = rendered.path.join("alpha.gray");
    let mut command = Command::new(&ffmpeg);
    command
        .args(["-nostdin", "-v", "error", "-y", "-i"])
        .arg(&path)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "alphaextract",
            "-pix_fmt",
            "gray",
            "-f",
            "rawvideo",
        ])
        .arg(&alpha);
    control
        .run(command, &rendered.path.join("alpha.log"))
        .unwrap();
    let bytes = std::fs::read(alpha).unwrap();
    assert_eq!(bytes.len(), 160 * 96);
    assert!(bytes.iter().all(|value| *value == 127));
}

#[test]
fn failed_gpu_encoder_retries_cpu_with_the_same_hevc_codec() {
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-export-fallback"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let mut attempts = Vec::new();
    let actual = super::render_profile(
        crate::render::encoder::Encoder::Nvenc,
        &scratch.path,
        &control,
        ExportOptions {
            codec: Codec::Hevc,
            ..Default::default()
        },
        || Ok(()),
        |encoder| {
            attempts.push(encoder);
            if encoder == crate::render::encoder::Encoder::Nvenc {
                Err("controlled encoder failure".into())
            } else {
                Ok(())
            }
        },
    )
    .unwrap();
    assert_eq!(actual, crate::render::encoder::Encoder::Cpu);
    assert_eq!(
        attempts,
        [
            crate::render::encoder::Encoder::Nvenc,
            crate::render::encoder::Encoder::Cpu
        ]
    );
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("encoder.txt")).unwrap(),
        "libx265"
    );
}

#[test]
fn real_hevc_422_av1_mov_and_cbr_profiles_preserve_the_requested_bitstream() {
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-export-codec-profiles"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    execute(
        &ffmpeg,
        &[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=160x96:r=30:d=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "4",
        ],
        &source,
        &control,
        &scratch.path.join("fixture.log"),
    );
    let mut document = document();
    document
        .items
        .retain(|item| item.kind == crate::editor::types::ItemKind::Caption || item.id == "v0");
    document.items[0].duration_frames = 30;
    document.items[0].source_end_us = 1000000;
    let sources = HashMap::from([("source".into(), source)]);
    let cases = [
        ExportOptions {
            bitrate_kbps: Some(1000),
            bitrate_mode: super::super::export_options::BitrateMode::Cbr,
            ..Default::default()
        },
        ExportOptions {
            codec: Codec::Hevc,
            format: Format::Mov,
            ..Default::default()
        },
        ExportOptions {
            codec: Codec::Hevc422,
            format: Format::Mov,
            ..Default::default()
        },
        ExportOptions {
            codec: Codec::Av1,
            ..Default::default()
        },
    ];
    for options in cases {
        let (rendered, path) = render::run_with_options(
            &scratch.path,
            &document,
            &sources,
            &control,
            options,
            |_| {},
        )
        .unwrap();
        assert_eq!(path.extension().unwrap(), options.extension());
        let metadata = crate::editor::export_encoding::validate_output(
            &tools.ffprobe,
            &path,
            &rendered.path,
            options,
            30,
            &control,
        )
        .unwrap();
        assert_eq!(metadata.video_codec, options.codec.video_codec());
        let value: serde_json::Value = serde_json::from_slice(
            &std::fs::read(rendered.path.join("final-video-profile.json")).unwrap(),
        )
        .unwrap();
        let stream = value["streams"]
            .as_array()
            .unwrap()
            .iter()
            .find(|stream| stream["codec_type"] == "video")
            .unwrap();
        if options.codec == Codec::Hevc422 {
            assert!(stream["pix_fmt"].as_str().unwrap().starts_with("yuv422p"));
        }
        if options.bitrate_kbps == Some(1000) {
            let bitrate = stream["bit_rate"].as_str().unwrap().parse::<u64>().unwrap();
            assert!(
                (800_000..=1_300_000).contains(&bitrate),
                "CBR observado: {bitrate}"
            );
        }
    }
}
