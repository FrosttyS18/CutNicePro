use super::types::Clip;
use crate::transcription::types::Segment;
use std::collections::{HashMap, HashSet};

fn terms(text: &str) -> Vec<String> {
    let stop: HashSet<&str> = "a ao aos as o os de do da dos das e em no na nos nas um uma uns umas que por para com como eu você vocês ele ela eles elas isso esse essa esses essas aqui ali então assim aí não sim mas mais muito bem gente vai foi ser está tem uma quando porque todo tudo só se pra tava tá né pelo pela também meu sua seu já agora ainda coisa acontece".split_whitespace().collect();
    text.split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|word| word.chars().count() > 3 && !stop.contains(word.as_str()))
        .collect()
}

pub fn title(selected: &[Segment], all: &[Segment]) -> String {
    let mut frequency: HashMap<String, usize> = HashMap::new();
    for segment in selected {
        for word in terms(&segment.text) {
            *frequency.entry(word).or_default() += 1;
        }
    }
    let mut document_frequency: HashMap<String, usize> = HashMap::new();
    for segment in all {
        for word in terms(&segment.text).into_iter().collect::<HashSet<_>>() {
            *document_frequency.entry(word).or_default() += 1;
        }
    }
    let mut candidates = Vec::new();
    for segment in selected {
        for sentence in segment.text.split_inclusive(['.', '?', '!']) {
            let sentence = sentence.trim().trim_start_matches(['-', '—', ' ']);
            let words = sentence.split_whitespace().count();
            if !(4..=22).contains(&words) || sentence.chars().count() > 125 {
                continue;
            }
            let meaningful = terms(sentence).into_iter().collect::<HashSet<_>>();
            if meaningful.is_empty() {
                continue;
            }
            let score: f64 = meaningful
                .iter()
                .map(|word| {
                    let local = *frequency.get(word).unwrap_or(&1) as f64;
                    let corpus = *document_frequency.get(word).unwrap_or(&1) as f64;
                    local * ((all.len() as f64 + 1.0) / (corpus + 1.0)).ln().max(0.15)
                })
                .sum::<f64>()
                / (words as f64).sqrt();
            candidates.push((score, sentence));
        }
    }
    if let Some((_, sentence)) = candidates.into_iter().max_by(|a, b| a.0.total_cmp(&b.0)) {
        return sentence.into();
    }
    let mut keywords = frequency.into_iter().collect::<Vec<_>>();
    keywords.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let text = keywords
        .into_iter()
        .take(5)
        .map(|(word, _)| word)
        .collect::<Vec<_>>()
        .join(" · ");
    if text.is_empty() {
        "Conversa em destaque".into()
    } else {
        let mut chars = text.chars();
        chars.next().unwrap().to_uppercase().collect::<String>() + chars.as_str()
    }
}

pub fn refresh_legacy_titles(clips: &mut [Clip], segments: &[Segment]) {
    for clip in clips {
        if clip.analysis.is_some() {
            continue;
        }
        let first = segments.partition_point(|segment| segment.start < clip.start);
        let last = segments.partition_point(|segment| segment.start < clip.end);
        let Some(opening) = segments.get(first).filter(|_| first < last) else {
            continue;
        };
        let legacy = opening
            .text
            .trim_start_matches(['-', '—', ' '])
            .split_whitespace()
            .take(12)
            .collect::<Vec<_>>()
            .join(" ");
        if clip.title == legacy {
            clip.title = title(&segments[first..last], segments);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_subject_from_whole_clip_instead_of_first_words() {
        let lines = [
            "Bom, galera, vamos conversar sobre isso agora.",
            "O Battlefield perdeu jogadores depois da atualização.",
            "A atualização do Battlefield trouxe problemas aos jogadores.",
        ];
        let segments = lines
            .into_iter()
            .enumerate()
            .map(|(i, text)| Segment {
                id: i.to_string(),
                start: i as f64,
                end: i as f64 + 1.0,
                text: text.into(),
                words: vec![],
            })
            .collect::<Vec<_>>();
        let result = title(&segments, &segments);
        assert!(result.contains("Battlefield"));
        assert!(!result.starts_with("Bom, galera"));
        assert!(lines.contains(&result.as_str()));
        let clip = Clip {
            id: "a".repeat(64),
            start: 0.0,
            end: 3.0,
            title: lines[0].into(),
            score: 80,
            reasons: vec![],
            review: super::super::types::Review::Pending,
            format: None,
            fit: None,
            analysis: None,
            analysis_error: None,
            analysis_signature: None,
            analysis_stale: None,
            deleted: None,
            engine: None,
        };
        let mut clips = vec![
            clip.clone(),
            Clip {
                title: "Título escolhido pelo usuário".into(),
                ..clip
            },
        ];
        refresh_legacy_titles(&mut clips, &segments);
        assert_eq!(clips[0].title, result);
        assert_eq!(clips[1].title, "Título escolhido pelo usuário");
    }
    #[test]
    fn never_adds_topics_not_in_source() {
        let segments = vec![Segment {id:"s".into(),start:0.0,end:2.0,text:"Só futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol futebol".into(),words:vec![]}];
        assert_eq!(title(&segments, &segments), "Futebol");
    }
}
