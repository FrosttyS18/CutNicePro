use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

pub struct PreparedOutput {
    temporary: PathBuf,
    destination: PathBuf,
}
impl PreparedOutput {
    pub fn commit(&self) -> Result<(), String> {
        std::fs::rename(&self.temporary, &self.destination).map_err(|e| e.to_string())
    }
}
impl Drop for PreparedOutput {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.temporary);
    }
}

pub fn atomic_write(
    destination: &Path,
    write: impl FnOnce(&mut std::fs::File) -> Result<(), String>,
) -> Result<(), String> {
    prepare(destination, write)?.commit()
}

pub fn prepare(
    destination: &Path,
    write: impl FnOnce(&mut std::fs::File) -> Result<(), String>,
) -> Result<PreparedOutput, String> {
    let parent = destination
        .parent()
        .filter(|p| p.is_dir())
        .ok_or("pasta de destino indisponível")?;
    let temporary = parent.join(format!(".cutnicepro-{}.part", uuid::Uuid::new_v4()));
    let prepared = PreparedOutput {
        temporary,
        destination: destination.to_owned(),
    };
    (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&prepared.temporary)
            .map_err(|e| e.to_string())?;
        write(&mut file)?;
        file.flush()
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        Ok(())
    })()?;
    Ok(prepared)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_write_preserves_destination_and_removes_only_temporary() {
        let dir = std::env::temp_dir().join(format!("cnp-output-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("keep.txt");
        std::fs::write(&target, b"original").unwrap();
        assert!(atomic_write(&target, |file| {
            file.write_all(b"incomplete").unwrap();
            Err("disk full".into())
        })
        .is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        atomic_write(&target, |file| {
            file.write_all("ação".as_bytes()).map_err(|e| e.to_string())
        })
        .unwrap();
        assert_eq!(std::fs::read_to_string(target).unwrap(), "ação");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
