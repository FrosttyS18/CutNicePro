use super::{files, Policy};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Manifest {
    pub version: u8,
    pub key: String,
    pub completed: bool,
    pub bytes: u64,
    pub sha256: String,
    pub created_ms: u64,
    pub accessed_ms: u64,
}

impl Manifest {
    pub fn valid(&self, key: &str, policy: &Policy, now: u64) -> bool {
        self.version == 1
            && self.completed
            && self.key == key
            && files::valid_key(&self.sha256)
            && self.bytes > 0
            && self.bytes <= policy.max_bytes
            && self.created_ms <= now
            && now.saturating_sub(self.created_ms) <= policy.max_age_ms
    }
}

pub(super) fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis()
        .try_into()
        .map_err(|_| "Data inválida.".into())
}

pub(super) fn read(root: &Path, key: &str) -> Result<Manifest, String> {
    let file = files::open(root, &root.join(format!("{key}.json")), false)?;
    if file.metadata().map_err(|error| error.to_string())?.len() > 4096 {
        return Err("Manifesto de cache inválido.".into());
    }
    let mut bytes = Vec::new();
    file.take(4097)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

pub(super) fn write(root: &Path, value: &Manifest) -> Result<(), String> {
    let path = root.join(format!("{}_{}.json.tmp", value.key, uuid::Uuid::new_v4()));
    let _pending = files::Pending {
        root: root.into(),
        paths: vec![path.clone()],
    };
    let mut file = files::create(&path)?;
    write_to(&mut file, value)?;
    drop(file);
    let destination = root.join(format!("{}.json", value.key));
    files::remove(root, &destination)?;
    fs::rename(path, destination).map_err(|error| error.to_string())
}

pub(super) fn write_to(file: &mut File, value: &Manifest) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())
}
