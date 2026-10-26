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
