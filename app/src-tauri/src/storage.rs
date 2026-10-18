//! Persistência local de projetos (M1).
//!
//! Armazenamento: um único JSON (`projects.json`) em
//! `<app-data>/cutnicepro/projects.json`, com escrita atômica
//! (tmp → bak swap). Evolui para DB quando mídia/jobs exigirem.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub last_opened_at_ms: Option<u64>,
}

pub const NAME_MAX: usize = 80;

pub struct Store {
    path: PathBuf,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Store {
    /// Abre (ou cria) o store em `<base>/cutnicepro/projects.json`.
    pub fn open(base: &Path) -> Result<Store, String> {
        let dir = base.join("cutnicepro");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("não foi possível criar a pasta de dados: {e}"))?;
        Ok(Store {
            path: dir.join("projects.json"),
        })
    }

    pub fn load(&self) -> Result<Vec<ProjectMeta>, String> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let raw = fs::read_to_string(&self.path)
            .map_err(|e| format!("falha ao ler {}: {e}", self.path.display()))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("arquivo de projetos corrompido: {e}"))
    }

    /// Escrita atômica: escreve em .tmp, preserva o atual como .bak e troca.
    fn save(&self, projects: &[ProjectMeta]) -> Result<(), String> {
        let tmp = self.path.with_extension("json.tmp");
        let bak = self.path.with_extension("json.bak");
        let body = serde_json::to_string_pretty(projects)
            .map_err(|e| format!("falha ao serializar projetos: {e}"))?;
        fs::write(&tmp, body)
            .map_err(|e| format!("falha ao gravar dados (disco?): {e}"))?;
        if self.path.exists() {
            fs::rename(&self.path, &bak)
                .map_err(|e| format!("falha ao preservar backup: {e}"))?;
        }
        fs::rename(&tmp, &self.path)
            .map_err(|e| format!("falha ao finalizar gravação: {e}"))?;
        let _ = fs::remove_file(&bak);
        Ok(())
    }

    fn unique_name(existing: &[ProjectMeta], want: &str) -> String {
        let taken: Vec<&str> = existing.iter().map(|p| p.name.as_str()).collect();
        if !taken.contains(&want) {
            return want.to_string();
        }
        for n in 2..u32::MAX {
            let cand = format!("{want} ({n})");
            if !taken.contains(&cand.as_str()) {
                return cand;
            }
        }
        want.to_string() // inatingível na prática
    }

    pub fn create_project(&self, raw_name: &str) -> Result<ProjectMeta, String> {
        let name = raw_name.trim();
        if name.is_empty() {
            return Err("informe um nome para o projeto".into());
        }
        if name.chars().count() > NAME_MAX {
            return Err(format!("nome muito longo (máximo {NAME_MAX} caracteres)"));
        }
        let mut projects = self.load()?;
        let final_name = Self::unique_name(&projects, name);
        let now = now_ms();
        let project = ProjectMeta {
            id: uuid::Uuid::new_v4().to_string(),
            name: final_name,
            created_at_ms: now,
            updated_at_ms: now,
            last_opened_at_ms: None,
        };
        projects.push(project.clone());
        self.save(&projects)?;
        Ok(project)
    }

    pub fn open_project(&self, id: &str) -> Result<ProjectMeta, String> {
        let mut projects = self.load()?;
        let now = now_ms();
        let idx = projects
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| "projeto não encontrado".to_string())?;
        projects[idx].last_opened_at_ms = Some(now);
        projects[idx].updated_at_ms = now;
        let out = projects[idx].clone();
        self.save(&projects)?;
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(tag: &str) -> Store {
        let base = std::env::temp_dir().join(format!(
            "cnp-m1-test-{tag}-{}",
            uuid::Uuid::new_v4()
        ));
        Store::open(&base).expect("store init")
    }

    #[test]
    fn create_list_and_persist_across_reopen() {
        let store = temp_store("persist");
        let a = store.create_project("Podcast Ep 12").unwrap();
        // "Reabrir o aplicativo" = nova instância do store no mesmo caminho.
        let store2 = Store {
            path: store.path.clone(),
        };
        let list = store2.load().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, a.id);
        assert_eq!(list[0].name, "Podcast Ep 12");
        assert!(list[0].last_opened_at_ms.is_none());
    }

    #[test]
    fn open_updates_last_opened_and_persists() {
        let store = temp_store("open");
        let p = store.create_project("A").unwrap();
        assert!(p.last_opened_at_ms.is_none());
        let opened = store.open_project(&p.id).unwrap();
        assert!(opened.last_opened_at_ms.is_some());
        let store2 = Store {
            path: store.path.clone(),
        };
        let list = store2.load().unwrap();
        assert!(list[0].last_opened_at_ms.is_some(), "timestamp persistido");
    }

    #[test]
    fn empty_or_blank_name_is_rejected() {
        let store = temp_store("empty");
        assert!(store.create_project("").is_err());
        assert!(store.create_project("   ").is_err());
    }

    #[test]
    fn overlong_name_is_rejected() {
        let store = temp_store("long");
        let name = "a".repeat(NAME_MAX + 1);
        let err = store.create_project(&name).unwrap_err();
        assert!(err.contains("80"), "mensagem menciona o limite: {err}");
    }

    #[test]
    fn duplicate_names_get_unique_suffix() {
        let store = temp_store("dup");
        store.create_project("Cortes").unwrap();
        let b = store.create_project("Cortes").unwrap();
        let c = store.create_project("Cortes").unwrap();
        assert_eq!(b.name, "Cortes (2)");
        assert_eq!(c.name, "Cortes (3)");
    }

    #[test]
    fn open_unknown_id_is_error() {
        let store = temp_store("unknown");
        assert!(store.open_project("id-inexistente").is_err());
    }

    #[test]
    fn corrupt_file_is_reported_not_silently_wiped() {
        let store = temp_store("corrupt");
        store.create_project("ok").unwrap();
        fs::write(&store.path, "{ isto não é json").unwrap();
        let err = store.load().unwrap_err();
        assert!(err.contains("corrompido"), "erro explica a causa: {err}");
        // criação sobre arquivo corrompido falha de forma explícita (sem apagar)
        assert!(store.create_project("outro").is_err());
    }
}

// ---------------------------------------------------------------------------
// Coleções (Fase 03B) — arquivo próprio `collections.json`, aditivo e
// retrocompatível: `projects.json` e os comandos M1 permanecem intactos.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CollectionMeta {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub project_ids: Vec<String>,
}

pub const COLLECTION_NAME_MAX: usize = 80;

pub fn valid_collection_icon(icon: &str) -> bool {
    icon == "heart" || icon == "archive-box"
}

pub struct CollectionStore {
    path: PathBuf,
}

impl CollectionStore {
    /// Abre (ou cria) o store em `<base>/cutnicepro/collections.json`.
    pub fn open(base: &Path) -> Result<CollectionStore, String> {
        let dir = base.join("cutnicepro");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("não foi possível criar a pasta de dados: {e}"))?;
        Ok(CollectionStore {
            path: dir.join("collections.json"),
        })
    }

    pub fn load(&self) -> Result<Vec<CollectionMeta>, String> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let raw = fs::read_to_string(&self.path)
            .map_err(|e| format!("falha ao ler {}: {e}", self.path.display()))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("arquivo de coleções corrompido: {e}"))
    }

    fn save(&self, collections: &[CollectionMeta]) -> Result<(), String> {
        let tmp = self.path.with_extension("json.tmp");
        let bak = self.path.with_extension("json.bak");
        let body = serde_json::to_string_pretty(collections)
            .map_err(|e| format!("falha ao serializar coleções: {e}"))?;
        fs::write(&tmp, body).map_err(|e| format!("falha ao gravar dados (disco?): {e}"))?;
        if self.path.exists() {
            fs::rename(&self.path, &bak)
                .map_err(|e| format!("falha ao preservar backup: {e}"))?;
        }
        fs::rename(&tmp, &self.path)
            .map_err(|e| format!("falha ao finalizar gravação: {e}"))?;
        let _ = fs::remove_file(&bak);
        Ok(())
    }

    fn unique_name(existing: &[CollectionMeta], want: &str) -> String {
        let taken: Vec<&str> = existing.iter().map(|c| c.name.as_str()).collect();
        if !taken.contains(&want) {
            return want.to_string();
        }
        for n in 2..u32::MAX {
            let cand = format!("{want} ({n})");
            if !taken.contains(&cand.as_str()) {
                return cand;
            }
        }
        want.to_string()
    }

    pub fn create_collection(&self, raw_name: &str, icon: &str) -> Result<CollectionMeta, String> {
        let name = raw_name.trim();
        if name.is_empty() {
            return Err("informe um nome para a coleção".into());
        }
        if name.chars().count() > COLLECTION_NAME_MAX {
            return Err(format!(
                "nome muito longo (máximo {COLLECTION_NAME_MAX} caracteres)"
            ));
        }
        if !valid_collection_icon(icon) {
            return Err("ícone de coleção inválido".into());
        }
        let mut collections = self.load()?;
        let now = now_ms();
        let collection = CollectionMeta {
            id: uuid::Uuid::new_v4().to_string(),
            name: Self::unique_name(&collections, name),
            icon: icon.to_string(),
            created_at_ms: now,
            updated_at_ms: now,
            project_ids: Vec::new(),
        };
        collections.push(collection.clone());
        self.save(&collections)?;
        Ok(collection)
    }

    fn position(&self, collections: &[CollectionMeta], id: &str) -> Result<usize, String> {
        collections
            .iter()
            .position(|c| c.id == id)
            .ok_or_else(|| "coleção não encontrada".to_string())
    }

    /// Adiciona um projeto à coleção (idempotente: duplicado não altera nada,
    /// mas ainda atualiza `updated_at_ms`? Não — duplicado é no-op completo).
    pub fn add_project(
        &self,
        collection_id: &str,
        project_id: &str,
        known_project_ids: &[String],
    ) -> Result<CollectionMeta, String> {
        if !known_project_ids.iter().any(|p| p == project_id) {
            return Err("projeto não encontrado".to_string());
        }
        let mut collections = self.load()?;
        let idx = self.position(&collections, collection_id)?;
        if collections[idx].project_ids.iter().any(|p| p == project_id) {
            return Ok(collections[idx].clone());
        }
        collections[idx].project_ids.push(project_id.to_string());
        collections[idx].updated_at_ms = now_ms();
        let out = collections[idx].clone();
        self.save(&collections)?;
        Ok(out)
    }

    pub fn remove_project(
        &self,
        collection_id: &str,
        project_id: &str,
    ) -> Result<CollectionMeta, String> {
        let mut collections = self.load()?;
        let idx = self.position(&collections, collection_id)?;
        let before = collections[idx].project_ids.len();
        collections[idx].project_ids.retain(|p| p != project_id);
        if collections[idx].project_ids.len() != before {
            collections[idx].updated_at_ms = now_ms();
        }
        let out = collections[idx].clone();
        self.save(&collections)?;
        Ok(out)
    }
}

#[cfg(test)]
mod collection_tests {
    use super::*;

    fn temp_collection_store(tag: &str) -> CollectionStore {
        let base = std::env::temp_dir().join(format!(
            "cnp-03b-test-{tag}-{}",
            uuid::Uuid::new_v4()
        ));
        CollectionStore::open(&base).expect("collection store init")
    }

    fn project_ids(names: &[(&str, &str)]) -> Vec<String> {
        names.iter().map(|(id, _)| id.to_string()).collect()
    }

    #[test]
    fn create_collection_persists_across_reopen() {
        let store = temp_collection_store("persist");
        let c = store.create_collection("Mr beast", "archive-box").unwrap();
        assert_eq!(c.name, "Mr beast");
        assert_eq!(c.icon, "archive-box");
        assert!(c.project_ids.is_empty());
        let store2 = CollectionStore {
            path: store.path.clone(),
        };
        let list = store2.load().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, c.id);
    }

    #[test]
    fn empty_name_and_bad_icon_are_rejected() {
        let store = temp_collection_store("validate");
        assert!(store.create_collection("", "heart").is_err());
        assert!(store.create_collection("   ", "heart").is_err());
        assert!(store.create_collection("Nome", "star").is_err());
    }

    #[test]
    fn duplicate_names_get_unique_suffix() {
        let store = temp_collection_store("dup");
        store.create_collection("Favoritos", "heart").unwrap();
        let b = store.create_collection("Favoritos", "heart").unwrap();
        assert_eq!(b.name, "Favoritos (2)");
    }

    #[test]
    fn add_and_remove_project_updates_persistence() {
        let store = temp_collection_store("addremove");
        let c = store.create_collection("Entrevistas", "archive-box").unwrap();
        let ids = project_ids(&[("p1", "A"), ("p2", "B")]);

        let updated = store.add_project(&c.id, "p1", &ids).unwrap();
        assert_eq!(updated.project_ids, vec!["p1".to_string()]);

        // idempotente: adicionar de novo não duplica
        let again = store.add_project(&c.id, "p1", &ids).unwrap();
        assert_eq!(again.project_ids.len(), 1);

        let removed = store.remove_project(&c.id, "p1").unwrap();
        assert!(removed.project_ids.is_empty());

        let store2 = CollectionStore {
            path: store.path.clone(),
        };
        let list = store2.load().unwrap();
        assert!(list[0].project_ids.is_empty(), "remoção persistida");
    }

    #[test]
    fn add_unknown_project_or_collection_is_error() {
        let store = temp_collection_store("unknown");
        let c = store.create_collection("X", "heart").unwrap();
        let ids = project_ids(&[("p1", "A")]);
        assert!(store.add_project(&c.id, "fantasma", &ids).is_err());
        assert!(store.add_project("id-inexistente", "p1", &ids).is_err());
        assert!(store.remove_project("id-inexistente", "p1").is_err());
    }

    #[test]
    fn corrupt_collections_file_is_reported() {
        let store = temp_collection_store("corrupt");
        store.create_collection("ok", "heart").unwrap();
        fs::write(&store.path, "{ não é json").unwrap();
        let err = store.load().unwrap_err();
        assert!(err.contains("corrompido"), "erro explica a causa: {err}");
    }

    #[test]
    fn collections_do_not_touch_projects_file() {
        let base = std::env::temp_dir()
            .join(format!("cnp-03b-test-isolate-{}", uuid::Uuid::new_v4()));
        let projects = Store::open(&base).unwrap();
        let collections = CollectionStore::open(&base).unwrap();
        projects.create_project("Vídeo 1").unwrap();
        collections.create_collection("Coleção 1", "heart").unwrap();
        // projects.json permanece íntegro e independente
        let plist = projects.load().unwrap();
        assert_eq!(plist.len(), 1);
        assert_eq!(plist[0].name, "Vídeo 1");
    }
}
