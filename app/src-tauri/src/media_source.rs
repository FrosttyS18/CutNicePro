#[cfg(windows)]
mod windows;

use crate::media_store::MediaEntry;
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileIdentity {
    pub volume: u64,
    pub file: [u8; 16],
}

#[cfg(windows)]
pub fn file_identity(file: &File) -> io::Result<FileIdentity> {
    windows::identity(file)
}

#[cfg(unix)]
pub fn file_identity(file: &File) -> io::Result<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok(FileIdentity {
        volume: metadata.dev(),
        file: (metadata.ino() as u128).to_le_bytes(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceStamp {
    pub size_bytes: u64,
    pub modified_ns: u64,
    pub identity: FileIdentity,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SourceAvailability {
    Available,
    Missing,
    Changed,
    Inaccessible,
}

#[derive(Debug)]
pub enum SourceError {
    Missing,
    Changed,
    Inaccessible,
    Invalid,
}

impl SourceError {
    pub fn availability(&self) -> SourceAvailability {
        match self {
            Self::Missing => SourceAvailability::Missing,
            Self::Changed => SourceAvailability::Changed,
            Self::Inaccessible | Self::Invalid => SourceAvailability::Inaccessible,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Missing => "O arquivo original não foi encontrado. Localize a mídia para continuar.",
            Self::Changed => "O arquivo original foi alterado. Localize uma cópia com o mesmo conteúdo ou importe como nova mídia.",
            Self::Inaccessible => "Não foi possível acessar o arquivo original. Verifique as permissões e se ele está em uso para gravação.",
            Self::Invalid => "A origem precisa ser um arquivo de mídia regular em um caminho válido.",
        }.into()
    }
}

fn source_io(error: io::Error) -> SourceError {
    if error.kind() == io::ErrorKind::NotFound {
        SourceError::Missing
    } else {
        SourceError::Inaccessible
    }
}

pub struct SourceGuard {
    pub(crate) file: File,
    path: PathBuf,
    stamp: SourceStamp,
}

impl SourceGuard {
    pub fn open(path: &Path) -> Result<Self, SourceError> {
        validate_path(path)?;
        let canonical = std::fs::canonicalize(path).map_err(source_io)?;
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1);
        }
        let file = options.open(&canonical).map_err(source_io)?;
        let stamp = stamp(&file)?;
        Ok(Self {
            file,
            path: canonical,
            stamp,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn stamp(&self) -> &SourceStamp {
        &self.stamp
    }

    pub fn recheck(&self) -> Result<(), SourceError> {
        let current = stamp(&self.file)?;
        let reopened = Self::open(&self.path)?;
        if current != self.stamp || reopened.stamp != self.stamp {
            return Err(SourceError::Changed);
        }
        Ok(())
    }
}

fn stamp(file: &File) -> Result<SourceStamp, SourceError> {
    let metadata = file.metadata().map_err(source_io)?;
    if !metadata.is_file() {
        return Err(SourceError::Invalid);
    }
    let modified_ns = metadata
        .modified()
        .map_err(source_io)?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| SourceError::Invalid)?
        .as_nanos();
    Ok(SourceStamp {
        size_bytes: metadata.len(),
        modified_ns: u64::try_from(modified_ns).map_err(|_| SourceError::Invalid)?,
        identity: file_identity(file).map_err(source_io)?,
    })
}

fn validate_path(path: &Path) -> Result<(), SourceError> {
    if !path.is_absolute() {
        return Err(SourceError::Invalid);
    }
    #[cfg(windows)]
    for component in path.components() {
        use std::path::{Component, Prefix};
        match component {
            Component::Prefix(prefix) if matches!(prefix.kind(), Prefix::DeviceNS(_)) => {
                return Err(SourceError::Invalid)
            }
            Component::Normal(value) => {
                let value = value.to_string_lossy();
                let stem = value
                    .split('.')
                    .next()
                    .unwrap_or_default()
                    .trim_end_matches([' ', '.'])
                    .to_ascii_uppercase();
                if value.contains(':')
                    || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                    || (stem.len() == 4
                        && (stem.starts_with("COM") || stem.starts_with("LPT"))
                        && stem.as_bytes()[3].is_ascii_digit())
                {
                    return Err(SourceError::Invalid);
                }
            }
            _ => {}
        }
    }
    Ok(())
}

pub struct ResolvedMedia {
    pub entry: MediaEntry,
    pub path: PathBuf,
    pub(crate) guard: SourceGuard,
}

impl ResolvedMedia {
    pub fn recheck(&self) -> Result<(), String> {
        self.guard.recheck().map_err(|error| error.message())
    }
}
