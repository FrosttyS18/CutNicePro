use super::{parser, types::Transcript, words};
use serde::Deserialize;
use serde_json::json;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
struct Raw {
    params: Params,
    transcription: Vec<Utterance>,
}

#[derive(Deserialize)]
struct Params {
    model: String,
    language: String,
}

#[derive(Deserialize)]
struct Utterance {
    offsets: Offsets,
    text: String,
}

#[derive(Deserialize)]
struct Offsets {
    from: f64,
    to: f64,
}

fn within_lab(path: &Path, lab: &Path) -> PathBuf {
    let resolved = path.canonicalize().unwrap();
    assert!(
        resolved.starts_with(lab),
        "audit input must stay inside the workspace laboratory"
    );
    resolved
}

fn save_new(path: &Path, value: &impl serde::Serialize) {
    let bytes = serde_json::to_vec_pretty(value).unwrap();
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .unwrap();
    file.write_all(&bytes).unwrap();
    file.sync_all().unwrap();
    assert_eq!(fs::read(path).unwrap(), bytes);
}

#[test]
#[ignore = "CPU-only import of an explicitly supplied saved Whisper raw; no model or publication"]
fn import_saved_whisper_raw_without_model_calls_or_publication() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let lab = workspace
        .join(".tooling/test-output")
        .canonicalize()
        .unwrap();
    let raw_path = within_lab(
        &PathBuf::from(
            std::env::var_os("CNP_WHISPER_AUDIT_RAW").expect("CNP_WHISPER_AUDIT_RAW is required"),
        ),
        &lab,
    );
    let baseline_path = std::env::var_os("CNP_WHISPER_AUDIT_BASELINE")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            lab.join("pipelines-comparados-2026-10-24/corpus/davyjones-transcript.json")
        });
    let baseline_path = within_lab(&baseline_path, &lab);
    let duration: f64 = std::env::var("CNP_WHISPER_AUDIT_DURATION")
        .expect("CNP_WHISPER_AUDIT_DURATION is required")
        .parse()
        .unwrap();
    let raw_text = fs::read_to_string(&raw_path).unwrap();
    let raw: Raw = serde_json::from_str(&raw_text).unwrap();
    assert!(raw
        .params
        .model
        .replace('\\', "/")
        .ends_with("/ggml-large-v3-turbo.bin"));
    assert_eq!(raw.params.language, "pt");
    let segments = parser::parse(&raw_text, duration).unwrap();
    parser::validate(&segments, duration).unwrap();
    let baseline: Transcript =
        serde_json::from_str(&fs::read_to_string(&baseline_path).unwrap()).unwrap();
    parser::validate(&baseline.segments, duration).unwrap();
    let mut expected = Vec::new();
    let mut excluded = Vec::new();
    for (index, utterance) in raw.transcription.iter().enumerate() {
        let start = utterance.offsets.from / 1000.0;
        let end = utterance.offsets.to / 1000.0;
        let reason = if utterance.text.trim().is_empty() {
            Some("empty input text")
        } else if start == end {
            Some("zero duration")
        } else if start >= duration {
            Some("outside media")
        } else {
            None
        };
        if let Some(reason) = reason {
            excluded.push(json!({"rawIndex":index,"start":start,"end":end,"text":utterance.text,"reason":reason}));
        } else {
            expected.push((start, index, words::clean_text(&utterance.text)));
        }
    }
    expected.sort_by(|a, b| a.0.total_cmp(&b.0));
    assert_eq!(segments.len(), expected.len());
    for (segment, (_, index, text)) in segments.iter().zip(&expected) {
        assert_eq!(segment.id, format!("whisper-{index}"));
        assert_eq!(&segment.text, text);
    }
    let canonical_text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let baseline_text = baseline
        .segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let empty_words = segments
        .iter()
        .filter(|segment| segment.words.is_empty())
        .count();
    let partial = segments.iter().filter(|segment| !segment.words.is_empty() && !words::reconstructs_text(&segment.text, &segment.words))
        .map(|segment| json!({"id":segment.id,"start":segment.start,"end":segment.end,"canonicalText":segment.text,"timedText":segment.words.iter().map(|word| word.text.as_str()).collect::<Vec<_>>().join(" ")})).collect::<Vec<_>>();
    let baseline_partial = baseline
        .segments
        .iter()
        .filter(|segment| {
            !segment.words.is_empty() && !words::reconstructs_text(&segment.text, &segment.words)
        })
        .count();
    let transcript = Transcript {
        version: 1,
        media_id: baseline.media_id,
        language: "pt".into(),
        model: "whisper-large-v3-turbo".into(),
        segments,
    };
    let suffix = uuid::Uuid::new_v4();
    let directory = raw_path.parent().unwrap();
    let transcript_path = directory.join(format!("transcript-native-{suffix}.json"));
    let audit_path = directory.join(format!("parser-audit-{suffix}.json"));
    let audit = json!({
        "status":"PASS_NATIVE_PARSER_TEXT_PRESERVATION_ONLY",
        "duration":duration,
        "rawFile":raw_path.strip_prefix(&lab).unwrap(),
        "baselineFile":baseline_path.strip_prefix(&lab).unwrap(),
        "transcriptFile":transcript_path.file_name().unwrap().to_string_lossy(),
        "rawUtterances":raw.transcription.len(),
        "parsedSegments":transcript.segments.len(),
        "retainedCanonicalTextsEqual":true,
        "excluded":excluded,
        "completeWordArrays":transcript.segments.len()-partial.len()-empty_words,
        "emptyWordArrays":empty_words,
        "partialWordArrays":partial,
        "baselineSegments":baseline.segments.len(),
        "baselinePartialWordArrays":baseline_partial,
        "baselineEmptyWordArrays":baseline.segments.iter().filter(|segment| segment.words.is_empty()).count(),
        "continuousTextEqualsBaselineText":canonical_text==baseline_text,
        "continuousTextWords":canonical_text.split_whitespace().count(),
        "baselineTextWords":baseline_text.split_whitespace().count(),
        "limits":"Different ASR runs; no human reference, WER, editorial approval, model calls or normal publication."
    });
    save_new(&transcript_path, &transcript);
    save_new(&audit_path, &audit);
    let reread: Transcript =
        serde_json::from_str(&fs::read_to_string(&transcript_path).unwrap()).unwrap();
    parser::validate(&reread.segments, duration).unwrap();
    println!(
        "audit={} transcript={} raw={} parsed={} complete={} partial={} empty={}",
        audit_path.display(),
        transcript_path.display(),
        raw.transcription.len(),
        transcript.segments.len(),
        transcript.segments.len() - partial.len() - empty_words,
        partial.len(),
        empty_words
    );
}
