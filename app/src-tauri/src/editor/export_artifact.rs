use super::{
    export_cache::{self, Cache, CachedFile},
    export_options::ExportOptions,
    export_toolchain, render,
    types::Composition,
};
use crate::{
    media_source::SourceStamp, render::scratch::Scratch, transcription::process::ProcessControl,
};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub(super) struct Artifact {
    _scratch: Option<Scratch>,
    cached: Option<CachedFile>,
    rendered: Option<(File, PathBuf)>,
    cache: Option<Cache>,
    key: Option<String>,
}

impl Artifact {
    pub fn reused(&self) -> bool {
        self.cached.is_some()
    }

    pub fn copy(&mut self, output: &mut File, control: &ProcessControl) -> Result<u64, String> {
        let expected_cache = self
            .cached
            .as_ref()
            .map(|cached| (cached.bytes, cached.sha256.clone()));
        let source = match (&mut self.cached, &mut self.rendered) {
            (Some(cached), _) => &mut cached.file,
            (_, Some((file, _))) => file,
            _ => return Err("O vídeo concluído não está disponível.".into()),
        };
        let expected = source.metadata().map_err(|error| error.to_string())?.len();
        let mut bytes = 0_u64;
        let mut digest = Sha256::new();
        let mut buffer = vec![0_u8; 1024 * 1024];
        loop {
            control.check()?;
            let count = source
                .read(&mut buffer)
                .map_err(|error| error.to_string())?;
            if count == 0 {
                break;
            }
            if expected_cache.is_some() {
                digest.update(&buffer[..count]);
            }
            output
                .write_all(&buffer[..count])
                .map_err(|error| error.to_string())?;
            bytes += count as u64;
        }
        control.check()?;
        if expected_cache
            .is_some_and(|(size, hash)| size != bytes || hash != format!("{:x}", digest.finalize()))
        {
            return Err("O vídeo reaproveitado mudou. Exporte novamente.".into());
        }
        if bytes != expected {
            return Err("A cópia do vídeo não foi concluída. Exporte novamente.".into());
        }
        Ok(bytes)
    }

    pub fn remember(&self, control: &ProcessControl) {
        if let (Some(cache), Some(key), Some((_, path))) = (&self.cache, &self.key, &self.rendered)
        {
            if cache.store(key, path, control).is_err() {
                eprintln!(
                    "[editor] Vídeo exportado; reaproveitamento local indisponível nesta execução."
                );
            }
        }
    }
}

fn cacheable_fonts(document: &Composition) -> bool {
    std::iter::once(&document.settings)
        .chain(document.items.iter().map(|item| &item.settings))
        .all(|value| {
            super::render_media::settings(document, None, value).is_ok_and(|settings| {
                settings
                    .caption_style
                    .as_ref()
                    .is_none_or(|style| style.font == "Poppins")
            })
        })
}

pub(super) fn produce(
    base: &Path,
    document: &Composition,
    sources: &HashMap<String, PathBuf>,
    stamps: &BTreeMap<String, SourceStamp>,
    options: ExportOptions,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<Artifact, String> {
    let identity = if cacheable_fonts(document) {
        export_toolchain::identity(control).ok()
    } else {
        None
    };
    control.check()?;
    let key =
        identity.and_then(|identity| export_cache::key(document, stamps, &identity, &options).ok());
    let cache = key.as_ref().and_then(|_| Cache::open(base).ok());
    if let (Some(cache), Some(key)) = (&cache, &key) {
        if let Ok(Some(cached)) = cache.lookup(key, control) {
            control.check()?;
            eprintln!("[editor] Reaproveitando exportação final validada.");
            return Ok(Artifact {
                _scratch: None,
                cached: Some(cached),
                rendered: None,
                cache: None,
                key: None,
            });
        }
    }
    control.check()?;
    let (scratch, path) =
        render::run_with_options(base, document, sources, control, options, &mut progress)?;
    let file = File::open(&path).map_err(|error| error.to_string())?;
    Ok(Artifact {
        _scratch: Some(scratch),
        cached: None,
        rendered: Some((file, path)),
        cache,
        key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn system_font_presets_cannot_bypass_cache_font_identity() {
        let settings = json!({"ratio":"16:9","fit":"cover","captionModel":1,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
        let mut document: Composition = serde_json::from_value(json!({"version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":settings,"assets":[],"tracks":[],"items":[]})).unwrap();
        assert!(cacheable_fonts(&document));
        for preset in [4, 6, 9] {
            document.settings["captionModel"] = json!(preset);
            assert!(!cacheable_fonts(&document));
        }
    }
}
