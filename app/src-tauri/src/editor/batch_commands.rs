use super::{
    store::{BatchSaved, ClipDraft, EditorStore},
    types::Composition,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn save_editor_batch(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    document: Composition,
    expected_revision: u64,
    related: Vec<ClipDraft>,
    active_changed: bool,
) -> Result<BatchSaved, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
        let media = crate::media_store::MediaStore::open(&base)?;
        for asset in document.assets.iter().chain(
            related
                .iter()
                .flat_map(|draft| draft.document.assets.iter()),
        ) {
            let entry = media
                .get(&asset.media_id)?
                .ok_or("Mídia do lote não encontrada")?;
            if !entry.project_ids.contains(&project_id) {
                media.link_project(&asset.media_id, &project_id)?;
            }
        }
        EditorStore::open(&base)?.save_batch(
            &project_id,
            clip_id.as_deref(),
            document,
            expected_revision,
            related,
            active_changed,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
