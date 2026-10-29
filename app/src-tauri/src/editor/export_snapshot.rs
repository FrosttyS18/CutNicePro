use super::{store::Snapshot, types::Composition};
use crate::{media_source::ResolvedMedia, media_store::MediaStore};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::PathBuf,
};

pub fn freeze(saved: Option<&Snapshot>, proposed: &Composition) -> Result<Composition, String> {
    proposed.validate()?;
    let document = if let Some(saved) = saved {
        if saved.document.revision != proposed.revision
            || serde_json::to_value(&saved.document).map_err(|error| error.to_string())?
                != serde_json::to_value(proposed).map_err(|error| error.to_string())?
        {
            return Err(
                "A exportação precisa usar a versão salva. Salve as alterações ou reabra a edição."
                    .into(),
            );
        }
        saved.document.clone()
    } else if proposed.revision == 0 {
        proposed.clone()
    } else {
        return Err("A versão salva não foi encontrada. Reabra a edição antes de exportar.".into());
    };
    if document.duration_frames() == 0 {
        return Err("Adicione um trecho à montagem antes de exportar.".into());
    }
    Ok(document)
}

pub struct ExportSources {
    pub paths: HashMap<String, PathBuf>,
    resolved: Vec<ResolvedMedia>,
    pub stamps: BTreeMap<String, crate::media_source::SourceStamp>,
}

impl ExportSources {
    pub fn recheck(&self) -> Result<(), String> {
        for source in &self.resolved {
            source.recheck()?;
        }
        Ok(())
    }
}

pub fn sources(
    media: &MediaStore,
    project_id: &str,
    document: &mut Composition,
) -> Result<ExportSources, String> {
    let used: HashSet<_> = document
        .items
        .iter()
        .map(|item| item.asset_id.clone())
        .collect();
    let mut paths = HashMap::new();
    let mut resolved = Vec::new();
    let mut stamps = BTreeMap::new();
    for asset in document
        .assets
        .iter_mut()
        .filter(|asset| used.contains(&asset.id))
    {
        let source = media.resolve(&asset.media_id, Some(project_id))?;
        let analysis = source
            .entry
            .analysis
            .as_ref()
            .ok_or_else(|| format!("A mídia {} ainda não foi analisada.", asset.name))?;
        asset.width = analysis.width;
        asset.height = analysis.height;
        asset.duration_us = analysis.duration_ms.saturating_mul(1000);
        asset.has_audio = Some(analysis.has_audio);
        paths.insert(asset.id.clone(), source.path.clone());
        stamps.insert(asset.id.clone(), source.guard.stamp().clone());
        resolved.push(source);
    }
    document.validate()?;
    Ok(ExportSources {
        paths,
        resolved,
        stamps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot() -> Snapshot {
        let settings = json!({"ratio":"16:9","fit":"cover","captionModel":0,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
        serde_json::from_value(json!({"document":{"version":1,"revision":2,"fps":{"numerator":30,"denominator":1},"settings":settings,
          "assets":[{"id":"source","mediaId":"source","name":"video.mp4","kind":"video","durationUs":2000000,"width":160,"height":90,"transcript":[]}],
          "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}],
          "items":[{"id":"one","trackId":"V1","assetId":"source","kind":"video","startFrame":0,"durationFrames":30,"sourceStartUs":0,"sourceEndUs":1000000,"groupId":"one","followsMain":true,"settings":settings,"captionEdits":{}}]},"manuallyEdited":true,"editedAtMs":1})).unwrap()
    }

    #[test]
    fn frozen_export_rejects_dirty_stale_and_missing_saved_versions() {
        let saved = snapshot();
        let mut dirty = saved.document.clone();
        dirty.items[0].source_start_us = 500000;
        dirty.items[0].source_end_us = 1500000;
        assert!(freeze(Some(&saved), &dirty).is_err());
        let mut stale = saved.document.clone();
        stale.revision = 1;
        assert!(freeze(Some(&saved), &stale).is_err());
        assert!(freeze(None, &saved.document).is_err());
        let frozen = freeze(Some(&saved), &saved.document).unwrap();
        dirty.items.clear();
        assert_eq!(frozen.items.len(), 1);
        assert_eq!(frozen.revision, 2);
    }

    #[test]
    fn initial_adapter_can_export_without_marking_manual_but_empty_cannot() {
        let mut initial = snapshot().document;
        initial.revision = 0;
        assert_eq!(freeze(None, &initial).unwrap().revision, 0);
        initial.items.clear();
        assert!(freeze(None, &initial).is_err());
    }
}
