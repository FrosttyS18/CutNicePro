use super::{export_snapshot, store::EditorStore, thumbnail, types::Composition};
use crate::media_store::MediaStore;
use serde::Serialize;
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct ExportCapabilities {
    codecs: Vec<super::export_encoding::CodecCapability>,
}

#[tauri::command]
pub async fn get_editor_export_capabilities(app: AppHandle) -> Result<ExportCapabilities, String> {
    let jobs = app.state::<Arc<thumbnail::ThumbnailJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        jobs.run(|control| {
            let base = crate::app_data_base(&app)?;
            let scratch = crate::render::scratch::Scratch::new(&base)?;
            let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg não encontrado")?;
            let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
                "ffmpeg.exe"
            } else {
                "ffmpeg"
            });
            let codecs = super::export_encoding::capabilities(&ffmpeg, &scratch.path, control)?;
            Ok(ExportCapabilities { codecs })
        })
    })
    .await
    .map_err(|_| {
        "Não foi possível verificar as opções de exportação. Tente novamente.".to_string()
    })?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReceipt {
    pub id: String,
    pub path: String,
    pub bytes: u64,
    pub reused: bool,
}

fn receipts() -> &'static Mutex<VecDeque<ExportReceipt>> {
    static RECEIPTS: OnceLock<Mutex<VecDeque<ExportReceipt>>> = OnceLock::new();
    RECEIPTS.get_or_init(Mutex::default)
}

pub(super) fn register(
    path: &std::path::Path,
    bytes: u64,
    reused: bool,
) -> Result<ExportReceipt, String> {
    let receipt = ExportReceipt {
        id: uuid::Uuid::new_v4().to_string(),
        path: path.to_string_lossy().into_owned(),
        bytes,
        reused,
    };
    let mut items = receipts()
        .lock()
        .map_err(|_| "Não foi possível registrar o arquivo exportado.")?;
    items.push_back(receipt.clone());
    while items.len() > 32 {
        items.pop_front();
    }
    Ok(receipt)
}

#[tauri::command]
pub async fn reveal_editor_export(receipt_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = receipts()
            .lock()
            .map_err(|_| "Exportação indisponível.")?
            .iter()
            .find(|item| item.id == receipt_id)
            .map(|item| PathBuf::from(&item.path))
            .ok_or("Exporte o vídeo novamente para abrir sua pasta.")?;
        let parent = path
            .parent()
            .filter(|path| path.is_dir())
            .ok_or("A pasta do vídeo não está disponível.")?;
        crate::media_reveal::open_directory(parent)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn choose_editor_export_directory(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title("Pasta de exportação");
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        dialog
            .blocking_pick_folder()
            .map(|selected| {
                selected
                    .into_path()
                    .map(|path| path.to_string_lossy().into_owned())
                    .map_err(|error| error.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_editor_export_preview(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    document: Composition,
) -> Result<Vec<u8>, String> {
    let jobs = app.state::<Arc<thumbnail::ThumbnailJobs>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        jobs.run(|control| {
            let base = crate::app_data_base(&app)?;
            if !crate::storage::Store::open(&base)?
                .load()?
                .iter()
                .any(|project| project.id == project_id)
            {
                return Err("Projeto não encontrado.".into());
            }
            let editor = EditorStore::open(&base)?.load(&project_id)?;
            let saved = clip_id
                .as_ref()
                .and_then(|id| editor.clips.get(id))
                .or_else(|| {
                    if clip_id.is_none() {
                        editor.project.as_ref()
                    } else {
                        None
                    }
                });
            if saved.is_some_and(|snapshot| snapshot.deleted.unwrap_or(false)) {
                return Err("Este clipe foi excluído.".into());
            }
            let mut frozen = export_snapshot::freeze(saved, &document)?;
            let sources =
                export_snapshot::sources(&app.state::<MediaStore>(), &project_id, &mut frozen)?;
            let bytes = thumbnail::create(&base, &frozen, &sources.paths, control)?;
            sources.recheck()?;
            Ok(bytes)
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipts_authorize_only_completed_known_files_and_are_bounded() {
        let path = PathBuf::from("C:/exports/video.mp4");
        let receipt = register(&path, 100, true).unwrap();
        assert!(receipts()
            .lock()
            .unwrap()
            .iter()
            .any(|value| value.id == receipt.id && value.reused && value.bytes == 100));
        for _ in 0..40 {
            register(&path, 1, false).unwrap();
        }
        let items = receipts().lock().unwrap();
        assert_eq!(items.len(), 32);
        assert!(!items.iter().any(|value| value.id == receipt.id));
        assert!(!items.iter().any(|value| value.id == "untrusted-path"));
    }
}
