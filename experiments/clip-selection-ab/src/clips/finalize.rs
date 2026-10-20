//! Estratégias de FINALIZAÇÃO — a etapa que reduz o conjunto de candidatos
//! aos `count` cortes finais (a "limitação final").
//!
//! - `greedy`: CÓPIA 1:1 da lógica de `selection.rs:141-153` (ordena por
//!   score desc/start asc e percorre aceitando o primeiro não-sobreposto).
//!   A única diferença é o registro de descartes, que não altera decisões.
//! - `dp`: referência determinística — weighted interval scheduling que
//!   maximiza (soma de scores, cardinalidade) sob não-sobreposição e
//!   limite `count`. Instrumento de medição do custo da ordem gulosa.
//! - `joint`: rerank CONJUNTO via LLM antes da limitação (conceito estudado
//!   no SupoClip/AGPL-3.0 — NENHUM código ou texto dele copiado; decisão de
//!   distribuição registrada no README). Fallback explícito para `greedy`
//!   quando a resposta do modelo não valida; nunca silencioso.

use super::{
    text_engine,
    types::{Clip, Options},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Instant};

#[derive(Serialize, Clone)]
pub struct Discard {
    pub id: String,
    pub score: u8,
    pub start: f64,
    pub end: f64,
    pub reason: String,
}

#[derive(Serialize)]
pub struct FinalOut {
    pub strategy: String,
    pub elapsed_s: f64,
    pub clips: Vec<Clip>,
    pub discards: Vec<Discard>,
    pub fallback: Option<String>,
    pub details: Option<serde_json::Value>,
}

fn discard_of(clip: &Clip, reason: String) -> Discard {
    Discard {
        id: clip.id.clone(),
        score: clip.score,
        start: clip.start,
        end: clip.end,
        reason,
    }
}

pub fn overlaps(a: &Clip, b: &Clip) -> bool {
    a.start < b.end && b.start < a.end
}

/// Cópia 1:1 de selection.rs:141-153. O original interrompe o loop com
/// `break` ao atingir `count`; aqui os remanescentes são apenas REGISTRADOS
/// como "não avaliados" — as decisões de `selected` são idênticas.
pub fn greedy(mut all: Vec<Clip>, options: &Options) -> FinalOut {
    let started = Instant::now();
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let mut selected: Vec<Clip> = Vec::new();
    let mut discards: Vec<Discard> = Vec::new();
    for clip in all {
        if selected.len() == options.count {
            discards.push(discard_of(
                &clip,
                format!("não avaliado — limite de {} cortes já atingido", options.count),
            ));
            continue;
        }
        if selected
            .iter()
            .all(|other| clip.start >= other.end || clip.end <= other.start)
        {
            selected.push(clip);
        } else {
            discards.push(discard_of(
                &clip,
                "sobrepõe corte já selecionado (descarte por ordem de score)".into(),
            ));
        }
    }
    let nothing_selected = selected.is_empty();
    FinalOut {
        strategy: "greedy".into(),
        elapsed_s: started.elapsed().as_secs_f64(),
        clips: selected,
        discards,
        fallback: None,
        details: if nothing_selected {
            Some(serde_json::json!({
                "empty_note": "nesta situação o seletor original devolve Err('Não encontramos trechos completos nesta duração. Aumente a duração dos cortes e tente novamente.')"
            }))
        } else {
            None
        },
    }
}

type DpCell = (i64, f64, Vec<usize>); // (soma, -soma_starts, caminho em índices de `all` ordenada)

fn better_cell(candidate: &DpCell, current: &DpCell) -> bool {
    candidate.0 > current.0 || (candidate.0 == current.0 && candidate.1 > current.1)
}

/// Weighted interval scheduling: maximiza (soma de scores, nº de cortes,
/// -soma de starts) sujeito a não-sobreposição e no máximo `count` cortes.
pub fn dp(mut all: Vec<Clip>, options: &Options) -> FinalOut {
    let started = Instant::now();
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let n = all.len();
    let kmax = options.count;
    let mut empty_out = FinalOut {
        strategy: "dp".into(),
        elapsed_s: started.elapsed().as_secs_f64(),
        clips: Vec::new(),
        discards: Vec::new(),
        fallback: None,
        details: None,
    };
    if n == 0 {
        return empty_out;
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| all[a].end.total_cmp(&all[b].end).then(a.cmp(&b)));
    // best[i][k]: melhor escolha usando os i primeiros candidatos da ordem
    // (por fim crescente) com exatamente k cortes.
    let mut best: Vec<Vec<Option<DpCell>>> = vec![vec![None; kmax + 1]; n + 1];
    best[0][0] = Some((0, 0.0, Vec::new()));
    for i in 1..=n {
        let idx = order[i - 1];
        // m = tamanho do maior prefixo cujo fim não passa do início do atual
        let mut m = 0usize;
        while m < i - 1 && all[order[m]].end <= all[idx].start {
            m += 1;
        }
        for k in 0..=kmax {
            let mut current = best[i - 1][k].clone();
            if k >= 1 {
                if let Some((sum, neg, path)) = &best[m][k - 1] {
                    let mut new_path = path.clone();
                    new_path.push(idx);
                    let candidate: DpCell = (
                        sum + i64::from(all[idx].score),
                        neg - all[idx].start,
                        new_path,
                    );
                    let replace = current
                        .as_ref()
                        .map(|cur| better_cell(&candidate, cur))
                        .unwrap_or(true);
                    if replace {
                        current = Some(candidate);
                    }
                }
            }
            best[i][k] = current;
        }
    }
    let mut winner: Option<(usize, DpCell)> = None;
    for k in 0..=kmax {
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
    if let Some((k, (_, _, path))) = winner {
        let chosen: std::collections::HashSet<usize> = path.iter().copied().collect();
        empty_out.details = Some(serde_json::json!({
            "chosen_count": k,
            "score_sum": path.iter().map(|&i| i64::from(all[i].score)).sum::<i64>(),
        }));
        let mut clips: Vec<Clip> = Vec::new();
        for (i, clip) in all.iter().enumerate() {
            if chosen.contains(&i) {
                clips.push(clip.clone());
            } else {
                empty_out.discards.push(discard_of(
                    clip,
                    "não escolhido pelo ótimo de soma (dp)".into(),
                ));
            }
        }
        clips.sort_by(|a, b| a.start.total_cmp(&b.start));
        empty_out.clips = clips;
    }
    empty_out.elapsed_s = started.elapsed().as_secs_f64();
    empty_out
}

fn overlap_ratio(a: &Clip, b: &Clip) -> f64 {
    let inter = a.end.min(b.end) - a.start.max(b.start);
    if inter <= 0.0 {
        return 0.0;
    }
    inter / (a.end - a.start).min(b.end - b.start)
}

/// FÓRMULA EXATA da política `dedupe` por sobreposição (contraprova G1):
///   inter = min(a.fim, b.fim) - max(a.início, b.início)
///   razão = inter / min(duração_a, duração_b)      [denominador: o MENOR]
///   remove B quando razão(B, A_já_mantido) >= 0,5, percorrendo o conjunto
///   ordenado por (nota desc, início asc) — mantém sempre o de maior nota.
pub fn composition_dedupe50_dp(all: Vec<Clip>, options: &Options) -> FinalOut {
    let (pool, _discards) = dedupe(all, 0.5);
    let mut out = dp(pool, options);
    out.strategy = "dedupe50+dp".into();
    out
}

/// Política de equivalência por cobertura de falas — **REFUTADA COMO REGRA
/// GERAL pela revisão adversarial**: cobertura idêntica NÃO implica janela
/// idêntica, e o candidato removido pode ser o único temporalmente
/// compatível com um terceiro (ver teste
/// `contraprova_revisao_dedupe_equivalente_destrui_otimo_sem_ancora`).
/// A política preserva o ótimo APENAS sob a âncora do coletor do app
/// (start = início de segmento e end = fim de segmento/duração —
/// selection.rs:61-78) — condição que deixa de valer depois de
/// `scene_regions::refine` na produção. Conclusão: NÃO aplicar poda
/// prévia à DP; manter apenas como instrumento de apresentação.
pub fn dedupe_equivalent(
    mut all: Vec<Clip>,
    segments: &[Segment],
) -> (Vec<Clip>, Vec<Discard>) {
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let coverage = |clip: &Clip| -> Vec<usize> {
        segments
            .iter()
            .enumerate()
            .filter(|(_, s)| s.start < clip.end && s.end > clip.start)
            .map(|(i, _)| i)
            .collect()
    };
    let mut kept: Vec<(Vec<usize>, Clip)> = Vec::new();
    let mut discards: Vec<Discard> = Vec::new();
    for clip in all {
        let set = coverage(&clip);
        if let Some((_, keeper)) = kept.iter().find(|(kset, _)| *kset == set) {
            discards.push(discard_of(
                &clip,
                format!(
                    "equivalência demonstrada: mesma cobertura de falas que {}… [{:.0}s–{:.0}s]",
                    &keeper.id[..keeper.id.len().min(8)],
                    keeper.start,
                    keeper.end
                ),
            ));
        } else {
            kept.push((set, clip));
        }
    }
    (kept.into_iter().map(|(_, clip)| clip).collect(), discards)
}

/// Enumeração exaustiva INDEPENDENTE (referência para validar a DP).
/// Retorna (soma, cardinalidade, índices escolhidos) do ótimo sob o
/// objetivo pedido: max (soma, cardinalidade) — contrato atual do app
/// (teto) — ou max (cardinalidade, soma) — alternativa de produto,
/// usada apenas para DEMONSTRAR a diferença.
pub fn brute_force(
    all: &[Clip],
    count: usize,
    cardinality_first: bool,
) -> (i64, usize, Vec<usize>) {
    let n = all.len();
    assert!(n <= 16, "brute_force é para conjuntos pequenos");
    let mut best: Option<((i64, i64, f64), Vec<usize>)> = None;
    for mask in 0u32..(1u32 << n) {
        let chosen: Vec<usize> = (0..n).filter(|i| mask & (1u32 << i) != 0).collect();
        if chosen.len() > count || chosen.is_empty() {
            continue;
        }
        let compatible = chosen.iter().enumerate().all(|(i, &a)| {
            chosen[i + 1..]
                .iter()
                .all(|&b| all[a].start >= all[b].end || all[a].end <= all[b].start)
        });
        if !compatible {
            continue;
        }
        let sum: i64 = chosen.iter().map(|&i| i64::from(all[i].score)).sum();
        let neg_starts: f64 = -chosen.iter().map(|&i| all[i].start).sum::<f64>();
        // critério de melhor (não afeta o formato do retorno)
        let value = if cardinality_first {
            (chosen.len() as i64, sum, neg_starts)
        } else {
            (sum, chosen.len() as i64, neg_starts)
        };
        let better = best.as_ref().map_or(true, |(v, _)| {
            value.0 > v.0
                || (value.0 == v.0 && value.1 > v.1)
                || (value.0 == v.0 && value.1 == v.1 && value.2 > v.2)
        });
        if better {
            best = Some((value, chosen));
        }
    }
    match best {
        Some((_, chosen)) => {
            let sum: i64 = chosen.iter().map(|&i| i64::from(all[i].score)).sum();
            (sum, chosen.len(), chosen)
        }
        None => (0, 0, Vec::new()),
    }
}

/// Validador determinístico (LCG próprio, sem dependências): gera cenários
/// pequenos e compara a DP com a enumeração exaustiva por VALOR (soma e
/// cardinalidade do ótimo sob o mesmo objetivo).
pub struct Crosscheck {
    pub scenarios: usize,
    pub failures: Vec<String>,
}

pub fn crosscheck_dp(scenarios: usize) -> Crosscheck {
    let mut state: u64 = 0x9E3779B97F4A7C15;
    let mut rng = move || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (state >> 33) as u32
    };
    let mut result = Crosscheck {
        scenarios: 0,
        failures: Vec::new(),
    };
    let mut check = |pool: Vec<Clip>, count: usize, tag: &str, cs: &mut Crosscheck| {
        let options = Options {
            min_seconds: 15.0,
            max_seconds: 90.0,
            count,
            format: Some("9:16".into()),
        };
        let out = dp(pool.clone(), &options);
        let dp_sum: i64 = out.clips.iter().map(|c| i64::from(c.score)).sum();
        let (bf_sum, bf_count, _) = brute_force(&pool, count, false);
        cs.scenarios += 1;
        if dp_sum != bf_sum || out.clips.len() != bf_count {
            cs.failures.push(format!(
                "{tag}: dp=({dp_sum},{}) brute=({bf_sum},{bf_count}) pool={:?}",
                out.clips.len(),
                pool.iter().map(|c| (c.id.clone(), c.start, c.end, c.score)).collect::<Vec<_>>()
            ));
        }
    };
    for iteration in 0..scenarios {
        let n = 1 + (rng() % 8) as usize;
        let mut pool = Vec::new();
        for i in 0..n {
            // parte fracionária determinística exercita fronteiras com épsilon
            let start = (rng() % 60) as f64 + (rng() % 100) as f64 / 100.0;
            let end = start + 1.0 + (rng() % 25) as f64 + (rng() % 100) as f64 / 100.0;
            let score = (rng() % 101) as u8;
            pool.push(clip_synthetic(&format!("c{i}"), start, end, score));
        }
        let count = 1 + (rng() % 4) as usize;
        check(pool, count, &format!("random-{iteration}"), &mut result);
    }
    // Casos estruturais fixos (limites conhecidos da DP)
    let empty: Vec<Clip> = Vec::new();
    check(empty, 3, "vazio", &mut result);
    check(
        vec![
            clip_synthetic("a", 0.0, 10.0, 50),
            clip_synthetic("b", 10.0, 20.0, 50),
            clip_synthetic("c", 20.0, 30.0, 50),
        ],
        2,
        "encostados",
        &mut result,
    );
    check(
        vec![
            clip_synthetic("dup1", 5.0, 25.0, 70),
            clip_synthetic("dup2", 5.0, 25.0, 70),
            clip_synthetic("outro", 40.0, 60.0, 60),
        ],
        3,
        "duplicatas-exatas",
        &mut result,
    );
    check(
        vec![
            clip_synthetic("x", 0.0, 40.0, 80),
            clip_synthetic("y", 10.0, 50.0, 80),
            clip_synthetic("z", 20.0, 60.0, 80),
        ],
        2,
        "empates-de-nota",
        &mut result,
    );
    let permut_base = vec![
        clip_synthetic("p", 0.0, 20.0, 60),
        clip_synthetic("q", 15.0, 35.0, 70),
        clip_synthetic("r", 30.0, 55.0, 65),
    ];
    for (name, order) in [
        ("perm-abc", vec![0usize, 1, 2]),
        ("perm-cab", vec![2, 0, 1]),
        ("perm-bca", vec![1, 2, 0]),
    ] {
        check(
            order.into_iter().map(|i| permut_base[i].clone()).collect(),
            2,
            name,
            &mut result,
        );
    }
    check(
        vec![
            clip_synthetic("e1", 0.0, 10.0 + 1e-9, 55),
            clip_synthetic("e2", 10.0 + 1e-9, 20.0, 55),
            clip_synthetic("e3", 19.999999999, 30.0, 60),
        ],
        3,
        "encostados-com-epsilon",
        &mut result,
    );
    check(permut_base.clone(), 10, "count-maior-que-n", &mut result);
    result
}

fn clip_synthetic(id: &str, start: f64, end: f64, score: u8) -> Clip {
    Clip {
        id: id.into(),
        start,
        end,
        title: String::new(),
        score,
        reasons: Vec::new(),
        review: super::types::Review::Pending,
        format: Some("9:16".into()),
        analysis: None,
        analysis_error: None,
    }
}

/// Dedupe por sobreposição alta, mantendo o candidato de maior nota
/// (conceito do SupoClip; implementação própria).
pub fn dedupe(mut all: Vec<Clip>, max_ratio: f64) -> (Vec<Clip>, Vec<Discard>) {
    all.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let mut kept: Vec<Clip> = Vec::new();
    let mut discards: Vec<Discard> = Vec::new();
    for clip in all {
        let hit = kept.iter().find(|k| overlap_ratio(&clip, k) >= max_ratio);
        if let Some(keeper) = hit {
            discards.push(discard_of(
                &clip,
                format!(
                    "dedupe: sobreposição ≥{:.0}% com candidato de nota maior ({}…) [{:.0}s–{:.0}s]",
                    max_ratio * 100.0,
                    &keeper.id[..keeper.id.len().min(8)],
                    keeper.start,
                    keeper.end
                ),
            ));
        } else {
            kept.push(clip);
        }
    }
    (kept, discards)
}

fn snippet(segments: &[Segment], start: f64, end: f64, max_chars: usize) -> String {
    let mut text = segments
        .iter()
        .filter(|s| s.start < end && s.end > start)
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if text.chars().count() > max_chars {
        text = text.chars().take(max_chars).collect::<String>() + "…";
    }
    text
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JointReply {
    picks: Vec<JointPick>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JointPick {
    id: String,
    score: u8,
    reason: String,
}

pub fn joint(
    base: &Path,
    scratch: &Path,
    all: Vec<Clip>,
    segments: &[Segment],
    options: &Options,
    control: &ProcessControl,
) -> FinalOut {
    let started = Instant::now();
    let (pool, mut discards) = dedupe(all.clone(), 0.5);
    let mut pool = pool;
    if pool.len() > 16 {
        for clip in pool.split_off(16) {
            discards.push(discard_of(
                &clip,
                "não apresentado ao rerank (cap de 16 candidatos)".into(),
            ));
        }
    }
    let presented = pool.len();
    let labels: Vec<String> = (1..=pool.len()).map(|i| format!("C{i}")).collect();
    let candidates: Vec<serde_json::Value> = pool
        .iter()
        .enumerate()
        .map(|(i, c)| {
            serde_json::json!({
                "id": labels[i],
                "start": (c.start * 1000.0).round() / 1000.0,
                "end": (c.end * 1000.0).round() / 1000.0,
                "firstScore": c.score,
                "text": snippet(segments, c.start, c.end, 420),
            })
        })
        .collect();
    let data = serde_json::json!({"limit": options.count, "candidates": candidates});
    let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["picks"],"properties":{"picks":{"type":"array","maxItems":options.count,"items":{
        "type":"object","additionalProperties":false,"required":["id","score","reason"],"properties":{
            "id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}}}}}});
    let prompt = match text_engine::prompt(include_str!("joint-prompt.txt"), &data) {
        Ok(value) => value,
        Err(error) => {
            return joint_fallback(all, options, started, format!("montagem do prompt: {error}"))
        }
    };
    let reply = text_engine::generate(
        base,
        scratch,
        "rerank-joint",
        &prompt,
        &schema,
        1200,
        control,
    )
    .map_err(|e| e.to_string())
    .and_then(|output| {
        serde_json::Deserializer::from_str(output.trim())
            .into_iter::<JointReply>()
            .next()
            .ok_or_else(|| "resposta vazia".to_string())
            .and_then(|value| value.map_err(|e| format!("JSON inválido: {e}")))
    });
    let picks = match reply {
        Ok(value) if !value.picks.is_empty() => value.picks,
        Ok(_) => {
            return joint_fallback(all, options, started, "rerank retornou zero escolhas".into())
        }
        Err(error) => {
            return joint_fallback(all, options, started, format!("resposta inválida: {error}"))
        }
    };
    let mut chosen: Vec<Clip> = Vec::new();
    let mut picks_raw: Vec<serde_json::Value> = Vec::new();
    let mut beyond_limit: Vec<String> = Vec::new();
    let mut invalid_picks: Vec<String> = Vec::new();
    for pick in picks {
        picks_raw.push(serde_json::json!({
            "id": pick.id, "score": pick.score, "reason": pick.reason,
        }));
        if chosen.len() == options.count {
            beyond_limit.push(pick.id);
            continue;
        }
        let index = match pick.id.strip_prefix('C').and_then(|n| n.parse::<usize>().ok()) {
            Some(number) if number >= 1 && number <= pool.len() => number - 1,
            _ => {
                invalid_picks.push(pick.id);
                continue;
            }
        };
        let mut clip = pool[index].clone();
        if chosen.iter().any(|other| overlaps(&clip, other)) {
            discards.push(discard_of(
                &clip,
                "rerank: conflita no tempo com escolha anterior do próprio rerank".into(),
            ));
            continue;
        }
        clip.score = pick.score;
        clip.reasons.push(format!("Rerank conjunto: {}", pick.reason));
        chosen.push(clip);
    }
    if chosen.is_empty() {
        return joint_fallback(all, options, started, "nenhuma escolha do rerank validou".into());
    }
    FinalOut {
        strategy: "joint".into(),
        elapsed_s: started.elapsed().as_secs_f64(),
        clips: chosen,
        discards,
        fallback: None,
        details: Some(serde_json::json!({
            "presented": presented,
            "picks": picks_raw,
            "picks_beyond_limit": beyond_limit,
            "invalid_picks": invalid_picks,
        })),
    }
}

fn joint_fallback(all: Vec<Clip>, options: &Options, started: Instant, why: String) -> FinalOut {
    let mut out = greedy(all, options);
    out.strategy = "joint".into();
    out.fallback = Some(format!(
        "{why}; aplicada a finalização greedy 1:1 (idêntica a A)"
    ));
    out.elapsed_s = started.elapsed().as_secs_f64();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clips::types::Review;

    fn clip(id: &str, start: f64, end: f64, score: u8) -> Clip {
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
    fn options(count: usize) -> Options {
        Options {
            min_seconds: 15.0,
            max_seconds: 90.0,
            count,
            format: Some("9:16".into()),
        }
    }

    #[test]
    fn greedy_reproduz_comportamento_do_original_na_armadilha() {
        let all = vec![
            clip("alfa", 30.0, 90.0, 90),
            clip("beta", 0.0, 35.0, 75),
            clip("gamma", 85.0, 120.0, 75),
        ];
        let out = greedy(all, &options(2));
        assert_eq!(out.clips.len(), 1);
        assert_eq!(out.clips[0].id, "alfa");
        assert_eq!(out.discards.len(), 2);
    }

    #[test]
    fn dp_recupera_os_dois_medianos_onde_o_guloso_entrega_um() {
        let all = vec![
            clip("alfa", 30.0, 90.0, 90),
            clip("beta", 0.0, 35.0, 75),
            clip("gamma", 85.0, 120.0, 75),
        ];
        let out = dp(all, &options(2));
        assert_eq!(out.clips.len(), 2);
        let ids: Vec<&str> = out.clips.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"beta") && ids.contains(&"gamma"));
    }

    #[test]
    fn dp_nunca_pior_que_greedy_em_soma() {
        let all = vec![
            clip("a", 0.0, 30.0, 80),
            clip("b", 25.0, 60.0, 70),
            clip("c", 55.0, 90.0, 65),
            clip("d", 85.0, 120.0, 60),
            clip("e", 20.0, 100.0, 95),
        ];
        let g = greedy(all.clone(), &options(3));
        let d = dp(all, &options(3));
        let gsum: i64 = g.clips.iter().map(|c| i64::from(c.score)).sum();
        let dsum: i64 = d.clips.iter().map(|c| i64::from(c.score)).sum();
        assert!(dsum >= gsum);
        assert!(d
            .clips
            .iter()
            .enumerate()
            .all(|(i, a)| d.clips[i + 1..]
                .iter()
                .all(|b| a.start >= b.end || a.end <= b.start)));
    }

    #[test]
    fn dedupe_mantem_maior_nota_e_rejeita_duplicada_de_janela() {
        let all = vec![
            clip("alfa", 30.0, 90.0, 90),
            clip("alfa2", 31.0, 91.0, 89),
            clip("beta", 0.0, 35.0, 75),
        ];
        let (kept, discards) = dedupe(all, 0.5);
        assert!(kept.iter().any(|c| c.id == "alfa"));
        assert!(!kept.iter().any(|c| c.id == "alfa2"));
        assert_eq!(discards.len(), 1);
        assert!(kept.iter().any(|c| c.id == "beta"));
    }

    #[test]
    fn contraprova_r2_dedupe50_destrui_o_otimo_na_composicao() {
        let all = vec![
            clip("longo", 0.0, 60.0, 90),
            clip("esquerda", 0.0, 30.0, 75),
            clip("direita", 30.0, 60.0, 75),
        ];
        let puro = dp(all.clone(), &options(2));
        assert_eq!(puro.clips.len(), 2);
        assert_eq!(
            puro.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(),
            150
        );
        let composto = composition_dedupe50_dp(all, &options(2));
        assert_eq!(composto.clips.len(), 1);
        assert_eq!(composto.clips[0].id, "longo");
        assert_eq!(
            composto
                .clips
                .iter()
                .map(|c| i64::from(c.score))
                .sum::<i64>(),
            90
        );
    }

    fn four_segments() -> Vec<Segment> {
        (0..4)
            .map(|i| Segment {
                id: i.to_string(),
                start: i as f64 * 10.0,
                end: i as f64 * 10.0 + 10.0,
                text: "fala".into(),
                words: vec![],
            })
            .collect()
    }

    #[test]
    fn dedupe_equivalente_preserva_candidatos_de_coberturas_diferentes() {
        let segments = four_segments();
        let all = vec![
            clip("longo", 0.0, 40.0, 90),
            clip("esquerda", 0.0, 20.0, 75),
            clip("direita", 20.0, 40.0, 75),
        ];
        let (kept, discards) = dedupe_equivalent(all, &segments);
        assert_eq!(kept.len(), 3);
        assert!(discards.is_empty());
    }

    #[test]
    fn dedupe_equivalente_remove_so_coberturas_identicas() {
        let segments = four_segments();
        let all = vec![
            clip("a", 0.0, 20.0, 80),
            clip("b", 5.0, 15.0, 60), // cobertura {0,1} idêntica à de "a"
            clip("c", 20.0, 40.0, 70),
        ];
        let (kept, discards) = dedupe_equivalent(all, &segments);
        assert_eq!(kept.len(), 2);
        assert_eq!(discards.len(), 1);
        assert_eq!(discards[0].id, "b");
    }

    #[test]
    fn max_soma_e_max_quantidade_sao_objetivos_diferentes() {
        let all = vec![
            clip("longo", 0.0, 60.0, 100),
            clip("esquerda", 0.0, 30.0, 49),
            clip("direita", 30.0, 60.0, 49),
        ];
        let soma = dp(all.clone(), &options(2));
        assert_eq!(soma.clips.len(), 1);
        assert_eq!(
            soma.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(),
            100
        );
        let (bf_soma, bf_n, _) = brute_force(&all, 2, false);
        assert_eq!((bf_soma, bf_n), (100, 1));
        let (bf_q, bf_qn, picks) = brute_force(&all, 2, true);
        assert_eq!((bf_q, bf_qn), (98, 2));
        assert_eq!(picks.len(), 2);
    }

    #[test]
    fn crosscheck_dp_contra_enumeracao_exaustiva() {
        let result = crosscheck_dp(240);
        assert_eq!(result.failures.len(), 0, "falhas: {:?}", result.failures);
        assert!(result.scenarios >= 248);
    }

    #[test]
    fn contraprova_revisao_dedupe_equivalente_destrui_otimo_sem_ancora() {
        // Contraprova construída pela revisão adversarial (rodada 1):
        // segmentos s0=[0,10) s1=[10,16) s2=[16,45); A e B cobrem os mesmos
        // {s0,s1,s2}, mas janelas distintas → B é o único compatível com C.
        let segments = vec![
            Segment { id: "0".into(), start: 0.0, end: 10.0, text: "a".into(), words: vec![] },
            Segment { id: "1".into(), start: 10.0, end: 16.0, text: "b".into(), words: vec![] },
            Segment { id: "2".into(), start: 16.0, end: 45.0, text: "c".into(), words: vec![] },
        ];
        let pool = vec![
            clip("A", 0.0, 30.0, 90),
            clip("B", 5.0, 20.0, 60),
            clip("C", 20.0, 45.0, 95),
        ];
        let otimo = dp(pool.clone(), &options(2));
        assert_eq!(otimo.clips.len(), 2);
        assert_eq!(
            otimo.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(),
            155
        );
        let (kept, discards) = dedupe_equivalent(pool, &segments);
        assert_eq!(discards.len(), 1);
        assert_eq!(discards[0].id, "B");
        let apos_poda = dp(kept, &options(2));
        assert_eq!(apos_poda.clips.len(), 1);
        assert_eq!(
            apos_poda.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(),
            95
        );
    }

    #[test]
    fn snippet_respeita_o_intervalo_e_trunca() {
        let segments: Vec<Segment> = (0..10)
            .map(|i| Segment {
                id: i.to_string(),
                start: i as f64 * 10.0,
                end: i as f64 * 10.0 + 8.0,
                text: "frase de exemplo com conteudo suficiente. ".repeat(2),
                words: vec![],
            })
            .collect();
        let text = snippet(&segments, 5.0, 25.0, 60);
        assert!(text.chars().count() <= 61);
        assert!(!text.is_empty());
    }
}
