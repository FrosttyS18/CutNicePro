use super::{export_snapshot, render, store::EditorStore, types::Composition};
use crate::{clips::ClipJobs, media_store::MediaStore, processing::ProcessingGate};
use std::{
    io::{Read, Write},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_editor_document(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    job_id: String,
    document: Composition,
) -> Result<bool, String> {
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let base = crate::app_data_base(&app)?;
    let project = crate::storage::Store::open(&base)?
        .load()?
        .into_iter()
        .find(|project| project.id == project_id)
        .ok_or("Projeto não encontrado.")?;
    let editor = EditorStore::open(&base)?.load(&project_id)?;
    let saved = match &clip_id {
        Some(id) => editor.clips.get(id),
        None => editor.project.as_ref(),
    };
    let mut frozen = export_snapshot::freeze(saved, &document)?;
    let mut title = project.name.clone();
    if let Some(id) = &clip_id {
        if let Some(snapshot) = saved {
            if snapshot.deleted.unwrap_or(false) {
                return Err("Este clipe foi excluído.".into());
            }
            if let Some(name) = &snapshot.title {
                title = format!("{}-{}", project.name, name);
            }
        } else {
            let collection =
                crate::clips::commands::get_project_clips(app.clone(), project_id.clone())?
                    .ok_or("Clipe não encontrado.")?;
            let clip = collection
                .clips
                .iter()
                .find(|clip| &clip.id == id && !clip.deleted.unwrap_or(false))
                .ok_or("Clipe não encontrado.")?;
            title = format!("{}-{}", project.name, clip.title);
        }
    }
    let sources = export_snapshot::sources(&app.state::<MediaStore>(), &project_id, &mut frozen)?;
    let dialog_app = app.clone();
    let destination = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = dialog_app
            .dialog()
            .file()
            .set_title("Exportar vídeo")
            .add_filter("Vídeo MP4", &["mp4"])
            .set_file_name(crate::project_files::filename(&title, "mp4"));
        if let Some(window) = dialog_app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        dialog
            .blocking_save_file()
            .map(|selected| selected.into_path().map_err(|error| error.to_string()))
            .transpose()
    })
    .await
    .map_err(|error| error.to_string())??;
    let Some(mut destination) = destination else {
        return Ok(false);
    };
    destination.set_extension("mp4");
    crate::project_files::destination_allowed(&base, &destination)?;
    let jobs = app.state::<ClipJobs>().0.clone();
    let control = jobs.start_operation(job_id.clone(), project_id, Some("export"))?;
    if let Some(snapshot) = jobs.stage(&job_id, "rendering") {
        let _ = app.emit("clips://job", snapshot);
    }
    let task_app = app.clone();
    let task_jobs = jobs.clone();
    let task_id = job_id.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let result = render::run(&base, &frozen, &sources, &control, |progress| {
            if let Some(snapshot) = task_jobs.progress(&task_id, progress) {
                let _ = task_app.emit("clips://job", snapshot);
            }
        })
        .and_then(|(scratch, output)| {
            let prepared = crate::file_output::prepare(&destination, |file| {
                let mut source = std::fs::File::open(&output).map_err(|error| error.to_string())?;
                let mut buffer = vec![0_u8; 1024 * 1024];
                loop {
                    control.check()?;
                    let count = source
                        .read(&mut buffer)
                        .map_err(|error| error.to_string())?;
                    if count == 0 {
                        break;
                    }
                    file.write_all(&buffer[..count])
                        .map_err(|error| error.to_string())?;
                }
                control.check()
            })?;
            Ok((scratch, prepared))
        });
        task_jobs
            .finish(&task_id, result, |(_, prepared)| prepared.commit())
            .map(|_| true)
    })
    .await;
    let result = task.unwrap_or_else(|error| {
        jobs.finish(
            &job_id,
            Err(format!("Falha ao exportar a montagem: {error}")),
            |_: &bool| Ok(()),
        )
    });
    if let Some(snapshot) = jobs.snapshot() {
        let _ = app.emit("clips://job", snapshot);
    }
    result
}
