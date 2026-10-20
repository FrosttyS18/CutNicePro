use super::types::Segment;
use serde::Deserialize;

#[derive(Deserialize)]
struct Output {
    transcription: Vec<Utterance>,
}

#[derive(Deserialize)]
struct Utterance {
    offsets: Offsets,
    text: String,
    #[serde(default)]
    tokens: Vec<super::words::Token>,
}

#[derive(Deserialize)]
struct Offsets {
    from: f64,
    to: f64,
}

pub fn validate(segments: &[Segment], duration: f64) -> Result<(), String> {
    let mut previous = 0.0;
    let mut ids = std::collections::HashSet::new();
    if !duration.is_finite() || duration <= 0.0 || segments.len() > 100_000 {
        return Err("duração ou quantidade de trechos inválida".into());
    }
    for s in segments {
        if s.id.is_empty()
            || s.id.len() > 80
            || !ids.insert(&s.id)
            || !s.start.is_finite()
            || !s.end.is_finite()
            || s.start < previous
            || s.end <= s.start
            || s.end > duration
            || s.text.len() > 16_000
        {
            return Err("transcrição contém identificadores ou posições inválidas".into());
        }
        previous = s.start;
        let mut previous_word = s.start;
        for word in &s.words {
            if word.text.is_empty()
                || !word.start.is_finite()
                || !word.end.is_finite()
                || word.start < previous_word
                || word.end <= word.start
                || word.end > s.end
            {
                return Err("tempos de palavra inválidos".into());
            }
            previous_word = word.start;
        }
    }
    Ok(())
}

pub fn parse(json: &str, duration: f64) -> Result<Vec<Segment>, String> {
    let output: Output =
        serde_json::from_str(json).map_err(|e| format!("saída do transcritor inválida: {e}"))?;
    validate(&[], duration)?;
    let mut segments: Vec<Segment> = Vec::new();
    let mut nonempty = 0;
    let mut outside = 0;
    for (i, s) in output.transcription.into_iter().enumerate() {
        if s.text.trim().is_empty() {
            continue;
        }
        nonempty += 1;
        let start = s.offsets.from / 1000.0;
        let end = s.offsets.to / 1000.0;
        if !start.is_finite() || !end.is_finite() || start < 0.0 || end < start {
            return Err(format!(
                "tempo inválido na saída do transcritor: trecho={i}, início={start}, fim={end}"
            ));
        }
        if start == end {
            continue;
        }
        if start >= duration {
            outside += 1;
            continue;
        }
        let end = end.min(duration);
        segments.push(Segment {
            id: format!("whisper-{i}"),
            start,
            end,
            text: super::words::clean_text(&s.text),
            words: super::words::from_tokens(s.tokens, start, end),
        });
    }
    if nonempty > 0 && outside == nonempty {
        return Err("transcrição fora da duração do vídeo".into());
    }
    segments.sort_by(|a, b| a.start.total_cmp(&b.start));
    validate(&segments, duration)?;
    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn converts_milliseconds_and_preserves_portuguese() {
        let s = parse(r#"{"transcription":[{"offsets":{"from":1200,"to":2450},"text":" Olá, transcrição! "}]}"#, 3.0).unwrap();
        assert_eq!(s[0].start, 1.2);
        assert_eq!(s[0].end, 2.45);
        assert_eq!(s[0].text, "Olá, transcrição!");
    }
    #[test]
    fn accepts_no_speech() {
        assert!(parse(r#"{"transcription":[]}"#, 5.0).unwrap().is_empty());
    }
    #[test]
    fn rejects_missing_and_invalid_timestamps() {
        assert!(parse("{}", 5.0).is_err());
        for (from, to) in [(3, 2), (-1, 2)] {
            let json = format!(
                r#"{{"transcription":[{{"offsets":{{"from":{from},"to":{to}}},"text":"fala"}}]}}"#
            );
            assert!(parse(&json, 5.0).is_err());
        }
    }
    #[test]
    fn imports_upstream_instantaneous_segments_without_aborting_valid_speech() {
        let json = r#"{"transcription":[{"offsets":{"from":0,"to":1200},"text":"Olá"},{"offsets":{"from":1200,"to":1200},"text":"."},{"offsets":{"from":1200,"to":2400},"text":"mundo"}]}"#;
        let s = parse(json, 2.4).unwrap();
        assert_eq!(s.len(), 2);
        assert_eq!(s[1].text, "mundo");
    }
    #[test]
    fn projects_segment_onto_real_media_bounds_and_orders_original_timestamps() {
        let json = r#"{"transcription":[{"offsets":{"from":1000,"to":6000},"text":"fim"},{"offsets":{"from":0,"to":800},"text":"início"}]}"#;
        let s = parse(json, 5.0).unwrap();
        assert_eq!(s[0].text, "início");
        assert_eq!(s[1].start, 1.0);
        assert_eq!(s[1].end, 5.0);
        validate(&s, 5.0).unwrap();
    }
    #[test]
    fn canonical_validation_stays_strict_and_does_not_invent_time_for_invalid_records() {
        let s = Segment {
            id: "s".into(),
            start: 0.0,
            end: 5.01,
            text: "fim".into(),
            words: vec![],
        };
        assert!(validate(&[s], 5.0).is_err());
        assert!(parse(
            r#"{"transcription":[{"offsets":{"from":6000,"to":7000},"text":"fora"}]}"#,
            5.0
        )
        .is_err());
    }
}
