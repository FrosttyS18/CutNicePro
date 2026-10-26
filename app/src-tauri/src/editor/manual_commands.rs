use super::{
    store::{CreatedClip, EditorProject, EditorStore},
    types::Composition,
};
use std::path::Path;
use tauri::{AppHandle, Manager};

fn store(app: &AppHandle, project_id: &str) -> Result<EditorStore, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    if !crate::storage::Store::open(&base)?
        .load()?
        .iter()
        .any(|project| project.id == project_id)
    {
        return Err("Projeto não encontrado".into());
    }
    EditorStore::open(&base)
}

#[tauri::command]
pub async fn create_editor_clip(
    app: AppHandle,
    project_id: String,
    title: String,
    document: Composition,
) -> Result<CreatedClip, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editor = store(&app, &project_id)?;
        let media = crate::media_store::MediaStore::open(
            &app.path()
                .app_data_dir()
                .map_err(|error| error.to_string())?,
        )?;
        for asset in &document.assets {
            let entry = media
                .get(&asset.media_id)?
                .ok_or("Mídia da montagem não encontrada")?;
            if !entry.project_ids.contains(&project_id) {
                media.link_project(&asset.media_id, &project_id)?;
            }
        }
        editor.create_clip(&project_id, &title, document)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_editor_clip_metadata(
    app: AppHandle,
    project_id: String,
    clip_id: String,
    review: Option<String>,
    deleted: Option<bool>,
) -> Result<EditorProject, String> {
    tauri::async_runtime::spawn_blocking(move || {
        store(&app, &project_id)?.update_clip_metadata(
            &project_id,
            &clip_id,
            review.as_deref(),
            deleted,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn remove_project(base: &Path, project_id: &str) -> Result<(), String> {
    EditorStore::open(base)?.remove_project(project_id)
}
