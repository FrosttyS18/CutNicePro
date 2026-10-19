pub mod commands;
mod ranking;
mod content;
mod analysis_types;
mod semantic;
#[cfg(test)]
mod semantic_tests;
pub(crate) mod scenes;
mod store;
pub(crate) mod types;

pub struct ClipJobs(pub std::sync::Arc<crate::transcription::TranscriptionJobs>);
impl Default for ClipJobs {
    fn default() -> Self {
        Self(std::sync::Arc::new(
            crate::transcription::TranscriptionJobs::default(),
        ))
    }
}
