use crate::{
    file_output,
    media_source::file_identity,
    media_store::{MediaStorage, MediaStore},
};
use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};

const ORIGINAL_DESTINATION: &str = "Escolha um novo arquivo para exportar. O destino corresponde a uma mídia original registrada no aplicativo.";

fn normalized(path: &Path) -> Result<PathBuf, String> {
    match path.canonicalize() {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or("destino inválido")?;
            let name = path.file_name().ok_or("destino inválido")?;
            Ok(normalized(parent)?.join(name))
        }
        Err(error) => Err(error.to_string()),
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

pub(crate) fn check(base: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("destino inválido")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let managed = base.canonicalize().map_err(|error| error.to_string())?;
    if parent.starts_with(&managed) {
        return Err("escolha outra pasta para salvar".into());
    }
    let target = normalized(destination)?;
    let identity = match File::open(destination) {
        Ok(file) => {
            if !file
                .metadata()
                .map_err(|error| error.to_string())?
                .is_file()
            {
                return Err("destino inválido".into());
            }
            Some(file_identity(&file).map_err(|error| error.to_string())?)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    let store = MediaStore::open(base)?;
    for entry in store.entries()? {
        let MediaStorage::Reference { stamp, .. } = &entry.storage else {
            continue;
        };
        let registered = store.registered_path(&entry)?;
        let source_path = normalized(&registered).unwrap_or_else(|_| registered.clone());
        if same_path(&source_path, &target) {
            return Err(ORIGINAL_DESTINATION.into());
        }
        if let Some(target_identity) = &identity {
            if target_identity == &stamp.identity {
                return Err(ORIGINAL_DESTINATION.into());
            }
            if let Ok(source) = File::open(registered) {
                if file_identity(&source).map_err(|error| error.to_string())? == *target_identity {
                    return Err(ORIGINAL_DESTINATION.into());
                }
            }
        }
    }
    Ok(())
}

pub(crate) struct ProtectedOutput {
    base: PathBuf,
    destination: PathBuf,
    prepared: file_output::PreparedOutput,
}

impl ProtectedOutput {
    pub(crate) fn commit(&self) -> Result<(), String> {
        check(&self.base, &self.destination)?;
        self.prepared.commit()
    }

    pub(crate) fn commit_new(&self) -> Result<(), String> {
        check(&self.base, &self.destination)?;
        self.prepared.commit_new()
    }
}

pub(crate) fn prepare(
    base: &Path,
    destination: &Path,
    write: impl FnOnce(&mut File) -> Result<(), String>,
) -> Result<ProtectedOutput, String> {
    check(base, destination)?;
    Ok(ProtectedOutput {
        base: base.to_owned(),
        destination: destination.to_owned(),
        prepared: file_output::prepare(destination, write)?,
    })
}

#[cfg(test)]
mod tests {
    use super::prepare;
    use crate::{
        media_import::verify_reference,
        media_store::{reference_tests::Fixture, MediaEntry, MediaStore},
    };
    use std::{
        io::Write,
        path::Path,
        sync::atomic::{AtomicBool, Ordering},
        time::Duration,
    };

    fn register(store: &MediaStore, source: &Path, project: &str) -> MediaEntry {
        let checked = verify_reference(
            source,
            &AtomicBool::new(false),
            &|_| {},
            Duration::from_secs(10),
        )
        .unwrap();
        store
            .publish_reference(&checked, "mp4", "original.mp4", project, None)
            .unwrap()
    }

    #[test]
    fn m7a_export_destination_rejects_registered_original_from_another_project() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        assert!(crate::project_files::destination_allowed(&base, &original).is_err());
        assert_eq!(std::fs::read(original).unwrap(), b"preserved original");
    }

    #[test]
    fn m7a_export_destination_rejects_hardlink_to_registered_original() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        let alias = fixture.0.join("different-name.txt");
        std::fs::hard_link(&original, &alias).unwrap();
        assert!(crate::project_files::destination_allowed(&base, &alias).is_err());
        assert_eq!(std::fs::read(original).unwrap(), b"preserved original");
    }

    #[test]
    fn m7a_export_destination_rejects_same_registered_path_when_original_is_missing() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        std::fs::remove_file(&original).unwrap();
        assert!(crate::project_files::destination_allowed(&base, &original).is_err());
    }

    #[test]
    fn m7a_export_destination_allows_new_output_with_unrelated_missing_reference() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        std::fs::remove_file(original).unwrap();
        assert!(crate::project_files::destination_allowed(
            &base,
            &fixture.0.join("new-output.mp4")
        )
        .is_ok());
    }

    #[test]
    fn m7a_export_preparation_rejects_original_before_opening_output() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        let written = AtomicBool::new(false);
        assert!(prepare(&base, &original, |_| {
            written.store(true, Ordering::SeqCst);
            Ok(())
        })
        .is_err());
        assert!(!written.load(Ordering::SeqCst));
        assert_eq!(std::fs::read(original).unwrap(), b"preserved original");
    }

    #[test]
    fn m7a_export_commit_rechecks_new_reference_registered_after_preparation() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let destination = fixture.0.join("new-output.mp4");
        let prepared = prepare(&base, &destination, |file| {
            file.write_all(b"rendered")
                .map_err(|error| error.to_string())
        })
        .unwrap();
        std::fs::write(&destination, b"newly registered original").unwrap();
        register(&store, &destination, "other-project");
        assert!(prepared.commit().is_err());
        drop(prepared);
        assert_eq!(
            std::fs::read(destination).unwrap(),
            b"newly registered original"
        );
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 2);
    }

    #[test]
    fn m7a_export_failed_or_cancelled_preparation_preserves_original_and_destination() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("original.mp4", b"preserved original");
        register(&store, &original, "other-project");
        let destination = fixture.source("export.mp4", b"previous export");
        assert!(prepare(&base, &destination, |file| {
            file.write_all(b"incomplete").unwrap();
            Err("cancelled".into())
        })
        .is_err());
        let pending = prepare(&base, &destination, |file| {
            file.write_all(b"not committed")
                .map_err(|error| error.to_string())
        })
        .unwrap();
        drop(pending);
        assert_eq!(std::fs::read(original).unwrap(), b"preserved original");
        assert_eq!(std::fs::read(destination).unwrap(), b"previous export");
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 3);
    }

    #[cfg(windows)]
    #[test]
    fn m7a_export_destination_rejects_missing_original_with_different_case() {
        let fixture = Fixture::new();
        let base = fixture.0.join("app-data");
        let store = MediaStore::open(&base).unwrap();
        let original = fixture.source("Original.MP4", b"preserved original");
        register(&store, &original, "other-project");
        std::fs::remove_file(original).unwrap();
        assert!(
            crate::project_files::destination_allowed(&base, &fixture.0.join("original.mp4"))
                .is_err()
        );
    }
}
