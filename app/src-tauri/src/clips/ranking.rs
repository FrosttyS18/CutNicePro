use super::types::{Clip, Options, Review};
use crate::transcription::types::Segment;
use sha2::{Digest, Sha256};

fn opening(text: &str) -> u8 {
    let first = text
        .split_whitespace()
        .take(22)
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let hooks = [
        "por que", "porque", "como", "segredo", "verdade", "ninguém", "melhor", "pior", "erro",
        "nunca", "imagine", "sabia", "olha", "olhe",
    ];
    let hits = hooks
        .iter()
        .filter(|word| {
            first
                .split(|c: char| !c.is_alphanumeric())
                .collect::<Vec<_>>()
                .windows(word.split_whitespace().count())
                .any(|parts| parts.join(" ") == **word)
        })
        .count();
    (hits.min(3) as u8 * 5) + if first.contains('?') { 8 } else { 0 }
}

pub fn select(
    segments: &[Segment],
    media: &str,
    duration: f64,
    scenes: &[f64],
    options: &Options,
) -> Result<Vec<Clip>, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    let mut candidates = Vec::new();
    let mut finish = 0;
    for (i, first) in segments.iter().enumerate() {
        finish = finish.max(i);
        while finish < segments.len() && segments[finish].end - first.start < options.min_seconds {
            finish += 1;
        }
        if finish == segments.len() {
            break;
        }
        let mut best: Option<Clip> = None;
        for last in segments.iter().skip(finish).take(24) {
            let length = last.end - first.start;
            if length > options.max_seconds {
                break;
            }
            let end_index = segments[i..].partition_point(|s| s.start < last.end) + i;
            let selected = &segments[i..end_index];
            let text = selected
                .iter()
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            let spoken = selected
                .iter()
                .map(|s| s.end - s.start)
                .sum::<f64>()
                .min(length);
            let density = text.split_whitespace().count() as f64 / length;
            if density < 0.45 || spoken / length < 0.45 {
                continue;
            }
            let hook = opening(&first.text);
            let complete = last.text.trim_end().ends_with(['.', '!', '?', '…']);
            let boundary = scenes
                .iter()
                .any(|t| (t - first.start).abs() < 1.5 || (t - last.end).abs() < 1.5);
            let cadence = if (1.3..=3.8).contains(&density) {
                15
            } else {
                6
            };
            let score =
                35 + hook + if complete { 15 } else { 0 } + cadence + if boundary { 5 } else { 0 };
            let mut identity = format!("{media}:{:.3}:{:.3}", first.start, last.end);
            if let Some(format) = &options.format {
                identity.push(':');
                identity.push_str(format);
            }
            let id = format!("{:x}", Sha256::digest(identity));
            let mut reasons = vec![format!("Ritmo de {density:.1} palavras por segundo")];
            if hook > 0 {
                reasons.push("Abertura com pergunta ou expressão de destaque".into());
                reasons.push(format!(
                    "Abertura: “{}”",
                    first.text.chars().take(180).collect::<String>()
                ));
            }
            if complete {
                reasons.push("Final com frase concluída".into());
            }
            if boundary {
                reasons.push("Limite próximo de uma mudança de cena".into());
            }
            let clip = Clip {
                id,
                start: first.start,
                end: last.end.min(duration),
                title: String::new(),
                score: score.min(99),
                reasons,
                review: Review::Pending,
                format: options.format.clone(),
                analysis: None,
                analysis_error: None,
            };
            if best.as_ref().is_none_or(|old| {
                clip.score > old.score || (clip.score == old.score && length < old.end - old.start)
            }) {
                best = Some(clip);
            }
        }
        if let Some(clip) = best {
            candidates.push(clip);
        }
    }
    candidates.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.start.total_cmp(&b.start))
    });
    let mut result: Vec<Clip> = Vec::new();
    for mut candidate in candidates {
        if result
            .iter()
            .any(|other| candidate.start < other.end && candidate.end > other.start)
        {
            continue;
        }
        let first = segments.partition_point(|segment| segment.start < candidate.start);
        let last = segments.partition_point(|segment| segment.start < candidate.end);
        candidate.title = super::content::title(&segments[first..last], segments);
        result.push(candidate);
        if result.len() == options.count {
            break;
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn speech() -> Vec<Segment> {
        (0..30)
            .map(|i| Segment {
                id: i.to_string(),
                start: i as f64 * 5.0,
                end: i as f64 * 5.0 + 4.8,
                text: if i == 12 {
                    "Por que ninguém fala a verdade sobre esse erro?".into()
                } else {
                    "Esta história tem detalhes que explicam o que aconteceu com a equipe.".into()
                },
                words: vec![],
            })
            .collect()
    }
    #[test]
    fn ranks_actual_boundaries_and_suppresses_overlapping_clips() {
        let clips = select(
            &speech(),
            "media",
            150.0,
            &[60.0],
            &Options {
                min_seconds: 20.0,
                max_seconds: 40.0,
                count: 4,
                format: Some("9:16".into()),
                quality: None,
            },
        )
        .unwrap();
        assert_eq!(clips[0].start, 60.0);
        assert!(clips.iter().all(|c| c.start >= 0.0
            && c.end <= 150.0
            && c.end - c.start >= 20.0
            && c.end - c.start <= 40.0));
        for (i, a) in clips.iter().enumerate() {
            assert!(clips
                .iter()
                .skip(i + 1)
                .all(|b| a.start >= b.end || a.end <= b.start));
        }
        assert_eq!(
            clips[0].id,
            select(
                &speech(),
                "media",
                150.0,
                &[60.0],
                &Options {
                    min_seconds: 20.0,
                    max_seconds: 40.0,
                    count: 4,
                    format: Some("9:16".into()),
                    quality: None,
                }
            )
            .unwrap()[0]
                .id
        );
        assert!(!clips[0].reasons.is_empty());
    }
    #[test]
    fn empty_or_short_speech_and_invalid_options_do_not_fabricate_results() {
        assert!(select(
            &[],
            "m",
            10.0,
            &[],
            &Options {
                min_seconds: 20.0,
                max_seconds: 40.0,
                count: 3,
                format: None,
                quality: None,
            }
        )
        .unwrap()
        .is_empty());
        assert!(Options {
            min_seconds: f64::NAN,
            max_seconds: 40.0,
            count: 3,
            format: None,
            quality: None,
        }
        .validate()
        .is_err());
        assert!(Options {
            min_seconds: 10.0,
            max_seconds: 200.0,
            count: 3,
            format: None,
            quality: None,
        }
        .validate()
        .is_err());
    }
    #[test]
    fn format_is_part_of_clip_identity_and_rejects_unknown_formats() {
        let mut options = Options {
            min_seconds: 20.0,
            max_seconds: 40.0,
            count: 1,
            format: Some("9:16".into()),
            quality: None,
        };
        let vertical = select(&speech(), "m", 150.0, &[], &options).unwrap();
        options.format = Some("1:1".into());
        let square = select(&speech(), "m", 150.0, &[], &options).unwrap();
        assert_ne!(vertical[0].id, square[0].id);
        assert_eq!(vertical[0].format.as_deref(), Some("9:16"));
        options.format = Some("3:4".into());
        assert!(options.validate().is_err());
    }
}
