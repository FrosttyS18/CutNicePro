use super::*;
use crate::render::scratch::Scratch;
use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-thumbnail-jobs")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn controlled_child() {
    let Some(ready) = std::env::var_os("CNP_THUMBNAIL_TEST_READY") else {
        return;
    };
    let release = PathBuf::from(std::env::var_os("CNP_THUMBNAIL_TEST_RELEASE").unwrap());
    std::fs::write(ready, b"ready").unwrap();
    let started = Instant::now();
    while !release.exists() && started.elapsed() < Duration::from_secs(15) {
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn shutdown_stops_owned_child_and_rejects_queued_work() {
    let directory = TestDirectory::new();
    let jobs = Arc::new(ThumbnailJobs::default());
    let ready = directory.0.join("ready");
    let release = directory.0.join("release");
    let (scratch_sender, scratch_receiver) = mpsc::channel();
    let (result_sender, result_receiver) = mpsc::channel();
    let worker_jobs = jobs.clone();
    let base = directory.0.clone();
    let ready_path = ready.clone();
    let release_path = release.clone();
    let worker = thread::spawn(move || {
        let result = worker_jobs.run(|control| {
            let scratch = Scratch::new(&base)?;
            scratch_sender.send(scratch.path.clone()).unwrap();
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args([
                    "--exact",
                    "editor::thumbnail::jobs::tests::controlled_child",
                    "--nocapture",
                ])
                .env("CNP_THUMBNAIL_TEST_READY", ready_path)
                .env("CNP_THUMBNAIL_TEST_RELEASE", release_path);
            control.run(command, &scratch.path.join("child.log"))
        });
        result_sender.send(result).unwrap();
    });
    let scratch = scratch_receiver
        .recv_timeout(Duration::from_secs(5))
        .unwrap();
    let started = Instant::now();
    while !ready.exists() && started.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(10));
    }
    let child_started = ready.exists();
    let executed = Arc::new(AtomicBool::new(false));
    let queued_jobs = jobs.clone();
    let queued_executed = executed.clone();
    let (queued_sender, queued_receiver) = mpsc::channel();
    let queued = thread::spawn(move || {
        queued_sender.send(()).unwrap();
        queued_jobs.run(|_| {
            queued_executed.store(true, Ordering::SeqCst);
            Ok(())
        })
    });
    queued_receiver
        .recv_timeout(Duration::from_secs(5))
        .unwrap();
    jobs.cancel();
    let stopped = result_receiver.recv_timeout(Duration::from_secs(2));
    std::fs::write(&release, b"release").unwrap();
    worker.join().unwrap();
    let queued_result = queued.join().unwrap();
    assert!(
        child_started,
        "o subprocesso controlado precisa estar ativo"
    );
    assert!(
        matches!(stopped, Ok(Err(_))),
        "shutdown deve cancelar o filho ativo antes de sua liberação normal: {stopped:?}"
    );
    assert!(queued_result.is_err());
    assert!(!executed.load(Ordering::SeqCst));
    assert!(!scratch.exists());
    assert!(jobs.run(|_| Ok(())).is_err());
}

#[test]
fn process_failure_releases_serial_slot_and_scratch() {
    let directory = TestDirectory::new();
    let jobs = ThumbnailJobs::default();
    let mut scratch_path = None;
    let result = jobs.run(|control| {
        let scratch = Scratch::new(&directory.0)?;
        scratch_path = Some(scratch.path.clone());
        let command = Command::new(directory.0.join("missing-child-executable"));
        control.run(command, &scratch.path.join("failure.log"))
    });
    assert!(result.is_err());
    assert!(!scratch_path.unwrap().exists());
    assert_eq!(jobs.run(|_| Ok(7)).unwrap(), 7);
}
