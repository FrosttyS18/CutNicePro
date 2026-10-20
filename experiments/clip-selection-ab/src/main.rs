//! Experimento A/B de seleção de cortes do CutNicePro.
//! Uso (a partir de experiments/clip-selection-ab, com CNP_ANALYSIS_HOME
//! apontando para .tooling/vendor/analysis):
//!   clip-selection-ab controlled
//!   clip-selection-ab collect   [--count N] [--min S] [--max S]
//!   clip-selection-ab finalize --strategy greedy|dp|joint

mod clips;
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
                Ok(clip) => {
                    all.push(clip);
                    conformes += 1;
                }
                Err(rejected) => invalid.push(rejected),
            }
        }
        let total_invalid = invalid.len();
        let mut reparadas = 0usize;
        let mut descartadas = 0usize;
        for rejected in invalid {
            match clips::selection::repair(
                rejected,
                &transcript.segments,
                &transcript.media_id,
                duration,
                &options,
            ) {
                Some(clip) => {
                    all.push(clip);
                    reparadas += 1;
                }
                None => descartadas += 1,
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
