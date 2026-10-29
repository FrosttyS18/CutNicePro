mod command;
mod plan;
mod source;

use crate::editor::{render_plan, types::Composition};
use crate::{render::encoder::Encoder, transcription::process::ProcessControl};
use plan::Plan;
use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
};

pub(super) struct Session {
    enabled: bool,
    sources: HashMap<(PathBuf, u32, u32), bool>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            enabled: true,
            sources: HashMap::new(),
        }
    }
}

impl Session {
    pub(super) fn arguments_with_options(
        &mut self,
        document: &Composition,
        window: &render_plan::Window,
        sources: &HashMap<String, PathBuf>,
        directory: &Path,
        index: usize,
        ffprobe: &Path,
        encoder: Encoder,
        control: &ProcessControl,
        options: crate::editor::export_options::ExportOptions,
    ) -> Result<Option<Vec<OsString>>, String> {
        if !self.enabled
            || encoder != Encoder::Nvenc
            || !matches!(
                options.codec,
                crate::editor::export_options::Codec::H264
                    | crate::editor::export_options::Codec::Hevc
                    | crate::editor::export_options::Codec::Av1
            )
        {
            return Ok(None);
        }
        let Some(plan) = Plan::for_window(document, window)? else {
            return Ok(None);
        };
        let path = sources
            .get(&plan.asset.id)
            .ok_or("Arquivo da camada ausente")?;
        let key = (path.clone(), plan.asset.width, plan.asset.height);
        let supported = match self.sources.get(&key) {
            Some(supported) => *supported,
            None => {
                let supported = match source::probe(
                    ffprobe,
                    path,
                    directory,
                    index,
                    plan.asset.width,
                    plan.asset.height,
                    control,
                ) {
                    Ok(supported) => supported,
                    Err(_) => {
                        control.check()?;
                        false
                    }
                };
                self.sources.insert(key, supported);
                supported
            }
        };
        if !supported {
            return Ok(None);
        }
        command::arguments_with_options(&plan, path, directory, index, options).map(Some)
    }

    pub(super) fn render(
        &mut self,
        candidate: Option<Vec<OsString>>,
        control: &ProcessControl,
        failure_log: &Path,
        fallback: impl FnOnce() -> Result<Vec<OsString>, String>,
        mut run: impl FnMut(Vec<OsString>, bool) -> Result<(), String>,
    ) -> Result<(), String> {
        control.check()?;
        if let Some(arguments) = candidate {
            match run(arguments, true) {
                Ok(()) => return control.check(),
                Err(error) => {
                    control.check()?;
                    self.enabled = false;
                    std::fs::write(failure_log, error).map_err(|error| error.to_string())?;
                    eprintln!("[editor] Composição CUDA indisponível nesta tarefa; usando os filtros compatíveis, preservando o codificador selecionado.");
                }
            }
        }
        control.check()?;
        run(fallback()?, false)?;
        control.check()
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod integration;

#[cfg(test)]
mod profile_tests;

#[cfg(test)]
mod fps_tests;
