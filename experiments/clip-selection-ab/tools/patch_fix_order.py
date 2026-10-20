import io
p = r'C:\CutNicePro\app\src-tauri\src\clips\selection.rs'
s = io.open(p, encoding='utf-8').read()

select_start = s.index("pub fn select(")
resolve_close_marker = """        eprintln!(
            "[clips] propostas fora da faixa: {invalid}; alternativas geradas: {alternatives}"
        );
    }
"""
assert resolve_close_marker in s[:select_start]
insert_at = s.index(resolve_close_marker) + len(resolve_close_marker)

call_line = "    let mut contenders = resolve(&proposals, segments, media, duration, options, evaluate)?;\n"
assert call_line in s
body_start = s.index(call_line) + len(call_line)
body = s[body_start:]
assert body.lstrip().startswith("let pending")

# corpo de avaliação+disputa+DP vai PARA DENTRO do resolve; o select termina na chamada
new = (
    s[:insert_at]
    + "    let mut contenders: Vec<Contender> = contenders;\n"
    + body
    + "\npub fn select_placeholder() {}\n"
)
# remove o select antigo malformado e reinsere correto
select_block_start = s.index("pub fn select(")
new = s[:insert_at] + body + (
    "\npub fn select(\n"
    "    base: &Path,\n"
    "    scratch: &Path,\n"
    "    segments: &[Segment],\n"
    "    media: &str,\n"
    "    duration: f64,\n"
    "    options: &Options,\n"
    "    control: &ProcessControl,\n"
    "    evaluate: &dyn Fn(&[Clip], &[Segment]) -> Result<Vec<(String, u8, String)>, String>,\n"
    "    mut progress: impl FnMut(u8),\n"
    ") -> Result<Vec<Clip>, String> {\n"
    "    options.validate()?;\n"
    "    crate::transcription::parser::validate(segments, duration)?;\n"
    "    let ranges = windows(segments, options.max_seconds);\n"
    "    let mut proposals: Vec<(std::ops::Range<usize>, Vec<Candidate>)> = Vec::new();\n"
    "    for (index, range) in ranges.iter().enumerate() {\n"
    "        control.check()?;\n"
    "        let ids = range.clone().collect::<Vec<_>>();\n"
    "        let limit = (options.count * 2).min(12);\n"
    "        let data = serde_json::json!({\"minSeconds\":options.min_seconds,\"maxSeconds\":options.max_seconds,\"limit\":limit,\n"
    "            \"speech\":range.clone().map(|id|serde_json::json!([id,segments[id].start,segments[id].end,segments[id].text])).collect::<Vec<_>>()});\n"
    "        let schema = serde_json::json!({\"type\":\"object\",\"additionalProperties\":false,\"required\":[\"candidates\"],\"properties\":{\"candidates\":{\"type\":\"array\",\"maxItems\":limit,\"items\":{\n"
    "            \"type\":\"object\",\"additionalProperties\":false,\"required\":[\"firstId\",\"lastId\",\"score\"],\"properties\":{\n"
    "                \"firstId\":{\"type\":\"integer\",\"enum\":ids},\"lastId\":{\"type\":\"integer\",\"enum\":ids},\"score\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":100}}}}}});\n"
    "        let prompt = text_engine::prompt(include_str!(\"selection-prompt.txt\"), &data)?;\n"
    "        let output = text_engine::generate(\n"
    "            base,\n"
    "            scratch,\n"
    "            &format!(\"selection-{index}\"),\n"
    "            &prompt,\n"
    "            &schema,\n"
    "            1800,\n"
    "            control,\n"
    "        )?;\n"
    "        let reply = serde_json::Deserializer::from_str(output.trim())\n"
    "            .into_iter::<Reply>()\n"
    "            .next()\n"
    "            .ok_or(\"Não foi possível selecionar os momentos. Tente novamente.\")?\n"
    "            .map_err(|_| \"Não foi possível selecionar os momentos. Tente novamente.\")?;\n"
    "        proposals.push((range.clone(), reply.candidates.into_iter().take(limit).collect()));\n"
    "        progress(((index + 1) * 50 / ranges.len().max(1)) as u8);\n"
    "    }\n"
    "    resolve(&proposals, segments, media, duration, options, evaluate)\n"
    "}\n"
)
# o 'body' termina com 'Ok(selected)\n}' que fecha o resolve
io.open(p, 'w', encoding='utf-8', newline='').write(new)
print('reordenado')
