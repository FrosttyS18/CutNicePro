use super::{checkpoints::Cache, process::ProcessControl, runner, tools};

#[test]
#[ignore = "Transcreve dois blocos reais e retoma após cancelamento no checkpoint"]
fn real_transcription_resumes_valid_checkpoint_and_keeps_absolute_times() {
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/vendor/pipeline-validation/resume");
    std::fs::create_dir_all(&base).unwrap();
    let source = base.parent().unwrap().join("source.mp4");
    let media = format!("resume-validation-{}", uuid::Uuid::new_v4());
    let engine = tools::discover(&base).unwrap();
    assert!(engine.gpu);
    let cache = Cache::open(&base, &source, &media, 260.0, &engine).unwrap();
    let control = ProcessControl::default();
    let first = runner::run(
        &base,
        &source,
        &media,
        260.0,
        engine,
        &control,
        |_| {},
        |value| {
            if value >= 65 {
                control.cancel();
            }
        },
    );
    assert!(first.is_err());
    let checkpoint = cache.path.join("0.json");
    let before = std::fs::read(&checkpoint).unwrap();
    let modified = std::fs::metadata(&checkpoint).unwrap().modified().unwrap();
    assert!(!cache.path.join("1.json").exists());
    let output = runner::run(
        &base,
        &source,
        &media,
        260.0,
        tools::discover(&base).unwrap(),
        &ProcessControl::default(),
        |_| {},
        |_| {},
    )
    .unwrap();
    assert_eq!(std::fs::read(&checkpoint).unwrap(), before);
    assert_eq!(
        std::fs::metadata(&checkpoint).unwrap().modified().unwrap(),
        modified
    );
    assert!(output
        .transcript
        .segments
        .iter()
        .any(|segment| segment.end > 250.0));
    super::parser::validate(&output.transcript.segments, 260.0).unwrap();
    std::fs::write(
        base.join("resumed-transcript.json"),
        serde_json::to_vec_pretty(&output.transcript).unwrap(),
    )
    .unwrap();
    std::fs::write(base.join("checkpoint-proof.json"),serde_json::to_vec_pretty(&serde_json::json!({"firstCheckpointReused":true,"completedBlocks":2,"duration":260.0,"segments":output.transcript.segments.len(),"model":output.transcript.model})).unwrap()).unwrap();
    output.cache.complete().unwrap();
    assert!(!checkpoint.exists());
    assert!(output.cache.path.join("completed").is_file());
}
