import io

p = r'C:\CutNicePro\experiments\clip-selection-ab\src\main.rs'
s = io.open(p, encoding='utf-8').read()

discover = '''
/// ESTRATÉGIA DE DESCOBERTA (atualização 6): cada perfil lê a transcrição
/// INTEIRA e gera seus PRÓPRIOS candidatos por unidades narrativas.
/// Todos os candidatos concorrentes recebem avaliação pelo procedimento
/// do perfil correspondente — SEM misturar notas históricas.
/// Perfis: a (instalado non-thinking), b (instalado thinking), c (2507),
/// d (gemma-3-12b-it — "Gemma 4" não existe; bloqueio registrado).
/// Orçamento declarado: por perfil, 1 descoberta + 1-2 avaliações em lote
/// = até 12 chamadas no total; temp=0 para a/b/c (greedy); sem repetições.
fn discover_cmd(args: &[String]) {
    let profile = flag(args, "--profile").unwrap_or_else(|| "a".into());
    let transcript = load_transcript("data/transcript-davyjones.json").expect("transcrição");
    let duration: f64 = std::fs::read_to_string("data/media-duration.txt")
        .expect("duration").trim().parse().expect("num");
    let options = mk_options(DEFAULT_COUNT);
    let control = ProcessControl::default();
    let t0 = std::time::Instant::now();

    // ── ETAPA 1: DESCOBERTA ──
    // Monta o prompt com a transcrição completa (mesma entrada para todos).
    let data = serde_json::json!({
        "minSeconds": options.min_seconds,
        "maxSeconds": options.max_seconds,
        "limit": (options.count * 2).min(12),
        "speech": transcript.segments.iter().map(|s|
            serde_json::json!([s.id.parse::<usize>().unwrap_or(0), s.start, s.end, s.text])
        ).collect::<Vec<_>>(),
    });
    let schema = serde_json::json!({"type":"object","additionalProperties":false,
        "required":["candidates"],"properties":{"candidates":{"type":"array","maxItems":12,"items":{
            "type":"object","additionalProperties":false,"required":["firstId","lastId","score"],
            "properties":{
                "firstId":{"type":"integer","minimum":0,"maximum":transcript.segments.len()-1},
                "lastId":{"type":"integer","minimum":0,"maximum":transcript.segments.len()-1},
                "score":{"type":"integer","minimum":0,"maximum":100}}}}}}});

    let mut system = include_str!("clips/discover-prompt.txt").to_string();
    if profile != "a" {
        system = system.replace(" /no_think", "").trim().to_string();
    }
    // Perfil B: thinking NATURAL — SEM pré-preencher think, SEM grammar (-jf)
    // para não bloquear o raciocínio desde o primeiro token. O JSON é
    // extraído pós-resposta.
    let use_grammar = profile != "b";
    let prompt = if profile == "b" {
        format!(
            "<|im_start|>system\\n{system}<|im_end|>\\n<|im_start|>user\\n{source}<|im_end|>\\n<|im_start|>assistant\\n",
            system = system,
            source = serde_json::to_string(&data).unwrap_or_default().replace("<|", "< |")
        )
    } else {
        clips::text_engine::prompt("clips/discover-prompt.txt", &data)
            .unwrap_or_default()
    };
    // Para perfis != a, remontar sem /no_think
    let prompt = if profile == "a" { prompt } else {
        format!(
            "<|im_start|>system\\n{sys}<|im_end|>\\n<|im_start|>user\\n{src}<|im_end|>\\n<|im_start|>assistant\\n{tail}",
            sys = system,
            src = serde_json::to_string(&data).unwrap_or_default().replace("<|", "< |"),
            tail = if profile == "b" { String::new() } else { String::new() }
        )
    };
    let schema_path = format!("scratch/discover-{profile}.schema.json");
    std::fs::write(&schema_path, serde_json::to_vec(&schema).unwrap()).unwrap();
    let input_path = format!("scratch/discover-{profile}-prompt.txt");
    std::fs::write(&input_path, &prompt).unwrap();
    let output_path = format!("scratch/discover-{profile}-result.json");
    let log_path = format!("scratch/discover-{profile}.log");

    let engine_home = match profile.as_str() {
        "a" | "b" => r"C:\\CutNicePro\\.tooling\\vendor\\analysis".to_string(),
        "c" => "models/home-c".to_string(),
        "d" => "models/home-d".to_string(),
        _ => panic!("perfil desconhecido: {profile}"),
    };
    let model_name = match profile.as_str() {
        "d" => "gemma-3-12b-it-Q4_K_M.gguf",
        _ => "Qwen3-4B-Q4_K_M.gguf",
    };
    let exe = std::path::Path::new(&engine_home).join("gpu/llama-completion.exe");
    let exe = if exe.is_file() { exe } else {
        std::path::Path::new(&engine_home).join("bin/llama-completion.exe")
    };
    let model = std::path::Path::new(&engine_home).join(model_name);
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("-m").arg(&model)
       .arg("-f").arg(&input_path)
       .arg("-t").arg("8").arg("-c").arg("8192")
       .arg("-n").arg(if profile == "b" { "3000" } else { "2000" })
       .arg("--temp").arg("0")
       .arg("--no-conversation").arg("--no-display-prompt")
       .arg("--no-escape").arg("--simple-io").arg("--verbosity").arg("3")
       .arg("--fit").arg("on").arg("--fit-target").arg("1024");
    if use_grammar {
        cmd.arg("-jf").arg(&schema_path);
    }
    let discover_start = std::time::Instant::now();
    let output = cmd.output().expect("motor");
    let discover_elapsed = discover_start.elapsed().as_secs_f64();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    std::fs::write(&log_path, &stderr).unwrap();
    std::fs::write(&output_path, &stdout).unwrap();

    // Parse da resposta: para B (thinking), extrair JSON pós-</think>
    let raw = if profile == "b" {
        let after = stdout.split("</think>").last().unwrap_or("").trim();
        after.to_string()
    } else {
        stdout.trim().to_string()
    };
    let reply = serde_json::Deserializer::from_str(&raw)
        .into_iter::<clips::selection::Reply>()
        .next()
        .and_then(|v| v.ok())
        .unwrap_or_else(|| {
            eprintln!("[discover-{profile}] RESPOSTA INVÁLIDA (primeiros 200 chars): {}", &raw[..raw.len().min(200)]);
            clips::selection::Reply { candidates: Vec::new() }
        });
    eprintln!("[discover-{profile}] {} candidatos propostos em {discover_elapsed:.1}s", reply.candidates.len());

    // ── ETAPA 2: CONSTRUÇÃO ──
    let full_range = 0..transcript.segments.len();
    let mut contenders: Vec<clips::selection::Contender> = Vec::new();
    let mut invalid_count = 0;
    for candidate in reply.candidates.iter().take(12) {
        let c = clips::selection::Candidate {
            first_id: candidate.first_id,
            last_id: candidate.last_id,
            score: candidate.score,
        };
        match clips::selection::conform(c.clone(), &transcript.segments, &transcript.media_id, duration, &options) {
            Ok(contender) => contenders.push(contender),
            Err(rejected) => {
                invalid_count += 1;
                let alts = clips::selection::repair_alternatives(rejected, &transcript.segments, &transcript.media_id, duration, &options);
                contenders.extend(alts);
            }
        }
    }
    eprintln!("[discover-{profile}] {invalid_count} fora da faixa; {} no total após alternativas", contenders.len());

    // ── ETAPA 3: AVALIAÇÃO (TODOS pelo MESMO perfil; notas históricas NÃO disputam) ──
    let all_clips: Vec<Clip> = contenders.iter().map(|c| c.clip.clone()).collect();
    // zera notas de Proposal também — TODOS recebem avaliação nova
    let evaluate = |pending: &[Clip], segments: &[transcription::types::Segment]| -> Result<Vec<(String, u8, String)>, String> {
        let mut eval_system = include_str!("clips/evaluate-prompt.txt").to_string();
        if profile != "a" { eval_system = eval_system.replace(" /no_think", "").trim().to_string(); }
        let mut merged: Vec<(String, u8, String)> = Vec::new();
        for (ci, chunk) in pending.chunks(8).enumerate() {
            let offset = ci * 8;
            let labels: Vec<String> = (1..=chunk.len()).map(|i| format!("E{}", offset + i)).collect();
            let items: Vec<serde_json::Value> = chunk.iter().enumerate().map(|(i, clip)| {
                let text = segments.iter().filter(|s| s.start < clip.end && s.end > clip.start)
                    .map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
                let before = segments.iter().filter(|s| s.end <= clip.start + 1e-9).next_back().map(|s| s.text.clone());
                let after = segments.iter().filter(|s| s.start >= clip.end - 1e-9).next().map(|s| s.text.clone());
                serde_json::json!({"id": labels[i], "start": clip.start, "end": clip.end,
                    "text": text, "contextBefore": before, "contextAfter": after})
            }).collect();
            let data = serde_json::json!({"candidates": items});
            let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["items"],
                "properties":{"items":{"type":"array","maxItems":chunk.len(),"items":{
                    "type":"object","additionalProperties":false,"required":["id","score","reason"],
                    "properties":{"id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},
                        "reason":{"type":"string"}}}}}}});
            let eval_prompt = if profile == "a" {
                clips::text_engine::prompt("clips/evaluate-prompt.txt", &data).unwrap_or_default()
            } else {
                format!("<|im_start|>system\\n{}<|im_end|>\\n<|im_start|>user\\n{}<|im_end|>\\n<|im_start|>assistant\\n",
                    eval_system, serde_json::to_string(&data).unwrap_or_default().replace("<|", "< |"))
            };
            let stem = format!("eval-{profile}-{ci}");
            let out = clips::text_engine::generate(
                &PathBuf::from("."), &PathBuf::from("./scratch"), &stem, &eval_prompt, &schema, 2400, &control,
            )?;
            let parsed = serde_json::Deserializer::from_str(out.trim())
                .into_iter::<clips::selection::EvaluationReply>()
                .next().and_then(|v| v.ok())
                .ok_or("resposta de avaliação inválida")?;
            merged.extend(parsed.items.into_iter().map(|i| (i.id, i.score, i.reason)));
        }
        Ok(merged)
    };
    // resolve já aplica avaliação ANTES da DP — chama resolve com os contenders
    // como propostas (não precisamos de resolve; fazemos manualmente para
    // controlar que TODOS recebem avaliação)
    let mut evaluated: Vec<Clip> = Vec::new();
    if !all_clips.is_empty() {
        match evaluate(&all_clips, &transcript.segments) {
            Ok(scores) => {
                let slots: Vec<usize> = (0..all_clips.len()).collect();
                for (id, score, reason) in scores {
                    let pos = id.strip_prefix('E').and_then(|n| n.parse::<usize>().ok())
                        .and_then(|n| n.checked_sub(1));
                    if let (Some(pos), Some(&slot)) = (pos, slots.get(pos)) {
                        let mut clip = all_clips[slot].clone();
                        clip.score = score;
                        clip.reasons.push(format!("Avaliação do intervalo efetivo: {reason}"));
                        evaluated.push(clip);
                    }
                }
            }
            Err(e) => eprintln!("[discover-{profile}] avaliação FALHOU: {e}"),
        }
    }
    eprintln!("[discover-{profile}] {}/{} avaliados", evaluated.len(), all_clips.len());

    // ── ETAPA 4: SELEÇÃO (DP sem poda) ──
    let mut dispute = evaluated;
    dispute.sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    let chosen = {
        // DP inline (mesma lógica de finalize_weighted)
        let count = options.count;
        let n = dispute.len();
        if n == 0 { Vec::new() } else {
            let mut order: Vec<usize> = (0..n).collect();
            order.sort_by(|&a, &b| dispute[a].end.total_cmp(&dispute[b].end));
            let mut best: Vec<Vec<Option<(i64, usize, f64, Vec<usize>)>>> = vec![vec![None; count + 1]; n + 1];
            best[0][0] = Some((0, 0, 0.0, Vec::new()));
            for i in 1..=n {
                let idx = order[i - 1];
                let mut prefix = 0;
                while prefix < i - 1 && dispute[order[prefix]].end <= dispute[idx].start { prefix += 1; }
                for k in 0..=count {
                    let mut cur = best[i - 1][k].clone();
                    if k >= 1 {
                        if let Some((sum, len, neg, path)) = &best[prefix][k - 1] {
                            let mut np = path.clone(); np.push(idx);
                            let cand = (sum + i64::from(dispute[idx].score), *len + 1, neg - dispute[idx].start, np);
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
                out = dispute.iter().enumerate().filter(|(i, _)| keep.contains(i))
                    .map(|(_, c)| c.clone()).collect();
            }
            out
        }
    };

    let total_elapsed = t0.elapsed().as_secs_f64();
    let report = serde_json::json!({
        "perfil": profile,
        "modelo": match profile.as_str() {
            "a" | "b" => "Qwen3 4B Instruct Awq (vendor)",
            "c" => "Qwen3-4B-Instruct-2507 (home-c)",
            "d" => "Gemma-3-12B-IT (home-d) — NOTA: 'Gemma 4' não existe; usado Gemma 3 12B",
            _ => "?",
        },
        "config": match profile.as_str() {
            "a" => "non-thinking (think vazio + /no_think + -jf grammar)",
            "b" => "thinking NATURAL (sem think preenchido, SEM -jf, parse pós-</think>, -n 3000)",
            "c" => "template 2507 Instruct (sem think), -jf grammar",
            "d" => "template Gemma 3 IT, -jf grammar",
            _ => "?",
        },
        "propostas_brutas": reply.candidates.len(),
        "fora_da_faixa": invalid_count,
        "construidos": all_clips.len(),
        "avaliados": evaluated.len(),
        "descoberta_elapsed_s": discover_elapsed,
        "total_elapsed_s": total_elapsed,
        "clips": chosen.iter().map(|c| serde_json::json!({
            "start": c.start, "end": c.end, "score": c.score,
            "abertura": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next()
                .map(|s| s.text.clone()),
            "fechamento": transcript.segments.iter().filter(|s| s.start < c.end && s.end > c.start).next_back()
                .map(|s| s.text.clone()),
            "razoes": c.reasons.iter().filter(|r| r.contains("Avaliação")).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    });
    write_json(&format!("reports/discover-{profile}.json"), &report);
    eprintln!("[discover-{profile}] CONCLUÍDO: {} cortes em {total_elapsed:.1}s", chosen.len());
}
'''

marker = "fn rerank_full_cmd() {"
assert marker in s
s = s.replace(marker, discover + "\n" + marker, 1)
s = s.replace('Some("flow") => flow_cmd(&args),', 'Some("flow") => flow_cmd(&args),\n        Some("discover") => discover_cmd(&args),')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('discover_cmd adicionado')
