use super::{files, manifest, Cache, TRANSACTION_RESERVE};
use crate::transcription::process::ProcessControl;
use std::{collections::BTreeSet, fs};

impl Cache {
    pub(super) fn prune(&self, incoming: u64, control: &ProcessControl) -> Result<(), String> {
        let now = manifest::now_ms()?;
        let mut keys = BTreeSet::new();
        for entry in fs::read_dir(&self.root).map_err(|error| error.to_string())? {
            control.check()?;
            let entry = entry.map_err(|error| error.to_string())?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if let Some(key) = name
                .strip_suffix(".mp4")
                .or_else(|| name.strip_suffix(".json"))
            {
                if files::valid_key(key) && files::regular(&self.root, &entry.path()).is_ok() {
                    keys.insert(key.to_owned());
                }
            } else if temporary(name) {
                let Ok(_) = files::regular(&self.root, &entry.path()) else {
                    continue;
                };
                files::remove(&self.root, &entry.path())?;
            }
        }
        let mut entries = Vec::new();
        let mut total = 8_u64;
        for key in keys {
            control.check()?;
            let data = self.root.join(format!("{key}.mp4"));
            let metadata = files::regular(&self.root, &data);
            let entry = manifest::read(&self.root, &key);
            match (metadata, entry) {
                (Ok(metadata), Ok(entry))
                    if entry.valid(&key, &self.policy, now) && metadata.len() == entry.bytes =>
                {
                    let manifest_size =
                        files::regular(&self.root, &self.root.join(format!("{key}.json")))?.len();
                    let bytes = entry.bytes.saturating_add(manifest_size);
                    total = total.saturating_add(bytes);
                    entries.push((entry.accessed_ms, key, bytes));
                }
                _ => self.remove_entry(&key)?,
            }
        }
        entries.sort();
        for (_, key, bytes) in entries {
            if total.saturating_add(incoming)
                <= self.policy.max_bytes.saturating_sub(TRANSACTION_RESERVE)
            {
                break;
            }
            control.check()?;
            self.remove_entry(&key)?;
            total = total.saturating_sub(bytes);
        }
        Ok(())
    }

    fn remove_entry(&self, key: &str) -> Result<(), String> {
        files::remove(&self.root, &self.root.join(format!("{key}.json")))?;
        files::remove(&self.root, &self.root.join(format!("{key}.mp4")))
    }
}

fn temporary(name: &str) -> bool {
    let Some(stem) = name
        .strip_suffix(".mp4.tmp")
        .or_else(|| name.strip_suffix(".json.tmp"))
    else {
        return false;
    };
    let Some((key, id)) = stem.split_once('_') else {
        return false;
    };
    files::valid_key(key) && uuid::Uuid::parse_str(id).is_ok_and(|parsed| parsed.to_string() == id)
}
