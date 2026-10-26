use super::{
    jobs::TranscriptionJobs,
    parser, runner, store, tools,
    types::{EngineStatus, JobSnapshot, Segment, Transcript},
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

fn media(
    app: &AppHandle,
    project_id: &str,
    media_id: &str,
) -> Result<(crate::media_source::ResolvedMedia, f64), String> {
    uuid::Uuid::parse_str(project_id).map_err(|_| "projeto inválido")?;
    let source = app
        .state::<crate::media_store::MediaStore>()
        .resolve(media_id, Some(project_id))?;
    let analysis = source
        .entry
        .analysis
        .as_ref()
        .ok_or("Analise o vídeo antes de transcrever. Metadados ausentes.")?;
    if !analysis.has_audio {
        return Err("Este vídeo não tem faixa de áudio para transcrever.".into());
    }
    let duration = analysis.duration_ms as f64 / 1000.0;
    Ok((source, duration))
}

#[tauri::command]
pub fn transcription_status(app: AppHandle) -> Result<EngineStatus, String> {
    Ok(tools::status(&crate::app_data_base(&app)?))
}

#[tauri::command]
pub fn transcription_job(app: AppHandle) -> Option<JobSnapshot> {
    app.state::<Arc<TranscriptionJobs>>().snapshot()
}

#[tauri::command]
pub fn cancel_transcription(app: AppHandle, job_id: String) -> bool {
    app.state::<Arc<TranscriptionJobs>>().cancel(Some(&job_id))
}

#[tauri::command]
pub fn get_transcript(
    app: AppHandle,
    project_id: String,
    media_id: String,
) -> Result<Option<Transcript>, String> {
    let (_source, duration) = media(&app, &project_id, &media_id)?;
    let record = store::load(&crate::app_data_base(&app)?, &project_id)?;
    if let Some(ref r) = record {
        if r.media_id != media_id {
            return Ok(None);
        }
        parser::validate(&r.segments, duration)?;
    }
    Ok(record)
}

#[tauri::command]
pub fn save_transcript(
    app: AppHandle,
    project_id: String,
    media_id: String,
    segments: Vec<Segment>,
) -> Result<(), String> {
    let _lease = app
        .state::<Arc<crate::processing::ProcessingGate>>()
        .acquire()?;
    let (source, duration) = media(&app, &project_id, &media_id)?;
    let jobs = app.state::<Arc<TranscriptionJobs>>();
    let base = crate::app_data_base(&app)?;
    jobs.edit(|| {
        let mut record = store::load(&base, &project_id)?
            .filter(|r| r.media_id == media_id)
            .ok_or("transcrição não encontrada")?;
        record.segments = segments;
        source.recheck()?;
        store::save(&base, &project_id, &record, duration)
    })
}

#[tauri::command]
pub async fn transcribe_project(
    app: AppHandle,
    project_id: String,
    media_id: String,
    job_id: String,
    profile: Option<String>,
    processor: Option<String>,
) -> Result<Transcript, String> {
    let lease = app
        .state::<Arc<crate::processing::ProcessingGate>>()
        .acquire()?;
    let (source, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    let mut engine =
        tools::discover_profile(&base, super::profiles::Profile::parse(profile.as_deref())?)?;
    match processor.as_deref().unwrap_or("auto") {
        "auto" => {}
        "cpu" => engine.gpu = false,
        _ => return Err("Escolha uma opção de processamento disponível.".into()),
    }
    let jobs = app.state::<Arc<TranscriptionJobs>>().inner().clone();
    let control = jobs.start(job_id.clone(), project_id.clone())?;
    if let Some(s) = jobs.snapshot() {
        let _ = app.emit("transcription://job", s);
    }
    let task_app = app.clone();
    let task_jobs = jobs.clone();
    let task_id = job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let result = runner::run(
            &base,
            &source.path,
            &media_id,
            duration,
            engine,
            &control,
            |stage| {
                if let Some(s) = task_jobs.stage(&task_id, stage) {
                    let _ = task_app.emit("transcription://job", s);
                }
            },
            |value| {
                if let Some(s) = task_jobs.progress(&task_id, value) {
                    let _ = task_app.emit("transcription://job", s);
                }
            },
        );
        task_jobs
            .finish(&task_id, result, |output| {
                source.recheck()?;
                store::save(&base, &project_id, &output.transcript, duration)?;
                if let Err(error) = output.cache.complete() {
                    eprintln!("[transcription] checkpoint cleanup: {error}");
                }
                Ok(())
            })
            .map(|output| output.transcript)
    })
    .await;
    let outcome = match result {
        Ok(value) => value,
        Err(e) => {
            jobs.cancel(Some(&job_id));
            jobs.finish(
                &job_id,
                Err(format!("falha na tarefa de transcrição: {e}")),
                |_: &Transcript| Ok(()),
            )
        }
    };
    if let Some(s) = jobs.snapshot() {
        let _ = app.emit("transcription://job", s);
    }
    if let Err(ref error) = outcome {
        eprintln!("[transcription] job={job_id}: {error}");
    }
    outcome
}
