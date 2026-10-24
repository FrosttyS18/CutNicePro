use super::{
    text_engine::Engine,
    types::{Clip, Options, Quality, Review},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::Deserialize;
use std::{ops::Range, path::Path};

pub fn windows(segments: &[Segment], overlap: f64) -> Vec<Range<usize>> {
    let mut result = Vec::new();
    let mut start = 0;
    while start < segments.len() {
        let mut end = start;
        let mut chars = 0;
        while end < segments.len()
            && (end == start
                || (chars + segments[end].text.len() + 40 < 18000
                    && segments[end].end - segments[start].start <= 600.0))
        {
            chars += segments[end].text.len() + 40;
            end += 1;
        }
        result.push(start..end);
        if end == segments.len() {
            break;
        }
        let span = segments[end - 1].end - segments[start].start;
        let boundary = segments[end - 1].end - overlap.min(span / 2.0);
        start = (start + 1..end)
            .find(|&i| segments[i].start >= boundary)
            .unwrap_or(end);
    }
    result
}

/// Orçamento de contexto do modo experimental (atualização 7): 4 tokens
/// reservados pelo runtime + reserva de resposta + folga — o prompt final
/// (template incluído) de cada janela tem que caber nesse resto.
const GEMMA_CTX: usize = 8192;
const GEMMA_RESERVED: usize = 4 + 2000 + 120;
const GEMMA_WINDOW_SPAN: f64 = 600.0;

/// Dados enviados ao modelo para uma janela — usados TANTO para medir tokens
/// (orçamento) quanto para a chamada real: o que foi medido é o que foi
/// enviado. IDs GLOBAIS (o modelo referencia a transcrição inteira).
fn window_data(
    segments: &[Segment],
    range: &Range<usize>,
    options: &Options,
    limit: usize,
) -> serde_json::Value {
    serde_json::json!({
        "minSeconds": options.min_seconds,
        "maxSeconds": options.max_seconds,
        "limit": limit,
        "speech": range.clone().map(|id| serde_json::json!([
            id, segments[id].start, segments[id].end, segments[id].text
        ])).collect::<Vec<_>>(),
    })
}

/// Janelas com ORÇAMENTO REAL DE TOKENS (modo experimental): calibra a razão
/// caracteres/token com uma medição integral, planeja por estimativa e
/// VERIFICA cada janela com o tokenizador exato; janela que não cabe é
/// subdividida no meio (registrado); nunca há truncagem silenciosa e lacunas
/// de cobertura são impossíveis por construção (próxima janela começa antes
/// do fim da anterior). `tokenize` injetável para testes sem inferência.
pub(crate) fn windows_budgeted(
    segments: &[Segment],
    options: &Options,
    limit: usize,
    engine: &Engine,
    system: &str,
    tokenize: &mut dyn FnMut(&str) -> Result<usize, String>,
) -> Result<Vec<Range<usize>>, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut cache: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();
    let mut exact = |text: &str| -> Result<usize, String> {
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        let key = hasher.finish();
        if let Some(known) = cache.get(&key) {
            return Ok(*known);
        }
        let count = tokenize(text)?;
        cache.insert(key, count);
        Ok(count)
    };
    let budget = GEMMA_CTX.saturating_sub(GEMMA_RESERVED);
    let prompt_of = |range: &Range<usize>| -> Result<String, String> {
        engine.prompt(system, &window_data(segments, range, options, limit))
    };
    let full = prompt_of(&(0..segments.len()))?;
    let full_tokens = exact(&full)?;
    if full_tokens <= budget {
        // Janela única deliberada: a transcrição inteira cabe no orçamento.
        #[allow(clippy::single_range_in_vec_init)]
        return Ok(vec![0..segments.len()]);
    }
    // Estimativa O(1) por janela: peso proporcional de caracteres + overhead
    // fixo do template/JSON medido no prompt completo. Serve só para PLANEJAR;
    // cada janela é verificada com o tokenizador exato antes de usar.
    let seg_chars: Vec<usize> = segments
        .iter()
        .map(|s| s.text.chars().count() + 40)
        .collect();
    let total_chars: usize = seg_chars.iter().sum();
    let overhead = full.chars().count().saturating_sub(total_chars);
    let chars_per_token = full_tokens as f64 / full.chars().count().max(1) as f64;
    let mut prefix = vec![0usize; seg_chars.len() + 1];
    for (i, chars) in seg_chars.iter().enumerate() {
        prefix[i + 1] = prefix[i] + chars;
    }
    let estimate = |range: &Range<usize>| -> usize {
        ((prefix[range.end] - prefix[range.start] + overhead) as f64 * chars_per_token) as usize
    };
    let mut planned: Vec<Range<usize>> = Vec::new();
    let mut start = 0;
    while start < segments.len() {
        let mut end = start;
        while end < segments.len()
            && (end == start
                || (estimate(&(start..end + 1)) <= budget
                    && segments[end].end - segments[start].start <= GEMMA_WINDOW_SPAN))
        {
            end += 1;
        }
        planned.push(start..end);
        if end >= segments.len() {
            break;
        }
        let span = segments[end - 1].end - segments[start].start;
        let boundary = segments[end - 1].end - options.max_seconds.min(span / 2.0);
        start = (start + 1..end)
            .find(|&i| segments[i].start >= boundary)
            .unwrap_or(end);
    }
    // verificação exata + subdivisão registrada (sem truncagem)
    let mut verified: Vec<Range<usize>> = Vec::new();
    let mut queue: Vec<(Range<usize>, usize)> = planned.into_iter().map(|r| (r, 0)).collect();
    while let Some((range, depth)) = queue.pop() {
        let prompt = prompt_of(&range)?;
        let tokens = exact(&prompt)?;
        if tokens <= budget {
            verified.push(range);
            continue;
        }
        if depth >= 4 || range.len() <= 1 {
            return Err(
                "Não foi possível dividir a transcrição em janelas que caibam no motor experimental. Gere com a análise padrão.".into(),
            );
        }
        let mid = range.start + range.len() / 2;
        eprintln!(
            "[clips] janela {}..{} com {tokens} tokens excede o orçamento {budget}; subdividindo",
            range.start, range.end
        );
        // A metade de trás RECUA para manter sobreposição na costura: uma
        // história que atravessa o ponto de corte continua cabendo inteira
        // em pelo menos uma das metades (mesma garantia das fronteiras
        // entre janelas planejadas).
        let span = segments[range.end - 1].end - segments[range.start].start;
        let overlap = options.max_seconds.min(span / 4.0);
        let seam = segments[mid].start - overlap;
        let back_start = (range.start..=mid)
            .find(|&i| segments[i].start >= seam)
            .unwrap_or(mid);
        queue.push((back_start..range.end, depth + 1));
        queue.push((range.start..mid, depth + 1));
    }
    verified.sort_by_key(|r| r.start);
    Ok(verified)
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Candidate {
    pub(crate) first_id: usize,
    pub(crate) last_id: usize,
    pub(crate) score: u8,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Reply {
    pub(crate) candidates: Vec<Candidate>,
}

/// Proveniência de um candidato construído: `Proposal` carrega nota VÁLIDA
/// (o modelo avaliou exatamente o intervalo que propôs); `Alternative` é
/// um intervalo válido derivado de proposta fora da faixa — a nota
/// original fica registrada como proveniência e NUNCA disputa a seleção.
pub(crate) enum Provenance {
    Proposal,
    Alternative {
        original: (f64, f64),
        policy: &'static str,
    },
}
pub(crate) struct Contender {
    pub clip: Clip,
    pub valid_score: Option<u8>,
    pub provenance: Provenance,
    pub nature: Option<Nature>,
    pub advertising: bool,
}

fn clip_for(media: &str, start: f64, end: f64, score: u8, format: Option<&str>) -> Clip {
    Clip {
        id: super::types::identity(media, start, end, format),
        fit: None,
        start,
        end,
        title: format!(
            "Trecho {:02}:{:02}",
            (start / 60.0) as u64,
            (start as u64) % 60
        ),
        score,
        reasons: Vec::new(),
        review: Review::Pending,
        format: format.map(str::to_string),
        analysis: None,
        analysis_error: None,
        analysis_signature: None,
        analysis_stale: None,
        multimodal: None,
        face_framing: None,
        created_at_ms: None,
        deleted: None,
        engine: None,
    }
}

/// Constrói um candidato somente quando a proposta é válida como veio: o
/// fim é o fim natural da última fala proposta (limitado à duração da
/// mídia) e a duração cabe em [min, max]. Nesse caso a nota da proposta é
/// uma avaliação vinculada ao intervalo efetivo.
pub(crate) fn conform(
    candidate: Candidate,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
) -> Result<Contender, Candidate> {
    if candidate.first_id > candidate.last_id || candidate.score > 100 {
        return Err(candidate);
    }
    let first = match segments.get(candidate.first_id) {
        Some(value) => value,
        None => return Err(candidate),
    };
    let last = match segments.get(candidate.last_id) {
        Some(value) => value,
        None => return Err(candidate),
    };
    let end = last.end.min(duration);
    let span = end - first.start;
    if span < options.min_seconds || span > options.max_seconds {
        return Err(candidate);
    }
    let clip = clip_for(
        media,
        first.start,
        end,
        candidate.score,
        options.format.as_deref(),
    );
    Ok(Contender {
        clip,
        valid_score: Some(candidate.score),
        provenance: Provenance::Proposal,
        nature: None,
        advertising: false,
    })
}

/// Alternativas válidas para uma proposta fora da faixa. Ajuste TEMPORAL,
/// não reparo narrativo: preservar o fim ou o começo não comprova contexto
/// ou encerramento — as alternativas competem somente com avaliação
/// própria obtida ANTES da seleção definitiva. Políticas para propostas
/// longas: "início avançado" (preserva o desfecho) e "fim recuado"
/// (preserva a abertura); para curtas: "fim estendido" e "início recuado".
/// Nenhum limite de duração é alterado; nada deste podcast na lógica.
pub(crate) fn repair_alternatives(
    candidate: Candidate,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
) -> Vec<Contender> {
    let mut result = Vec::new();
    if candidate.first_id > candidate.last_id || candidate.score > 100 {
        return result;
    }
    let (Some(first), Some(last)) = (
        segments.get(candidate.first_id),
        segments.get(candidate.last_id),
    ) else {
        return result;
    };
    let natural_end = last.end.min(duration);
    let span = natural_end - first.start;
    let alternative = |start: f64, end: f64, policy: &'static str, result: &mut Vec<Contender>| {
        let final_span = end - start;
        if final_span < options.min_seconds || final_span > options.max_seconds {
            return;
        }
        let mut clip = clip_for(
            media,
            start,
            end,
            candidate.score,
            options.format.as_deref(),
        );
        clip.reasons.push(format!(
            "alternativa '{policy}' de [{:.1}s, {:.1}s]: proposta original fora da faixa; a nota {} é proveniência, não avaliação deste intervalo",
            first.start, natural_end, candidate.score
        ));
        result.push(Contender {
            clip,
            valid_score: None,
            provenance: Provenance::Alternative {
                original: (first.start, natural_end),
                policy,
            },
            nature: None,
            advertising: false,
        });
    };
    if span > options.max_seconds {
        let floor = natural_end - options.max_seconds;
        let ceiling = natural_end - options.min_seconds;
        if let Some(new_first) = segments[..=candidate.last_id]
            .iter()
            .find(|s| s.start >= floor && s.start <= ceiling)
        {
            alternative(new_first.start, natural_end, "início avançado", &mut result);
        }
        if let Some(new_end) = segments[candidate.first_id..]
            .iter()
            .rev()
            .map(|s| s.end.min(duration))
            .find(|end| *end - first.start <= options.max_seconds)
        {
            if new_end - first.start >= options.min_seconds {
                alternative(first.start, new_end, "fim recuado", &mut result);
            }
        }
    } else if span < options.min_seconds {
        if let Some(new_end) = segments[candidate.first_id..]
            .iter()
            .map(|s| s.end.min(duration))
            .find(|end| *end - first.start >= options.min_seconds)
        {
            if new_end - first.start <= options.max_seconds {
                alternative(first.start, new_end, "fim estendido", &mut result);
            }
        }
        let floor = natural_end - options.max_seconds;
        if let Some(new_first) = segments[..=candidate.last_id]
            .iter()
            .rev()
            .find(|s| s.start >= floor && natural_end - s.start >= options.min_seconds)
        {
            alternative(new_first.start, natural_end, "início recuado", &mut result);
        }
    }
    result
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Evaluation {
    pub(crate) id: String,
    pub(crate) score: u8,
    pub(crate) reason: String,
    /// Natureza do conteúdo — identificada ANTES de julgar o fechamento
    /// (humor não exige resolução de problema; demonstração é julgada pelo
    /// que a fala referencia da imagem presente no próprio clipe).
    #[serde(default)]
    pub(crate) nature: Nature,
    /// Publicidade reconhecida (leitura de patrocínio, cupom, CTA de marca).
    #[serde(default)]
    pub(crate) advertising: bool,
    pub(crate) standalone: bool,
    pub(crate) complete: bool,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Nature {
    #[default]
    Relato,
    Humor,
    Explicacao,
    Opiniao,
    Demonstracao,
}
impl Nature {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Nature::Relato => "relato",
            Nature::Humor => "humor/reação",
            Nature::Explicacao => "explicação",
            Nature::Opiniao => "opinião",
            Nature::Demonstracao => "demonstração",
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EvaluationReply {
    pub(crate) items: Vec<Evaluation>,
}

#[cfg(test)]
mod editorial_contract_tests {
    use super::Evaluation;

    #[test]
    fn new_evaluations_require_explicit_context_and_completion_checks() {
        let old = serde_json::json!({"id":"E1","score":95,"reason":"Boa explicação", "nature":"explicacao","advertising":false});
        assert!(serde_json::from_value::<Evaluation>(old).is_err());
    }
}

/// Avaliação em LOTE dos candidatos pendentes: conteúdo integral, sem nota
/// antiga na entrada, IDs estáveis E1.., contexto externo separado. Uma
/// tentativa; falha deixa os pendentes fora da disputa com registro —
/// nunca nota zero, nunca nota antiga restaurada silenciosamente.
pub(crate) fn evaluate_batch_with(
    engine: &Engine,
    scratch: &Path,
    pending: &[Clip],
    segments: &[Segment],
    control: &ProcessControl,
) -> Result<Vec<Evaluation>, String> {
    // LOTES delimitados (até 8 por chamada): evita perder TODAS as
    // avaliações quando o teto de saída trunca uma resposta única com
    // muitos candidatos; ids com offset (E{base+n}) preservam o vínculo
    // posicional com o `pending` completo usado por resolve().
    let mut merged: Vec<Evaluation> = Vec::new();
    for (chunk_index, chunk) in pending.chunks(8).enumerate() {
        let offset = chunk_index * 8;
        let labels: Vec<String> = (1..=chunk.len())
            .map(|i| format!("E{}", offset + i))
            .collect();
        let items: Vec<serde_json::Value> = chunk
            .iter()
            .enumerate()
            .map(|(i, clip)| {
                let text = super::semantic::source(clip, segments);
                let before = super::semantic::source(
                    &Clip {
                        start: (clip.start - 30.0).max(0.0),
                        end: clip.start,
                        ..clip.clone()
                    },
                    segments,
                );
                let after = super::semantic::source(
                    &Clip {
                        start: clip.end,
                        end: clip.end + 30.0,
                        ..clip.clone()
                    },
                    segments,
                );
                serde_json::json!({
                    "id": labels[i],
                    "start": (clip.start * 1000.0).round() / 1000.0,
                    "end": (clip.end * 1000.0).round() / 1000.0,
                    "text": text,
                    "contextBefore": before,
                    "contextAfter": after,
                })
            })
            .collect();
        let data = serde_json::json!({"candidates": items});
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["items"],"properties":{"items":{"type":"array","maxItems":chunk.len(),"items":{
            "type":"object","additionalProperties":false,"required":["id","score","reason","nature","advertising","standalone","complete"],"properties":{
                "id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"},
                "nature":{"type":"string","enum":["relato","humor","explicacao","opiniao","demonstracao"]},
                "advertising":{"type":"boolean"},"standalone":{"type":"boolean"},"complete":{"type":"boolean"}}}}}});
        let prompt = engine.prompt(include_str!("evaluate-prompt.txt"), &data)?;
        let output = engine.generate(
            scratch,
            &format!("evaluate-{chunk_index}"),
            &prompt,
            &schema,
            2400,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<EvaluationReply>()
            .next()
            .ok_or("Não foi possível avaliar os trechos ajustados. Tente novamente.")?
            .map_err(|_| "Não foi possível avaliar os trechos ajustados. Tente novamente.")?;
        merged.extend(reply.items);
    }
    Ok(merged)
}

/// Finalização da seleção — weighted interval scheduling. OBJETIVO
/// MATEMÁTICO: entre clipes não sobrepostos, até `count` (teto), maximizar
/// lexicograficamente (soma das notas VÁLIDAS, cardinalidade, -soma dos
/// inícios). Sem nenhuma poda prévia (contraprovas no experimento).
/// Célula da DP: (soma das notas, cardinalidade, -soma dos inícios, caminho).
type DpCell = (i64, i64, f64, Vec<usize>);

fn finalize_weighted(sorted: &[Clip], count: usize) -> Vec<Clip> {
    let n = sorted.len();
    if n == 0 {
        return Vec::new();
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        sorted[a]
            .end
            .total_cmp(&sorted[b].end)
            .then(sorted[a].start.total_cmp(&sorted[b].start))
    });
    let mut best: Vec<Vec<Option<DpCell>>> = vec![vec![None; count + 1]; n + 1];
    best[0][0] = Some((0, 0, 0.0, Vec::new()));
    for i in 1..=n {
        let idx = order[i - 1];
        let mut prefix = 0usize;
        while prefix < i - 1 && sorted[order[prefix]].end <= sorted[idx].start {
            prefix += 1;
        }
        for k in 0..=count {
            let mut current = best[i - 1][k].clone();
            if k >= 1 {
                if let Some((sum, len, neg, path)) = &best[prefix][k - 1] {
                    let mut new_path = path.clone();
                    new_path.push(idx);
                    let next = (
                        sum + i64::from(sorted[idx].score),
                        *len + 1,
                        neg - sorted[idx].start,
                        new_path,
                    );
                    let replace = current.as_ref().is_none_or(|(s, l, ng, _)| {
                        next.0 > *s
                            || (next.0 == *s && next.1 > *l)
                            || (next.0 == *s && next.1 == *l && next.2 > *ng)
                    });
                    if replace {
                        current = Some(next);
                    }
                }
            }
            best[i][k] = current;
        }
    }
    let mut winner: Option<(usize, DpCell)> = None;
    for (k, slot) in best[n].iter().enumerate() {
        if let Some(cell) = slot.clone() {
            let replace = match &winner {
                None => true,
                Some((wk, (ws, _wl, wng, _))) => {
                    cell.0 > *ws
                        || (cell.0 == *ws && k > *wk)
                        || (cell.0 == *ws && k == *wk && cell.2 > *wng)
                }
            };
            if replace {
                winner = Some((k, cell));
            }
        }
    }
    let mut chosen: Vec<Clip> = Vec::new();
    if let Some((_, (_, _, _, path))) = winner {
        let keep: std::collections::HashSet<usize> = path.iter().copied().collect();
        chosen = sorted
            .iter()
            .enumerate()
            .filter(|(i, _)| keep.contains(i))
            .map(|(_, clip)| clip.clone())
            .collect();
    }
    chosen
}

/// Fluxo pós-janelas, executável sem LLM (teste de fluxo completo):
/// propostas por janela -> construção (conform/alternativas) -> AVALIAÇÃO
/// -> seleção definitiva (DP sem poda, apenas notas válidas).
pub type EvaluateFn<'a> = dyn Fn(&[Clip], &[Segment]) -> Result<Vec<Evaluation>, String> + 'a;
pub type Evaluate<'a> = &'a EvaluateFn<'a>;

pub(crate) fn resolve(
    proposals: &[(std::ops::Range<usize>, Vec<Candidate>)],
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    evaluate: Evaluate<'_>,
) -> Result<Vec<Clip>, String> {
    let mut contenders: Vec<Contender> = Vec::new();
    for (range, candidates) in proposals {
        let mut invalid = 0usize;
        let mut alternatives = 0usize;
        for candidate in candidates.clone() {
            if !range.contains(&candidate.first_id) || !range.contains(&candidate.last_id) {
                continue;
            }
            match conform(candidate.clone(), segments, media, duration, options) {
                Ok(contender) => contenders.push(contender),
                Err(rejected) => {
                    invalid += 1;
                    let mut built =
                        repair_alternatives(rejected, segments, media, duration, options);
                    alternatives += built.len();
                    contenders.append(&mut built);
                }
            }
        }
        eprintln!(
            "[clips] propostas fora da faixa: {invalid}; alternativas geradas: {alternatives}"
        );
    }
    // TODOS os candidatos disputam com avaliação própria do intervalo
    // (bench 2026-10-20: propostas diretas entravam com a nota do modelo,
    // sem natureza/publicidade — o comercial da Logitech contornava a
    // política). A nota de proposta vira PROVENIÊNCIA registrada; a
    // avaliação em lote cobre TODO o conjunto (E{n} na ordem dos
    // contenders, sem filtro por valid_score).
    let pending: Vec<Clip> = contenders.iter().map(|c| c.clip.clone()).collect();
    // VÍNCULO IMUTÁVEL: E{n} aponta para o n-ésimo PENDENTE na ordem em
    // que o lote foi montado (numeração de evaluate_batch). O índice
    // original em `contenders` é congelado ANTES de qualquer aplicação —
    // notas aplicadas não podem deslocar os alvos (defeito bc8a198: o
    // filtro dinâmico por valid_score levava E2+ ao candidato errado).
    let slots: Vec<usize> = (0..contenders.len()).collect();
    let mut evaluated = 0usize;
    let mut unevaluated = 0usize;
    if !pending.is_empty() {
        match evaluate(&pending, segments) {
            Ok(scores) => {
                for judgment in scores {
                    let parsed = judgment
                        .id
                        .strip_prefix('E')
                        .and_then(|n| n.parse::<usize>().ok());
                    let Some(position) = parsed.and_then(|n| n.checked_sub(1)) else {
                        continue; // id desconhecido/malformado
                    };
                    let Some(&slot) = slots.get(position) else {
                        continue; // fora do lote enviado
                    };
                    if contenders[slot].nature.is_some() {
                        continue; // id repetido: o primeiro aplica
                    }
                    let contender = &mut contenders[slot];
                    if contender.valid_score.is_some() {
                        // proposta direta: a nota do modelo é proveniência
                        contender.clip.reasons.push(format!(
                            "Proveniência: nota de proposta {}",
                            contender.clip.score
                        ));
                    }
                    let ad = if judgment.advertising {
                        "publicidade, "
                    } else {
                        ""
                    };
                    contender.clip.reasons.push(format!(
                        "Avaliação do intervalo efetivo ({ad}{}): {}",
                        judgment.nature.label(),
                        judgment.reason
                    ));
                    contender.clip.score = judgment.score;
                    contender.valid_score =
                        (judgment.standalone && judgment.complete).then_some(judgment.score);
                    if !judgment.standalone || !judgment.complete {
                        eprintln!(
                            "[clips] {} recusado: abertura autônoma={}, ideia completa={}",
                            judgment.id, judgment.standalone, judgment.complete
                        );
                    }
                    contender.nature = Some(judgment.nature);
                    contender.advertising = judgment.advertising;
                    evaluated += 1;
                }
                unevaluated = pending.len() - evaluated;
            }
            Err(error) => {
                eprintln!("[clips] avaliação das alternativas FALHOU: {error}");
                unevaluated = pending.len();
            }
        }
    }
    if unevaluated > 0 {
        eprintln!(
            "[clips] {unevaluated} alternativas sem avaliação válida ficaram fora da disputa"
        );
    }
    let mut dispute: Vec<Clip> = Vec::new();
    let mut below_floor = 0usize;
    let mut excluded_ads = 0usize;
    let mut unevaluated_direct = 0usize;
    for contender in contenders {
        // Bench-11: sem avaliação (nature) o candidato NÃO disputa —
        // ausência de classificação não vale como editorial/publicidade.
        if contender.nature.is_none() {
            unevaluated_direct += 1;
            continue;
        }
        let Some(score) = contender.valid_score else {
            continue;
        };
        if options.automatic {
            // Política EXPLÍCITA do automático (bench 2026-10-20, revisada):
            // publicidade NÃO é excluída — recebe prioridade secundária
            // (empurrada para o fim da disputa) e marcação visível; abaixo
            // do piso editorial fica fora, com registro. Personalizado
            // mantém tudo o que o usuário pediu, com a marcação no motivo.
            if contender.advertising {
                excluded_ads += 1; // conta para o log; não exclui
            }
            if score < super::types::AUTOMATIC_RELEVANCE_FLOOR {
                below_floor += 1;
                continue;
            }
        }
        let mut clip = contender.clip;
        clip.score = score;
        if let Provenance::Alternative { original, policy } = &contender.provenance {
            clip.reasons.push(format!(
                "Rascunho de alternativa '{policy}' sobre [{:.1}s, {:.1}s]",
                original.0, original.1
            ));
        }
        if contender.advertising {
            clip.reasons
                .push("Conteúdo promocional: prioridade secundária".into());
        }
        dispute.push(clip);
    }
    if unevaluated_direct > 0 {
        eprintln!(
            "[clips] {unevaluated_direct} candidatos sem avaliação válida ficaram fora da disputa"
        );
    }
    if options.automatic && (below_floor > 0 || excluded_ads > 0) {
        // atualização 16: frase neutra — o desfecho real da publicidade é
        // reportado pelo log de resultado, após a seleção
        eprintln!(
            "[clips] automático: {below_floor} candidatos abaixo do piso editorial ({}); {excluded_ads} candidatos de publicidade no lote (política: prioridade secundária)",
            super::types::AUTOMATIC_RELEVANCE_FLOOR
        );
    }
    if dispute.is_empty() {
        return Err(
            "Não foi possível avaliar os trechos propostos nesta duração. Tente novamente.".into(),
        );
    }
    // Publicidade depois dos destaques editoriais: a DP maximize a soma
    // sobre os NÃO promocionais primeiro e só preenche sobras com
    // promocionais marcados (prioridade secundária, sem exclusão).
    let mut editorial: Vec<Clip> = Vec::new();
    let mut promotional: Vec<Clip> = Vec::new();
    for clip in dispute {
        if clip
            .reasons
            .iter()
            .any(|r| r.contains("Conteúdo promocional"))
        {
            promotional.push(clip);
        } else {
            editorial.push(clip);
        }
    }
    editorial.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    promotional.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let budget = options.count;
    let mut selected = finalize_weighted(&editorial, budget);
    // Atualização 16: promocionais só podem ocupar intervalos LIVRES. A DP
    // independente anterior ignorava os cortes editoriais já fixados e
    // produzia sobreposição editorial×promocional (reprovação comprovada).
    // Editorial tem prioridade: promocional conflitante fica fora, com
    // registro — os demais disputam as vagas restantes pela DP normal.
    let ads_no_lote = promotional.len();
    let mut ads_conflito = 0usize;
    if selected.len() < budget && !promotional.is_empty() {
        promotional.retain(|ad| {
            let conflita = selected
                .iter()
                .any(|fixado| ad.start < fixado.end && fixado.start < ad.end);
            if conflita {
                ads_conflito += 1;
            }
            !conflita
        });
        let rest = finalize_weighted(&promotional, budget - selected.len());
        selected.extend(rest);
    }
    let promocionais = selected
        .iter()
        .filter(|c| c.reasons.iter().any(|r| r.contains("Conteúdo promocional")))
        .count();
    let editoriais = selected.len() - promocionais;
    if options.automatic {
        // log honesto: descreve exatamente o resultado (atualização 16) —
        // substitui a mensagem antiga que afirmava que publicidade "ficou
        // fora" mesmo quando ela entrava como prioridade secundária
        let motivo_fora = if ads_conflito > 0 {
            format!("{ads_conflito} por conflito temporal com cortes já escolhidos")
        } else if selected.len() >= budget && ads_no_lote > promocionais {
            "orçamento esgotado pelos editoriais".to_string()
        } else {
            "sem vagas restantes".to_string()
        };
        eprintln!(
            "[clips] automático: {editoriais} editoriais e {promocionais} promocionais nas sugestões; \
             {below_floor} descartados pelo piso editorial ({}); {} promocionais de fora ({motivo_fora})",
            super::types::AUTOMATIC_RELEVANCE_FLOOR,
            ads_no_lote - promocionais,
        );
    }
    if selected.is_empty() {
        return Err("Não encontramos trechos completos nesta duração. Aumente a duração dos cortes e tente novamente.".into());
    }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speech_from(length: usize) -> Vec<Segment> {
        (0..length)
            .map(|id| Segment {
                id: id.to_string(),
                start: id as f64 * 4.0,
                end: id as f64 * 4.0 + 3.9,
                text: "Uma conversa com conteúdo durante todo o vídeo.".into(),
                words: vec![],
            })
            .collect()
    }

    fn judgment(id: &str, score: u8, reason: &str) -> Evaluation {
        Evaluation {
            id: id.into(),
            score,
            reason: reason.into(),
            nature: Nature::Relato,
            advertising: false,
            standalone: true,
            complete: true,
        }
    }

    fn options(count: usize, min: f64, max: f64) -> Options {
        Options {
            min_seconds: min,
            max_seconds: max,
            count,
            format: Some("9:16".into()),
            fit: None,
            quality: None,
            automatic: false,
        }
    }

    fn candidate(first: usize, last: usize, score: u8) -> Candidate {
        Candidate {
            first_id: first,
            last_id: last,
            score,
        }
    }

    #[test]
    fn incomplete_or_context_dependent_candidates_cannot_win_with_high_scores() {
        let segments = (0..60)
            .map(|id| Segment {
                id: id.to_string(),
                start: id as f64 * 4.0,
                end: id as f64 * 4.0 + 3.9,
                text: "Uma conversa completa.".into(),
                words: vec![],
            })
            .collect::<Vec<_>>();
        let proposals = vec![(
            0..60,
            vec![
                candidate(2, 5, 99),
                candidate(10, 13, 98),
                candidate(20, 23, 70),
            ],
        )];
        let evaluate = |_clips: &[Clip], _speech: &[Segment]| {
            let mut context = judgment("E1", 99, "Contagem sem apresentar a lista");
            context.standalone = false;
            let mut unfinished = judgment("E2", 98, "Resposta continua depois do corte");
            unfinished.complete = false;
            Ok(vec![
                context,
                unfinished,
                judgment("E3", 70, "Ideia completa"),
            ])
        };
        let selected = resolve(
            &proposals,
            &segments,
            "media",
            240.0,
            &options(3, 10.0, 120.0),
            &evaluate,
        )
        .unwrap();
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].start, segments[20].start);
    }

    #[test]
    fn windows_cover_all_speech_with_overlap_and_bounded_size() {
        let segments = (0..1200)
            .map(|id| Segment {
                id: id.to_string(),
                start: id as f64 * 4.0,
                end: id as f64 * 4.0 + 3.0,
                text: "Uma conversa com conteúdo durante todo o vídeo.".into(),
                words: vec![],
            })
            .collect::<Vec<_>>();
        let ranges = windows(&segments, 180.0);
        assert!(ranges.len() > 1);
        assert!(segments
            .iter()
            .enumerate()
            .all(|(i, _)| ranges.iter().any(|r| r.contains(&i))));
    }

    #[test]
    fn proposta_valida_vira_corte_com_limites_naturais_e_nota_preservada() {
        let segments = speech_from(60);
        let contender = conform(
            candidate(2, 6, 70),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0),
        )
        .expect("válida");
        assert_eq!(contender.clip.start, segments[2].start);
        assert_eq!(contender.clip.end, segments[6].end);
        assert_eq!(contender.valid_score, Some(70));
        assert!(matches!(contender.provenance, Provenance::Proposal));
    }

    #[test]
    fn proposta_longa_demais_nao_vira_corte_direto() {
        let segments = speech_from(60);
        assert!(conform(
            candidate(0, 29, 85),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0)
        )
        .is_err());
    }

    #[test]
    fn proposta_curta_demais_nao_vira_corte_direto() {
        let segments = speech_from(60);
        assert!(conform(
            candidate(1, 2, 75),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0)
        )
        .is_err());
    }

    #[test]
    fn proposta_fora_da_faixa_gera_alternativas_sem_nota_herdada_valida() {
        let segments = speech_from(60);
        let alternatives = repair_alternatives(
            candidate(0, 29, 85),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0),
        );
        assert!(!alternatives.is_empty());
        for contender in &alternatives {
            assert_eq!(contender.valid_score, None);
            assert!(matches!(
                contender.provenance,
                Provenance::Alternative { .. }
            ));
            assert!(contender
                .clip
                .reasons
                .iter()
                .any(|r| r.contains("proveniência, não avaliação")));
        }
    }

    #[test]
    fn limite_superior_respeita_a_durancia_da_midia() {
        let segments = speech_from(30);
        let contender = conform(
            candidate(0, 10, 60),
            &segments,
            "media",
            40.0,
            &options(3, 15.0, 90.0),
        )
        .expect("válida");
        assert_eq!(contender.clip.end, 40.0);
    }

    fn clip_named(id: &str, start: f64, end: f64, score: u8) -> Clip {
        Clip {
            id: id.into(),
            start,
            end,
            title: String::new(),
            score,
            reasons: Vec::new(),
            review: Review::Pending,
            format: Some("9:16".into()),
            fit: None,
            analysis: None,
            analysis_error: None,
            analysis_signature: None,
            analysis_stale: None,
            multimodal: None,
            face_framing: None,
            created_at_ms: None,
            deleted: None,
            engine: None,
        }
    }

    #[test]
    fn finalizacao_recupera_dois_medianos_bloqueados_por_um_alto() {
        let sorted = vec![
            clip_named("alfa", 30.0, 90.0, 90),
            clip_named("beta", 0.0, 35.0, 75),
            clip_named("gamma", 85.0, 120.0, 75),
        ];
        let chosen = finalize_weighted(&sorted, 2);
        assert_eq!(chosen.len(), 2);
        let ids: Vec<&str> = chosen.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"beta") && ids.contains(&"gamma"));
    }

    #[test]
    fn finalizacao_sem_conflito_coincide_com_a_ordem_anterior() {
        let sorted = vec![
            clip_named("a", 0.0, 30.0, 85),
            clip_named("b", 40.0, 70.0, 80),
            clip_named("c", 80.0, 110.0, 75),
        ];
        let chosen = finalize_weighted(&sorted, 3);
        assert_eq!(
            chosen.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["a", "b", "c"]
        );
    }

    #[test]
    fn finalizacao_prioriza_soma_com_count_como_teto() {
        let sorted = vec![
            clip_named("longo", 0.0, 60.0, 100),
            clip_named("esquerda", 0.0, 30.0, 49),
            clip_named("direita", 30.0, 60.0, 49),
        ];
        let chosen = finalize_weighted(&sorted, 2);
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].id, "longo");
    }

    #[test]
    fn finalizacao_nunca_escolhe_sobrepostos() {
        let sorted = vec![
            clip_named("x", 0.0, 40.0, 80),
            clip_named("y", 10.0, 50.0, 80),
            clip_named("z", 20.0, 60.0, 80),
        ];
        let chosen = finalize_weighted(&sorted, 3);
        for (i, a) in chosen.iter().enumerate() {
            assert!(chosen[i + 1..]
                .iter()
                .all(|b| a.start >= b.end || a.end <= b.start));
        }
    }

    /// FLUXO COMPLETO (sem LLM; avaliação aplicada pelo mesmo camamento do
    /// select): A tem nota original alta (90) mas intervalo fora da faixa;
    /// a avaliação do intervalo FINAL de A retorna nota baixa (30); B é
    /// proposta válida com nota 80. Com count=1, B deve vencer — e a
    /// avaliação precisa ocorrer ANTES da seleção. No comportamento de
    /// 0360672, A disputava com a nota herdada 90 e vencia.
    #[test]
    fn avaliacao_anterior_a_selecao_evita_que_nota_herdada_decida() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let mut contenders: Vec<Contender> = Vec::new();
        match conform(candidate(0, 29, 90), &segments, "media", 240.0, &options) {
            Ok(_) => panic!("proposta longa deveria ser inválida"),
            Err(rejected) => {
                let mut alts = repair_alternatives(rejected, &segments, "media", 240.0, &options);
                assert!(!alts.is_empty());
                contenders.append(&mut alts);
            }
        }
        let b = conform(candidate(2, 6, 80), &segments, "media", 240.0, &options).expect("válida");
        contenders.push(b);
        // mesmo caminho de avaliação do select(): pendentes → avalia → aplica por id
        let pending: Vec<Clip> = contenders
            .iter()
            .filter(|c| c.valid_score.is_none())
            .map(|c| c.clip.clone())
            .collect();
        let label_of = |clip: &Clip| -> Option<String> {
            pending
                .iter()
                .position(|c| c.id == clip.id)
                .map(|position| format!("E{}", position + 1))
        };
        let evaluations: Vec<Evaluation> = pending
            .iter()
            .enumerate()
            .map(|(i, _)| judgment(&format!("E{}", i + 1), 30, "avaliação baixa"))
            .collect();
        for judgment in evaluations {
            if let Some(contender) = contenders.iter_mut().find(|c| {
                c.valid_score.is_none()
                    && label_of(&c.clip).as_deref() == Some(judgment.id.as_str())
            }) {
                contender.clip.reasons.push(format!(
                    "Avaliação do intervalo efetivo ({}): {}",
                    judgment.nature.label(),
                    judgment.reason
                ));
                contender.clip.score = judgment.score;
                contender.valid_score = Some(judgment.score);
            }
        }
        let mut dispute: Vec<Clip> = Vec::new();
        for contender in contenders {
            if let Some(score) = contender.valid_score {
                let mut clip = contender.clip;
                clip.score = score;
                dispute.push(clip);
            }
        }
        assert!(
            dispute.iter().all(|c| c.score != 90),
            "nota herdada não pode disputar"
        );
        dispute.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
        let chosen = finalize_weighted(&dispute, options.count);
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].score, 80, "B (avaliação válida 80) deve vencer");
    }

    #[test]
    fn fluxo_completo_via_resolve_avalia_antes_de_selecionar() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let proposals = vec![(0..40, vec![candidate(0, 29, 90), candidate(2, 6, 80)])];
        // Contrato v2: TODOS avaliados — A gera 2 alternativas (E1, E2)
        // e B conforme é E3; B vence com AVALIAÇÃO própria.
        let evaluate = |_pending: &[Clip], _segs: &[Segment]| {
            Ok(vec![
                judgment("E1", 30, "alternativa de A"),
                judgment("E2", 30, "alternativa de A"),
                judgment("E3", 60, "avaliação de B"),
            ])
        };
        let chosen =
            resolve(&proposals, &segments, "media", 240.0, &options, &evaluate).expect("seleção");
        assert_eq!(chosen.len(), 1);
        assert_eq!(
            chosen[0].score, 60,
            "B vence com avaliação própria (60); nota de proposta 80 é proveniência"
        );
        assert!(chosen[0]
            .reasons
            .iter()
            .any(|r| r.contains("Proveniência: nota de proposta 80")));
    }

    #[test]
    fn fluxo_completo_via_resolve_falha_de_avaliacao_sobre_so_conformes() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let proposals = vec![(0..40, vec![candidate(0, 29, 90), candidate(2, 6, 80)])];
        let failing = |_pending: &[Clip], _segs: &[Segment]| {
            Err::<Vec<Evaluation>, String>("motor indisponível".into())
        };
        // Contrato v2 (bench-11): avaliação é obrigatória — falha do
        // motor NÃO promove propostas diretas com nota de modelo.
        let result = resolve(&proposals, &segments, "media", 240.0, &options, &failing);
        assert!(
            result.is_err(),
            "sem avaliação válida não há seleção (proposta direta não disputa)"
        );
    }

    /// Regressão do defeito de associação (contraprova do mantenedor,
    /// commit bc8a198): E{n} deve permanecer vinculado ao n-ésimo pendente
    /// ORIGINAL mesmo após notas serem aplicadas. No código antigo, o
    /// filtro dinâmico por valid_score deslocava os alvos (E2=90 caía no
    /// terceiro pendente e o terceiro ficava sem avaliação).
    fn run_associacao(respostas: Vec<(String, u8, String)>) -> Vec<Clip> {
        let segments = speech_from(60);
        let options = options(3, 15.0, 90.0);
        // três propostas CURTAS e disjuntas -> três alternativas disjuntas
        // [first, ~min] = pendentes E1..E3 na ordem
        let proposals = vec![(
            0..30,
            vec![
                candidate(1, 2, 70),
                candidate(10, 11, 71),
                candidate(20, 21, 72),
            ],
        )];
        let respostas: Vec<Evaluation> = respostas
            .into_iter()
            .map(|(id, score, reason)| judgment(&id, score, &reason))
            .collect();
        let evaluate = move |_pending: &[Clip], _segs: &[Segment]| Ok(respostas.clone());
        resolve(&proposals, &segments, "media", 240.0, &options, &evaluate).expect("seleção")
    }

    fn assert_associacao(chosen: &[Clip], esperado: &[(&str, u8)]) {
        assert_eq!(chosen.len(), esperado.len(), "quantidade de escolhidos");
        for (clip, (rotulo, nota)) in chosen.iter().zip(esperado) {
            let razao = clip
                .reasons
                .iter()
                .find(|r| r.contains("Avaliação do intervalo efetivo"))
                .expect("razão da avaliação presente");
            assert!(
                razao.contains(rotulo),
                "razão {razao} deveria citar {rotulo} (clip {}/{})",
                clip.start,
                clip.end
            );
            assert_eq!(
                clip.score, *nota,
                "nota do clip com razão {rotulo} deve ser {nota} (conteúdo [{}, {}])",
                clip.start, clip.end
            );
        }
    }

    #[test]
    fn associacao_normal_e1_10_e2_90_e3_20() {
        // ordem NORMAL — caso da contraprova. As três propostas curtas
        // geram 5 alternativas (E1..E5: p1-fim, p2-fim, p2-início,
        // p3-fim, p3-início); respondemos E1..E5 e a DP escolhe
        // E2(90)+E1(10)+E5(60) — E3 sobrepõe E2. No código de bc8a198,
        // E2=90 caía na TERCEIRA alternativa (deslocamento): este teste
        // falharia (raz-E2 num clipe errado com nota errada).
        let chosen = run_associacao(vec![
            ("E1".into(), 10, "raz-E1".into()),
            ("E2".into(), 90, "raz-E2".into()),
            ("E3".into(), 20, "raz-E3".into()),
            ("E4".into(), 50, "raz-E4".into()),
            ("E5".into(), 60, "raz-E5".into()),
        ]);
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E5", 60), ("raz-E1", 10)]);
    }

    #[test]
    fn associacao_ordem_inversa_e_permutada() {
        let base = [
            ("E1".into(), 10, "raz-E1".into()),
            ("E2".into(), 90, "raz-E2".into()),
            ("E3".into(), 20, "raz-E3".into()),
            ("E4".into(), 50, "raz-E4".into()),
            ("E5".into(), 60, "raz-E5".into()),
        ];
        let esperado = [("raz-E2", 90), ("raz-E5", 60), ("raz-E1", 10)];
        let inversa: Vec<_> = base.iter().rev().cloned().collect();
        assert_associacao(&run_associacao(inversa), &esperado);
        let permutada = vec![
            base[2].clone(),
            base[4].clone(),
            base[0].clone(),
            base[3].clone(),
            base[1].clone(),
        ];
        assert_associacao(&run_associacao(permutada), &esperado);
    }

    #[test]
    fn associacao_com_conforme_intercalado_nao_desloca_ids() {
        let segments = speech_from(60);
        let options = options(4, 15.0, 90.0);
        // Contrato v2 (bench-11): o conforme INTERCALADO também é avaliado
        // — E1/E2/E3 na ordem dos contenders (alt1, conforme, alt2); a nota
        // de proposta 81 vira PROVENIÊNCIA e a avaliação decide.
        let proposals = vec![(
            0..30,
            vec![
                candidate(1, 2, 70),
                candidate(4, 8, 81),
                candidate(10, 11, 71),
            ],
        )];
        let evaluate = |_pending: &[Clip], _segs: &[Segment]| {
            Ok(vec![
                judgment("E1", 10, "raz-E1"),
                judgment("E2", 85, "raz-E2-conforme"),
                judgment("E3", 90, "raz-E3"),
            ])
        };
        let chosen = resolve(&proposals, &segments, "media", 240.0, &options, &evaluate).unwrap();
        // E2 (conforme) carrega proveniência da proposta 81 + avaliação 85
        assert!(chosen.iter().any(|c| c.score == 85
            && c.reasons.iter().any(|r| r.contains("raz-E2-conforme"))
            && c.reasons
                .iter()
                .any(|r| r.contains("Proveniência: nota de proposta 81"))));
    }

    #[test]
    fn respostas_duplicada_ausente_e_desconhecida() {
        // duplicada: a PRIMEIRA aplica (10); ausente: E3 fora da disputa;
        // desconhecida (E99): ignorada sem pânico
        let chosen = run_associacao(vec![
            ("E1".into(), 10, "raz-E1".into()),
            ("E1".into(), 99, "raz-E1-dup".into()),
            ("E99".into(), 50, "raz-E99".into()),
            ("E2".into(), 90, "raz-E2".into()),
        ]);
        // disputam E1=10 e E2=90 (E3 sem avaliação fica fora)
        assert_eq!(chosen.len(), 2);
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E1", 10)]);
        assert!(!chosen
            .iter()
            .any(|c| c.reasons.iter().any(|r| r.contains("dup"))));
    }

    #[test]
    fn falha_da_avaliacao_exclui_pendentes_sem_falso_sucesso() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let alternatives =
            repair_alternatives(candidate(0, 29, 90), &segments, "media", 240.0, &options);
        // avaliação FALHOU (Err no select): alternativas ficam fora da disputa
        for contender in &alternatives {
            assert!(contender.valid_score.is_none());
        }
        let b = conform(candidate(2, 6, 80), &segments, "media", 240.0, &options).expect("válida");
        let dispute = vec![b.clip];
        let chosen = finalize_weighted(&dispute, options.count);
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].score, 80);
    }
}

/// Prompt de descoberta conforme o modo: automático = unidades completas
/// com duração decidida pelo conteúdo; personalizado padrão = seleção de
/// produção; personalizado experimental = unidades narrativas validadas.
pub(crate) fn selection_system(options: &Options) -> &'static str {
    if options.automatic {
        return include_str!("discover-auto-prompt.txt");
    }
    match options.quality() {
        Quality::Standard => include_str!("selection-prompt.txt"),
        Quality::ExperimentalGemma => include_str!("discover-prompt.txt"),
    }
}

pub fn select(
    engine: &Engine,
    scratch: &Path,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    control: &ProcessControl,
    evaluate: Evaluate<'_>,
    mut progress: impl FnMut(u8),
) -> Result<Vec<Clip>, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    // Limite por janela: personalizado usa a regra histórica; automático usa
    // o teto técnico (o conteúdo decide quantos momentos existem).
    let limit = if options.automatic {
        super::types::AUTOMATIC_MAX_CLIPS
    } else {
        (options.count * 2).min(12)
    };
    let selection_system = selection_system(options);
    let ranges = match options.quality() {
        Quality::Standard => windows(segments, options.max_seconds),
        Quality::ExperimentalGemma => {
            let counting_engine = engine;
            let mut calls = 0usize;
            let scratch_ref = scratch;
            let mut tokenize = |text: &str| -> Result<usize, String> {
                control.check()?; // cancelamento respeitado entre medições
                calls += 1;
                counting_engine.count_tokens(scratch_ref, text)
            };
            let ranges = windows_budgeted(
                segments,
                options,
                limit,
                engine,
                selection_system,
                &mut tokenize,
            )?;
            eprintln!(
                "[clips] orçamento de janelas: {} medições do tokenizador",
                calls
            );
            ranges
        }
    };
    // Reserva de resposta por chamada: padrão histórico da produção (1800);
    // experimental 2000 (validado na atualização 7 — schema de até 12 itens).
    let generation_tokens = match options.quality() {
        Quality::Standard => 1800,
        Quality::ExperimentalGemma => 2000,
    };
    let mut proposals: Vec<(std::ops::Range<usize>, Vec<Candidate>)> = Vec::new();
    for (index, range) in ranges.iter().enumerate() {
        control.check()?;
        let ids = range.clone().collect::<Vec<_>>();
        let data = window_data(segments, range, options, limit);
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["candidates"],"properties":{"candidates":{"type":"array","maxItems":limit,"items":{
            "type":"object","additionalProperties":false,"required":["firstId","lastId","score"],"properties":{
                "firstId":{"type":"integer","enum":ids},"lastId":{"type":"integer","enum":ids},"score":{"type":"integer","minimum":0,"maximum":100}}}}}});
        let prompt = engine.prompt(selection_system, &data)?;
        let output = engine.generate(
            scratch,
            &format!("selection-{index}"),
            &prompt,
            &schema,
            generation_tokens,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<Reply>()
            .next()
            .ok_or("Não foi possível selecionar os momentos. Tente novamente.")?
            .map_err(|_| "Não foi possível selecionar os momentos. Tente novamente.")?;
        proposals.push((
            range.clone(),
            reply.candidates.into_iter().take(limit).collect(),
        ));
        progress(((index + 1) * 50 / ranges.len().max(1)) as u8);
    }
    resolve(&proposals, segments, media, duration, options, evaluate)
}

#[cfg(test)]
mod budgeted_window_tests {
    use super::*;
    use crate::clips::text_engine;
    use crate::transcription::types::Segment;

    fn speech(count: usize) -> Vec<Segment> {
        (0..count)
            .map(|id| Segment {
                id: format!("s{id}"),
                start: id as f64 * 10.0,
                end: id as f64 * 10.0 + 9.0,
                text: format!(
                    "fala numero {id}: {}",
                    "conteudo do teste com palavras variadas e longas para ocupar tokens. "
                        .repeat(3)
                ),
                words: vec![],
            })
            .collect()
    }
    fn gemma_engine() -> Engine {
        text_engine::Engine::Gemma(text_engine::GemmaTools {
            cpu: std::path::PathBuf::from("llama"),
            gpu: None,
            model: std::path::PathBuf::from("gemma.gguf"),
            tokenizer: std::path::PathBuf::from("llama-tokenize"),
        })
    }
    fn options() -> Options {
        Options {
            min_seconds: 15.0,
            max_seconds: 90.0,
            count: 3,
            format: None,
            fit: None,
            quality: None,
            automatic: false,
        }
    }

    #[test]
    fn budgeted_windows_cover_all_speech_with_overlap_and_respect_budget() {
        let segments = speech(60);
        let engine = gemma_engine();
        // tokenizador falso: 1 token a cada 2 chars do prompt final
        let mut calls = 0usize;
        let mut tokenize = |text: &str| -> Result<usize, String> {
            calls += 1;
            Ok(text.len() / 2)
        };
        let ranges =
            windows_budgeted(&segments, &options(), 6, &engine, "sistema", &mut tokenize).unwrap();
        assert!(ranges.len() >= 2, "esperava mais de uma janela");
        // cobertura sem lacunas
        let mut covered = vec![false; segments.len()];
        for range in &ranges {
            for i in range.clone() {
                covered[i] = true;
            }
        }
        assert!(covered.iter().all(|c| *c));
        // sobreposição de fronteira entre janelas consecutivas
        for pair in ranges.windows(2) {
            assert!(pair[1].start < pair[0].end, "janelas sem overlap");
        }
        // o tokenizador realmente rodou (medição, não estimativa)
        assert!(calls >= ranges.len());
    }

    #[test]
    fn oversize_window_is_subdivided_and_registered() {
        let segments = speech(80);
        let engine = gemma_engine();
        // estimativa otimista (medição integral moderada) + verificação
        // exata estourando para janelas grandes: força o caminho de SUBDIVISÃO
        let mut tokenize = |text: &str| -> Result<usize, String> {
            let segments_in = text.matches("fala numero").count();
            if segments_in >= 79 {
                Ok(7000)
            } else if segments_in > 20 {
                Ok(9000)
            } else {
                Ok(100)
            }
        };
        let ranges =
            windows_budgeted(&segments, &options(), 6, &engine, "sistema", &mut tokenize).unwrap();
        assert!(
            ranges.iter().all(|r| r.len() <= 20 + 20),
            "subdivisão não limitou o tamanho"
        );
        let mut covered = vec![false; segments.len()];
        for range in &ranges {
            assert!(
                range.len() <= 20,
                "janela {}..{} não foi subdividida",
                range.start,
                range.end
            );
            for i in range.clone() {
                covered[i] = true;
            }
        }
        assert!(covered.iter().all(|c| *c));
    }

    #[test]
    fn unresolvable_budget_is_an_error_never_a_truncation() {
        let segments = speech(10);
        let engine = gemma_engine();
        let mut tokenize = |_text: &str| -> Result<usize, String> { Ok(usize::MAX / 4) };
        let result = windows_budgeted(&segments, &options(), 6, &engine, "sistema", &mut tokenize);
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod automatic_tests {
    use super::*;

    fn speech(count: usize) -> Vec<Segment> {
        (0..count)
            .map(|id| Segment {
                id: id.to_string(),
                start: id as f64 * 4.0,
                end: id as f64 * 4.0 + 3.9,
                text: "Uma conversa com conteúdo durante todo o vídeo.".into(),
                words: vec![],
            })
            .collect()
    }
    fn auto_options() -> Options {
        Options {
            min_seconds: super::super::types::AUTOMATIC_MIN_SECONDS,
            max_seconds: super::super::types::AUTOMATIC_MAX_SECONDS,
            count: super::super::types::AUTOMATIC_MAX_CLIPS,
            format: None,
            fit: None,
            quality: None,
            automatic: true,
        }
    }
    fn custom_options() -> Options {
        Options {
            min_seconds: 15.0,
            max_seconds: 90.0,
            count: 3,
            format: None,
            fit: None,
            quality: None,
            automatic: false,
        }
    }
    fn judgment(
        id: &str,
        score: u8,
        reason: &str,
        nature: Nature,
        advertising: bool,
    ) -> Evaluation {
        Evaluation {
            id: id.into(),
            score,
            reason: reason.into(),
            nature,
            advertising,
            standalone: true,
            complete: true,
        }
    }
    fn candidate(first: usize, last: usize, score: u8) -> Candidate {
        Candidate {
            first_id: first,
            last_id: last,
            score,
        }
    }

    #[test]
    fn resolve_options_automatico_usa_limites_tecnicos_e_valida_mix() {
        let automatic = serde_json::from_str::<super::super::types::GenerateOptions>(
            "{\"automatic\":true,\"format\":\"9:16\"}",
        )
        .unwrap()
        .resolve()
        .unwrap();
        assert!(automatic.automatic);
        assert_eq!(
            automatic.min_seconds,
            super::super::types::AUTOMATIC_MIN_SECONDS
        );
        assert_eq!(
            automatic.max_seconds,
            super::super::types::AUTOMATIC_MAX_SECONDS
        );
        assert_eq!(automatic.count, super::super::types::AUTOMATIC_MAX_CLIPS);
        // automático não aceita duração/quantidade junto
        let mixed: Result<_, _> = serde_json::from_str::<super::super::types::GenerateOptions>(
            "{\"automatic\":true,\"count\":3}",
        )
        .unwrap()
        .resolve();
        assert!(mixed.is_err());
        // personalizado exige os três valores e aceita mínima técnica
        let custom = serde_json::from_str::<super::super::types::GenerateOptions>(
            "{\"minSeconds\":10,\"maxSeconds\":180,\"count\":4}",
        )
        .unwrap()
        .resolve()
        .unwrap();
        assert!(!custom.automatic);
        assert_eq!(
            (custom.min_seconds, custom.max_seconds, custom.count),
            (10.0, 180.0, 4)
        );
        let incomplete = serde_json::from_str::<super::super::types::GenerateOptions>(
            "{\"maxSeconds\":60,\"count\":3}",
        )
        .unwrap()
        .resolve();
        assert!(incomplete.is_err());
    }

    #[test]
    fn automatico_exclui_piso_e_publicidade_personalizado_mantem_marca() {
        let segments = speech(60);
        // atualização 16: candidatos DIRETOS disjuntos (propostas curtas
        // eram rejeitadas pelo conform e viravam alternativas cuja
        // numeração E{n} fazia a publicidade cair em janela conflitante —
        // exatamente a sobreposição que esta atualização elimina)
        let proposals = vec![(
            0..60,
            vec![
                candidate(2, 5, 70),   // [8, 23.9] editorial
                candidate(6, 9, 71),   // [24, 39.9] abaixo do piso no automático
                candidate(10, 13, 72), // [40, 55.9] publicidade
            ],
        )];
        let evaluations = vec![
            judgment("E1", 80, "história forte", Nature::Relato, false),
            judgment("E2", 40, "fraco", Nature::Opiniao, false), // abaixo do piso
            judgment("E3", 70, "patrocínio", Nature::Explicacao, true), // publicidade
        ];
        let evaluate = {
            let evaluations = evaluations.clone();
            move |_pending: &[Clip], _segs: &[Segment]| Ok(evaluations.clone())
        };
        // AUTOMÁTICO (política revisada bench-11): E1 editorial + E3
        // publicidade como PRIORIDADE SECUNDÁRIA (marcada, não excluída);
        // E2 fora pelo piso 50.
        let chosen = resolve(
            &proposals,
            &segments,
            "media",
            240.0,
            &auto_options(),
            &evaluate,
        )
        .expect("seleção automática");
        assert_eq!(chosen.len(), 2, "editorial + promocional secundária");
        assert_eq!(chosen[0].score, 80);
        assert!(chosen[0].reasons.iter().any(|r| r.contains("relato")));
        assert!(
            chosen
                .iter()
                .any(|c| c.reasons.iter().any(|r| r.contains("Conteúdo promocional"))),
            "publicidade presente com identificação e prioridade secundária"
        );
        // promocional vem DEPOIS do editorial
        let pos_promo = chosen
            .iter()
            .position(|c| c.reasons.iter().any(|r| r.contains("Conteúdo promocional")))
            .expect("há promocional");
        assert_eq!(pos_promo, chosen.len() - 1, "promocional ao final");
        // PERSONALIZADO: as propostas seguem na disputa; publicidade marcada

        let evaluate2 = {
            let evaluations = evaluations.clone();
            move |_pending: &[Clip], _segs: &[Segment]| Ok(evaluations.clone())
        };
        let custom = resolve(
            &proposals,
            &segments,
            "media",
            240.0,
            &custom_options(),
            &evaluate2,
        )
        .expect("seleção personalizada");
        // propostas curtas geram até 2 alternativas; a DP escolhe sem
        // sobreposição — o que importa: a publicidade AVALIADA permanece
        // disponível ao usuário com a marcação explícita no motivo.
        assert!(
            custom.len() >= 2,
            "personalizado entrega os momentos pedidos (recebeu {})",
            custom.len()
        );
        assert!(
            custom
                .iter()
                .any(|c| c.reasons.iter().any(|r| r.contains("publicidade"))),
            "personalizado mantém publicidade com marcação explícita"
        );
        // no automático nada abaixo do piso aparece; publicidade aparece
        // apenas com marcação e prioridade secundária
        for clip in &chosen {
            assert!(clip.score >= super::super::types::AUTOMATIC_RELEVANCE_FLOOR);
        }
    }

    #[test]
    fn automatico_sem_nada_acima_do_piso_e_erro_orientado() {
        let segments = speech(40);
        let proposals = vec![(0..30, vec![candidate(1, 2, 70), candidate(10, 11, 71)])];
        let evaluate = |_pending: &[Clip], _segs: &[Segment]| {
            Ok(vec![
                judgment("E1", 20, "fraco", Nature::Opiniao, false),
                judgment("E2", 30, "fraco", Nature::Opiniao, false),
            ])
        };
        let result = resolve(
            &proposals,
            &segments,
            "media",
            160.0,
            &auto_options(),
            &evaluate,
        );
        assert!(
            result.is_err(),
            "sem candidato acima do piso não há sugestão automática"
        );
    }

    #[test]
    fn prompt_por_modo_sem_valores_de_episodio() {
        let automatic = selection_system(&auto_options());
        assert!(automatic.contains("limites técnicos"));
        assert!(automatic.contains("Não há quantidade fixa"));
        // atualização 17: o default resolve para Gemma (motor exclusivo); o
        // prompt Standard só aparece quando coleções antigas pedem explícito
        let default_agora_gemma = selection_system(&custom_options());
        assert!(default_agora_gemma.contains("UNIDADES NARRATIVAS COMPLETAS"));
        let standard = selection_system(&Options {
            quality: Some(Quality::Standard),
            ..custom_options()
        });
        assert!(standard.contains("momentos completos"));
        // nenhum prompt fixa duração ou quantidade deste episódio
        for system in [automatic, standard, default_agora_gemma] {
            assert!(!system.contains("90 segundos"));
            assert!(!system.contains("3 cortes"));
        }
    }

    #[test]
    fn avaliacao_parseia_natureza_e_publicidade() {
        let reply = serde_json::from_str::<EvaluationReply>(
            r#"{"items":[{"id":"E1","score":70,"reason":"punchline fecha","nature":"humor","advertising":false,"standalone":true,"complete":true},
                {"id":"E2","score":55,"reason":"cupom","nature":"explicacao","advertising":true,"standalone":true,"complete":true}]}"#,
        )
        .unwrap();
        assert_eq!(reply.items[0].nature, Nature::Humor);
        assert!(!reply.items[0].advertising);
        assert_eq!(reply.items[1].nature, Nature::Explicacao);
        assert!(reply.items[1].advertising);
        let legacy = serde_json::from_str::<EvaluationReply>(
            r#"{"items":[{"id":"E3","score":60,"reason":"ok"}]}"#,
        );
        assert!(legacy.is_err());
    }

    // ── Atualização 16: invariável GLOBAL de não-sobreposição ────────────
    fn overlaps(a: &Clip, b: &Clip) -> bool {
        a.start < b.end && b.start < a.end
    }

    #[test]
    fn reproducao_promocional_sobreposto_a_editorial_nao_pode_entrar() {
        // Cenário do ofício 16: editorial A 20–60 (85), promocional B 40–70
        // (75), promocional C 75–95 (65). Segmentos de 10s: A=(2,5) B=(4,6)
        // C=(7,9). Esperado: A + C (B conflita com A temporalmente).
        // speech local: segmentos de 4s (grid do módulo automatic_tests)
        let segments = speech(60);
        let proposals = vec![(
            0..60,
            vec![
                candidate(2, 5, 50),  // A editorial [8, 23.9]
                candidate(4, 7, 50),  // B promocional [16, 31.9] (sobrepõe A)
                candidate(9, 12, 50), // C promocional [36, 51.9] (livre)
            ],
        )];
        let evaluations = vec![
            judgment("E1", 85, "história", Nature::Relato, false),
            judgment("E2", 75, "patrocínio", Nature::Demonstracao, true),
            judgment("E3", 65, "patrocínio", Nature::Demonstracao, true),
        ];
        let evaluate = move |_pending: &[Clip], _segs: &[Segment]| Ok(evaluations.clone());
        let chosen = resolve(
            &proposals,
            &segments,
            "media",
            600.0,
            &custom_options(),
            &evaluate,
        )
        .expect("seleção");
        for (i, a) in chosen.iter().enumerate() {
            for b in chosen.iter().skip(i + 1) {
                assert!(
                    !overlaps(a, b),
                    "sobreposição: [{},{}] × [{},{}]",
                    a.start,
                    a.end,
                    b.start,
                    b.end
                );
            }
        }
        assert_eq!(chosen.len(), 2, "A + C; B fica fora por conflito temporal");
        assert!(chosen.iter().any(|c| c.score == 85));
        assert!(chosen.iter().any(|c| c.score == 65));
    }

    #[test]
    fn selecao_global_editoriais_parcialmente_sobrepostos_nao_coexistem() {
        // dois editoriais relevantes disputam intervalos parcialmente
        // sobrepostos: a DP editorial escolhe sem interseção (qualidade
        // preservada — não é um filtro guloso)
        let segments = speech(60);
        let proposals = vec![(
            0..60,
            vec![
                candidate(2, 6, 50),   // A [8, 27.9] nota 90
                candidate(5, 9, 50),   // B [20, 39.9] nota 88 (sobrepõe A)
                candidate(12, 15, 50), // C [48, 63.9] nota 70 (livre)
            ],
        )];
        let evaluations = vec![
            judgment("E1", 90, "história", Nature::Relato, false),
            judgment("E2", 88, "história", Nature::Relato, false),
            judgment("E3", 70, "história", Nature::Relato, false),
        ];
        let evaluate = move |_pending: &[Clip], _segs: &[Segment]| Ok(evaluations.clone());
        let chosen = resolve(
            &proposals,
            &segments,
            "media",
            600.0,
            &custom_options(),
            &evaluate,
        )
        .expect("seleção");
        for (i, a) in chosen.iter().enumerate() {
            for b in chosen.iter().skip(i + 1) {
                assert!(
                    !overlaps(a, b),
                    "sobreposição: [{},{}] × [{},{}]",
                    a.start,
                    a.end,
                    b.start,
                    b.end
                );
            }
        }
        // A+C (soma 160) supera B+C (158): qualidade editorial decide
        assert_eq!(chosen.len(), 2);
        assert!(chosen.iter().any(|c| c.score == 90));
        assert!(chosen.iter().any(|c| c.score == 70));
    }

    #[test]
    fn selecao_global_aceita_adjacencia_exata_e_comercial_livre() {
        // adjacente (fim == início do outro) NÃO é sobreposição: ambos
        // entram; comercial não sobreposto entra como secundária
        let segments = speech(60);
        let proposals = vec![(
            0..60,
            vec![
                candidate(2, 5, 50),   // A editorial [8, 23.9]
                candidate(6, 9, 50),   // B comercial [24, 39.9] adjacente a A (livre)
                candidate(10, 13, 50), // C comercial [40, 55.9]
            ],
        )];
        let evaluations = vec![
            judgment("E1", 85, "história", Nature::Relato, false),
            judgment("E2", 75, "patrocínio", Nature::Demonstracao, true),
            judgment("E3", 65, "patrocínio", Nature::Demonstracao, true),
        ];
        let evaluate = move |_pending: &[Clip], _segs: &[Segment]| Ok(evaluations.clone());
        let chosen = resolve(
            &proposals,
            &segments,
            "media",
            600.0,
            &custom_options(),
            &evaluate,
        )
        .expect("seleção");
        for (i, a) in chosen.iter().enumerate() {
            for b in chosen.iter().skip(i + 1) {
                assert!(
                    !overlaps(a, b),
                    "sobreposição indevida: [{},{}] × [{},{}]",
                    a.start,
                    a.end,
                    b.start,
                    b.end
                );
            }
        }
        assert_eq!(chosen.len(), 3, "adjacência não é conflito; todos entram");
    }
}
