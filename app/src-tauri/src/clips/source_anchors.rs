use super::selection::Candidate;
use crate::transcription::types::Segment;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    #[serde(rename = "title")]
    _title: String,
    opening_quote: String,
    closing_quote: String,
}

fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

#[cfg(test)]
pub fn quote_bounds(opening: &str, closing: &str, speech: &[Segment]) -> Option<(f64, f64)> {
    let source: Vec<_> = speech
        .iter()
        .enumerate()
        .flat_map(|(id, s)| words(&s.text).into_iter().map(move |word| (word, id)))
        .collect();
    let first = locate(opening, &source)?;
    let last = locate(closing, &source)?;
    if first.0 > last.0 || first.1 > last.1 {
        return None;
    }
    let start = timed_edge(first.0, false, &source, speech)?;
    let end = timed_edge(last.1, true, &source, speech)?;
    (start.is_finite() && end.is_finite() && start >= 0.0 && start < end).then_some((start, end))
}

#[cfg(test)]
fn timed_edge(
    index: usize,
    end: bool,
    source: &[(String, usize)],
    speech: &[Segment],
) -> Option<f64> {
    let row = source.get(index)?.1;
    let segment = speech.get(row)?;
    let offset = index - source.iter().position(|(_, id)| *id == row)?;
    let expected = words(&segment.text);
    let timed: Vec<_> = segment
        .words
        .iter()
        .flat_map(|word| {
            words(&word.text)
                .into_iter()
                .map(move |text| (text, word.start, word.end))
        })
        .collect();
    if timed.iter().map(|(text, _, _)| text).eq(expected.iter()) {
        let (_, start, stop) = timed.get(offset)?;
        if *start < segment.start || *stop > segment.end || start > stop {
            return None;
        }
        return Some(if end { *stop } else { *start });
    }
    if end && offset + 1 == expected.len() {
        Some(segment.end)
    } else if !end && offset == 0 {
        Some(segment.start)
    } else {
        None
    }
}

fn locate(quote: &str, source: &[(String, usize)]) -> Option<(usize, usize, usize, usize)> {
    let needle = words(quote);
    if !(4..=40).contains(&needle.len()) || needle.len() > source.len() {
        return None;
    }
    let mut matches = source
        .windows(needle.len())
        .enumerate()
        .filter(|(_, window)| {
            window
                .iter()
                .zip(&needle)
                .all(|((word, _), expected)| word == expected)
        });
    if let Some((index, found)) = matches.next() {
        if matches.next().is_some() {
            return None;
        }
        return Some((
            index,
            index + needle.len() - 1,
            found.first()?.1,
            found.last()?.1,
        ));
    }
    if needle.len() < 8 {
        return None;
    }
    let budget = (needle.len() / 5).min(2);
    let mut best: Option<(usize, usize, usize)> = None;
    for (index, (word, _)) in source.iter().enumerate() {
        if word != &needle[0] {
            continue;
        }
        for length in needle.len() - budget..=needle.len() + budget {
            let Some(window) = source.get(index..index + length) else {
                continue;
            };
            if window.last()?.0 != *needle.last()? {
                continue;
            }
            let Some(distance) = copy_distance(&needle, window, budget) else {
                continue;
            };
            if best.is_some() {
                return None;
            }
            best = Some((distance, index, length));
        }
    }
    let (distance, index, length) = best?;
    eprintln!("[clips] citação localizada com {distance} ajuste(s) de cópia; fonte preservada");
    Some((
        index,
        index + length - 1,
        source[index].1,
        source[index + length - 1].1,
    ))
}

fn copy_distance(needle: &[String], source: &[(String, usize)], budget: usize) -> Option<usize> {
    let mut previous: Vec<usize> = (0..=source.len()).collect();
    for (row, expected) in needle.iter().enumerate() {
        let mut current = vec![row + 1; source.len() + 1];
        for (column, (actual, _)) in source.iter().enumerate() {
            current[column + 1] = (previous[column + 1] + 1)
                .min(current[column] + 1)
                .min(previous[column] + usize::from(expected != actual));
        }
        if *current.iter().min()? > budget {
            return None;
        }
        previous = current;
    }
    previous
        .last()
        .copied()
        .filter(|distance| *distance <= budget)
}

pub fn resolve(drafts: Vec<Draft>, speech: &[Segment]) -> Vec<Candidate> {
    let source: Vec<_> = speech
        .iter()
        .enumerate()
        .flat_map(|(id, s)| words(&s.text).into_iter().map(move |word| (word, id)))
        .collect();
    drafts
        .into_iter()
        .filter_map(|draft| {
            let Some((first, last)) =
                locate(&draft.opening_quote, &source).zip(locate(&draft.closing_quote, &source))
            else {
                eprintln!(
                    "[clips] proposta recusada: citações ausentes ou ambíguas na transcrição"
                );
                return None;
            };
            if first.0 > last.0 || first.1 > last.1 {
                eprintln!("[clips] proposta recusada: fechamento anterior à abertura na fonte");
                return None;
            }
            Some(Candidate {
                moment: format!(
                    "{} — {}",
                    source[first.0..=first.1]
                        .iter()
                        .map(|(word, _)| word.as_str())
                        .collect::<Vec<_>>()
                        .join(" "),
                    source[last.0..=last.1]
                        .iter()
                        .map(|(word, _)| word.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                ),
                first_id: first.2,
                last_id: last.3,
                score: 0,
            })
        })
        .collect()
}

pub fn schema(limit: usize) -> serde_json::Value {
    serde_json::json!({"type":"object","additionalProperties":false,"required":["clips"],"properties":{
        "clips":{"type":"array","maxItems":limit,"items":{"type":"object","additionalProperties":false,
        "required":["title","openingQuote","closingQuote"],"properties":{
            "title":{"type":"string"},"openingQuote":{"type":"string"},"closingQuote":{"type":"string"}}}}}})
}

#[cfg(test)]
mod boundary_tests {
    use super::*;
    use crate::transcription::types::Word;

    #[test]
    fn an_anchor_stops_at_its_actual_word_before_a_new_clause_in_the_same_asr_row() {
        let mut speech = vec![
            Segment {
                id: "0".into(),
                start: 0.0,
                end: 4.0,
                text: "Comprei uma passagem para viajar.".into(),
                words: vec![],
            },
            Segment {
                id: "1".into(),
                start: 5.0,
                end: 12.0,
                text: "O voo cancelou e paguei um hotel. Mas e amanhã?".into(),
                words: vec![],
            },
        ];
        speech[1].words = speech[1]
            .text
            .split_whitespace()
            .enumerate()
            .map(|(i, text)| Word {
                text: text.into(),
                start: 5.0 + i as f64 * 0.5,
                end: 5.5 + i as f64 * 0.5,
            })
            .collect();
        assert_eq!(
            quote_bounds(
                "Comprei uma passagem para viajar",
                "voo cancelou e paguei um hotel",
                &speech
            ),
            Some((0.0, 8.5))
        );
        speech[1].words.clear();
        assert_eq!(
            quote_bounds(
                "Comprei uma passagem para viajar",
                "voo cancelou e paguei um hotel",
                &speech
            ),
            None
        );
        assert_eq!(
            quote_bounds(
                "voo cancelou e paguei um hotel",
                "Comprei uma passagem para viajar",
                &speech
            ),
            None
        );
    }
}
