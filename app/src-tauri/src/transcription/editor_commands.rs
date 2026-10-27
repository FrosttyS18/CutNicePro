use super::{
    editor_store,
    jobs::TranscriptionJobs,
    parser,
    profiles::Profile,
    runner, tools,
    types::{EditorTranscriptionJob, Transcript},
};
use std::{path::Path, sync::Arc};
use tauri::{AppHandle, Emitter, Manager};

fn ensure_project(base: &Path, project: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido")?;
    if !crate::storage::Store::open(base)?
        .load()?
        .iter()
        .any(|value| value.id == project)
    {
        return Err("Projeto não encontrado".into());
    }
    Ok(())
}

fn media(
    app: &AppHandle,
    project: &str,
    media_id: &str,
) -> Result<(crate::media_source::ResolvedMedia, f64), String> {
    ensure_project(&crate::app_data_base(app)?, project)?;
    editor_store::validate_media_id(media_id)?;
    let source = app
        .state::<crate::media_store::MediaStore>()
        .resolve(media_id, Some(project))?;
    let analysis = source
        .entry
        .analysis
        .as_ref()
        .ok_or("Metadados da mídia indisponíveis. Reconecte ou importe a mídia novamente.")?;
    let duration = audio_duration(analysis)?;
    Ok((source, duration))
}

fn audio_duration(analysis: &crate::media_store::MediaAnalysis) -> Result<f64, String> {
    if !analysis.has_audio {
        return Err("Esta mídia não tem faixa de áudio para transcrever.".into());
    }
    let duration = analysis.duration_ms as f64 / 1000.0;
    parser::validate(&[], duration)?;
    Ok(duration)
}

fn emit_job(app: &AppHandle, jobs: &TranscriptionJobs, project: &str, media: &str, id: &str) {
    if let Some(job) = jobs
        .editor_snapshot(project, Some(media))
        .filter(|value| value.job.job_id == id)
    {
        let _ = app.emit("editor-transcription-progress", job);
    }
}

#[tauri::command]
pub async fn get_editor_media_transcription(
    app: AppHandle,
    project_id: String,
    media_id: String,
) -> Result<Option<Transcript>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_source, duration) = media(&app, &project_id, &media_id)?;
        let record = editor_store::load(&crate::app_data_base(&app)?, &project_id, &media_id)?;
        if let Some(record) = &record {
            parser::validate(&record.segments, duration)?;
        }
        Ok(record)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_editor_media_transcription_job(
    app: AppHandle,
    project_id: String,
    media_id: Option<String>,
) -> Result<Option<EditorTranscriptionJob>, String> {
    ensure_project(&crate::app_data_base(&app)?, &project_id)?;
    if let Some(media) = &media_id {
        editor_store::validate_media_id(media)?;
    }
    Ok(app
        .state::<Arc<TranscriptionJobs>>()
        .editor_snapshot(&project_id, media_id.as_deref()))
}

#[tauri::command]
pub async fn transcribe_editor_media(
    app: AppHandle,
    project_id: String,
    media_id: String,
    profile: Option<String>,
    execution_mode: Option<String>,
) -> Result<EditorTranscriptionJob, String> {
    let lease = app
        .state::<Arc<crate::processing::ProcessingGate>>()
        .acquire()?;
    let (source, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    let mut engine = tools::discover_profile(&base, Profile::parse(profile.as_deref())?)?;
    match execution_mode.as_deref().unwrap_or("auto") {
        "auto" => {}
        "cpu" => engine.gpu = false,
        _ => return Err("Escolha uma opção de processamento disponível.".into()),
    }
    let jobs = app.state::<Arc<TranscriptionJobs>>().inner().clone();
    let job_id = uuid::Uuid::new_v4().to_string();
    let control = jobs.start_editor(job_id.clone(), project_id.clone(), media_id.clone())?;
    let snapshot = jobs
        .editor_snapshot(&project_id, Some(&media_id))
        .ok_or("Não foi possível iniciar a transcrição desta mídia")?;
    emit_job(&app, &jobs, &project_id, &media_id, &job_id);
    tauri::async_runtime::spawn(async move {
        let worker_app = app.clone();
        let worker_jobs = jobs.clone();
        let worker_id = job_id.clone();
        let worker_project = project_id.clone();
        let worker_media = media_id.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let _lease = lease;
            let result = runner::run(
                &base,
                &source.path,
                &worker_media,
                duration,
                engine,
                &control,
                |stage| {
                    if worker_jobs.stage(&worker_id, stage).is_some() {
                        emit_job(
                            &worker_app,
                            &worker_jobs,
                            &worker_project,
                            &worker_media,
                            &worker_id,
                        );
                    }
                },
                |value| {
                    if worker_jobs.progress(&worker_id, value).is_some() {
                        emit_job(
                            &worker_app,
                            &worker_jobs,
                            &worker_project,
                            &worker_media,
                            &worker_id,
                        );
                    }
                },
            );
            let outcome = worker_jobs
                .finish(&worker_id, result, |output| {
                    source.recheck()?;
                    ensure_project(&base, &worker_project)?;
                    editor_store::save(
                        &base,
                        &worker_project,
                        &worker_media,
                        &output.transcript,
                        duration,
                    )?;
                    if let Err(error) = output.cache.complete() {
                        eprintln!("[transcription] editor checkpoint cleanup: {error}");
                    }
                    Ok(())
                })
                .map(|_| ());
            emit_job(
                &worker_app,
                &worker_jobs,
                &worker_project,
                &worker_media,
                &worker_id,
            );
            outcome
        })
        .await;
        if let Err(error) = result {
            jobs.cancel(Some(&job_id));
            let _ = jobs.finish(
                &job_id,
                Err(format!("Falha na tarefa de transcrição: {error}")),
                |_: &()| Ok(()),
            );
            emit_job(&app, &jobs, &project_id, &media_id, &job_id);
        }
    });
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_or_invalid_project_cannot_be_used_for_editor_transcription() {
        let base = std::env::temp_dir().join(format!(
            "cnp-editor-transcription-input-{}",
            uuid::Uuid::new_v4()
        ));
        let project = crate::storage::Store::open(&base)
            .unwrap()
            .create_project("Editor")
            .unwrap();
        assert!(ensure_project(&base, &project.id).is_ok());
        assert!(ensure_project(&base, &uuid::Uuid::new_v4().to_string()).is_err());
        assert!(ensure_project(&base, "../escape").is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn silent_or_zero_duration_media_is_rejected_before_engine_start() {
        let mut analysis = crate::media_store::MediaAnalysis {
            duration_ms: 1000,
            width: 640,
            height: 360,
            video_codec: "h264".into(),
            audio_codec: None,
            has_audio: false,
            fps: 30.0,
        };
        assert!(audio_duration(&analysis)
            .unwrap_err()
            .contains("não tem faixa de áudio"));
        analysis.has_audio = true;
        assert_eq!(audio_duration(&analysis).unwrap(), 1.0);
        analysis.duration_ms = 0;
        assert!(audio_duration(&analysis).is_err());
    }
}
