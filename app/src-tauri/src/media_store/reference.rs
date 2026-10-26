use super::*;
use crate::{
    media_import::VerifiedReference,
    media_source::{ResolvedMedia, SourceAvailability, SourceError, SourceGuard},
};

pub(super) fn valid_filename(hash: &str, ext: &str) -> bool {
    if ["mp4", "m4v", "mov", "webm", "mkv", "avi"].contains(&ext) {
        return crate::media_tools::managed_filename(hash, ext).is_ok();
    }
    hash.len() == 64
        && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        && [
            "png", "jpg", "jpeg", "webp", "wav", "mp3", "m4a", "aac", "ogg", "opus", "flac",
        ]
        .contains(&ext)
}

pub(super) fn validate_entry(entry: &MediaEntry) -> Result<(), String> {
    if !valid_filename(&entry.sha256, &entry.ext) || entry.media_id.is_empty() {
        return Err("índice de mídia corrompido: identificador ou formato inválido".into());
    }
    if let MediaStorage::Reference { path, stamp } = &entry.storage {
        if !path.is_absolute() || stamp.size_bytes != entry.size_bytes {
            return Err("índice de mídia corrompido: referência inválida".into());
        }
    }
    Ok(())
}

impl MediaStore {
    pub fn validate_reference_path(&self, source: &Path) -> Result<(), String> {
        let source = fs::canonicalize(source).map_err(|_| "Arquivo original indisponível.")?;
        let generated = self
            .root
            .parent()
            .ok_or("Armazenamento de mídia inválido.")?
            .canonicalize()
            .map_err(|error| error.to_string())?;
        #[cfg(windows)]
        let (source, generated) = (
            PathBuf::from(source.to_string_lossy().to_lowercase()),
            PathBuf::from(generated.to_string_lossy().to_lowercase()),
        );
        if source.starts_with(generated) {
            return Err("Selecione o arquivo original fora do armazenamento do aplicativo.".into());
        }
        Ok(())
    }

    pub fn entries(&self) -> Result<Vec<MediaEntry>, String> {
        Ok(self.load_index()?.entries)
    }

    pub fn registered_path(&self, entry: &MediaEntry) -> Result<PathBuf, String> {
        validate_entry(entry)?;
        Ok(match &entry.storage {
            MediaStorage::Managed => self
                .files_dir()
                .join(format!("{}.{}", entry.sha256, entry.ext)),
            MediaStorage::Reference { path, .. } => path.clone(),
        })
    }

    pub(super) fn resolve_entry(&self, entry: MediaEntry) -> Result<ResolvedMedia, SourceError> {
        let path = self
            .registered_path(&entry)
            .map_err(|_| SourceError::Invalid)?;
        let guard = SourceGuard::open(&path)?;
        if let MediaStorage::Reference { stamp, .. } = &entry.storage {
            if guard.stamp() != stamp {
                return Err(SourceError::Changed);
            }
        }
        if guard.stamp().size_bytes != entry.size_bytes {
            return Err(SourceError::Changed);
        }
        let path = guard.path().to_path_buf();
        Ok(ResolvedMedia { entry, path, guard })
    }

    pub fn resolve(
        &self,
        media_id: &str,
        project_id: Option<&str>,
    ) -> Result<ResolvedMedia, String> {
        let entry = self.get(media_id)?.ok_or("Mídia não encontrada.")?;
        if project_id.is_some_and(|project| !entry.project_ids.iter().any(|id| id == project)) {
            return Err("Mídia não vinculada a este projeto.".into());
        }
        self.resolve_entry(entry).map_err(|error| error.message())
    }

    pub fn dto(&self, entry: &MediaEntry) -> Result<MediaEntryDto, String> {
        let availability = match self.resolve_entry(entry.clone()) {
            Ok(_) => SourceAvailability::Available,
            Err(error) => error.availability(),
        };
        Ok(MediaEntryDto::new(entry, availability))
    }

    pub fn publish_reference(
        &self,
        verified: &VerifiedReference,
        ext: &str,
        original_name: &str,
        project_id: &str,
        analysis: Option<MediaAnalysis>,
    ) -> Result<MediaEntry, String> {
        verified.recheck()?;
        self.validate_reference_path(verified.path())?;
        if !valid_filename(&verified.sha256, ext) {
            return Err("Formato de mídia inválido.".into());
        }
        self.with_index(|index| {
            verified.recheck()?;
            if let Some(entry) = index.entries.iter_mut().find(|entry| {
                entry.sha256 == verified.sha256
                    && entry.ext == ext
                    && matches!(entry.storage, MediaStorage::Reference { .. })
            }) {
                if !entry.project_ids.iter().any(|id| id == project_id) {
                    entry.project_ids.push(project_id.into());
                }
                if self.resolve_entry(entry.clone()).is_err()
                    && matches!(entry.storage, MediaStorage::Reference { .. })
                {
                    entry.storage = MediaStorage::Reference {
                        path: verified.path().to_path_buf(),
                        stamp: verified.stamp().clone(),
                    };
                }
                entry.unavailable = false;
                if analysis.is_some() {
                    entry.analysis = analysis;
                }
                return Ok(entry.clone());
            }
            let entry = MediaEntry {
                media_id: uuid::Uuid::new_v4().to_string(),
                sha256: verified.sha256.clone(),
                size_bytes: verified.stamp().size_bytes,
                ext: ext.into(),
                original_name: original_name.into(),
                created_at_ms: now_ms(),
                project_ids: vec![project_id.into()],
                analysis,
                unavailable: false,
                storage: MediaStorage::Reference {
                    path: verified.path().to_path_buf(),
                    stamp: verified.stamp().clone(),
                },
            };
            index.entries.push(entry.clone());
            Ok(entry)
        })
    }

    pub fn relink_reference(
        &self,
        media_id: &str,
        project_id: &str,
        verified: &VerifiedReference,
        ext: &str,
    ) -> Result<MediaEntry, String> {
        verified.recheck()?;
        self.validate_reference_path(verified.path())?;
        self.with_index(|index| {
            let entry = index.entries.iter_mut().find(|entry| entry.media_id == media_id && entry.project_ids.iter().any(|id| id == project_id))
                .ok_or("Mídia não vinculada a este projeto.")?;
            if matches!(entry.storage, MediaStorage::Managed)
                && !matches!(self.resolve_entry(entry.clone()), Err(SourceError::Missing)) {
                return Err("A cópia gerenciada ainda está presente ou inacessível. Localizar outro arquivo só é permitido quando ela estiver ausente.".into());
            }
            if entry.sha256 != verified.sha256 || entry.ext != ext || entry.size_bytes != verified.stamp().size_bytes {
                return Err("O arquivo escolhido tem conteúdo diferente do original. Importe-o como nova mídia.".into());
            }
            verified.recheck()?;
            entry.storage = MediaStorage::Reference { path: verified.path().to_path_buf(), stamp: verified.stamp().clone() };
            entry.unavailable = false;
            Ok(entry.clone())
        })
    }
}
