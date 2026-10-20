use super::types::ClipCollection;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

fn path(base: &Path, project: &str) -> Result<PathBuf, String> {
    let id = uuid::Uuid::parse_str(project).map_err(|_| "projeto inválido")?;
    Ok(base.join("cutnicepro/clips").join(format!("{id}.json")))
}
pub fn fingerprint(segments: &[crate::transcription::types::Segment]) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(segments).map_err(|e| e.to_string())?)
    ))
}
pub fn validate(value: &ClipCollection, duration: f64) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    if value.version != 1
        || value.clips.len() > 12
        || !duration.is_finite()
        || duration <= 0.0
        || value.clips.iter().any(|c| {
            c.id.len() != 64
                || !c.id.chars().all(|c| c.is_ascii_hexdigit())
                || !ids.insert(&c.id)
                || !c.start.is_finite()
                || !c.end.is_finite()
                || c.start < 0.0
                || c.end <= c.start
                || c.end > duration
                || c.score > 100
                || c.title.is_empty()
                || c.title.len() > 1000
                || c.reasons.len() > 8
                || c.analysis_error
                    .as_ref()
                    .is_some_and(|message| message.is_empty() || message.len() > 500)
                || c.format
                    .as_ref()
                    .is_some_and(|v| !["16:9", "9:16", "1:1", "4:5"].contains(&v.as_str()))
                || c.analysis.as_ref().is_some_and(|a| {
                    a.validate_shape().is_err() || a.title != c.title || a.score() != c.score
                })
        })
    {
        return Err("Os cortes salvos não puderam ser lidos. Gere os cortes novamente.".into());
    }
    Ok(())
}
pub fn load(
    base: &Path,
    project: &str,
    media: &str,
    duration: f64,
) -> Result<Option<ClipCollection>, String> {
    let value = read(base, project)?;
    if let Some(ref collection) = value {
        validate(collection, duration)?;
    }
    Ok(value.filter(|collection| collection.media_id == media))
}

pub fn read(base: &Path, project: &str) -> Result<Option<ClipCollection>, String> {
    match std::fs::read(path(base, project)?) {
        Ok(bytes) => {
            let value: ClipCollection = serde_json::from_slice(&bytes)
                .map_err(|_| "Não foi possível ler seus cortes. Gere os cortes novamente.")?;
            Ok(Some(value))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("falha ao ler cortes: {e}")),
    }
}
pub fn save(
    base: &Path,
    project: &str,
    value: &ClipCollection,
    duration: f64,
) -> Result<(), String> {
    validate(value, duration)?;
    let target = path(base, project)?;
    std::fs::create_dir_all(target.parent().ok_or("pasta inválida")?).map_err(|e| e.to_string())?;
    crate::file_output::atomic_write(&target, |file| {
        use std::io::Write;
        file.write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    })
}
pub fn remove(base: &Path, project: &str) -> Result<(), String> {
    match std::fs::remove_file(path(base, project)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_lookup_is_independent_of_active_media_and_keeps_projects_separate() {
        let base = std::env::temp_dir().join(format!("cnp-clips-library-{}", uuid::Uuid::new_v4()));
        let first = uuid::Uuid::new_v4().to_string();
        let second = uuid::Uuid::new_v4().to_string();
        for (project, media) in [(&first, "first-media"), (&second, "second-media")] {
            save(
                &base,
                project,
                &ClipCollection {
                    version: 1,
                    media_id: media.into(),
                    transcript_hash: "hash".into(),
                    clips: vec![],
                },
                30.0,
            )
            .unwrap();
        }
        assert_eq!(
            read(&base, &first).unwrap().unwrap().media_id,
            "first-media"
        );
        assert_eq!(
            read(&base, &second).unwrap().unwrap().media_id,
            "second-media"
        );
        assert!(read(&base, &uuid::Uuid::new_v4().to_string())
            .unwrap()
            .is_none());
        assert!(read(&base, "../escape").is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn persists_review_and_rejects_corruption_without_wiping() {
        let base = std::env::temp_dir().join(format!("cnp-clips-{}", uuid::Uuid::new_v4()));
        let project = uuid::Uuid::new_v4().to_string();
        let value = ClipCollection {
            version: 1,
            media_id: "m".into(),
            transcript_hash: "hash".into(),
            clips: vec![super::super::types::Clip {
                id: "a".repeat(64),
                start: 1.0,
                end: 8.0,
                title: "Trecho aprovado".into(),
                score: 70,
                reasons: vec!["Final com frase concluída".into()],
                review: super::super::types::Review::Approved,
                format: Some("9:16".into()),
                analysis: None,
                analysis_error: None,
            }],
        };
        save(&base, &project, &value, 10.0).unwrap();
        assert!(load(&base, &project, "other", 10.0).unwrap().is_none());
        assert_eq!(
            load(&base, &project, "m", 10.0).unwrap().unwrap().version,
            1
        );
        assert_eq!(
            load(&base, &project, "m", 10.0).unwrap().unwrap().clips[0].review,
            super::super::types::Review::Approved
        );
        assert_eq!(
            load(&base, &project, "m", 10.0).unwrap().unwrap().clips[0]
                .format
                .as_deref(),
            Some("9:16")
        );
        let target = path(&base, &project).unwrap();
        std::fs::write(&target, b"invalid").unwrap();
        assert!(load(&base, &project, "m", 10.0).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"invalid");
        assert!(load(&base, "../escape", "m", 10.0).is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
}
