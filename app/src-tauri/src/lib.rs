//! CutNicePro — aplicativo Tauri (Home + projetos + coleções, persistência local).
//! UI (React/TS) separada da lógica: persistência exclusivamente aqui,
//! exposta por comandos IPC (`list_projects`, `create_project`, `open_project`
//! e, desde a Fase 03B, os comandos de coleções — aditivos e retrocompatíveis).

mod clips;
mod editor;
mod file_output;
mod local_media_scheme;
mod media_analyze;
mod media_import;
mod media_preview;
mod media_proxy;
mod media_store;
mod media_tools;
mod processing;
mod project_delete;
mod project_files;
mod render;
mod storage;
mod transcription;

use std::path::PathBuf;
use std::sync::Arc;

use media_analyze::MediaAnalysis;
use media_import::ImportJobs;
use media_store::{MediaEntry, MediaStore, ReconcileOutcome};
use storage::{CollectionMeta, CollectionStore, ProjectMeta, Store};
use tauri::{AppHandle, Emitter, Manager};

fn app_data_base(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("não foi possível localizar a pasta de dados do app: {e}"))
}

fn store_of(app: &AppHandle) -> Result<Store, String> {
    Store::open(&app_data_base(app)?)
}

fn collection_store_of(app: &AppHandle) -> Result<CollectionStore, String> {
    CollectionStore::open(&app_data_base(app)?)
}

fn media_store_of(app: &AppHandle) -> Result<MediaStore, String> {
    MediaStore::open(&app_data_base(app)?)
}

fn free_space(path: &std::path::Path) -> Option<u64> {
    fs2::available_space(path).ok()
}

// ---- M2A: importação persistente + análise ----

#[tauri::command]
async fn import_media(
    app: AppHandle,
    project_id: String,
    src_path: String,
    job_id: Option<String>,
    asset_kind: Option<editor::types::MediaKind>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = media_store_of(&app)?;
        let jobs = app.state::<Arc<ImportJobs>>();
        let src = PathBuf::from(&src_path);
        let original_name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "video".into());
        let ext = asset_kind
            .as_ref()
            .map_or_else(
                || media_import::allowed_ext(&original_name),
                |kind| media_import::allowed_editor_ext(&original_name, kind),
            )
            .ok_or_else(|| "Formato não suportado para o tipo de mídia escolhido.".to_string())?;
        if !src.is_file() {
            return Err(format!("arquivo não encontrado: {src_path}"));
        }
        let job_id = match job_id {
            Some(value) => uuid::Uuid::parse_str(&value)
                .map_err(|_| "identificador de importação inválido".to_string())?
                .to_string(),
            None => uuid::Uuid::new_v4().to_string(),
        };
        let staged = store.files_dir().join(format!("{job_id}.part"));
        let cancel = jobs.register(&job_id);
        let total = std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
        let report = |bytes| {
            let _ = app.emit(
                "import://progress",
                media_import::ImportProgress {
                    job_id: job_id.clone(),
                    bytes_copied: bytes,
                    total_bytes: total,
                },
            );
        };
        report(0);
        let result = (|| -> Result<String, String> {
            let (size, sha) =
                media_import::copy_with_hash(&src, &staged, &cancel, &report, &|p| free_space(p))
                    .map_err(|error| error.message())?;
            if cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err("importação cancelada".into());
            }
            let entry = store.publish(&staged, &sha, size, &ext, &original_name, &project_id)?;
            let analysis_err = match media_analyze::detect_fftools() {
                Some(tools) => {
                    let final_path = store.files_dir().join(format!("{sha}.{ext}"));
                    match asset_kind.as_ref().map_or_else(
                        || media_analyze::analyze(&tools, &final_path),
                        |kind| media_analyze::analyze_for_kind(&tools, &final_path, kind),
                    ) {
                        Ok(analysis) => {
                            store.store_analysis(&entry.media_id, analysis)?;
                            None
                        }
                        Err(error) => Some(error),
                    }
                }
                None => Some("FFmpeg não encontrado — análise de mídia indisponível".into()),
            };
            if cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err("importação cancelada".into());
            }
            let entry = store.get(&entry.media_id)?.unwrap_or(entry);
            let mut payload = serde_json::to_value(&entry).map_err(|error| error.to_string())?;
            if let Some(error) = analysis_err {
                payload["analysisError"] = serde_json::Value::String(error);
            }
            let _ = app.emit("import://done", &payload);
            Ok(payload.to_string())
        })();
        jobs.finish(&job_id);
        if result.is_err() {
            let _ = std::fs::remove_file(&staged);
        }
        result
    })
    .await
    .map_err(|error| format!("falha na tarefa de importação: {error}"))?
}

#[tauri::command]
fn cancel_import(app: AppHandle, job_id: String) -> Result<bool, String> {
    Ok(app.state::<Arc<ImportJobs>>().cancel(&job_id))
}

#[tauri::command]
fn link_media(app: AppHandle, media_id: String, project_id: String) -> Result<MediaEntry, String> {
    media_store_of(&app)?.link_project(&media_id, &project_id)
}

#[tauri::command]
fn get_media(app: AppHandle, media_id: String) -> Result<Option<MediaEntry>, String> {
    media_store_of(&app)?.get(&media_id)
}

#[tauri::command]
fn analyze_media(app: AppHandle, media_id: String) -> Result<MediaAnalysis, String> {
    let store = media_store_of(&app)?;
    let entry = store
        .get(&media_id)?
        .ok_or_else(|| "mídia não encontrada".to_string())?;
    if entry.unavailable {
        return Err("arquivo de mídia ausente do disco".into());
    }
    if let Some(a) = entry.analysis {
        return Ok(a);
    }
    let tools = media_analyze::detect_fftools().ok_or_else(|| {
        "FFmpeg não encontrado — instale-o e tente novamente (gyan.dev / winget)".to_string()
    })?;
    let path = store
        .files_dir()
        .join(format!("{}.{}", entry.sha256, entry.ext));
    let a = media_analyze::analyze(&tools, &path)?;
    store.store_analysis(&media_id, a.clone())?;
    Ok(a)
}

#[tauri::command]
fn remove_project_media(app: AppHandle, project_id: String) -> Result<Vec<String>, String> {
    media_store_of(&app)?.remove_project(&project_id)
}

#[tauri::command]
fn media_reconcile(app: AppHandle) -> Result<String, String> {
    let store = media_store_of(&app)?;
    let jobs = app.state::<Arc<ImportJobs>>();
    match store.reconcile(&jobs.live_parts(&store))? {
        ReconcileOutcome::Ok {
            adopted,
            removed_parts,
            marked_unavailable,
        } => Ok(format!(
            "reconcile ok: adotados={adopted} parts_removidos={removed_parts} indisponiveis={marked_unavailable}"
        )),
        ReconcileOutcome::Suspended(cause) => Err(format!("limpeza suspensa: {cause}")),
    }
}

#[tauri::command]
fn list_projects(app: AppHandle) -> Result<Vec<ProjectMeta>, String> {
    store_of(&app)?.load()
}

#[tauri::command]
fn create_project(app: AppHandle, name: String) -> Result<ProjectMeta, String> {
    store_of(&app)?.create_project(&name)
}

#[tauri::command]
fn open_project(app: AppHandle, id: String) -> Result<ProjectMeta, String> {
    store_of(&app)?.open_project(&id)
}

#[tauri::command]
fn rename_project(app: AppHandle, id: String, name: String) -> Result<ProjectMeta, String> {
    store_of(&app)?.rename_project(&id, &name)
}

#[tauri::command]
fn list_collections(app: AppHandle) -> Result<Vec<CollectionMeta>, String> {
    collection_store_of(&app)?.load()
}

#[tauri::command]
fn create_collection(app: AppHandle, name: String, icon: String) -> Result<CollectionMeta, String> {
    collection_store_of(&app)?.create_collection(&name, &icon)
}

#[tauri::command]
fn add_project_to_collection(
    app: AppHandle,
    collection_id: String,
    project_id: String,
) -> Result<CollectionMeta, String> {
    let known: Vec<String> = store_of(&app)?.load()?.into_iter().map(|p| p.id).collect();
    collection_store_of(&app)?.add_project(&collection_id, &project_id, &known)
}

#[tauri::command]
fn remove_project_from_collection(
    app: AppHandle,
    collection_id: String,
    project_id: String,
) -> Result<CollectionMeta, String> {
    collection_store_of(&app)?.remove_project(&collection_id, &project_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("cnpmedia", |ctx, request, responder| {
            media_proxy::handle(ctx, request, responder)
        })
        .register_asynchronous_uri_scheme_protocol("cnplocal", |ctx, request, responder| {
            local_media_scheme::handle(ctx, request, responder)
        })
        .setup(|app| {
            app.manage(Arc::new(ImportJobs::new()));
            app.manage(Arc::new(transcription::TranscriptionJobs::default()));
            app.manage(Arc::new(processing::ProcessingGate::default()));
            app.manage(clips::ClipJobs::default());
            app.manage(Arc::new(media_preview::PreviewJobs::default()));
            let store = MediaStore::open(&app_data_base(app.handle())?)?;
            app.manage(store);
            let s = app.state::<MediaStore>();
            if let Err(error) = project_delete::resume(&app_data_base(app.handle())?, &s) {
                eprintln!("[projects] exclusão pendente: {error}");
            }
            match s.reconcile(&[])? {
                ReconcileOutcome::Suspended(cause) => {
                    eprintln!("[media] limpeza suspensa: {cause}");
                }
                ReconcileOutcome::Ok {
                    adopted,
                    removed_parts,
                    ..
                } => {
                    if adopted > 0 || removed_parts > 0 {
                        eprintln!("[media] reconcile: adotados={adopted} parts={removed_parts}");
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            editor::commands::load_editor_project,
            editor::manual_commands::create_editor_clip,
            editor::manual_commands::update_editor_clip_metadata,
            editor::thumbnail::get_editor_thumbnail,
            editor::export_command::export_editor_document,
            editor::commands::save_editor_document,
            editor::batch_commands::save_editor_batch,
            editor::commands::save_editor_recovery,
            editor::commands::get_editor_recovery,
            editor::commands::discard_editor_recovery,
            list_projects,
            create_project,
            open_project,
            rename_project,
            project_delete::delete_project,
            project_files::export_project_file,
            list_collections,
            create_collection,
            add_project_to_collection,
            remove_project_from_collection,
            import_media,
            cancel_import,
            link_media,
            get_media,
            analyze_media,
            remove_project_media,
            media_reconcile,
            transcription::commands::transcription_status,
            transcription::commands::transcription_job,
            transcription::commands::cancel_transcription,
            transcription::commands::get_transcript,
            transcription::commands::save_transcript,
            transcription::commands::transcribe_project,
            media_preview::timeline_preview,
            media_preview::thumbnail::clip_thumbnail,
            clips::commands::get_clips,
            clips::commands::get_project_clips,
            clips::commands::clips_job,
            clips::commands::cancel_clips,
            clips::commands::review_clip,
            clips::commands::delete_clip,
            clips::commands::restore_clip,
            clips::commands::generate_clips,
            clips::commands::analyze_clip,
            clips::split_framing::suggest_split_screen,
            render::commands::export_video
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<Arc<transcription::TranscriptionJobs>>()
                    .cancel(None);
                window.state::<clips::ClipJobs>().0.cancel(None);
                window.state::<Arc<media_preview::PreviewJobs>>().cancel();
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CutNicePro");
}
