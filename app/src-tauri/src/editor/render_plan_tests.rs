use super::types::Composition;
use serde_json::json;

fn fixture() -> Composition {
    let settings = json!({"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    serde_json::from_value(json!({"version":1,"revision":1,"fps":{"numerator":10,"denominator":1},"settings":settings,
        "assets":[{"id":"source","mediaId":"source","name":"source.mp4","kind":"video","durationUs":4000000,"width":160,"height":90,"hasAudio":false,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"V2","name":"Overlay","kind":"visual","primary":false,"locked":false,"hidden":false,"muted":false}],
        "items":[
            {"id":"first","trackId":"V1","assetId":"source","kind":"video","startFrame":0,"durationFrames":10,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}},
            {"id":"second","trackId":"V1","assetId":"source","kind":"video","startFrame":10,"durationFrames":10,"sourceStartUs":3000000,"sourceEndUs":4000000,"groupId":"two","followsMain":true,"settings":settings,"captionEdits":{}},
            {"id":"overlay","trackId":"V2","assetId":"source","kind":"video","startFrame":5,"durationFrames":10,"sourceStartUs":1000000,"sourceEndUs":2000000,"groupId":"overlay","followsMain":true,"settings":settings,"captionEdits":{}}
        ]})).unwrap()
}

#[test]
fn partition_preserves_order_gaps_and_source_time() {
    let document = fixture();
    let windows = super::render_plan::windows(&document).unwrap();
    assert_eq!(
        windows
            .iter()
            .map(|window| (window.start, window.end))
            .collect::<Vec<_>>(),
        vec![(0, 5), (5, 10), (10, 15), (15, 20)]
    );
    let active = super::render_plan::active(&document, 10);
    assert_eq!(
        active
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        vec!["second", "overlay"]
    );
    assert_eq!(
        super::render_plan::source_time(&document, active[0], 15),
        3.5
    );
    assert_eq!(
        windows
            .iter()
            .map(|window| window.end - window.start)
            .sum::<u64>(),
        20
    );
}

#[test]
fn hidden_track_is_absent_but_does_not_shorten_the_document() {
    let mut document = fixture();
    document.tracks[1].hidden = true;
    assert_eq!(super::render_plan::active(&document, 5).len(), 1);
    assert_eq!(
        super::render_plan::windows(&document)
            .unwrap()
            .last()
            .unwrap()
            .end,
        20
    );
    document.items.clear();
    assert!(super::render_plan::windows(&document).is_err());
}

#[test]
fn source_captions_are_composed_before_their_video_is_overlaid() {
    let mut document = fixture();
    document.tracks.push(serde_json::from_value(json!({"id":"C1","name":"Legendas","kind":"caption","primary":false,"locked":true,"hidden":false,"muted":false})).unwrap());
    document.assets[0].transcript =
        vec![json!({"id":"s","start":0,"end":4,"text":"Legenda de teste"})];
    let videos = document.items.clone();
    for video in videos {
        let mut caption = video.clone();
        caption.id = format!("caption-{}", video.id);
        caption.kind = super::types::ItemKind::Caption;
        caption.track_id = "C1".into();
        caption.settings["captionModel"] = json!(1);
        caption.settings["captionStyle"] = json!({"font":"Arial","size":64,"weight":700,"color":"#FFFFFF","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00FFFF","effect":"none","position":"bottom","y":0.85,"wordsPerLine":5});
        document.items.push(caption);
    }
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor-caption-graph");
    let scratch = crate::render::scratch::Scratch::new(&base).unwrap();
    let sources =
        std::collections::HashMap::from([("source".to_string(), scratch.path.join("source.mp4"))]);
    super::render_graph::video(
        &document,
        &super::render_plan::Window { start: 5, end: 10 },
        &sources,
        &scratch.path,
        0,
        crate::render::encoder::Encoder::Cpu,
    )
    .unwrap();
    let graph = std::fs::read_to_string(scratch.path.join("video-0.txt")).unwrap();
    let first_caption = graph.find("ass=filename=caption-0-0.ass").unwrap();
    let second_caption = graph.find("ass=filename=caption-0-1.ass").unwrap();
    assert!(first_caption < graph.find("[mix1]").unwrap());
    assert!(second_caption < graph.find("[mix2]").unwrap());
    assert_eq!(graph.matches("ass=filename=").count(), 2);
    document.tracks[0].hidden = true;
    super::render_graph::video(
        &document,
        &super::render_plan::Window { start: 5, end: 10 },
        &sources,
        &scratch.path,
        1,
        crate::render::encoder::Encoder::Cpu,
    )
    .unwrap();
    let hidden = std::fs::read_to_string(scratch.path.join("video-1.txt")).unwrap();
    assert_eq!(hidden.matches("ass=filename=").count(), 1);
}
