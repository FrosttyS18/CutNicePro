use super::*;
use std::sync::atomic::AtomicBool;

pub(crate) struct Fixture(pub PathBuf);
impl Fixture {
    pub(crate) fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-reference-import")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    pub(crate) fn store(&self) -> MediaStore {
        MediaStore::open(&self.0).unwrap()
    }
    pub(crate) fn source(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn register(store: &MediaStore, source: &Path, project: &str) -> MediaEntry {
    let checked = crate::media_import::verify_reference(
        source,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    store
        .publish_reference(&checked, "mp4", "vídeo original.mp4", project, None)
        .unwrap()
}

#[test]
fn reference_has_real_digest_and_no_managed_copy_after_reload() {
    let fixture = Fixture::new();
    let source = fixture.source("vídeo original.mp4", b"abc");
    let store = fixture.store();
    let entry = register(&store, &source, "p1");
    assert_eq!(
        entry.sha256,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert!(fs::read_dir(store.files_dir()).unwrap().next().is_none());
    let reopened = fixture.store();
    let resolved = reopened.resolve(&entry.media_id, Some("p1")).unwrap();
    assert_eq!(fs::read(&resolved.path).unwrap(), b"abc");
    assert!(reopened.resolve(&entry.media_id, Some("wrong")).is_err());
    let dto = reopened.dto(&entry).unwrap();
    let json = serde_json::to_value(dto).unwrap();
    assert_eq!(json["storageKind"], "reference");
    assert_eq!(json["availability"], "available");
    assert!(json.get("storage").is_none());
    assert!(!json
        .to_string()
        .contains(&fixture.0.to_string_lossy().to_string()));
}

#[test]
fn deletion_of_shared_reference_never_removes_external_original() {
    let fixture = Fixture::new();
    let source = fixture.source("shared.mp4", b"original preserved");
    let store = fixture.store();
    let entry = register(&store, &source, "p1");
    store.link_project(&entry.media_id, "p2").unwrap();
    store.remove_project("p1").unwrap();
    assert!(store.resolve(&entry.media_id, Some("p2")).is_ok());
    store.remove_project("p2").unwrap();
    store.remove_project("p2").unwrap();
    store.reconcile(&[]).unwrap();
    assert!(store.get(&entry.media_id).unwrap().is_none());
    assert_eq!(fs::read(source).unwrap(), b"original preserved");
}

#[test]
fn changed_or_missing_reference_blocks_resolver_without_erasing_metadata() {
    let fixture = Fixture::new();
    let source = fixture.source("changed.mp4", b"abc");
    let store = fixture.store();
    let entry = register(&store, &source, "p1");
    fs::write(&source, b"different").unwrap();
    assert!(store.resolve(&entry.media_id, Some("p1")).is_err());
    assert_eq!(
        store.dto(&entry).unwrap().availability,
        crate::media_source::SourceAvailability::Changed
    );
    fs::remove_file(&source).unwrap();
    assert_eq!(
        store.dto(&entry).unwrap().availability,
        crate::media_source::SourceAvailability::Missing
    );
    assert!(store.get(&entry.media_id).unwrap().is_some());
}

#[test]
fn relink_accepts_only_identical_content_and_preserves_identity() {
    let fixture = Fixture::new();
    let source = fixture.source("original.mp4", b"abc");
    let store = fixture.store();
    let entry = register(&store, &source, "p1");
    store
        .store_analysis(
            &entry.media_id,
            MediaAnalysis {
                duration_ms: 1000,
                width: 160,
                height: 90,
                video_codec: "h264".into(),
                audio_codec: None,
                has_audio: false,
                fps: 30.0,
            },
        )
        .unwrap();
    fs::remove_file(source).unwrap();
    let candidate = fixture.source("renamed.mp4", b"abc");
    let checked = crate::media_import::verify_reference(
        &candidate,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    let relinked = store
        .relink_reference(&entry.media_id, "p1", &checked, "mp4")
        .unwrap();
    assert_eq!(relinked.media_id, entry.media_id);
    assert_eq!(relinked.sha256, entry.sha256);
    assert_eq!(relinked.analysis.as_ref().unwrap().duration_ms, 1000);
    let changed = fixture.source("other.mp4", b"wrong");
    let checked = crate::media_import::verify_reference(
        &changed,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    assert!(store
        .relink_reference(&entry.media_id, "p1", &checked, "mp4")
        .is_err());
    assert_eq!(
        fs::read(store.resolve(&entry.media_id, Some("p1")).unwrap().path).unwrap(),
        b"abc"
    );
}

#[test]
fn legacy_index_reloads_without_rewriting_or_moving_managed_media() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let hash = "a".repeat(64);
    let file = store.files_dir().join(format!("{hash}.mp4"));
    fs::write(&file, b"abc").unwrap();
    let raw = serde_json::json!({"entries":[{"mediaId":"legacy-media","sha256":hash,"sizeBytes":3,"ext":"mp4","originalName":"old.mp4","createdAtMs":123,"projectIds":["p1"],"analysis":null,"unavailable":false}]}).to_string();
    fs::write(store.index_path(), &raw).unwrap();
    let reopened = fixture.store();
    let source = reopened.resolve("legacy-media", Some("p1")).unwrap();
    assert!(matches!(source.entry.storage, MediaStorage::Managed));
    assert_eq!(source.entry.created_at_ms, 123);
    assert_eq!(fs::read_to_string(store.index_path()).unwrap(), raw);
    assert_eq!(fs::read(&source.path).unwrap(), b"abc");
}

#[test]
fn new_reference_import_preserves_an_existing_managed_copy_as_managed() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let source = fixture.source("original.mp4", b"abc");
    let part = store.files_dir().join("legacy.part");
    fs::write(&part, b"abc").unwrap();
    let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    let legacy = store
        .publish(&part, hash, 3, "mp4", "old.mp4", "old-project")
        .unwrap();
    let referenced = register(&store, &source, "new-project");
    assert!(matches!(referenced.storage, MediaStorage::Reference { .. }));
    assert_ne!(referenced.media_id, legacy.media_id);
    assert!(matches!(
        store.get(&legacy.media_id).unwrap().unwrap().storage,
        MediaStorage::Managed
    ));
    assert_eq!(
        fs::read(store.registered_path(&legacy).unwrap()).unwrap(),
        b"abc"
    );
    store.remove_project("new-project").unwrap();
    assert_eq!(fs::read(source).unwrap(), b"abc");
    assert!(store.resolve(&legacy.media_id, Some("old-project")).is_ok());
}

#[cfg(windows)]
#[test]
fn busy_external_writer_reports_inaccessible_and_preserves_metadata() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new();
    let source = fixture.source("busy.mp4", b"abc");
    let store = fixture.store();
    let entry = register(&store, &source, "p1");
    let _writer = fs::OpenOptions::new()
        .write(true)
        .share_mode(7)
        .open(source)
        .unwrap();
    assert_eq!(
        store.dto(&entry).unwrap().availability,
        crate::media_source::SourceAvailability::Inaccessible
    );
    assert!(store.resolve(&entry.media_id, Some("p1")).is_err());
    assert_eq!(
        store.get(&entry.media_id).unwrap().unwrap().sha256,
        entry.sha256
    );
}

#[test]
fn explicit_relink_repairs_missing_managed_media_as_a_reference_with_same_id() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let source = fixture.source("found.mp4", b"abc");
    let verified = crate::media_import::verify_reference(
        &source,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    let part = store.files_dir().join("legacy.part");
    fs::write(&part, b"abc").unwrap();
    let entry = store
        .publish(&part, &verified.sha256, 3, "mp4", "legacy.mp4", "p1")
        .unwrap();
    assert!(store
        .relink_reference(&entry.media_id, "p1", &verified, "mp4")
        .is_err());
    fs::remove_file(store.registered_path(&entry).unwrap()).unwrap();
    let relinked = store
        .relink_reference(&entry.media_id, "p1", &verified, "mp4")
        .unwrap();
    assert_eq!(relinked.media_id, entry.media_id);
    assert_eq!(relinked.sha256, entry.sha256);
    assert!(matches!(relinked.storage, MediaStorage::Reference { .. }));
    assert!(fs::read_dir(store.files_dir()).unwrap().next().is_none());
    store.remove_project("p1").unwrap();
    assert_eq!(fs::read(source).unwrap(), b"abc");
}

#[test]
fn native_dto_receipt_covers_legacy_reference_and_availability_without_private_paths() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let original = fixture.source("receipt original.mp4", b"abc");
    let reference = register(&store, &original, "p1");
    store
        .store_analysis(
            &reference.media_id,
            MediaAnalysis {
                duration_ms: 1000,
                width: 160,
                height: 90,
                video_codec: "h264".into(),
                audio_codec: Some("aac".into()),
                has_audio: true,
                fps: 30.0,
            },
        )
        .unwrap();
    let reference = store.get(&reference.media_id).unwrap().unwrap();
    let legacy_part = store.files_dir().join("receipt.part");
    fs::write(&legacy_part, b"xyz").unwrap();
    let legacy = store
        .publish(&legacy_part, &"b".repeat(64), 3, "mp4", "legacy.mp4", "p2")
        .unwrap();
    let mut legacy_json = serde_json::to_value(&legacy).unwrap();
    legacy_json.as_object_mut().unwrap().remove("storage");
    let raw = serde_json::json!({"entries":[legacy_json]}).to_string();
    let legacy_fixture = Fixture::new();
    let legacy_store = legacy_fixture.store();
    fs::write(legacy_store.index_path(), raw).unwrap();
    fs::write(
        legacy_store
            .files_dir()
            .join(format!("{}.{}", legacy.sha256, legacy.ext)),
        b"xyz",
    )
    .unwrap();
    let legacy_reloaded = legacy_store.get(&legacy.media_id).unwrap().unwrap();
    let mut receipt = serde_json::json!({
        "kind":"native-serialization-fixture",
        "managedLegacy":legacy_store.dto(&legacy_reloaded).unwrap(),
        "referenceAvailable":store.dto(&reference).unwrap(),
    });
    fs::write(&original, b"different content").unwrap();
    receipt["referenceChanged"] = serde_json::to_value(store.dto(&reference).unwrap()).unwrap();
    fs::remove_file(&original).unwrap();
    receipt["referenceMissing"] = serde_json::to_value(store.dto(&reference).unwrap()).unwrap();
    for key in [
        "managedLegacy",
        "referenceAvailable",
        "referenceChanged",
        "referenceMissing",
    ] {
        let entry = receipt[key].as_object().unwrap();
        for private in ["storage", "path", "stamp", "identity", "modifiedNs"] {
            assert!(!entry.contains_key(private));
        }
    }
    assert_eq!(receipt["referenceAvailable"]["availability"], "available");
    assert_eq!(receipt["referenceChanged"]["availability"], "changed");
    assert_eq!(receipt["referenceMissing"]["availability"], "missing");
    assert!(!receipt
        .to_string()
        .contains(&fixture.0.to_string_lossy().to_string()));
    let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let path = workspace.join(".tooling/test-output/m7a-media-dto.json");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    crate::file_output::atomic_write(&path, |file| {
        use std::io::Write;
        file.write_all(serde_json::to_string_pretty(&receipt).unwrap().as_bytes())
            .map_err(|error| error.to_string())
    })
    .unwrap();
}

#[test]
fn shared_store_preserves_concurrent_import_and_cross_project_links_after_reload() {
    let fixture = Fixture::new();
    let store = std::sync::Arc::new(fixture.store());
    let first = fixture.source("one.mp4", b"abc");
    let second = fixture.source("two.mp4", b"xyz");
    let first_entry = register(&store, &first, "first-project");
    let second_verified = crate::media_import::verify_reference(
        &second,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    let start = std::sync::Barrier::new(2);
    std::thread::scope(|scope| {
        scope.spawn(|| {
            start.wait();
            for index in 0..16 {
                store
                    .link_project(&first_entry.media_id, &format!("paste-{index}"))
                    .unwrap();
            }
        });
        scope.spawn(|| {
            start.wait();
            for index in 0..16 {
                store
                    .publish_reference(
                        &second_verified,
                        "mp4",
                        "two.mp4",
                        &format!("import-{index}"),
                        None,
                    )
                    .unwrap();
            }
        });
    });
    let reloaded = fixture.store();
    let entries = reloaded.entries().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(
        reloaded
            .get(&first_entry.media_id)
            .unwrap()
            .unwrap()
            .project_ids
            .len(),
        17
    );
    let second = entries
        .iter()
        .find(|entry| entry.media_id != first_entry.media_id)
        .unwrap();
    assert_eq!(second.project_ids.len(), 16);
    assert!(reloaded
        .resolve(&first_entry.media_id, Some("paste-15"))
        .is_ok());
    assert!(reloaded
        .resolve(&second.media_id, Some("import-15"))
        .is_ok());
}

#[test]
fn reference_ownership_rejects_generated_sources_before_registering() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let part = store.files_dir().join("legacy.part");
    fs::write(&part, b"abc").unwrap();
    let legacy = store
        .publish(
            &part,
            &"a".repeat(64),
            3,
            "mp4",
            "legacy.mp4",
            "old-project",
        )
        .unwrap();
    let mut paths = vec![store.registered_path(&legacy).unwrap()];
    for folder in ["previews", "render-jobs", "transcription-cache"] {
        let folder = fixture.0.join("cutnicepro").join(folder);
        fs::create_dir_all(&folder).unwrap();
        let path = folder.join("temporary.mp4");
        fs::write(&path, b"abc").unwrap();
        paths.push(path);
    }
    #[cfg(windows)]
    {
        let alias = fixture.0.join("generated-alias");
        let output = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(alias.to_string_lossy().replace('/', "\\"))
            .arg(
                fixture
                    .0
                    .join("cutnicepro")
                    .to_string_lossy()
                    .replace('/', "\\"),
            )
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        paths.push(
            alias
                .join("media/files")
                .join(format!("{}.{}", legacy.sha256, legacy.ext)),
        );
    }
    for path in paths {
        let verified = crate::media_import::verify_reference(
            &path,
            &AtomicBool::new(false),
            &|_| {},
            std::time::Duration::from_secs(10),
        )
        .unwrap();
        let result =
            store.publish_reference(&verified, "mp4", "generated.mp4", "new-project", None);
        assert!(result.unwrap_err().contains("fora do armazenamento"));
        assert_eq!(store.entries().unwrap().len(), 1);
    }
}

#[test]
fn reference_ownership_preserves_external_hardlink_when_managed_link_is_deleted() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let part = store.files_dir().join("legacy.part");
    fs::write(&part, b"abc").unwrap();
    let legacy = store
        .publish(
            &part,
            &"a".repeat(64),
            3,
            "mp4",
            "legacy.mp4",
            "old-project",
        )
        .unwrap();
    let external = fixture.0.join("external-original.mp4");
    fs::hard_link(store.registered_path(&legacy).unwrap(), &external).unwrap();
    let reference = register(&store, &external, "new-project");
    store.remove_project("old-project").unwrap();
    assert_eq!(fs::read(&external).unwrap(), b"abc");
    assert!(store
        .resolve(&reference.media_id, Some("new-project"))
        .is_ok());
}
