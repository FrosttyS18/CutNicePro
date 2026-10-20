import io
p = r'C:\CutNicePro\experiments\clip-selection-ab\src\main.rs'
s = io.open(p, encoding='utf-8').read()

old_start = s.index('    let evaluate = |pending: &[Clip], segments: &[transcription::types::Segment]| -> Result<Vec<(String, u8, String)>, String> {')
old_end = s.index('    let started = std::time::Instant::now();\n    let mut chosen = clips::selection::resolve(')
new = '''    // avaliação por perfil EM LOTES de 8 (mesma política do evaluate_batch
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
'''
s = s[:old_start] + new + s[old_end:]
# tokens: somar os lotes
s = s.replace(
    'let (ptok, gtok) = parse_tokens_from_log(&format!("scratch/evaluate-flow-{profile}"));',
    '''let mut ptok: Option<u64> = None;
    let mut gtok: Option<u64> = None;
    {
        let mut total_p: u64 = 0;
        let mut total_g: u64 = 0;
        let mut found = false;
        for chunk_index in 0..4 {
            let (p, g) = parse_tokens_from_log(&format!("scratch/evaluate-flow-{profile}-{chunk_index}"));
            if let Some(p) = p { total_p += p; found = true; }
            if let Some(g) = g { total_g += g; found = true; }
        }
        if found { ptok = Some(total_p); gtok = Some(total_g); }
    }''')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('flow em lotes')
