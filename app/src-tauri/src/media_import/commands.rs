use super::{ImportJobs, ImportProgress, VerifiedReference};
use crate::{
    editor::types::MediaKind,
    media_store::{MediaEntryDto, MediaStore},
};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        Err("importação cancelada".into())
    } else {
        Ok(())
    }
}

fn report(app: &AppHandle, job: &str, total: u64, bytes: u64, phase: &'static str) {
    let _ = app.emit(
        "import://progress",
        ImportProgress {
            job_id: job.into(),
            bytes_copied: bytes,
            total_bytes: total,
            bytes_processed: bytes,
            phase,
            storage_kind: "reference",
        },
    );
}

fn verify(
    app: &AppHandle,
    path: &Path,
    job: &str,
    cancel: &AtomicBool,
) -> Result<VerifiedReference, String> {
    let total = std::fs::metadata(path)
        .map_err(|_| "Arquivo original indisponível.")?
        .len();
    report(app, job, total, 0, "hashing");
    super::verify_reference(
        path,
        cancel,
        &|bytes| report(app, job, total, bytes, "hashing"),
        Duration::from_secs(1800),
    )
    .map_err(|error| error.message())
}

pub fn run(
    app: &AppHandle,
    project: &str,
    path: &Path,
    job: &str,
    kind: Option<MediaKind>,
) -> Result<String, String> {
    uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido.")?;
    if !crate::store_of(app)?
        .load()?
        .iter()
        .any(|entry| entry.id == project)
    {
        return Err("Projeto não encontrado.".into());
    }
    let name = path
        .file_name()
        .ok_or("Nome do arquivo inválido.")?
        .to_string_lossy()
        .into_owned();
    let kind = kind.unwrap_or(MediaKind::Video);
    let ext = super::allowed_editor_ext(&name, &kind)
        .ok_or("Formato não suportado para o tipo de mídia escolhido.")?;
    let jobs = app.state::<Arc<ImportJobs>>();
    let cancel = jobs.start(job)?;
    let result = (|| {
        let store = app.state::<MediaStore>();
        store.validate_reference_path(path)?;
        let verified = verify(app, path, job, &cancel)?;
        let tools = crate::media_analyze::detect_fftools()
            .ok_or("FFmpeg não encontrado — análise de mídia indisponível")?;
        report(
            app,
            job,
            verified.stamp().size_bytes,
            verified.stamp().size_bytes,
            "analyzing",
        );
        let analysis = jobs.analyze(job, &tools, verified.path(), &kind, &store.files_dir())?;
        verified.recheck()?;
        check_cancel(&cancel)?;
        report(
            app,
            job,
            verified.stamp().size_bytes,
            verified.stamp().size_bytes,
            "registering",
        );
        let entry = jobs.commit(job, || {
            store.publish_reference(&verified, &ext, &name, project, Some(analysis))
        })?;
        let payload =
            serde_json::to_value(store.dto(&entry)?).map_err(|error| error.to_string())?;
        let _ = app.emit("import://done", &payload);
        Ok(payload.to_string())
    })();
    jobs.finish(job);
    result
}

pub fn relink(
    app: &AppHandle,
    project: &str,
    media: &str,
    path: &Path,
    job: &str,
) -> Result<MediaEntryDto, String> {
    uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido.")?;
    let store = app.state::<MediaStore>();
    let entry = store
        .get(media)?
        .filter(|entry| entry.project_ids.iter().any(|id| id == project))
        .ok_or("Mídia não vinculada a este projeto.")?;
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or("Formato de mídia inválido.")?;
    if ext != entry.ext {
        return Err("Escolha um arquivo do mesmo formato da mídia original.".into());
    }
    let jobs = app.state::<Arc<ImportJobs>>();
    let cancel = jobs.start(job)?;
    let result = (|| {
        store.validate_reference_path(path)?;
        let verified = verify(app, path, job, &cancel)?;
        check_cancel(&cancel)?;
        report(
            app,
            job,
            verified.stamp().size_bytes,
            verified.stamp().size_bytes,
            "registering",
        );
        let entry = jobs.commit(job, || {
            store.relink_reference(media, project, &verified, &ext)
        })?;
        store.dto(&entry)
    })();
    jobs.finish(job);
    result
}
