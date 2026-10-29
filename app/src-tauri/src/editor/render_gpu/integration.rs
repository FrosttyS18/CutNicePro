use super::{command, Plan};
use crate::{
    editor::{render_graph, render_plan::Window, types::Composition},
    render::encoder::{self, Encoder},
    transcription::process::ProcessControl,
};
use serde::Deserialize;
use std::{collections::HashMap, env, fs, path::PathBuf, process::Command};

#[derive(Deserialize)]
struct Input {
    document: Composition,
    sources: HashMap<String, PathBuf>,
}

#[test]
#[ignore = "Comparação CUDA explícita com offset de 30s; exige snapshot local e NVIDIA"]
fn offset_source_window_preserves_captions_and_decoded_content() {
    let input: Input = serde_json::from_slice(
        &fs::read(env::var_os("CNP_RENDER_PERF_INPUT").expect("Defina CNP_RENDER_PERF_INPUT"))
            .unwrap(),
    )
    .unwrap();
    let directory = crate::editor::render_performance_tests::output_directory();
    eprintln!("[gpu-offset] Artefatos: {}", directory.display());
    let window = Window {
        start: 900,
        end: 2700,
    };
    let plan = Plan::for_window(&input.document, &window)
        .unwrap()
        .expect("Snapshot incompatível");
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let control = ProcessControl::default();
    assert!(super::source::probe(
        &tools.ffprobe,
        &input.sources[&plan.asset.id],
        &directory,
        0,
        plan.asset.width,
        plan.asset.height,
        &control
    )
    .unwrap());
    assert_eq!(
        encoder::detect(&ffmpeg, &directory, &control).unwrap(),
        Encoder::Nvenc
    );
    for gpu in [false, true] {
        let case = directory.join(if gpu { "gpu" } else { "cpu" });
        fs::create_dir(&case).unwrap();
        crate::render::fonts::prepare(&case).unwrap();
        let args = if gpu {
            command::arguments(&plan, &input.sources[&plan.asset.id], &case, 0)
        } else {
            render_graph::video(
                &input.document,
                &window,
                &input.sources,
                &case,
                0,
                Encoder::Nvenc,
            )
        }
        .unwrap();
        let mut render = Command::new(&ffmpeg);
        render.current_dir(&case).args(args);
        control.run(render, &case.join("render.log")).unwrap();
    }
    assert_eq!(
        fs::read(directory.join("cpu/caption-0-0.ass")).unwrap(),
        fs::read(directory.join("gpu/caption-0-0.ass")).unwrap()
    );
    let mut comparison = Command::new(&ffmpeg);
    comparison.current_dir(&directory).args([
        "-v",
        "error",
        "-i",
        "cpu/part-0.mp4",
        "-i",
        "gpu/part-0.mp4",
        "-filter_complex",
        "[0:v][1:v]ssim=stats_file=ssim.log",
        "-an",
        "-f",
        "null",
        "-",
    ]);
    control
        .run(comparison, &directory.join("comparison.log"))
        .unwrap();
    let scores: Vec<f64> = fs::read_to_string(directory.join("ssim.log"))
        .unwrap()
        .lines()
        .map(|line| {
            line.split_whitespace()
                .find_map(|value| {
                    value
                        .strip_prefix("All:")
                        .and_then(|value| value.parse().ok())
                })
                .unwrap()
        })
        .collect();
    assert_eq!(scores.len(), 1800, "Nenhum frame pode desaparecer");
    let minimum = scores.iter().copied().reduce(f64::min).unwrap();
    assert!(
        minimum >= 0.98,
        "Corrupção/desalinhamento observado: {minimum}"
    );
    fs::write(directory.join("results.json"),serde_json::to_vec_pretty(&serde_json::json!({"offsetSeconds":30,"durationSeconds":60,"comparedFrames":scores.len(),"ssimMinimum":minimum,"ssimAverage":scores.iter().sum::<f64>()/scores.len() as f64,"assIdentical":true})).unwrap()).unwrap();
}
