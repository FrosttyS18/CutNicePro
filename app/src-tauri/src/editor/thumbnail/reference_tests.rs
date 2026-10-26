use super::*;
use crate::{media_import::verify_reference, media_store::reference_tests::Fixture};
use serde_json::json;
use std::{sync::atomic::AtomicBool, time::Duration};

fn registered(
    fixture: &Fixture,
    project: &str,
) -> (
    MediaStore,
    std::path::PathBuf,
    super::super::types::Composition,
) {
    let path = fixture.source("reference.mp4", b"original reference bytes");
    let (store, document) = register_path(fixture, project, &path);
    (store, path, document)
}

fn register_path(
    fixture: &Fixture,
    project: &str,
    path: &Path,
) -> (MediaStore, super::super::types::Composition) {
    let store = MediaStore::open(&fixture.0.join("app-data")).unwrap();
    let checked = verify_reference(
        &path,
        &AtomicBool::new(false),
        &|_| {},
        Duration::from_secs(10),
    )
    .unwrap();
    let entry = store
        .publish_reference(
            &checked,
            "mp4",
            "reference.mp4",
            project,
            Some(crate::media_store::MediaAnalysis {
                duration_ms: 2000,
                width: 160,
                height: 90,
                video_codec: "h264".into(),
                audio_codec: None,
                has_audio: false,
                fps: 30.0,
            }),
        )
        .unwrap();
    let settings = json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    let document = serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,
        "assets":[{"id":"source","mediaId":entry.media_id,"name":"reference.mp4","kind":"video","durationUs":2000000,"width":160,"height":90,"hasAudio":false,"transcript":[]}],
        "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
        "items":[{"id":"one","trackId":"V1","assetId":"source","kind":"video","startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}]
    })).unwrap();
    (store, document)
}

#[test]
fn m7a_reference_source_is_resolved_for_composition_export() {
    let fixture = Fixture::new();
    let project = uuid::Uuid::new_v4().to_string();
    let (store, _, mut document) = registered(&fixture, &project);
    assert!(export_snapshot::sources(&store, &project, &mut document).is_ok());
}

#[test]
fn m7a_thumbnail_cache_rejects_changed_or_missing_reference() {
    for missing in [false, true] {
        let fixture = Fixture::new();
        let project = uuid::Uuid::new_v4().to_string();
        let (store, source, document) = registered(&fixture, &project);
        let saved = EditorStore::open(&fixture.0)
            .unwrap()
            .create_clip(&project, "Clipe", document)
            .unwrap();
        let folder = fixture
            .0
            .join("cutnicepro/editor-thumbnails")
            .join(&project);
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(
            folder.join(format!("{}.json", saved.id)),
            serde_json::to_vec(&CachedThumbnail {
                revision: saved.snapshot.document.revision,
                bytes: vec![255, 216, 255],
            })
            .unwrap(),
        )
        .unwrap();
        if missing {
            std::fs::remove_file(source).unwrap();
        } else {
            std::fs::write(source, b"different source bytes").unwrap();
        }
        assert!(read(
            &fixture.0,
            &store,
            &project,
            &saved.id,
            saved.snapshot.document.revision,
            &ProcessControl::default()
        )
        .is_err());
    }
}

#[test]
fn m7a_real_reference_composition_and_legacy_exports_preserve_original() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let base = fixture.0.join("app-data");
    let project = uuid::Uuid::new_v4().to_string();
    let source = fixture.0.join("reference.mp4");
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let control = ProcessControl::default();
    let mut command = Command::new(&ffmpeg);
    command
        .args([
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=160x90:r=30:d=2",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-y",
        ])
        .arg(&source);
    control
        .run(command, &fixture.0.join("fixture.log"))
        .unwrap();
    let original_hash = Sha256::digest(std::fs::read(&source).unwrap());
    let (store, mut document) = register_path(&fixture, &project, &source);
    let sources = export_snapshot::sources(&store, &project, &mut document).unwrap();
    let settings = serde_json::from_value(json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":1,"sourceWidth":160,"sourceHeight":90})).unwrap();
    let resolved = store
        .resolve(&document.assets[0].media_id, Some(&project))
        .unwrap();
    let composition =
        super::super::render::run(&base, &document, &sources.paths, &control, |_| {}).unwrap();
    let legacy = crate::render::pipeline::run(
        &base,
        &resolved.path,
        &[],
        &settings,
        2.0,
        false,
        &control,
        |_| {},
    )
    .unwrap();
    for (name, (_, output)) in [("composition.mp4", &composition), ("legacy.mp4", &legacy)] {
        let destination = fixture.0.join(name);
        let prepared = crate::media_output_guard::prepare(&base, &destination, |file| {
            let mut input = std::fs::File::open(output).map_err(|error| error.to_string())?;
            std::io::copy(&mut input, file)
                .map(|_| ())
                .map_err(|error| error.to_string())
        })
        .unwrap();
        sources.recheck().unwrap();
        resolved.recheck().unwrap();
        prepared.commit().unwrap();
        let analysis = crate::media_analyze::analyze(&tools, &destination).unwrap();
        assert_eq!(analysis.duration_ms, 1000);
        if analysis.has_audio {
            let pcm = fixture.0.join(format!("{name}.pcm"));
            let mut decode = Command::new(&ffmpeg);
            decode
                .args(["-nostdin", "-v", "error", "-i"])
                .arg(&destination)
                .args([
                    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-",
                ]);
            control
                .run_to_file(&mut decode, &fixture.0.join("silence.log"), &pcm)
                .unwrap();
            let samples = std::fs::read(pcm).unwrap();
            assert!(!samples.is_empty());
            assert!(samples
                .chunks_exact(2)
                .all(|sample| i32::from(i16::from_le_bytes([sample[0], sample[1]])).abs() <= 1));
        }
        let pixel = fixture.0.join(format!("{name}.rgb"));
        let mut command = Command::new(&ffmpeg);
        command
            .args(["-nostdin", "-v", "error", "-i"])
            .arg(destination)
            .args([
                "-frames:v",
                "1",
                "-vf",
                "scale=1:1,format=rgb24",
                "-f",
                "rawvideo",
                "-",
            ]);
        control
            .run_to_file(&mut command, &fixture.0.join("pixel.log"), &pixel)
            .unwrap();
        let rgb = std::fs::read(pixel).unwrap();
        assert!(rgb[0] > 200 && rgb[1] < 80 && rgb[2] < 80);
    }
    assert_eq!(
        Sha256::digest(std::fs::read(source).unwrap()),
        original_hash
    );
    assert!(std::fs::read_dir(store.files_dir())
        .unwrap()
        .next()
        .is_none());
}

#[test]
fn m7a_managed_source_remains_usable_for_composition_export() {
    let fixture = Fixture::new();
    let project = uuid::Uuid::new_v4().to_string();
    let (store, _, mut document) = registered(&fixture, &project);
    let part = store.files_dir().join("legacy.part");
    std::fs::write(&part, b"managed bytes").unwrap();
    let entry = store
        .publish(&part, &"a".repeat(64), 13, "mp4", "legacy.mp4", &project)
        .unwrap();
    store
        .store_analysis(
            &entry.media_id,
            crate::media_store::MediaAnalysis {
                duration_ms: 2000,
                width: 160,
                height: 90,
                video_codec: "h264".into(),
                audio_codec: None,
                has_audio: false,
                fps: 30.0,
            },
        )
        .unwrap();
    document.assets[0].media_id = entry.media_id;
    let sources = export_snapshot::sources(&store, &project, &mut document).unwrap();
    assert_eq!(
        std::fs::read(&sources.paths["source"]).unwrap(),
        b"managed bytes"
    );
    sources.recheck().unwrap();
}
