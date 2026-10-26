use super::{store::EditorStore, types::Composition};
use crate::render::scratch::Scratch;
use serde_json::json;

const MESSAGE: &str = "Selecione um intervalo com vídeo ou imagem para criar o clipe.";

pub(super) fn fixture(kinds: &[&str]) -> Composition {
    let settings = json!({"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let items: Vec<_> = kinds.iter().map(|kind| json!({"id":kind,"trackId":match *kind {"audio"=>"A1","caption"=>"C1",_=>"V1"},"assetId":if *kind=="image" {"picture"} else {"source"},"kind":kind,"startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"g","followsMain":true,"settings":settings,"captionEdits":{}})).collect();
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
      "assets":[{"id":"source","mediaId":"source","name":"source.mp4","kind":"video","durationUs":1000000,"width":160,"height":90,"transcript":[]},{"id":"picture","mediaId":"picture","name":"picture.png","kind":"image","durationUs":1000000,"width":160,"height":90,"transcript":[]}],
      "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"A1","name":"Áudio","kind":"audio","primary":false,"locked":false,"hidden":false,"muted":false},{"id":"C1","name":"Legenda","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false}],"items":items})).unwrap()
}

#[test]
fn new_manual_clip_without_visual_preserves_saved_bytes_and_identity() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-manual-clip");
    let scratch = Scratch::new(&base).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&scratch.path).unwrap();
    store.save(&project, None, fixture(&[]), 0).unwrap();
    let existing = store
        .create_clip(&project, "Existente", fixture(&["image"]))
        .unwrap();
    let path = scratch
        .path
        .join("cutnicepro/editor")
        .join(format!("{project}.json"));
    let before = std::fs::read(&path).unwrap();
    for kinds in [
        vec!["audio"],
        vec!["caption"],
        vec!["audio", "caption"],
        vec![],
    ] {
        let document = fixture(&kinds);
        document.validate().unwrap();
        let result = store.create_clip(&project, "Sem visual", document);
        assert!(result.is_err(), "Clipe sem vídeo/imagem foi publicado");
        assert_eq!(result.err().as_deref(), Some(MESSAGE));
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
    let reopened = EditorStore::open(&scratch.path)
        .unwrap()
        .load(&project)
        .unwrap();
    assert_eq!(reopened.clips.len(), 1);
    assert!(reopened.clips.contains_key(&existing.id));
    assert!(reopened.project.unwrap().document.items.is_empty());
}

#[test]
fn new_manual_clip_accepts_structural_video_image_and_hidden_video() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-manual-clip");
    let scratch = Scratch::new(&base).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&scratch.path).unwrap();
    for kind in ["video", "image", "hidden-video"] {
        let mut document = fixture(&[if kind == "image" { "image" } else { "video" }]);
        document.tracks[0].hidden = kind == "hidden-video";
        let created = store.create_clip(&project, kind, document).unwrap();
        assert_eq!(created.snapshot.document.items.len(), 1);
    }
    assert_eq!(store.load(&project).unwrap().clips.len(), 3);
}

#[test]
fn existing_clip_can_save_an_empty_document_and_invalid_visual_cannot_publish() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-manual-clip");
    let scratch = Scratch::new(&base).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&scratch.path).unwrap();
    let created = store
        .create_clip(&project, "Existente", fixture(&["video"]))
        .unwrap();
    let saved = store
        .save(&project, Some(&created.id), fixture(&[]), 1)
        .unwrap();
    assert!(saved.document.items.is_empty());
    let path = scratch
        .path
        .join("cutnicepro/editor")
        .join(format!("{project}.json"));
    let before = std::fs::read(&path).unwrap();
    let mut invalid = fixture(&["video"]);
    invalid.items[0].asset_id = "missing".into();
    assert!(store.create_clip(&project, "Inválido", invalid).is_err());
    assert_eq!(std::fs::read(path).unwrap(), before);
}
