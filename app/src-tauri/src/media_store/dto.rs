use super::{MediaAnalysis, MediaEntry, MediaStorage};
use crate::media_source::SourceAvailability;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageKind {
    Managed,
    Reference,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntryDto {
    pub media_id: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub ext: String,
    pub original_name: String,
    pub created_at_ms: u64,
    pub project_ids: Vec<String>,
    pub analysis: Option<MediaAnalysis>,
    pub unavailable: bool,
    pub storage_kind: StorageKind,
    pub availability: SourceAvailability,
}

impl MediaEntryDto {
    pub(super) fn new(entry: &MediaEntry, availability: SourceAvailability) -> Self {
        Self {
            media_id: entry.media_id.clone(),
            sha256: entry.sha256.clone(),
            size_bytes: entry.size_bytes,
            ext: entry.ext.clone(),
            original_name: entry.original_name.clone(),
            created_at_ms: entry.created_at_ms,
            project_ids: entry.project_ids.clone(),
            analysis: entry.analysis.clone(),
            unavailable: availability != SourceAvailability::Available,
            storage_kind: match entry.storage {
                MediaStorage::Managed => StorageKind::Managed,
                MediaStorage::Reference { .. } => StorageKind::Reference,
            },
            availability,
        }
    }
}
