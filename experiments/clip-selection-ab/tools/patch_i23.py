import io
p = r'C:\CutNicePro\app\src-tauri\src\clips\selection.rs'
s = io.open(p, encoding='utf-8').read()

# A2: fim recuado — maior end que caiba (rev)
old_a2 = """        if let Some(new_end) = segments[candidate.first_id..]
            .iter()
            .map(|s| s.end.min(duration))
            .find(|end| *end - first.start <= options.max_seconds)
        {
            if new_end - first.start >= options.min_seconds {
                alternative(first.start, new_end, "fim recuado", &mut result);
            }
        }"""
new_a2 = """        if let Some(new_end) = segments[candidate.first_id..]
            .iter()
            .rev()
            .map(|s| s.end.min(duration))
            .find(|end| *end - first.start <= options.max_seconds)
        {
            if new_end - first.start >= options.min_seconds {
                alternative(first.start, new_end, "fim recuado", &mut result);
            }
        }"""
assert old_a2 in s, 'A2 alvo ausente'
s = s.replace(old_a2, new_a2)

# A3: aplicar avaliações por POSIÇÃO do pendente
old_a3 = """        let label_of = |clip: &Clip| -> Option<String> {
            pending
                .iter()
                .position(|c| c.id == clip.id)
                .map(|position| format!("E{}", position + 1))
        };
        match evaluate(&pending, segments) {
            Ok(scores) => {
                for (id, score, reason) in scores {
                    if let Some(contender) = contenders.iter_mut().find(|c| {
                        c.valid_score.is_none() && label_of(&c.clip).as_deref() == Some(id.as_str())
                    }) {
                        contender.clip.reasons.push(format!(
                            "Avaliação do intervalo efetivo: {reason}"
                        ));
                        contender.clip.score = score;
                        contender.valid_score = Some(score);
                        evaluated += 1;
                    }
                }
                unevaluated = pending.len() - evaluated;
            }"""
new_a3 = """        match evaluate(&pending, segments) {
            Ok(scores) => {
                for (id, score, reason) in scores {
                    let parsed = id.strip_prefix('E').and_then(|n| n.parse::<usize>().ok());
                    let Some(position) = parsed.and_then(|n| n.checked_sub(1)) else {
                        continue;
                    };
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
            }"""
assert old_a3 in s, 'A3 alvo ausente'
s = s.replace(old_a3, new_a3)

# A1: extrair resolve() puro; select() coleta janelas e delega
marker = "    // AVALIAÇÃO ANTES DA SELEÇÃO DEFINITIVA"
assert marker in s
head_select = s.index("pub fn select(")
body_after = s[s.index(marker):]

resolve_fn = """/// Fluxo pós-janelas, executável sem LLM (teste de fluxo completo):
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
"""
new_select_head = """pub fn select(
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
    let mut contenders = resolve(&proposals, segments, media, duration, options, evaluate)?;
"""
# o corpo pós-avaliação antigo começa com 'let pending' — mantemos a partir daí
tail_start = body_after.index("    let pending: Vec<Clip> = contenders")
new_body = body_after[tail_start:]
s = s[:head_select] + resolve_fn + new_select_head + new_body
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok reestruturado')
