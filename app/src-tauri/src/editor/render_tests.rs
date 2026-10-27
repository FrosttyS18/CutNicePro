use super::types::Composition;
use crate::{render::scratch::Scratch, transcription::process::ProcessControl};
use serde_json::json;
use std::{collections::HashMap, path::Path, process::Command};

pub(super) fn execute(
    exe: &Path,
    args: &[&str],
    output: &Path,
    control: &ProcessControl,
    log: &Path,
) {
    let mut command = Command::new(exe);
    command
        .args(["-nostdin", "-v", "error", "-y"])
        .args(args)
        .arg(output);
    control.run(command, log).unwrap();
}
pub(super) fn pixel(
    exe: &Path,
    source: &Path,
    time: &str,
    x: &str,
    y: &str,
    base: &Path,
) -> [u8; 3] {
    let output = base.join(format!("pixel-{time}-{x}.rgb"));
    let mut command = Command::new(exe);
    command
        .args(["-nostdin", "-v", "error", "-ss", time, "-i"])
        .arg(source)
        .args([
            "-frames:v",
            "1",
            "-vf",
            &format!("crop=2:2:{x}:{y},scale=1:1,format=rgb24"),
            "-f",
            "rawvideo",
            "-",
        ]);
    ProcessControl::default()
        .run_to_file(&mut command, &base.join("pixel.log"), &output)
        .unwrap();
    std::fs::read(output).unwrap()[..3].try_into().unwrap()
}
fn fixture() -> Composition {
    let settings = json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let make = |id: &str,
                track: &str,
                asset: &str,
                kind: &str,
                start: u64,
                frames: u64,
                from: u64,
                to: u64| json!({"id":id,"trackId":track,"assetId":asset,"kind":kind,"startFrame":start,"durationFrames":frames,"sourceStartUs":from,"sourceEndUs":to,"groupId":id,"followsMain":true,"settings":settings,"captionEdits":{}});
    let mut overlay = make("overlay", "V2", "picture", "image", 5, 10, 0, 0);
    overlay["placement"] = json!({"x":50,"y":50,"scale":0.5,"opacity":1});
    let mut audio = make("audio", "A1", "voice", "audio", 5, 20, 0, 2000000);
    audio["settings"]["volume"] = json!(0.5);
    serde_json::from_value(json!({"version":1,"revision":1,"fps":{"numerator":10,"denominator":1},"settings":settings,
      "assets":[
        {"id":"source","mediaId":"source","name":"source.mp4","kind":"video","durationUs":4000000,"width":160,"height":90,"hasAudio":false,"transcript":[]},
        {"id":"picture","mediaId":"picture","name":"image.png","kind":"image","durationUs":0,"width":160,"height":90,"hasAudio":false,"transcript":[]},
        {"id":"voice","mediaId":"voice","name":"voice.wav","kind":"audio","durationUs":2000000,"width":0,"height":0,"hasAudio":true,"transcript":[]}],
      "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},
        {"id":"V2","name":"Sobreposição","kind":"visual","primary":false,"locked":false,"hidden":false,"muted":false},
        {"id":"A1","name":"Áudio","kind":"audio","primary":false,"locked":false,"hidden":false,"muted":false}],
      "items":[make("red","V1","source","video",0,10,0,1000000),make("blue","V1","source","video",10,10,3000000,4000000),make("repeat","V1","source","video",20,10,0,1000000),overlay,audio]})).unwrap()
}

#[test]
fn real_saved_implicit_editor_caption_preset_exports_video_image_audio_tail() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor-implicit-caption");
    let fixtures = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let source = fixtures.path.join("source.mp4");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=160x90:r=10:d=2",
            "-c:v",
            "libx264",
            "-threads",
            "1",
        ],
        &source,
        &control,
        &fixtures.path.join("source.log"),
    );
    let image = fixtures.path.join("picture.png");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=160x90",
            "-frames:v",
            "1",
            "-threads",
            "1",
        ],
        &image,
        &control,
        &fixtures.path.join("image.log"),
    );
    let voice = fixtures.path.join("voice.wav");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:a",
            "pcm_s16le",
        ],
        &voice,
        &control,
        &fixtures.path.join("voice.log"),
    );
    let sources = HashMap::from([
        ("source".into(), source),
        ("picture".into(), image),
        ("voice".into(), voice),
    ]);
    let mut document = fixture();
    document.revision = 0;
    document.settings["ratio"] = json!("original");
    document.settings["captionModel"] = json!(1);
    let mut video = document.items[0].clone();
    video.duration_frames = 20;
    video.source_end_us = 2_000_000;
    let mut image = document
        .items
        .iter()
        .find(|item| item.kind == super::types::ItemKind::Image)
        .unwrap()
        .clone();
    image.start_frame = 19;
    image.duration_frames = 10;
    image.placement = None;
    let mut audio = document
        .items
        .iter()
        .find(|item| item.kind == super::types::ItemKind::Audio)
        .unwrap()
        .clone();
    audio.start_frame = 19;
    audio.duration_frames = 10;
    audio.source_end_us = 1_000_000;
    document.items = vec![video, image, audio];
    for item in &mut document.items {
        item.settings["captionModel"] = json!(1);
        item.settings
            .as_object_mut()
            .unwrap()
            .remove("captionStyle");
    }
    let project = uuid::Uuid::new_v4().to_string();
    let store = super::store::EditorStore::open(&fixtures.path).unwrap();
    let saved = store.save(&project, None, document, 0).unwrap();
    let reopened = store.load(&project).unwrap().project.unwrap();
    let before = serde_json::to_value(&reopened.document).unwrap();
    let frozen = super::export_snapshot::freeze(Some(&reopened), &saved.document).unwrap();
    let (rendered, output) =
        super::render::run(&base, &frozen, &sources, &control, |_| {}).unwrap();
    let metadata = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert!((metadata.duration_ms as i64 - 2900).abs() <= 100);
    assert!(metadata.has_audio);
    let main = pixel(&exe, &output, "0.5", "80", "44", &rendered.path);
    assert!(main[0] > 180 && main[1] < 50);
    let tail = pixel(&exe, &output, "2.5", "80", "44", &rendered.path);
    assert!(tail[1] > 70 && tail[0] < 50);
    let samples = std::fs::read(rendered.path.join("audio.f32")).unwrap();
    let tail_sample = 120_000 * 8;
    assert!(samples[tail_sample..tail_sample + 4800 * 8]
        .chunks_exact(4)
        .any(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()).abs() > 0.01));
    assert_eq!(
        serde_json::to_value(&store.load(&project).unwrap().project.unwrap().document).unwrap(),
        before
    );
}

#[test]
fn real_composition_preserves_repetition_layer_placement_and_audio() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-render");
    let fixture_dir = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let source = fixture_dir.path.join("source.mp4");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=160x90:r=10:d=2",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:r=10:d=2",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
        &source,
        &control,
        &fixture_dir.path.join("source.log"),
    );
    let image = fixture_dir.path.join("picture.png");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=160x90",
            "-frames:v",
            "1",
            "-threads",
            "1",
        ],
        &image,
        &control,
        &fixture_dir.path.join("image.log"),
    );
    let voice = fixture_dir.path.join("voice.wav");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:a",
            "pcm_s16le",
        ],
        &voice,
        &control,
        &fixture_dir.path.join("voice.log"),
    );
    let sources = HashMap::from([
        ("source".into(), source.clone()),
        ("picture".into(), image),
        ("voice".into(), voice),
    ]);
    let before = std::fs::metadata(&source).unwrap().len();
    let (rendered, output) =
        super::render::run(&base, &fixture(), &sources, &control, |_| {}).unwrap();
    let analysis = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert!((analysis.duration_ms as i64 - 3000).abs() <= 100);
    assert!(analysis.has_audio);
    let red = pixel(&exe, &output, "0.2", "20", "20", &rendered.path);
    assert!(red[0] > 180 && red[2] < 50);
    let green = pixel(&exe, &output, "0.7", "960", "540", &rendered.path);
    assert!(green[1] > 70 && green[0] < 50);
    let edge = pixel(&exe, &output, "0.7", "20", "20", &rendered.path);
    assert!(edge[0] > 180);
    let blue = pixel(&exe, &output, "1.7", "20", "20", &rendered.path);
    assert!(blue[2] > 180 && blue[0] < 50);
    let repeat = pixel(&exe, &output, "2.7", "20", "20", &rendered.path);
    assert!(repeat[0] > 180 && repeat[2] < 50);
    let audio = rendered.path.join("samples.pcm");
    let mut command = Command::new(&exe);
    command
        .args(["-nostdin", "-v", "error", "-i"])
        .arg(&output)
        .args([
            "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "s16le", "-",
        ]);
    control
        .run_to_file(&mut command, &rendered.path.join("samples.log"), &audio)
        .unwrap();
    let samples: Vec<i16> = std::fs::read(audio)
        .unwrap()
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]))
        .collect();
    assert!(samples[1600..3200].iter().all(|sample| sample.abs() < 50));
    assert!(samples[16000..18000]
        .iter()
        .any(|sample| sample.abs() > 1000));
    assert_eq!(std::fs::metadata(source).unwrap().len(), before);
    let thumbnail = super::thumbnail::create(&base, &fixture(), &sources, &control).unwrap();
    assert!(thumbnail.starts_with(&[0xff, 0xd8]));
    assert!(thumbnail.len() < 250_000);
}

#[test]
fn real_image_audio_only_and_one_frame_exports_preserve_duration_and_tail() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-render");
    let fixtures = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let image = fixtures.path.join("image.png");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=160x90",
            "-frames:v",
            "1",
            "-threads",
            "1",
        ],
        &image,
        &control,
        &fixtures.path.join("image.log"),
    );
    let voice = fixtures.path.join("voice.wav");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:a",
            "pcm_s16le",
        ],
        &voice,
        &control,
        &fixtures.path.join("voice.log"),
    );
    let sources = HashMap::from([("picture".into(), image), ("voice".into(), voice)]);
    let mut document = fixture();
    document.items.retain(|item| {
        item.kind == super::types::ItemKind::Image || item.kind == super::types::ItemKind::Audio
    });
    document.items[0].track_id = "V1".into();
    document.items[0].start_frame = 0;
    document.items[0].duration_frames = 10;
    document.items[0].placement = None;
    document.items[1].start_frame = 0;
    document.items[1].duration_frames = 20;
    let (rendered, output) =
        super::render::run(&base, &document, &sources, &control, |_| {}).unwrap();
    let metadata = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert!((metadata.duration_ms as i64 - 2000).abs() <= 100);
    let green = pixel(&exe, &output, "0.5", "960", "540", &rendered.path);
    assert!(green[1] > 70);
    let tail = pixel(&exe, &output, "1.5", "960", "540", &rendered.path);
    assert!(tail.iter().all(|value| *value < 10));
    document
        .items
        .retain(|item| item.kind == super::types::ItemKind::Image);
    document.fps.numerator = 60;
    document.items[0].duration_frames = 1;
    let (_rendered, output) =
        super::render::run(&base, &document, &sources, &control, |_| {}).unwrap();
    let metadata = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert!(metadata.duration_ms <= 34);
    let cancelled = ProcessControl::default();
    cancelled.cancel();
    assert!(
        super::render::run(&base, &document, &sources, &cancelled, |_| panic!(
            "Cancelamento não produz progresso"
        ))
        .is_err()
    );
    assert!(super::render::run(&base, &document, &HashMap::new(), &control, |_| {}).is_err());
}

#[test]
fn real_split_and_local_caption_use_saved_source_positions() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-render");
    let fixtures = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let video = fixtures.path.join("split.mp4");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=160x90:r=10:d=1,drawbox=x=80:y=0:w=80:h=90:color=blue:t=fill",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
        &video,
        &control,
        &fixtures.path.join("source.log"),
    );
    let mut document = fixture();
    document.settings["ratio"] = json!("9:16");
    document.items.truncate(1);
    document.items[0].settings["splitScreen"] = json!({"version":1,"faceValidated":true,"top":{"x":0,"y":50,"zoom":1},"bottom":{"x":100,"y":50,"zoom":1}});
    document.assets[0].transcript =
        vec![json!({"id":"s1","start":0,"end":1,"text":"ORIGINAL","words":[]})];
    let mut caption = document.items[0].clone();
    caption.id = "caption".into();
    caption.kind = super::types::ItemKind::Caption;
    caption.track_id = "C1".into();
    caption.settings["captionModel"] = json!(1);
    caption.settings["splitScreen"] = serde_json::Value::Null;
    caption.settings["captionStyle"] = json!({"font":"Arial","size":64,"weight":700,"color":"#FFFFFF","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00FFFF","effect":"none","position":"bottom","y":0.85,"wordsPerLine":5});
    caption.caption_edits.insert(
        "s1".into(),
        super::types::CaptionEdit::Text("TEXTO LOCAL".into()),
    );
    document.tracks.push(serde_json::from_value(json!({"id":"C1","name":"Legenda","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false})).unwrap());
    document.items.push(caption);
    let (rendered, output) = super::render::run(
        &base,
        &document,
        &HashMap::from([("source".into(), video)]),
        &control,
        |_| {},
    )
    .unwrap();
    let top = pixel(&exe, &output, "0.5", "540", "300", &rendered.path);
    assert!(top[0] > 180 && top[2] < 50);
    let bottom = pixel(&exe, &output, "0.5", "540", "1300", &rendered.path);
    assert!(bottom[2] > 180 && bottom[0] < 50);
    let ass = std::fs::read_to_string(rendered.path.join("caption-0-0.ass")).unwrap();
    assert!(ass.contains("TEXTO LOCAL"));
    assert!(!ass.contains("ORIGINAL"));
    assert_eq!(document.assets[0].transcript[0]["text"], "ORIGINAL");
}

#[test]
fn real_overlay_covers_linked_captions_but_preserves_transparent_layers() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/test-editor-caption-layers");
    let scratch = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let source = scratch.path.join("source.mp4");
    execute(
        &exe,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x180:r=10:d=1",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
        &source,
        &control,
        &scratch.path.join("source.log"),
    );
    let mut document = fixture();
    document.settings["ratio"] = json!("original");
    document.assets.truncate(1);
    document.assets[0].width = 320;
    document.assets[0].height = 180;
    document.assets[0].duration_us = 1_000_000;
    document.assets[0].transcript =
        vec![json!({"id":"s","start":0,"end":1,"text":"BOTTOM","words":[]})];
    document.items.truncate(1);
    let mut upper = document.items[0].clone();
    upper.id = "upper".into();
    upper.group_id = "upper".into();
    upper.track_id = "V2".into();
    upper.placement =
        Some(serde_json::from_value(json!({"x":50,"y":50,"scale":1,"opacity":1})).unwrap());
    let mut caption = document.items[0].clone();
    caption.id = "caption".into();
    caption.kind = super::types::ItemKind::Caption;
    caption.track_id = "C1".into();
    caption.settings["captionModel"] = json!(1);
    caption.settings["captionStyle"] = json!({"font":"Arial","size":120,"weight":700,"color":"#00FF00","italic":false,"underline":false,"uppercase":false,"outline":0,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00FF00","effect":"none","position":"bottom","y":0.7,"wordsPerLine":5});
    document.tracks.truncate(2);
    document.tracks.push(serde_json::from_value(json!({"id":"C1","name":"Legenda","kind":"caption","primary":false,"locked":true,"hidden":false,"muted":false})).unwrap());
    document.items.extend([upper, caption]);
    let sources = HashMap::from([("source".to_string(), source)]);
    crate::render::fonts::prepare(&scratch.path).unwrap();
    let mut green = Vec::new();
    for (index, opacity) in [1.0, 0.0].into_iter().enumerate() {
        document.items[1].placement.as_mut().unwrap().opacity = opacity;
        let args = super::render_graph::video(
            &document,
            &super::render_plan::Window { start: 0, end: 10 },
            &sources,
            &scratch.path,
            index,
            crate::render::encoder::Encoder::Cpu,
        )
        .unwrap();
        let mut command = Command::new(&exe);
        command.current_dir(&scratch.path).args(args);
        control
            .run(command, &scratch.path.join("render.log"))
            .unwrap();
        let pixels = scratch.path.join(format!("pixels-{index}.rgb"));
        let mut decode = Command::new(&exe);
        decode
            .args(["-nostdin", "-v", "error", "-ss", "0.5", "-i"])
            .arg(scratch.path.join(format!("part-{index}.mp4")))
            .args(["-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
        control
            .run_to_file(&mut decode, &scratch.path.join("decode.log"), &pixels)
            .unwrap();
        let pixels = std::fs::read(pixels).unwrap();
        green.push(
            pixels
                .chunks_exact(3)
                .filter(|rgb| {
                    rgb[1] > 130
                        && rgb[1] > rgb[0].saturating_add(60)
                        && rgb[1] > rgb[2].saturating_add(60)
                })
                .count(),
        );
    }
    assert_eq!(
        green[0], 0,
        "Camada opaca deve cobrir também a legenda inferior"
    );
    assert!(
        green[1] > 10,
        "Camada transparente deve preservar legenda inferior visível"
    );
}
