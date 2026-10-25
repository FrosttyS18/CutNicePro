use super::types::Word;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Token {
    pub text: String,
    pub offsets: Option<Offsets>,
    #[serde(default)]
    pub t_dtw: Option<f64>,
}
#[derive(Deserialize)]
pub struct Offsets {
    pub from: f64,
    pub to: f64,
}

pub fn clean_text(text: &str) -> String {
    text.split_whitespace()
        .map(|s| {
            let stripped = s.trim_start_matches(['-', '–', '—']);
            if stripped.chars().next().is_some_and(char::is_alphabetic) {
                stripped
            } else {
                s
            }
        })
        .filter(|s| !matches!(*s, "-" | "–" | "—"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn reconstructs_text(text: &str, words: &[Word]) -> bool {
    !words.is_empty()
        && clean_text(text)
            == clean_text(
                &words
                    .iter()
                    .map(|word| word.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" "),
            )
}

pub fn from_tokens(tokens: Vec<Token>, start: f64, end: f64) -> Vec<Word> {
    let mut groups: Vec<(String, Option<(f64, f64)>)> = Vec::new();
    let mut space = false;
    for (index, token) in tokens.iter().enumerate() {
        if token.text.starts_with("[_") {
            continue;
        }
        if token.text.trim().is_empty() {
            space = true;
            continue;
        }
        let boundary = space || token.text.starts_with(char::is_whitespace);
        space = token.text.ends_with(char::is_whitespace);
        if boundary || groups.is_empty() {
            groups.push((String::new(), None));
        }
        let group = groups.last_mut().unwrap();
        group.0.push_str(token.text.trim());
        let offsets = token
            .offsets
            .as_ref()
            .filter(|o| o.from.is_finite() && o.to.is_finite() && o.from >= 0.0 && o.to >= o.from)
            .map(|o| (o.from / 1000.0, o.to / 1000.0));
        let timing = token
            .t_dtw
            .filter(|t| t.is_finite() && *t >= 0.0)
            .map(|t| {
                let from = t / 100.0;
                let next = tokens[index + 1..]
                    .iter()
                    .filter_map(|t| t.t_dtw)
                    .find(|t| t.is_finite() && *t / 100.0 > from)
                    .map(|t| t / 100.0)
                    .unwrap_or(end);
                let to = offsets
                    .map(|(_, to)| to)
                    .filter(|to| *to > from)
                    .unwrap_or(next)
                    .min(next);
                (from, to)
            })
            .or(offsets);
        if let Some((from, to)) = timing {
            let from = from.max(start);
            let to = to.min(end);
            if from < end && to >= from {
                group.1 = Some(match group.1 {
                    Some((old_start, old_end)) => (old_start.min(from), old_end.max(to)),
                    None => (from, to),
                });
            }
        }
    }
    let mut result: Vec<Word> = groups
        .into_iter()
        .filter_map(|(text, timing)| {
            let (start, end) = timing?;
            let text = clean_text(&text);
            (end > start && !text.is_empty()).then_some(Word { text, start, end })
        })
        .collect();
    result.sort_by(|a, b| a.start.total_cmp(&b.start));
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reconstruction_accepts_only_complete_cleaned_text() {
        let words = vec![
            Word {
                text: "Olá,".into(),
                start: 0.0,
                end: 0.5,
            },
            Word {
                text: "mundo!".into(),
                start: 0.5,
                end: 1.0,
            },
        ];
        assert!(reconstructs_text(" —Olá,\n  mundo! ", &words));
        for text in [
            "Olá, mundo! fim",
            "mundo! Olá,",
            "olá, mundo!",
            "Olá, mundo",
        ] {
            assert!(!reconstructs_text(text, &words));
        }
        assert!(!reconstructs_text("Olá, mundo!", &[]));
    }

    #[test]
    fn zero_length_boundary_does_not_join_following_words() {
        let tokens = serde_json::from_str(r#"[{"text":" Olá","offsets":{"from":100,"to":500}},{"text":" a","offsets":{"from":600,"to":600}},{"text":"gora","offsets":{"from":600,"to":1000}},{"text":" mundo","offsets":{"from":1300,"to":1900}}]"#).unwrap();
        let words = from_tokens(tokens, 0.0, 2.0);
        assert_eq!(
            words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>(),
            vec!["Olá", "agora", "mundo"]
        );
        assert_eq!(words[1].start, 0.6);
    }
    #[test]
    fn dtw_centiseconds_are_converted_and_keep_later_words() {
        let tokens = serde_json::from_str(r#"[{"text":" Olá","t_dtw":20,"offsets":{"from":0,"to":500}},{"text":" mundo","t_dtw":110,"offsets":{"from":700,"to":1600}}]"#).unwrap();
        let words = from_tokens(tokens, 0.0, 2.0);
        assert_eq!(words[0].start, 0.2);
        assert_eq!(words[0].end, 0.5);
        assert_eq!(words[1].start, 1.1);
    }
    #[test]
    fn cleans_dialogue_markers_but_keeps_compounds_and_negative_numbers() {
        assert_eq!(
            clean_text("-Olá, -mundo! bem-vindo -10 — sim"),
            "Olá, mundo! bem-vindo -10 sim"
        );
    }
    #[test]
    fn groups_real_subword_times_without_dividing_segment_duration() {
        let tokens = serde_json::from_str(r#"[{"text":" Ol","offsets":{"from":100,"to":200}},{"text":"á","offsets":{"from":200,"to":350}},{"text":" mundo","offsets":{"from":700,"to":1100}},{"text":"!","offsets":{"from":1100,"to":1100}}]"#).unwrap();
        let words = from_tokens(tokens, 0.0, 2.0);
        assert_eq!(words.len(), 2);
        assert_eq!(words[0].text, "Olá");
        assert_eq!(words[1].start, 0.7);
        assert_eq!(words[1].text, "mundo!");
    }
    #[test]
    fn full_json_word_times_survive_project_persistence_and_reload() {
        let json = r#"{"transcription":[{"offsets":{"from":0,"to":2000},"text":" Olá mundo","tokens":[{"text":" Olá","offsets":{"from":100,"to":400}},{"text":" mundo","offsets":{"from":900,"to":1400}}]}]}"#;
        let segments = super::super::parser::parse(json, 2.0).unwrap();
        let record = super::super::types::Transcript {
            version: 1,
            media_id: "media".into(),
            language: "pt".into(),
            model: "small".into(),
            segments,
        };
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("words-{}", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        super::super::store::save(&base, &id, &record, 2.0).unwrap();
        let loaded = super::super::store::load(&base, &id).unwrap().unwrap();
        assert_eq!(loaded.segments[0].words[1].start, 0.9);
        assert_eq!(loaded.segments[0].words[1].text, "mundo");
        std::fs::remove_dir_all(base).unwrap();
    }
}
