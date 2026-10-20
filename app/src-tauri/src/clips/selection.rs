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
struct Candidate {
    first_id: usize,
    last_id: usize,
    score: u8,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    candidates: Vec<Candidate>,
}

/// Constrói um clipe SOMENTE quando a proposta é válida como veio: o fim é
/// o fim natural da última fala proposta (limitado à duração da mídia) e a
/// duração resultante cabe em [min_seconds, max_seconds]. Uma alteração
/// material de começo/fim (encurtar para caber, alongar para atingir o
/// mínimo) NÃO preserva a avaliação original — nesses casos a proposta vai
/// para o reparo determinístico (`repair`), com o ajuste marcado em
/// `reasons`, em vez de virar clipe com a nota de um intervalo que o
/// modelo nunca avaliou.
fn conform(
    candidate: Candidate,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
) -> Result<Clip, Candidate> {
    if candidate.first_id > candidate.last_id || candidate.score > 100 {
        return Err(candidate);
    }
    let first = segments
        .get(candidate.first_id)
        .ok_or_else(|| candidate.clone())?;
    let last = segments
        .get(candidate.last_id)
        .ok_or_else(|| candidate.clone())?;
    let end = last.end.min(duration);
    let span = end - first.start;
    if span < options.min_seconds || span > options.max_seconds {
        return Err(candidate);
    }
    Ok(Clip {
        id: super::types::identity(media, first.start, end, options.format.as_deref()),
        start: first.start,
        end,
        title: format!(
            "Trecho {:02}:{:02}",
            (first.start / 60.0) as u64,
            (first.start as u64) % 60
        ),
        score: candidate.score,
        reasons: Vec::new(),
        review: Review::Pending,
        format: options.format.clone(),
        analysis: None,
        analysis_error: None,
    })
}

/// Recuperação DETERMINÍSTICA de propostas fora da faixa (delimitada por
/// construção, sem chamadas de modelo — a recuperação por LLM foi testada
/// e o motor local repete as propostas originais; ver
/// experiments/clip-selection-ab/scratch/recovery-*). Propostas longas
/// demais preservam o ENCERRAMENTO proposto (lastId) e avançam o início;
/// propostas curtas demais preservam a ABERTURA (firstId) e estendem o fim
/// até o mínimo. O ajuste é registrado em `reasons`: a nota original NÃO é
/// apresentada como avaliação do intervalo final e será substituída pela
/// análise do trecho (semantic). Sem intervalo válido alcançável → None.
fn repair(
    candidate: Candidate,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
) -> Option<Clip> {
    if candidate.first_id > candidate.last_id || candidate.score > 100 {
        return None;
    }
    let first = segments.get(candidate.first_id)?;
    let last = segments.get(candidate.last_id)?;
    let natural_end = last.end.min(duration);
    let span = natural_end - first.start;
    let (start, end, note) = if span > options.max_seconds {
        // longa: manter o desfecho, avançar o início (maior contexto possível)
        let floor = natural_end - options.max_seconds;
        let ceiling = natural_end - options.min_seconds;
        let new_first = segments[..=candidate.last_id]
            .iter()
            .find(|s| s.start >= floor && s.start <= ceiling)?
            .start;
        (new_first, natural_end, "início avançado")
    } else if span < options.min_seconds {
        // curta: manter a abertura, estender o fim até o mínimo
        let new_end = segments[candidate.first_id..]
            .iter()
            .map(|s| s.end.min(duration))
            .find(|end| *end - first.start >= options.min_seconds)?;
        (first.start, new_end, "fim estendido")
    } else {
        return None;
    };
    let final_span = end - start;
    if final_span < options.min_seconds || final_span > options.max_seconds {
        return None;
    }
    let clip = Clip {
        id: super::types::identity(media, start, end, options.format.as_deref()),
        start,
        end,
        title: format!("Trecho {:02}:{:02}", (start / 60.0) as u64, (start as u64) % 60),
        score: candidate.score,
        reasons: vec![format!(
            "intervalo ajustado deterministicamente ({note}) de [{:.1}s, {:.1}s] para [{:.1}s, {:.1}s] para caber na duração pedida; nota herdada da proposta original será reavaliada pela análise do trecho",
            first.start, natural_end, start, end
        )],
        review: Review::Pending,
        format: options.format.clone(),
        analysis: None,
        analysis_error: None,
    };
    Some(clip)
}

/// Finalização da seleção — weighted interval scheduling (mudança separável
/// do pipeline de construção). OBJETIVO MATEMÁTICO: dada a lista ordenada
/// por (nota desc, início asc), escolher até `count` clipes não
/// sobrepostos maximizando lexicograficamente (soma das notas,
/// cardinalidade, -soma dos inícios). Sem qualquer poda prévia: podar por
/// sobreposição antes desta etapa pode destruir o ótimo (comprovado em
/// experiments/clip-selection-ab — contraprovas R2 e da revisão). Quando
/// não há conflito relevante, o resultado coincide com a ordem gulosa
/// anterior (teste de não-regressão abaixo).
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
    // best[i][k] = (soma, -soma_starts, caminho) entre os i primeiros (fim crescente) com k escolhidos
    let mut best: Vec<Vec<Option<(i64, f64, Vec<usize>)>>> =
        vec![vec![None; count + 1]; n + 1];
    best[0][0] = Some((0, 0.0, Vec::new()));
    for i in 1..=n {
        let idx = order[i - 1];
        let mut prefix = 0usize;
        while prefix < i - 1 && sorted[order[prefix]].end <= sorted[idx].start {
            prefix += 1;
        }
        for k in 0..=count {
            let mut current = best[i - 1][k].clone();
            if k >= 1 {
                if let Some((sum, neg, path)) = &best[prefix][k - 1] {
                    let mut new_path = path.clone();
                    new_path.push(idx);
                    let candidate = (
                        sum + i64::from(sorted[idx].score),
                        neg - sorted[idx].start,
                        new_path,
                    );
                    let replace = current.as_ref().map_or(true, |(s, ng, _)| {
                        candidate.0 > *s || (candidate.0 == *s && candidate.1 > *ng)
                    });
                    if replace {
                        current = Some(candidate);
                    }
                }
            }
            best[i][k] = current;
        }
    }
    let mut winner: Option<(usize, (i64, f64, Vec<usize>))> = None;
    for k in 0..=count {
        if let Some(cell) = best[n][k].clone() {
            let replace = match &winner {
                None => true,
                Some((wk, (ws, wng, _))) => {
                    cell.0 > *ws
                        || (cell.0 == *ws && k > *wk)
                        || (cell.0 == *ws && k == *wk && cell.1 > *wng)
                }
            };
            if replace {
                winner = Some((k, cell));
            }
        }
    }
    let mut chosen: Vec<Clip> = Vec::new();
    if let Some((_, (_, _, path))) = winner {
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

pub fn select(
    base: &Path,
    scratch: &Path,
    segments: &[Segment],
    media: &str,
    duration: f64,
    options: &Options,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<Vec<Clip>, String> {
    options.validate()?;
    crate::transcription::parser::validate(segments, duration)?;
    let ranges = windows(segments, options.max_seconds);
    let mut all = Vec::new();
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
        let mut invalid: Vec<Candidate> = Vec::new();
        let mut accepted = 0usize;
        for candidate in reply.candidates.into_iter().take(limit) {
            if !range.contains(&candidate.first_id) || !range.contains(&candidate.last_id) {
                continue;
            }
            match conform(candidate, segments, media, duration, options) {
                Ok(clip) => {
                    all.push(clip);
                    accepted += 1;
                }
                Err(rejected) => invalid.push(rejected),
            }
        }
        let mut adjusted = 0usize;
        let mut discarded = 0usize;
        for rejected in invalid {
            let (first, last, score) = (rejected.first_id, rejected.last_id, rejected.score);
            match repair(rejected, segments, media, duration, options) {
                Some(clip) => {
                    all.push(clip);
                    adjusted += 1;
                }
                None => {
                    discarded += 1;
                    eprintln!(
                        "[clips] janela {index}: proposta sem intervalo válido alcançável ({first}, {last}, {score}) descartada"
                    );
                }
            }
        }
        if adjusted > 0 || discarded > 0 {
            eprintln!(
                "[clips] janela {index}: {accepted} conformes, {adjusted} ajustadas deterministicamente, {discarded} descartadas"
            );
        }
        progress(((index + 1) * 100 / ranges.len().max(1)) as u8);
    }
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let selected = finalize_weighted(&all, options.count);
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
        for pair in ranges.windows(2) {
            assert!(pair[0].end > pair[1].start);
        }
        assert!(ranges.iter().all(|range| segments[range.clone()]
            .iter()
            .map(|s| s.text.len())
            .sum::<usize>()
            < 14000));
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
    fn proposta_valida_vira_corte_com_limites_naturais_e_nota_preservada() {
        let segments = speech_from(60);
        // falas de 4s: 5 falas ≈ 20s dentro de [15, 90]
        let clip = conform(
            candidate(2, 6, 70),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0),
        )
        .expect("válida");
        assert_eq!(clip.start, segments[2].start);
        assert_eq!(clip.end, segments[6].end);
        assert_eq!(clip.score, 70);
    }

    #[test]
    fn proposta_longa_demais_nao_e_encurtada_com_nota_preservada() {
        let segments = speech_from(60);
        // 30 falas ≈ 120s: fora de [15, 90] — não pode virar corte direto
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
    fn proposta_curta_demais_nao_e_alongada_ate_o_minimo() {
        let segments = speech_from(60);
        // 2 falas ≈ 8s: abaixo do mínimo — não pode ser esticada para 15s
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
    fn limite_superior_respeita_a_durancia_da_midia() {
        let segments = speech_from(30);
        // última fala termina em ~119,6s; mídia com 110s corta o fim natural
        let clip = conform(
            candidate(0, 10, 60),
            &segments,
            "media",
            40.0,
            &options(3, 15.0, 90.0),
        )
        .expect("válida");
        assert_eq!(clip.end, 40.0);
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
    fn reparo_de_proposta_longa_preserva_o_encerramento_e_cabe_na_faixa() {
        let segments = speech_from(60);
        // proposta 0..29 ≈ 120s (> 90): início avança, fim natural mantido
        let clip = repair(
            candidate(0, 29, 85),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0),
        )
        .expect("reparável");
        assert_eq!(clip.end, segments[29].end);
        assert!(clip.end - clip.start >= 15.0 && clip.end - clip.start <= 90.0);
        assert!(clip.start > segments[0].start);
        assert!(clip.reasons[0].contains("ajustado deterministicamente"));
    }

    #[test]
    fn reparo_de_proposta_curta_preserva_a_abertura_e_atinge_o_minimo() {
        let segments = speech_from(60);
        // proposta 1..2 ≈ 8s (< 15): fim estendido, início mantido
        let clip = repair(
            candidate(1, 2, 75),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0),
        )
        .expect("reparável");
        assert_eq!(clip.start, segments[1].start);
        assert!(clip.end - clip.start >= 15.0);
        assert!(clip.reasons[0].contains("fim estendido"));
    }

    #[test]
    fn reparo_retorna_none_quando_nenhum_intervalo_valido_existe() {
        let segments = vec![
            Segment { id: "0".into(), start: 0.0, end: 3.9, text: "a".into(), words: vec![] },
            Segment { id: "1".into(), start: 100.0, end: 103.9, text: "b".into(), words: vec![] },
        ];
        // 0..1 ≈ 104s (> 90) e nenhum início intermediário existe para avançar
        assert!(repair(
            candidate(0, 1, 80),
            &segments,
            "media",
            240.0,
            &options(3, 15.0, 90.0)
        )
        .is_none());
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
}
