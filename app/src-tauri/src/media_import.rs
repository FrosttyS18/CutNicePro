use std::collections::HashMap;
#[cfg(test)]
use std::fs;
#[cfg(test)]
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(test)]
use std::time::UNIX_EPOCH;

#[cfg(test)]
use sha2::{Digest, Sha256};
pub mod commands;
mod reference;
pub use reference::{verify_reference, VerifiedReference};
#[cfg(test)]
mod commit_tests;

const CHUNK: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub job_id: String,
    pub bytes_copied: u64,
    pub total_bytes: u64,
    pub bytes_processed: u64,
    pub phase: &'static str,
    pub storage_kind: &'static str,
}

#[cfg(test)]
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStat {
    pub size: u64,
    pub modified_ms: u64,
}

#[cfg(test)]
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

pub fn allowed_editor_ext(name: &str, kind: &crate::editor::types::MediaKind) -> Option<String> {
    use crate::editor::types::MediaKind;
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    let supported = match kind {
        MediaKind::Video => return allowed_ext(name),
        MediaKind::Image => ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()),
        MediaKind::Audio => {
            ["wav", "mp3", "m4a", "aac", "ogg", "opus", "flac"].contains(&ext.as_str())
        }
    };
    supported.then_some(ext)
}

pub struct ImportJobs {
    cancels: Mutex<HashMap<String, ImportJob>>,
    closed: AtomicBool,
}

struct ImportJob {
    cancel: Arc<AtomicBool>,
    process: Arc<crate::transcription::process::ProcessControl>,
}

impl ImportJobs {
    pub fn new() -> ImportJobs {
        ImportJobs {
            cancels: Mutex::new(HashMap::new()),
            closed: AtomicBool::new(false),
        }
    }

    #[cfg(test)]
    pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        self.start(job_id)
            .expect("identificador de job de teste duplicado")
    }

    pub fn start(&self, job_id: &str) -> Result<Arc<AtomicBool>, String> {
        let flag = Arc::new(AtomicBool::new(false));
        let process = Arc::new(crate::transcription::process::ProcessControl::default());
        let mut cancels = self.cancels.lock().unwrap();
        if cancels.contains_key(job_id) {
            return Err("Já existe uma importação com este identificador.".into());
        }
        if self.closed.load(Ordering::SeqCst) {
            flag.store(true, Ordering::SeqCst);
            process.cancel();
        }
        cancels.insert(
            job_id.to_string(),
            ImportJob {
                cancel: flag.clone(),
                process,
            },
        );
        Ok(flag)
    }

    pub fn commit<T>(
        &self,
        job_id: &str,
        write: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let mut jobs = self
            .cancels
            .lock()
            .map_err(|_| "Estado de importação indisponível.")?;
        let job = jobs.get(job_id).ok_or("Importação não encontrada.")?;
        if job.cancel.load(Ordering::SeqCst) {
            jobs.remove(job_id);
            return Err("importação cancelada".into());
        }
        let result = write();
        jobs.remove(job_id);
        result
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        let process = self.cancels.lock().unwrap().get(job_id).map(|job| {
            job.cancel.store(true, Ordering::SeqCst);
            job.process.clone()
        });
        if let Some(process) = process {
            process.cancel();
            true
        } else {
            false
        }
    }

    pub fn cancel_all(&self) {
        self.closed.store(true, Ordering::SeqCst);
        let processes: Vec<_> = self
            .cancels
            .lock()
            .unwrap()
            .values()
            .map(|job| {
                job.cancel.store(true, Ordering::SeqCst);
                job.process.clone()
            })
            .collect();
        for process in processes {
            process.cancel();
        }
    }

    pub fn analyze(
        &self,
        job_id: &str,
        tools: &crate::media_analyze::FfTools,
        source: &Path,
        kind: &crate::editor::types::MediaKind,
        scratch_root: &Path,
    ) -> Result<crate::media_analyze::MediaAnalysis, String> {
        let (cancel, process) = self
            .cancels
            .lock()
            .unwrap()
            .get(job_id)
            .map(|job| (job.cancel.clone(), job.process.clone()))
            .ok_or("importação não encontrada")?;
        if cancel.load(Ordering::SeqCst) {
            return Err("importação cancelada".into());
        }
        let result =
            crate::media_analyze::analyze_import(tools, source, kind, process, scratch_root);
        if cancel.load(Ordering::SeqCst) {
            Err("importação cancelada".into())
        } else {
            result
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
#[cfg(test)]
#[derive(Clone, Copy)]
struct OriginStamp {
    size: u64,
    modified_ms: u64,
}

#[derive(Debug)]
pub enum ImportError {
    Cancelled,
    SourceChanged,
    #[cfg(test)]
    DiskFull,
    TimedOut,
    Io(String),
}

impl ImportError {
    pub fn message(&self) -> String {
        match self {
            ImportError::Cancelled => "importação cancelada".into(),
            ImportError::SourceChanged => {
                "o arquivo de origem foi modificado durante a importação".into()
            }
            #[cfg(test)]
            ImportError::DiskFull => "espaço em disco insuficiente para importar".into(),
            ImportError::TimedOut => "Tempo limite da verificação do arquivo excedido.".into(),
            ImportError::Io(e) => format!("falha de E/S durante a importação: {e}"),
        }
    }
}

/// Cópia com hash dos bytes escritos. Retorna (bytes, sha256_hex).
#[cfg(test)]
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
            Err(ImportError::Cancelled)
            | Err(ImportError::DiskFull)
            | Err(ImportError::TimedOut) => {
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

    #[test]
    fn editor_formats_do_not_expand_the_original_video_upload() {
        use crate::editor::types::MediaKind;
        assert_eq!(
            allowed_editor_ext("cover.PNG", &MediaKind::Image).as_deref(),
            Some("png")
        );
        assert_eq!(
            allowed_editor_ext("voice.wav", &MediaKind::Audio).as_deref(),
            Some("wav")
        );
        assert!(allowed_editor_ext("script.svg", &MediaKind::Image).is_none());
        assert!(allowed_editor_ext("video.mp4", &MediaKind::Audio).is_none());
        assert!(allowed_ext("cover.png").is_none());
    }
}
