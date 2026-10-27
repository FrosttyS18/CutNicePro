use crate::transcription::types::{Segment, Word};

#[derive(Clone)]
pub(super) struct Token {
    pub text: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
}

pub(super) struct Cue {
    pub start: f64,
    pub end: f64,
    pub words: Vec<Token>,
}

fn lexical(text: &str) -> String {
    text.chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn clean(text: &str) -> &str {
    let stripped = text.trim_start_matches(['-', '–', '—']);
    if stripped.is_empty() || stripped.starts_with(char::is_alphabetic) {
        stripped
    } else {
        text
    }
}

fn tokens(segment: &Segment, start: f64, end: f64) -> Vec<Token> {
    let source: Vec<Word> = segment
        .words
        .iter()
        .flat_map(|word| {
            word.text.split_whitespace().map(|text| Word {
                text: text.into(),
                start: word.start,
                end: word.end,
            })
        })
        .collect();
    let mut cursor = 0;
    let all: Vec<Token> = segment
        .text
        .split_whitespace()
        .map(clean)
        .filter(|text| !text.is_empty())
        .map(|text| {
            let key = lexical(text);
            let found = (cursor..source.len().min(cursor + 8))
                .find(|index| !key.is_empty() && lexical(&source[*index].text) == key);
            let word = found.and_then(|index| {
                cursor = index + 1;
                let word = &source[index];
                (word.start.is_finite() && word.end.is_finite() && word.end > word.start)
                    .then_some(word)
            });
            Token {
                text: text.into(),
                start: word.map(|word| word.start),
                end: word.map(|word| word.end),
            }
        })
        .collect();
    if all.iter().all(|word| word.start.is_none()) {
        return all;
    }
    let mut following = vec![segment.end; all.len()];
    let mut next = segment.end;
    for (index, word) in all.iter().enumerate().rev() {
        following[index] = next;
        if let Some(start) = word.start {
            next = start;
        }
    }
    let mut previous = segment.start;
    all.into_iter()
        .enumerate()
        .filter_map(|(index, mut word)| {
            if let (Some(from), Some(until)) = (word.start, word.end) {
                previous = until;
                if until <= start || from >= end {
                    return None;
                }
                word.start = Some(from.max(start));
                word.end = Some(until.min(end));
                Some(word)
            } else {
                (previous >= start && following[index] <= end).then_some(word)
            }
        })
        .collect()
}

pub(super) fn groups(segment: &Segment, from: f64, until: f64, per_caption: usize) -> Vec<Cue> {
    let start = segment.start.max(from);
    let end = segment.end.min(until);
    if end <= start {
        return Vec::new();
    }
    let mut grouped: Vec<Vec<Token>> = Vec::new();
    let mut current = Vec::new();
    let mut first = None;
    let mut last = None;
    for word in tokens(segment, start, end) {
        let can_advance = word
            .start
            .zip(first)
            .is_some_and(|(next, first)| next > first);
        let pause = word
            .start
            .zip(last)
            .is_some_and(|(next, last)| next - last > 0.6);
        if can_advance && (current.len() >= per_caption || pause) {
            grouped.push(current);
            current = Vec::new();
            first = None;
            last = None;
        }
        if first.is_none() {
            first = word.start;
        }
        if word.end.is_some() {
            last = word.end;
        }
        current.push(word);
    }
    if !current.is_empty() {
        grouped.push(current);
    }
    let starts: Vec<f64> = grouped
        .iter()
        .enumerate()
        .map(|(index, words)| {
            if index == 0 {
                start
            } else {
                words.iter().find_map(|word| word.start).unwrap()
            }
        })
        .collect();
    grouped
        .into_iter()
        .enumerate()
        .map(|(index, words)| Cue {
            start: starts[index],
            end: starts.get(index + 1).copied().unwrap_or(end),
            words,
        })
        .collect()
}
