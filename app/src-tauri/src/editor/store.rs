use super::types::Composition;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

static EDITOR_GATE: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub document: Composition,
    pub manually_edited: bool,
    pub edited_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct CreatedClip {
    pub id: String,
    pub snapshot: Snapshot,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorProject {
    pub version: u8,
    pub project: Option<Snapshot>,
    pub clips: BTreeMap<String, Snapshot>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recovery {
    pub base_revision: u64,
    pub document: Composition,
    pub updated_at_ms: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub related: Vec<RecoveryClipDraft>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipDraft {
    pub clip_id: String,
    pub expected_revision: u64,
    pub document: Composition,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryClipDraft {
    pub clip_id: String,
    pub expected_revision: u64,
    pub document: Composition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_document: Option<Composition>,
}

#[derive(Serialize, Deserialize)]
pub struct BatchSaved {
    pub snapshot: Option<Snapshot>,
    pub related: BTreeMap<String, Snapshot>,
}

pub struct EditorStore {
    root: PathBuf,
}

pub(super) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn validate_target(project: &str, clip: Option<&str>) -> Result<(), String> {
    uuid::Uuid::parse_str(project).map_err(|_| "Identificador de projeto inválido")?;
    if clip.is_some_and(|value| {
        value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err("Identificador de clipe inválido".into());
    }
    Ok(())
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    crate::file_output::atomic_write(path, |file| {
        serde_json::to_writer(file, value).map_err(|error| error.to_string())
    })
}

fn validate_recovery(
    project: &str,
    clip: Option<&str>,
    related: &[RecoveryClipDraft],
) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for draft in related {
        validate_target(project, Some(&draft.clip_id))?;
        if clip == Some(draft.clip_id.as_str()) || !ids.insert(&draft.clip_id) {
            return Err("Alvo repetido na recuperação".into());
        }
        draft.document.validate()?;
        if let Some(base) = &draft.base_document {
            base.validate()?;
            if base.revision != draft.expected_revision {
                return Err("Base da recuperação incompatível".into());
            }
        }
    }
    Ok(())
}

impl EditorStore {
    pub(super) fn transaction<T>(
        &self,
        project: &str,
        action: impl FnOnce(&mut EditorProject) -> Result<T, String>,
    ) -> Result<T, String> {
        let _file_lock = self.project_lock(project)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        let mut state = self.load_inner(project)?;
        let result = action(&mut state)?;
        write_json(&self.root.join(format!("{project}.json")), &state)?;
        Ok(result)
    }

    pub fn save_batch(
        &self,
        project: &str,
        clip: Option<&str>,
        document: Composition,
        expected_revision: u64,
        related: Vec<ClipDraft>,
        active_changed: bool,
    ) -> Result<BatchSaved, String> {
        super::batch_store::save(
            self,
            project,
            clip,
            document,
            expected_revision,
            related,
            active_changed,
        )
    }
    fn project_lock(&self, project: &str) -> Result<fs::File, String> {
        validate_target(project, None)?;
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.root.join(format!("{project}.lock")))
            .map_err(|error| error.to_string())?;
        fs2::FileExt::lock_exclusive(&file).map_err(|error| error.to_string())?;
        Ok(file)
    }
    pub fn open(base: &Path) -> Result<Self, String> {
        let root = base.join("cutnicepro/editor");
        fs::create_dir_all(root.join("recovery")).map_err(|error| error.to_string())?;
        Ok(Self { root })
    }

    fn load_inner(&self, project: &str) -> Result<EditorProject, String> {
        validate_target(project, None)?;
        let path = self.root.join(format!("{project}.json"));
        if !path.exists() {
            return Ok(EditorProject {
                version: 1,
                ..Default::default()
            });
        }
        let state: EditorProject =
            serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
                .map_err(|error| format!("Não foi possível ler a edição salva: {error}"))?;
        if state.version != 1 {
            return Err("Versão da edição não suportada".into());
        }
        for snapshot in state.clips.values().chain(state.project.iter()) {
            snapshot.document.validate()?;
            if snapshot
                .origin
                .as_deref()
                .is_some_and(|origin| origin != "manual")
                || snapshot.origin.as_deref() == Some("manual")
                    && (snapshot
                        .title
                        .as_deref()
                        .is_none_or(|title| title.trim().is_empty() || title.chars().count() > 120)
                        || snapshot.created_at_ms.is_none_or(|created| created == 0))
                || snapshot
                    .review
                    .as_deref()
                    .is_some_and(|review| !["pending", "approved", "rejected"].contains(&review))
            {
                return Err("Metadados do clipe salvo inválidos".into());
            }
        }
        Ok(state)
    }

    pub fn load(&self, project: &str) -> Result<EditorProject, String> {
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        self.load_inner(project)
    }

    pub fn save(
        &self,
        project: &str,
        clip: Option<&str>,
        mut document: Composition,
        expected_revision: u64,
    ) -> Result<Snapshot, String> {
        validate_target(project, clip)?;
        document.validate()?;
        let _file_lock = self.project_lock(project)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        let mut state = self.load_inner(project)?;
        let previous = clip.and_then(|id| state.clips.get(id)).or_else(|| {
            if clip.is_none() {
                state.project.as_ref()
            } else {
                None
            }
        });
        let revision = previous.map(|entry| entry.document.revision).unwrap_or(0);
        if revision != expected_revision {
            return Err(
                "Esta edição foi atualizada em outra sessão. Reabra antes de salvar.".into(),
            );
        }
        if let Some(previous) = previous {
            let mut baseline = previous.document.clone();
            baseline.revision = 0;
            let mut candidate = document.clone();
            candidate.revision = 0;
            if serde_json::to_value(baseline).map_err(|error| error.to_string())?
                == serde_json::to_value(candidate).map_err(|error| error.to_string())?
            {
                return Ok(previous.clone());
            }
        }
        document.revision = revision.checked_add(1).ok_or("Revisão inválida")?;
        let snapshot = Snapshot {
            document,
            manually_edited: clip.is_some(),
            edited_at_ms: now(),
            origin: previous.and_then(|value| value.origin.clone()),
            title: previous.and_then(|value| value.title.clone()),
            created_at_ms: previous.and_then(|value| value.created_at_ms),
            review: previous.and_then(|value| value.review.clone()),
            deleted: previous.and_then(|value| value.deleted),
        };
        if let Some(id) = clip {
            state.clips.insert(id.to_string(), snapshot.clone());
        } else {
            state.project = Some(snapshot.clone());
        }
        write_json(&self.root.join(format!("{project}.json")), &state)?;
        Ok(snapshot)
    }

    pub fn create_clip(
        &self,
        project: &str,
        title: &str,
        mut document: Composition,
    ) -> Result<CreatedClip, String> {
        document.validate()?;
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 120 || document.items.is_empty() {
            return Err("Informe um nome e selecione uma montagem com conteúdo".into());
        }
        let _file_lock = self.project_lock(project)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        let mut state = self.load_inner(project)?;
        let id = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let created = now();
        document.revision = 1;
        let snapshot = Snapshot {
            document,
            manually_edited: false,
            edited_at_ms: created,
            origin: Some("manual".into()),
            title: Some(title.into()),
            created_at_ms: Some(created),
            review: Some("pending".into()),
            deleted: None,
        };
        state.clips.insert(id.clone(), snapshot.clone());
        write_json(&self.root.join(format!("{project}.json")), &state)?;
        Ok(CreatedClip { id, snapshot })
    }

    pub fn update_clip_metadata(
        &self,
        project: &str,
        clip: &str,
        review: Option<&str>,
        deleted: Option<bool>,
    ) -> Result<EditorProject, String> {
        validate_target(project, Some(clip))?;
        if review.is_some_and(|value| !["pending", "approved", "rejected"].contains(&value)) {
            return Err("Revisão de clipe inválida".into());
        }
        let _file_lock = self.project_lock(project)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        let mut state = self.load_inner(project)?;
        let snapshot = state
            .clips
            .get_mut(clip)
            .ok_or("Clipe salvo não encontrado")?;
        if let Some(review) = review {
            snapshot.review = Some(review.into());
        }
        if let Some(deleted) = deleted {
            snapshot.deleted = Some(deleted);
        }
        write_json(&self.root.join(format!("{project}.json")), &state)?;
        Ok(state)
    }

    pub fn remove_project(&self, project: &str) -> Result<(), String> {
        let _file_lock = self.project_lock(project)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        let mut paths = vec![self.root.join(format!("{project}.json"))];
        for entry in fs::read_dir(self.root.join("recovery")).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(suffix) = name
                .strip_prefix(&format!("{project}-"))
                .and_then(|value| value.strip_suffix(".json"))
            else {
                continue;
            };
            if suffix == "project"
                || suffix.len() == 64 && suffix.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                paths.push(entry.path());
            }
        }
        for path in paths {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!(
                        "Não foi possível remover a edição do projeto: {error}"
                    ))
                }
            }
        }
        Ok(())
    }

    fn recovery_path(&self, project: &str, clip: Option<&str>) -> Result<PathBuf, String> {
        validate_target(project, clip)?;
        Ok(self
            .root
            .join("recovery")
            .join(format!("{project}-{}.json", clip.unwrap_or("project"))))
    }

    pub fn save_recovery(
        &self,
        project: &str,
        clip: Option<&str>,
        document: Composition,
        base_revision: u64,
    ) -> Result<(), String> {
        self.save_recovery_batch(project, clip, document, base_revision, Vec::new())
    }

    pub fn save_recovery_batch(
        &self,
        project: &str,
        clip: Option<&str>,
        document: Composition,
        base_revision: u64,
        related: Vec<RecoveryClipDraft>,
    ) -> Result<(), String> {
        let path = self.recovery_path(project, clip)?;
        document.validate()?;
        validate_recovery(project, clip, &related)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        write_json(
            &path,
            &Recovery {
                base_revision,
                document,
                updated_at_ms: now(),
                related,
            },
        )
    }

    pub fn recovery(&self, project: &str, clip: Option<&str>) -> Result<Option<Recovery>, String> {
        let path = self.recovery_path(project, clip)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        if !path.exists() {
            return Ok(None);
        }
        let recovery: Recovery =
            serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        recovery.document.validate()?;
        validate_recovery(project, clip, &recovery.related)?;
        Ok(Some(recovery))
    }

    pub fn discard_recovery(&self, project: &str, clip: Option<&str>) -> Result<(), String> {
        let path = self.recovery_path(project, clip)?;
        let _guard = EDITOR_GATE
            .lock()
            .map_err(|_| "Armazenamento do editor indisponível")?;
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}
