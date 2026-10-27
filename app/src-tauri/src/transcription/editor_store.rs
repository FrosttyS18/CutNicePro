use super::{parser, types::Transcript};
use std::path::{Path, PathBuf};

pub fn validate_media_id(media: &str) -> Result<(), String> {
    let digest = media.len() == 64 && media.bytes().all(|byte| byte.is_ascii_hexdigit());
    let identifier = media.len() == 36 && uuid::Uuid::parse_str(media).is_ok();
    if !digest && !identifier {
        return Err("Identificador de mídia inválido".into());
    }
    Ok(())
}

fn path(base: &Path, project: &str, media: &str) -> Result<PathBuf, String> {
    let project =
        uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido")?;
    validate_media_id(media)?;
    Ok(base
        .join("cutnicepro/transcripts/editor")
        .join(format!("{project}-{media}.json")))
}

pub fn load(base: &Path, project: &str, media: &str) -> Result<Option<Transcript>, String> {
    match std::fs::read_to_string(path(base, project, media)?) {
        Ok(json) => {
            let record: Transcript = serde_json::from_str(&json).map_err(|error| {
                format!("A transcrição desta mídia está inválida; arquivo preservado: {error}")
            })?;
            if record.version != 1 || record.media_id != media {
                return Err("A transcrição salva não corresponde a esta mídia".into());
            }
            Ok(Some(record))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(super::store::load(base, project)?.filter(|record| record.media_id == media))
        }
        Err(error) => Err(format!(
            "Não foi possível ler a transcrição desta mídia: {error}"
        )),
    }
}

pub fn save(
    base: &Path,
    project: &str,
    media: &str,
    value: &Transcript,
    duration: f64,
) -> Result<(), String> {
    let file = path(base, project, media)?;
    if value.version != 1 || value.media_id != media {
        return Err("A transcrição não corresponde a esta mídia".into());
    }
    parser::validate(&value.segments, duration)?;
    let parent = file.parent().ok_or("Pasta de transcrições inválida")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    crate::file_output::atomic_write(&file, |output| {
        serde_json::to_writer(output, value).map_err(|error| error.to_string())
    })
}

pub fn remove_project(base: &Path, project: &str) -> Result<(), String> {
    let project =
        uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido")?;
    let entries = match std::fs::read_dir(base.join("cutnicepro/transcripts/editor")) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(media) = name
            .strip_prefix(&format!("{project}-"))
            .and_then(|name| name.strip_suffix(".json"))
        else {
            continue;
        };
        if validate_media_id(media).is_ok() {
            std::fs::remove_file(entry.path()).map_err(|error| {
                format!("Não foi possível remover a transcrição desta mídia: {error}")
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcription::{parser, store};

    fn base() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("cnp-editor-transcript-{}", uuid::Uuid::new_v4()))
    }
    fn record(media: &str, text: &str) -> Transcript {
        let mut segments = parser::parse(
            r#"{"transcription":[{"offsets":{"from":0,"to":1000},"text":"Original"}]}"#,
            2.0,
        )
        .unwrap();
        segments[0].text = text.into();
        Transcript {
            version: 1,
            media_id: media.into(),
            language: "pt".into(),
            model: "turbo".into(),
            segments,
        }
    }

    #[test]
    fn independent_media_and_projects_preserve_legacy_transcript() {
        let base = base();
        let project = uuid::Uuid::new_v4().to_string();
        let other = uuid::Uuid::new_v4().to_string();
        let a = "a".repeat(64);
        let b = "b".repeat(64);
        store::save(&base, &project, &record(&a, "Legado"), 2.0).unwrap();
        save(&base, &project, &a, &record(&a, "Editor A"), 2.0).unwrap();
        save(&base, &project, &b, &record(&b, "Editor B"), 2.0).unwrap();
        save(&base, &other, &a, &record(&a, "Outro projeto"), 2.0).unwrap();
        assert_eq!(
            load(&base, &project, &a).unwrap().unwrap().segments[0].text,
            "Editor A"
        );
        assert_eq!(
            load(&base, &project, &b).unwrap().unwrap().segments[0].text,
            "Editor B"
        );
        assert_eq!(
            load(&base, &other, &a).unwrap().unwrap().segments[0].text,
            "Outro projeto"
        );
        assert_eq!(
            store::load(&base, &project).unwrap().unwrap().segments[0].text,
            "Legado"
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn legacy_fallback_matches_media_and_invalid_identifiers_are_rejected() {
        let base = base();
        let project = uuid::Uuid::new_v4().to_string();
        let media = "a".repeat(64);
        store::save(&base, &project, &record(&media, "Legado"), 2.0).unwrap();
        assert_eq!(
            load(&base, &project, &media).unwrap().unwrap().segments[0].text,
            "Legado"
        );
        assert!(load(&base, &project, &"b".repeat(64)).unwrap().is_none());
        assert!(load(&base, "../escape", &media).is_err());
        assert!(save(
            &base,
            &project,
            "../escape",
            &record(&media, "Inválido"),
            2.0
        )
        .is_err());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn invalid_or_cancelled_replacement_never_changes_previous_result() {
        let base = base();
        let project = uuid::Uuid::new_v4().to_string();
        let media = "a".repeat(64);
        let previous = record(&media, "Preservado");
        save(&base, &project, &media, &previous, 2.0).unwrap();
        let mut wrong = record(&"b".repeat(64), "Troca indevida");
        assert!(save(&base, &project, &media, &wrong, 2.0).is_err());
        wrong = record(&media, "Versão inválida");
        wrong.version = 2;
        assert!(save(&base, &project, &media, &wrong, 2.0).is_err());
        assert!(save(&base, &project, &media, &previous, 0.5).is_err());
        let jobs = crate::transcription::TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start(id.clone(), project.clone()).unwrap();
        jobs.cancel(Some(&id));
        assert!(jobs
            .finish(&id, Ok(record(&media, "Cancelado")), |value| save(
                &base, &project, &media, value, 2.0
            ))
            .is_err());
        assert_eq!(
            load(&base, &project, &media).unwrap().unwrap().segments[0].text,
            "Preservado"
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn removal_is_scoped_idempotent_and_keeps_other_projects_and_legacy() {
        let base = base();
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        let media = "a".repeat(64);
        save(&base, &a, &media, &record(&media, "A"), 2.0).unwrap();
        save(&base, &b, &media, &record(&media, "B"), 2.0).unwrap();
        store::save(&base, &a, &record(&media, "Legado"), 2.0).unwrap();
        assert!(remove_project(&base, "../escape").is_err());
        remove_project(&base, &a).unwrap();
        remove_project(&base, &a).unwrap();
        assert_eq!(
            load(&base, &b, &media).unwrap().unwrap().segments[0].text,
            "B"
        );
        assert_eq!(
            store::load(&base, &a).unwrap().unwrap().segments[0].text,
            "Legado"
        );
        assert_eq!(
            load(&base, &a, &media).unwrap().unwrap().segments[0].text,
            "Legado"
        );
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn corrupt_sidecar_is_reported_and_preserved_without_falling_back_to_legacy() {
        let base = base();
        let project = uuid::Uuid::new_v4().to_string();
        let media = "a".repeat(64);
        store::save(&base, &project, &record(&media, "Legado"), 2.0).unwrap();
        save(&base, &project, &media, &record(&media, "Editor"), 2.0).unwrap();
        let file = path(&base, &project, &media).unwrap();
        std::fs::write(&file, "invalid json").unwrap();
        assert!(load(&base, &project, &media).is_err());
        assert_eq!(std::fs::read_to_string(file).unwrap(), "invalid json");
        assert_eq!(
            store::load(&base, &project).unwrap().unwrap().segments[0].text,
            "Legado"
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn imported_reference_identifier_roundtrips_and_cleans_up_by_project() {
        let base = base();
        std::fs::create_dir_all(&base).unwrap();
        let original = base.join("source.mp4");
        std::fs::write(&original, b"fixture de identidade de importacao").unwrap();
        let project = uuid::Uuid::new_v4().to_string();
        let media_store = crate::media_store::MediaStore::open(&base).unwrap();
        let verified = crate::media_import::verify_reference(
            &original,
            &std::sync::atomic::AtomicBool::new(false),
            &|_| {},
            std::time::Duration::from_secs(5),
        )
        .unwrap();
        let imported = media_store
            .publish_reference(&verified, "mp4", "source.mp4", &project, None)
            .unwrap();
        assert!(uuid::Uuid::parse_str(&imported.media_id).is_ok());
        assert!(load(&base, &project, &imported.media_id).unwrap().is_none());
        save(
            &base,
            &project,
            &imported.media_id,
            &record(&imported.media_id, "Identidade real"),
            2.0,
        )
        .unwrap();
        assert_eq!(
            load(&base, &project, &imported.media_id)
                .unwrap()
                .unwrap()
                .segments[0]
                .text,
            "Identidade real"
        );
        assert!(store::load(&base, &project).unwrap().is_none());
        remove_project(&base, &project).unwrap();
        assert!(load(&base, &project, &imported.media_id).unwrap().is_none());
        assert!(original.is_file());
        for invalid in [
            "../escape",
            "nested/file",
            "a\\b",
            "urn:uuid:00000000-0000-0000-0000-000000000000",
        ] {
            assert!(validate_media_id(invalid).is_err());
        }
        drop(verified);
        drop(media_store);
        std::fs::remove_dir_all(base).unwrap();
    }
}
