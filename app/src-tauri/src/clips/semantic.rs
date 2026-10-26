use super::{
    evidence::{self, DraftAnalysis},
    text_engine::Engine,
    types::Clip,
};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::path::Path;

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

pub fn run(
    engine: &Engine,
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
    let data = serde_json::json!({"speech":segments.iter().map(|s|s.text.as_str()).collect::<Vec<_>>().join("\n"),"quotes":quotes.iter().enumerate().map(|(id,text)|serde_json::json!({"id":id,"text":text})).collect::<Vec<_>>()});
    let prompt = engine.prompt(include_str!("analysis-prompt.txt"), &data)?;
    if engine.count_tokens(scratch, &prompt, control)? > super::engine_tools::CONTEXT_TOKENS - 1528
    {
        return Err("A transcrição completa e o trecho excedem o contexto disponível para análise. Nenhum texto foi dividido ou truncado.".into());
    }
    let output = engine.generate(
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
    let mut analysis = draft.ground(&quotes, &text)?;
    super::editorial::enforce_ending(&mut analysis, &text);
    control.check()?;
    clip.score = analysis.score();
    clip.title = analysis.title.clone();
    // preserva a proveniência (alternativa/avaliação do intervalo) e
    // acrescenta os critérios — não substitui.
    let provenance: Vec<String> = clip
        .reasons
        .iter()
        .filter(|reason| {
            reason.to_lowercase().contains("proveniência")
                || reason.contains("Avaliação do intervalo")
                || reason.contains("Conteúdo promocional")
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
    // assinatura da transcrição que alimentou ESTA análise (atualização 19):
    // futuras edições de trecho são comparadas contra ela, por clipe.
    // A análise publicada agora é VÁLIDA para este texto (upd 20).
    clip.analysis_signature = Some(super::store::clip_signature(segments, clip.start, clip.end));
    clip.analysis_stale = None;
    Ok(())
}
