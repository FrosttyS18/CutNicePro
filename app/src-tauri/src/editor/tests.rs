use super::store::EditorStore;
use super::types::Composition;
use serde_json::json;
use std::path::PathBuf;

fn fixture() -> Composition {
    serde_json::from_value(json!({
        "version":1,"revision":0,"fps":{"numerator":30,"denominator":1},
        "settings":{"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null},
        "assets":[],"items":[],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}]
    })).unwrap()
}

#[test]
fn local_caption_override_preserves_word_times_and_legacy_text() {
    use super::types::CaptionEdit;
    let edited: CaptionEdit = serde_json::from_value(
        json!({"text":"Olá editado","words":[{"text":"Olá","start":10.0,"end":11.0}]}),
    )
    .unwrap();
    assert!(edited.validate());
    let invalid: CaptionEdit = serde_json::from_value(
        json!({"text":"Olá","words":[{"text":"Olá","start":11.0,"end":10.0}]}),
    )
    .unwrap();
    assert!(!invalid.validate());
    let legacy: CaptionEdit = serde_json::from_value(json!("Legenda antiga")).unwrap();
    assert!(legacy.validate());
    assert!(serde_json::from_value::<CaptionEdit>(json!({"text":"x","secret":"ignored"})).is_err());
}

fn directory() -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[test]
fn empty_composition_is_valid_and_unknown_contract_fields_are_rejected() {
    let document = fixture();
    assert!(document.validate().is_ok());
    let mut invalid = serde_json::to_value(document).unwrap();
    invalid["sourceSeconds"] = json!(1);
    assert!(serde_json::from_value::<Composition>(invalid).is_err());
}

#[test]
fn atomic_save_reopen_revision_and_conflict_preserve_previous_document() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let saved = store.save(&project, None, fixture(), 0).unwrap();
    assert_eq!(saved.document.revision, 1);
    let reopened = EditorStore::open(&base).unwrap().load(&project).unwrap();
    assert_eq!(reopened.project.unwrap().document.revision, 1);
    assert!(store.save(&project, None, fixture(), 0).is_err());
    assert_eq!(
        store
            .load(&project)
            .unwrap()
            .project
            .unwrap()
            .document
            .revision,
        1
    );
    assert_eq!(
        std::fs::read_dir(base.join("cutnicepro/editor"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "json"))
            .count(),
        1
    );
}

#[test]
fn save_respects_the_project_file_lock_before_reading_revision() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    EditorStore::open(&base).unwrap();
    let lock = std::fs::File::create(
        base.join("cutnicepro/editor")
            .join(format!("{project}.lock")),
    )
    .unwrap();
    fs2::FileExt::lock_exclusive(&lock).unwrap();
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (result_tx, result_rx) = std::sync::mpsc::channel();
    let writer = std::thread::spawn(move || {
        started_tx.send(()).unwrap();
        result_tx
            .send(
                EditorStore::open(&base)
                    .unwrap()
                    .save(&project, None, fixture(), 0)
                    .is_ok(),
            )
            .unwrap();
    });
    started_rx.recv().unwrap();
    let early = result_rx.recv_timeout(std::time::Duration::from_millis(150));
    fs2::FileExt::unlock(&lock).unwrap();
    let blocked = early.is_err();
    let saved = early.unwrap_or_else(|_| {
        result_rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .unwrap()
    });
    writer.join().unwrap();
    assert!(
        blocked,
        "gravação ignorou o bloqueio compartilhado entre processos"
    );
    assert!(saved);
}

#[test]
fn clip_save_keeps_id_and_commits_manual_origin_with_document() {
    let base = directory();
    let store = EditorStore::open(&base).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let clip = "c".repeat(64);
    let saved = store.save(&project, Some(&clip), fixture(), 0).unwrap();
    assert!(saved.manually_edited);
    let state = store.load(&project).unwrap();
    assert_eq!(state.clips.len(), 1);
    assert_eq!(state.clips[&clip].document.revision, 1);
    assert!(state.project.is_none());
}

#[test]
fn recovery_never_replaces_saved_document_and_path_escape_is_rejected() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    store.save(&project, None, fixture(), 0).unwrap();
    let mut draft = fixture();
    draft.settings["text"] = json!("Texto ainda não salvo");
    store.save_recovery(&project, None, draft, 1).unwrap();
    let recovered = store.recovery(&project, None).unwrap().unwrap();
    assert_eq!(recovered.base_revision, 1);
    assert_eq!(recovered.document.settings["text"], "Texto ainda não salvo");
    assert_eq!(
        store
            .load(&project)
            .unwrap()
            .project
            .unwrap()
            .document
            .settings["text"],
        ""
    );
    assert!(store.load("../escape").is_err());
    assert!(store
        .save(&project, Some("../escape"), fixture(), 0)
        .is_err());
    store.discard_recovery(&project, None).unwrap();
    assert!(store.recovery(&project, None).unwrap().is_none());
}

fn manual_fixture() -> Composition {
    let mut document = serde_json::to_value(fixture()).unwrap();
    document["assets"] = json!([{"id":"image","mediaId":"m","name":"Imagem","kind":"image","durationUs":1000000,"width":640,"height":360,"transcript":[]}]);
    document["items"] = json!([{"id":"item","trackId":"V1","assetId":"image","kind":"image","startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"main","followsMain":true,"settings":document["settings"],"captionEdits":{}}]);
    serde_json::from_value(document).unwrap()
}

#[test]
fn new_manual_clip_commits_metadata_and_document_atomically_and_preserves_identity() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let created = store
        .create_clip(&project, "Clipe manual", manual_fixture())
        .unwrap();
    assert_eq!(created.id.len(), 64);
    assert_eq!(created.snapshot.origin.as_deref(), Some("manual"));
    assert_eq!(created.snapshot.title.as_deref(), Some("Clipe manual"));
    assert!(!created.snapshot.manually_edited);
    let original_creation = created.snapshot.created_at_ms;
    let mut edited = created.snapshot.document.clone();
    edited.settings["text"] = json!("Edição salva");
    let saved = store.save(&project, Some(&created.id), edited, 1).unwrap();
    assert!(saved.manually_edited);
    assert_eq!(saved.created_at_ms, original_creation);
    assert_eq!(saved.title, created.snapshot.title);
    let state = EditorStore::open(&base).unwrap().load(&project).unwrap();
    assert_eq!(state.clips.len(), 1);
    assert_eq!(state.clips[&created.id].document.revision, 2);
    assert!(state.project.is_none());
}

#[test]
fn no_change_save_does_not_mark_manual_clip_edited_or_refresh_creation() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let created = store
        .create_clip(&project, "Manual", manual_fixture())
        .unwrap();
    let saved = store
        .save(
            &project,
            Some(&created.id),
            created.snapshot.document.clone(),
            1,
        )
        .unwrap();
    assert!(!saved.manually_edited);
    assert_eq!(saved.document.revision, 1);
    assert_eq!(saved.created_at_ms, created.snapshot.created_at_ms);
    assert!(store.create_clip(&project, " ", manual_fixture()).is_err());
    assert!(store.create_clip(&project, "Vazio", fixture()).is_err());
}

#[test]
fn manual_delete_and_restore_preserve_document_and_original_creation() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let created = store
        .create_clip(&project, "Manual", manual_fixture())
        .unwrap();
    let deleted = store
        .update_clip_metadata(&project, &created.id, Some("approved"), Some(true))
        .unwrap();
    assert_eq!(deleted.clips[&created.id].deleted, Some(true));
    let restored = store
        .update_clip_metadata(&project, &created.id, None, Some(false))
        .unwrap();
    assert_eq!(restored.clips[&created.id].deleted, Some(false));
    assert_eq!(
        restored.clips[&created.id].review.as_deref(),
        Some("approved")
    );
    assert_eq!(
        restored.clips[&created.id].created_at_ms,
        created.snapshot.created_at_ms
    );
    assert!(store
        .update_clip_metadata(&project, &created.id, Some("invalid"), None)
        .is_err());
}

#[test]
fn project_editor_cleanup_is_idempotent_and_preserves_other_projects() {
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let other = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    store.save(&project, None, fixture(), 0).unwrap();
    store.save(&other, None, fixture(), 0).unwrap();
    store.save_recovery(&project, None, fixture(), 1).unwrap();
    store
        .save_recovery(&project, Some(&"a".repeat(64)), fixture(), 0)
        .unwrap();
    store.save_recovery(&other, None, fixture(), 1).unwrap();
    store.remove_project(&project).unwrap();
    store.remove_project(&project).unwrap();
    assert!(store.load(&project).unwrap().project.is_none());
    assert!(store.recovery(&project, None).unwrap().is_none());
    assert!(store
        .recovery(&project, Some(&"a".repeat(64)))
        .unwrap()
        .is_none());
    assert!(store.load(&other).unwrap().project.is_some());
    assert!(store.recovery(&other, None).unwrap().is_some());
}

#[test]
fn batch_conflict_preserves_every_document_and_success_keeps_metadata() {
    use super::store::ClipDraft;
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let first = store
        .create_clip(&project, "Primeiro", manual_fixture())
        .unwrap();
    let second = store
        .create_clip(&project, "Segundo", manual_fixture())
        .unwrap();
    let path = base
        .join("cutnicepro/editor")
        .join(format!("{project}.json"));
    let before = std::fs::read(&path).unwrap();
    let mut changed_a = first.snapshot.document.clone();
    changed_a.settings["captionModel"] = json!(3);
    let mut changed_b = second.snapshot.document.clone();
    changed_b.settings["captionModel"] = json!(3);
    let stale = ClipDraft {
        clip_id: second.id.clone(),
        expected_revision: 0,
        document: changed_b.clone(),
    };
    assert!(store
        .save_batch(
            &project,
            Some(&first.id),
            changed_a.clone(),
            1,
            vec![stale],
            true
        )
        .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let saved = store
        .save_batch(
            &project,
            Some(&first.id),
            changed_a,
            1,
            vec![ClipDraft {
                clip_id: second.id.clone(),
                expected_revision: 1,
                document: changed_b,
            }],
            true,
        )
        .unwrap();
    assert_eq!(saved.snapshot.unwrap().document.revision, 2);
    assert_eq!(saved.related[&second.id].document.revision, 2);
    let state = store.load(&project).unwrap();
    assert_eq!(state.clips.len(), 2);
    assert_eq!(
        state.clips[&second.id].created_at_ms,
        second.snapshot.created_at_ms
    );
    assert_eq!(state.clips[&first.id].title, first.snapshot.title);
}

#[test]
fn batch_with_unchanged_legacy_active_does_not_create_a_fake_manual_edit() {
    use super::store::ClipDraft;
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let second = store
        .create_clip(&project, "Segundo", manual_fixture())
        .unwrap();
    let mut changed = second.snapshot.document.clone();
    changed.settings["captionModel"] = json!(3);
    let active_id = "a".repeat(64);
    let result = store
        .save_batch(
            &project,
            Some(&active_id),
            manual_fixture(),
            0,
            vec![ClipDraft {
                clip_id: second.id.clone(),
                expected_revision: 1,
                document: changed,
            }],
            false,
        )
        .unwrap();
    assert!(result.snapshot.is_none());
    assert!(!store.load(&project).unwrap().clips.contains_key(&active_id));
}

#[test]
fn recovery_batch_keeps_baselines_and_accepts_old_recovery_without_related() {
    use super::store::{Recovery, RecoveryClipDraft};
    let base = directory();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&base).unwrap();
    let id = "b".repeat(64);
    store
        .save_recovery_batch(
            &project,
            None,
            fixture(),
            0,
            vec![RecoveryClipDraft {
                clip_id: id.clone(),
                expected_revision: 0,
                document: manual_fixture(),
                base_document: Some(manual_fixture()),
            }],
        )
        .unwrap();
    let restored = store.recovery(&project, None).unwrap().unwrap();
    assert_eq!(restored.related[0].clip_id, id);
    assert!(restored.related[0].base_document.is_some());
    let old: Recovery =
        serde_json::from_value(json!({"baseRevision":0,"document":fixture(),"updatedAtMs":1}))
            .unwrap();
    assert!(old.related.is_empty());
}
