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
struct LineReply {
    candidates: Vec<Draft>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AnchoredReply {
    clips: Vec<super::source_anchors::Draft>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Reply {
    Lines(LineReply),
    Anchors(AnchoredReply),
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
    let reply = match reply {
        Reply::Lines(value) => value,
        Reply::Anchors(value) => {
            let had_proposals = !value.clips.is_empty();
            let candidates = super::source_anchors::resolve(value.clips, speech);
            if had_proposals && candidates.is_empty() {
                return Err("O Qwen3.5 não localizou as citações de abertura e fechamento na transcrição. Nenhum corte salvo foi alterado.".into());
            }
            return Ok(candidates);
        }
    };
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

    #[test]
    fn literal_quotes_are_located_across_source_segments_without_invented_ids() {
        let source = [
            "Comprei uma passagem para a viagem.",
            "O voo foi cancelado antes do embarque.",
            "Por isso paguei um hotel e perdi a conexão.",
        ]
        .into_iter()
        .enumerate()
        .map(|(id, text)| Segment {
            id: id.to_string(),
            start: id as f64 * 10.0,
            end: id as f64 * 10.0 + 9.0,
            text: text.into(),
            words: vec![],
        })
        .collect::<Vec<_>>();
        let reply = r#"{"clips":[{"title":"A viagem cancelada gerou despesas","openingQuote":"Comprei uma passagem para a viagem","closingQuote":"paguei um hotel e perdi a conexão"}]}"#;
        let candidates = decode(reply, &source).expect("as bordas precisam vir das citações reais");
        assert_eq!((candidates[0].first_id, candidates[0].last_id), (0, 2));
        let across = r#"{"clips":[{"title":"Despesas depois do cancelamento","openingQuote":"a viagem O voo foi cancelado","closingQuote":"paguei um hotel e perdi a conexão"}]}"#;
        assert_eq!(decode(across, &source).unwrap()[0].first_id, 0);
        let invented = reply.replace(
            "paguei um hotel e perdi a conexão",
            "a companhia devolveu todo o dinheiro",
        );
        assert!(decode(&invented, &source).is_err());
        let mut repeated = source.clone();
        repeated.push(source[0].clone());
        assert!(
            decode(reply, &repeated).is_err(),
            "citação repetida não determina uma borda única"
        );
        let reversed = reply
            .replace(
                "Comprei uma passagem para a viagem",
                "paguei um hotel e perdi a conexão",
            )
            .replace(
                "\"closingQuote\":\"paguei um hotel e perdi a conexão\"",
                "\"closingQuote\":\"Comprei uma passagem para a viagem\"",
            );
        assert!(decode(&reversed, &source).is_err());
        let single = vec![Segment {
            id: "one".into(),
            start: 0.0,
            end: 30.0,
            text: source
                .iter()
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            words: vec![],
        }];
        assert!(
            decode(&reversed, &single).is_err(),
            "a ordem das palavras também deve valer dentro de uma fala"
        );
        let overlapping = vec![Segment {
            id: "overlap".into(),
            start: 0.0,
            end: 30.0,
            text: "Comprei uma passagem para a viagem ontem sem saber do atraso".into(),
            words: vec![],
        }];
        let reply = r#"{"clips":[{"title":"Uma viagem com contexto anterior","openingQuote":"para a viagem ontem sem","closingQuote":"Comprei uma passagem para a viagem"}]}"#;
        assert!(
            decode(reply, &overlapping).is_err(),
            "sobreposição não permite fechar antes da abertura"
        );
        let reversed_end = r#"{"clips":[{"title":"Uma viagem com contexto anterior","openingQuote":"Comprei uma passagem para a viagem ontem sem","closingQuote":"passagem para a viagem"}]}"#;
        assert!(
            decode(reversed_end, &overlapping).is_err(),
            "o fim da abertura não pode passar do fim do fechamento"
        );
    }

    #[test]
    fn minor_copy_errors_can_locate_one_source_interval_but_never_invent_speech() {
        let speech = [
            "Comprei uma passagem para viajar com a família durante as férias.",
            "O voo foi cancelado antes de embarcar e perdemos a conexão.",
            "Por isso paguei um hotel muito caro e tive que remarcar a viagem.",
        ]
        .into_iter()
        .enumerate()
        .map(|(id, text)| Segment {
            id: id.to_string(),
            start: id as f64 * 10.0,
            end: id as f64 * 10.0 + 9.0,
            text: text.into(),
            words: vec![],
        })
        .collect::<Vec<_>>();
        let reply = serde_json::json!({"clips":[{"title":"Uma viagem interrompida","openingQuote":"Comprei uma passagem para viajar com minha família durante as férias","closingQuote":"paguei um hotel caro e tive que remarcar a viagem"}]}).to_string();
        let candidates = decode(&reply, &speech)
            .expect("pequenos erros de cópia não devem perder uma história localizada");
        assert_eq!((candidates[0].first_id, candidates[0].last_id), (0, 2));
        assert!(!candidates[0].moment.contains("minha"));
        let invented = reply.replace(
            "paguei um hotel caro e tive que remarcar a viagem",
            "a empresa devolveu todo o dinheiro da passagem no mesmo dia",
        );
        assert!(decode(&invented, &speech).is_err());
        let mut ambiguous = speech.clone();
        ambiguous.push(Segment {
            text: "Comprei uma passagem para viajar com minha família durante as férias."
                .replace("minha", "nossa"),
            ..speech[0].clone()
        });
        assert!(decode(&reply, &ambiguous).is_err());
        let mut different_costs = speech.clone();
        different_costs.push(Segment {
            text: "Comprei uma passagem para passear com nossa família durante as férias.".into(),
            ..speech[0].clone()
        });
        assert!(
            decode(&reply, &different_costs).is_err(),
            "duas posições toleradas continuam ambíguas mesmo com custos diferentes"
        );
    }
}
