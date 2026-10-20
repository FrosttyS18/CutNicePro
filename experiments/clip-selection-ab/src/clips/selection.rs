use super::{
    text_engine,
    types::{Clip, Options, Review},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::Deserialize;
use std::{ops::Range, path::Path};

pub fn windows(segments: &[Segment], overlap: f64) -> Vec<Range<usize>> {
    let mut result = Vec::new();
    let mut start = 0;
    while start < segments.len() {
        let mut end = start;
        let mut chars = 0;
        while end < segments.len()
            && (end == start
                || (chars + segments[end].text.len() + 40 < 18000
                    && segments[end].end - segments[start].start <= 600.0))
        {
            chars += segments[end].text.len() + 40;
            end += 1;
        }
        result.push(start..end);
        if end == segments.len() {
            break;
        }
        let span = segments[end - 1].end - segments[start].start;
        let boundary = segments[end - 1].end - overlap.min(span / 2.0);
        start = (start + 1..end)
            .find(|&i| segments[i].start >= boundary)
            .unwrap_or(end);
    }
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Candidate {
    pub(crate) first_id: usize,
    pub(crate) last_id: usize,
    pub(crate) score: u8,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Reply {
    pub(crate) candidates: Vec<Candidate>,
}

pub(crate) fn materialize(
    candidate: Candidate,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
) -> Option<Clip> {
    if candidate.first_id > candidate.last_id || candidate.score > 100 {
        return None;
    }
    let first = segments.get(candidate.first_id)?;
    let last = segments.get(candidate.last_id)?;
    let end = segments[candidate.first_id..]
        .iter()
        .filter(|s| {
            s.end - first.start >= options.min_seconds && s.end - first.start <= options.max_seconds
        })
        .min_by(|a, b| {
            (a.end - last.end)
                .abs()
                .total_cmp(&(b.end - last.end).abs())
        })?
        .end
        .min(duration);
    if end - first.start < options.min_seconds {
        return None;
    }
    Some(Clip {
        id: super::types::identity(media, first.start, end, options.format.as_deref()),
        start: first.start,
        end,
        title: format!(
            "Trecho {:02}:{:02}",
            (first.start / 60.0) as u64,
            (first.start as u64) % 60
        ),
        score: candidate.score,
        reasons: Vec::new(),
        review: Review::Pending,
        format: options.format.clone(),
        analysis: None,
        analysis_error: None,
    })
}

pub fn select(
    base: &Path,
    scratch: &Path,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<Vec<Clip>, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    let ranges = windows(segments, options.max_seconds);
    let mut all = Vec::new();
    for (index, range) in ranges.iter().enumerate() {
        control.check()?;
        let ids = range.clone().collect::<Vec<_>>();
        let limit = (options.count * 2).min(12);
        let data = serde_json::json!({"minSeconds":options.min_seconds,"maxSeconds":options.max_seconds,"limit":limit,
            "speech":range.clone().map(|id|serde_json::json!([id,segments[id].start,segments[id].end,segments[id].text])).collect::<Vec<_>>()});
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["candidates"],"properties":{"candidates":{"type":"array","maxItems":limit,"items":{
            "type":"object","additionalProperties":false,"required":["firstId","lastId","score"],"properties":{
                "firstId":{"type":"integer","enum":ids},"lastId":{"type":"integer","enum":ids},"score":{"type":"integer","minimum":0,"maximum":100}}}}}});
        let prompt = text_engine::prompt(include_str!("selection-prompt.txt"), &data)?;
        let output = text_engine::generate(
            base,
            scratch,
            &format!("selection-{index}"),
            &prompt,
            &schema,
            1800,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<Reply>()
            .next()
            .ok_or("Não foi possível selecionar os momentos. Tente novamente.")?
            .map_err(|_| "Não foi possível selecionar os momentos. Tente novamente.")?;
        for candidate in reply.candidates.into_iter().take(limit) {
            if range.contains(&candidate.first_id) && range.contains(&candidate.last_id) {
                if let Some(clip) = materialize(candidate, segments, media, duration, options) {
                    all.push(clip);
                }
            }
        }
        progress(((index + 1) * 100 / ranges.len().max(1)) as u8);
    }
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let mut selected: Vec<Clip> = Vec::new();
    for clip in all {
        if selected
            .iter()
            .all(|other| clip.start >= other.end || clip.end <= other.start)
        {
            selected.push(clip);
        }
        if selected.len() == options.count {
            break;
        }
    }
    if selected.is_empty() {
        return Err("Não encontramos trechos completos nesta duração. Aumente a duração dos cortes e tente novamente.".into());
    }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_cover_all_speech_with_overlap_and_bounded_size() {
        let segments = (0..1200)
            .map(|id| Segment {
                id: id.to_string(),
                start: id as f64 * 4.0,
                end: id as f64 * 4.0 + 3.0,
                text: "Uma conversa com conteúdo durante todo o vídeo.".into(),
                words: vec![],
            })
            .collect::<Vec<_>>();
        let ranges = windows(&segments, 180.0);
        assert!(ranges.len() > 1);
        assert!(segments
            .iter()
            .enumerate()
            .all(|(i, _)| ranges.iter().any(|r| r.contains(&i))));
        for pair in ranges.windows(2) {
            assert!(pair[0].end > pair[1].start);
        }
        assert!(ranges.iter().all(|range| segments[range.clone()]
            .iter()
            .map(|s| s.text.len())
            .sum::<usize>()
            < 14000));
    }
}
