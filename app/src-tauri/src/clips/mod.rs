mod analysis_types;
mod assessment;
#[cfg(test)]
mod autoclip_runtime_tests;
pub mod borders;
pub mod commands;
mod content;
mod discovery_reply;
mod editorial;
mod editorial_repair;
mod engine_tools;
mod evidence;
mod face_framing;
mod generation;
#[cfg(test)]
mod incremental_runtime_tests;
mod novelty;
#[cfg(test)]
mod pipeline_tests;
#[cfg(test)]
mod qwen35_contract_tests;
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
#[cfg(test)]
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
