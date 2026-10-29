mod files;
mod key;
mod manifest;
mod prune;

pub use key::key;

use crate::{media_source::SourceGuard, transcription::process::ProcessControl};
use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

const TRANSACTION_RESERVE: u64 = 4096;

struct Policy {
    max_bytes: u64,
    max_age_ms: u64,
    reserve_bytes: u64,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            max_bytes: 2 * 1024 * 1024 * 1024,
            max_age_ms: 7 * 24 * 60 * 60 * 1000,
            reserve_bytes: 1024 * 1024 * 1024,
        }
    }
}

pub struct Cache {
    root: PathBuf,
    policy: Policy,
}

pub struct CachedFile {
    pub(super) file: File,
    pub(super) bytes: u64,
    pub(super) sha256: String,
    _lock: File,
}

impl Cache {
    pub fn open(base: &Path) -> Result<Self, String> {
        Ok(Self {
            root: files::root(base)?,
            policy: Policy::default(),
        })
    }

    fn lock(&self) -> Result<Option<File>, String> {
        files::directory(&self.root)?;
        if fs::canonicalize(&self.root).map_err(|error| error.to_string())? != self.root {
            return Err("O diretório do cache foi alterado.".into());
        }
        let path = self.root.join("cache.lock");
        match OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => drop(file),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error.to_string()),
        }
        let file = files::open(&self.root, &path, true)?;
        match file.try_lock_exclusive() {
            Ok(()) => Ok(Some(file)),
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.raw_os_error() == fs2::lock_contended_error().raw_os_error() =>
            {
                Ok(None)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn lookup(
        &self,
        key: &str,
        control: &ProcessControl,
    ) -> Result<Option<CachedFile>, String> {
        control.check()?;
        self.check_key(key)?;
        let Some(mut lock) = self.lock()? else {
            return Ok(None);
        };
        let now = manifest::now_ms()?;
        let Ok(mut entry) = manifest::read(&self.root, key) else {
            return Ok(None);
        };
        if !entry.valid(key, &self.policy, now) {
            return Ok(None);
        }
        let Ok(mut file) = files::open(&self.root, &self.root.join(format!("{key}.mp4")), false)
        else {
            return Ok(None);
        };
        if file.metadata().map_err(|error| error.to_string())?.len() != entry.bytes {
            return Ok(None);
        }
        let (bytes, hash) = transfer(&mut file, None, control)?;
        if bytes != entry.bytes || hash != entry.sha256 {
            return Ok(None);
        }
        file.seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        control.check()?;
        entry.accessed_ms = next_access(&mut lock, now)?;
        let _ = manifest::write(&self.root, &entry);
        Ok(Some(CachedFile {
            file,
            bytes,
            sha256: hash,
            _lock: lock,
        }))
    }

    pub fn store(&self, key: &str, source: &Path, control: &ProcessControl) -> Result<(), String> {
        control.check()?;
        self.check_key(key)?;
        let Some(mut lock) = self.lock()? else {
            return Ok(());
        };
        let mut source = SourceGuard::open(source).map_err(|error| error.message())?;
        let size = source.stamp().size_bytes;
        if size == 0 || size > self.policy.max_bytes {
            return Ok(());
        }
        let now = manifest::now_ms()?;
        let mut entry = manifest::Manifest {
            version: 1,
            key: key.into(),
            completed: true,
            bytes: size,
            sha256: "0".repeat(64),
            created_ms: now,
            accessed_ms: next_access(&mut lock, now)?,
        };
        let incoming = size.saturating_add(
            serde_json::to_vec(&entry)
                .map_err(|error| error.to_string())?
                .len() as u64,
        );
        if incoming > self.policy.max_bytes.saturating_sub(TRANSACTION_RESERVE) {
            return Ok(());
        }
        self.prune(incoming, control)?;
        if fs2::available_space(&self.root).map_err(|error| error.to_string())?
            < self
                .policy
                .reserve_bytes
                .saturating_add(size)
                .saturating_add(4096)
        {
            return Ok(());
        }
        let data_temp = self
            .root
            .join(format!("{key}_{}.mp4.tmp", uuid::Uuid::new_v4()));
        let manifest_temp = self
            .root
            .join(format!("{key}_{}.json.tmp", uuid::Uuid::new_v4()));
        let _pending = files::Pending {
            root: self.root.clone(),
            paths: vec![data_temp.clone(), manifest_temp.clone()],
        };
        let mut output = files::create(&data_temp)?;
        let (bytes, sha256) = transfer(&mut source.file, Some(&mut output), control)?;
        output.sync_all().map_err(|error| error.to_string())?;
        drop(output);
        source.recheck().map_err(|error| error.message())?;
        if bytes != size {
            return Err("O arquivo exportado mudou durante o armazenamento.".into());
        }
        entry.sha256 = sha256;
        let mut manifest_file = files::create(&manifest_temp)?;
        manifest::write_to(&mut manifest_file, &entry)?;
        drop(manifest_file);
        control.check()?;
        let data = self.root.join(format!("{key}.mp4"));
        let metadata = self.root.join(format!("{key}.json"));
        files::remove(&self.root, &metadata)?;
        files::remove(&self.root, &data)?;
        fs::rename(data_temp, data).map_err(|error| error.to_string())?;
        control.check()?;
        fs::rename(manifest_temp, metadata).map_err(|error| error.to_string())?;
        Ok(())
    }

    fn check_key(&self, key: &str) -> Result<(), String> {
        if files::valid_key(key) {
            Ok(())
        } else {
            Err("Chave de cache inválida.".into())
        }
    }
}

fn transfer(
    file: &mut File,
    mut destination: Option<&mut File>,
    control: &ProcessControl,
) -> Result<(u64, String), String> {
    let mut hash = Sha256::new();
    let mut bytes = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        control.check()?;
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        if let Some(output) = destination.as_deref_mut() {
            output
                .write_all(&buffer[..count])
                .map_err(|error| error.to_string())?;
        }
        hash.update(&buffer[..count]);
        bytes = bytes
            .checked_add(count as u64)
            .ok_or("Arquivo de cache muito grande.")?;
    }
    control.check()?;
    Ok((bytes, format!("{:x}", hash.finalize())))
}

fn next_access(lock: &mut File, now: u64) -> Result<u64, String> {
    lock.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    let mut bytes = [0_u8; 8];
    let size = lock.metadata().map_err(|error| error.to_string())?.len();
    let previous = if size == 0 {
        0
    } else if size == 8 {
        lock.read_exact(&mut bytes)
            .map_err(|error| error.to_string())?;
        u64::from_le_bytes(bytes)
    } else {
        return Err("Controle de acesso do cache inválido.".into());
    };
    let next = now.max(previous.saturating_add(1));
    lock.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    lock.write_all(&next.to_le_bytes())
        .map_err(|error| error.to_string())?;
    Ok(next)
}

#[cfg(test)]
mod tests;
