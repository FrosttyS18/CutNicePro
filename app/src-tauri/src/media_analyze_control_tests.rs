use super::*;
use crate::{
    editor::types::MediaKind, media_import::ImportJobs, transcription::process::ProcessControl,
};
use std::{
    fs,
    sync::Arc,
    time::{Duration, Instant},
};

struct Fixture {
    root: PathBuf,
    tools: FfTools,
    source: PathBuf,
}

impl Fixture {
    fn new(blocked: bool) -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-fixtures")
            .join(format!("import-probe-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let fixture = Self {
            tools: FfTools {
                ffprobe: root.join("probe.exe"),
            },
            source: root.join(if blocked { "blocked.mp4" } else { "video.mp4" }),
            root,
        };
        let source = fixture.root.join("probe.rs");
        fs::write(&source, r###"
fn main() {
    let source = std::path::PathBuf::from(std::env::args_os().last().unwrap());
    let root = source.parent().unwrap();
    std::fs::write(root.join("probe.pid"), std::process::id().to_string()).unwrap();
    if source.file_name().unwrap() == "blocked.mp4" {
        std::thread::sleep(std::time::Duration::from_secs(4));
    }
    println!("{}", r##"{"streams":[{"codec_type":"video","codec_name":"h264","width":1280,"height":720,"avg_frame_rate":"30/1"},{"codec_type":"audio","codec_name":"aac"}],"format":{"duration":"12.345"}}"##);
}
"###).unwrap();
        let output = Command::new("rustc")
            .args(["--edition=2021", "--crate-name", "cnp_import_probe"])
            .arg(&source)
            .arg("-o")
            .arg(&fixture.tools.ffprobe)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        fs::write(&fixture.source, b"fixture-media-preserved").unwrap();
        fs::write(fixture.root.join("keep.txt"), b"keep").unwrap();
        fixture
    }

    fn wait_for_pid(&self) -> u32 {
        let start = Instant::now();
        loop {
            if let Ok(value) = fs::read_to_string(self.root.join("probe.pid")) {
                if let Ok(pid) = value.parse() {
                    return pid;
                }
            }
            assert!(
                start.elapsed() < Duration::from_secs(3),
                "fixture não iniciou"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn assert_preserved(&self) {
        assert_eq!(fs::read(&self.source).unwrap(), b"fixture-media-preserved");
        assert_eq!(fs::read(self.root.join("keep.txt")).unwrap(), b"keep");
        assert!(!fs::read_dir(&self.root).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".probe-")
        }));
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn stopped(pid: u32) -> bool {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    unsafe {
        let handle = OpenProcess(0x00100000, 0, pid);
        if handle.is_null() {
            assert_eq!(std::io::Error::last_os_error().raw_os_error(), Some(87));
            return true;
        }
        let exited = WaitForSingleObject(handle, 0) == 0;
        CloseHandle(handle);
        exited
    }
}

#[test]
fn import_shutdown_marks_current_and_late_registrations_cancelled() {
    let jobs = ImportJobs::new();
    let first = jobs.register("one");
    let second = jobs.register("two");
    assert!(jobs.cancel("one"));
    assert!(!second.load(std::sync::atomic::Ordering::SeqCst));
    jobs.cancel_all();
    assert!(first.load(std::sync::atomic::Ordering::SeqCst));
    assert!(second.load(std::sync::atomic::Ordering::SeqCst));
    assert!(jobs
        .register("late")
        .load(std::sync::atomic::Ordering::SeqCst));
    jobs.finish("one");
    assert!(!jobs.cancel("one"));
}

fn cancel_probe(all: bool) {
    let fixture = Fixture::new(true);
    let jobs = ImportJobs::new();
    jobs.register("owned");
    let other = jobs.register("other");
    std::thread::scope(|scope| {
        let worker = scope.spawn(|| {
            jobs.analyze(
                "owned",
                &fixture.tools,
                &fixture.source,
                &MediaKind::Video,
                &fixture.root,
            )
        });
        let pid = fixture.wait_for_pid();
        let start = Instant::now();
        if all {
            jobs.cancel_all();
        } else {
            assert!(jobs.cancel("owned"));
        }
        let child_stopped = stopped(pid);
        let result = worker.join().unwrap();
        assert!(result.is_err());
        assert!(
            child_stopped,
            "o cancelamento retornou com o próprio probe ainda vivo"
        );
        assert!(start.elapsed() < Duration::from_secs(2));
    });
    assert_eq!(other.load(std::sync::atomic::Ordering::SeqCst), all);
    fixture.assert_preserved();
}

#[test]
fn import_cancel_by_job_terminates_only_its_owned_probe() {
    cancel_probe(false);
}

#[test]
fn import_shutdown_terminates_owned_probe_before_returning() {
    cancel_probe(true);
}

#[test]
fn import_probe_deadline_terminates_child_and_cleans_scratch() {
    let fixture = Fixture::new(true);
    let control = Arc::new(ProcessControl::default());
    let start = Instant::now();
    let result = analyze_import_with_timeout(
        &fixture.tools,
        &fixture.source,
        &MediaKind::Video,
        control,
        &fixture.root,
        Duration::from_millis(400),
    );
    assert!(result.unwrap_err().contains("limite"));
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(stopped(fixture.wait_for_pid()));
    fixture.assert_preserved();
}

#[test]
fn import_controlled_probe_preserves_video_image_and_audio_metadata() {
    let fixture = Fixture::new(false);
    let jobs = ImportJobs::new();
    for (id, kind) in [
        ("video", MediaKind::Video),
        ("image", MediaKind::Image),
        ("audio", MediaKind::Audio),
    ] {
        jobs.register(id);
        let data = jobs
            .analyze(id, &fixture.tools, &fixture.source, &kind, &fixture.root)
            .unwrap();
        match kind {
            MediaKind::Video => {
                assert_eq!(data.duration_ms, 12_345);
                assert_eq!(data.width, 1280);
                assert!(data.has_audio);
            }
            MediaKind::Image => {
                assert_eq!(data.duration_ms, 0);
                assert_eq!(data.height, 720);
                assert!(!data.has_audio);
            }
            MediaKind::Audio => {
                assert_eq!(data.duration_ms, 12_345);
                assert_eq!(data.width, 0);
                assert_eq!(data.audio_codec.as_deref(), Some("aac"));
            }
        }
        jobs.finish(id);
    }
    fixture.assert_preserved();
}

#[test]
fn import_cancel_before_probe_creates_no_process_or_scratch() {
    let fixture = Fixture::new(false);
    let jobs = ImportJobs::new();
    jobs.register("owned");
    jobs.cancel("owned");
    assert!(jobs
        .analyze(
            "owned",
            &fixture.tools,
            &fixture.source,
            &MediaKind::Video,
            &fixture.root
        )
        .is_err());
    assert!(!fixture.root.join("probe.pid").exists());
    fixture.assert_preserved();
}
