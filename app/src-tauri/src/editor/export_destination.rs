use super::export_options::ExportOptions;
use crate::media_output_guard::{self, ProtectedOutput};
use serde::Serialize;
use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

const COLLISION: &str =
    "Já existe um arquivo com esse nome. Confirme a substituição ou escolha outro nome.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationStatus {
    pub exists: bool,
    pub file_name: String,
}

#[derive(Clone)]
pub(super) struct Destination {
    base: PathBuf,
    path: PathBuf,
}

impl Destination {
    pub fn selected(base: &Path, path: PathBuf) -> Result<Self, String> {
        if !path.is_absolute() || !path.parent().is_some_and(Path::is_dir) {
            return Err("Escolha uma pasta disponível para exportar.".into());
        }
        let destination = Self {
            base: base.into(),
            path,
        };
        media_output_guard::check(&destination.base, &destination.path)?;
        Ok(destination)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn status(&self) -> Result<DestinationStatus, String> {
        media_output_guard::check(&self.base, &self.path)?;
        Ok(DestinationStatus {
            exists: exists(&self.path)?,
            file_name: self
                .path
                .file_name()
                .ok_or("Nome de arquivo inválido.")?
                .to_string_lossy()
                .into_owned(),
        })
    }

    pub fn recheck(&self, overwrite: bool) -> Result<(), String> {
        media_output_guard::check(&self.base, &self.path)?;
        if exists(&self.path)? && !overwrite {
            return Err(COLLISION.into());
        }
        Ok(())
    }

    pub fn prepare(
        &self,
        overwrite: bool,
        write: impl FnOnce(&mut File) -> Result<(), String>,
    ) -> Result<PreparedDestination, String> {
        self.recheck(overwrite)?;
        Ok(PreparedDestination {
            destination: self.clone(),
            overwrite,
            prepared: media_output_guard::prepare(&self.base, &self.path, write)?,
        })
    }
}

pub(super) struct PreparedDestination {
    destination: Destination,
    overwrite: bool,
    prepared: ProtectedOutput,
}

impl PreparedDestination {
    pub fn commit(&self) -> Result<(), String> {
        self.destination.recheck(self.overwrite)?;
        if self.overwrite {
            self.prepared.commit()
        } else {
            self.prepared.commit_new()
        }
    }
}

fn exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(true),
        Ok(_) => Err("Escolha um nome de arquivo disponível para exportar.".into()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn filename(value: &str, extension: &str) -> Result<String, String> {
    if value.chars().count() > 120 {
        return Err("Informe um nome com até 120 caracteres.".into());
    }
    if value
        .chars()
        .any(|character| character.is_control() || r#"<>:"/\|?*"#.contains(character))
    {
        return Err(
            "Informe um nome de arquivo válido, sem barras ou caracteres reservados.".into(),
        );
    }
    let name = value.trim();
    if name.is_empty() || name.ends_with('.') {
        return Err("Informe um nome de arquivo válido.".into());
    }
    let stem = match name.rsplit_once('.') {
        Some((stem, ext)) if ext.eq_ignore_ascii_case("mp4") || ext.eq_ignore_ascii_case("mov") => {
            stem
        }
        _ => name,
    };
    let device = stem
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    let reserved = matches!(
        device.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        device.strip_prefix(*prefix).is_some_and(|number| {
            matches!(
                number,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    if stem.is_empty() || stem.ends_with([' ', '.']) || reserved {
        return Err("Escolha outro nome para o arquivo.".into());
    }
    Ok(format!("{stem}.{extension}"))
}

pub(super) fn resolve(
    base: &Path,
    directory: &str,
    file_name: &str,
    options: ExportOptions,
) -> Result<Destination, String> {
    options.validate()?;
    let directory = Path::new(directory);
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("Escolha uma pasta disponível para exportar.".into());
    }
    let name = filename(file_name, options.extension())?;
    let directory = directory
        .canonicalize()
        .map_err(|error| error.to_string())?;
    Destination::selected(base, directory.join(name))
}

#[tauri::command]
pub async fn get_editor_export_destination(
    app: AppHandle,
    directory: String,
    file_name: String,
    options: ExportOptions,
) -> Result<DestinationStatus, String> {
    let base = crate::app_data_base(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        resolve(&base, &directory, &file_name, options)?.status()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "export_destination_tests.rs"]
mod tests;
