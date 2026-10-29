use super::Plan;
use crate::editor::{render_plan::Window, types::Composition};
use serde_json::{json, Value};

fn value() -> Value {
    let settings = json!({"ratio":"9:16","fit":"cover","zoom":1,"captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null,"splitScreen":{"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}}});
    json!({
        "version":1,"revision":2,"fps":{"numerator":30,"denominator":1},
        "settings":settings,
        "assets":[{"id":"video","mediaId":"media","name":"sample.mp4","kind":"video","durationUs":120000000,"width":1920,"height":1080,"hasAudio":true,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"item","trackId":"V1","assetId":"video","kind":"video","startFrame":0,"durationFrames":3600,"sourceStartUs":0,"sourceEndUs":120000000,"groupId":"group","followsMain":true,"settings":settings,"captionEdits":{}}]
    })
}

fn supports(value: Value, window: Window) -> bool {
    let document: Composition = serde_json::from_value(value).unwrap();
    Plan::for_window(&document, &window).unwrap().is_some()
}

#[test]
fn long_opaque_horizontal_split_is_eligible_for_gpu_planning() {
    assert!(supports(
        value(),
        Window {
            start: 0,
            end: 3600
        }
    ));
}

#[test]
fn short_or_fractional_rate_windows_keep_the_existing_compositor() {
    assert!(!supports(value(), Window { start: 0, end: 1 }));
    assert!(!supports(
        value(),
        Window {
            start: 0,
            end: 1799
        }
    ));
    let mut document = value();
    document["fps"] = json!({"numerator":30000,"denominator":1001});
    assert!(!supports(
        document,
        Window {
            start: 0,
            end: 3600
        }
    ));
}

#[test]
fn unsupported_alpha_background_zoom_and_effects_do_not_change_the_result() {
    let mut alpha = value();
    alpha["items"][0]["placement"] = json!({"x":50,"y":50,"scale":1,"opacity":0.5});
    let mut background = value();
    background["settings"]["background"] = json!("#ff0000");
    let mut zoom = value();
    zoom["items"][0]["settings"]["splitScreen"]["top"]["zoom"] = json!(2);
    let mut effects = value();
    effects["items"][0]["settings"]["effects"] =
        json!({"brightness":120,"contrast":100,"saturation":100,"blur":0,"hue":0});
    for document in [alpha, background, zoom, effects] {
        assert!(!supports(
            document,
            Window {
                start: 0,
                end: 3600
            }
        ));
    }
}

#[test]
fn another_visual_layer_is_preserved_by_software_composition() {
    let mut document = value();
    let mut item = document["items"][0].clone();
    item["id"] = json!("overlay");
    item["trackId"] = json!("V2");
    document["items"].as_array_mut().unwrap().push(item);
    document["tracks"].as_array_mut().unwrap().push(json!({"id":"V2","name":"Acima","kind":"visual","primary":false,"locked":false,"hidden":false,"muted":false}));
    assert!(!supports(
        document,
        Window {
            start: 0,
            end: 3600
        }
    ));
}

#[test]
fn source_profile_requires_known_sdr_rotation_and_dimensions() {
    let good = json!({"streams":[{"codec_name":"h264","pix_fmt":"yuv420p","width":1920,"height":1080,"color_space":"bt709","color_range":"tv","color_transfer":"bt709","color_primaries":"bt709"}]});
    assert!(super::source::compatible(
        &serde_json::to_vec(&good).unwrap(),
        1920,
        1080
    ));
    for (key, value) in [
        ("codec_name", json!("hevc")),
        ("pix_fmt", json!("yuv420p10le")),
        ("width", json!(1280)),
        ("color_range", json!("pc")),
        ("color_space", json!("unknown")),
        ("color_transfer", json!("smpte2084")),
        ("color_primaries", json!(null)),
        ("side_data_list", json!([{"rotation":90}])),
        ("tags", json!({"rotate":"90"})),
    ] {
        let mut bad = good.clone();
        bad["streams"][0][key] = value;
        assert!(
            !super::source::compatible(&serde_json::to_vec(&bad).unwrap(), 1920, 1080),
            "{key}"
        );
    }
    assert!(!super::source::compatible(b"invalid", 1920, 1080));
}

#[test]
fn gpu_command_shares_device_and_preserves_offset_and_frames() {
    let mut input = value();
    input["items"][0]["startFrame"] = json!(300);
    input["items"][0]["durationFrames"] = json!(2700);
    input["items"][0]["sourceStartUs"] = json!(10000000);
    let document: Composition = serde_json::from_value(input).unwrap();
    let plan = Plan::for_window(
        &document,
        &Window {
            start: 600,
            end: 3000,
        },
    )
    .unwrap()
    .unwrap();
    let scratch = crate::render::scratch::Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu"),
    )
    .unwrap();
    let args =
        super::command::arguments(&plan, std::path::Path::new("source.mp4"), &scratch.path, 0)
            .unwrap();
    let get = |key: &str| {
        args[args.iter().position(|arg| arg == key).unwrap() + 1]
            .to_string_lossy()
            .into_owned()
    };
    assert_eq!(get("-ss"), "20");
    assert_eq!(get("-t"), "80");
    assert_eq!(get("-frames:v"), "2400");
    assert_eq!(get("-hwaccel_device"), "gpu");
    assert_eq!(get("-filter_hw_device"), "gpu");
    let graph = std::fs::read_to_string(scratch.path.join("video-0-gpu.txt")).unwrap();
    assert!(!graph.contains("hwupload_cuda"));
    assert!(graph.contains("setparams=colorspace=bt709,hwupload"));
    assert!(graph.contains("scale_cuda=1708:960"));
    assert!(graph.contains("overlay_cuda=x=-628:y=960"));
}

#[test]
fn failed_composition_retries_only_once_with_the_original_encoder() {
    let scratch = crate::render::scratch::Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu"),
    )
    .unwrap();
    let control = crate::transcription::process::ProcessControl::default();
    let mut session = super::Session::default();
    let mut attempts = Vec::new();
    session
        .render(
            Some(vec!["gpu".into()]),
            &control,
            &scratch.path.join("fallback.log"),
            || Ok(vec!["nvenc".into()]),
            |args, gpu| {
                attempts.push((args, gpu));
                if gpu {
                    Err("controlled composition failure".into())
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(attempts.len(), 2);
    assert!(attempts[0].1);
    assert!(!attempts[1].1);
    assert_eq!(attempts[1].0[0], "nvenc");
    assert!(!session.enabled);
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("fallback.log")).unwrap(),
        "controlled composition failure"
    );
}

#[test]
fn cancelled_composition_never_starts_fallback() {
    let scratch = crate::render::scratch::Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu"),
    )
    .unwrap();
    let control = crate::transcription::process::ProcessControl::default();
    let mut attempts = 0;
    let result = super::Session::default().render(
        Some(vec![]),
        &control,
        &scratch.path.join("fallback.log"),
        || panic!("cancel must not retry"),
        |_, _| {
            attempts += 1;
            control.cancel();
            Err("interrupted".into())
        },
    );
    assert!(result.is_err());
    assert_eq!(attempts, 1);
    assert!(!scratch.path.join("fallback.log").exists());
}

#[test]
fn successful_gpu_does_not_create_fallback_or_change_availability() {
    let control = crate::transcription::process::ProcessControl::default();
    let mut session = super::Session::default();
    let mut attempts = 0;
    session
        .render(
            Some(vec![]),
            &control,
            std::path::Path::new("not-created.log"),
            || panic!("successful GPU must not retry"),
            |_, gpu| {
                assert!(gpu);
                attempts += 1;
                Ok(())
            },
        )
        .unwrap();
    assert!(session.enabled);
    assert_eq!(attempts, 1);
}

#[test]
fn failed_fallback_returns_error_without_another_attempt() {
    let scratch = crate::render::scratch::Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-gpu"),
    )
    .unwrap();
    let control = crate::transcription::process::ProcessControl::default();
    let mut attempts = 0;
    let result = super::Session::default().render(
        Some(vec![]),
        &control,
        &scratch.path.join("fallback.log"),
        || Ok(vec![]),
        |_, gpu| {
            attempts += 1;
            Err(if gpu {
                "gpu failure"
            } else {
                "cpu composition failure"
            }
            .into())
        },
    );
    assert_eq!(result.unwrap_err(), "cpu composition failure");
    assert_eq!(attempts, 2);
}

#[test]
fn unsupported_panel_placement_and_independent_caption_stay_on_cpu() {
    let mut extreme = value();
    extreme["items"][0]["placement"] = json!({"x":50,"y":50,"scale":8,"opacity":1});
    let mut odd_y = value();
    odd_y["items"][0]["placement"] = json!({"x":50,"y":50.1,"scale":1,"opacity":1});
    let mut vertical = value();
    vertical["assets"][0]["width"] = json!(1080);
    vertical["assets"][0]["height"] = json!(1920);
    let mut independent = value();
    let mut caption = independent["items"][0].clone();
    caption["id"] = json!("caption");
    caption["kind"] = json!("caption");
    caption["trackId"] = json!("C1");
    caption["followsMain"] = json!(false);
    independent["items"].as_array_mut().unwrap().push(caption);
    independent["tracks"].as_array_mut().unwrap().push(json!({"id":"C1","name":"Texto","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false}));
    for document in [extreme, odd_y, vertical, independent] {
        assert!(!supports(
            document,
            Window {
                start: 0,
                end: 3600
            }
        ));
    }
}
