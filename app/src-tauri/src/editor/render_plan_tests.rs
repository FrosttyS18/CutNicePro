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

fn source_audio_fixture() -> Composition {
    let mut document = fixture();
    document.tracks.push(serde_json::from_value(json!({"id":"A1","name":"Audio","kind":"audio","primary":false,"locked":true,"hidden":false,"muted":false})).unwrap());
    let mut audio = document.items[0].clone();
    audio.id = "source-audio".into();
    audio.kind = super::types::ItemKind::Audio;
    audio.track_id = "A1".into();
    audio.settings["volume"] = json!(0.4);
    document.items.push(audio);
    document
}

fn audible_ids(document: &Composition) -> Vec<String> {
    super::render_plan::active(document, 0)
        .into_iter()
        .filter(|item| item.kind == super::types::ItemKind::Audio)
        .map(|item| item.id.clone())
        .collect()
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
fn visual_mute_silences_only_its_bound_audio_and_preserves_item_settings() {
    let mut document = source_audio_fixture();
    let mut music = document.items.last().unwrap().clone();
    music.id = "music".into();
    music.group_id = "independent".into();
    music.follows_main = false;
    document.items.push(music);
    document.tracks[0].muted = true;
    assert_eq!(audible_ids(&document), vec!["music"]);
    document.tracks[0].muted = false;
    assert_eq!(audible_ids(&document), vec!["source-audio", "music"]);
    let original = document
        .items
        .iter_mut()
        .find(|item| item.id == "source-audio")
        .unwrap();
    assert_eq!(original.settings["volume"], json!(0.4));
    original.settings["muted"] = json!(true);
    document.tracks[0].muted = true;
    document.tracks[0].muted = false;
    assert_eq!(audible_ids(&document), vec!["music"]);
}

#[test]
fn visual_mute_requires_one_video_and_one_audio_in_the_pair() {
    for duplicate_audio in [false, true] {
        let mut document = source_audio_fixture();
        document.tracks[0].muted = true;
        let mut duplicate = if duplicate_audio {
            let mut track = document.tracks.last().unwrap().clone();
            track.id = "A2".into();
            document.tracks.push(track);
            let mut audio = document.items.last().unwrap().clone();
            audio.track_id = "A2".into();
            audio
        } else {
            let mut video = document.items[0].clone();
            video.track_id = "V2".into();
            video
        };
        duplicate.id = "duplicate".into();
        document.items.push(duplicate);
        let expected = if duplicate_audio {
            vec!["source-audio", "duplicate"]
        } else {
            vec!["source-audio"]
        };
        assert_eq!(audible_ids(&document), expected);
    }
}

#[test]
fn visual_mute_requires_matching_identity_timing_and_valid_track_kinds() {
    for mismatch in [
        "asset",
        "group",
        "start",
        "duration",
        "source_start",
        "source_end",
        "independent",
        "audio_track",
        "visual_track",
        "video_kind",
    ] {
        let mut document = source_audio_fixture();
        document.tracks[0].muted = true;
        let audio = document.items.last_mut().unwrap();
        match mismatch {
            "asset" => audio.asset_id = "other".into(),
            "group" => audio.group_id = "other".into(),
            "start" => audio.start_frame = 1,
            "duration" => audio.duration_frames += 1,
            "source_start" => audio.source_start_us += 1,
            "source_end" => audio.source_end_us += 1,
            "independent" => audio.follows_main = false,
            "audio_track" => document.tracks.last_mut().unwrap().kind = "caption".into(),
            "visual_track" => document.tracks[0].kind = "audio".into(),
            "video_kind" => document.items[0].kind = super::types::ItemKind::Image,
            _ => unreachable!(),
        }
        let at = if mismatch == "start" { 1 } else { 0 };
        assert!(
            super::render_plan::active(&document, at)
                .iter()
                .any(|item| item.id == "source-audio"),
            "{mismatch}"
        );
    }
}

#[test]
fn visual_hide_and_lock_preserve_audio_while_audio_flags_remain_effective() {
    let mut document = source_audio_fixture();
    document.tracks[0].hidden = true;
    document.tracks[0].locked = true;
    assert_eq!(audible_ids(&document), vec!["source-audio"]);
    document.tracks[0].muted = true;
    assert!(audible_ids(&document).is_empty());
    document.tracks[0].muted = false;
    assert_eq!(audible_ids(&document), vec!["source-audio"]);
    document.tracks.last_mut().unwrap().muted = true;
    assert!(audible_ids(&document).is_empty());
    document.tracks.last_mut().unwrap().muted = false;
    document.tracks.last_mut().unwrap().hidden = true;
    assert!(audible_ids(&document).is_empty());
}

#[test]
fn visual_mute_pcm_is_silent_and_unmute_restores_original_audio() {
    use crate::{render::scratch::Scratch, transcription::process::ProcessControl};
    use std::{collections::HashMap, path::PathBuf, process::Command};
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-visual-mute");
    let scratch = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let raw: Vec<u8> = (0..96_000).flat_map(|_| 0.25_f32.to_le_bytes()).collect();
    std::fs::write(scratch.path.join("source.f32"), &raw).unwrap();
    let source = scratch.path.join("voice.wav");
    let mut command = Command::new(&exe);
    command.current_dir(&scratch.path).args([
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-f",
        "f32le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-i",
        "source.f32",
        "-c:a",
        "pcm_f32le",
        "voice.wav",
    ]);
    control
        .run(command, &scratch.path.join("source.log"))
        .unwrap();
    let original = std::fs::read(&source).unwrap();
    let mut document = source_audio_fixture();
    document
        .items
        .retain(|item| item.id == "first" || item.id == "source-audio");
    let before = serde_json::to_value(&document).unwrap();
    let sources = HashMap::from([("source".into(), source.clone())]);
    let render = |document: &Composition| {
        let windows = super::render_plan::windows(document).unwrap();
        let output = super::render_audio::run(
            document,
            &windows,
            &sources,
            &exe,
            &scratch.path,
            &control,
            |_, _| {},
        )
        .unwrap();
        std::fs::read(output).unwrap()
    };
    let audible = render(&document);
    assert_eq!(audible.len(), 48_000 * 8);
    assert!(audible
        .chunks_exact(4)
        .all(|sample| (f32::from_le_bytes(sample.try_into().unwrap()) - 0.1).abs() < 0.000001));
    document.tracks[0].muted = true;
    let silent = render(&document);
    assert_eq!(silent.len(), audible.len());
    assert!(silent
        .chunks_exact(4)
        .all(|sample| f32::from_le_bytes(sample.try_into().unwrap()) == 0.0));
    document.tracks[0].muted = false;
    assert_eq!(render(&document), audible);
    assert_eq!(serde_json::to_value(&document).unwrap(), before);
    document.tracks[0].hidden = true;
    assert_eq!(render(&document), audible);
    assert_eq!(std::fs::read(source).unwrap(), original);
    assert_eq!(std::fs::read(scratch.path.join("source.f32")).unwrap(), raw);
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
