import io

p = "app/src-tauri/src/lib.rs"
s = io.open(p, encoding="utf-8").read()

s = s.replace('''mod media_proxy;
mod storage;

use storage::{CollectionMeta, CollectionStore, ProjectMeta, Store};
use tauri::{AppHandle, Manager};''', '''mod local_media_scheme;
mod media_analyze;
mod media_import;
mod media_proxy;
mod media_store;
mod storage;

use std::path::PathBuf;
use std::sync::Arc;

use media_analyze::MediaAnalysis;
use media_import::ImportJobs;
use media_store::{MediaEntry, MediaStore, ReconcileOutcome};
use storage::{CollectionMeta, CollectionStore, ProjectMeta, Store};
use tauri::{AppHandle, Emitter, Manager};''')

s = s.replace('''fn collection_store_of(app: &AppHandle) -> Result<CollectionStore, String> {
    CollectionStore::open(&app_data_base(app)?)
}''', '''fn collection_store_of(app: &AppHandle) -> Result<CollectionStore, String> {
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
fn import_media(
    app: AppHandle,
    project_id: String,
    src_path: String,
) -> Result<String, String> {
    let store = media_store_of(&app)?;
    let jobs = app.state::<Arc<ImportJobs>>();
    let src = PathBuf::from(&src_path);
    let original_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".into());
    let ext = media_import::allowed_ext(&original_name).ok_or_else(|| {
        "formato de vídeo não suportado (use mp4, m4v, mov, webm, mkv ou avi)".to_string()
    })?;
    if !src.is_file() {
        return Err(format!("arquivo não encontrado: {src_path}"));
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    let staged = store.files_dir().join(format!("{job_id}.part"));
    let cancel = jobs.register(&job_id);
    let _ = std::fs::remove_file(&staged);

    let app2 = app.clone();
    let job2 = job_id.clone();
    let result = media_import::copy_with_hash(
        &src,
        &staged,
        &cancel,
        &|bytes| {
            let total = std::fs::metadata(&src).map(|m| m.len()).unwrap_or(bytes);
            let _ = app2.emit(
                "import://progress",
                media_import::ImportProgress {
                    job_id: job2.clone(),
                    bytes_copied: bytes,
                    total_bytes: total,
                },
            );
        },
        &|p| free_space(p),
    );
    jobs.finish(&job_id);
    match result {
        Ok((size, sha)) => {
            let entry: MediaEntry =
                store.publish(&staged, &sha, size, &ext, &original_name, &project_id)?;
            let analysis_err = match media_analyze::detect_fftools() {
                Some(tools) => {
                    let final_path = store.files_dir().join(format!("{sha}.{ext}"));
                    match media_analyze::analyze(&tools, &final_path) {
                        Ok(a) => {
                            let _ = store.store_analysis(&entry.media_id, a);
                            None
                        }
                        Err(e) => Some(e),
                    }
                }
                None => Some("FFmpeg não encontrado — análise de mídia indisponível".into()),
            };
            let mut payload = serde_json::to_value(&entry).unwrap_or(serde_json::Value::Null);
            if let Some(err) = analysis_err {
                payload["analysisError"] = serde_json::Value::String(err);
            }
            let _ = app.emit("import://done", &payload);
            Ok(payload.to_string())
        }
        Err(media_import::ImportError::Cancelled)
        | Err(media_import::ImportError::SourceChanged)
        | Err(media_import::ImportError::DiskFull) => {
            let _ = std::fs::remove_file(&staged);
            Err(result.unwrap_err().message())
        }
        Err(media_import::ImportError::Io(msg)) => {
            let _ = std::fs::remove_file(&staged);
            Err(msg)
        }
    }
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
) -> Result<MediaEntry, String> {
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
    let path = store.files_dir().join(format!("{}.{}", entry.sha256, entry.ext));
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
}''')

s = s.replace('''pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("cnpmedia", |ctx, request, responder| {
            media_proxy::handle(ctx, request, responder)
        })''', '''pub fn run() {
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
            let store = MediaStore::open(
                &app.path()
                    .app_data_dir()
                    .map_err(|e| format!("pasta de dados indisponível: {e}"))?,
            )?;
            app.manage(store);
            let s = app.state::<MediaStore>();
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
        })''')

s = s.replace('''            remove_project_from_collection
        ])''', '''            remove_project_from_collection,
            import_media,
            cancel_import,
            link_media,
            get_media,
            analyze_media,
            remove_project_media,
            media_reconcile
        ])''')

io.open(p, "w", encoding="utf-8").write(s)
print("lib.rs escrito")
