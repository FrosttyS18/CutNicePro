//! CutNicePro — aplicativo Tauri (Home + projetos + coleções, persistência local).
//! UI (React/TS) separada da lógica: persistência exclusivamente aqui,
//! exposta por comandos IPC (`list_projects`, `create_project`, `open_project`
//! e, desde a Fase 03B, os comandos de coleções — aditivos e retrocompatíveis).

mod media_proxy;
mod storage;

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
fn list_collections(app: AppHandle) -> Result<Vec<CollectionMeta>, String> {
    collection_store_of(&app)?.load()
}

#[tauri::command]
fn create_collection(
    app: AppHandle,
    name: String,
    icon: String,
) -> Result<CollectionMeta, String> {
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
        .register_asynchronous_uri_scheme_protocol("cnpmedia", |ctx, request, responder| {
            media_proxy::handle(ctx, request, responder)
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            open_project,
            list_collections,
            create_collection,
            add_project_to_collection,
            remove_project_from_collection
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CutNicePro");
}
