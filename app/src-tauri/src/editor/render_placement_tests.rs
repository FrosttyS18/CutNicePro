use super::{render_graph, render_plan::Window, types::Composition};
use crate::{
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
use serde_json::json;
use std::{collections::HashMap, path::Path, process::Command};

fn fixture(scale: f64) -> Composition {
    let settings = json!({"ratio":"original","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":10,"denominator":1},"settings":settings,
        "assets":[{"id":"picture","mediaId":"picture","name":"image.png","kind":"image","durationUs":0,"width":160,"height":90,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"picture","assetId":"picture","trackId":"V1","kind":"image","groupId":"picture","followsMain":false,"startFrame":0,"durationFrames":1,"sourceStartUs":0,"sourceEndUs":0,"settings":settings,"captionEdits":{},"placement":{"x":50,"y":50,"scale":scale,"opacity":1}}]
    })).unwrap()
}

#[test]
fn opaque_layers_keep_rgba_without_an_identity_color_mixer() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-placement");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("picture".into(), scratch.path.join("picture.png"))]);
    for (index, opacity) in [1.0, 0.7, 0.0].into_iter().enumerate() {
        let mut document = fixture(1.0);
        document.items[0].placement.as_mut().unwrap().opacity = opacity;
        render_graph::video(
            &document,
            &Window { start: 0, end: 1 },
            &sources,
            &scratch.path,
            index,
            Encoder::Cpu,
        )
        .unwrap();
        let graph =
            std::fs::read_to_string(scratch.path.join(format!("video-{index}.txt"))).unwrap();
        if opacity == 1.0 {
            assert!(!graph.contains("colorchannelmixer"));
            assert!(graph.contains(",format=rgba[layer1]"));
        } else {
            assert!(graph.contains(&format!(",colorchannelmixer=aa={opacity}[layer1]")));
        }
    }
}

#[test]
fn enlarged_layers_crop_before_scale_and_keep_legacy_transform_unchanged() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-placement");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("picture".into(), scratch.path.join("picture.png"))]);
    for (index, scale) in [1.0, 2.0, 8.0].into_iter().enumerate() {
        render_graph::video(
            &fixture(scale),
            &Window { start: 0, end: 1 },
            &sources,
            &scratch.path,
            index,
            Encoder::Cpu,
        )
        .unwrap();
        let graph =
            std::fs::read_to_string(scratch.path.join(format!("video-{index}.txt"))).unwrap();
        if scale <= 2.0 {
            assert!(graph.contains(&format!(
                ",scale={}:{}",
                (160.0 * scale) as u32,
                (90.0 * scale) as u32
            )));
        } else {
            assert!(
                !graph.contains(",scale=1280:720"),
                "ampliação criou frame inteiro: {graph}"
            );
            assert!(graph.contains(",crop="));
            let scaling = graph
                .rsplit(",scale=")
                .next()
                .unwrap()
                .split(',')
                .next()
                .unwrap();
            let (width, height) = scaling.split_once(':').unwrap();
            assert!(width.parse::<u32>().unwrap() <= 192);
            assert!(height.parse::<u32>().unwrap() <= 122);
        }
    }
}

#[test]
fn enlarged_video_keeps_effects_and_owned_captions_before_visible_crop() {
    let mut document = fixture(8.0);
    document.assets[0].kind = super::types::MediaKind::Video;
    document.assets[0].duration_us = 100_000;
    document.assets[0].transcript = vec![json!({"id":"words","start":0,"end":0.1,"text":"Teste"})];
    document.items[0].kind = super::types::ItemKind::Video;
    document.items[0].source_end_us = 100_000;
    document.items[0].settings["effects"] =
        json!({"brightness":110,"contrast":100,"saturation":100,"blur":1,"hue":10});
    let mut caption = document.items[0].clone();
    caption.id = "caption".into();
    caption.kind = super::types::ItemKind::Caption;
    caption.follows_main = true;
    caption.track_id = "C1".into();
    caption.settings["captionModel"] = json!(1);
    caption.settings["captionStyle"] = json!({"font":"Arial","size":64,"weight":700,"color":"#FFFFFF","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00FFFF","effect":"none","position":"bottom","y":0.85,"wordsPerLine":5});
    document.tracks.push(serde_json::from_value(json!({"id":"C1","name":"Legendas","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false})).unwrap());
    document.items.push(caption);
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor-placement-order");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("picture".into(), scratch.path.join("picture.mp4"))]);
    render_graph::video(
        &document,
        &Window { start: 0, end: 1 },
        &sources,
        &scratch.path,
        0,
        Encoder::Cpu,
    )
    .unwrap();
    let graph = std::fs::read_to_string(scratch.path.join("video-0.txt")).unwrap();
    let caption = graph.find("ass=filename=").unwrap();
    let effects = graph.find("gblur=").unwrap();
    let crop = graph.find(":exact=1").unwrap();
    assert!(effects < caption && caption < crop);
}

fn raw(exe: &Path, input: &Path, directory: &Path, name: &str) -> Vec<u8> {
    let output = directory.join(format!("{name}.rgb"));
    let mut command = Command::new(exe);
    command
        .args(["-nostdin", "-v", "error", "-i"])
        .arg(input)
        .args(["-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
    ProcessControl::default()
        .run_to_file(
            &mut command,
            &directory.join(format!("{name}.log")),
            &output,
        )
        .unwrap();
    std::fs::read(output).unwrap()
}

#[test]
fn real_enlarged_image_matches_full_transform_without_large_intermediate_frame() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor-placement-real");
    let scratch = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("picture.png");
    super::render_tests::execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=160x90:r=10:d=0.1",
            "-frames:v",
            "1",
            "-threads",
            "1",
        ],
        &source,
        &control,
        &scratch.path.join("fixture.log"),
    );
    let sources = HashMap::from([("picture".into(), source.clone())]);
    for (index, (scale, x, y, opacity)) in [
        (1.0, 50.0, 50.0, 1.0),
        (2.0, 50.0, 50.0, 1.0),
        (8.0, 50.0, 50.0, 1.0),
        (3.5, 25.455, 71.239, 0.6),
        (8.0, 0.0, 100.0, 0.0),
        (8.0, 0.0, 50.0, 1.0),
    ]
    .into_iter()
    .enumerate()
    {
        let mut document = fixture(scale);
        if index == 5 {
            let mut origin = document.assets[0].clone();
            origin.id = "origin".into();
            origin.kind = super::types::MediaKind::Video;
            document.assets.push(origin);
            document.assets[0].width = 16;
            document.items[0].settings["fit"] = json!("contain");
            document.items[0].settings["focalPoint"] = json!({"x":0,"y":0});
        }
        let placement = document.items[0].placement.as_mut().unwrap();
        placement.x = x;
        placement.y = y;
        placement.opacity = opacity;
        let args = render_graph::video(
            &document,
            &Window { start: 0, end: 1 },
            &sources,
            &scratch.path,
            index,
            Encoder::Cpu,
        )
        .unwrap();
        let mut command = Command::new(&exe);
        command.current_dir(&scratch.path).args(args);
        control
            .run(command, &scratch.path.join(format!("render-{index}.log")))
            .unwrap();
        let reference = scratch.path.join(format!("reference-{index}.mp4"));
        let width = ((160.0 * scale).round() as u32) / 2 * 2;
        let height = ((90.0 * scale).round() as u32) / 2 * 2;
        let left = 160.0 * x / 100.0 - width as f64 / 2.0;
        let top = 90.0 * y / 100.0 - height as f64 / 2.0;
        let settings = super::render_media::settings(
            &document,
            Some(&document.assets[0]),
            &document.items[0].settings,
        )
        .unwrap();
        let geometry =
            super::render_media::geometry(&settings, &document.assets[0], 160, 90, 0.0).unwrap();
        let filter = format!("[0:v]format=rgba,{geometry},scale={width}:{height},colorchannelmixer=aa={opacity}[layer];color=c=black:s=160x90:r=10:d=0.1[base];[base][layer]overlay=x={left}:y={top}:eof_action=pass:repeatlast=0,format=yuv420p[out]");
        let mut command = Command::new(&exe);
        command
            .args(["-nostdin", "-v", "error", "-y", "-i"])
            .arg(&source)
            .args([
                "-filter_complex_threads",
                "1",
                "-filter_complex",
                &filter,
                "-map",
                "[out]",
                "-frames:v",
                "1",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-preset",
                "veryfast",
            ])
            .arg(&reference);
        control
            .run(
                command,
                &scratch.path.join(format!("reference-{index}.log")),
            )
            .unwrap();
        let actual = raw(
            &exe,
            &scratch.path.join(format!("part-{index}.mp4")),
            &scratch.path,
            &format!("actual-{index}"),
        );
        let expected = raw(
            &exe,
            &reference,
            &scratch.path,
            &format!("expected-{index}"),
        );
        assert_eq!(actual.len(), 160 * 90 * 3);
        if index >= 4 {
            assert!(actual.iter().all(|channel| *channel < 4));
        }
        let mean = actual
            .iter()
            .zip(expected)
            .map(|(a, b)| (*a as f64 - b as f64).abs())
            .sum::<f64>()
            / actual.len() as f64;
        assert!(
            mean < 8.0,
            "diferença média de pixels no zoom {scale}: {mean}"
        );
    }
}
