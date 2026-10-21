use crate::{
    media_store::MediaStore,
    storage::{CollectionStore, Store},
};
use std::path::Path;
use tauri::{AppHandle, Manager};

pub fn delete(base: &Path, media: &MediaStore, id: &str) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(id)
        .map_err(|_| "projeto inválido")?
        .to_string();
    let projects = Store::open(base)?;
    let collections = CollectionStore::open(base)?;
    projects.load()?;
    collections.load()?;
    media.get("preflight")?;
    let pending_dir = base.join("cutnicepro/project-deletions");
    std::fs::create_dir_all(&pending_dir).map_err(|e| e.to_string())?;
    let pending = pending_dir.join(format!("{id}.pending"));
    std::fs::write(&pending, b"delete-project-v1").map_err(|e| e.to_string())?;
    projects.delete_project(&id)?;
    collections.remove_project_everywhere(&id)?;
    let transcript = base
        .join("cutnicepro/transcripts")
        .join(format!("{id}.json"));
    match std::fs::remove_file(transcript) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("não foi possível remover a transcrição: {e}")),
    }
    media.remove_project(&id)?;
    crate::clips::commands::remove(base, &id)?;
    std::fs::remove_file(pending).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resume(base: &Path, media: &MediaStore) -> Result<(), String> {
    let dir = base.join("cutnicepro/project-deletions");
    if !dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("pending") {
            continue;
        }
        if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
            delete(base, media, id)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let _lease = app
        .state::<std::sync::Arc<crate::processing::ProcessingGate>>()
        .acquire()?;
    let jobs = app.state::<std::sync::Arc<crate::transcription::TranscriptionJobs>>();
    jobs.edit(|| {
        delete(
            &crate::app_data_base(&app)?,
            &app.state::<MediaStore>(),
            &id,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deletion_is_idempotent_and_preserves_original_and_shared_media() {
        let base = std::env::temp_dir().join(format!("cnp-delete-{}", uuid::Uuid::new_v4()));
        let projects = Store::open(&base).unwrap();
        let a = projects.create_project("A").unwrap();
        let b = projects.create_project("B").unwrap();
        let collections = CollectionStore::open(&base).unwrap();
        let folder = collections.create_collection("Coleção", "heart").unwrap();
        collections
            .add_project(&folder.id, &a.id, &[a.id.clone(), b.id.clone()])
            .unwrap();
        let media = MediaStore::open(&base).unwrap();
        let original = base.join("original.mp4");
        std::fs::write(&original, b"media").unwrap();
        let part = media.files_dir().join("job.part");
        std::fs::copy(&original, &part).unwrap();
        let entry = media
            .publish(&part, &"a".repeat(64), 5, "mp4", "original.mp4", &a.id)
            .unwrap();
        media.link_project(&entry.media_id, &b.id).unwrap();
        let transcript = base.join("cutnicepro/transcripts");
        std::fs::create_dir_all(&transcript).unwrap();
        std::fs::write(transcript.join(format!("{}.json", a.id)), b"{}").unwrap();
        delete(&base, &media, &a.id).unwrap();
        delete(&base, &media, &a.id).unwrap();
        assert_eq!(projects.load().unwrap().len(), 1);
        assert!(collections.load().unwrap()[0].project_ids.is_empty());
        assert!(!transcript.join(format!("{}.json", a.id)).exists());
        assert!(media
            .files_dir()
            .join(format!("{}.mp4", "a".repeat(64)))
            .exists());
        delete(&base, &media, &b.id).unwrap();
        assert!(projects.load().unwrap().is_empty());
        assert_eq!(std::fs::read(&original).unwrap(), b"media");
        assert!(!media
            .files_dir()
            .join(format!("{}.mp4", "a".repeat(64)))
            .exists());
        std::fs::remove_dir_all(&base).unwrap();
    }
    #[test]
    fn invalid_id_and_corruption_do_not_delete_project_or_original() {
        let base = std::env::temp_dir().join(format!("cnp-delete-error-{}", uuid::Uuid::new_v4()));
        let projects = Store::open(&base).unwrap();
        let project = projects.create_project("Preservado").unwrap();
        let media = MediaStore::open(&base).unwrap();
        assert!(delete(&base, &media, "../escape").is_err());
        std::fs::write(base.join("cutnicepro/collections.json"), b"invalid").unwrap();
        assert!(delete(&base, &media, &project.id).is_err());
        assert_eq!(projects.load().unwrap()[0].id, project.id);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn resumes_interrupted_confirmed_deletion_after_restart() {
        let base = std::env::temp_dir().join(format!("cnp-delete-resume-{}", uuid::Uuid::new_v4()));
        let projects = Store::open(&base).unwrap();
        let project = projects.create_project("Interrompido").unwrap();
        let media = MediaStore::open(&base).unwrap();
        let dir = base.join("cutnicepro/project-deletions");
        std::fs::create_dir_all(&dir).unwrap();
        let pending = dir.join(format!("{}.pending", project.id));
        std::fs::write(&pending, b"delete-project-v1").unwrap();
        projects.delete_project(&project.id).unwrap();
        resume(&base, &media).unwrap();
        assert!(!pending.exists());
        assert!(projects.load().unwrap().is_empty());
        resume(&base, &media).unwrap();
        std::fs::remove_dir_all(base).unwrap();
    }
}
