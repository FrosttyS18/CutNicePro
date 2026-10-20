import io, re

p = r'C:\CutNicePro\experiments\clip-selection-ab\src\main.rs'
s = io.open(p, encoding='utf-8').read()

# ── REMOVER o discover_cmd quebrado inteiro ──
start_marker = '/// ESTRATÉGIA DE DESCOBERTA (atualização 6)'
end_marker = '\nfn rerank_full_cmd() {'
si = s.index(start_marker)
ei = s.index(end_marker, si)
s = s[:si] + s[ei:]

# ── INSERIR versão limpa ──
discover = '''/// ESTRATÉGIA DE DESCOBERTA (atualização 6): cada perfil lê a transcrição
/// inteira e gera SEUS PRÓPRIOS candidatos. Todos recebem avaliação pelo
/// procedimento do perfil — sem misturar notas históricas.
/// A (non-thinking, grammar) / B (thinking, sem grammar na descoberta) /
/// C (2507) / D (gemma-3-12b, "Gemma 4" não existe — bloqueio registrado).
/// Orçamento: 1 descoberta + 1-2 avaliações por perfil ≤ 12 total; temp=0.
fn discover_cmd(args: &[String]) {
    let profile = flag(args, "--profile").unwrap_or_else(|| "a".into());
    let transcript = load_transcript("data/transcript-davyjones.json").expect("transcrição");
    let duration: f64 = std::fs::read_to_string("data/media-duration.txt")
        .expect("duration").trim().parse().expect("num");
    let options = mk_options(DEFAULT_COUNT);
    let control = ProcessControl::default();
    let t0 = std::time::Instant::now();
    let seg_count = transcript.segments.len();

    // ══ ETAPA 1: DESCOBERTA (cada perfil gera os SEUS candidatos) ══
    let data = serde_json::json!({
        "minSeconds": options.min_seconds,
        "maxSeconds": options.max_seconds,
        "limit": (options.count * 2).min(12),
        "speech": transcript.segments.iter().map(|s| {
            serde_json::json!([s.id.parse::<usize>().unwrap_or(0), s.start, s.end, s.text])
        }).collect::<Vec<_>>(),
    });
    let data_str = serde_json::to_string(&data).unwrap_or_default().replace("<|", "< |");
    let mut system = include_str!("clips/discover-prompt.txt").to_string();
    if profile != "a" {
        system = system.replace(" /no_think", "").trim().to_string();
    }
    // A: think vazio + /no_think; B: SEM think (natural); C/D: sem think
    let think_suffix = if profile == "a" { "<think>\\n\\n</think>\\n\\n" } else { "" };
    let prompt = format!(
        "<|im_start|>system\\n{system}<|im_end|>\\n<|im_start|>user\\n{data_str}<|im_end|>\\n<|im_start|>assistant\\n{think_suffix}"
    );

    // Schema (para perfis com grammar; B NÃO usa grammar na descoberta)
    let seg_max = seg_count.saturating_sub(1);
    let schema_str = format!(
        r#"{{"type":"object","additionalProperties":false,"required":["candidates"],"properties":{{"candidates":{{"type":"array","maxItems":12,"items":{{"type":"object","additionalProperties":false,"required":["firstId","lastId","score"],"properties":{{"firstId":{{"type":"integer","minimum":0,"maximum":{seg_max}}},"lastId":{{"type":"integer","minimum":0,"maximum":{seg_max}}},"score":{{"type":"integer","minimum":0,"maximum":100}}}}}}}}}}}}"#
    );

    // Engine e modelo por perfil
    let (engine_home, model_name) = match profile.as_str() {
        "a" | "b" => (r"C:\\CutNicePro\\.tooling\\vendor\\analysis".to_string(), "Qwen3-4B-Q4_K_M.gguf"),
        "c" => ("models/home-c".to_string(), "Qwen3-4B-Q4_K_M.gguf"),
        "d" => ("models/home-d".to_string(), "gemma-3-12b-it-Q4_K_M.gguf"),
        _ => panic!("perfil {profile} desconhecido"),
    };
    let exe = std::path::Path::new(&engine_home).join("gpu/llama-completion.exe");
    let exe = if exe.is_file() { exe } else {
        std::path::Path::new(&engine_home).join("bin/llama-completion.exe")
    };
    let model = std::path::Path::new(&engine_home).join(&model_name);
    let stem = format!("scratch/discover-{profile}");
    let input_path = format!("{stem}-prompt.txt");
    let schema_path = format!("{stem}.schema.json");
    let output_path = format!("{stem}-result.json");
    let log_path = format!("{stem}.log");
    std::fs::write(&input_path, &prompt).unwrap();
    std::fs::write(&schema_path, &schema_str).unwrap();

    let use_grammar = profile != "b"; // B: não bloquear raciocínio com grammar
    let max_tokens: u16 = if profile == "b" { 3000 } else { 2000 };
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("-m").arg(&model).arg("-f").arg(&input_path)
       .arg("-t").arg("8").arg("-c").arg("8192")
       .arg("-n").arg(max_tokens.to_string())
       .arg("--temp").arg("0")
       .arg("--no-conversation").arg("--no-display-prompt")
       .arg("--no-escape").arg("--simple-io").arg("--verbosity").arg("3")
       .arg("--fit").arg("on").arg("--fit-target").arg("1024");
    if use_grammar { cmd.arg("-jf").arg(&schema_path); }

    eprintln!("[discover-{profile}] executando descoberta (grammar={use_grammar})...");
    let discover_t = std::time::Instant::now();
    let output = cmd.output().expect("motor executou");
    let discover_elapsed = discover_t.elapsed().as_secs_f64();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    std::fs::write(&log_path, &stderr).unwrap();
    std::fs::write(&output_path, &stdout).unwrap();

    // Parse: B extrai pós-</think>
    let raw = if profile == "b" {
        stdout.split("</think>").last().unwrap_or("").trim().to_string()
    } else {
        stdout.trim().to_string()
    };
    let reply = serde_json::Deserializer::from_str(&raw)
        .into_iter::<clips::selection::Reply>()
        .next().and_then(|v| v.ok())
        .unwrap_or_else(|| {
            eprintln!("[discover-{profile}] RESPOSTA INVÁLIDA: {}", &raw[..raw.len().min(200)]);
            clips::selection::Reply { candidates: Vec::new() }
        });
    eprintln!("[discover-{profile}] {} propostas em {discover_elapsed:.1}s", reply.candidates.len());

    // ══ ETAPA 2: CONSTRUÇÃO (conform + repair_alternatives de produção) ══
    let full_range = 0..seg_count;
    let mut all_clips: Vec<Clip> = Vec::new();
    let mut invalid_count = 0usize;
    for c in reply.candidates.iter().take(12) {
        let cand = clips::selection::Candidate {
            first_id: c.first_id, last_id: c.last_id, score: c.score,
        };
        match clips::selection::conform(cand.clone(), &transcript.segments, &transcript.media_id, duration, &options) {
            Ok(contender) => all_clips.push(contender.clip), // nota de Proposal: PROVENIÊNCIA, não disputa
            Err(rejected) => {
                invalid_count += 1;
                for alt in clips::selection::repair_alternatives(rejected, &transcript.segments, &transcript.media_id, duration, &options) {
                    all_clips.push(alt.clip);
                }
            }
        }
    }
    eprintln!("[discover-{profile}] {invalid_count} fora da faixa; {} construídos", all_clips.len());

    // ══ ETAPA 3: AVALIAÇÃO de TODOS pelo perfil (lotes de 8, ids offset) ══
    // CNP_ANALYSIS_HOME já é setado pelo chamador para c/d
    let eval_t = std::time::Instant::now();
    let eval_system_clean = {
        let mut sys = include_str!("clips/evaluate-prompt.txt").to_string();
        if profile != "a" { sys = sys.replace(" /no_think", "").trim().to_string(); }
        sys
    };
    let mut evaluated: Vec<Clip> = Vec::new();
    if !all_clips.is_empty() {
        for (ci, chunk) in all_clips.chunks(8).enumerate() {
            let offset = ci * 8;
            let labels: Vec<String> = (1..=chunk.len()).map(|i| format!("E{}", offset + i)).collect();
            let items: Vec<serde_json::Value> = chunk.iter().enumerate().map(|(i, clip)| {
                let text = transcript.segments.iter()
                    .filter(|s| s.start < clip.end && s.end > clip.start)
                    .map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
                let before = transcript.segments.iter().filter(|s| s.end <= clip.start + 1e-9).next_back().map(|s| s.text.clone());
                let after = transcript.segments.iter().filter(|s| s.start >= clip.end - 1e-9).next().map(|s| s.text.clone());
                serde_json::json!({"id": labels[i], "start": clip.start, "end": clip.end,
                    "text": text, "contextBefore": before, "contextAfter": after})
            }).collect();
            let eval_data = serde_json::json!({"candidates": items});
            let eval_data_str = serde_json::to_string(&eval_data).unwrap_or_default().replace("<|", "< |");
            let eval_prompt = format!(
                "<|im_start|>system\\n{eval_system_clean}<|im_end|>\\n<|im_start|>user\\n{eval_data_str}<|im_end|>\\n<|im_start|>assistant\\n{}",
                if profile == "a" { "<think>\\n\\n</think>\\n\\n" } else { "" }
            );
            let labels_json = serde_json::to_string(&labels).unwrap_or_default();
            let eval_schema = format!(
                r#"{{"type":"object","additionalProperties":false,"required":["items"],"properties":{{"items":{{"type":"array","maxItems":{},"items":{{"type":"object","additionalProperties":false,"required":["id","score","reason"],"properties":{{"id":{{"type":"string","enum":{labels_json}}},"score":{{"type":"integer","minimum":0,"maximum":100}},"reason":{{"type":"string"}}}}}}}}}}}}"#,
                chunk.len()
            );
            let eval_stem = format!("scratch/eval-{profile}-{ci}");
            std::fs::write(format!("{eval_stem}-prompt.txt"), &eval_prompt).unwrap();
            std::fs::write(format!("{eval_stem}.schema.json"), &eval_schema).unwrap();
            let mut ecmd = std::process::Command::new(&exe);
            ecmd.arg("-m").arg(&model)
                .arg("-f").arg(format!("{eval_stem}-prompt.txt"))
                .arg("-jf").arg(format!("{eval_stem}.schema.json"))
                .arg("-t").arg("8").arg("-c").arg("8192").arg("-n").arg("2400")
                .arg("--temp").arg("0").arg("--no-conversation").arg("--no-display-prompt")
                .arg("--no-escape").arg("--simple-io").arg("--verbosity").arg("3")
                .arg("--fit").arg("on").arg("--fit-target").arg("1024");
            let eout = ecmd.output().expect("motor avaliou");
            let eraw = String::from_utf8_lossy(&eout.stdout).trim().to_string();
            std::fs::write(format!("{eval_stem}.log"), String::from_utf8_lossy(&eout.stderr).to_string()).unwrap();
            std::fs::write(format!("{eval_stem}-result.json"), &eraw).unwrap();
            if let Ok(parsed) = serde_json::Deserializer::from_str(&eraw)
                .into_iter::<clips::selection::EvaluationReply>()
                .next().map(|v| v.unwrap()) {
                for item in parsed.items {
                    if let Some(pos) = item.id.strip_prefix('E').and_then(|n| n.parse::<usize>().ok()).and_then(|n| n.checked_sub(1)) {
                        if let Some(clip) = all_clips.get(offset + pos) {
                            let mut c2 = clip.clone();
                            c2.score = item.score;
                            c2.reasons.push(format!("Avaliação do intervalo efetivo: {}", item.reason));
                            evaluated.push(c2);
                        }
                    }
                }
            } else {
                eprintln!("[discover-{profile}] lote {ci} de avaliação FALHOU (resposta inválida)");
            }
        }
    }
    let eval_elapsed = eval_t.elapsed().as_secs_f64();
    eprintln!("[discover-{profile}] {}/{} avaliados em {eval_elapsed:.1}s", evaluated.len(), all_clips.len());

    // ══ ETAPA 4: DP (weighted interval scheduling, sem poda) ══
    evaluated.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let chosen = dp_select(&evaluated, options.count);

    let total_elapsed = t0.elapsed().as_secs_f64();
    let report = serde_json::json!({
        "perfil": profile,
        "modelo": match profile.as_str() {
            "a" | "b" => "Qwen3 4B Instruct Awq (vendor)",
            "c" => "Qwen3-4B-Instruct-2507 (home-c)",
            "d" => "Gemma-3-12B-IT Q4_K_M (home-d) — 'Gemma 4' não existe; usada Gemma 3 12B como mais próxima",
            _ => "?",
        },
        "config": match profile.as_str() {
            "a" => "non-thinking: think vazio + /no_think + grammar -jf",
            "b" => "thinking NATURAL: sem think preenchido, SEM grammar na descoberta (parse pós-</think>), -n 3000; avaliação COM grammar",
            "c" => "template 2507 (sem think, sem /no_think), grammar -jf",
            "d" => "template Gemma 3 IT (sem think), grammar -jf",
            _ => "?",
        },
        "propostas_brutas": reply.candidates.len(),
        "fora_da_faixa": invalid_count,
        "construidos": all_clips.len(),
        "avaliados": evaluated.len(),
        "descoberta_elapsed_s": discover_elapsed,
        "avaliacao_elapsed_s": eval_elapsed,
        "total_elapsed_s": total_elapsed,
        "clips": chosen.iter().map(|c| serde_json::json!({
            "start": c.start, "end": c.end, "score": c.score,
            "abertura": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next().map(|s| s.text.clone()),
            "fechamento": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next_back().map(|s| s.text.clone()),
            "razoes": c.reasons.iter().filter(|r| r.contains("Avaliação")).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    });
    write_json(&format!("reports/discover-{profile}.json"), &report);
    eprintln!("[discover-{profile}] CONCLUÍDO: {} cortes em {total_elapsed:.1}s", chosen.len());
}

/// DP de seleção (weighted interval scheduling — mesmo algoritmo do app).
fn dp_select(sorted: &[Clip], count: usize) -> Vec<Clip> {
    let n = sorted.len();
    if n == 0 || count == 0 { return Vec::new(); }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| sorted[a].end.total_cmp(&sorted[b].end).then(sorted[a].start.total_cmp(&sorted[b].start)));
    let mut best: Vec<Vec<Option<(i64, usize, f64, Vec<usize>)>>> = vec![vec![None; count + 1]; n + 1];
    best[0][0] = Some((0, 0, 0.0, Vec::new()));
    for i in 1..=n {
        let idx = order[i - 1];
        let mut prefix = 0usize;
        while prefix < i - 1 && sorted[order[prefix]].end <= sorted[idx].start { prefix += 1; }
        for k in 0..=count {
            let mut cur = best[i - 1][k].clone();
            if k >= 1 {
                if let Some((sum, len, neg, path)) = &best[prefix][k - 1] {
                    let mut np = path.clone(); np.push(idx);
                    let cand = (sum + i64::from(sorted[idx].score), *len + 1, neg - sorted[idx].start, np);
                    let replace = cur.as_ref().map_or(true, |(s, l, g, _)| {
                        cand.0 > *s || (cand.0 == *s && cand.1 > *l) || (cand.0 == *s && cand.1 == *l && cand.2 > *g)
                    });
                    if replace { cur = Some(cand); }
                }
            }
            best[i][k] = cur;
        }
    }
    let mut winner: Option<(usize, (i64, usize, f64, Vec<usize>))> = None;
    for k in 0..=count {
        if let Some(cell) = best[n][k].clone() {
            let replace = match &winner { None => true,
                Some((wk, (ws, _, _, _))) => cell.0 > *ws || (cell.0 == *ws && k > *wk) };
            if replace { winner = Some((k, cell)); }
        }
    }
    let mut out = Vec::new();
    if let Some((_, (_, _, _, path))) = winner {
        let keep: std::collections::HashSet<usize> = path.iter().copied().collect();
        out = sorted.iter().enumerate().filter(|(i, _)| keep.contains(i))
            .map(|(_, c)| c.clone()).collect();
    }
    out
}

'''

# inserir antes de rerank_full_cmd
marker = '\nfn rerank_full_cmd() {'
assert marker in s
s = s.replace(marker, '\n' + discover + marker, 1)

# adicionar comando
s = s.replace('Some("flow") => flow_cmd(&args),', 'Some("flow") => flow_cmd(&args),\n        Some("discover") => discover_cmd(&args),')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('discover_cmd v2 (limpa) adicionada')
