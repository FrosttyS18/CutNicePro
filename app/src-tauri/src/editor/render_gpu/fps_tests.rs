use super::Plan;
use crate::editor::{
    export_encoding,
    export_options::{ExportOptions, FrameRate, Resolution},
    render_graph,
    render_plan::Window,
    types::Composition,
};
use crate::{
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
use serde_json::json;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

fn document() -> Composition {
    let settings = json!({"ratio":"9:16","fit":"cover","captionModel":2,"captionStyle":{"font":"Poppins","size":120,"weight":700,"color":"#ffffff","italic":false,"underline":false,"uppercase":true,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00ff00","effect":"highlight","position":"bottom","y":0.83,"wordsPerCaption":3},"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null,"splitScreen":{"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}});
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"video","mediaId":"video","name":"source.mp4","kind":"video","durationUs":1000000,"width":320,"height":180,"transcript":[{"id":"cue","start":0,"end":0.4,"text":"UM DOIS TRES","words":[{"text":"UM","start":0,"end":0.1},{"text":"DOIS","start":0.1,"end":0.2},{"text":"TRES","start":0.2,"end":0.4}]}]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"C1","name":"Legenda","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false}],
        "items":[
            {"id":"one","trackId":"V1","assetId":"video","kind":"video","startFrame":900,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}},
            {"id":"caption","trackId":"C1","assetId":"video","kind":"caption","startFrame":900,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}
        ]})).unwrap()
}

fn timestamps(
    ffprobe: &Path,
    file: &Path,
    directory: &Path,
    name: &str,
    control: &ProcessControl,
) -> Vec<f64> {
    let output = directory.join(format!("timestamps-{name}.json"));
    let mut command = Command::new(ffprobe);
    command
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_frames",
            "-show_entries",
            "frame=best_effort_timestamp_time",
            "-of",
            "json",
        ])
        .arg(file);
    control
        .run_to_file_with_timeout(
            &mut command,
            &directory.join(format!("timestamps-{name}.log")),
            &output,
            Duration::from_secs(15),
        )
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(output).unwrap()).unwrap();
    value["frames"]
        .as_array()
        .unwrap()
        .iter()
        .map(|frame| {
            frame["best_effort_timestamp_time"]
                .as_str()
                .unwrap()
                .parse()
                .unwrap()
        })
        .collect()
}

fn minimum_ssim(path: &Path) -> f64 {
    std::fs::read_to_string(path)
        .unwrap()
        .lines()
        .map(|line| {
            line.split_whitespace()
                .find_map(|field| field.strip_prefix("All:"))
                .unwrap()
                .parse::<f64>()
                .unwrap()
        })
        .fold(1.0, f64::min)
}

#[test]
fn real_changed_output_fps_cuda_frames_match_cpu_source_and_caption_content() {
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch =
        Scratch::new(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu-fps"))
            .unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    let mut fixture = Command::new(&ffmpeg);
    fixture
        .args([
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x180:r=30:d=1",
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
        .run_with_timeout(
            fixture,
            &scratch.path.join("fixture.log"),
            Duration::from_secs(15),
        )
        .unwrap();
    crate::render::fonts::prepare(&scratch.path).unwrap();
    let document = document();
    let window = Window {
        start: 901,
        end: 910,
    };
    let plan = Plan {
        document: &document,
        window: &window,
        item: &document.items[0],
        asset: &document.assets[0],
        layout: serde_json::from_value(document.items[0].settings["splitScreen"].clone()).unwrap(),
        bounds: render_graph::layer_bounds(1080, 1920, &Default::default()),
    };
    let sources = HashMap::from([("video".into(), source.clone())]);
    let mut evidence = Vec::new();
    for (index, (frame_rate, resolution, expected_frames)) in [
        (FrameRate::Fps60, Resolution::Hd720, 18),
        (FrameRate::Fps24, Resolution::Hd1080, 7),
        (FrameRate::Fps2997, Resolution::Uhd2160, 9),
    ]
    .into_iter()
    .enumerate()
    {
        let options = ExportOptions {
            frame_rate,
            resolution,
            ..Default::default()
        };
        let gpu_args =
            super::command::arguments_with_options(&plan, &source, &scratch.path, index, options)
                .unwrap();
        let cpu_args = render_graph::video_with_options(
            &document,
            &window,
            &sources,
            &scratch.path,
            index + 100,
            Encoder::Nvenc,
            options,
        )
        .unwrap();
        for (name, args) in [("gpu", gpu_args), ("cpu", cpu_args)] {
            let mut command = Command::new(&ffmpeg);
            command.current_dir(&scratch.path).args(args);
            control
                .run_with_timeout(
                    command,
                    &scratch.path.join(format!("render-{index}-{name}.log")),
                    Duration::from_secs(45),
                )
                .unwrap();
        }
        let gpu = scratch.path.join(format!("part-{index}.mp4"));
        let cpu = scratch.path.join(format!("part-{}.mp4", index + 100));
        for (name, path) in [("gpu", &gpu), ("cpu", &cpu)] {
            export_encoding::validate_output(
                &tools.ffprobe,
                path,
                &scratch.path,
                options,
                expected_frames,
                &control,
            )
            .unwrap();
            let pts = timestamps(
                &tools.ffprobe,
                path,
                &scratch.path,
                &format!("{index}-{name}"),
                &control,
            );
            assert_eq!(pts.len(), expected_frames as usize);
            let rate = options.output_rate(&document.fps);
            for (frame, pts) in pts.iter().enumerate() {
                assert!(
                    (pts - frame as f64 * f64::from(rate.1) / f64::from(rate.0)).abs() < 0.000002,
                    "{name}: {pts}"
                );
            }
        }
        assert_eq!(
            std::fs::read(scratch.path.join(format!("caption-{index}-0.ass"))).unwrap(),
            std::fs::read(scratch.path.join(format!("caption-{}-0.ass", index + 100))).unwrap()
        );
        let full = format!("full-{index}.txt");
        let cue = format!("cue-{index}.txt");
        let graph=format!("[0:v]split=2[gf][gc];[1:v]split=2[cf][cc];[gf][cf]ssim=stats_file={full}[full];[gc]crop=iw:ih/3:0:ih*2/3[gcue];[cc]crop=iw:ih/3:0:ih*2/3[ccue];[gcue][ccue]ssim=stats_file={cue}[cue]");
        let mut compare = Command::new(&ffmpeg);
        compare
            .current_dir(&scratch.path)
            .args(["-nostdin", "-v", "error", "-i"])
            .arg(&gpu)
            .arg("-i")
            .arg(&cpu)
            .args([
                "-filter_complex",
                &graph,
                "-map",
                "[full]",
                "-map",
                "[cue]",
                "-an",
                "-f",
                "null",
                "-",
            ]);
        control
            .run_with_timeout(
                compare,
                &scratch.path.join(format!("compare-{index}.log")),
                Duration::from_secs(30),
            )
            .unwrap();
        let full_min = minimum_ssim(&scratch.path.join(full));
        let cue_min = minimum_ssim(&scratch.path.join(cue));
        assert!(full_min >= 0.98, "{frame_rate:?}: SSIM fonte {full_min}");
        assert!(cue_min >= 0.98, "{frame_rate:?}: SSIM legenda {cue_min}");
        evidence.push(json!({"fps":format!("{frame_rate:?}"),"resolution":format!("{resolution:?}"),"frames":expected_frames,"minimumFullFrameSsim":full_min,"minimumCaptionRegionSsim":cue_min,"ptsMaximumToleranceSeconds":0.000002,"allFramesCompared":true,"assIdentical":true}));
    }
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/editor-export-cuda-fps-2026-10-28.json");
    std::fs::write(path,serde_json::to_vec_pretty(&json!({"scope":"Short graph integration harness bypasses only the 60-second performance policy; production eligibility tested separately. Own BT709 fixture; CPU composition plus identical NVENC control. No long benchmark.","window":{"startFrame":901,"endFrame":910,"sourceStartSeconds":1.0/30.0},"cases":evidence})).unwrap()).unwrap();
}
