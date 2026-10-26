//! CutNicePro — aplicativo Tauri (Home + projetos + coleções, persistência local).
//! UI (React/TS) separada da lógica: persistência exclusivamente aqui,
//! exposta por comandos IPC (`list_projects`, `create_project`, `open_project`
//! e, desde a Fase 03B, os comandos de coleções — aditivos e retrocompatíveis).

mod clip_trash;
mod clips;
mod editor;
mod file_output;
mod local_media_scheme;
mod media_analyze;
mod media_import;
mod media_output_guard;
mod media_preview;
mod media_proxy;
mod media_source;
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
use media_store::{MediaEntryDto, MediaStore, ReconcileOutcome};
use storage::{CollectionMeta, CollectionStore, ProjectMeta, Store};
use tauri::{AppHandle, Manager};

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

fn media_store_of(app: &AppHandle) -> Result<tauri::State<'_, MediaStore>, String> {
    app.try_state::<MediaStore>()
        .ok_or_else(|| "Armazenamento de mídia indisponível.".into())
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
        let job_id = job_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        uuid::Uuid::parse_str(&job_id).map_err(|_| "Identificador de importação inválido.")?;
        media_import::commands::run(
            &app,
            &project_id,
            &PathBuf::from(src_path),
            &job_id,
            asset_kind,
        )
    })
    .await
    .map_err(|error| format!("falha na tarefa de importação: {error}"))?
}

#[tauri::command]
async fn relink_media(
    app: AppHandle,
    project_id: String,
    media_id: String,
    src_path: String,
    job_id: String,
) -> Result<MediaEntryDto, String> {
    uuid::Uuid::parse_str(&job_id).map_err(|_| "Identificador de importação inválido.")?;
    tauri::async_runtime::spawn_blocking(move || {
        media_import::commands::relink(
            &app,
            &project_id,
            &media_id,
            &PathBuf::from(src_path),
            &job_id,
        )
    })
    .await
    .map_err(|error| format!("Falha ao localizar mídia: {error}"))?
}
#[tauri::command]
fn cancel_import(app: AppHandle, job_id: String) -> Result<bool, String> {
    Ok(app.state::<Arc<ImportJobs>>().cancel(&job_id))
}

#[tauri::command]
fn link_media(
    app: AppHandle,
    media_id: String,
    project_id: String,
) -> Result<MediaEntryDto, String> {
    let store = media_store_of(&app)?;
    let source = store.resolve(&media_id, None)?;
    let entry = store.link_project(&media_id, &project_id)?;
    source.recheck()?;
    store.dto(&entry)
}

#[tauri::command]
fn get_media(app: AppHandle, media_id: String) -> Result<Option<MediaEntryDto>, String> {
    let store = media_store_of(&app)?;
    store
        .get(&media_id)?
        .map(|entry| store.dto(&entry))
        .transpose()
}

#[tauri::command]
fn analyze_media(app: AppHandle, media_id: String) -> Result<MediaAnalysis, String> {
    let store = media_store_of(&app)?;
    let source = store.resolve(&media_id, None)?;
    if let Some(analysis) = &source.entry.analysis {
        return Ok(analysis.clone());
    }
    let tools = media_analyze::detect_fftools().ok_or_else(|| {
        "FFmpeg não encontrado — instale-o e tente novamente (gyan.dev / winget)".to_string()
    })?;
    let a = media_analyze::analyze(&tools, &source.path)?;
    source.recheck()?;
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
            app.manage(Arc::new(editor::thumbnail::ThumbnailJobs::default()));
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
            relink_media,
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
            clip_trash::commands::purge_clip,
            clip_trash::commands::cleanup_clip_trash,
            clips::commands::generate_clips,
            clips::commands::analyze_clip,
            clips::split_framing::suggest_split_screen,
            render::commands::export_video
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<Arc<ImportJobs>>().cancel_all();
                window
                    .state::<Arc<transcription::TranscriptionJobs>>()
                    .cancel(None);
                window.state::<clips::ClipJobs>().0.cancel(None);
                window.state::<Arc<media_preview::PreviewJobs>>().cancel();
                window
                    .state::<Arc<editor::thumbnail::ThumbnailJobs>>()
                    .cancel();
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CutNicePro");
}
