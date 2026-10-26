use super::{
    manual_clip_contract_tests::fixture, manual_commands::create_clip_with_media,
    store::EditorStore,
};
use crate::media_store::{reference_tests::Fixture, MediaStore};
use std::{sync::atomic::AtomicBool, time::Duration};

fn register(media: &MediaStore, source: &std::path::Path, project: &str) -> String {
    let verified = crate::media_import::verify_reference(
        source,
        &AtomicBool::new(false),
        &|_| {},
        Duration::from_secs(1),
    )
    .unwrap();
    media
        .publish_reference(&verified, "mp4", "source.mp4", project, None)
        .unwrap()
        .media_id
}

#[test]
fn invalid_manual_clip_requests_leave_media_links_and_saved_bytes_unchanged() {
    for case in [
        "audio",
        "caption",
        "empty",
        "empty-title",
        "long-title",
        "invalid-document",
    ] {
        let directory = Fixture::new();
        let source = directory.source("source.mp4", b"fixture original preserved");
        let media = directory.store();
        let source_project = uuid::Uuid::new_v4().to_string();
        let target = uuid::Uuid::new_v4().to_string();
        let media_id = register(&media, &source, &source_project);
        let editor = EditorStore::open(&directory.0).unwrap();
        editor.save(&target, None, fixture(&[]), 0).unwrap();
        let kinds = match case {
            "audio" => vec!["audio"],
            "caption" => vec!["caption"],
            "empty" => vec![],
            _ => vec!["video"],
        };
        let mut document = fixture(&kinds);
        document.assets.retain(|asset| asset.id == "source");
        document.assets[0].media_id = media_id.clone();
        if case == "invalid-document" {
            document.items[0].asset_id = "missing".into();
        }
        let title = match case {
            "empty-title" => String::new(),
            "long-title" => "x".repeat(121),
            _ => "Clipe".into(),
        };
        let index = media.files_dir().parent().unwrap().join("index.json");
        let editor_path = directory
            .0
            .join("cutnicepro/editor")
            .join(format!("{target}.json"));
        let before_index = std::fs::read(&index).unwrap();
        let before_editor = std::fs::read(&editor_path).unwrap();
        assert!(create_clip_with_media(&editor, &media, &target, &title, document).is_err());
        assert_eq!(
            std::fs::read(&index).unwrap(),
            before_index,
            "A requisição {case} alterou os vínculos antes de ser rejeitada"
        );
        assert_eq!(std::fs::read(&editor_path).unwrap(), before_editor);
        let reopened = directory.store().get(&media_id).unwrap().unwrap();
        assert_eq!(reopened.project_ids, vec![source_project]);
        assert_eq!(
            std::fs::read(&source).unwrap(),
            b"fixture original preserved"
        );
        assert!(std::fs::read_dir(media.files_dir())
            .unwrap()
            .next()
            .is_none());
    }
}

#[test]
fn valid_manual_clip_links_reference_without_copy_and_preserves_media_and_clip_ids() {
    let directory = Fixture::new();
    let source = directory.source("source.mp4", b"fixture original preserved");
    let media = directory.store();
    let source_project = uuid::Uuid::new_v4().to_string();
    let target = uuid::Uuid::new_v4().to_string();
    let media_id = register(&media, &source, &source_project);
    let editor = EditorStore::open(&directory.0).unwrap();
    let mut document = fixture(&["video"]);
    document.assets.retain(|asset| asset.id == "source");
    document.assets[0].media_id = media_id.clone();
    let created = create_clip_with_media(&editor, &media, &target, "Clipe", document).unwrap();
    let reopened = EditorStore::open(&directory.0)
        .unwrap()
        .load(&target)
        .unwrap();
    assert!(reopened.project.is_none());
    assert_eq!(reopened.clips.len(), 1);
    assert_eq!(
        reopened.clips[&created.id].document.assets[0].media_id,
        media_id
    );
    let source_entry = directory.store().get(&media_id).unwrap().unwrap();
    assert_eq!(source_entry.project_ids, vec![source_project, target]);
    assert_eq!(
        std::fs::read(&source).unwrap(),
        b"fixture original preserved"
    );
    assert!(std::fs::read_dir(media.files_dir())
        .unwrap()
        .next()
        .is_none());
}
