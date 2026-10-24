use super::selection::Candidate;
use crate::transcription::types::Segment;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Draft {
    moment: String,
    first_line: String,
    last_line: String,
    score: u8,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    candidates: Vec<Draft>,
}

pub fn line_key(id: usize) -> String {
    format!("L{id:03}")
}

fn source_id(key: &str, speech: &[Segment]) -> Option<usize> {
    let id = key.strip_prefix('L')?.parse::<usize>().ok()?;
    (id < speech.len() && key == line_key(id)).then_some(id)
}

pub fn decode(output: &str, speech: &[Segment]) -> Result<Vec<Candidate>, String> {
    let reply = serde_json::Deserializer::from_str(output.trim())
        .into_iter::<Reply>()
        .next()
        .ok_or("A seleção local não retornou resposta.")?
        .map_err(|_| "O Qwen3.5 retornou uma seleção inválida. Tente novamente.")?;
    let had_proposals = !reply.candidates.is_empty();
    let mut candidates = Vec::new();
    for draft in reply.candidates {
        let bounds = source_id(&draft.first_line, speech).zip(source_id(&draft.last_line, speech));
        match bounds {
            Some((first_id, last_id)) if first_id <= last_id && draft.score <= 100 => {
                candidates.push(Candidate {
                    moment: draft.moment,
                    first_id,
                    last_id,
                    score: draft.score,
                });
            }
            _ => eprintln!(
                "[clips] proposta recusada: referências de fala inexistentes ou invertidas"
            ),
        }
    }
    if had_proposals && candidates.is_empty() {
        return Err("O Qwen3.5 não localizou intervalos válidos na transcrição. Nenhum corte salvo foi alterado.".into());
    }
    Ok(candidates)
}

pub fn schema(limit: usize, speech_count: usize) -> serde_json::Value {
    let line = serde_json::json!({"type":"string","enum":(0..speech_count).map(line_key).collect::<Vec<_>>()});
    serde_json::json!({"type":"object","additionalProperties":false,"required":["candidates"],"properties":{"candidates":{
        "type":"array","maxItems":limit,"items":{"type":"object","additionalProperties":false,
        "required":["moment","firstLine","lastLine","score"],"properties":{
            "moment":{"type":"string","minLength":12,"maxLength":240},
            "firstLine":line,"lastLine":line,
            "score":{"type":"integer","minimum":0,"maximum":100}}}}}})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speech() -> Vec<Segment> {
        [
            "Comprei uma passagem.",
            "O voo foi cancelado.",
            "Tive de pagar um hotel.",
        ]
        .into_iter()
        .enumerate()
        .map(|(id, text)| Segment {
            id: format!("asr-{id}"),
            start: id as f64 * 5.0,
            end: id as f64 * 5.0 + 4.8,
            text: text.into(),
            words: Vec::new(),
        })
        .collect()
    }

    #[test]
    fn unique_line_keys_do_not_require_recopying_or_time_arithmetic() {
        let result = decode(r#"{"candidates":[{"moment":"Cancelamento da viagem exige pagar hospedagem","firstLine":"L000","lastLine":"L002","score":80}]}"#, &speech()).unwrap();
        assert_eq!((result[0].first_id, result[0].last_id), (0, 2));
    }

    #[test]
    fn unknown_reversed_and_noncanonical_keys_never_create_a_clip() {
        for (first, last) in [
            ("L000", "L099"),
            ("L002", "L000"),
            ("L0", "L002"),
            ("00:00", "L002"),
        ] {
            let output = serde_json::json!({"candidates":[{"moment":"Uma viagem foi interrompida pelo cancelamento","firstLine":first,"lastLine":last,"score":80}]}).to_string();
            assert!(decode(&output, &speech()).is_err());
        }
        assert!(decode(r#"{"candidates":[]}"#, &speech())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn invalid_proposal_does_not_hide_an_independent_valid_proposal() {
        let output = r#"{"candidates":[{"moment":"Uma referência inválida não será aceita","firstLine":"L900","lastLine":"L999","score":80},{"moment":"Cancelamento da viagem exige pagar hospedagem","firstLine":"L000","lastLine":"L002","score":80}]}"#;
        assert_eq!(decode(output, &speech()).unwrap().len(), 1);
        let schema = schema(12, 3);
        assert_eq!(
            schema["properties"]["candidates"]["items"]["properties"]["firstLine"]["enum"],
            serde_json::json!(["L000", "L001", "L002"])
        );
    }
}
