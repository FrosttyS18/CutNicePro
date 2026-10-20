//! Experimento A/B de seleção de cortes do CutNicePro.
//! Uso (a partir de experiments/clip-selection-ab, com CNP_ANALYSIS_HOME
//! apontando para .tooling/vendor/analysis):
//!   clip-selection-ab controlled
//!   clip-selection-ab collect   [--count N] [--min S] [--max S]
//!   clip-selection-ab finalize --strategy greedy|dp|joint

mod clips;
mod file_output;
mod transcription;

use clips::finalize::{self, FinalOut};
use clips::selection_x::{self, Collected};
use clips::types::{Clip, Options, Review};
use std::path::PathBuf;
use transcription::process::ProcessControl;
use transcription::types::Transcript;

const DEFAULT_COUNT: usize = 3;
const DEFAULT_MIN: f64 = 15.0;
const DEFAULT_MAX: f64 = 90.0;
const DEFAULT_FORMAT: &str = "9:16";

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("controlled") => controlled(),
        Some("counterproof") => counterproof(),
        Some("crosscheck") => crosscheck_cmd(),
        Some("build-v2") => build_v2_cmd(),
        Some("rerank-full") => rerank_full_cmd(),
        Some("flow") => flow_cmd(&args),
        Some("collect") => collect_cmd(&args),
        Some("finalize") => finalize_cmd(&args),
        _ => {
            eprintln!("uso: clip-selection-ab <controlled|counterproof|crosscheck|build-v2|rerank-full|collect|finalize --strategy S [--candidates P]>");
            std::process::exit(2);
        }
    }
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|p| args.get(p + 1))
        .cloned()
}

fn write_json(path: &str, value: &impl serde::Serialize) {
    let body = serde_json::to_string_pretty(value).expect("serialização");
    std::fs::write(path, body).expect("gravação de relatório");
    println!("gravado: {path}");
}

fn mk_options(count: usize) -> Options {
    Options {
        min_seconds: DEFAULT_MIN,
        max_seconds: DEFAULT_MAX,
        count,
        format: Some(DEFAULT_FORMAT.into()),
    }
}

fn mkclip(id: &str, start: f64, end: f64, score: u8) -> Clip {
    Clip {
        id: id.into(),
        start,
        end,
        title: String::new(),
        score,
        reasons: Vec::new(),
        review: Review::Pending,
        format: Some(DEFAULT_FORMAT.into()),
        analysis: None,
        analysis_error: None,
    }
}

fn summarize(out: &FinalOut) -> serde_json::Value {
    serde_json::json!({
        "count": out.clips.len(),
        "score_sum": out.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(),
        "picks": out
            .clips
            .iter()
            .map(|c| serde_json::json!({
                "id": c.id, "start": c.start, "end": c.end, "score": c.score,
            }))
            .collect::<Vec<_>>(),
        "discards": out.discards,
        "fallback": out.fallback,
    })
}

fn controlled() {
    let scenarios: Vec<(&str, &str, Vec<Clip>, usize)> = vec![
        (
            "S1-armadilha-central",
            "candidato central de nota alta cobre dois medianos compatíveis entre si",
            vec![
                mkclip("alfa", 30.0, 90.0, 90),
                mkclip("beta", 0.0, 35.0, 75),
                mkclip("gamma", 85.0, 120.0, 75),
            ],
            2,
        ),
        (
            "S2-duplicatas-de-janela",
            "candidatos quase duplicados vindos de janelas com sobreposição",
            vec![
                mkclip("alfa", 30.0, 90.0, 90),
                mkclip("alfa2", 31.0, 91.0, 89),
                mkclip("beta", 0.0, 35.0, 75),
                mkclip("gamma", 85.0, 120.0, 75),
                mkclip("delta", 122.0, 150.0, 70),
                mkclip("epsilon", 2.0, 40.0, 68),
            ],
            3,
        ),
        (
            "S3-controle-sem-conflito",
            "candidatos disjuntos: estratégias devem coincidir",
            vec![
                mkclip("p", 0.0, 30.0, 80),
                mkclip("q", 40.0, 70.0, 78),
                mkclip("r", 80.0, 110.0, 76),
            ],
            3,
        ),
    ];
    let mut results = Vec::new();
    for (name, note, candidates, count) in scenarios {
        let options = mk_options(count);
        let greedy = finalize::greedy(candidates.clone(), &options);
        let dp = finalize::dp(candidates.clone(), &options);
        results.push(serde_json::json!({
            "name": name,
            "note": note,
            "requested": count,
            "greedy": summarize(&greedy),
            "dp": summarize(&dp),
        }));
    }
    write_json(
        "reports/controlled.json",
        &serde_json::json!({
            "kind": "caso controlado determinístico (sem LLM)",
            "purpose": "demonstrar o efeito da ordem de seleção e descarte na limitação final",
            "scenarios": results,
        }),
    );
}

fn counterproof() {
    let options = mk_options(2);
    let r2 = vec![
        mkclip("longo", 0.0, 60.0, 90),
        mkclip("esquerda", 0.0, 30.0, 75),
        mkclip("direita", 30.0, 60.0, 75),
    ];
    let dp_puro = finalize::dp(r2.clone(), &options);
    let composto = finalize::composition_dedupe50_dp(r2.clone(), &options);
    let count_case = vec![
        mkclip("longo", 0.0, 60.0, 100),
        mkclip("esquerda", 0.0, 30.0, 49),
        mkclip("direita", 30.0, 60.0, 49),
    ];
    let (bf_soma, bf_n, _) = finalize::brute_force(&count_case, 2, false);
    let (bf_q, bf_qn, bf_picks) = finalize::brute_force(&count_case, 2, true);
    let soma_dp = finalize::dp(count_case.clone(), &options);
    write_json(
        "reports/counterproof.json",
        &serde_json::json!({
            "kind": "contraprovas determinísticas (sem LLM)",
            "referencia_independente": "external/contraprovas_selecao.py (+.json), enumeração exaustiva em Python fornecida pelo mantenedor; reproduzida aqui no código Rust do experimento",
            "contraprova_R2_dedupe_antes_da_dp": {
                "candidatos": r2.iter().map(|c| serde_json::json!({"nome": c.id, "intervalo_s": [c.start, c.end], "nota": c.score})).collect::<Vec<_>>(),
                "count": 2,
                "dp_sem_poda": {"cortes": dp_puro.clips.len(), "soma": dp_puro.clips.iter().map(|c| i64::from(c.score)).sum::<i64>()},
                "composicao_dedupe50_dp": {"cortes": composto.clips.len(), "soma": composto.clips.iter().map(|c| i64::from(c.score)).sum::<i64>(), "escolhido": composto.clips.first().map(|c| c.id.clone())},
                "formula_dedupe": "inter = min(fim_a, fim_b) - max(ini_a, ini_b); razao = inter / min(dur_a, dur_b); remove B se razao >= 0,5 contra já-mantido de nota maior (ordem: nota desc, início asc)",
                "conclusao": "CONFIRMADA: a deduplicação por sobreposição a 50% aplicada ANTES da DP destrói a solução ótima neste caso (2 cortes/soma 150 → 1 corte/soma 90)",
            },
            "objetivos_distintos_max_soma_vs_max_quantidade": {
                "candidatos": count_case.iter().map(|c| serde_json::json!({"nome": c.id, "intervalo_s": [c.start, c.end], "nota": c.score})).collect::<Vec<_>>(),
                "count": 2,
                "dp_max_soma_contrato_atual": {"cortes": soma_dp.clips.len(), "soma": soma_dp.clips.iter().map(|c| i64::from(c.score)).sum::<i64>()},
                "enumeracao_max_soma": {"soma": bf_soma, "cortes": bf_n},
                "enumeracao_max_quantidade_depois_soma": {"soma": bf_q, "cortes": bf_qn, "escolhidos": bf_picks},
                "conclusao": "objetivos diferentes, não defeito: o contrato vigente na UI/interno é TETO com qualidade por nota (max soma com até count); priorizar quantidade é decisão de produto não tomada aqui",
            },
        }),
    );
}

fn crosscheck_cmd() {
    let result = finalize::crosscheck_dp(240);
    write_json(
        "reports/crosscheck.json",
        &serde_json::json!({
            "kind": "validação da DP contra enumeração exaustiva independente (bitmask) — determinístico, sem LLM",
            "objetivo_comparado": "max (soma, cardinalidade) sob não-sobreposição e até count (contrato atual)",
            "gerador": "LCG determinístico (seed fixa 0x9E3779B97F4A7C15): n∈[1,8], count∈[1,4], start∈[0,60) com parte fracionária (centésimos), duração∈[1,~26) com parte fracionária, nota∈[0,100]",
            "casos_estruturais": ["vazio", "encostados (fim==início do próximo)", "encostados-com-epsilon (1e-9)", "duplicatas exatas", "empates de nota", "3 permutações do mesmo conjunto", "count > n"],
            "cenarios": result.scenarios,
            "falhas": result.failures,
            "veredito": if result.failures.is_empty() { "DP == enumeração em TODOS os cenários (por soma e cardinalidade)" } else { "DIVERGÊNCIA ENCONTRADA" },
        }),
    );
    println!(
        "cenários: {} | falhas: {}",
        result.scenarios,
        result.failures.len()
    );
    if !result.failures.is_empty() {
        std::process::exit(1);
    }
}

/// Construção CORRIGIDA dos candidatos (atualização 3): reaproveita as
/// respostas BRUTAS das janelas preservadas em scratch/selection-*-result.json
/// (nenhuma nova chamada de janela), aplica o contrato novo do app
/// (conform → recuperação por lote → descarte explícito) e grava
/// reports/candidates-v2.json + reports/build-v2-stats.json.
fn build_v2_cmd() {
    let transcript = match load_transcript("data/transcript-davyjones.json") {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    let duration: f64 = std::fs::read_to_string("data/media-duration.txt")
        .expect("data/media-duration.txt")
        .trim()
        .parse()
        .expect("duração numérica");
    let options = mk_options(DEFAULT_COUNT);
    let control = ProcessControl::default();
    let ranges = clips::selection::windows(&transcript.segments, options.max_seconds);
    let started = std::time::Instant::now();
    let mut all: Vec<Clip> = Vec::new();
    let mut stats: Vec<serde_json::Value> = Vec::new();
    for (index, range) in ranges.iter().enumerate() {
        let raw = std::fs::read_to_string(format!("scratch/selection-{index}-result.json"))
            .unwrap_or_else(|_| panic!("bruto da janela {index} ausente"));
        let reply = serde_json::Deserializer::from_str(raw.trim())
            .into_iter::<clips::selection::Reply>()
            .next()
            .and_then(|value| value.ok())
            .expect("primeiro JSON válido da resposta bruta");
        let limit = (options.count * 2).min(12);
        let mut invalid: Vec<clips::selection::Candidate> = Vec::new();
        let mut conformes = 0usize;
        let mut fora_do_range = 0usize;
        for candidate in reply.candidates.into_iter().take(limit) {
            if !range.contains(&candidate.first_id) || !range.contains(&candidate.last_id) {
                fora_do_range += 1;
                continue;
            }
            match clips::selection::conform(
                candidate,
                &transcript.segments,
                &transcript.media_id,
                duration,
                &options,
            ) {
                Ok(contender) => {
                    all.push(contender.clip);
                    conformes += 1;
                }
                Err(rejected) => invalid.push(rejected),
            }
        }
        let total_invalid = invalid.len();
        let mut reparadas = 0usize;
        let mut descartadas = 0usize;
        for rejected in invalid {
            for mut contender in clips::selection::repair_alternatives(
                rejected,
                &transcript.segments,
                &transcript.media_id,
                duration,
                &options,
            ) {
                // alternativa sem avaliação: score 0 no artefato (a nota
                // herdada é proveniência, não avaliação — evita viés nas
                // comparações; reasons registram a origem)
                contender.clip.score = 0;
                all.push(contender.clip);
                reparadas += 1;
            }
        }
        eprintln!(
            "[build-v2] janela {index}: {conformes} conformes, {total_invalid} inválidas, {reparadas} reparadas deterministicamente, {descartadas} descartadas"
        );
        stats.push(serde_json::json!({
            "janela": index,
            "propostas_brutas": limit,
            "fora_do_range": fora_do_range,
            "conformes": conformes,
            "invalidas": total_invalid,
            "reparadas_deterministicas": reparadas,
            "descartadas": descartadas,
        }));
    }
    let elapsed = started.elapsed().as_secs_f64();
    write_json(
        "reports/candidates-v2.json",
        &Collected {
            media_id: transcript.media_id.clone(),
            duration,
            options: clips::selection_x::OptionsOut {
                min_seconds: options.min_seconds,
                max_seconds: options.max_seconds,
                count: options.count,
                format: options.format.clone(),
            },
            windows: ranges.iter().map(|r| (r.start, r.end)).collect(),
            candidates_per_window: Vec::new(),
            candidates: all.clone(),
            elapsed_s: elapsed,
        },
    );
    write_json(
        "reports/build-v2-stats.json",
        &serde_json::json!({
            "kind": "construção corrigida sobre respostas brutas preservadas (0 chamadas de janela; apenas recuperação real)",
            "por_janela": stats,
            "candidatos_finais": all.len(),
            "elapsed_s": elapsed,
        }),
    );
}


/// FLUXO REAL (atualização 5): propostas brutas preservadas -> resolve()
/// de produção (construção + AVALIAÇÃO REAL do perfil + DP) -> semantic
/// REAL -> store::validate -> persistência em testdata/{perfil}/.
/// Orçamento declarado: por perfil, 1 avaliação em lote + até 3 análises
/// (<= 12 chamadas no total); temp=0; sem repetições; falhas contam.
#[allow(dead_code)]
struct FlowEvalReply {
    items: Vec<(String, u8, String)>,
    prompt_tokens: Option<u64>,
    gen_tokens: Option<u64>,
}

fn profile_prompt(profile: &str, system: &str, data: &serde_json::Value) -> String {
    let source = serde_json::to_string(data).unwrap_or_default().replace("<|", "< |");
    if profile == "a" {
        return format!(
            "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{source}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        );
    }
    format!(
        "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{source}<|im_end|>\n<|im_start|>assistant\n"
    )
}

fn parse_tokens_from_log(stem: &str) -> (Option<u64>, Option<u64>) {
    let mut prompt = None;
    let mut gen = None;
    for suffix in ["gpu", "cpu"] {
        let log = format!("{stem}-{suffix}.log");
        if let Ok(text) = std::fs::read_to_string(&log) {
            for line in text.lines() {
                if line.contains("prompt eval time") {
                    if let Some(value) = line.split(" ms / ").nth(1) {
                        prompt = value
                            .split_whitespace()
                            .next()
                            .and_then(|n| n.replace(',', "").parse::<u64>().ok());
                    }
                } else if line.contains("eval time") && line.contains(" runs") {
                    if let Some(value) = line.split(" ms / ").nth(1) {
                        gen = value
                            .split_whitespace()
                            .next()
                            .and_then(|n| n.replace(',', "").parse::<u64>().ok());
                    }
                }
            }
        }
    }
    (prompt, gen)
}

fn flow_cmd(args: &[String]) {
    let profile = flag(args, "--profile").unwrap_or_else(|| "a".into());
    let transcript = load_transcript("data/transcript-davyjones.json").expect("transcrição");
    let duration: f64 = std::fs::read_to_string("data/media-duration.txt")
        .expect("duration")
        .trim()
        .parse()
        .expect("num");
    let options = mk_options(DEFAULT_COUNT);
    let control = ProcessControl::default();
    let ranges = clips::selection::windows(&transcript.segments, options.max_seconds);
    let mut proposals: Vec<(std::ops::Range<usize>, Vec<clips::selection::Candidate>)> = Vec::new();
    for (index, range) in ranges.iter().enumerate() {
        let raw = std::fs::read_to_string(format!("scratch/selection-{index}-result.json"))
            .unwrap_or_else(|_| panic!("bruto da janela {index} ausente"));
        let reply = serde_json::Deserializer::from_str(raw.trim())
            .into_iter::<clips::selection::Reply>()
            .next()
            .and_then(|value| value.ok())
            .expect("bruto válido");
        proposals.push((
            range.clone(),
            reply.candidates.into_iter().take((options.count * 2).min(12)).collect(),
        ));
    }
    let pending_count = {
        // contagem prévia de pendentes para o relatório (mesma lógica do resolve)
        let mut total = 0usize;
        for (range, candidates) in &proposals {
            for candidate in candidates {
                if !range.contains(&candidate.first_id) || !range.contains(&candidate.last_id) {
                    continue;
                }
                if clips::selection::conform(
                    candidate.clone(),
                    &transcript.segments,
                    &transcript.media_id,
                    duration,
                    &options,
                )
                .is_err()
                {
                    total += clips::selection::repair_alternatives(
                        candidate.clone(),
                        &transcript.segments,
                        &transcript.media_id,
                        duration,
                        &options,
                    )
                    .len();
                }
            }
        }
        total
    };
    eprintln!("[flow-{profile}] pendentes previstos: {pending_count}");
    // avaliação por perfil EM LOTES de 8 (mesma política do evaluate_batch
    // de produção; ids E{base+n}; 2400 tokens por lote)
    let evaluate = |pending: &[Clip], segments: &[transcription::types::Segment]| -> Result<Vec<(String, u8, String)>, String> {
        let mut system = include_str!("clips/evaluate-prompt.txt").to_string();
        if profile != "a" {
            system = system.replace(" /no_think", "").replace("/no_think", "").trim().to_string();
        }
        let mut merged: Vec<(String, u8, String)> = Vec::new();
        for (chunk_index, chunk) in pending.chunks(8).enumerate() {
            let offset = chunk_index * 8;
            let labels: Vec<String> = (1..=chunk.len()).map(|i| format!("E{}", offset + i)).collect();
            let items: Vec<serde_json::Value> = chunk.iter().enumerate().map(|(i, clip)| {
                let text = segments.iter().filter(|s| s.start < clip.end && s.end > clip.start)
                    .map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
                let before = segments.iter().filter(|s| s.end <= clip.start + 1e-9).next_back().map(|s| s.text.clone());
                let after = segments.iter().filter(|s| s.start >= clip.end - 1e-9).next().map(|s| s.text.clone());
                serde_json::json!({
                    "id": labels[i],
                    "start": (clip.start*1000.0).round()/1000.0,
                    "end": (clip.end*1000.0).round()/1000.0,
                    "text": text,
                    "contextBefore": before,
                    "contextAfter": after,
                })
            }).collect();
            let data = serde_json::json!({"candidates": items});
            let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["items"],"properties":{"items":{"type":"array","maxItems":chunk.len(),"items":{
                "type":"object","additionalProperties":false,"required":["id","score","reason"],"properties":{
                    "id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}}}}}});
            let prompt = profile_prompt(&profile, &system, &data);
            let stem = format!("evaluate-flow-{profile}-{chunk_index}");
            let output = clips::text_engine::generate(
                &PathBuf::from("."), &PathBuf::from("./scratch"), &stem, &prompt, &schema, 2400, &control,
            )?;
            let reply = serde_json::Deserializer::from_str(output.trim())
                .into_iter::<clips::selection::EvaluationReply>()
                .next()
                .and_then(|v| v.ok())
                .ok_or("resposta de avaliação inválida")?;
            merged.extend(reply.items.into_iter().map(|item| (item.id, item.score, item.reason)));
        }
        Ok(merged)
    };
    let started = std::time::Instant::now();
    let mut chosen = clips::selection::resolve(
        &proposals,
        &transcript.segments,
        &transcript.media_id,
        duration,
        &options,
        &evaluate,
    )
    .expect("resolve");
    let resolve_elapsed = started.elapsed().as_secs_f64();
    let mut ptok: Option<u64> = None;
    let mut gtok: Option<u64> = None;
    {
        let mut total_p: u64 = 0;
        let mut total_g: u64 = 0;
        let mut found = false;
        for chunk_index in 0..=((pending_count + 7) / 8).max(1) {
            let (p, g) = parse_tokens_from_log(&format!("scratch/evaluate-flow-{profile}-{chunk_index}"));
            if let Some(p) = p { total_p += p; found = true; }
            if let Some(g) = g { total_g += g; found = true; }
        }
        if found { ptok = Some(total_p); gtok = Some(total_g); }
    }
    eprintln!(
        "[flow-{profile}] resolve: {} cortes em {resolve_elapsed:.1}s (avaliação ptok={ptok:?} gtok={gtok:?})",
        chosen.len()
    );
    // análise semântica REAL dos escolhidos (formato vigente A para TODOS os
    // perfis — variável controlada; declarado no relatório)
    let analysis_start = std::time::Instant::now();
    for clip in &mut chosen {
        clips::semantic::run(
            &PathBuf::from("."),
            &PathBuf::from("./scratch"),
            clip,
            &transcript.segments,
            &control,
        )
        .unwrap_or_else(|error| {
            eprintln!("[flow-{profile}] análise falhou: {error}");
        });
    }
    let analysis_elapsed = analysis_start.elapsed().as_secs_f64();
    let mut collection = clips::types::ClipCollection {
        version: 1,
        media_id: transcript.media_id.clone(),
        transcript_hash: clips::store::fingerprint(&transcript.segments).expect("hash"),
        clips: chosen,
    };
    collection
        .clips
        .sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    clips::store::validate(&collection, duration).expect("coleção válida");
    std::fs::create_dir_all(format!("testdata/{profile}")).expect("dir");
    std::fs::write(
        format!("testdata/{profile}/clips-test.json"),
        serde_json::to_string_pretty(&collection).expect("ser"),
    )
    .expect("persistência de teste");
    let report = serde_json::json!({
        "perfil": profile,
        "modelo": if profile == "c" { "Qwen3-4B-Instruct-2507 (models/home-c)" } else { "instalado vendor (Qwen3 4B Instruct Awq)" },
        "template": if profile == "a" { "vigente: think vazio + /no_think" } else { "oficial sem think e sem /no_think" },
        "amostragem": "temp 0, seed 42 (flags do text_engine)",
        "propostas_brutas": proposals.iter().map(|(_, c)| c.len()).sum::<usize>(),
        "pendentes_previstos": pending_count,
        "avaliacao_tokens": {"prompt": ptok, "geracao": gtok},
        "resolve_elapsed_s": resolve_elapsed,
        "analise_elapsed_s": analysis_elapsed,
        "clips": collection.clips.iter().map(|c| serde_json::json!({
            "start": c.start, "end": c.end, "score": c.score,
            "title": c.title,
            "abertura": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next().map(|s| s.text.clone()),
            "fechamento": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next_back().map(|s| s.text.clone()),
            "razoes": c.reasons,
        })).collect::<Vec<_>>(),
    });
    write_json(&format!("reports/flow-{profile}.json"), &report);
    eprintln!("[flow-{profile}] concluído");
}

fn rerank_full_cmd() {
    let collected: Collected = serde_json::from_str(
        &std::fs::read_to_string("reports/candidates-v2.json")
            .expect("reports/candidates-v2.json"),
    )
    .expect("candidates-v2.json válido");
    let transcript = load_transcript("data/transcript-davyjones.json").expect("transcrição");
    let options = mk_options(collected.options.count);
    let control = ProcessControl::default();
    let out = clips::finalize::rerank_full(
        &PathBuf::from("."),
        &PathBuf::from("./scratch"),
        &collected.candidates,
        &transcript.segments,
        &options,
        &control,
    );
    eprintln!(
        "rerank-full: {} corte(s), prompt_chars={}, fallback={:?}",
        out.clips.len(),
        out.details
            .as_ref()
            .and_then(|d| d.get("prompt_chars"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        out.fallback
    );
    write_json("reports/real-c2.json", &out);
}

fn load_transcript(path: &str) -> Result<Transcript, String> {
    let body = std::fs::read_to_string(path).map_err(|e| format!("transcrição: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("transcrição inválida: {e}"))
}

fn collect_cmd(args: &[String]) {
    let transcript_path = flag(args, "--transcript")
        .unwrap_or_else(|| "data/transcript-davyjones.json".to_string());
    let duration: f64 = std::fs::read_to_string("data/media-duration.txt")
        .expect("data/media-duration.txt")
        .trim()
        .parse()
        .expect("duração numérica");
    let count: usize = flag(args, "--count")
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_COUNT);
    let min: f64 = flag(args, "--min").and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_MIN);
    let max: f64 = flag(args, "--max").and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_MAX);
    let options = Options {
        min_seconds: min,
        max_seconds: max,
        count,
        format: Some(DEFAULT_FORMAT.into()),
    };
    options.validate().expect("opções válidas");
    let transcript = match load_transcript(&transcript_path) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    let control = ProcessControl::default();
    let collected = match selection_x::collect(
        &PathBuf::from("."),
        &PathBuf::from("./scratch"),
        &transcript.segments,
        &transcript.media_id,
        duration,
        &options,
        &control,
        |percent| eprintln!("[coleta] {percent}%"),
    ) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    eprintln!(
        "candidatos: {} em {} janela(s) [{:?}]",
        collected.candidates.len(),
        collected.windows.len(),
        collected.candidates_per_window
    );
    write_json("reports/candidates.json", &collected);
}

fn finalize_cmd(args: &[String]) {
    let strategy = flag(args, "--strategy").unwrap_or_else(|| "greedy".into());
    let source = flag(args, "--candidates").unwrap_or_else(|| "reports/candidates.json".into());
    let suffix = if source.contains("v2") { "b2" } else { "a1" };
    let collected: Collected = serde_json::from_str(
        &std::fs::read_to_string(&source).unwrap_or_else(|_| panic!("{source}")),
    )
    .expect("candidates json válido");
    let options = Options {
        min_seconds: collected.options.min_seconds,
        max_seconds: collected.options.max_seconds,
        count: collected.options.count,
        format: collected.options.format.clone(),
    };
    let all = collected.candidates.clone();
    let out = match strategy.as_str() {
        "greedy" => finalize::greedy(all, &options),
        "dp" => finalize::dp(all, &options),
        "joint" => {
            let transcript =
                load_transcript("data/transcript-davyjones.json").expect("transcrição");
            let control = ProcessControl::default();
            finalize::joint(
                &PathBuf::from("."),
                &PathBuf::from("./scratch"),
                all,
                &transcript.segments,
                &options,
                &control,
            )
        }
        other => {
            eprintln!("estratégia desconhecida: {other}");
            std::process::exit(2);
        }
    };
    eprintln!(
        "estratégia {strategy}: {} corte(s), {} descarte(s), fallback={:?}",
        out.clips.len(),
        out.discards.len(),
        out.fallback
    );
    write_json(&format!("reports/real-{suffix}-{strategy}.json"), &out);
}
