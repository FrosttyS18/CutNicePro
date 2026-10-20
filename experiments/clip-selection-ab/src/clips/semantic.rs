use super::{
    evidence::{self, DraftAnalysis},
    text_engine,
    types::Clip,
};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::path::Path;

pub use text_engine::discover;

pub fn source(clip: &Clip, segments: &[Segment]) -> String {
    segments
        .iter()
        .filter(|s| s.start < clip.end && s.end > clip.start)
        .map(|s| {
            if (s.start < clip.start || s.end > clip.end) && !s.words.is_empty() {
                s.words
                    .iter()
                    .filter(|w| w.start < clip.end && w.end > clip.start)
                    .map(|w| w.text.trim())
                    .collect::<Vec<_>>()
                    .join(" ")
            } else {
                s.text.trim().into()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn run(
    base: &Path,
    scratch: &Path,
    clip: &mut Clip,
    segments: &[Segment],
    control: &ProcessControl,
) -> Result<(), String> {
    let text = source(clip, segments);
    if text.split_whitespace().count() < 6 || text.len() > 24000 {
        return Err(
            "O trecho não tem fala suficiente para análise. Escolha outro intervalo.".into(),
        );
    }
    let quotes = evidence::quotes(&text);
    let data = serde_json::json!({"quotes":quotes.iter().enumerate().map(|(id,text)|serde_json::json!({"id":id,"text":text})).collect::<Vec<_>>()});
    let prompt = text_engine::prompt(include_str!("analysis-prompt.txt"), &data)?;
    let output = text_engine::generate(
        base,
        scratch,
        "analysis",
        &prompt,
        &evidence::schema(quotes.len()),
        1400,
        control,
    )?;
    let draft = serde_json::Deserializer::from_str(output.trim())
        .into_iter::<DraftAnalysis>()
        .next()
        .ok_or("A análise não gerou uma resposta. Tente novamente.")?
        .map_err(|_| "Não foi possível concluir a análise do trecho. Tente novamente.")?;
    let analysis = draft.ground(&quotes, &text)?;
    control.check()?;
    clip.score = analysis.score();
    clip.title = analysis.title.clone();
    // preserva a proveniência (alternativa/avaliação do intervalo) e
    // acrescenta os critérios — não substitui.
    let provenance: Vec<String> = clip
        .reasons
        .iter()
        .filter(|reason| {
            reason.contains("proveniência") || reason.contains("Avaliação do intervalo")
        })
        .cloned()
        .collect();
    let criteria: Vec<String> = analysis
        .criteria
        .iter()
        .map(|item| item.explanation.clone())
        .collect();
    let mut merged = provenance;
    merged.extend(criteria);
    clip.reasons = merged;
    clip.analysis = Some(analysis);
    clip.analysis_error = None;
    Ok(())
}
