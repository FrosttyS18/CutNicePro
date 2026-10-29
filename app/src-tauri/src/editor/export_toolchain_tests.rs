use super::*;
use std::{
    fs,
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, UNIX_EPOCH},
};

struct Lab(PathBuf);

impl Lab {
    fn new() -> Self {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.tooling/test-output")
            .join(format!("toolchain-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path.canonicalize().unwrap())
    }

    fn tools(&self) -> Vec<PathBuf> {
        ["app", "probe", "ffmpeg"]
            .into_iter()
            .map(|name| {
                let path = self.0.join(name);
                fs::write(&path, name.as_bytes()).unwrap();
                path
            })
            .collect()
    }
}

impl Drop for Lab {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn unchanged_stamps_reuse_the_exact_original_digest_without_reading_binary_again() {
    let lab = Lab::new();
    let paths = lab.tools();
    let cache = FingerprintCache::default();
    let control = ProcessControl::default();
    let calls = AtomicUsize::new(0);
    let first = cache
        .fingerprint(&paths, &control, |sources, control| {
            calls.fetch_add(1, Ordering::SeqCst);
            digest_sources(sources, control)
        })
        .unwrap();
    let second = cache
        .fingerprint(&paths, &control, |sources, control| {
            calls.fetch_add(1, Ordering::SeqCst);
            digest_sources(sources, control)
        })
        .unwrap();
    let mut original = Sha256::new();
    original.update(b"editor-final-export-v1");
    for path in &paths {
        original.update(fs::read(path).unwrap());
    }
    assert_eq!(first, format!("{:x}", original.finalize()));
    assert_eq!(first, second);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn timestamp_size_and_replacement_each_trigger_a_fresh_hash() {
    let lab = Lab::new();
    let paths = lab.tools();
    let cache = FingerprintCache::default();
    let control = ProcessControl::default();
    let calls = AtomicUsize::new(0);
    let hash = |sources: &mut [SourceGuard], control: &ProcessControl| {
        calls.fetch_add(1, Ordering::SeqCst);
        digest_sources(sources, control)
    };
    let first = cache.fingerprint(&paths, &control, hash).unwrap();
    let stamp = SourceGuard::open(&paths[0]).unwrap().stamp().clone();
    let original_time = UNIX_EPOCH + Duration::from_nanos(stamp.modified_ns);
    let file = fs::OpenOptions::new().write(true).open(&paths[0]).unwrap();
    file.set_times(fs::FileTimes::new().set_modified(original_time + Duration::from_secs(5)))
        .unwrap();
    drop(file);
    assert_eq!(first, cache.fingerprint(&paths, &control, hash).unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    fs::write(&paths[1], b"changed-size").unwrap();
    let second = cache.fingerprint(&paths, &control, hash).unwrap();
    assert_ne!(first, second);
    assert_eq!(calls.load(Ordering::SeqCst), 3);
    let replacement = lab.0.join("replacement");
    fs::write(&replacement, b"ffmpeg").unwrap();
    let old_stamp = SourceGuard::open(&paths[2]).unwrap().stamp().clone();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&replacement)
        .unwrap();
    file.set_times(
        fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_nanos(old_stamp.modified_ns)),
    )
    .unwrap();
    drop(file);
    fs::remove_file(&paths[2]).unwrap();
    fs::rename(replacement, &paths[2]).unwrap();
    assert_eq!(second, cache.fingerprint(&paths, &control, hash).unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 4);
}

#[test]
fn missing_binary_cannot_reuse_an_earlier_fingerprint() {
    let lab = Lab::new();
    let paths = lab.tools();
    let cache = FingerprintCache::default();
    let control = ProcessControl::default();
    cache.fingerprint(&paths, &control, digest_sources).unwrap();
    fs::remove_file(&paths[1]).unwrap();
    assert!(cache.fingerprint(&paths, &control, digest_sources).is_err());
}

#[test]
fn cancelled_hits_and_calculations_do_not_publish_fingerprints() {
    let lab = Lab::new();
    let paths = lab.tools();
    let cache = FingerprintCache::default();
    let cancelled = ProcessControl::default();
    cancelled.cancel();
    assert!(cache
        .fingerprint(&paths, &cancelled, digest_sources)
        .is_err());
    let control = ProcessControl::default();
    assert!(cache
        .fingerprint(&paths, &control, |sources, control| {
            let value = digest_sources(sources, control)?;
            control.cancel();
            Ok(value)
        })
        .is_err());
    let resumed = ProcessControl::default();
    let calls = AtomicUsize::new(0);
    cache
        .fingerprint(&paths, &resumed, |sources, control| {
            calls.fetch_add(1, Ordering::SeqCst);
            digest_sources(sources, control)
        })
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    resumed.cancel();
    assert!(cache.fingerprint(&paths, &resumed, digest_sources).is_err());
}

#[test]
fn hashing_does_not_hold_the_cache_mutex() {
    let lab = Lab::new();
    let paths = lab.tools();
    let cache = FingerprintCache::default();
    cache
        .fingerprint(&paths, &ProcessControl::default(), |sources, control| {
            assert!(cache.entry.try_lock().is_ok());
            digest_sources(sources, control)
        })
        .unwrap();
}
