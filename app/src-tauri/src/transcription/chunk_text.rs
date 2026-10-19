use super::{checkpoints::Chunk, types::Segment};

pub fn append(target: &mut Vec<Segment>, segments: Vec<Segment>, chunk: &Chunk, index: usize) {
    for (part, mut segment) in segments.into_iter().enumerate() {
        if segment.words.is_empty() {
            let middle = (segment.start + segment.end) / 2.0 + chunk.audio_start;
            if middle < chunk.start || middle >= chunk.end {
                continue;
            }
            segment.start += chunk.audio_start;
            segment.end += chunk.audio_start;
        } else {
            let original = segment.words.len();
            segment.words.retain_mut(|word| {
                word.start += chunk.audio_start;
                word.end += chunk.audio_start;
                let middle = (word.start + word.end) / 2.0;
                middle >= chunk.start && middle < chunk.end
            });
            if segment.words.is_empty() {
                continue;
            }
            if original != segment.words.len() {
                segment.text = segment
                    .words
                    .iter()
                    .map(|word| word.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                segment.start = segment.words[0].start;
                segment.end = segment.words.last().unwrap().end;
            } else {
                segment.start += chunk.audio_start;
                segment.end += chunk.audio_start;
            }
        }
        segment.id = format!("chunk-{index}-{part}");
        target.push(segment);
    }
    target.sort_by(|a, b| a.start.total_cmp(&b.start));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcription::types::Word;
    #[test]
    fn context_words_belong_to_one_core_and_keep_absolute_timing() {
        let make = |offset: f64| Segment {
            id: "s".into(),
            start: 179.0 - offset,
            end: 182.0 - offset,
            text: "antes depois".into(),
            words: vec![
                Word {
                    text: "antes".into(),
                    start: 179.0 - offset,
                    end: 179.5 - offset,
                },
                Word {
                    text: "depois".into(),
                    start: 180.5 - offset,
                    end: 181.0 - offset,
                },
            ],
        };
        let plan = super::super::checkpoints::chunks(260.0);
        let mut result = vec![];
        append(&mut result, vec![make(0.0)], &plan[0], 0);
        append(&mut result, vec![make(178.0)], &plan[1], 1);
        assert_eq!(
            result.iter().map(|s| s.text.as_str()).collect::<Vec<_>>(),
            vec!["antes", "depois"]
        );
        assert_eq!(result[1].words[0].start, 180.5);
        super::super::parser::validate(&result, 260.0).unwrap();
    }
}
