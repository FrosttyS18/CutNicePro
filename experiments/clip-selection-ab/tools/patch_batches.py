import io

NEW_EVAL = '''pub(crate) fn evaluate_batch(
    base: &Path,
    scratch: &Path,
    pending: &[Clip],
    segments: &[Segment],
    control: &ProcessControl,
) -> Result<Vec<(String, u8, String)>, String> {
    // LOTES delimitados (até 8 por chamada): evita perder TODAS as
    // avaliações quando o teto de saída trunca uma resposta única com
    // muitos candidatos; ids com offset (E{base+n}) preservam o vínculo
    // posicional com o `pending` completo usado por resolve().
    let mut merged: Vec<(String, u8, String)> = Vec::new();
    for (chunk_index, chunk) in pending.chunks(8).enumerate() {
        let offset = chunk_index * 8;
        let labels: Vec<String> = (1..=chunk.len())
            .map(|i| format!("E{}", offset + i))
            .collect();
        let items: Vec<serde_json::Value> = chunk
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
                    "start": (clip.start * 1000.0).round() / 1000.0,
                    "end": (clip.end * 1000.0).round() / 1000.0,
                    "text": text,
                    "contextBefore": before,
                    "contextAfter": after,
                })
            })
            .collect();
        let data = serde_json::json!({"candidates": items});
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["items"],"properties":{"items":{"type":"array","maxItems":chunk.len(),"items":{
            "type":"object","additionalProperties":false,"required":["id","score","reason"],"properties":{
                "id":{"type":"string","enum":labels},"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}}}}}});
        let prompt = text_engine::prompt(include_str!("evaluate-prompt.txt"), &data)?;
        let output = text_engine::generate(
            base,
            scratch,
            &format!("evaluate-{chunk_index}"),
            &prompt,
            &schema,
            2400,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<EvaluationReply>()
            .next()
            .ok_or("Não foi possível avaliar os trechos ajustados. Tente novamente.")?
            .map_err(|_| "Não foi possível avaliar os trechos ajustados. Tente novamente.")?;
        merged.extend(reply.items.into_iter().map(|item| (item.id, item.score, item.reason)));
    }
    Ok(merged)
}'''

for p in (r'C:\CutNicePro\app\src-tauri\src\clips\selection.rs',
          r'C:\CutNicePro\experiments\clip-selection-ab\src\clips\selection.rs'):
    s = io.open(p, encoding='utf-8').read()
    start = s.index('pub(crate) fn evaluate_batch(')
    end = s.index('/// Finalização da seleção')
    s = s[:start] + NEW_EVAL + '\n\n' + s[end:]
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('lotes aplicados:', p)
