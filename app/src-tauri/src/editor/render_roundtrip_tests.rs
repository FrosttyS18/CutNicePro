use super::{
    export_snapshot,
    render_tests::{execute, pixel},
    store::EditorStore,
    types::Composition,
};
use crate::{render::scratch::Scratch, transcription::process::ProcessControl};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
};

fn fixture() -> Composition {
    let settings = json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let item = |id: &str, track: &str, asset: &str, kind: &str, start: u64, duration: u64| json!({"id":id,"trackId":track,"assetId":asset,"kind":kind,"startFrame":start,"durationFrames":duration,"sourceStartUs":0,"sourceEndUs":duration*100000,"groupId":id,"followsMain":true,"settings":settings,"captionEdits":{}});
    let mut image = item("overlay", "V2", "picture", "image", 5, 10);
    image["placement"] = json!({"x":50,"y":50,"scale":0.5,"opacity":1});
    let caption = |id: &str, group: &str, start: u64, text: &str| {
        let mut value = item(id, "C1", "red", "caption", start, 10);
        value["groupId"] = json!(group);
        value["settings"]["captionModel"] = json!(1);
        value["settings"]["captionStyle"] = json!({"font":"Arial","size":100,"weight":700,"color":"#00FFFF","italic":false,"underline":false,"uppercase":false,"outline":0,"outlineColor":"#000000","shadow":false,"background":"transparent","highlightColor":"#00FFFF","effect":"none","position":"bottom","y":0.85,"wordsPerLine":5});
        value["captionEdits"] = json!({"s":text});
        value
    };
    serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":10,"denominator":1},"settings":settings,
      "assets":[
        {"id":"red","mediaId":"red-source","name":"red.mp4","kind":"video","durationUs":1000000,"width":160,"height":90,"hasAudio":false,"transcript":[{"id":"s","start":0,"end":1,"text":"ORIGINAL","words":[]}]},
        {"id":"blue","mediaId":"blue-source","name":"blue.mp4","kind":"video","durationUs":1000000,"width":160,"height":90,"hasAudio":false,"transcript":[]},
        {"id":"picture","mediaId":"picture-source","name":"picture.png","kind":"image","durationUs":1000000,"width":160,"height":90,"hasAudio":false,"transcript":[]},
        {"id":"voice","mediaId":"voice-source","name":"voice.wav","kind":"audio","durationUs":2000000,"width":0,"height":0,"hasAudio":true,"transcript":[]}],
      "tracks":[
        {"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},
        {"id":"V2","name":"Imagem","kind":"visual","primary":false,"locked":false,"hidden":false,"muted":false},
        {"id":"A1","name":"Áudio","kind":"audio","primary":false,"locked":false,"hidden":false,"muted":false},
        {"id":"C1","name":"Legendas","kind":"caption","primary":false,"locked":false,"hidden":false,"muted":false}],
      "items":[item("first","V1","red","video",0,10),item("second","V1","blue","video",10,10),item("repeat","V1","red","video",20,10),image,item("voice","A1","voice","audio",5,20),caption("caption-first","first",0,"PRIMEIRO"),caption("caption-repeat","repeat",20,"REPETIDO")]})).unwrap()
}

fn caption_pixels(
    exe: &Path,
    output: &Path,
    time: &str,
    base: &Path,
    control: &ProcessControl,
) -> usize {
    let pixels = base.join(format!("caption-{time}.rgb"));
    let mut command = Command::new(exe);
    command
        .args(["-nostdin", "-v", "error", "-ss", time, "-i"])
        .arg(output)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "crop=iw:ih/3:0:ih*2/3",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ]);
    control
        .run_to_file(&mut command, &base.join("caption-pixels.log"), &pixels)
        .unwrap();
    std::fs::read(pixels)
        .unwrap()
        .chunks_exact(3)
        .filter(|rgb| rgb[0] < 100 && rgb[1] > 150 && rgb[2] > 150)
        .count()
}

#[test]
fn saved_multisource_roundtrip_export_preserves_composition() {
    let base =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-roundtrip-render");
    let scratch = Scratch::new(&base).unwrap();
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let control = ProcessControl::default();
    let mut sources = HashMap::new();
    for color in ["red", "blue"] {
        let path = scratch.path.join(format!("{color}.mp4"));
        execute(
            &exe,
            &[
                "-f",
                "lavfi",
                "-i",
                &format!("color=c={color}:s=160x90:r=10:d=1"),
                "-c:v",
                "libx264",
                "-threads",
                "1",
            ],
            &path,
            &control,
            &scratch.path.join(format!("{color}.log")),
        );
        sources.insert(color.to_string(), path);
    }
    let image = scratch.path.join("picture.png");
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
        &scratch.path.join("image.log"),
    );
    sources.insert("picture".into(), image);
    let voice = scratch.path.join("voice.wav");
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
        &scratch.path.join("voice.log"),
    );
    sources.insert("voice".into(), voice);
    let hashes: HashMap<_, _> = sources
        .iter()
        .map(|(id, path)| (id.clone(), Sha256::digest(std::fs::read(path).unwrap())))
        .collect();
    let document = fixture();
    document.validate().unwrap();
    let original = serde_json::to_value(&document).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let store = EditorStore::open(&scratch.path).unwrap();
    let saved = store.save(&project, None, document.clone(), 0).unwrap();
    let reopened = EditorStore::open(&scratch.path)
        .unwrap()
        .load(&project)
        .unwrap()
        .project
        .unwrap();
    assert_eq!(
        serde_json::to_value(&reopened.document).unwrap(),
        serde_json::to_value(&saved.document).unwrap()
    );
    let mut expected = original.clone();
    expected["revision"] = json!(1);
    assert_eq!(serde_json::to_value(&reopened.document).unwrap(), expected);
    let frozen = export_snapshot::freeze(Some(&reopened), &reopened.document).unwrap();
    let saved_bytes = std::fs::read(
        scratch
            .path
            .join("cutnicepro/editor")
            .join(format!("{project}.json")),
    )
    .unwrap();
    let (rendered, output) =
        super::render::run(&scratch.path, &frozen, &sources, &control, |_| {}).unwrap();
    let analysis = crate::media_analyze::analyze(&tools, &output).unwrap();
    assert!((analysis.duration_ms as i64 - 3000).abs() <= 100);
    assert!(analysis.has_audio);
    for (time, channel) in [("0.2", 0), ("1.7", 2), ("2.7", 0)] {
        let rgb = pixel(&exe, &output, time, "20", "20", &rendered.path);
        assert!(rgb[channel] > 180 && rgb[1] < 50);
    }
    let overlay = pixel(&exe, &output, "0.7", "960", "540", &rendered.path);
    assert!(overlay[1] > 70 && overlay[0] < 50 && overlay[2] < 50);
    assert!(caption_pixels(&exe, &output, "0.2", &rendered.path, &control) > 10);
    assert_eq!(
        caption_pixels(&exe, &output, "1.7", &rendered.path, &control),
        0
    );
    assert!(caption_pixels(&exe, &output, "2.7", &rendered.path, &control) > 10);
    let audio = rendered.path.join("samples.pcm");
    let mut decode = Command::new(&exe);
    decode
        .args(["-nostdin", "-v", "error", "-i"])
        .arg(&output)
        .args([
            "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "s16le", "-",
        ]);
    control
        .run_to_file(&mut decode, &rendered.path.join("audio.log"), &audio)
        .unwrap();
    let samples: Vec<_> = std::fs::read(audio)
        .unwrap()
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]))
        .collect();
    assert!(samples[1600..3200].iter().all(|sample| sample.abs() < 50));
    assert!(samples[16000..18000]
        .iter()
        .any(|sample| sample.abs() > 1000));
    assert!(samples[44800..46400].iter().all(|sample| sample.abs() < 50));
    let ass: String = std::fs::read_dir(&rendered.path)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "ass"))
        .map(|entry| std::fs::read_to_string(entry.path()).unwrap())
        .collect();
    assert!(ass.contains("PRIMEIRO") && ass.contains("REPETIDO") && !ass.contains("ORIGINAL"));
    assert_eq!(serde_json::to_value(&document).unwrap(), original);
    assert_eq!(
        std::fs::read(
            scratch
                .path
                .join("cutnicepro/editor")
                .join(format!("{project}.json"))
        )
        .unwrap(),
        saved_bytes
    );
    for (id, path) in sources {
        assert_eq!(Sha256::digest(std::fs::read(path).unwrap()), hashes[&id]);
    }
}
