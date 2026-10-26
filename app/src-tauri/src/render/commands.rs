use super::{pipeline, settings::RenderSettings};
use crate::{
    clips::{commands::media, ClipJobs},
    processing::ProcessingGate,
    transcription,
};
use std::{
    io::{Read, Write},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    project_id: String,
    media_id: String,
    job_id: String,
    mut settings: RenderSettings,
    clip_id: Option<String>,
) -> Result<bool, String> {
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (source, duration) = media(&app, &project_id, &media_id)?;
    // proporção original/zoom precisam das dimensões reais da fonte
    if let Some(analysis) = source.entry.analysis.as_ref() {
        settings.source_width = Some(analysis.width);
        settings.source_height = Some(analysis.height);
    }
    settings.validate(duration)?;
    let base = crate::app_data_base(&app)?;
    let mut clip_title: Option<String> = None;
    if let Some(id) = clip_id {
        // atualização 19: exportar clip NÃO exige aprovação — valida apenas
        // que o clipe existe e não está excluído.
        let cuts =
            crate::clips::commands::get_clips(app.clone(), project_id.clone(), media_id.clone())?
                .ok_or("Corte não encontrado.")?;
        match cuts
            .clips
            .iter()
            .find(|c| c.id == id && !c.deleted.unwrap_or(false))
        {
            Some(clip) => clip_title = Some(clip.title.clone()),
            None => return Err("Corte não encontrado.".into()),
        }
    }
    let project = crate::storage::Store::open(&base)?
        .load()?
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or("Projeto não encontrado.")?;
    let transcript =
        transcription::store::load(&base, &project_id)?.filter(|r| r.media_id == media_id);
    if settings.caption_model > 0 && transcript.as_ref().is_none_or(|r| r.segments.is_empty()) {
        return Err("Transcreva o vídeo antes de exportar com legendas.".into());
    }
    let segments = transcript.map(|t| t.segments).unwrap_or_default();
    transcription::parser::validate(&segments, duration)?;
    let jobs = app.state::<ClipJobs>().0.clone();
    let path = source.path.clone();
    let selected_app = app.clone();
    let destination = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = selected_app
            .dialog()
            .file()
            .set_title("Exportar vídeo")
            .add_filter("Vídeo MP4", &["mp4"])
            .set_file_name(crate::project_files::filename(
                // G7 (goal-recuperacao-autoclip): nome identificável — quando
                // é um corte, inclui o TÍTULO (40 chars) para o arquivo
                // corresponder ao card; export de vídeo completo segue "projeto-corte".
                &clip_title
                    .map(|title| {
                        format!(
                            "{}-{}",
                            project.name,
                            title.chars().take(40).collect::<String>()
                        )
                    })
                    .unwrap_or_else(|| format!("{}-corte", project.name)),
                "mp4",
            ));
        if let Some(window) = selected_app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        dialog
            .blocking_save_file()
            .map(|chosen| chosen.into_path().map_err(|e| e.to_string()))
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())??;
    let Some(mut destination) = destination else {
        return Ok(false);
    };
    destination.set_extension("mp4");
    crate::project_files::destination_allowed(&base, &destination)?;
    let control = jobs.start_operation(job_id.clone(), project_id, Some("export"))?;
    if let Some(snapshot) = jobs.stage(&job_id, "rendering") {
        let _ = app.emit("clips://job", snapshot);
    }
    let task_app = app.clone();
    let task_jobs = jobs.clone();
    let task_id = job_id.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let result = source.recheck().and_then(|()| {
            pipeline::run(
                &base,
                &path,
                &segments,
                &settings,
                duration,
                source.entry.analysis.as_ref().is_some_and(|a| a.has_audio),
                &control,
                |progress| {
                    if let Some(snapshot) = task_jobs.progress(&task_id, progress) {
                        let _ = task_app.emit("clips://job", snapshot);
                    }
                },
            )
        });
        let result = result.and_then(|(scratch, output)| {
            source.recheck()?;
            let prepared = crate::media_output_guard::prepare(&base, &destination, |file| {
                let mut source = std::fs::File::open(&output).map_err(|e| e.to_string())?;
                let mut buffer = vec![0_u8; 1024 * 1024];
                loop {
                    control.check()?;
                    let count = source.read(&mut buffer).map_err(|e| e.to_string())?;
                    if count == 0 {
                        break;
                    }
                    file.write_all(&buffer[..count])
                        .map_err(|e| e.to_string())?;
                }
                control.check()
            })?;
            Ok((scratch, prepared))
        });
        task_jobs
            .finish(&task_id, result, |(_, prepared)| {
                source.recheck()?;
                prepared.commit()
            })
            .map(|_| true)
    })
    .await;
    let result = task.unwrap_or_else(|e| {
        jobs.finish(
            &job_id,
            Err(format!("falha ao exportar: {e}")),
            |_: &bool| Ok(()),
        )
    });
    if let Some(snapshot) = jobs.snapshot() {
        let _ = app.emit("clips://job", snapshot);
    }
    result
}
