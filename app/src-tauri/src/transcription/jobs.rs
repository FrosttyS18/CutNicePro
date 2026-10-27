use super::{
    process::ProcessControl,
    types::{EditorTranscriptionJob, JobSnapshot},
};
use std::sync::{Arc, Mutex};

struct ActiveJob {
    snapshot: JobSnapshot,
    control: Arc<ProcessControl>,
    editor_media_id: Option<String>,
}

#[derive(Default)]
pub struct TranscriptionJobs {
    active: Mutex<Option<ActiveJob>>,
}

impl TranscriptionJobs {
    pub fn start(&self, job_id: String, project_id: String) -> Result<Arc<ProcessControl>, String> {
        self.start_operation(job_id, project_id, None)
    }
    pub fn start_operation(
        &self,
        job_id: String,
        project_id: String,
        operation: Option<&str>,
    ) -> Result<Arc<ProcessControl>, String> {
        self.start_scoped(job_id, project_id, operation, None)
    }
    pub fn start_editor(
        &self,
        job_id: String,
        project_id: String,
        media_id: String,
    ) -> Result<Arc<ProcessControl>, String> {
        self.start_scoped(
            job_id,
            project_id,
            Some("editor-transcription"),
            Some(media_id),
        )
    }
    fn start_scoped(
        &self,
        job_id: String,
        project_id: String,
        operation: Option<&str>,
        editor_media_id: Option<String>,
    ) -> Result<Arc<ProcessControl>, String> {
        uuid::Uuid::parse_str(&job_id).map_err(|_| "identificador de job inválido")?;
        let mut active = self.active.lock().map_err(|_| "fila indisponível")?;
        if active
            .as_ref()
            .is_some_and(|j| j.snapshot.state == "running")
        {
            return Err("Já existe uma transcrição em andamento. Aguarde ou cancele antes de iniciar outra.".into());
        }
        let control = Arc::new(ProcessControl::default());
        *active = Some(ActiveJob {
            control: control.clone(),
            editor_media_id,
            snapshot: JobSnapshot {
                job_id,
                project_id,
                state: "running".into(),
                stage: "extracting".into(),
                error: None,
                progress: 0,
                operation: operation.map(str::to_string),
            },
        });
        Ok(control)
    }
    pub fn snapshot(&self) -> Option<JobSnapshot> {
        self.active
            .lock()
            .ok()?
            .as_ref()
            .map(|j| j.snapshot.clone())
    }
    pub fn legacy_snapshot(&self) -> Option<JobSnapshot> {
        self.active
            .lock()
            .ok()?
            .as_ref()
            .filter(|job| job.editor_media_id.is_none())
            .map(|job| job.snapshot.clone())
    }
    pub fn editor_snapshot(
        &self,
        project: &str,
        media: Option<&str>,
    ) -> Option<EditorTranscriptionJob> {
        let active = self.active.lock().ok()?;
        let job = active
            .as_ref()
            .filter(|job| job.snapshot.project_id == project)?;
        let media_id = job
            .editor_media_id
            .as_ref()
            .filter(|id| media.is_none_or(|expected| *id == expected))?;
        Some(EditorTranscriptionJob {
            job: job.snapshot.clone(),
            media_id: media_id.clone(),
        })
    }
    pub fn edit<T>(&self, persist: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let active = self.active.lock().map_err(|_| "fila indisponível")?;
        if active
            .as_ref()
            .is_some_and(|j| j.snapshot.state == "running")
        {
            return Err("Aguarde a transcrição antes de salvar edições.".into());
        }
        persist()
    }
    pub fn stage(&self, id: &str, stage: &str) -> Option<JobSnapshot> {
        let mut active = self.active.lock().ok()?;
        let job = active
            .as_mut()
            .filter(|j| j.snapshot.job_id == id && j.snapshot.state == "running")?;
        job.control.check().ok()?;
        job.snapshot.stage = stage.into();
        Some(job.snapshot.clone())
    }
    pub fn progress(&self, id: &str, value: u8) -> Option<JobSnapshot> {
        let mut active = self.active.lock().ok()?;
        let job = active
            .as_mut()
            .filter(|j| j.snapshot.job_id == id && j.snapshot.state == "running")?;
        job.control.check().ok()?;
        let value = value.min(99);
        if value <= job.snapshot.progress {
            return None;
        }
        job.snapshot.progress = value;
        Some(job.snapshot.clone())
    }
    pub fn finish<T>(
        &self,
        id: &str,
        result: Result<T, String>,
        persist: impl FnOnce(&T) -> Result<(), String>,
    ) -> Result<T, String> {
        let mut active = self.active.lock().map_err(|_| "fila indisponível")?;
        let job = active
            .as_mut()
            .filter(|j| j.snapshot.job_id == id)
            .ok_or("job não encontrado")?;
        let outcome = job.control.check().and(result).and_then(|value| {
            persist(&value)?;
            Ok(value)
        });
        job.snapshot.state = match &outcome {
            Ok(_) => "completed",
            Err(_) if job.control.check().is_err() => "cancelled",
            Err(_) => "failed",
        }
        .into();
        job.snapshot.error = outcome.as_ref().err().cloned();
        if outcome.is_ok() {
            job.snapshot.progress = 100;
        }
        outcome
    }
    pub fn cancel(&self, id: Option<&str>) -> bool {
        if let Ok(mut active) = self.active.lock() {
            if let Some(job) = active.as_mut().filter(|j| {
                j.snapshot.state == "running" && id.is_none_or(|id| id == j.snapshot.job_id)
            }) {
                job.control.cancel();
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_jobs_are_scoped_by_project_and_media_and_hidden_from_legacy() {
        let jobs = TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start_editor(id.clone(), "project-a".into(), "media-a".into())
            .unwrap();
        assert!(jobs.legacy_snapshot().is_none());
        assert!(jobs.editor_snapshot("project-b", None).is_none());
        assert!(jobs.editor_snapshot("project-a", Some("media-b")).is_none());
        let snapshot = jobs.editor_snapshot("project-a", None).unwrap();
        assert_eq!(snapshot.media_id, "media-a");
        assert_eq!(snapshot.job.job_id, id);
        let json = serde_json::to_value(snapshot).unwrap();
        assert_eq!(json["projectId"], "project-a");
        assert_eq!(json["mediaId"], "media-a");
        assert_eq!(json["state"], "running");
        assert!(json.get("job").is_none());
        jobs.cancel(Some(&id));
    }
    #[test]
    fn editor_jobs_share_concurrency_cancellation_and_retry_with_legacy() {
        let jobs = TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start_editor(id.clone(), "project".into(), "media".into())
            .unwrap();
        assert!(jobs
            .start(uuid::Uuid::new_v4().to_string(), "other".into())
            .is_err());
        assert!(jobs
            .start_editor(
                uuid::Uuid::new_v4().to_string(),
                "project".into(),
                "other".into()
            )
            .is_err());
        assert!(jobs.cancel(Some(&id)));
        assert!(jobs
            .finish(&id, Ok(()), |_| panic!(
                "cancelled editor jobs cannot persist"
            ))
            .is_err());
        assert_eq!(
            jobs.editor_snapshot("project", None).unwrap().job.state,
            "cancelled"
        );
        let legacy = uuid::Uuid::new_v4().to_string();
        jobs.start(legacy.clone(), "project".into()).unwrap();
        assert!(jobs.editor_snapshot("project", None).is_none());
        assert_eq!(jobs.legacy_snapshot().unwrap().job_id, legacy);
        jobs.cancel(Some(&legacy));
    }
    #[test]
    fn serializes_jobs_and_cancel_preserves_previous_result() {
        let jobs = TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start(id.clone(), "project".into()).unwrap();
        assert!(jobs
            .start(uuid::Uuid::new_v4().to_string(), "other".into())
            .is_err());
        assert!(!jobs.cancel(Some("wrong")));
        assert!(jobs.cancel(Some(&id)));
        assert!(jobs
            .finish(&id, Ok(1), |_| panic!("cancelled job must not persist"))
            .is_err());
        assert_eq!(jobs.snapshot().unwrap().state, "cancelled");
        assert!(jobs
            .start(uuid::Uuid::new_v4().to_string(), "other".into())
            .is_ok());
    }
    #[test]
    fn progress_is_monotonic_and_only_success_can_publish_one_hundred() {
        let jobs = TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start(id.clone(), "p".into()).unwrap();
        assert_eq!(jobs.snapshot().unwrap().progress, 0);
        assert_eq!(jobs.progress(&id, 45).unwrap().progress, 45);
        assert!(jobs.progress(&id, 40).is_none());
        assert_eq!(jobs.progress(&id, 100).unwrap().progress, 99);
        jobs.finish(&id, Ok(()), |_| Ok(())).unwrap();
        assert_eq!(jobs.snapshot().unwrap().progress, 100);
        assert!(jobs.progress(&id, 80).is_none());
    }
    #[test]
    fn cancellation_prevents_late_progress_and_success() {
        let jobs = TranscriptionJobs::default();
        let id = uuid::Uuid::new_v4().to_string();
        jobs.start(id.clone(), "p".into()).unwrap();
        jobs.progress(&id, 60);
        jobs.cancel(Some(&id));
        assert!(jobs.progress(&id, 90).is_none());
        assert!(jobs
            .finish(&id, Ok(()), |_| panic!("cancelled job cannot persist"))
            .is_err());
        assert_eq!(jobs.snapshot().unwrap().progress, 60);
    }
}
