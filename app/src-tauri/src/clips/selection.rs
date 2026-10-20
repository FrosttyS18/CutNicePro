use super::{
    text_engine,
    types::{Clip, Options, Review},
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
}

fn clip_for(media: &str, start: f64, end: f64, score: u8, format: Option<&str>) -> Clip {
    Clip {
        id: super::types::identity(media, start, end, format),
        start,
        end,
        title: format!("Trecho {:02}:{:02}", (start / 60.0) as u64, (start as u64) % 60),
        score,
        reasons: Vec::new(),
        review: Review::Pending,
        format: format.map(str::to_string),
        analysis: None,
        analysis_error: None,
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
    let (Some(first), Some(last)) =
        (segments.get(candidate.first_id), segments.get(candidate.last_id))
    else {
        return result;
    };
    let natural_end = last.end.min(duration);
    let span = natural_end - first.start;
    let mut alternative = |start: f64, end: f64, policy: &'static str, result: &mut Vec<Contender>| {
        let final_span = end - start;
        if final_span < options.min_seconds || final_span > options.max_seconds {
            return;
        }
        let mut clip = clip_for(media, start, end, candidate.score, options.format.as_deref());
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Evaluation {
    id: String,
    score: u8,
    reason: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EvaluationReply {
    items: Vec<Evaluation>,
}

/// Avaliação em LOTE dos candidatos pendentes: conteúdo integral, sem nota
/// antiga na entrada, IDs estáveis E1.., contexto externo separado. Uma
/// tentativa; falha deixa os pendentes fora da disputa com registro —
/// nunca nota zero, nunca nota antiga restaurada silenciosamente.
pub(crate) fn evaluate_batch(
    base: &Path,
    scratch: &Path,
    pending: &[Clip],
    segments: &[Segment],
    control: &ProcessControl,
) -> Result<Vec<(String, u8, String)>, String> {
    let labels: Vec<String> = (1..=pending.len()).map(|i| format!("E{i}")).collect();
    let items: Vec<serde_json::Value> = pending
        .iter()
        .enumerate()
        .map(|(i, clip)| {
            let text = segments
                .iter()
                .filter(|s| s.start < clip.end && s.end > clip.start)
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            let before = segments
                .iter()
                .filter(|s| s.end <= clip.start + 1e-9)
                .map(|s| s.text.clone())
                .next_back();
            let after = segments
                .iter()
                .filter(|s| s.start >= clip.end - 1e-9)
                .map(|s| s.text.clone())
                .next();
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
    let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["items"],"properties":{"items":{"type":"array","maxItems":pending.len(),"items":{
        "type":"object","additionalProperties":false,"required":["id","score","reason"],"properties":{
            "id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}}}}}});
    let prompt = text_engine::prompt(include_str!("evaluate-prompt.txt"), &data)?;
    let output =
        text_engine::generate(base, scratch, "evaluate", &prompt, &schema, 1600, control)?;
    let reply = serde_json::Deserializer::from_str(output.trim())
        .into_iter::<EvaluationReply>()
        .next()
        .ok_or("Não foi possível avaliar os trechos ajustados. Tente novamente.")?
        .map_err(|_| "Não foi possível avaliar os trechos ajustados. Tente novamente.")?;
    Ok(reply
        .items
        .into_iter()
        .map(|item| (item.id, item.score, item.reason))
        .collect())
}

/// Finalização da seleção — weighted interval scheduling. OBJETIVO
/// MATEMÁTICO: entre clipes não sobrepostos, até `count` (teto), maximizar
/// lexicograficamente (soma das notas VÁLIDAS, cardinalidade, -soma dos
/// inícios). Sem nenhuma poda prévia (contraprovas no experimento).
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
    let mut best: Vec<Vec<Option<(i64, i64, f64, Vec<usize>)>>> =
        vec![vec![None; count + 1]; n + 1];
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
                    let replace = current.as_ref().map_or(true, |(s, l, ng, _)| {
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
    let mut winner: Option<(usize, (i64, i64, f64, Vec<usize>))> = None;
    for k in 0..=count {
        if let Some(cell) = best[n][k].clone() {
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
pub(crate) fn resolve(
    proposals: &[(std::ops::Range<usize>, Vec<Candidate>)],
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    evaluate: &dyn Fn(&[Clip], &[Segment]) -> Result<Vec<(String, u8, String)>, String>,
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
    let pending: Vec<Clip> = contenders
        .iter()
        .filter(|c| c.valid_score.is_none())
        .map(|c| c.clip.clone())
        .collect();
    let mut evaluated = 0usize;
    let mut unevaluated = 0usize;
    if !pending.is_empty() {
        match evaluate(&pending, segments) {
            Ok(scores) => {
                let mut applied: std::collections::HashSet<usize> = std::collections::HashSet::new();
                for (id, score, reason) in scores {
                    let parsed = id.strip_prefix('E').and_then(|n| n.parse::<usize>().ok());
                    let Some(position) = parsed.and_then(|n| n.checked_sub(1)) else {
                        continue;
                    };
                    if !applied.insert(position) {
                        continue; // id repetido na resposta: não re-rotear
                    }
                    // E{n} referencia o n-ésimo pendente — a mesma numeração
                    // usada por evaluate_batch ao montar o lote.
                    if let Some(contender) = contenders
                        .iter_mut()
                        .filter(|c| c.valid_score.is_none())
                        .nth(position)
                    {
                        contender.clip.reasons.push(format!(
                            "Avaliação do intervalo efetivo: {reason}"
                        ));
                        contender.clip.score = score;
                        contender.valid_score = Some(score);
                        evaluated += 1;
                    }
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
    for contender in contenders {
        if let Some(score) = contender.valid_score {
            let mut clip = contender.clip;
            clip.score = score;
            dispute.push(clip);
        }
    }
    if dispute.is_empty() {
        return Err(
            "Não foi possível avaliar os trechos propostos nesta duração. Tente novamente."
                .into(),
        );
    }
    dispute.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let selected = finalize_weighted(&dispute, options.count);
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

    fn options(count: usize, min: f64, max: f64) -> Options {
        Options {
            min_seconds: min,
            max_seconds: max,
            count,
            format: Some("9:16".into()),
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
            analysis: None,
            analysis_error: None,
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
        let evaluations: Vec<(String, u8, String)> = pending
            .iter()
            .enumerate()
            .map(|(i, _)| (format!("E{}", i + 1), 30u8, "avaliação baixa".into()))
            .collect();
        for (id, score, reason) in evaluations {
            if let Some(contender) = contenders
                .iter_mut()
                .find(|c| c.valid_score.is_none() && label_of(&c.clip).as_deref() == Some(id.as_str()))
            {
                contender.clip.reasons.push(format!("Avaliação do intervalo efetivo: {reason}"));
                contender.clip.score = score;
                contender.valid_score = Some(score);
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
        assert!(dispute.iter().all(|c| c.score != 90), "nota herdada não pode disputar");
        dispute.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
        let chosen = finalize_weighted(&dispute, options.count);
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].score, 80, "B (avaliação válida 80) deve vencer");
    }

    #[test]
    fn fluxo_completo_via_resolve_avalia_antes_de_selecionar() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let proposals = vec![(
            0..40,
            vec![candidate(0, 29, 90), candidate(2, 6, 80)],
        )];
        // avaliador mock: 1a pendente (alternativa de A) -> 30
        let evaluate = |pending: &[Clip], _segs: &[Segment]| {
            Ok(pending
                .iter()
                .enumerate()
                .map(|(i, _)| (format!("E{}", i + 1), 30u8, "avaliação baixa".to_string()))
                .collect())
        };
        let chosen = resolve(&proposals, &segments, "media", 240.0, &options, &evaluate)
            .expect("seleção");
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].score, 80, "B (proposta válida 80) vence; alternativas de A disputam com 30");
    }

    #[test]
    fn fluxo_completo_via_resolve_falha_de_avaliacao_sobre_so_conformes() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let proposals = vec![(0..40, vec![candidate(0, 29, 90), candidate(2, 6, 80)])];
        let failing = |_pending: &[Clip], _segs: &[Segment]| {
            Err::<Vec<(String, u8, String)>, String>("motor indisponível".into())
        };
        let chosen = resolve(&proposals, &segments, "media", 240.0, &options, &failing)
            .expect("conforme segue sem avaliação de alternativas");
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].score, 80);
    }

    #[test]
    fn falha_da_avaliacao_exclui_pendentes_sem_falso_sucesso() {
        let segments = speech_from(60);
        let options = options(1, 15.0, 90.0);
        let alternatives = repair_alternatives(
            candidate(0, 29, 90),
            &segments,
            "media",
            240.0,
            &options,
        );
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

pub fn select(
    base: &Path,
    scratch: &Path,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    control: &ProcessControl,
    evaluate: &dyn Fn(&[Clip], &[Segment]) -> Result<Vec<(String, u8, String)>, String>,
    mut progress: impl FnMut(u8),
) -> Result<Vec<Clip>, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    let ranges = windows(segments, options.max_seconds);
    let mut proposals: Vec<(std::ops::Range<usize>, Vec<Candidate>)> = Vec::new();
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
            .into_iter::<Reply>()
            .next()
            .ok_or("Não foi possível selecionar os momentos. Tente novamente.")?
            .map_err(|_| "Não foi possível selecionar os momentos. Tente novamente.")?;
        proposals.push((range.clone(), reply.candidates.into_iter().take(limit).collect()));
        progress(((index + 1) * 50 / ranges.len().max(1)) as u8);
    }
    resolve(&proposals, segments, media, duration, options, evaluate)
}
