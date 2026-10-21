//! Job de importação de mídia (M2A): cópia em stream com integridade
//! (bytes == stat inicial + SHA-256 dos bytes escritos + re-stat da origem),
//! cancelamento por job e eventos de progresso REAIS (bytes).

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};

const CHUNK: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub job_id: String,
    pub bytes_copied: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStat {
    pub size: u64,
    pub modified_ms: u64,
}

fn stat_source(p: &Path) -> Result<SourceStat, String> {
    let md = fs::metadata(p).map_err(|e| format!("arquivo de origem inacessível: {e}"))?;
    if !md.is_file() {
        return Err("a origem não é um arquivo".into());
    }
    let modified_ms = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(SourceStat {
        size: md.len(),
        modified_ms,
    })
}

pub fn allowed_ext(name: &str) -> Option<String> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    const OK: [&str; 6] = ["mp4", "m4v", "mov", "webm", "mkv", "avi"];
    if OK.contains(&ext.as_str()) {
        Some(ext)
    } else {
        None
    }
}

pub struct ImportJobs {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl ImportJobs {
    pub fn new() -> ImportJobs {
        ImportJobs {
            cancels: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancels
            .lock()
            .unwrap()
            .insert(job_id.to_string(), Arc::clone(&flag));
        flag
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        match self.cancels.lock().unwrap().get(job_id) {
            Some(f) => {
                f.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    pub fn finish(&self, job_id: &str) {
        self.cancels.lock().unwrap().remove(job_id);
    }

    pub fn live_parts(&self, store: &crate::media_store::MediaStore) -> Vec<PathBuf> {
        self.cancels
            .lock()
            .unwrap()
            .keys()
            .map(|id| store.files_dir().join(format!("{id}.part")))
            .collect()
    }
}

/// Estado de origem para verificação de mudança durante a cópia.
#[derive(Clone, Copy)]
struct OriginStamp {
    size: u64,
    modified_ms: u64,
}

#[derive(Debug)]
pub enum ImportError {
    Cancelled,
    SourceChanged,
    DiskFull,
    Io(String),
}

impl ImportError {
    pub fn message(&self) -> String {
        match self {
            ImportError::Cancelled => "importação cancelada".into(),
            ImportError::SourceChanged => {
                "o arquivo de origem foi modificado durante a importação".into()
            }
            ImportError::DiskFull => "espaço em disco insuficiente para importar".into(),
            ImportError::Io(e) => format!("falha de E/S durante a importação: {e}"),
        }
    }
}

/// Cópia com hash dos bytes escritos. Retorna (bytes, sha256_hex).
pub fn copy_with_hash(
    src: &Path,
    staged_part: &Path,
    cancel: &AtomicBool,
    on_chunk: &dyn Fn(u64),
    free_space: &dyn Fn(&Path) -> Option<u64>,
) -> Result<(u64, String), ImportError> {
    let start = stat_source(src).map_err(ImportError::Io)?;
    let stamp = OriginStamp {
        size: start.size,
        modified_ms: start.modified_ms,
    };
    if start.size == 0 {
        return Err(ImportError::Io("arquivo de origem vazio".into()));
    }
    if let Some(free) = free_space(staged_part) {
        if free < start.size {
            return Err(ImportError::DiskFull);
        }
    }
    let mut in_file = fs::File::open(src).map_err(|e| ImportError::Io(e.to_string()))?;
    let mut out_file = fs::File::create(staged_part).map_err(|e| ImportError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    let mut copied: u64 = 0;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(ImportError::Cancelled);
        }
        let n = in_file
            .read(&mut buf)
            .map_err(|e| ImportError::Io(e.to_string()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        out_file
            .write_all(&buf[..n])
            .map_err(|e| ImportError::Io(e.to_string()))?;
        copied += n as u64;
        if let Some(free) = free_space(staged_part) {
            if free < CHUNK as u64 {
                return Err(ImportError::DiskFull);
            }
        }
        on_chunk(copied);
    }
    out_file
        .flush()
        .map_err(|e| ImportError::Io(e.to_string()))?;

    // Integridade: duas verificações independentes (AC-R3).
    if copied != stamp.size {
        return Err(ImportError::SourceChanged);
    }
    let end = stat_source(src).map_err(ImportError::Io)?;
    if end.size != stamp.size || end.modified_ms != stamp.modified_ms {
        return Err(ImportError::SourceChanged);
    }
    Ok((copied, format!("{:x}", hasher.finalize())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("cnp-m2a-imp-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn none_free(_: &Path) -> Option<u64> {
        None
    }

    #[test]
    fn copy_hashes_bytes_written() {
        let d = tmp("hash");
        let src = d.join("s.mp4");
        fs::write(&src, b"conteudo de teste").unwrap();
        let part = d.join("j.part");
        let flag = AtomicBool::new(false);
        let (n, sha) = copy_with_hash(&src, &part, &flag, &|_| {}, &none_free).unwrap();
        assert_eq!(n, 17);
        assert_eq!(sha.len(), 64);
        assert!(part.exists());
    }

    #[test]
    fn copy_cancels_and_causes_are_distinct() {
        let d = tmp("cancel");
        let src = d.join("s.mp4");
        let mut big = fs::File::create(&src).unwrap();
        // arquivo grande o bastante para o cancelador pegar no meio
        let chunk = vec![1u8; 1024 * 1024];
        for _ in 0..8 {
            big.write_all(&chunk).unwrap();
        }
        let part = d.join("j.part");
        let flag = AtomicBool::new(false);
        let f2 = &flag;
        let res = copy_with_hash(
            &src,
            &part,
            &flag,
            &|bytes| {
                if bytes > 2 * 1024 * 1024 {
                    f2.store(true, Ordering::SeqCst);
                }
            },
            &none_free,
        );
        match res {
            Err(ImportError::Cancelled) => {}
            other => panic!("esperado Cancelled, veio {other:?}"),
        }
        assert!(!part.exists() || fs::metadata(&part).unwrap().len() < 8 * 1024 * 1024);
    }

    #[test]
    fn source_changed_during_import_is_detected() {
        let d = tmp("mutate");
        let src = d.join("s.mp4");
        let mut f = fs::File::create(&src).unwrap();
        // 2 chunks: a mutação acontece DEPOIS do stat inicial (via callback
        // do 1º chunk) — detectada por copied != stamp.size ou re-stat.
        let chunk = vec![1u8; 4 * 1024 * 1024];
        f.write_all(&chunk).unwrap();
        f.write_all(&chunk).unwrap();
        f.sync_all().unwrap();
        drop(f);

        let part = d.join("j.part");
        let flag = AtomicBool::new(false);
        let src2 = src.clone();
        let mutated = std::sync::atomic::AtomicBool::new(false);
        let m2 = &mutated;
        let res = copy_with_hash(
            &src,
            &part,
            &flag,
            &|_bytes| {
                if !m2.load(Ordering::SeqCst) {
                    m2.store(true, Ordering::SeqCst);
                    let mut g = fs::OpenOptions::new().append(true).open(&src2).unwrap();
                    g.write_all(b"!!").unwrap();
                }
            },
            &none_free,
        );
        match res {
            Err(ImportError::SourceChanged) => {}
            Err(ImportError::Io(e)) => panic!("io inesperado: {e}"),
            Err(ImportError::Cancelled) | Err(ImportError::DiskFull) => {
                panic!("esperado SourceChanged, veio outra causa")
            }
            Ok((n, _)) => panic!(
                "esperado SourceChanged; cópia concluiu com {n} bytes sem detectar a mutação"
            ),
        }
        // o .part contém os bytes LIDOS (incl. os 2 extras) — o cleanup é do
        // command (import_media); aqui a prova é a divergência detectada.
        assert_eq!(
            fs::metadata(&part).map(|m| m.len()).unwrap_or(0),
            8 * 1024 * 1024 + 2
        );
    }

    #[test]
    fn disk_full_aborts_before_copy() {
        let d = tmp("full");
        let src = d.join("s.mp4");
        fs::write(&src, vec![0u8; 4096]).unwrap();
        let part = d.join("j.part");
        let flag = AtomicBool::new(false);
        let tiny_free = |_: &Path| Some(16u64);
        match copy_with_hash(&src, &part, &flag, &|_| {}, &tiny_free) {
            Err(ImportError::DiskFull) => {}
            other => panic!("esperado DiskFull, veio {other:?}"),
        }
        assert!(!part.exists());
    }

    #[test]
    fn allowed_ext_matches_supported_formats() {
        assert_eq!(allowed_ext("a.MP4").as_deref(), Some("mp4"));
        assert_eq!(allowed_ext("b.mkv").as_deref(), Some("mkv"));
        assert_eq!(allowed_ext("c.txt"), None);
        assert_eq!(allowed_ext("noext"), None);
    }
}
