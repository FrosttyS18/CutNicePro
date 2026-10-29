use super::{
    export_artifact,
    export_options::{ExportOptions, Quality, Resolution},
    render_tests::execute,
    types::Composition,
};
use crate::{
    media_source::SourceGuard, render::scratch::Scratch, transcription::process::ProcessControl,
};
use serde_json::json;
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::PathBuf,
    time::Instant,
};

#[test]
fn real_export_reuses_completed_video_for_another_name_and_invalidates_options() {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-export-artifact");
    let scratch = Scratch::new(&base).unwrap();
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=160x90:r=10:d=0.5",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
        ],
        &source,
        &control,
        &scratch.path.join("source.log"),
    );
    let settings = json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let document: Composition = serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":10,"denominator":1},"settings":settings,
        "assets":[{"id":"source","mediaId":"source","name":"source.mp4","kind":"video","durationUs":500000,"width":160,"height":90,"hasAudio":false,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"one","trackId":"V1","assetId":"source","kind":"video","startFrame":0,"durationFrames":5,"sourceStartUs":0,"sourceEndUs":500000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}]})).unwrap();
    let guard = SourceGuard::open(&source).unwrap();
    let stamps = BTreeMap::from([("source".into(), guard.stamp().clone())]);
    let sources = HashMap::from([("source".into(), source)]);
    let started = Instant::now();
    let mut first = export_artifact::produce(
        &scratch.path,
        &document,
        &sources,
        &stamps,
        ExportOptions::default(),
        &control,
        |_| {},
    )
    .unwrap();
    assert!(!first.reused());
    let first_path = scratch.path.join("primeiro-nome.mp4");
    first
        .copy(&mut fs::File::create(&first_path).unwrap(), &control)
        .unwrap();
    first.remember(&control);
    let first_elapsed = started.elapsed().as_secs_f64();
    drop(first);
    let started = Instant::now();
    let mut progress_calls = 0;
    let mut second = export_artifact::produce(
        &scratch.path,
        &document,
        &sources,
        &stamps,
        ExportOptions::default(),
        &control,
        |_| progress_calls += 1,
    )
    .unwrap();
    assert!(second.reused());
    assert_eq!(progress_calls, 0);
    let second_path = scratch.path.join("outro-nome.mp4");
    second
        .copy(&mut fs::File::create(&second_path).unwrap(), &control)
        .unwrap();
    assert_eq!(
        fs::read(&first_path).unwrap(),
        fs::read(&second_path).unwrap()
    );
    let second_elapsed = started.elapsed().as_secs_f64();
    drop(second);
    let options = ExportOptions {
        resolution: Resolution::Hd720,
        quality: Quality::Balanced,
        ..Default::default()
    };
    let mut changed = export_artifact::produce(
        &scratch.path,
        &document,
        &sources,
        &stamps,
        options,
        &control,
        |_| {},
    )
    .unwrap();
    assert!(!changed.reused());
    let changed_path = scratch.path.join("720p.mp4");
    changed
        .copy(&mut fs::File::create(&changed_path).unwrap(), &control)
        .unwrap();
    let metadata = crate::media_analyze::analyze(&tools, &changed_path).unwrap();
    assert_eq!((metadata.width, metadata.height), (1280, 720));
    assert!(metadata.has_audio);
    assert_eq!(metadata.duration_ms, 500);
    fs::write(base.join("result.json"), serde_json::to_vec_pretty(&json!({"firstSeconds":first_elapsed,"secondSeconds":second_elapsed,"sameBytes":true,"rendererProgressCallsOnHit":progress_calls,"changedDimensions":[metadata.width,metadata.height]})).unwrap()).unwrap();
    eprintln!("[cache-test] primeira={first_elapsed:.3}s repetida={second_elapsed:.3}s dimensões=1280x720 bytes idênticos; evidência em {}", base.join("result.json").display());
}
