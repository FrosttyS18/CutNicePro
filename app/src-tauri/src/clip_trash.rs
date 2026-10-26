use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

pub mod commands;
mod lifecycle;
#[cfg(test)]
mod tests;

pub const RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1000;

pub(crate) struct ProjectLock {
    _file: fs::File,
    project: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Tombstones {
    version: u8,
    ids: BTreeSet<String>,
}

fn path(base: &Path, project: &str) -> Result<PathBuf, String> {
    crate::editor::store::validate_target(project, None)?;
    Ok(base
        .join("cutnicepro/clip-trash")
        .join(format!("{project}.json")))
}

pub(crate) fn lock(base: &Path, project: &str) -> Result<ProjectLock, String> {
    crate::editor::store::validate_target(project, None)?;
    let target = base
        .join("cutnicepro/editor")
        .join(format!("{project}.lock"));
    fs::create_dir_all(target.parent().ok_or("Pasta da lixeira inválida")?)
        .map_err(|error| error.to_string())?;
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(target)
        .map_err(|error| error.to_string())?;
    fs2::FileExt::lock_exclusive(&file).map_err(|error| error.to_string())?;
    Ok(ProjectLock {
        _file: file,
        project: project.into(),
    })
}

pub(crate) fn tombstones(base: &Path, project: &str) -> Result<BTreeSet<String>, String> {
    let bytes = match fs::read(path(base, project)?) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeSet::new()),
        Err(error) => return Err(error.to_string()),
    };
    let value: Tombstones = serde_json::from_slice(&bytes)
        .map_err(|_| "Não foi possível ler o histórico de exclusões permanentes")?;
    if value.version != 1
        || value
            .ids
            .iter()
            .any(|id| crate::editor::store::validate_target(project, Some(id)).is_err())
    {
        return Err("Histórico de exclusões permanentes inválido".into());
    }
    Ok(value.ids)
}

pub(crate) fn ensure_live(base: &Path, project: &str, clip: &str) -> Result<(), String> {
    crate::editor::store::validate_target(project, Some(clip))?;
    if tombstones(base, project)?.contains(clip) {
        return Err("Este clipe foi excluído permanentemente. Atualize a biblioteca.".into());
    }
    Ok(())
}

pub(crate) fn verify_lock(guard: &ProjectLock, project: &str) -> Result<(), String> {
    if guard.project != project {
        return Err("Bloqueio da lixeira inválido".into());
    }
    Ok(())
}

fn save_tombstones(base: &Path, project: &str, ids: BTreeSet<String>) -> Result<(), String> {
    let target = path(base, project)?;
    fs::create_dir_all(target.parent().ok_or("Pasta da lixeira inválida")?)
        .map_err(|error| error.to_string())?;
    let bytes =
        serde_json::to_vec(&Tombstones { version: 1, ids }).map_err(|error| error.to_string())?;
    if fs::read(&target).is_ok_and(|current| current == bytes) {
        return Ok(());
    }
    crate::file_output::atomic_write(&target, |file| {
        use std::io::Write;
        file.write_all(&bytes).map_err(|error| error.to_string())
    })
}

pub(crate) fn expired(deleted_at: u64, now: u64) -> bool {
    now.checked_sub(deleted_at)
        .is_some_and(|elapsed| elapsed >= RETENTION_MS)
}

pub(crate) use lifecycle::{cleanup_at, purge, set_deleted};
