use super::ProcessControl;
use crate::render::scratch::Scratch;
use std::{
    process::Command,
    time::{Duration, Instant},
};

#[test]
fn timeout_child() {
    if std::env::var_os("CNP_PROCESS_TIMEOUT_CHILD").is_some() {
        std::thread::sleep(Duration::from_secs(5));
    }
}

#[test]
fn deadline_terminates_owned_process_and_keeps_control_reusable() {
    let scratch = Scratch::new(&std::env::temp_dir()).unwrap();
    let control = ProcessControl::default();
    let mut sleeping = Command::new(std::env::current_exe().unwrap());
    sleeping
        .args([
            "--exact",
            "transcription::process::timeout_tests::timeout_child",
            "--nocapture",
        ])
        .env("CNP_PROCESS_TIMEOUT_CHILD", "1");
    let started = Instant::now();
    assert!(control
        .run_with_timeout(
            sleeping,
            &scratch.path.join("deadline.log"),
            Duration::from_millis(200)
        )
        .is_err());
    assert!(started.elapsed() < Duration::from_secs(3));
    assert!(control.child.lock().unwrap().is_none());
    assert!(control.check().is_ok());
    let mut next = Command::new(std::env::current_exe().unwrap());
    next.arg("--list");
    control
        .run_with_timeout(
            next,
            &scratch.path.join("retry.log"),
            Duration::from_secs(5),
        )
        .unwrap();
}

#[test]
fn bounded_file_output_preserves_success_and_cancel_prevents_spawn() {
    let scratch = Scratch::new(&std::env::temp_dir()).unwrap();
    let control = ProcessControl::default();
    let output = scratch.path.join("list.txt");
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.arg("--list");
    control
        .run_to_file_with_timeout(
            &mut command,
            &scratch.path.join("output.log"),
            &output,
            Duration::from_secs(5),
        )
        .unwrap();
    assert!(std::fs::metadata(&output).unwrap().len() > 0);
    control.cancel();
    let mut cancelled = Command::new(std::env::current_exe().unwrap());
    cancelled.arg("--list");
    let absent = scratch.path.join("cancelled.txt");
    assert!(control
        .run_to_file_with_timeout(
            &mut cancelled,
            &scratch.path.join("cancelled.log"),
            &absent,
            Duration::from_secs(5)
        )
        .is_err());
    assert!(!absent.exists());
}
