use super::{
    store::{EditorProject, EditorStore, Recovery, RecoveryClipDraft, Snapshot},
    types::Composition,
};
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
pub async fn load_editor_project(
    app: AppHandle,
    project_id: String,
) -> Result<EditorProject, String> {
    tauri::async_runtime::spawn_blocking(move || store(&app, &project_id)?.load(&project_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_editor_document(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    document: Composition,
    expected_revision: u64,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editor = store(&app, &project_id)?;
        let media = crate::media_store_of(&app)?;
        for asset in &document.assets {
            let entry = media
                .get(&asset.media_id)?
                .ok_or("Mídia da montagem não encontrada")?;
            if !entry.project_ids.contains(&project_id) {
                media.link_project(&asset.media_id, &project_id)?;
            }
        }
        editor.save(&project_id, clip_id.as_deref(), document, expected_revision)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_editor_recovery(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    document: Composition,
    base_revision: u64,
    related: Option<Vec<RecoveryClipDraft>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editor = store(&app, &project_id)?;
        match related {
            Some(related) if !related.is_empty() => editor.save_recovery_batch(
                &project_id,
                clip_id.as_deref(),
                document,
                base_revision,
                related,
            ),
            _ => editor.save_recovery(&project_id, clip_id.as_deref(), document, base_revision),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_editor_recovery(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
) -> Result<Option<Recovery>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        store(&app, &project_id)?.recovery(&project_id, clip_id.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn discard_editor_recovery(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        store(&app, &project_id)?.discard_recovery(&project_id, clip_id.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}
