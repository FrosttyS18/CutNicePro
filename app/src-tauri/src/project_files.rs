use crate::{media_store::MediaStore, storage::Store};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub(crate) fn destination_allowed(base: &Path, destination: &Path) -> Result<(), String> {
    crate::media_output_guard::check(base, destination)
}
pub(crate) fn filename(name: &str, ext: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    format!("{}.{}", name.trim_matches([' ', '.']), ext)
}
#[tauri::command]
pub async fn export_project_file(
    app: AppHandle,
    id: String,
    media_id: String,
    kind: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = crate::app_data_base(&app)?;
        let project = Store::open(&base)?
            .load()?
            .into_iter()
            .find(|p| p.id == id)
            .ok_or("projeto indisponível")?;
        let store = app.state::<MediaStore>();
        let resolved = store.resolve(&media_id, Some(&id))?;
        let entry = &resolved.entry;
        let extension = match kind.as_str() {
            "video" => entry.ext.as_str(),
            "srt" => "srt",
            "txt" => "txt",
            _ => return Err("formato não suportado".into()),
        };
        let text = if kind == "video" {
            None
        } else {
            Some(crate::transcription::export::contents(
                &base,
                &id,
                &media_id,
                entry
                    .analysis
                    .as_ref()
                    .ok_or("duração indisponível")?
                    .duration_ms as f64
                    / 1000.0,
                &kind,
            )?)
        };
        let mut dialog = app
            .dialog()
            .file()
            .set_title("Salvar arquivo")
            .set_file_name(filename(&project.name, extension))
            .add_filter("Arquivo", &[extension]);
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let chosen = dialog.blocking_save_file();
        let Some(chosen) = chosen else {
            return Ok(false);
        };
        let mut destination: PathBuf = chosen.into_path().map_err(|e| e.to_string())?;
        if destination.extension().is_none() {
            destination.set_extension(extension);
        }
        destination_allowed(&base, &destination)?;
        resolved.recheck()?;
        let prepared = crate::media_output_guard::prepare(&base, &destination, |file| {
            if let Some(text) = text {
                file.write_all(text.as_bytes()).map_err(|e| e.to_string())
            } else {
                let mut input = std::fs::File::open(&resolved.path).map_err(|e| e.to_string())?;
                let size = input.metadata().map_err(|e| e.to_string())?.len();
                let copied = std::io::copy(&mut input, file).map_err(|e| e.to_string())?;
                if copied != size {
                    return Err("cópia incompleta".into());
                }
                Ok(())
            }
        })?;
        resolved.recheck()?;
        prepared.commit()?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_managed_storage_and_keeps_file_names_safe() {
        let dir = std::env::temp_dir().join(format!("cnp-destination-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("media")).unwrap();
        assert!(destination_allowed(&dir, &dir.join("media/video.mp4")).is_err());
        assert_eq!(filename("Vídeo: teste?", "srt"), "Vídeo_ teste_.srt");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
