mod ass;
pub mod commands;
mod encoder;
// pub(crate): o laboratório da atualização 19 (clips/pipeline_tests)
// verifica exportação de clipe da biblioteca cumulativa pelo pipeline real
pub(crate) mod pipeline;
pub(crate) mod scratch;
pub(crate) mod settings;

mod fill_matrix;
#[cfg(test)]
mod integration;
#[cfg(test)]
mod tests;
