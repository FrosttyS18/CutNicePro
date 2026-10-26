use super::*;
use crate::{
    clips::{
        store,
        types::{Clip, ClipCollection},
    },
    editor::{
        store::{ClipDraft, EditorStore, RecoveryClipDraft},
        types::Composition,
    },
};
use serde_json::json;

fn document() -> Composition {
    let settings = json!({"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"image","mediaId":"image","name":"original.png","kind":"image","durationUs":0,"width":160,"height":90,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"image","trackId":"V1","assetId":"image","kind":"image","startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":0,"groupId":"image","followsMain":true,"settings":settings,"captionEdits":{}}]})).unwrap()
}

struct Fixture {
    base: PathBuf,
    project: String,
    id: String,
}
impl Fixture {
    fn new() -> Self {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-clip-trash")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&base).unwrap();
        Self {
            base,
            project: uuid::Uuid::new_v4().to_string(),
            id: "a".repeat(64),
        }
    }
    fn ai(&self, deleted: bool, at: Option<u64>) -> ClipCollection {
        let clip: Clip = serde_json::from_value(json!({"id":self.id,"start":0,"end":1,"title":"Trecho","score":80,"reasons":[],"review":"pending","deleted":deleted,"deletedAtMs":at})).unwrap();
        let collection = ClipCollection {
            version: 1,
            media_id: "media".into(),
            transcript_hash: "hash".into(),
            engine: None,
            clips: vec![clip],
        };
        store::save(&self.base, &self.project, &collection, 10.0).unwrap();
        collection
    }
    fn editor(&self) -> EditorStore {
        EditorStore::open(&self.base).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn seven_days_has_an_exact_boundary_and_clock_reversal_is_safe() {
    assert!(!expired(100, 100 + RETENTION_MS - 1));
    assert!(expired(100, 100 + RETENTION_MS));
    assert!(!expired(100, 99));
    assert!(!expired(u64::MAX, 100));
}

#[test]
fn legacy_deletion_starts_a_persisted_grace_period_once() {
    let fixture = Fixture::new();
    fixture.ai(true, None);
    assert_eq!(
        cleanup_at(&fixture.base, &fixture.project, 1000).unwrap(),
        0
    );
    assert_eq!(
        store::read(&fixture.base, &fixture.project)
            .unwrap()
            .unwrap()
            .clips[0]
            .deleted_at_ms,
        Some(1000)
    );
    assert_eq!(
        cleanup_at(&fixture.base, &fixture.project, 1000 + RETENTION_MS - 1).unwrap(),
        0
    );
    assert_eq!(
        cleanup_at(&fixture.base, &fixture.project, 1000 + RETENTION_MS).unwrap(),
        1
    );
    assert!(store::read(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap()
        .clips
        .is_empty());
    assert_eq!(
        cleanup_at(&fixture.base, &fixture.project, 1000 + RETENTION_MS + 1).unwrap(),
        0
    );
}

#[test]
fn manual_clip_restore_and_redelete_restart_the_period() {
    let fixture = Fixture::new();
    let editor = fixture.editor();
    let created = editor
        .create_clip(&fixture.project, "Manual", document())
        .unwrap();
    let edited_at = created.snapshot.edited_at_ms;
    let created_at = created.snapshot.created_at_ms;
    set_deleted(&fixture.base, &fixture.project, &created.id, true, 1000).unwrap();
    set_deleted(&fixture.base, &fixture.project, &created.id, true, 2000).unwrap();
    assert_eq!(
        editor.load(&fixture.project).unwrap().clips[&created.id].deleted_at_ms,
        Some(1000)
    );
    set_deleted(&fixture.base, &fixture.project, &created.id, false, 3000).unwrap();
    let restored = editor.load(&fixture.project).unwrap();
    assert_eq!(restored.clips[&created.id].deleted, Some(false));
    assert_eq!(restored.clips[&created.id].deleted_at_ms, None);
    assert_eq!(restored.clips[&created.id].edited_at_ms, edited_at);
    assert_eq!(restored.clips[&created.id].created_at_ms, created_at);
    set_deleted(&fixture.base, &fixture.project, &created.id, true, 4000).unwrap();
    assert_eq!(
        editor.load(&fixture.project).unwrap().clips[&created.id].deleted_at_ms,
        Some(4000)
    );
}

#[test]
fn delete_restore_and_purge_keep_both_representations_consistent() {
    let fixture = Fixture::new();
    fixture.ai(false, None);
    let editor = fixture.editor();
    editor
        .save(&fixture.project, Some(&fixture.id), document(), 0)
        .unwrap();
    set_deleted(&fixture.base, &fixture.project, &fixture.id, true, 1000).unwrap();
    let edited = editor.load(&fixture.project).unwrap();
    let ai = store::read(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap();
    assert_eq!(edited.clips[&fixture.id].deleted_at_ms, Some(1000));
    assert_eq!(ai.clips[0].deleted_at_ms, Some(1000));
    set_deleted(&fixture.base, &fixture.project, &fixture.id, false, 1001).unwrap();
    assert_eq!(
        store::read(&fixture.base, &fixture.project)
            .unwrap()
            .unwrap()
            .clips[0]
            .deleted,
        Some(false)
    );
    assert!(purge(&fixture.base, &fixture.project, &fixture.id).is_err());
    set_deleted(&fixture.base, &fixture.project, &fixture.id, true, 1002).unwrap();
    purge(&fixture.base, &fixture.project, &fixture.id).unwrap();
    purge(&fixture.base, &fixture.project, &fixture.id).unwrap();
    assert!(editor.load(&fixture.project).unwrap().clips.is_empty());
    assert!(store::read(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap()
        .clips
        .is_empty());
}

#[test]
fn stale_jobs_saves_batches_and_recovery_cannot_resurrect_a_purged_id() {
    let fixture = Fixture::new();
    let old = fixture.ai(false, None);
    let editor = fixture.editor();
    let saved = editor
        .save(&fixture.project, Some(&fixture.id), document(), 0)
        .unwrap();
    set_deleted(&fixture.base, &fixture.project, &fixture.id, true, 1000).unwrap();
    purge(&fixture.base, &fixture.project, &fixture.id).unwrap();
    assert!(store::save(&fixture.base, &fixture.project, &old, 10.0).is_err());
    assert!(editor
        .save(
            &fixture.project,
            Some(&fixture.id),
            saved.document.clone(),
            1
        )
        .is_err());
    assert!(editor
        .save_batch(
            &fixture.project,
            None,
            document(),
            0,
            vec![ClipDraft {
                clip_id: fixture.id.clone(),
                expected_revision: 0,
                document: document()
            }],
            false
        )
        .is_err());
    assert!(editor
        .save_recovery(&fixture.project, Some(&fixture.id), document(), 0)
        .is_err());
    assert!(editor
        .save_recovery_batch(
            &fixture.project,
            None,
            document(),
            0,
            vec![RecoveryClipDraft {
                clip_id: fixture.id.clone(),
                expected_revision: 0,
                document: document(),
                base_document: None
            }]
        )
        .is_err());
    assert!(set_deleted(&fixture.base, &fixture.project, &fixture.id, false, 2000).is_err());
    assert!(editor.load(&fixture.project).unwrap().clips.is_empty());
    let mut new_round = old.clone();
    new_round.clips[0].id = "b".repeat(64);
    store::save(&fixture.base, &fixture.project, &new_round, 10.0).unwrap();
    assert_eq!(
        store::read(&fixture.base, &fixture.project)
            .unwrap()
            .unwrap()
            .clips[0]
            .id,
        "b".repeat(64)
    );
}

#[test]
fn purge_cleans_exclusive_derivatives_and_preserves_original_export_and_shared_cache() {
    let fixture = Fixture::new();
    fixture.ai(false, None);
    let editor = fixture.editor();
    editor
        .save(&fixture.project, Some(&fixture.id), document(), 0)
        .unwrap();
    editor
        .save_recovery(&fixture.project, Some(&fixture.id), document(), 1)
        .unwrap();
    editor
        .save_recovery_batch(
            &fixture.project,
            None,
            document(),
            0,
            vec![RecoveryClipDraft {
                clip_id: fixture.id.clone(),
                expected_revision: 1,
                document: document(),
                base_document: None,
            }],
        )
        .unwrap();
    let thumbnail = fixture
        .base
        .join("cutnicepro/editor-thumbnails")
        .join(&fixture.project)
        .join(format!("{}.json", fixture.id));
    fs::create_dir_all(thumbnail.parent().unwrap()).unwrap();
    fs::write(&thumbnail, b"exclusive").unwrap();
    let shared = fixture.base.join("cutnicepro/thumbnails/shared-0.jpg");
    fs::create_dir_all(shared.parent().unwrap()).unwrap();
    let originals = [
        fixture.base.join("original.png"),
        fixture.base.join("export.mp4"),
        shared,
    ];
    for path in &originals {
        fs::write(path, b"preserve").unwrap();
    }
    set_deleted(&fixture.base, &fixture.project, &fixture.id, true, 1000).unwrap();
    purge(&fixture.base, &fixture.project, &fixture.id).unwrap();
    assert!(!thumbnail.exists());
    assert!(editor
        .recovery(&fixture.project, Some(&fixture.id))
        .unwrap()
        .is_none());
    assert!(editor
        .recovery(&fixture.project, None)
        .unwrap()
        .unwrap()
        .related
        .is_empty());
    assert!(originals
        .iter()
        .all(|path| fs::read(path).unwrap() == b"preserve"));
}

#[test]
fn persistent_tombstone_hides_unfinished_cleanup_and_retry_is_safe() {
    let fixture = Fixture::new();
    fixture.ai(true, Some(1000));
    let editor = fixture.editor();
    editor
        .save(&fixture.project, Some(&fixture.id), document(), 0)
        .unwrap();
    let guard = lock(&fixture.base, &fixture.project).unwrap();
    save_tombstones(
        &fixture.base,
        &fixture.project,
        [fixture.id.clone()].into_iter().collect(),
    )
    .unwrap();
    drop(guard);
    assert!(store::read(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap()
        .clips
        .is_empty());
    assert!(editor.load(&fixture.project).unwrap().clips.is_empty());
    assert_eq!(
        store::read_raw(&fixture.base, &fixture.project)
            .unwrap()
            .unwrap()
            .clips
            .len(),
        1
    );
    purge(&fixture.base, &fixture.project, &fixture.id).unwrap();
    assert!(store::read_raw(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap()
        .clips
        .is_empty());
    let disk: serde_json::Value = serde_json::from_slice(
        &fs::read(
            fixture
                .base
                .join("cutnicepro/editor")
                .join(format!("{}.json", fixture.project)),
        )
        .unwrap(),
    )
    .unwrap();
    assert!(disk["clips"].as_object().unwrap().is_empty());
}

#[test]
fn corrupt_tombstones_and_invalid_targets_do_not_remove_data() {
    let fixture = Fixture::new();
    let old = fixture.ai(true, Some(1000));
    assert!(purge(&fixture.base, "../escape", &fixture.id).is_err());
    assert!(purge(&fixture.base, &fixture.project, "../escape").is_err());
    let target = path(&fixture.base, &fixture.project).unwrap();
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::write(&target, b"bad").unwrap();
    assert!(cleanup_at(&fixture.base, &fixture.project, 1000 + RETENTION_MS).is_err());
    assert!(store::save(&fixture.base, &fixture.project, &old, 10.0).is_err());
    assert_eq!(
        store::read_raw(&fixture.base, &fixture.project)
            .unwrap()
            .unwrap()
            .clips
            .len(),
        1
    );
}

#[test]
fn a_blocked_collection_writer_observes_permanent_deletion_before_publication() {
    let fixture = Fixture::new();
    let old = fixture.ai(false, None);
    let guard = lock(&fixture.base, &fixture.project).unwrap();
    let base = fixture.base.clone();
    let project = fixture.project.clone();
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (result_tx, result_rx) = std::sync::mpsc::channel();
    let writer = std::thread::spawn(move || {
        started_tx.send(()).unwrap();
        result_tx
            .send(store::save(&base, &project, &old, 10.0))
            .unwrap();
    });
    started_rx.recv().unwrap();
    let early = result_rx.recv_timeout(std::time::Duration::from_millis(150));
    save_tombstones(
        &fixture.base,
        &fixture.project,
        [fixture.id.clone()].into_iter().collect(),
    )
    .unwrap();
    drop(guard);
    let blocked = early.is_err();
    let outcome = early.unwrap_or_else(|_| {
        result_rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .unwrap()
    });
    writer.join().unwrap();
    assert!(blocked, "a coleção ignorou o mesmo lock usado pelo editor");
    assert!(outcome.is_err());
    assert!(store::read(&fixture.base, &fixture.project)
        .unwrap()
        .unwrap()
        .clips
        .is_empty());
}
