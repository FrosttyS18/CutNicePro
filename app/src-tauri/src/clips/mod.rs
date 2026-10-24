mod analysis_types;
pub mod borders;
pub mod commands;
mod content;
mod evidence;
mod generation;
pub mod multimodal;
#[cfg(test)]
mod pipeline_tests;
#[cfg(test)]
mod ranking;
mod scene_regions;
pub(crate) mod scenes;
mod selection;
mod semantic;
#[cfg(test)]
mod semantic_tests;
mod store;
mod text_engine;
pub mod tracking;
#[cfg(test)]
mod tracking_tests;
#[cfg(test)]
mod txt_export_tests;
pub(crate) mod types;

pub struct ClipJobs(pub std::sync::Arc<crate::transcription::TranscriptionJobs>);
impl Default for ClipJobs {
    fn default() -> Self {
        Self(std::sync::Arc::new(
            crate::transcription::TranscriptionJobs::default(),
        ))
    }
}
