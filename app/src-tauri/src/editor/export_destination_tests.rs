use super::*;
use crate::{
    editor::export_options::{Codec, Format},
    media_store::MediaStore,
};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

struct Lab {
    root: PathBuf,
    base: PathBuf,
    folder: PathBuf,
}

impl Lab {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.tooling/test-output")
            .join(format!("export-destination-{}", uuid::Uuid::new_v4()));
        let base = root.join("app-data");
        let folder = root.join("exports");
        fs::create_dir_all(&folder).unwrap();
        MediaStore::open(&base).unwrap();
        Self {
            root: root.canonicalize().unwrap(),
            base,
            folder,
        }
    }

    fn destination(&self, name: &str) -> Destination {
        resolve(
            &self.base,
            self.folder.to_str().unwrap(),
            name,
            ExportOptions::default(),
        )
        .unwrap()
    }

    fn register(&self, path: &std::path::Path) {
        let checked = crate::media_import::verify_reference(
            path,
            &AtomicBool::new(false),
            &|_| {},
            Duration::from_secs(10),
        )
        .unwrap();
        MediaStore::open(&self.base)
            .unwrap()
            .publish_reference(&checked, "mp4", "original.mp4", "project", None)
            .unwrap();
    }
}

impl Drop for Lab {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn direct_destination_preserves_unicode_and_normalizes_mp4_mov_extension_once() {
    let lab = Lab::new();
    for (name, format, expected) in [
        ("Ação final", Format::Mp4, "Ação final.mp4"),
        ("take.MP4", Format::Mov, "take.mov"),
        ("take.mov", Format::Mp4, "take.mp4"),
        ("take.v2", Format::Mp4, "take.v2.mp4"),
    ] {
        let options = ExportOptions {
            format,
            ..ExportOptions::default()
        };
        let destination = resolve(&lab.base, lab.folder.to_str().unwrap(), name, options).unwrap();
        assert_eq!(destination.path().file_name().unwrap(), expected);
        let value = serde_json::to_value(destination.status().unwrap()).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"exists":false,"fileName":expected})
        );
        assert!(!destination.path().exists());
    }
}

#[test]
fn invalid_names_and_windows_devices_cannot_escape_the_folder() {
    let lab = Lab::new();
    for name in [
        "",
        " ",
        ".",
        "..",
        "../escape",
        "folder/escape",
        "folder\\escape",
        "C:escape",
        "take?",
        "take*",
        "take|",
        "take<",
        "take>",
        "take\"",
        "take\0",
        "take\n",
        "take.",
        "CON",
        "con.mp4",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "LPT9.mov",
        "COM¹",
        "CONOUT$",
    ] {
        assert!(
            resolve(
                &lab.base,
                lab.folder.to_str().unwrap(),
                name,
                ExportOptions::default()
            )
            .is_err(),
            "{name:?}"
        );
    }
    assert!(resolve(
        &lab.base,
        lab.folder.to_str().unwrap(),
        &"a".repeat(121),
        ExportOptions::default()
    )
    .is_err());
    assert!(resolve(
        &lab.base,
        lab.folder.to_str().unwrap(),
        &"á".repeat(120),
        ExportOptions::default()
    )
    .is_ok());
}

#[test]
fn relative_missing_non_directory_managed_folder_and_invalid_options_are_rejected() {
    let lab = Lab::new();
    let file = lab.folder.join("file");
    fs::write(&file, b"keep").unwrap();
    let missing = lab.root.join("missing");
    for directory in [
        "exports",
        missing.to_str().unwrap(),
        file.to_str().unwrap(),
        lab.base.to_str().unwrap(),
    ] {
        assert!(resolve(&lab.base, directory, "take", ExportOptions::default()).is_err());
    }
    let invalid = ExportOptions {
        codec: Codec::Rle,
        format: Format::Mp4,
        ..ExportOptions::default()
    };
    assert!(resolve(&lab.base, lab.folder.to_str().unwrap(), "take", invalid).is_err());
}

#[test]
fn existing_destination_requires_explicit_overwrite_before_any_copy() {
    let lab = Lab::new();
    let destination = lab.destination("take");
    fs::write(destination.path(), b"previous").unwrap();
    assert!(destination.status().unwrap().exists);
    let copied = AtomicBool::new(false);
    assert!(destination
        .prepare(false, |_| {
            copied.store(true, Ordering::SeqCst);
            Ok(())
        })
        .is_err());
    assert!(!copied.load(Ordering::SeqCst));
    assert_eq!(fs::read(destination.path()).unwrap(), b"previous");
    let prepared = destination
        .prepare(true, |file| {
            file.write_all(b"replacement")
                .map_err(|error| error.to_string())
        })
        .unwrap();
    prepared.commit().unwrap();
    assert_eq!(fs::read(destination.path()).unwrap(), b"replacement");
}

#[test]
fn file_appearing_during_render_or_after_prepare_is_never_overwritten_without_confirmation() {
    let lab = Lab::new();
    let destination = lab.destination("take");
    destination.recheck(false).unwrap();
    fs::write(destination.path(), b"appeared during render").unwrap();
    assert!(destination
        .prepare(false, |_| panic!("copy must not start"))
        .is_err());
    assert_eq!(
        fs::read(destination.path()).unwrap(),
        b"appeared during render"
    );
    fs::remove_file(destination.path()).unwrap();
    let prepared = destination
        .prepare(false, |file| {
            file.write_all(b"new output")
                .map_err(|error| error.to_string())
        })
        .unwrap();
    fs::write(destination.path(), b"appeared after prepare").unwrap();
    assert!(prepared.commit().is_err());
    drop(prepared);
    assert_eq!(
        fs::read(destination.path()).unwrap(),
        b"appeared after prepare"
    );
    assert_eq!(fs::read_dir(&lab.folder).unwrap().count(), 1);
}

#[test]
fn overwrite_cannot_replace_an_original_or_a_hardlink_to_it() {
    let lab = Lab::new();
    let original = lab.folder.join("original.mp4");
    fs::write(&original, b"original preserved").unwrap();
    lab.register(&original);
    assert!(resolve(
        &lab.base,
        lab.folder.to_str().unwrap(),
        "original",
        ExportOptions::default()
    )
    .is_err());
    fs::hard_link(&original, lab.folder.join("alias.mp4")).unwrap();
    assert!(resolve(
        &lab.base,
        lab.folder.to_str().unwrap(),
        "alias",
        ExportOptions::default()
    )
    .is_err());
    assert_eq!(fs::read(original).unwrap(), b"original preserved");
}

#[test]
fn original_registered_after_prepare_remains_protected_even_with_overwrite() {
    let lab = Lab::new();
    let destination = lab.destination("take");
    fs::write(destination.path(), b"original preserved").unwrap();
    let prepared = destination
        .prepare(true, |file| {
            file.write_all(b"new output")
                .map_err(|error| error.to_string())
        })
        .unwrap();
    lab.register(destination.path());
    assert!(prepared.commit().is_err());
    assert_eq!(fs::read(destination.path()).unwrap(), b"original preserved");
}

#[test]
fn failed_or_abandoned_copy_preserves_existing_output_and_removes_only_its_part() {
    let lab = Lab::new();
    let destination = lab.destination("take");
    fs::write(destination.path(), b"previous").unwrap();
    assert!(destination
        .prepare(true, |file| {
            file.write_all(b"partial").unwrap();
            Err("cancelled".into())
        })
        .is_err());
    let prepared = destination
        .prepare(true, |file| {
            file.write_all(b"not committed")
                .map_err(|error| error.to_string())
        })
        .unwrap();
    drop(prepared);
    assert_eq!(fs::read(destination.path()).unwrap(), b"previous");
    assert_eq!(fs::read_dir(&lab.folder).unwrap().count(), 1);
}
