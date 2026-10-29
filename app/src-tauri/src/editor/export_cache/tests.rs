use super::*;
use crate::media_source::{FileIdentity, SourceStamp};
use crate::transcription::process::ProcessControl;
use serde_json::json;
use std::{collections::BTreeMap, fs, io::Read, path::PathBuf};

struct Lab(PathBuf);

impl Lab {
    fn new() -> Self {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.tooling/test-output")
            .join(format!("export-cache-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path.canonicalize().unwrap())
    }

    fn source(&self, bytes: &[u8]) -> PathBuf {
        let path = self.0.join("published.mp4");
        fs::write(&path, bytes).unwrap();
        path
    }
}

impl Drop for Lab {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn document() -> super::super::types::Composition {
    serde_json::from_value(json!({
        "version":1,"revision":2,"fps":{"numerator":30,"denominator":1},
        "settings":{"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null},
        "assets":[],"tracks":[],"items":[]
    })).unwrap()
}

fn sources() -> BTreeMap<String, SourceStamp> {
    BTreeMap::from([(
        "asset".into(),
        SourceStamp {
            size_bytes: 9,
            modified_ns: 10,
            identity: FileIdentity {
                volume: 1,
                file: [2; 16],
            },
        },
    )])
}

fn sample_key() -> String {
    key(
        &document(),
        &sources(),
        "tools-fonts-sha",
        &json!({"quality":"high"}),
    )
    .unwrap()
}

fn small_cache(lab: &Lab, max_bytes: u64) -> Cache {
    let mut cache = Cache::open(&lab.0).unwrap();
    cache.policy.max_bytes = max_bytes;
    cache.policy.reserve_bytes = 0;
    cache
}

#[test]
fn cache_key_is_deterministic_and_covers_all_content_inputs() {
    let original = sample_key();
    assert_eq!(original.len(), 64);
    assert_eq!(original, sample_key());
    let mut changed = document();
    changed.settings["text"] = json!("caption edit");
    assert_ne!(
        original,
        key(
            &changed,
            &sources(),
            "tools-fonts-sha",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
    changed = document();
    changed.revision += 1;
    assert_ne!(
        original,
        key(
            &changed,
            &sources(),
            "tools-fonts-sha",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
    let mut changed_sources = sources();
    changed_sources.get_mut("asset").unwrap().modified_ns += 1;
    assert_ne!(
        original,
        key(
            &document(),
            &changed_sources,
            "tools-fonts-sha",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
    assert_ne!(
        original,
        key(
            &document(),
            &sources(),
            "new-tools",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
    assert_ne!(
        original,
        key(
            &document(),
            &sources(),
            "tools-fonts-sha",
            &json!({"quality":"small"})
        )
        .unwrap()
    );
}

#[test]
fn map_insertion_order_does_not_change_key() {
    let mut first = document();
    first.settings = serde_json::from_str(r#"{"a":1,"b":{"c":2,"d":3}}"#).unwrap();
    let mut second = first.clone();
    second.settings = serde_json::from_str(r#"{"b":{"d":3,"c":2},"a":1}"#).unwrap();
    assert_eq!(
        key(&first, &sources(), "tool", &json!({})).unwrap(),
        key(&second, &sources(), "tool", &json!({})).unwrap()
    );
}

#[test]
fn completed_bytes_are_reused_independently_of_destination_name() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    cache.store(&sample_key(), &source, &control).unwrap();
    fs::rename(&source, lab.0.join("renamed-export.mp4")).unwrap();
    let mut hit = cache.lookup(&sample_key(), &control).unwrap().unwrap();
    let mut bytes = Vec::new();
    hit.file.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, b"final-mp4");
    assert_eq!(hit.bytes, 9);
    assert_eq!(hit.sha256.len(), 64);
}

#[test]
fn corruption_missing_and_uncompleted_entries_are_misses() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let control = ProcessControl::default();
    let key = sample_key();
    let source = lab.source(b"final-mp4");
    cache.store(&key, &source, &control).unwrap();
    fs::write(cache.root.join(format!("{key}.mp4")), b"different").unwrap();
    assert!(cache.lookup(&key, &control).unwrap().is_none());
    cache.store(&key, &source, &control).unwrap();
    fs::remove_file(cache.root.join(format!("{key}.mp4"))).unwrap();
    assert!(cache.lookup(&key, &control).unwrap().is_none());
    cache.store(&key, &source, &control).unwrap();
    let path = cache.root.join(format!("{key}.json"));
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["completed"] = json!(false);
    fs::write(path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    assert!(cache.lookup(&key, &control).unwrap().is_none());
}

#[test]
fn cancellation_never_stores_or_returns_an_entry() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    cache.store(&sample_key(), &source, &control).unwrap();
    control.cancel();
    assert!(cache.lookup(&sample_key(), &control).is_err());
    let another = "b".repeat(64);
    assert!(cache.store(&another, &source, &control).is_err());
    assert!(!cache.root.join(format!("{another}.json")).exists());
}

#[test]
fn oversize_and_insufficient_reserve_do_not_store() {
    let lab = Lab::new();
    let mut cache = small_cache(&lab, 8);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    cache.store(&sample_key(), &source, &control).unwrap();
    assert!(cache.lookup(&sample_key(), &control).unwrap().is_none());
    cache.policy.max_bytes = 10000;
    cache.policy.reserve_bytes = u64::MAX;
    cache.store(&sample_key(), &source, &control).unwrap();
    assert!(cache.lookup(&sample_key(), &control).unwrap().is_none());
}

#[test]
fn quota_evicts_the_least_recently_used_entry() {
    let lab = Lab::new();
    let mut cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    let first = "a".repeat(64);
    let second = "b".repeat(64);
    let third = "c".repeat(64);
    cache.store(&first, &source, &control).unwrap();
    cache.store(&second, &source, &control).unwrap();
    cache.policy.max_bytes = TRANSACTION_RESERVE
        + fs::read_dir(&cache.root)
            .unwrap()
            .map(|entry| entry.unwrap().metadata().unwrap().len())
            .sum::<u64>();
    let path = cache.root.join(format!("{second}.json"));
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["accessedMs"] = json!(0);
    fs::write(path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    drop(cache.lookup(&first, &control).unwrap().unwrap());
    cache.store(&third, &source, &control).unwrap();
    assert!(cache.lookup(&first, &control).unwrap().is_some());
    assert!(cache.lookup(&second, &control).unwrap().is_none());
    assert!(cache.lookup(&third, &control).unwrap().is_some());
    assert_eq!(fs::read(&source).unwrap(), b"final-mp4");
}

#[test]
fn expiration_uses_creation_age_and_preserves_foreign_files() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    let key = sample_key();
    cache.store(&key, &source, &control).unwrap();
    let path = cache.root.join(format!("{key}.json"));
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["createdMs"] = json!(0);
    fs::write(&path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    fs::write(cache.root.join("personal.mp4"), b"keep").unwrap();
    assert!(cache.lookup(&key, &control).unwrap().is_none());
    cache.store(&"b".repeat(64), &source, &control).unwrap();
    assert!(!path.exists());
    assert_eq!(fs::read(cache.root.join("personal.mp4")).unwrap(), b"keep");
}

#[test]
fn invalid_keys_cannot_escape_the_owned_directory() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    for key in ["../published", "/tmp/escape", "abc", &"A".repeat(64)] {
        assert!(cache.lookup(key, &control).is_err());
        assert!(cache.store(key, &source, &control).is_err());
    }
    assert_eq!(fs::read(source).unwrap(), b"final-mp4");
}

#[test]
fn busy_lock_is_a_miss_and_open_reader_remains_valid() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let source = lab.source(b"final-mp4");
    let control = ProcessControl::default();
    let key = sample_key();
    cache.store(&key, &source, &control).unwrap();
    let mut reader = cache.lookup(&key, &control).unwrap().unwrap();
    let other = Cache::open(&lab.0).unwrap();
    assert!(other.lookup(&key, &control).unwrap().is_none());
    other.store(&"b".repeat(64), &source, &control).unwrap();
    assert!(!cache.root.join(format!("{}.json", "b".repeat(64))).exists());
    let mut content = String::new();
    reader.file.read_to_string(&mut content).unwrap();
    assert_eq!(content, "final-mp4");
    drop(reader);
    assert!(cache.lookup(&key, &control).unwrap().is_some());
}

#[test]
fn source_identity_and_size_each_invalidate_the_key() {
    let original = sample_key();
    let mut changed = sources();
    changed.get_mut("asset").unwrap().identity.file[0] += 1;
    assert_ne!(
        original,
        key(
            &document(),
            &changed,
            "tools-fonts-sha",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
    changed = sources();
    changed.get_mut("asset").unwrap().size_bytes += 1;
    assert_ne!(
        original,
        key(
            &document(),
            &changed,
            "tools-fonts-sha",
            &json!({"quality":"high"})
        )
        .unwrap()
    );
}

#[test]
fn malformed_manifest_and_unrelated_directories_do_not_resolve_external_paths() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let control = ProcessControl::default();
    let source = lab.source(b"final-mp4");
    let key = sample_key();
    cache.store(&key, &source, &control).unwrap();
    let path = cache.root.join(format!("{key}.json"));
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    value["path"] = json!(source);
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(cache.lookup(&key, &control).unwrap().is_none());
    let nested = cache.root.join("nested");
    fs::create_dir(&nested).unwrap();
    fs::write(nested.join(format!("{}.mp4", "c".repeat(64))), b"keep").unwrap();
    cache.store(&"b".repeat(64), &source, &control).unwrap();
    assert_eq!(fs::read(source).unwrap(), b"final-mp4");
    assert_eq!(
        fs::read(nested.join(format!("{}.mp4", "c".repeat(64)))).unwrap(),
        b"keep"
    );
}

#[test]
fn links_are_never_cache_hits_or_cleanup_targets() {
    let lab = Lab::new();
    let cache = small_cache(&lab, 10000);
    let control = ProcessControl::default();
    let source = lab.source(b"final-mp4");
    let key = sample_key();
    cache.store(&key, &source, &control).unwrap();
    let target = cache.root.join(format!("{key}.mp4"));
    fs::remove_file(&target).unwrap();
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_file(&source, &target);
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(&source, &target);
    if let Err(error) = result {
        assert!(
            error.raw_os_error() == Some(1314)
                || matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Unsupported
                ),
            "{error}"
        );
        eprintln!("Link fixture unavailable: {error}");
        return;
    }
    assert!(cache.lookup(&key, &control).unwrap().is_none());
    let _ = cache.store(&"b".repeat(64), &source, &control);
    assert!(fs::symlink_metadata(&target)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(&source).unwrap(), b"final-mp4");
    fs::remove_file(&target).unwrap();
    let linked_base = lab.0.join("linked-base");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&cache.root, &linked_base).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&cache.root, &linked_base).unwrap();
    assert!(Cache::open(&linked_base).is_err());
    fs::remove_dir(&linked_base)
        .or_else(|_| fs::remove_file(&linked_base))
        .unwrap();
}
