use super::store::{now, validate_target, BatchSaved, ClipDraft, EditorStore, Snapshot};
use super::types::Composition;
use std::collections::{BTreeMap, HashSet};

fn equal(a: &Composition, b: &Composition) -> Result<bool, String> {
    let mut left = serde_json::to_value(a).map_err(|error| error.to_string())?;
    let mut right = serde_json::to_value(b).map_err(|error| error.to_string())?;
    left["revision"] = serde_json::json!(0);
    right["revision"] = serde_json::json!(0);
    Ok(left == right)
}
fn revision(previous: Option<&Snapshot>, expected: u64) -> Result<(), String> {
    if previous.map(|value| value.document.revision).unwrap_or(0) != expected {
        return Err(
            "Um corte foi atualizado em outra sessão. Reabra antes de salvar o lote.".into(),
        );
    }
    Ok(())
}
fn snapshot(
    previous: Option<&Snapshot>,
    mut document: Composition,
    is_clip: bool,
) -> Result<Snapshot, String> {
    if let Some(previous) = previous {
        if equal(&previous.document, &document)? {
            return Ok(previous.clone());
        }
    }
    document.revision = previous
        .map(|value| value.document.revision)
        .unwrap_or(0)
        .checked_add(1)
        .ok_or("Revisão inválida")?;
    Ok(Snapshot {
        document,
        manually_edited: is_clip,
        edited_at_ms: now(),
        origin: previous.and_then(|value| value.origin.clone()),
        title: previous.and_then(|value| value.title.clone()),
        created_at_ms: previous.and_then(|value| value.created_at_ms),
        review: previous.and_then(|value| value.review.clone()),
        deleted: previous.and_then(|value| value.deleted),
    })
}
pub(super) fn save(
    store: &EditorStore,
    project: &str,
    clip: Option<&str>,
    document: Composition,
    expected_revision: u64,
    related: Vec<ClipDraft>,
    active_changed: bool,
) -> Result<BatchSaved, String> {
    validate_target(project, clip)?;
    document.validate()?;
    let mut ids = HashSet::new();
    for draft in &related {
        validate_target(project, Some(&draft.clip_id))?;
        draft.document.validate()?;
        if clip == Some(draft.clip_id.as_str()) || !ids.insert(draft.clip_id.clone()) {
            return Err("Alvo repetido no lote".into());
        }
    }
    store.transaction(project, move |state| {
        let previous = clip.and_then(|id| state.clips.get(id)).or_else(|| {
            if clip.is_none() {
                state.project.as_ref()
            } else {
                None
            }
        });
        revision(previous, expected_revision)?;
        if !active_changed {
            if let Some(value) = previous {
                if !equal(&value.document, &document)? {
                    return Err("O documento ativo foi alterado sem confirmar a edição.".into());
                }
            }
        }
        for draft in &related {
            revision(state.clips.get(&draft.clip_id), draft.expected_revision)?;
        }
        let active = if active_changed {
            Some(snapshot(previous, document, clip.is_some())?)
        } else {
            None
        };
        let mut saved = BTreeMap::new();
        for draft in related {
            saved.insert(
                draft.clip_id.clone(),
                snapshot(state.clips.get(&draft.clip_id), draft.document, true)?,
            );
        }
        if let Some(ref value) = active {
            if let Some(id) = clip {
                state.clips.insert(id.into(), value.clone());
            } else {
                state.project = Some(value.clone());
            }
        }
        state.clips.extend(saved.clone());
        Ok(BatchSaved {
            snapshot: active,
            related: saved,
        })
    })
}
