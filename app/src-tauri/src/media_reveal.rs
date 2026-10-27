use crate::media_store::MediaStore;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn directory(
    base: &Path,
    store: &MediaStore,
    project: &str,
    media: &str,
) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido.")?;
    if !crate::storage::Store::open(base)?
        .load()?
        .iter()
        .any(|entry| entry.id == project)
    {
        return Err("Projeto não encontrado.".into());
    }
    let source = store.resolve(media, Some(project))?;
    source.recheck()?;
    let directory = source
        .path
        .parent()
        .filter(|path| path.is_dir())
        .ok_or("A pasta deste arquivo não está disponível.")?;
    Ok(directory.to_path_buf())
}

fn reveal_with(
    base: &Path,
    store: &MediaStore,
    project: &str,
    media: &str,
    open: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let path = directory(base, store, project, media)?;
    open(&path)
}

#[cfg(windows)]
fn explorer_directory(path: &Path) -> PathBuf {
    use std::path::{Component, Prefix};
    let mut parts = path.components();
    let Some(Component::Prefix(prefix)) = parts.next() else {
        return path.to_path_buf();
    };
    let mut normal = match prefix.kind() {
        Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:\\", drive as char)),
        Prefix::VerbatimUNC(server, share) => {
            let mut value = PathBuf::from("\\\\");
            value.push(server);
            value.push(share);
            value
        }
        _ => return path.to_path_buf(),
    };
    for part in parts.filter(|part| !matches!(part, Component::RootDir)) {
        normal.push(part);
    }
    normal
}

#[cfg(windows)]
fn open_directory(path: &Path) -> Result<(), String> {
    let windows = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or("Não foi possível localizar o Explorador de Arquivos.")?;
    let explorer = windows.join("explorer.exe");
    if !explorer.is_file() {
        return Err("O Explorador de Arquivos não está disponível.".into());
    }
    std::process::Command::new(explorer)
        .arg(explorer_directory(path))
        .spawn()
        .map(|_| ())
        .map_err(|_| "Não foi possível abrir a pasta deste arquivo.".into())
}

#[cfg(not(windows))]
fn open_directory(_: &Path) -> Result<(), String> {
    Err("Abrir o local do arquivo não está disponível neste sistema.".into())
}

#[tauri::command]
pub async fn reveal_editor_media(
    app: AppHandle,
    project_id: String,
    media_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        reveal_with(
            &crate::app_data_base(&app)?,
            &app.state::<MediaStore>(),
            &project_id,
            &media_id,
            open_directory,
        )
    })
    .await
    .map_err(|_| "Não foi possível abrir o local do arquivo.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_store::reference_tests::Fixture;
    use std::{cell::Cell, sync::atomic::AtomicBool};

    fn reference(fixture: &Fixture, project: &str, name: &str) -> (String, PathBuf) {
        let path = fixture.source(name, b"original");
        let checked = crate::media_import::verify_reference(
            &path,
            &AtomicBool::new(false),
            &|_| {},
            std::time::Duration::from_secs(5),
        )
        .unwrap();
        let entry = fixture
            .store()
            .publish_reference(&checked, "mp4", name, project, None)
            .unwrap();
        (entry.media_id, path)
    }

    #[test]
    fn reveals_registered_unicode_reference_without_changing_original() {
        let fixture = Fixture::new();
        let project = crate::storage::Store::open(&fixture.0)
            .unwrap()
            .create_project("Edição")
            .unwrap();
        let (media, original) = reference(&fixture, &project.id, "vídeo ação 你好.mp4");
        let expected = original
            .canonicalize()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        let count = Cell::new(0);
        reveal_with(
            &fixture.0,
            &fixture.store(),
            &project.id,
            &media,
            |folder| {
                assert_eq!(folder, expected);
                count.set(count.get() + 1);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(count.get(), 1);
        assert_eq!(std::fs::read(original).unwrap(), b"original");
    }

    #[test]
    fn denies_wrong_project_missing_changed_and_unregistered_media_before_opening() {
        let fixture = Fixture::new();
        let projects = crate::storage::Store::open(&fixture.0).unwrap();
        let project = projects.create_project("Primeiro").unwrap();
        let other = projects.create_project("Outro").unwrap();
        let (media, original) = reference(&fixture, &project.id, "original.mp4");
        let opened = Cell::new(0);
        let open = |_: &Path| {
            opened.set(opened.get() + 1);
            Ok(())
        };
        assert!(reveal_with(&fixture.0, &fixture.store(), &other.id, &media, open).is_err());
        assert!(reveal_with(
            &fixture.0,
            &fixture.store(),
            &uuid::Uuid::new_v4().to_string(),
            &media,
            open
        )
        .is_err());
        assert!(reveal_with(&fixture.0, &fixture.store(), "../project", &media, open).is_err());
        assert!(reveal_with(
            &fixture.0,
            &fixture.store(),
            &project.id,
            "not-registered",
            open
        )
        .is_err());
        std::fs::write(&original, b"modified").unwrap();
        assert!(reveal_with(&fixture.0, &fixture.store(), &project.id, &media, open).is_err());
        std::fs::remove_file(original).unwrap();
        assert!(reveal_with(&fixture.0, &fixture.store(), &project.id, &media, open).is_err());
        assert_eq!(opened.get(), 0);
    }

    #[test]
    fn reveals_existing_managed_media_and_returns_open_failure() {
        let fixture = Fixture::new();
        let project = crate::storage::Store::open(&fixture.0)
            .unwrap()
            .create_project("Legado")
            .unwrap();
        let store = fixture.store();
        let entry = store
            .publish(
                &fixture.source("staged.part", b"abc"),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                3,
                "mp4",
                "legado.mp4",
                &project.id,
            )
            .unwrap();
        let expected = store.files_dir().canonicalize().unwrap();
        assert_eq!(
            directory(&fixture.0, &store, &project.id, &entry.media_id).unwrap(),
            expected
        );
        let error = reveal_with(&fixture.0, &store, &project.id, &entry.media_id, |_| {
            Err("Não foi possível abrir a pasta.".into())
        })
        .unwrap_err();
        assert_eq!(error, "Não foi possível abrir a pasta.");
        std::fs::write(store.registered_path(&entry).unwrap(), b"changed size").unwrap();
        assert!(directory(&fixture.0, &store, &project.id, &entry.media_id).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn explorer_paths_preserve_unicode_and_literal_shell_characters() {
        for (source, expected) in [
            (r"\\?\C:\área ação & exemplo", r"C:\área ação & exemplo"),
            (
                r"\\?\UNC\servidor\vídeos\edição",
                r"\\servidor\vídeos\edição",
            ),
            (r"C:\vídeos\normal", r"C:\vídeos\normal"),
        ] {
            assert_eq!(
                explorer_directory(Path::new(source)),
                PathBuf::from(expected)
            );
        }
    }
}
