use super::{export_snapshot, render_graph, render_plan::Window, store::EditorStore};
mod jobs;
#[cfg(test)]
#[path = "thumbnail/reference_tests.rs"]
mod reference_tests;
use crate::{
    media_store::MediaStore,
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
pub use jobs::ThumbnailJobs;
use serde::{Deserialize, Serialize};
use std::{path::Path, process::Command, sync::Arc};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
struct CachedThumbnail {
    revision: u64,
    bytes: Vec<u8>,
}

pub(super) fn create(
    base: &Path,
    document: &super::types::Composition,
    sources: &std::collections::HashMap<String, std::path::PathBuf>,
    control: &ProcessControl,
) -> Result<Vec<u8>, String> {
    control.check()?;
    let scratch = Scratch::new(base)?;
    crate::render::fonts::prepare(&scratch.path)?;
    let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg não encontrado")?;
    let executable = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let mut command = Command::new(&executable);
    command.current_dir(&scratch.path).args(render_graph::video(
        document,
        &Window { start: 0, end: 1 },
        sources,
        &scratch.path,
        0,
        Encoder::Cpu,
    )?);
    control.run(command, &scratch.path.join("thumbnail-frame.log"))?;
    let mut command = Command::new(&executable);
    command.current_dir(&scratch.path).args([
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        "part-0.mp4",
        "-frames:v",
        "1",
        "-vf",
        "scale=320:-2",
        "-threads",
        "1",
        "thumbnail.jpg",
    ]);
    control.run(command, &scratch.path.join("thumbnail-image.log"))?;
    std::fs::read(scratch.path.join("thumbnail.jpg")).map_err(|error| error.to_string())
}

fn read(
    base: &Path,
    media: &MediaStore,
    project_id: &str,
    clip_id: &str,
    revision: u64,
    control: &ProcessControl,
) -> Result<Vec<u8>, String> {
    if clip_id.len() != 64 || !clip_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Identificador de clipe inválido".into());
    }
    let state = EditorStore::open(base)?.load(project_id)?;
    let snapshot = state
        .clips
        .get(clip_id)
        .filter(|snapshot| {
            snapshot.document.revision == revision && !snapshot.deleted.unwrap_or(false)
        })
        .ok_or("A versão salva do clipe não está disponível")?;
    let mut document = export_snapshot::freeze(Some(snapshot), &snapshot.document)?;
    let sources = export_snapshot::sources(media, project_id, &mut document)?;
    let folder = base.join("cutnicepro/editor-thumbnails").join(project_id);
    let cache = folder.join(format!("{clip_id}.json"));
    if let Ok(bytes) = std::fs::read(&cache) {
        if let Ok(cached) = serde_json::from_slice::<CachedThumbnail>(&bytes) {
            if cached.revision == revision
                && cached.bytes.len() <= 2 * 1024 * 1024
                && cached.bytes.starts_with(&[0xff, 0xd8])
            {
                sources.recheck()?;
                return Ok(cached.bytes);
            }
        }
    }
    let bytes = create(base, &document, &sources.paths, control)?;
    control.check()?;
    sources.recheck()?;
    let _file_lock = crate::clip_trash::lock(base, project_id)?;
    crate::clip_trash::ensure_live(base, project_id, clip_id)?;
    std::fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    crate::file_output::atomic_write(&cache, |file| {
        sources.recheck()?;
        serde_json::to_writer(
            file,
            &CachedThumbnail {
                revision,
                bytes: bytes.clone(),
            },
        )
        .map_err(|error| error.to_string())
    })?;
    Ok(bytes)
}

#[tauri::command]
pub async fn get_editor_thumbnail(
    app: AppHandle,
    project_id: String,
    clip_id: String,
    revision: u64,
) -> Result<Vec<u8>, String> {
    let jobs = app.state::<Arc<ThumbnailJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        jobs.run(|control| {
            let base = crate::app_data_base(&app)?;
            if !crate::storage::Store::open(&base)?
                .load()?
                .iter()
                .any(|project| project.id == project_id)
            {
                return Err("Projeto não encontrado".into());
            }
            read(
                &base,
                &app.state::<MediaStore>(),
                &project_id,
                &clip_id,
                revision,
                control,
            )
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn remove_project(base: &Path, project_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(project_id).map_err(|_| "Identificador de projeto inválido")?;
    let folder = base.join("cutnicepro/editor-thumbnails").join(project_id);
    if !folder.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
            && name
                .strip_suffix(".json")
                .is_some_and(|id| id.len() == 64 && id.bytes().all(|byte| byte.is_ascii_hexdigit()))
        {
            std::fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    match std::fs::remove_dir(folder) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::DirectoryNotEmpty => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
