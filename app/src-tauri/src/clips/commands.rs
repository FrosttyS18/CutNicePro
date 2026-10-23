use super::{
    content, generation, semantic, store, text_engine,
    types::{ClipCollection, GenerateOptions, Quality, Review},
    ClipJobs,
};
use crate::{
    media_store::MediaStore,
    processing::ProcessingGate,
    transcription::{self, types::JobSnapshot},
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub(crate) fn media(
    app: &AppHandle,
    project: &str,
    media: &str,
) -> Result<(crate::media_store::MediaEntry, f64), String> {
    uuid::Uuid::parse_str(project).map_err(|_| "projeto inválido")?;
    let entry = app
        .state::<MediaStore>()
        .get(media)?
        .filter(|m| !m.unavailable && m.project_ids.iter().any(|p| p == project))
        .ok_or("O vídeo está indisponível. Reconecte o arquivo original.")?;
    crate::media_tools::managed_filename(&entry.sha256, &entry.ext)?;
    let duration = entry
        .analysis
        .as_ref()
        .map(|a| a.duration_ms as f64 / 1000.0)
        .filter(|d| d.is_finite() && *d > 0.0)
        .ok_or("Não foi possível ler a duração do vídeo. Importe o arquivo novamente.")?;
    Ok((entry, duration))
}
#[tauri::command]
pub fn get_clips(
    app: AppHandle,
    project_id: String,
    media_id: String,
) -> Result<Option<ClipCollection>, String> {
    let (_, duration) = media(&app, &project_id, &media_id)?;
    let mut value = store::load(
        &crate::app_data_base(&app)?,
        &project_id,
        &media_id,
        duration,
    )?;
    if let Some(ref mut collection) = value {
        presentation(&app, &project_id, collection);
    }
    Ok(value)
}
fn presentation(app: &AppHandle, project: &str, collection: &mut ClipCollection) {
    let Ok(base) = crate::app_data_base(app) else {
        return;
    };
    if let Ok(Some(record)) = transcription::store::load(&base, project) {
        if record.media_id == collection.media_id {
            // atualização 19: invalidação GRANULAR por clipe (assinatura dos
            // segmentos da janela) — não apaga a coleção inteira quando a
            // transcrição muda; legados migram confiado uma vez.
            collection.refresh_analysis_state(&record.segments);
            content::refresh_legacy_titles(&mut collection.clips, &record.segments);
        }
    }
}
#[tauri::command]
pub fn get_project_clips(
    app: AppHandle,
    project_id: String,
) -> Result<Option<ClipCollection>, String> {
    let mut value = store::read(&crate::app_data_base(&app)?, &project_id)?;
    if let Some(ref mut collection) = value {
        let (_, duration) = media(&app, &project_id, &collection.media_id)?;
        store::validate(collection, duration)?;
        presentation(&app, &project_id, collection);
    }
    Ok(value)
}
#[tauri::command]
pub fn clips_job(app: AppHandle) -> Option<JobSnapshot> {
    app.state::<ClipJobs>().0.snapshot()
}
#[tauri::command]
pub fn cancel_clips(app: AppHandle, job_id: String) -> bool {
    app.state::<ClipJobs>().0.cancel(Some(&job_id))
}
#[tauri::command]
pub fn review_clip(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
    review: Review,
) -> Result<ClipCollection, String> {
    let _lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (_, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    let mut value = store::load(&base, &project_id, &media_id, duration)?
        .ok_or("Gere os cortes antes de revisar.")?;
    presentation(&app, &project_id, &mut value);
    value
        .clips
        .iter_mut()
        .find(|c| c.id == clip_id)
        .ok_or("Corte não encontrado.")?
        .review = review;
    store::save(&base, &project_id, &value, duration)?;
    Ok(value)
}
#[tauri::command]
pub async fn generate_clips(
    app: AppHandle,
    project_id: String,
    media_id: String,
    job_id: String,
    options: GenerateOptions,
) -> Result<ClipCollection, String> {
    // Resolve o pedido da UI ANTES de abrir job: automático vira limites
    // técnicos; personalizado valida duração/quantidade informadas.
    let options = options.resolve()?;
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (entry, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    // Falta de recurso do motor selecionado deve abortar ANTES de abrir job.
    text_engine::Engine::discover(&base, options.quality())?;
    let transcript = transcription::store::load(&base, &project_id)?
        .filter(|t| t.media_id == media_id)
        .ok_or("Transcreva o vídeo antes de gerar cortes.")?;
    transcription::parser::validate(&transcript.segments, duration)?;
    if transcript.segments.is_empty() {
        return Err("Não há fala suficiente para sugerir cortes. Escolha outro vídeo.".into());
    }
    let jobs = app.state::<ClipJobs>().0.clone();
    let control = jobs.start_operation(job_id.clone(), project_id.clone(), Some("generate"))?;
    if let Some(snapshot) = jobs.stage(&job_id, "analyzing") {
        let _ = app.emit("clips://job", snapshot);
    }
    let path = app
        .state::<MediaStore>()
        .files_dir()
        .join(format!("{}.{}", entry.sha256, entry.ext));
    let task_jobs = jobs.clone();
    let task_id = job_id.clone();
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let result = (|| {
            let scratch = crate::render::scratch::Scratch::new(&base)?;
            generation::run(
                &base,
                &scratch.path,
                generation::Request {
                    project: &project_id,
                    media: &media_id,
                    source: &path,
                    duration,
                    speech: &transcript.segments,
                    options: &options,
                },
                &control,
                |percent| {
                    if let Some(snapshot) = task_jobs.progress(&task_id, percent) {
                        let _ = task_app.emit("clips://job", snapshot);
                    }
                },
            )
        })();
        task_jobs.finish(&task_id, result, |value| {
            store::save(&base, &project_id, value, duration)
        })
    })
    .await;
    let result = task.unwrap_or_else(|e| {
        jobs.finish(
            &job_id,
            Err(format!("falha na análise de cortes: {e}")),
            |_: &ClipCollection| Ok(()),
        )
    });
    if let Some(snapshot) = jobs.snapshot() {
        let _ = app.emit("clips://job", snapshot);
    }
    result
}

#[tauri::command]
pub async fn analyze_clip(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
    job_id: String,
) -> Result<ClipCollection, String> {
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (_, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    let mut collection =
        store::load(&base, &project_id, &media_id, duration)?.ok_or("Corte não encontrado.")?;
    let transcript = transcription::store::load(&base, &project_id)?
        .filter(|t| t.media_id == media_id)
        .ok_or("Transcreva o vídeo antes de analisar cortes.")?;
    // atualização 19: estado granular — analisar um clipe não apaga mais a
    // análise dos demais (o invalidate total antigo persistia o estrago).
    collection.refresh_analysis_state(&transcript.segments);
    let index = collection
        .clips
        .iter()
        .position(|c| c.id == clip_id)
        .ok_or("Corte não encontrado.")?;
    // Reanálise usa o motor de origem DO PRÓPRIO CLIPE (biblioteca
    // cumulativa mistura resultados históricos); sem metadado vale o da
    // coleção e, em último caso, o motor padrão.
    let quality = match collection.clips[index]
        .engine
        .as_ref()
        .map(|record| record.backend.as_str())
        .or_else(|| {
            collection
                .engine
                .as_ref()
                .map(|record| record.backend.as_str())
        }) {
        Some("experimentalGemma") => Quality::ExperimentalGemma,
        _ => Quality::Standard,
    };
    let engine = text_engine::Engine::discover(&base, quality)?;
    let jobs = app.state::<ClipJobs>().0.clone();
    let control = jobs.start_operation(job_id.clone(), project_id.clone(), Some("analyze"))?;
    if let Some(snapshot) = jobs.stage(&job_id, "analyzing") {
        let _ = app.emit("clips://job", snapshot);
    }
    let task_jobs = jobs.clone();
    let task_id = job_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let result = (|| {
            let scratch = crate::render::scratch::Scratch::new(&base)?;
            semantic::run(
                &engine,
                &scratch.path,
                &mut collection.clips[index],
                &transcript.segments,
                &control,
            )?;
            // metadados correspondem ao motor que EFETIVAMENTE produziu a
            // análise recém-publicada (upd 20 — reanálise sobrepõe origem)
            collection.clips[index].engine = Some(engine.record());
            Ok(collection)
        })();
        task_jobs.finish(&task_id, result, |value| {
            store::save(&base, &project_id, value, duration)
        })
    })
    .await
    .unwrap_or_else(|e| {
        jobs.finish(
            &job_id,
            Err(format!("falha na análise: {e}")),
            |_: &ClipCollection| Ok(()),
        )
    });
    if let Some(snapshot) = jobs.snapshot() {
        let _ = app.emit("clips://job", snapshot);
    }
    result
}

/// Exclusão persistente recuperável (atualização 19): marca o clipe como
/// excluído da experiência SEM apagar nada — mídia, transcrição, análise e
/// os demais clipes permanecem; `restore_clip` desfaz. Não transforma
/// rejeição antiga em exclusão: o marcador é explícito e separado da revisão.
#[tauri::command]
pub fn delete_clip(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
) -> Result<ClipCollection, String> {
    set_deleted(app, project_id, media_id, clip_id, true)
}

#[tauri::command]
pub fn restore_clip(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
) -> Result<ClipCollection, String> {
    set_deleted(app, project_id, media_id, clip_id, false)
}

fn set_deleted(
    app: AppHandle,
    project_id: String,
    media_id: String,
    clip_id: String,
    deleted: bool,
) -> Result<ClipCollection, String> {
    let _lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (_, duration) = media(&app, &project_id, &media_id)?;
    let base = crate::app_data_base(&app)?;
    let mut value = store::load(&base, &project_id, &media_id, duration)?
        .ok_or("Gere os cortes antes de gerenciá-los.")?;
    presentation(&app, &project_id, &mut value);
    let clip = value
        .clips
        .iter_mut()
        .find(|c| c.id == clip_id)
        .ok_or("Corte não encontrado.")?;
    clip.deleted = deleted.then_some(true);
    store::save(&base, &project_id, &value, duration)?;
    Ok(value)
}

pub(crate) fn remove(base: &std::path::Path, project: &str) -> Result<(), String> {
    store::remove(base, project)
}
