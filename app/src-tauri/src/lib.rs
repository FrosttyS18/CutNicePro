//! CutNicePro M1 — aplicativo Tauri (Home + projetos + persistência local).
//! UI (React/TS) separada da lógica: persistência exclusivamente aqui,
//! exposta pelos comandos `list_projects`, `create_project`, `open_project`.

mod storage;

use storage::{ProjectMeta, Store};
use tauri::{AppHandle, Manager};

fn store_of(app: &AppHandle) -> Result<Store, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("não foi possível localizar a pasta de dados do app: {e}"))?;
    Store::open(&base)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            open_project
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CutNicePro");
}
