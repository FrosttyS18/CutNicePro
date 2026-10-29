use std::{
    fs::{self, File, Metadata, OpenOptions},
    path::{Path, PathBuf},
};

pub(super) const DIRECTORY: &str = "editor-export-cache-v1";

pub(super) fn valid_key(key: &str) -> bool {
    key.len() == 64
        && key
            .bytes()
            .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
}

pub(super) fn is_link(metadata: &Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

pub(super) fn directory(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|error| error.to_string())?;
        if !metadata.is_dir() || is_link(&metadata) {
            return Err("O cache exige diretórios locais sem links.".into());
        }
    }
    Ok(())
}

pub(super) fn root(base: &Path) -> Result<PathBuf, String> {
    if !base.is_absolute() {
        return Err("Diretório de cache inválido.".into());
    }
    directory(base)?;
    let path = fs::canonicalize(base)
        .map_err(|error| error.to_string())?
        .join(DIRECTORY);
    match fs::create_dir(&path) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(error.to_string()),
    }
    directory(&path)?;
    fs::canonicalize(path).map_err(|error| error.to_string())
}

pub(super) fn regular(root: &Path, path: &Path) -> Result<Metadata, String> {
    if path.parent() != Some(root) {
        return Err("Arquivo fora do diretório de cache.".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err("Arquivo de cache inválido.".into());
    }
    Ok(metadata)
}

pub(super) fn open(root: &Path, path: &Path, write: bool) -> Result<File, String> {
    regular(root, path)?;
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(if write { 3 } else { 1 });
    }
    let file = options.open(path).map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err("Arquivo de cache inválido.".into());
    }
    Ok(file)
}

pub(super) fn create(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| error.to_string())
}

pub(super) fn remove(root: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    directory(root)?;
    regular(root, path)?;
    fs::remove_file(path).map_err(|error| error.to_string())
}

pub(super) struct Pending {
    pub root: PathBuf,
    pub paths: Vec<PathBuf>,
}

impl Drop for Pending {
    fn drop(&mut self) {
        for path in &self.paths {
            let _ = remove(&self.root, path);
        }
    }
}
