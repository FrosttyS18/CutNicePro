use super::{jobs::TranscriptionJobs, parser, process::ProcessControl, store, types::Transcript};

fn fixture() -> Transcript {
    Transcript {
        version: 1,
        media_id: "media-local".into(),
        language: "pt".into(),
        model: "base".into(),
        segments: parser::parse(
            r#"{"transcription":[{"offsets":{"from":0,"to":1500},"text":"Olá, projeto local."}]}"#,
            2.0,
        )
        .unwrap(),
    }
}

#[test]
fn pipeline_contract_persists_edits_and_failure_never_replaces_previous() {
    let base = std::env::temp_dir().join(format!("cnp-m3a-{}", uuid::Uuid::new_v4()));
    let project = uuid::Uuid::new_v4().to_string();
    let jobs = TranscriptionJobs::default();
    let id = uuid::Uuid::new_v4().to_string();
    jobs.start(id.clone(), project.clone()).unwrap();
    jobs.finish(&id, Ok(fixture()), |r| store::save(&base, &project, r, 2.0))
        .unwrap();
    let mut edited = store::load(&base, &project).unwrap().unwrap();
    edited.segments[0].text = "Olá, projeto corrigido.".into();
    jobs.edit(|| store::save(&base, &project, &edited, 2.0))
        .unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    jobs.start(id.clone(), project.clone()).unwrap();
    assert!(jobs.edit(|| Ok(())).is_err());
    assert!(jobs
        .finish(
            &id,
            Err("motor indisponível".into()),
            |_: &Transcript| panic!("failed job must not save")
        )
        .is_err());
    assert_eq!(jobs.snapshot().unwrap().state, "failed");
    assert_eq!(
        store::load(&base, &project).unwrap().unwrap().segments[0].text,
        edited.segments[0].text
    );
    std::fs::remove_dir_all(base).unwrap();
}

#[test]
fn job_snapshot_identifies_operation_before_first_event() {
    let jobs = TranscriptionJobs::default();
    let id = uuid::Uuid::new_v4().to_string();
    jobs.start_operation(id.clone(), "project".into(), Some("analyze"))
        .unwrap();
    let snapshot = jobs.snapshot().unwrap();
    assert_eq!(snapshot.operation.as_deref(), Some("analyze"));
    assert_eq!(
        serde_json::to_value(snapshot).unwrap()["operation"],
        "analyze"
    );
    assert!(jobs
        .start_operation(
            uuid::Uuid::new_v4().to_string(),
            "project".into(),
            Some("generate")
        )
        .is_err());
    jobs.cancel(Some(&id));
}

#[test]
fn corrupt_transcript_is_reported_and_preserved() {
    let base = std::env::temp_dir().join(format!("cnp-m3a-{}", uuid::Uuid::new_v4()));
    let project = uuid::Uuid::new_v4().to_string();
    store::save(&base, &project, &fixture(), 2.0).unwrap();
    let file = base
        .join("cutnicepro/transcripts")
        .join(format!("{project}.json"));
    std::fs::write(&file, "invalid json").unwrap();
    assert!(store::load(&base, &project).is_err());
    assert_eq!(std::fs::read_to_string(file).unwrap(), "invalid json");
    std::fs::remove_dir_all(base).unwrap();
}

#[test]
fn cancellation_before_spawn_runs_nothing() {
    let control = ProcessControl::default();
    control.cancel();
    let result = control.run(
        std::process::Command::new("nonexistent-cnp-engine"),
        std::path::Path::new("unused.log"),
    );
    assert!(result.unwrap_err().contains("cancelada"));
}

#[cfg(windows)]
#[test]
fn cancels_owned_subprocess_and_returns_without_waiting_for_its_work() {
    use std::{
        process::Command,
        sync::Arc,
        time::{Duration, Instant},
    };
    let control = Arc::new(ProcessControl::default());
    let worker = control.clone();
    let log = std::env::temp_dir().join(format!("cnp-process-{}.log", uuid::Uuid::new_v4()));
    let output = log.clone();
    let started = Instant::now();
    let thread = std::thread::spawn(move || {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Seconds 20",
        ]);
        worker.run(command, &output)
    });
    std::thread::sleep(Duration::from_millis(200));
    control.cancel();
    assert!(thread.join().unwrap().is_err());
    assert!(started.elapsed() < Duration::from_secs(5));
    let _ = std::fs::remove_file(log);
}
