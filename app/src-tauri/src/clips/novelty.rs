use super::types::Clip;
use crate::transcription::types::Segment;

fn speech_units(segments: &[Segment], start: f64, end: f64) -> std::collections::BTreeSet<&str> {
    segments
        .iter()
        .filter(|s| s.start < end && s.end > start)
        .map(|s| s.id.as_str())
        .collect()
}

pub(crate) fn duplicate_of(existing: &[Clip], candidate: &Clip, segments: &[Segment]) -> bool {
    let units = speech_units(segments, candidate.start, candidate.end);
    existing.iter().any(|old| {
        if old.id == candidate.id {
            return true;
        }
        if old.format != candidate.format {
            return false;
        }
        let overlap = old.end.min(candidate.end) - old.start.max(candidate.start);
        if overlap <= 0.0
            || overlap / (old.end.max(candidate.end) - old.start.min(candidate.start)) < 0.75
        {
            return false;
        }
        let old_units = speech_units(segments, old.start, old.end);
        units.iter().all(|unit| old_units.contains(unit))
    })
}
