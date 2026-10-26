use super::{graph, sample_at, Block, BLOCK_SAMPLES, BYTES_PER_FRAME};
use crate::{
    editor::{render_plan::Window, types::Composition},
    render::scratch::Scratch,
    transcription::process::ProcessControl,
};
use serde_json::json;
use std::{collections::HashMap, path::PathBuf, process::Command};

fn fixture() -> Composition {
    let settings = json!({"ratio":"16:9","fit":"contain","captionModel":0,"text":"","volume":0.5,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
    serde_json::from_value(json!({"version":1,"revision":1,"fps":{"numerator":60000,"denominator":1001},"settings":settings,
      "assets":[{"id":"voice","mediaId":"voice","name":"voice.wav","kind":"audio","durationUs":2000000,"width":0,"height":0,"hasAudio":true,"transcript":[]}],
      "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false},{"id":"A1","name":"Áudio","kind":"audio","primary":false,"locked":false,"hidden":false,"muted":false}],
      "items":[{"id":"audio","trackId":"A1","assetId":"voice","kind":"audio","startFrame":0,"durationFrames":60,"sourceStartUs":500000,"sourceEndUs":1500000,"groupId":"audio","followsMain":true,"settings":settings,"captionEdits":{}}]})).unwrap()
}

#[test]
fn absolute_sample_boundaries_do_not_accumulate_fractional_frame_rounding() {
    let document = fixture();
    let mut samples = 0;
    for frame in 0..1001 {
        let start = sample_at(&document, frame).unwrap();
        let end = sample_at(&document, frame + 1).unwrap();
        assert!((800..=801).contains(&(end - start)));
        samples += end - start;
    }
    assert_eq!(samples, 801_601);
    assert_eq!(samples, sample_at(&document, 1001).unwrap());
    assert_eq!(BLOCK_SAMPLES * BYTES_PER_FRAME, 3_840_000);
}

#[test]
fn unsupported_sample_count_is_an_error_instead_of_overflow() {
    let mut document = fixture();
    document.fps.numerator = 1;
    document.fps.denominator = u32::MAX;
    assert!(sample_at(&document, u64::MAX).is_err());
}

#[test]
fn each_pass_has_at_most_seven_sources_and_one_accumulator() {
    let document = fixture();
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-audio");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("voice".into(), scratch.path.join("voice.wav"))]);
    let items = vec![&document.items[0]; 7];
    let block = Block {
        start: 0,
        end: 1600,
    };
    let args = graph::window(
        &document,
        block,
        &items,
        &sources,
        Some(&scratch.path.join("previous.f32")),
        &scratch.path.join("next.f32"),
        &scratch.path,
    )
    .unwrap();
    assert_eq!(
        args.iter()
            .filter(|argument| argument.to_str() == Some("-i"))
            .count(),
        9
    );
    assert!(!args.iter().any(|argument| argument.to_str() == Some("aac")));
    assert!(graph::window(
        &document,
        block,
        &vec![&document.items[0]; 8],
        &sources,
        None,
        &scratch.path.join("next.f32"),
        &scratch.path
    )
    .is_err());
}

#[test]
fn source_offset_uses_the_absolute_sample_clock_and_volume() {
    let mut document = fixture();
    document.items[0].start_frame = 3;
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-audio");
    let scratch = Scratch::new(&base).unwrap();
    let sources = HashMap::from([("voice".into(), scratch.path.join("voice.wav"))]);
    let args = graph::window(
        &document,
        Block {
            start: 3203,
            end: 4004,
        },
        &[&document.items[0]],
        &sources,
        None,
        &scratch.path.join("next.f32"),
        &scratch.path,
    )
    .unwrap();
    let offset = args
        .windows(2)
        .find(|pair| pair[0].to_str() == Some("-ss"))
        .unwrap();
    assert_eq!(offset[1].to_str(), Some("0.516687500"));
    let script = std::fs::read_to_string(scratch.path.join("audio-window.txt")).unwrap();
    assert!(script.contains("volume=0.5"));
    assert!(script.contains("apad=whole_len=801"));
}

#[test]
fn real_pcm_windows_preserve_samples_across_fractional_joins_and_mixed_batches() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido para integração");
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-audio");
    let scratch = Scratch::new(&base).unwrap();
    let control = ProcessControl::default();
    let frames: Vec<f32> = (0..96000)
        .map(|index| ((index % 97) as f32 - 48.0) / 1000.0)
        .collect();
    let raw: Vec<u8> = frames
        .iter()
        .flat_map(|sample| [sample.to_le_bytes(), sample.to_le_bytes()].concat())
        .collect();
    std::fs::write(scratch.path.join("source.f32"), raw).unwrap();
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
    let mut document = fixture();
    let sources = HashMap::from([("voice".into(), scratch.path.join("voice.wav"))]);
    let edges = [0, 1, 2, 17, 31, 49, 60];
    let windows: Vec<_> = edges
        .windows(2)
        .map(|pair| Window {
            start: pair[0],
            end: pair[1],
        })
        .collect();
    let output = super::run(
        &document,
        &windows,
        &sources,
        &exe,
        &scratch.path,
        &control,
        |_, _| {},
    )
    .unwrap();
    let bytes = std::fs::read(output).unwrap();
    assert_eq!(bytes.len(), 48048 * 8);
    let actual: Vec<_> = bytes
        .chunks_exact(8)
        .map(|pair| f32::from_le_bytes(pair[..4].try_into().unwrap()))
        .collect();
    for (index, value) in actual.iter().enumerate() {
        let expected = if index < 48000 {
            frames[24000 + index] * 0.5
        } else {
            0.0
        };
        assert!(
            (value - expected).abs() < 0.000001,
            "Amostra {index} na junção: {value} != {expected}"
        );
    }
    assert!(!scratch.path.join("audio-a.f32").exists());
    assert!(!scratch.path.join("audio-b.f32").exists());
    for index in 2..=8 {
        let mut track = document.tracks[1].clone();
        track.id = format!("A{index}");
        document.tracks.push(track);
        let mut item = document.items[0].clone();
        item.id = format!("audio-{index}");
        item.track_id = format!("A{index}");
        document.items.push(item);
    }
    let output = super::run(
        &document,
        &[Window { start: 0, end: 60 }],
        &sources,
        &exe,
        &scratch.path,
        &control,
        |_, _| {},
    )
    .unwrap();
    let bytes = std::fs::read(output).unwrap();
    assert_eq!(bytes.len(), 48048 * 8);
    for (index, pair) in bytes.chunks_exact(8).enumerate() {
        let value = f32::from_le_bytes(pair[..4].try_into().unwrap());
        let expected = if index < 48000 {
            frames[24000 + index] * 4.0
        } else {
            0.0
        };
        assert!(
            (value - expected).abs() < 0.000001,
            "Mix em lotes na amostra {index}: {value} != {expected}"
        );
    }
    let cancelled = ProcessControl::default();
    cancelled.cancel();
    assert!(super::run(
        &document,
        &windows,
        &sources,
        &exe,
        &scratch.path,
        &cancelled,
        |_, _| panic!("Cancelamento não publica progresso")
    )
    .is_err());
    let scratch_path = scratch.path.clone();
    drop(scratch);
    assert!(!scratch_path.exists());
}
