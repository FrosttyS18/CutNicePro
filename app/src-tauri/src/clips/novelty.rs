use super::types::Clip;
pub(crate) fn duplicate_of(existing: &[Clip], candidate: &Clip) -> bool {
    existing.iter().any(|old| {
        if old.id == candidate.id {
            return true;
        }
        if old.format != candidate.format {
            return false;
        }
        (old.start - candidate.start).abs() < 0.001 && (old.end - candidate.end).abs() < 0.001
    })
}
