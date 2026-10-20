//! [EXPERIMENTO] Extensão da cópia fiel de `selection.rs` (HEAD d5a17ad).
//! `collect` reproduz exatamente o corpo de `select` (linhas 103-140 do
//! original — validação, janelas, chamadas LLM por janela, materialização),
//! diferindo APENAS por devolver o conjunto `all` de candidatos ANTES da
//! etapa final (linhas 141-153), que vive em `finalize::greedy` como cópia
//! 1:1. Nenhuma regra de decisão foi alterada nesta função.

use super::{
    selection,
    text_engine,
    types::{Clip, Options},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct Collected {
    pub media_id: String,
    pub duration: f64,
    pub options: OptionsOut,
    pub windows: Vec<(usize, usize)>,
    pub candidates_per_window: Vec<usize>,
    pub candidates: Vec<Clip>,
    pub elapsed_s: f64,
}

#[derive(Serialize, Deserialize)]
pub struct OptionsOut {
    pub min_seconds: f64,
    pub max_seconds: f64,
    pub count: usize,
    pub format: Option<String>,
}

pub fn collect(
    base: &Path,
    scratch: &Path,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<Collected, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    let started = std::time::Instant::now();
    let ranges = selection::windows(segments, options.max_seconds);
    let mut all: Vec<Clip> = Vec::new();
    let mut per_window: Vec<usize> = Vec::new();
    for (index, range) in ranges.iter().enumerate() {
        control.check()?;
        let ids = range.clone().collect::<Vec<_>>();
        let limit = (options.count * 2).min(12);
        let data = serde_json::json!({"minSeconds":options.min_seconds,"maxSeconds":options.max_seconds,"limit":limit,
            "speech":range.clone().map(|id|serde_json::json!([id,segments[id].start,segments[id].end,segments[id].text])).collect::<Vec<_>>()});
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["candidates"],"properties":{"candidates":{"type":"array","maxItems":limit,"items":{
            "type":"object","additionalProperties":false,"required":["firstId","lastId","score"],"properties":{
                "firstId":{"type":"integer","enum":ids},"lastId":{"type":"integer","enum":ids},"score":{"type":"integer","minimum":0,"maximum":100}}}}}});
        let prompt = text_engine::prompt(include_str!("selection-prompt.txt"), &data)?;
        let output = text_engine::generate(
            base,
            scratch,
            &format!("selection-{index}"),
            &prompt,
            &schema,
            1800,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<selection::Reply>()
            .next()
            .ok_or("Não foi possível selecionar os momentos. Tente novamente.")?
            .map_err(|_| "Não foi possível selecionar os momentos. Tente novamente.")?;
        let before = all.len();
        // [ATUALIZAÇÃO 3] o app substituiu materialize() por conform():
        // este coletor HISTÓRICO (rodada 1) agora descarta propostas não
        // conformes em vez de transformá-las — para efeito de compilação;
        // as rodadas novas usam build-v2.
        for candidate in reply.candidates.into_iter().take(limit) {
            if range.contains(&candidate.first_id) && range.contains(&candidate.last_id) {
                if let Ok(contender) =
                    selection::conform(candidate, segments, media, duration, options)
                {
                    all.push(contender.clip);
                }
            }
        }
        per_window.push(all.len() - before);
        progress(((index + 1) * 100 / ranges.len().max(1)) as u8);
    }
    Ok(Collected {
        media_id: media.to_string(),
        duration,
        options: OptionsOut {
            min_seconds: options.min_seconds,
            max_seconds: options.max_seconds,
            count: options.count,
            format: options.format.clone(),
        },
        windows: ranges.iter().map(|r| (r.start, r.end)).collect(),
        candidates_per_window: per_window,
        candidates: all,
        elapsed_s: started.elapsed().as_secs_f64(),
    })
}
