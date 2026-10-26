use super::settings::RenderSettings;

fn payload() -> serde_json::Value {
    serde_json::json!({"ratio":"9:16","fit":"cover","captionModel":0,
        "text":"","volume":1.0,"muted":false,"background":"#000000","trimStart":0.0,"trimEnd":1.0,
        "sourceWidth":1920,"sourceHeight":1080,
        "splitScreen":{"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}})
}

fn scene_payload() -> serde_json::Value {
    let mut input = payload();
    input["trimEnd"] = serde_json::json!(3.0);
    input["splitScreen"]["shots"] = serde_json::json!([
        {"sourceStart":0.0,"sourceEnd":1.0,
         "top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}},
        {"sourceStart":2.0,"sourceEnd":3.0,
         "top":{"x":100,"y":50,"zoom":1},"bottom":{"x":0,"y":50,"zoom":1}}
    ]);
    input
}

#[test]
fn shot_layout_payload_preserves_confirmed_regions_only_in_their_scenes() {
    let settings: RenderSettings = serde_json::from_value(scene_payload())
        .expect("O contrato deve aceitar as janelas confirmadas de cada cena");
    assert!(settings.validate(3.0).is_ok());
    let windows = settings.composition_windows(3.0).unwrap();
    assert_eq!(
        windows
            .iter()
            .map(|w| (w.source_start, w.source_end))
            .collect::<Vec<_>>(),
        vec![(0.0, 1.0), (1.0, 2.0), (2.0, 3.0)]
    );
    let first = settings.geometry_at(0.5).unwrap();
    let close = settings.geometry_at(1.5).unwrap();
    let last = settings.geometry_at(2.5).unwrap();
    assert!(first.contains("vstack=inputs=2"));
    assert!(!close.contains("vstack=inputs=2"));
    assert!(last.contains("vstack=inputs=2"));
    assert_ne!(first, last);
    assert!(!settings
        .geometry_at(1.0)
        .unwrap()
        .contains("vstack=inputs=2"));
    assert!(settings
        .geometry_at(2.0)
        .unwrap()
        .contains("vstack=inputs=2"));
    assert_eq!(
        settings
            .split_screen
            .as_ref()
            .unwrap()
            .shots
            .as_ref()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn scene_windows_respect_removed_segments_and_preserve_single_frame_settings() {
    let mut input = scene_payload();
    input["segments"] = serde_json::json!([
        {"sourceStart":0.2,"sourceEnd":0.8}, {"sourceStart":1.2,"sourceEnd":2.7}
    ]);
    input["fit"] = serde_json::json!("contain");
    input["zoom"] = serde_json::json!(1.3);
    input["focalPoint"] = serde_json::json!({"x":20,"y":80});
    let settings: RenderSettings = serde_json::from_value(input.clone()).unwrap();
    let windows = settings.composition_windows(3.0).unwrap();
    assert_eq!(
        windows
            .iter()
            .map(|w| (w.source_start, w.source_end))
            .collect::<Vec<_>>(),
        vec![(0.2, 0.8), (1.2, 2.0), (2.0, 2.7)]
    );
    input["splitScreen"] = serde_json::Value::Null;
    let single: RenderSettings = serde_json::from_value(input).unwrap();
    assert_eq!(
        settings.geometry_at(1.5).unwrap(),
        single.geometry().unwrap()
    );
    for window in windows {
        let args = super::pipeline::window_arguments(
            std::path::Path::new("source.mp4"),
            std::path::Path::new("output.mp4"),
            &settings,
            window.source_start,
            window.source_end,
            true,
            super::encoder::Encoder::Cpu,
            "scene.ass",
        )
        .unwrap();
        let args = args
            .iter()
            .map(|arg| arg.to_string_lossy())
            .collect::<Vec<_>>();
        let filter = &args[args.iter().position(|arg| arg == "-vf").unwrap() + 1];
        assert_eq!(
            filter.contains("vstack=inputs=2"),
            window.source_start < 1.0 || window.source_start >= 2.0
        );
        assert!(filter.contains("ass=filename=scene.ass"));
        assert!(args.iter().any(|arg| arg == "aac"));
    }
}

#[test]
fn short_scene_or_edit_intersection_fails_without_dropping_or_extending_media() {
    let mut input = scene_payload();
    input["splitScreen"]["shots"][0]["sourceEnd"] = serde_json::json!(0.04);
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(3.0).is_err());
    let mut input = scene_payload();
    input["segments"] = serde_json::json!([{"sourceStart":0.98,"sourceEnd":1.2}]);
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(3.0).is_ok());
    let error = settings.composition_windows(3.0).unwrap_err();
    assert!(error.contains("menor que 0,05 s"));
    assert_eq!(
        settings.effective_segments(3.0).unwrap()[0].source_start,
        0.98
    );
    assert_eq!(settings.effective_segments(3.0).unwrap()[0].source_end, 1.2);
    assert!(super::pipeline::window_arguments(
        std::path::Path::new("source.mp4"),
        std::path::Path::new("output.mp4"),
        &settings,
        0.98,
        1.0,
        true,
        super::encoder::Encoder::Cpu,
        "scene.ass"
    )
    .is_err());
}

#[test]
fn rejects_empty_overlapping_unsorted_out_of_media_and_invalid_scene_windows() {
    for shots in [
        serde_json::json!([]),
        serde_json::json!([{ "sourceStart":1,"sourceEnd":1,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}]),
        serde_json::json!([{ "sourceStart":-1,"sourceEnd":1,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}]),
    ] {
        let mut input = scene_payload();
        input["splitScreen"]["shots"] = shots;
        let settings: RenderSettings = serde_json::from_value(input).unwrap();
        assert!(settings.validate(3.0).is_err());
    }
    for (index, field, value) in [
        (1, "sourceStart", 0.5),
        (1, "sourceEnd", 3.1),
        (0, "sourceStart", 2.1),
    ] {
        let mut input = scene_payload();
        input["splitScreen"]["shots"][index][field] = serde_json::json!(value);
        let settings: RenderSettings = serde_json::from_value(input).unwrap();
        assert!(settings.validate(3.0).is_err());
    }
    let mut settings: RenderSettings = serde_json::from_value(scene_payload()).unwrap();
    let shots = settings
        .split_screen
        .as_mut()
        .unwrap()
        .shots
        .as_mut()
        .unwrap();
    shots[0].source_end = f64::INFINITY;
    assert!(settings.validate(3.0).is_err());
    let mut input = scene_payload();
    let shot = input["splitScreen"]["shots"][0].clone();
    input["splitScreen"]["shots"] = serde_json::Value::Array(vec![shot; 65]);
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(3.0).is_err());
}

#[test]
fn ui_two_panel_payload_keeps_distinct_source_regions() {
    let settings: RenderSettings = serde_json::from_value(payload()).unwrap();
    assert!(settings.validate(2.0).is_ok());
    let graph = settings.geometry().unwrap();
    assert!(graph.contains("crop=1080:960:0:0"));
    assert!(graph.contains("crop=1080:960:628:0"));
    assert!(graph.contains("vstack=inputs=2"));
}

#[test]
fn rejects_invalid_panel_version_coordinates_and_ratio() {
    for (key, value) in [
        ("version", serde_json::json!(2)),
        ("top", serde_json::json!({"x":101,"y":50,"zoom":1})),
    ] {
        let mut input = payload();
        input["splitScreen"][key] = value;
        let settings: RenderSettings = serde_json::from_value(input).unwrap();
        assert!(settings.validate(2.0).is_err());
        assert!(settings.geometry().is_err());
    }
    let mut input = payload();
    input["ratio"] = serde_json::json!("16:9");
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(2.0).is_err());
    assert!(settings.geometry().is_err());
}

#[test]
fn rejects_unconfirmed_split_instead_of_exporting_duplicate_presets() {
    let mut input = payload();
    input["splitScreen"]
        .as_object_mut()
        .unwrap()
        .remove("faceValidated");
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(2.0).is_err());
    assert!(settings.geometry().is_err());
}

#[test]
fn real_ffmpeg_stacks_the_selected_regions_as_a_simple_output_filter() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido na integração");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let mut input = payload();
    input["sourceWidth"] = serde_json::json!(256);
    input["sourceHeight"] = serde_json::json!(128);
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    let output = std::process::Command::new(ffmpeg)
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=256x128:r=1,drawbox=x=128:y=0:w=128:h=128:color=blue:t=fill",
            "-vf",
            &settings.geometry().unwrap(),
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(output.stdout.len(), 1080 * 1920 * 3);
    let pixel = |y: usize| &output.stdout[(y * 1080 + 540) * 3..(y * 1080 + 540) * 3 + 3];
    assert!(pixel(480)[0] > 200 && pixel(480)[2] < 50);
    assert!(pixel(1440)[2] > 200 && pixel(1440)[0] < 50);
}

#[test]
fn real_pipeline_exports_expanded_split_with_removed_gap_audio_and_captions() {
    use crate::transcription::{process::ProcessControl, types::Segment};
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let source_dir = super::scratch::Scratch::new(&base).unwrap();
    let source = source_dir.path.join("two-regions.mp4");
    let mut create = std::process::Command::new(&ffmpeg);
    create.args(["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        "color=red:s=256x128:r=10,drawbox=x=128:y=0:w=128:h=128:color=blue:t=fill,drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='between(t,0.8,1.4)'",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "3", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-y"]).arg(&source);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        create.creation_flags(0x08000000);
    }
    let created = create.output().unwrap();
    assert!(
        created.status.success(),
        "{}",
        String::from_utf8_lossy(&created.stderr)
    );
    let mut input = payload();
    input["sourceWidth"] = serde_json::json!(256);
    input["sourceHeight"] = serde_json::json!(128);
    input["trimStart"] = serde_json::json!(0.2);
    input["trimEnd"] = serde_json::json!(2.7);
    input["captionModel"] = serde_json::json!(1);
    input["captionStyle"] = serde_json::json!({"font":"Poppins","size":120,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#02c2be","effect":"none","position":"middle"});
    input["segments"] = serde_json::json!([{"sourceStart":0.2,"sourceEnd":0.8},{"sourceStart":1.5,"sourceEnd":2.7}]);
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    assert!(settings.validate(3.0).is_ok());
    let transcript = [Segment {
        id: "s".into(),
        start: 0.2,
        end: 2.7,
        text: "Legenda real".into(),
        words: vec![],
    }];
    let (rendered, output) = super::pipeline::run(
        &base,
        &source,
        &transcript,
        &settings,
        3.0,
        true,
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let result = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert_eq!((result.width, result.height), (1080, 1920));
    assert!(result.has_audio);
    assert!(
        (result.duration_ms as i64 - 1800).abs() < 120,
        "{}",
        result.duration_ms
    );
    for at in [0.2, 0.9] {
        let mut extract = std::process::Command::new(&ffmpeg);
        extract
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                &at.to_string(),
                "-i",
            ])
            .arg(&output)
            .args(["-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            extract.creation_flags(0x08000000);
        }
        let pixels = extract.output().unwrap();
        assert!(pixels.status.success());
        assert_eq!(pixels.stdout.len(), 1080 * 1920 * 3);
        let pixel = |y: usize| &pixels.stdout[(y * 1080 + 540) * 3..(y * 1080 + 540) * 3 + 3];
        assert!(
            pixel(480)[0] > 180 && pixel(480)[2] < 70,
            "painel superior e vão removido em {at}"
        );
        assert!(
            pixel(1440)[2] > 180 && pixel(1440)[0] < 70,
            "painel inferior em {at}"
        );
        assert!(
            pixels
                .stdout
                .chunks_exact(3)
                .filter(|p| p.iter().all(|v| *v > 200))
                .count()
                > 1000,
            "legenda gravada em {at}"
        );
    }
    let manifest = serde_json::json!({"durationMs":result.duration_ms,"width":result.width,"height":result.height,"hasAudio":result.has_audio,"removedGapVerified":true,"panelColorsVerified":true,"captionPixelsVerified":true});
    std::fs::write(
        base.join("split-expanded-export.json"),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();
    drop(rendered);
}

#[test]
fn real_pipeline_switches_scene_pairs_to_single_close_and_preserves_gap_audio_and_captions() {
    use crate::transcription::{process::ProcessControl, types::Segment};
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido na integração");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let source_dir = super::scratch::Scratch::new(&base).unwrap();
    let source = source_dir.path.join("scene-pairs-close.mp4");
    let mut create = std::process::Command::new(&ffmpeg);
    create.args(["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        "color=red:s=256x128:r=10,drawbox=x=128:y=0:w=128:h=128:color=blue:t=fill,drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='between(t,1,1.99)'",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "3", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-y"]).arg(&source);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        create.creation_flags(0x08000000);
    }
    let created = create.output().unwrap();
    assert!(
        created.status.success(),
        "{}",
        String::from_utf8_lossy(&created.stderr)
    );
    let mut input = scene_payload();
    input["sourceWidth"] = serde_json::json!(256);
    input["sourceHeight"] = serde_json::json!(128);
    input["trimStart"] = serde_json::json!(0.2);
    input["trimEnd"] = serde_json::json!(2.7);
    input["segments"] = serde_json::json!([
        {"sourceStart":0.2,"sourceEnd":0.8}, {"sourceStart":1.2,"sourceEnd":2.7}
    ]);
    input["captionModel"] = serde_json::json!(1);
    input["captionStyle"] = serde_json::json!({"font":"Poppins","size":120,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#02c2be","effect":"none","position":"middle"});
    let settings: RenderSettings = serde_json::from_value(input).unwrap();
    let transcript = [Segment {
        id: "scene-caption".into(),
        start: 0.2,
        end: 2.7,
        text: "Legenda real".into(),
        words: vec![],
    }];
    let (_rendered, output) = super::pipeline::run(
        &base,
        &source,
        &transcript,
        &settings,
        3.0,
        true,
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let result = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert_eq!((result.width, result.height), (1080, 1920));
    assert!(result.has_audio);
    assert!(
        (result.duration_ms as i64 - 2100).abs() < 180,
        "{}",
        result.duration_ms
    );
    for (at, phase) in [(0.2, 0), (0.9, 1), (1.8, 2)] {
        let mut extract = std::process::Command::new(&ffmpeg);
        extract
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                &at.to_string(),
                "-i",
            ])
            .arg(&output)
            .args(["-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            extract.creation_flags(0x08000000);
        }
        let pixels = extract.output().unwrap();
        assert!(
            pixels.status.success(),
            "{}",
            String::from_utf8_lossy(&pixels.stderr)
        );
        assert_eq!(pixels.stdout.len(), 1080 * 1920 * 3);
        let pixel = |y: usize| &pixels.stdout[(y * 1080 + 540) * 3..(y * 1080 + 540) * 3 + 3];
        match phase {
            0 => {
                assert!(pixel(480)[0] > 180 && pixel(480)[2] < 70);
                assert!(pixel(1440)[2] > 180 && pixel(1440)[0] < 70);
            }
            1 => {
                for y in [480, 1440] {
                    assert!(
                        pixel(y)[1] > 90 && pixel(y)[0] < 70 && pixel(y)[2] < 70,
                        "quadro único no close em {at}"
                    );
                }
            }
            _ => {
                assert!(pixel(480)[2] > 180 && pixel(480)[0] < 70);
                assert!(pixel(1440)[0] > 180 && pixel(1440)[2] < 70);
            }
        }
        assert!(
            pixels
                .stdout
                .chunks_exact(3)
                .filter(|pixel| pixel.iter().all(|v| *v > 200))
                .count()
                > 1000,
            "legenda rebaseada na cena em {at}"
        );
    }
}
