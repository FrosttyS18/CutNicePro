use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
mod dto;
mod reference;
use crate::media_source::SourceStamp;
pub use dto::MediaEntryDto;
use reference::{valid_filename, validate_entry};

#[cfg(test)]
pub(crate) mod reference_tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAnalysis {
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub video_codec: String,
    pub audio_codec: Option<String>,
    pub has_audio: bool,
    pub fps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntry {
    pub media_id: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub ext: String,
    pub original_name: String,
    pub created_at_ms: u64,
    /// Referências explícitas por projeto — sem contador independente.
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub analysis: Option<MediaAnalysis>,
    #[serde(default)]
    pub unavailable: bool,
    #[serde(default)]
    pub storage: MediaStorage,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum MediaStorage {
    #[default]
    Managed,
    Reference {
        path: PathBuf,
        stamp: SourceStamp,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIndex {
    #[serde(default = "legacy_index_version")]
    pub version: u32,
    pub entries: Vec<MediaEntry>,
}

fn legacy_index_version() -> u32 {
    1
}

impl Default for MediaIndex {
    fn default() -> Self {
        Self {
            version: 2,
            entries: Vec::new(),
        }
    }
}

pub struct MediaStore {
    root: PathBuf,
    index_lock: Mutex<()>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug)]
pub enum ReconcileOutcome {
    Ok {
        adopted: usize,
        removed_parts: usize,
        marked_unavailable: usize,
    },
    Suspended(String),
}

impl MediaStore {
    pub fn open(base: &Path) -> Result<MediaStore, String> {
        let root = base.join("cutnicepro").join("media");
        fs::create_dir_all(root.join("files"))
            .map_err(|e| format!("não foi possível criar a pasta de mídia: {e}"))?;
        Ok(MediaStore {
            root,
            index_lock: Mutex::new(()),
        })
    }

    pub fn files_dir(&self) -> PathBuf {
        self.root.join("files")
    }

    fn index_path(&self) -> PathBuf {
        self.root.join("index.json")
    }

    fn load_index(&self) -> Result<MediaIndex, String> {
        let path = self.index_path();
        if !path.exists() {
            return Ok(MediaIndex::default());
        }
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("falha ao ler {}: {e}", path.display()))?;
        let index: MediaIndex =
            serde_json::from_str(&raw).map_err(|e| format!("índice de mídia corrompido: {e}"))?;
        if ![1, 2].contains(&index.version) {
            return Err(format!(
                "versão do índice de mídia não suportada: {}",
                index.version
            ));
        }
        for entry in &index.entries {
            validate_entry(entry)?;
            if index.version == 1 && !matches!(entry.storage, MediaStorage::Managed) {
                return Err("índice legado com localização de mídia incompatível".into());
            }
        }
        Ok(index)
    }

    fn save_index(&self, index: &MediaIndex) -> Result<(), String> {
        let path = self.index_path();
        let mut versioned = index.clone();
        versioned.version = 2;
        let body = serde_json::to_string_pretty(&versioned)
            .map_err(|e| format!("falha ao serializar índice de mídia: {e}"))?;
        crate::file_output::atomic_write(&path, |file| {
            use std::io::Write;
            file.write_all(body.as_bytes())
                .map_err(|error| error.to_string())
        })
    }

    /// Toda mutação do índice serializada: load → mutate → save sob o lock.
    fn with_index<T>(
        &self,
        mutate: impl FnOnce(&mut MediaIndex) -> Result<T, String>,
    ) -> Result<T, String> {
        let _guard = self
            .index_lock
            .lock()
            .map_err(|_| "lock do índice de mídia envenenado")?;
        let mut index = self.load_index()?;
        let out = mutate(&mut index)?;
        self.save_index(&index)?;
        Ok(out)
    }

    #[cfg(test)]
    pub fn find(&self, sha256: &str) -> Result<Option<MediaEntry>, String> {
        let index = self.load_index()?;
        Ok(index.entries.into_iter().find(|e| e.sha256 == sha256))
    }

    pub fn get(&self, media_id: &str) -> Result<Option<MediaEntry>, String> {
        let index = self.load_index()?;
        Ok(index.entries.into_iter().find(|e| e.media_id == media_id))
    }

    /// Publicação (última etapa da importação): move o corpo final para
    /// `<sha256>.<ext>` e cria/atualiza a entrada com o vínculo do projeto.
    /// Deduplicação natural: corpo já existente → o novo é descartado e a
    /// entrada existente ganha o project_id (se ainda não tinha).
    #[cfg(test)]
    pub fn publish(
        &self,
        staged_part: &Path,
        sha256: &str,
        size_bytes: u64,
        ext: &str,
        original_name: &str,
        project_id: &str,
    ) -> Result<MediaEntry, String> {
        let final_name = format!("{sha256}.{ext}");
        let final_path = self.files_dir().join(&final_name);
        let _guard = self
            .index_lock
            .lock()
            .map_err(|_| "lock do índice de mídia envenenado")?;
        let mut index = self.load_index()?;
        if !final_path.exists() {
            fs::rename(staged_part, &final_path)
                .map_err(|e| format!("falha ao publicar mídia: {e}"))?;
        } else {
            let _ = fs::remove_file(staged_part);
        }
        let now = now_ms();
        let entry = match index.entries.iter_mut().find(|e| e.sha256 == sha256) {
            Some(e) => {
                if !e.project_ids.iter().any(|p| p == project_id) {
                    e.project_ids.push(project_id.to_string());
                }
                if e.unavailable && final_path.exists() {
                    e.unavailable = false;
                }
                e.clone()
            }
            None => {
                let e = MediaEntry {
                    media_id: uuid::Uuid::new_v4().to_string(),
                    sha256: sha256.to_string(),
                    size_bytes,
                    ext: ext.to_string(),
                    original_name: original_name.to_string(),
                    created_at_ms: now,
                    project_ids: vec![project_id.to_string()],
                    analysis: None,
                    unavailable: false,
                    storage: MediaStorage::Managed,
                };
                index.entries.push(e.clone());
                e
            }
        };
        self.save_index(&index)?;
        Ok(entry)
    }

    /// Vínculo idempotente (re-executável se o workspace não confirmou).
    pub fn link_project(&self, media_id: &str, project_id: &str) -> Result<MediaEntry, String> {
        self.with_index(|index| {
            let e = index
                .entries
                .iter_mut()
                .find(|e| e.media_id == media_id)
                .ok_or_else(|| "mídia não encontrada".to_string())?;
            if !e.project_ids.iter().any(|p| p == project_id) {
                e.project_ids.push(project_id.to_string());
            }
            Ok(e.clone())
        })
    }

    /// Grava análise ffprobe na entrada (serializado como as demais mutações).
    pub fn store_analysis(&self, media_id: &str, analysis: MediaAnalysis) -> Result<(), String> {
        self.with_index(|index| {
            let e = index
                .entries
                .iter_mut()
                .find(|e| e.media_id == media_id)
                .ok_or_else(|| "mídia não encontrada".to_string())?;
            e.analysis = Some(analysis);
            Ok(())
        })
    }

    /// Exclusão por referências: remove o id do projeto; lista vazia →
    /// arquivo físico removido + entrada retirada.
    pub fn remove_project(&self, project_id: &str) -> Result<Vec<String>, String> {
        let _guard = self
            .index_lock
            .lock()
            .map_err(|_| "lock do índice de mídia envenenado")?;
        let mut index = self.load_index()?;
        let mut removed_files = Vec::new();
        let mut keep = Vec::with_capacity(index.entries.len());
        for mut e in index.entries.drain(..) {
            if e.project_ids.iter().any(|p| p == project_id) {
                e.project_ids.retain(|p| p != project_id);
                if e.project_ids.is_empty() {
                    if matches!(e.storage, MediaStorage::Managed) {
                        let p = self.registered_path(&e)?;
                        match fs::remove_file(&p) {
                            Ok(()) => {}
                            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                            Err(e) => return Err(format!("não foi possível remover o vídeo: {e}")),
                        }
                        removed_files.push(
                            p.file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        );
                    }
                    continue;
                }
            }
            keep.push(e);
        }
        index.entries = keep;
        self.save_index(&index)?;
        Ok(removed_files)
    }

    /// Reconcile de inicialização (AC-R1). `live_parts` = caminhos de `.part`
    /// com job vivo neste processo (em inicialização, nenhum).
    pub fn reconcile(&self, live_parts: &[PathBuf]) -> Result<ReconcileOutcome, String> {
        let _guard = self
            .index_lock
            .lock()
            .map_err(|_| "lock do índice de mídia envenenado")?;
        // Índice ilegível → limpeza suspensa com causa (nada é tocado).
        let mut index = match self.load_index() {
            Ok(i) => i,
            Err(e) => return Ok(ReconcileOutcome::Suspended(e)),
        };

        let mut removed_parts = 0usize;
        let mut adopted = 0usize;
        let mut marked_unavailable = 0usize;
        let mut dirty = false;

        if let Ok(rd) = fs::read_dir(self.files_dir()) {
            for entry in rd.flatten() {
                let p = entry.path();
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if name.ends_with(".part") && !live_parts.iter().any(|lp| lp == &p) {
                    let _ = fs::remove_file(&p);
                    removed_parts += 1;
                }
            }
        }

        // Arquivos finais sem entrada → ADOTAR (nunca apagar).
        if let Ok(rd) = fs::read_dir(self.files_dir()) {
            let names: Vec<String> = rd
                .flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            for name in names {
                if name.ends_with(".part") {
                    continue;
                }
                let known = index.entries.iter().any(|e| {
                    matches!(e.storage, MediaStorage::Managed)
                        && format!("{}.{}", e.sha256, e.ext) == name
                });
                if known {
                    continue;
                }
                if let Some((sha, ext)) = name
                    .rsplit_once('.')
                    .filter(|(sha, ext)| valid_filename(sha, ext))
                {
                    let meta = fs::metadata(self.files_dir().join(&name)).ok();
                    index.entries.push(MediaEntry {
                        media_id: uuid::Uuid::new_v4().to_string(),
                        sha256: sha.to_string(),
                        size_bytes: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                        ext: ext.to_string(),
                        original_name: format!("(recuperada) {name}"),
                        created_at_ms: now_ms(),
                        project_ids: Vec::new(),
                        analysis: None,
                        unavailable: false,
                        storage: MediaStorage::Managed,
                    });
                    adopted += 1;
                    dirty = true;
                }
            }
        }

        // Entradas cujo arquivo sumiu → marcadas unavailable (não removidas).
        for e in index.entries.iter_mut() {
            if e.unavailable {
                continue;
            }
            if self.resolve_entry(e.clone()).is_err() {
                e.unavailable = true;
                marked_unavailable += 1;
                dirty = true;
            }
        }

        if dirty {
            self.save_index(&index)?;
        }
        Ok(ReconcileOutcome::Ok {
            adopted,
            removed_parts,
            marked_unavailable,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_store(tag: &str) -> MediaStore {
        let base =
            std::env::temp_dir().join(format!("cnp-m2a-test-{tag}-{}", uuid::Uuid::new_v4()));
        MediaStore::open(&base).expect("store init")
    }

    fn write_file(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let p = dir.join(name);
        let mut f = fs::File::create(&p).unwrap();
        f.write_all(bytes).unwrap();
        p
    }

    #[test]
    fn publish_creates_entry_with_explicit_reference() {
        let s = temp_store("publish");
        let part = write_file(&s.files_dir(), "job1.part", b"abc");
        let e = s
            .publish(&part, &"a".repeat(64), 3, "mp4", "video.mp4", "p1")
            .unwrap();
        assert_eq!(e.project_ids, vec!["p1"]);
        assert!(s
            .files_dir()
            .join(format!("{}.mp4", "a".repeat(64)))
            .exists());
        assert!(!part.exists());
    }

    #[test]
    fn publish_dedupes_and_links_two_projects_explicitly() {
        let s = temp_store("dedup");
        let sha = "b".repeat(64);
        let p1 = write_file(&s.files_dir(), "j1.part", b"xyz");
        let p2 = write_file(&s.files_dir(), "j2.part", b"xyz");
        s.publish(&p1, &sha, 3, "mp4", "a.mp4", "p1").unwrap();
        let e2 = s.publish(&p2, &sha, 3, "mp4", "b.mp4", "p2").unwrap();
        assert_eq!(e2.project_ids.len(), 2);
        // corpo único em disco
        let mut n = 0;
        for e in fs::read_dir(s.files_dir()).unwrap().flatten() {
            if e.file_name().to_string_lossy().ends_with(".mp4") {
                n += 1;
            }
        }
        assert_eq!(n, 1);
    }

    #[test]
    fn link_is_idempotent() {
        let s = temp_store("link");
        let part = write_file(&s.files_dir(), "j.part", b"q");
        let e = s
            .publish(&part, &"c".repeat(64), 1, "mp4", "x.mp4", "p1")
            .unwrap();
        s.link_project(&e.media_id, "p1").unwrap();
        let e2 = s.get(&e.media_id).unwrap().unwrap();
        assert_eq!(e2.project_ids.len(), 1);
    }

    #[test]
    fn remove_project_keeps_file_while_other_project_references() {
        let s = temp_store("remove");
        let sha = "d".repeat(64);
        let p1 = write_file(&s.files_dir(), "j1.part", b"zz");
        let p2 = write_file(&s.files_dir(), "j2.part", b"zz");
        let e = s.publish(&p1, &sha, 2, "mp4", "a.mp4", "p1").unwrap();
        s.publish(&p2, &sha, 2, "mp4", "b.mp4", "p2").unwrap();
        s.remove_project("p1").unwrap();
        assert!(s.files_dir().join(format!("{sha}.mp4")).exists());
        let e2 = s.get(&e.media_id).unwrap().unwrap();
        assert_eq!(e2.project_ids, vec!["p2"]);
        let removed = s.remove_project("p2").unwrap();
        assert!(!s.files_dir().join(format!("{sha}.mp4")).exists());
        assert_eq!(removed.len(), 1);
    }

    #[test]
    fn remove_project_reports_file_failure_and_retains_index_references() {
        let s = temp_store("remove-error");
        let sha = "d".repeat(64);
        let part = write_file(&s.files_dir(), "j.part", b"zz");
        let entry = s.publish(&part, &sha, 2, "mp4", "a.mp4", "p1").unwrap();
        let file = s.files_dir().join(format!("{sha}.mp4"));
        fs::remove_file(&file).unwrap();
        fs::create_dir(&file).unwrap();
        assert!(s.remove_project("p1").is_err());
        assert_eq!(
            s.get(&entry.media_id).unwrap().unwrap().project_ids,
            vec!["p1"]
        );
        fs::remove_dir(file).unwrap();
    }

    #[test]
    fn reconcile_removes_dead_part_and_adopts_orphan_final() {
        let s = temp_store("reconcile");
        write_file(&s.files_dir(), "dead.part", b"partial");
        write_file(&s.files_dir(), &format!("{}.mp4", "e".repeat(64)), b"full");
        match s.reconcile(&[]).unwrap() {
            ReconcileOutcome::Ok {
                adopted,
                removed_parts,
                ..
            } => {
                assert_eq!(adopted, 1);
                assert_eq!(removed_parts, 1);
            }
            _ => panic!("esperado Ok"),
        }
        assert!(!s.files_dir().join("dead.part").exists());
        assert!(s
            .files_dir()
            .join(format!("{}.mp4", "e".repeat(64)))
            .exists());
        // adotada tem entrada sem vínculos
        let e = s.find(&"e".repeat(64)).unwrap().unwrap();
        assert!(e.project_ids.is_empty());
    }

    #[test]
    fn reconcile_marks_missing_file_unavailable_not_removed() {
        let s = temp_store("unavail");
        let part = write_file(&s.files_dir(), "j.part", b"k");
        let e = s
            .publish(&part, &"f".repeat(64), 1, "mp4", "k.mp4", "p1")
            .unwrap();
        fs::remove_file(s.files_dir().join(format!("{}.mp4", "f".repeat(64)))).unwrap();
        match s.reconcile(&[]).unwrap() {
            ReconcileOutcome::Ok {
                marked_unavailable, ..
            } => assert_eq!(marked_unavailable, 1),
            _ => panic!("esperado Ok"),
        }
        let e2 = s.get(&e.media_id).unwrap().unwrap();
        assert!(e2.unavailable, "entrada preservada como unavailable");
    }

    #[test]
    fn reconcile_suspends_cleanup_on_corrupt_index() {
        let s = temp_store("corrupt");
        write_file(&s.files_dir(), "dead.part", b"x");
        fs::write(s.index_path(), "{ corrompido").unwrap();
        match s.reconcile(&[]) {
            Ok(ReconcileOutcome::Suspended(msg)) => assert!(msg.contains("corrompido")),
            other => panic!("esperado Suspended, veio {other:?}"),
        }
        assert!(s.files_dir().join("dead.part").exists(), "limpeza suspensa");
    }

    #[test]
    fn future_index_version_preserves_index_and_suspends_cleanup() {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-reference-import")
            .join(uuid::Uuid::new_v4().to_string());
        let store = MediaStore::open(&base).unwrap();
        let raw = br#"{"version":999,"entries":[]}"#;
        fs::write(store.index_path(), raw).unwrap();
        fs::write(store.files_dir().join("interrupted.part"), b"preserve").unwrap();
        assert!(store.get("anything").is_err());
        assert!(matches!(
            store.reconcile(&[]).unwrap(),
            ReconcileOutcome::Suspended(_)
        ));
        assert_eq!(fs::read(store.index_path()).unwrap(), raw);
        assert!(store.files_dir().join("interrupted.part").is_file());
        fs::remove_dir_all(base).unwrap();
    }
}
