use super::final_mix;
use crate::{editor::types::Composition, render::scratch::Scratch};
use serde_json::json;
use std::{collections::HashMap, path::PathBuf};

#[test]
fn final_mux_does_not_open_every_audio_item() {
    let settings = json!({"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let items:Vec<_>=(0..100).map(|index|json!({"id":format!("audio-{index}"),"trackId":"A1","assetId":"voice","kind":"audio","startFrame":index,"durationFrames":1,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":format!("group-{index}"),"followsMain":true,"settings":settings,"captionEdits":{}})).collect();
    let document:Composition=serde_json::from_value(json!({"version":1,"revision":1,"fps":{"numerator":30000,"denominator":1001},"settings":settings,
      "assets":[{"id":"voice","mediaId":"voice","name":"voice.wav","kind":"audio","durationUs":1000000,"width":0,"height":0,"hasAudio":true,"transcript":[]}],
      "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"A1","name":"Áudio","kind":"audio","primary":false,"locked":false,"hidden":false,"muted":false}],"items":items})).unwrap();
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-audio");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("voice".into(), scratch.path.join("voice.wav"))]);
    let args = final_mix(&document, &sources, &scratch.path).unwrap();
    assert_eq!(
        args.iter()
            .filter(|argument| argument.to_str() == Some("-i"))
            .count(),
        2,
        "O mux final deve abrir somente vídeo e PCM já montado"
    );
    assert!(!args
        .iter()
        .any(|argument| argument.to_string_lossy().contains("voice.wav")));
    assert_eq!(
        args.iter()
            .filter(|argument| argument.to_str() == Some("aac"))
            .count(),
        1
    );
}
