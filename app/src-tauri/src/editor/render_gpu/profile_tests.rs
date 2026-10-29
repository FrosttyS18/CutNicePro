use super::Plan;
use crate::editor::{
    export_options::{Codec, ExportOptions},
    render_plan::Window,
    types::Composition,
};
use crate::{
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
use serde_json::json;
use std::{path::PathBuf, process::Command};

#[test]
fn changed_output_fps_keeps_cuda_composition_and_the_absolute_window_phase() {
    use crate::editor::export_options::FrameRate;
    use std::collections::HashMap;
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu-fps-contract"),
    )
    .unwrap();
    let settings = json!({"ratio":"9:16","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null,"splitScreen":{"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}});
    let document: Composition = serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"video","mediaId":"video","name":"source.mp4","kind":"video","durationUs":120000000,"width":1920,"height":1080,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"one","trackId":"V1","assetId":"video","kind":"video","startFrame":0,"durationFrames":3600,"sourceStartUs":0,"sourceEndUs":120000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}]})).unwrap();
    let source = scratch.path.join("source.mp4");
    let sources = HashMap::from([("video".into(), source.clone())]);
    let mut session = super::Session::default();
    session.sources.insert((source, 1920, 1080), true);
    let window = Window {
        start: 901,
        end: 2702,
    };
    for (frame_rate, rate, frames) in [
        (FrameRate::Fps60, "60/1", "3602"),
        (FrameRate::Fps24, "24/1", "1441"),
        (FrameRate::Fps2997, "30000/1001", "1799"),
    ] {
        let options = ExportOptions {
            frame_rate,
            ..Default::default()
        };
        let args = session
            .arguments_with_options(
                &document,
                &window,
                &sources,
                &scratch.path,
                0,
                std::path::Path::new("unused-probe"),
                Encoder::Nvenc,
                &ProcessControl::default(),
                options,
            )
            .unwrap();
        assert!(
            args.is_some(),
            "A alteração de FPS descartou a composição CUDA"
        );
        let args = args.unwrap();
        let get = |flag: &str| {
            args[args.iter().position(|arg| arg == flag).unwrap() + 1]
                .to_string_lossy()
                .into_owned()
        };
        assert_eq!(get("-r"), rate);
        assert_eq!(get("-frames:v"), frames);
        let graph = std::fs::read_to_string(scratch.path.join("video-0-gpu.txt")).unwrap();
        assert!(graph.rfind("fps=").unwrap() > graph.rfind("overlay_cuda=").unwrap());
        assert!(!graph.contains("hwdownload"));
    }
    let native = session
        .arguments_with_options(
            &document,
            &window,
            &sources,
            &scratch.path,
            0,
            std::path::Path::new("unused-probe"),
            Encoder::Nvenc,
            &ProcessControl::default(),
            ExportOptions::default(),
        )
        .unwrap()
        .unwrap();
    let rate = native.iter().position(|arg| arg == "-r").unwrap();
    assert_eq!(native[rate + 1], "30/1");
    let graph = std::fs::read_to_string(scratch.path.join("video-0-gpu.txt")).unwrap();
    assert!(!graph.contains("tpad="));
    assert!(!graph.contains("settb="));
    assert!(!graph.contains("retimed"));
}

#[test]
fn real_cuda_composition_preserves_hevc_and_av1_encoders_when_supported() {
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = Scratch::new(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu-profiles"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    let mut command = Command::new(&ffmpeg);
    command
        .args([
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=1920x1080:r=30:d=0.1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-colorspace",
            "bt709",
            "-color_trc",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_range",
            "tv",
            "-threads",
            "4",
        ])
        .arg(&source);
    control
        .run(command, &scratch.path.join("fixture.log"))
        .unwrap();
    let settings = json!({"ratio":"9:16","fit":"cover","zoom":1,"captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null,"splitScreen":{"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}});
    let document: Composition = serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"video","mediaId":"video","name":"source.mp4","kind":"video","durationUs":60000000,"width":1920,"height":1080,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"one","trackId":"V1","assetId":"video","kind":"video","startFrame":0,"durationFrames":1800,"sourceStartUs":0,"sourceEndUs":60000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}]})).unwrap();
    let window = Window {
        start: 0,
        end: 1800,
    };
    let plan = Plan::for_window(&document, &window).unwrap().unwrap();
    for (index, codec) in [Codec::Hevc, Codec::Av1].into_iter().enumerate() {
        let options = ExportOptions {
            codec,
            ..Default::default()
        };
        if crate::editor::export_encoding::select(&ffmpeg, &scratch.path, &control, options)
            .unwrap()
            != Encoder::Nvenc
        {
            continue;
        }
        let mut args =
            super::command::arguments_with_options(&plan, &source, &scratch.path, index, options)
                .unwrap();
        let frames = args.iter().position(|arg| arg == "-frames:v").unwrap();
        args[frames + 1] = "1".into();
        let mut command = Command::new(&ffmpeg);
        command.current_dir(&scratch.path).args(args);
        control
            .run(command, &scratch.path.join(format!("cuda-{codec:?}.log")))
            .unwrap();
        crate::editor::export_encoding::validate_output(
            &tools.ffprobe,
            &scratch.path.join(format!("part-{index}.mp4")),
            &scratch.path,
            options,
            1,
            &control,
        )
        .unwrap();
        eprintln!("[gpu-profile-test] {codec:?}: composição CUDA e NVENC validados em um frame.");
    }
}
