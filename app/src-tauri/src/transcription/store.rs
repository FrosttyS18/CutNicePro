use super::{parser, types::Transcript};
use std::path::{Path, PathBuf};

fn path(base: &Path, project_id: &str) -> Result<PathBuf, String> {
    let id = uuid::Uuid::parse_str(project_id).map_err(|_| "identificador de projeto inválido")?;
    Ok(base
        .join("cutnicepro/transcripts")
        .join(format!("{id}.json")))
}

pub fn load(base: &Path, project_id: &str) -> Result<Option<Transcript>, String> {
    let file = path(base, project_id)?;
    match std::fs::read_to_string(file) {
        Ok(json) => {
            let value: Transcript = serde_json::from_str(&json)
                .map_err(|e| format!("transcrição salva está inválida; arquivo preservado: {e}"))?;
            if value.version != 1 {
                return Err("versão de transcrição não suportada".into());
            }
            Ok(Some(value))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("não foi possível ler a transcrição: {e}")),
    }
}

pub fn save(
    base: &Path,
    project_id: &str,
    value: &Transcript,
    duration: f64,
) -> Result<(), String> {
    parser::validate(&value.segments, duration)?;
    let file = path(base, project_id)?;
    let parent = file.parent().ok_or("pasta de transcrições inválida")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = file.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        use std::io::Write;
        let json = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        let mut output = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        output
            .write_all(&json)
            .and_then(|_| output.sync_all())
            .map_err(|e| e.to_string())?;
        drop(output);
        std::fs::rename(&temp, &file)
            .map_err(|e| format!("não foi possível salvar a transcrição: {e}"))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_reopens_and_rejects_invalid_replacement() {
        let base = std::env::temp_dir().join(format!("cnp-transcript-{}", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        let value = Transcript {
            version: 1,
            media_id: "media".into(),
            language: "pt".into(),
            model: "base".into(),
            segments: vec![],
        };
        save(&base, &id, &value, 5.0).unwrap();
        save(&base, &id, &value, 5.0).unwrap();
        assert_eq!(load(&base, &id).unwrap().unwrap().media_id, "media");
        assert!(save(&base, &id, &value, -1.0).is_err());
        assert!(load(&base, "../escape").is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
}
