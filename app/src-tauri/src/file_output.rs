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

    pub fn commit_new(&self) -> Result<(), String> {
        publish_new(&self.temporary, &self.destination).map_err(|error| error.to_string())
    }
}

#[cfg(windows)]
fn publish_new(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    let existing: Vec<_> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<_> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    if existing[..existing.len() - 1].contains(&0) || target[..target.len() - 1].contains(&0) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Destino inválido.",
        ));
    }
    let moved = unsafe { MoveFileExW(existing.as_ptr(), target.as_ptr(), 0) };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn publish_new(temporary: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::hard_link(temporary, destination)?;
    let _ = std::fs::remove_file(temporary);
    Ok(())
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
    fn commit_new_refuses_a_destination_created_after_prepare() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.tooling/test-output")
            .join(format!("publish-new-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("export.mp4");
        let pending = prepare(&target, |file| {
            file.write_all(b"new output")
                .map_err(|error| error.to_string())
        })
        .unwrap();
        std::fs::write(&target, b"arrived later").unwrap();
        assert!(pending.commit_new().is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"arrived later");
        drop(pending);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_file(&target).unwrap();
        let pending = prepare(&target, |file| {
            file.write_all(b"published")
                .map_err(|error| error.to_string())
        })
        .unwrap();
        pending.commit_new().unwrap();
        drop(pending);
        assert_eq!(std::fs::read(&target).unwrap(), b"published");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
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
