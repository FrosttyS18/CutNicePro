use super::{
    export_artifact,
    export_destination::{self, Destination},
    export_dialog::{self, ExportReceipt},
    export_options::ExportOptions,
    export_snapshot,
    store::EditorStore,
    types::Composition,
};
use crate::{clips::ClipJobs, media_store::MediaStore, processing::ProcessingGate};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_editor_document(
    app: AppHandle,
    project_id: String,
    clip_id: Option<String>,
    job_id: String,
    document: Composition,
    options: Option<ExportOptions>,
    file_name: Option<String>,
    directory: Option<String>,
    overwrite: Option<bool>,
) -> Result<Option<ExportReceipt>, String> {
    let options = options.unwrap_or_default();
    options.validate()?;
    let extension = options.extension();
    if file_name
        .as_ref()
        .is_some_and(|name| name.trim().is_empty() || name.chars().count() > 120)
    {
        return Err("Informe um nome com até 120 caracteres.".into());
    }
    let base = crate::app_data_base(&app)?;
    let direct = directory
        .as_deref()
        .map(|directory| {
            export_destination::resolve(
                &base,
                directory,
                file_name
                    .as_deref()
                    .ok_or("Informe o nome do arquivo para exportar.")?,
                options,
            )
        })
        .transpose()?;
    let overwrite = overwrite.unwrap_or(false);
    if let Some(destination) = &direct {
        destination.recheck(overwrite)?;
    }
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
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
    if let Some(name) = file_name {
        title = name;
    }
    let sources = export_snapshot::sources(&app.state::<MediaStore>(), &project_id, &mut frozen)?;
    let (destination, overwrite) = if let Some(destination) = direct {
        (destination, overwrite)
    } else {
        let dialog_app = app.clone();
        let destination = tauri::async_runtime::spawn_blocking(move || {
            let mut dialog = dialog_app
                .dialog()
                .file()
                .set_title("Exportar vídeo")
                .add_filter(
                    if extension == "mov" {
                        "Vídeo MOV"
                    } else {
                        "Vídeo MP4"
                    },
                    &[extension],
                )
                .set_file_name(crate::project_files::filename(&title, extension));
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
            return Ok(None);
        };
        destination.set_extension(extension);
        (Destination::selected(&base, destination)?, true)
    };
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
        let result = destination
            .recheck(overwrite)
            .and_then(|()| sources.recheck())
            .and_then(|()| {
                export_artifact::produce(
                    &base,
                    &frozen,
                    &sources.paths,
                    &sources.stamps,
                    options,
                    &control,
                    |progress| {
                        if let Some(snapshot) = task_jobs.progress(&task_id, progress) {
                            let _ = task_app.emit("clips://job", snapshot);
                        }
                    },
                )
            })
            .and_then(|mut artifact| {
                sources.recheck()?;
                let mut bytes = 0;
                let prepared = destination.prepare(overwrite, |file| {
                    bytes = artifact.copy(file, &control)?;
                    Ok(())
                })?;
                Ok((artifact, prepared, bytes))
            });
        let (artifact, _, bytes) = task_jobs.finish(&task_id, result, |(_, prepared, _)| {
            sources.recheck()?;
            prepared.commit()
        })?;
        artifact.remember(&control);
        export_dialog::register(destination.path(), bytes, artifact.reused()).map(Some)
    })
    .await;
    let result = task.unwrap_or_else(|error| {
        jobs.finish(
            &job_id,
            Err(format!("Falha ao exportar a montagem: {error}")),
            |_: &Option<ExportReceipt>| Ok(()),
        )
    });
    if let Some(snapshot) = jobs.snapshot() {
        let _ = app.emit("clips://job", snapshot);
    }
    result
}
