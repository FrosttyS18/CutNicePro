use super::{expired, lock, save_tombstones, tombstones, ProjectLock};
use crate::{
    clips::{store, types::ClipCollection},
    editor::store::{EditorProject, EditorStore, Recovery},
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

fn remove_file(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Não foi possível limpar o clipe excluído: {error}")),
    }
}

fn cleanup_files(base: &Path, project: &str, purged: &BTreeSet<String>) -> Result<(), String> {
    let folder = base.join("cutnicepro/editor-thumbnails").join(project);
    if folder
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("A pasta de miniaturas não pode ser um link".into());
    }
    for id in purged {
        remove_file(&folder.join(format!("{id}.json")))?;
    }
    let folder = base.join("cutnicepro/editor/recovery");
    for entry in fs::read_dir(folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(target) = name
            .strip_prefix(&format!("{project}-"))
            .and_then(|value| value.strip_suffix(".json"))
        else {
            continue;
        };
        if target != "project"
            && crate::editor::store::validate_target(project, Some(target)).is_err()
        {
            continue;
        }
        if purged.contains(target) {
            remove_file(&entry.path())?;
            continue;
        }
        let mut recovery: Recovery =
            serde_json::from_slice(&fs::read(entry.path()).map_err(|error| error.to_string())?)
                .map_err(|_| "Não foi possível limpar uma recuperação de clipe")?;
        let before = recovery.related.len();
        recovery
            .related
            .retain(|draft| !purged.contains(&draft.clip_id));
        if before != recovery.related.len() {
            crate::file_output::atomic_write(&entry.path(), |file| {
                serde_json::to_writer(file, &recovery).map_err(|error| error.to_string())
            })?;
        }
    }
    Ok(())
}

fn synchronize(
    collection: &mut Option<ClipCollection>,
    editor: &mut EditorProject,
    now: u64,
) -> BTreeMap<String, (bool, Option<u64>)> {
    let mut values = BTreeMap::new();
    if let Some(collection) = collection.as_ref() {
        for clip in &collection.clips {
            values.insert(
                clip.id.clone(),
                (clip.deleted.unwrap_or(false), clip.deleted_at_ms),
            );
        }
    }
    for (id, snapshot) in &editor.clips {
        let previous = values.get(id).copied().unwrap_or_default();
        values.insert(
            id.clone(),
            (
                snapshot.deleted.unwrap_or(previous.0),
                snapshot.deleted_at_ms.or(previous.1),
            ),
        );
    }
    for (deleted, date) in values.values_mut() {
        *date = if *deleted {
            Some(date.filter(|at| *at > 0).unwrap_or(now))
        } else {
            None
        };
    }
    apply_metadata(collection, editor, &values);
    values
}

fn apply_metadata(
    collection: &mut Option<ClipCollection>,
    editor: &mut EditorProject,
    values: &BTreeMap<String, (bool, Option<u64>)>,
) {
    if let Some(collection) = collection {
        for clip in &mut collection.clips {
            if let Some((deleted, date)) = values.get(&clip.id) {
                if *deleted || clip.deleted.is_some() {
                    clip.deleted = Some(*deleted);
                }
                clip.deleted_at_ms = *date;
            }
        }
    }
    for (id, snapshot) in &mut editor.clips {
        if let Some((deleted, date)) = values.get(id) {
            if *deleted || snapshot.deleted.is_some() {
                snapshot.deleted = Some(*deleted);
            }
            snapshot.deleted_at_ms = *date;
        }
    }
}

fn persist(
    base: &Path,
    project: &str,
    guard: &ProjectLock,
    collection: &mut Option<ClipCollection>,
    state: &mut EditorProject,
    purged: BTreeSet<String>,
) -> Result<(), String> {
    if !purged.is_empty() {
        save_tombstones(base, project, purged.clone())?;
        if let Some(collection) = collection {
            collection.clips.retain(|clip| !purged.contains(&clip.id));
        }
        state.clips.retain(|id, _| !purged.contains(id));
        cleanup_files(base, project, &purged)?;
    }
    if let Some(collection) = collection {
        store::write_locked(base, project, collection, guard)?;
    }
    Ok(())
}

pub(crate) fn cleanup_at(base: &Path, project: &str, now: u64) -> Result<usize, String> {
    if now == 0 {
        return Err("Não foi possível confirmar a data para limpar a lixeira".into());
    }
    let guard = lock(base, project)?;
    let mut collection = store::read_raw(base, project)?;
    let existing = tombstones(base, project)?;
    EditorStore::open(base)?.trash_transaction(project, &guard, |state| {
        let values = synchronize(&mut collection, state, now);
        let mut purged = existing.clone();
        purged.extend(
            values
                .iter()
                .filter(|(_, (deleted, at))| *deleted && at.is_some_and(|at| expired(at, now)))
                .map(|(id, _)| id.clone()),
        );
        let count = purged.len() - existing.len();
        persist(base, project, &guard, &mut collection, state, purged)?;
        Ok(count)
    })
}

pub(crate) fn purge(base: &Path, project: &str, id: &str) -> Result<(), String> {
    crate::editor::store::validate_target(project, Some(id))?;
    let guard = lock(base, project)?;
    let mut collection = store::read_raw(base, project)?;
    let mut purged = tombstones(base, project)?;
    EditorStore::open(base)?.trash_transaction(project, &guard, |state| {
        let values = synchronize(&mut collection, state, crate::editor::store::now());
        if !purged.contains(id) && !values.get(id).is_some_and(|value| value.0) {
            return Err("Mova o clipe para a lixeira antes de excluir permanentemente.".into());
        }
        purged.insert(id.into());
        persist(base, project, &guard, &mut collection, state, purged)
    })
}

pub(crate) fn set_deleted(
    base: &Path,
    project: &str,
    id: &str,
    deleted: bool,
    now: u64,
) -> Result<(), String> {
    crate::editor::store::validate_target(project, Some(id))?;
    cleanup_at(base, project, now)?;
    let guard = lock(base, project)?;
    super::ensure_live(base, project, id)?;
    let mut collection = store::read_raw(base, project)?;
    EditorStore::open(base)?.trash_transaction(project, &guard, |state| {
        let mut values = synchronize(&mut collection, state, now);
        let current = values.get_mut(id).ok_or("Clipe não encontrado")?;
        let date = if deleted {
            Some(if current.0 {
                current.1.unwrap_or(now)
            } else {
                now
            })
        } else {
            None
        };
        *current = (deleted, date);
        apply_metadata(&mut collection, state, &values);
        if let Some(collection) = &collection {
            store::write_locked(base, project, collection, &guard)?;
        }
        Ok(())
    })
}
