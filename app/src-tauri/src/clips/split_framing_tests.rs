use super::*;

fn response(suggestion: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "version":2,"backend":"yunet-split-scenes-v2","samples":12,
        "elapsedMs":120,"peakWorkingSetBytes":1024,"suggestion":suggestion
    }))
    .unwrap()
}

fn found() -> serde_json::Value {
    serde_json::json!({"status":"found","message":"Revise os dois painéis.",
        "layout":{"version":1,"top":{"x":10.0,"y":50.0,"zoom":1.5},
            "bottom":{"x":90.0,"y":50.0,"zoom":1.5},
            "shots":[{"sourceStart":0.0,"sourceEnd":1.0,
                "top":{"x":10.0,"y":50.0,"zoom":1.5},"bottom":{"x":90.0,"y":50.0,"zoom":1.5}}]}})
}

#[test]
fn accepts_found_layout_without_converting_crop_anchors_again() {
    let result = parse_response(&response(found())).unwrap();
    assert_eq!(result.status, "found");
    let layout = result.layout.unwrap();
    assert_eq!(layout.top.x, 10.0);
    assert_eq!(layout.bottom.x, 90.0);
    assert_eq!(layout.top.zoom, 1.5);
}

#[test]
fn manual_response_cannot_include_an_invented_layout() {
    let manual = serde_json::json!({"status":"manual","message":"Ajuste manual necessário."});
    let result = parse_response(&response(manual)).unwrap();
    assert!(result.layout.is_none());
    let mut invented = found();
    invented["status"] = "manual".into();
    assert!(parse_response(&response(invented)).is_err());
}

#[test]
fn scene_detector_keeps_manual_failures_explicit_and_requires_local_scene_windows() {
    let mut manual: serde_json::Value = serde_json::from_slice(&response(
        serde_json::json!({"status":"manual","message":"Não foi possível ler as cenas."}),
    ))
    .unwrap();
    manual["samples"] = serde_json::json!(0);
    assert!(parse_response(&serde_json::to_vec(&manual).unwrap())
        .unwrap()
        .layout
        .is_none());
    assert!(parse_window_response(&response(found()), 0.0, 1.0).is_ok());
    assert!(parse_window_response(&response(found()), 0.2, 1.0).is_err());
    assert!(parse_window_response(&response(found()), 0.0, 0.8).is_err());
    let mut legacy = found();
    legacy["layout"].as_object_mut().unwrap().remove("shots");
    assert!(parse_response(&response(legacy)).is_err());
    let mut overlapping = found();
    let mut shot = overlapping["layout"]["shots"][0].clone();
    shot["sourceStart"] = serde_json::json!(0.5);
    shot["sourceEnd"] = serde_json::json!(1.5);
    overlapping["layout"]["shots"]
        .as_array_mut()
        .unwrap()
        .push(shot);
    assert!(parse_response(&response(overlapping)).is_err());
}

#[test]
fn detector_viewport_must_be_a_finite_nonempty_normalized_region() {
    assert!(Viewport {
        x: 0.1,
        y: 0.2,
        width: 0.8,
        height: 0.7
    }
    .valid());
    for viewport in [
        Viewport {
            x: -0.1,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        },
        Viewport {
            x: 0.5,
            y: 0.0,
            width: 0.8,
            height: 1.0,
        },
        Viewport {
            x: 0.0,
            y: 0.3,
            width: 1.0,
            height: 0.8,
        },
        Viewport {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 1.0,
        },
        Viewport {
            x: 0.0,
            y: 0.0,
            width: f64::INFINITY,
            height: 1.0,
        },
    ] {
        assert!(!viewport.valid());
    }
    assert!(serde_json::from_value::<Viewport>(
        serde_json::json!({"x":0,"y":0,"width":1,"height":1,"url":"outside"})
    )
    .is_err());
}

#[test]
fn rejects_wrong_version_backend_sample_count_status_and_invalid_panels() {
    for (field, value) in [
        ("version", serde_json::json!(1)),
        ("backend", serde_json::json!("other")),
        ("samples", serde_json::json!(193)),
        ("samples", serde_json::json!(2)),
    ] {
        let mut value_json: serde_json::Value = serde_json::from_slice(&response(found())).unwrap();
        value_json[field] = value;
        assert!(parse_response(&serde_json::to_vec(&value_json).unwrap()).is_err());
    }
    for (field, value) in [("x", -1.0), ("y", 101.0), ("zoom", 3.1)] {
        let mut suggestion = found();
        suggestion["layout"]["top"][field] = value.into();
        assert!(parse_response(&response(suggestion)).is_err());
    }
    let mut suggestion = found();
    suggestion["status"] = "stable".into();
    assert!(parse_response(&response(suggestion)).is_err());
    let mut suggestion = found();
    suggestion.as_object_mut().unwrap().remove("layout");
    assert!(parse_response(&response(suggestion)).is_err());
    assert!(parse_response(&vec![b' '; 65537]).is_err());
    let nonfinite = String::from_utf8(response(found()))
        .unwrap()
        .replace("10.0", "1e999");
    assert!(parse_response(nonfinite.as_bytes()).is_err());
}

#[test]
fn source_window_accepts_manual_sources_longer_than_automatic_clips() {
    assert!(validate_window(20.0, 620.0, 700.0).is_ok());
    for (start, end, duration) in [
        (-1.0, 20.0, 30.0),
        (20.0, 20.0, 30.0),
        (0.0, 31.0, 30.0),
        (f64::NAN, 20.0, 30.0),
        (0.0, f64::INFINITY, 30.0),
        (0.0, 20.0, 0.0),
    ] {
        assert!(validate_window(start, end, duration).is_err());
    }
}

#[test]
fn deadline_cancels_only_owned_control_and_finishes_watchdog_early() {
    let control = Arc::new(ProcessControl::default());
    let (finished, watcher) = deadline(&control, Duration::from_millis(20));
    watcher.join().unwrap();
    assert!(control.check().is_err());
    drop(finished);
    let control = Arc::new(ProcessControl::default());
    let (finished, watcher) = deadline(&control, Duration::from_secs(35));
    finished.send(()).unwrap();
    watcher.join().unwrap();
    assert!(control.check().is_ok());
}
