import io
p = r'C:\CutNicePro\experiments\clip-selection-ab\src\main.rs'
s = io.open(p, encoding='utf-8').read()

flow = '''
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
            "<|im_start|>system\\n{system}<|im_end|>\\n<|im_start|>user\\n{source}<|im_end|>\\n<|im_start|>assistant\\n<think>\\n\\n</think>\\n\\n"
        );
    }
    format!(
        "<|im_start|>system\\n{system}<|im_end|>\\n<|im_start|>user\\n{source}<|im_end|>\\n<|im_start|>assistant\\n"
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
    let evaluate = |pending: &[Clip], segments: &[transcription::types::Segment]| -> Result<Vec<(String, u8, String)>, String> {
        let mut system = include_str!("../src/clips/evaluate-prompt.txt").to_string();
        if profile != "a" {
            system = system.replace(" /no_think", "").replace("/no_think", "").trim().to_string();
        }
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
                    .next_back()
                    .map(|s| s.text.clone());
                let after = segments
                    .iter()
                    .filter(|s| s.start >= clip.end - 1e-9)
                    .next()
                    .map(|s| s.text.clone());
                serde_json::json!({
                    "id": labels[i],
                    "start": (clip.start*1000.0).round()/1000.0,
                    "end": (clip.end*1000.0).round()/1000.0,
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
        let prompt = profile_prompt(&profile, &system, &data);
        let stem = format!("evaluate-flow-{profile}");
        let output = clips::text_engine::generate(
            &PathBuf::from("."),
            &PathBuf::from("./scratch"),
            &stem,
            &prompt,
            &schema,
            1600,
            &control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<clips::selection::EvalReply>()
            .next()
            .and_then(|v| v.ok())
            .ok_or("resposta de avaliação inválida")?;
        Ok(reply.items.into_iter().map(|item| (item.id, item.score, item.reason)).collect())
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
    let (ptok, gtok) = parse_tokens_from_log(&format!("scratch/evaluate-flow-{profile}"));
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
'''
marker = "fn rerank_full_cmd() {"
assert marker in s
s = s.replace(marker, flow + "\n" + marker, 1)
s = s.replace('Some("rerank-full") => rerank_full_cmd(),', 'Some("rerank-full") => rerank_full_cmd(),\n        Some("flow") => flow_cmd(&args),')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('flow_cmd adicionado')
