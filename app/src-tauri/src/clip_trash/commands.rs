use tauri::AppHandle;

fn base(app: &AppHandle, project: &str) -> Result<std::path::PathBuf, String> {
    let base = crate::app_data_base(app)?;
    if !crate::storage::Store::open(&base)?
        .load()?
        .iter()
        .any(|item| item.id == project)
    {
        return Err("Projeto não encontrado".into());
    }
    Ok(base)
}

#[tauri::command]
pub async fn purge_clip(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = base(&app, &project_id)?;
        let _ = media_id;
        super::purge(&base, &project_id, &clip_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cleanup_clip_trash(app: AppHandle, project_id: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = base(&app, &project_id)?;
        super::cleanup_at(&base, &project_id, crate::editor::store::now())
    })
    .await
    .map_err(|error| error.to_string())?
}
