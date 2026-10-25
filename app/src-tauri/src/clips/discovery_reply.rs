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

pub struct Decoded {
    pub candidates: Vec<Candidate>,
    pub failures: Vec<String>,
}

pub fn decode_with_feedback(output: &str, speech: &[Segment]) -> Result<Decoded, String> {
    Ok(resolve_reply(parse_reply(output)?, speech))
}

pub fn line_key(id: usize) -> String {
    format!("L{id:03}")
}

fn source_id(key: &str, speech: &[Segment]) -> Option<usize> {
    let id = key.strip_prefix('L')?.parse::<usize>().ok()?;
    (id < speech.len() && key == line_key(id)).then_some(id)
}

fn parse_reply(output: &str) -> Result<Reply, String> {
    serde_json::Deserializer::from_str(output.trim())
        .into_iter::<Reply>()
        .next()
        .ok_or("A seleção local não retornou resposta.")?
        .map_err(|_| "O Qwen3.5 retornou uma seleção inválida. Tente novamente.".into())
}

pub fn decode(output: &str, speech: &[Segment]) -> Result<Vec<Candidate>, String> {
    let reply = parse_reply(output)?;
    let empty_error = match &reply {
        Reply::Anchors(_) => "O Qwen3.5 não localizou as citações de abertura e fechamento na transcrição. Nenhum corte salvo foi alterado.",
        Reply::Lines(_) => "O Qwen3.5 não localizou intervalos válidos na transcrição. Nenhum corte salvo foi alterado.",
    };
    let decoded = resolve_reply(reply, speech);
    if decoded.candidates.is_empty() && !decoded.failures.is_empty() {
        return Err(empty_error.into());
    }
    Ok(decoded.candidates)
}

fn resolve_reply(reply: Reply, speech: &[Segment]) -> Decoded {
    let reply = match reply {
        Reply::Lines(value) => value,
        Reply::Anchors(value) => {
            return super::source_anchors::resolve_with_feedback(value.clips, speech);
        }
    };
    let mut candidates = Vec::new();
    let mut failures = Vec::new();
    for (index, draft) in reply.candidates.into_iter().enumerate() {
        let bounds = source_id(&draft.first_line, speech).zip(source_id(&draft.last_line, speech));
        match bounds {
            Some((first_id, last_id)) if first_id <= last_id && draft.score <= 100 => {
                candidates.push(Candidate {
                    moment: draft.moment,
                    first_id,
                    last_id,
                    score: draft.score,
                    quote_bounds: None,
                });
            }
            _ => {
                let failure = format!(
                    "Proposta {} recusada: referências de fala inexistentes, invertidas ou nota inválida. DADOS: {}",
                    index + 1,
                    serde_json::json!({"moment":draft.moment,"firstLine":draft.first_line,"lastLine":draft.last_line,"score":draft.score})
                );
                eprintln!(
                    "[clips] proposta {} recusada: referências de fala inexistentes, invertidas ou nota inválida",
                    index + 1
                );
                failures.push(failure);
            }
        }
    }
    Decoded {
        candidates,
        failures,
    }
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

    fn speech_with_timed_closing() -> Vec<Segment> {
        let mut source = speech();
        source.truncate(2);
        source[0].text = "Comprei uma passagem para viajar.".into();
        source[0].start = 0.0;
        source[0].end = 8.0;
        source[1].text = "O voo cancelou e paguei um hotel. Mas e amanhã?".into();
        source[1].start = 12.0;
        source[1].end = 25.0;
        source[1].words = [
            ("O", 12.0, 12.5),
            ("voo", 12.5, 13.0),
            ("cancelou", 13.0, 14.0),
            ("e", 14.0, 14.5),
            ("paguei", 14.5, 16.0),
            ("um", 16.0, 16.5),
            ("hotel.", 16.5, 17.0),
            ("Mas", 20.0, 20.5),
            ("e", 20.5, 21.0),
            ("amanhã?", 21.0, 22.0),
        ]
        .into_iter()
        .map(|(text, start, end)| crate::transcription::types::Word {
            text: text.into(),
            start,
            end,
        })
        .collect();
        source
    }

    fn conform_reply(output: &str, source: &[Segment]) -> super::super::types::Clip {
        let candidate = decode(output, source).unwrap().remove(0);
        let options = super::super::types::Options {
            min_seconds: 10.0,
            max_seconds: 30.0,
            count: 1,
            format: Some("9:16".into()),
            fit: None,
            quality: None,
            automatic: true,
        };
        super::super::selection::conform(candidate, source, "media", 30.0, &options)
            .unwrap()
            .clip
    }

    #[test]
    fn decoded_quotes_end_at_the_source_word_before_the_next_question() {
        let source = speech_with_timed_closing();
        let output = r#"{"clips":[{"title":"A viagem cancelada exigiu hospedagem","openingQuote":"Comprei uma passagem para viajar","closingQuote":"voo cancelou e paguei um hotel"}]}"#;
        let clip = conform_reply(output, &source);
        assert_eq!((clip.start, clip.end), (0.0, 17.0));
        assert!(clip.end < source[1].words[7].start);
    }

    #[test]
    fn incomplete_word_alignment_keeps_the_original_segment_limits() {
        let mut source = speech_with_timed_closing();
        source[1].words.pop();
        let output = r#"{"clips":[{"title":"A viagem cancelada exigiu hospedagem","openingQuote":"Comprei uma passagem para viajar","closingQuote":"voo cancelou e paguei um hotel"}]}"#;
        let clip = conform_reply(output, &source);
        assert_eq!((clip.start, clip.end), (0.0, 25.0));
    }

    #[test]
    fn line_references_keep_segment_limits_even_when_words_have_times() {
        let source = speech_with_timed_closing();
        let output = r#"{"candidates":[{"moment":"A viagem cancelada exigiu hospedagem","firstLine":"L000","lastLine":"L001","score":80}]}"#;
        let clip = conform_reply(output, &source);
        assert_eq!((clip.start, clip.end), (0.0, 25.0));
    }

    #[test]
    fn feedback_preserves_a_valid_proposal_and_the_independent_anchor_failure() {
        let source = speech_with_timed_closing();
        let output = r#"{"clips":[{"title":"A viagem cancelada exigiu hospedagem","openingQuote":"Comprei uma passagem para viajar","closingQuote":"voo cancelou e paguei um hotel"},{"title":"Reembolso inventado","openingQuote":"Comprei uma passagem para viajar","closingQuote":"A empresa devolveu todo o dinheiro"}]}"#;
        let decoded = decode_with_feedback(output, &source).unwrap();
        assert_eq!(decoded.candidates.len(), 1);
        assert_eq!(decoded.failures.len(), 1);
        assert!(decoded.failures[0].contains("Proposta 2"));
        assert!(decoded.failures[0].contains("Reembolso inventado"));
        assert!(decoded.failures[0].contains("closingQuote"));
        assert!(decoded.failures[0].contains("A empresa devolveu todo o dinheiro"));
    }

    #[test]
    fn feedback_keeps_all_invalid_proposals_available_for_the_existing_second_search() {
        let source = speech_with_timed_closing();
        let output = r#"{"clips":[{"title":"Reembolso inventado","openingQuote":"Comprei uma passagem para viajar","closingQuote":"A empresa devolveu todo o dinheiro"}]}"#;
        let decoded = decode_with_feedback(output, &source).unwrap();
        assert!(decoded.candidates.is_empty());
        assert_eq!(decoded.failures.len(), 1);
        assert!(decode(output, &source).is_err());
        assert!(decode_with_feedback(r#"{"clips":[],"unknown":1}"#, &source).is_err());
    }

    #[test]
    fn feedback_explains_reversed_anchors_without_accepting_the_interval() {
        let source = speech_with_timed_closing();
        let output = r#"{"clips":[{"title":"Bordas invertidas","openingQuote":"voo cancelou e paguei um hotel","closingQuote":"Comprei uma passagem para viajar"}]}"#;
        let decoded = decode_with_feedback(output, &source).unwrap();
        assert!(decoded.candidates.is_empty());
        assert_eq!(decoded.failures.len(), 1);
        assert!(decoded.failures[0].contains("fechamento anterior"));
        assert!(decoded.failures[0].contains("openingQuote"));
        assert!(decoded.failures[0].contains("closingQuote"));
    }

    #[test]
    fn feedback_identifies_an_ambiguous_opening_quote() {
        let mut source = speech_with_timed_closing();
        source.push(source[0].clone());
        let output = r#"{"clips":[{"title":"Abertura repetida","openingQuote":"Comprei uma passagem para viajar","closingQuote":"voo cancelou e paguei um hotel"}]}"#;
        let decoded = decode_with_feedback(output, &source).unwrap();
        assert!(decoded.candidates.is_empty());
        assert_eq!(decoded.failures.len(), 1);
        assert!(decoded.failures[0].contains("openingQuote"));
        assert!(decoded.failures[0].contains("ambígua"));
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
    fn a_long_literal_anchor_is_not_discarded_for_exceeding_the_copy_hint() {
        let mut source = speech();
        source[0].text = (0..55)
            .map(|n| format!("palavra{n}"))
            .collect::<Vec<_>>()
            .join(" ");
        let output = serde_json::json!({"clips":[{"title":"Viagem interrompida exige pagar hospedagem", "openingQuote":source[0].text,"closingQuote":"Tive de pagar um hotel"}]}).to_string();
        let candidates = decode(&output, &source).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!((candidates[0].first_id, candidates[0].last_id), (0, 2));
    }

    #[test]
    fn a_long_inexact_anchor_is_not_accepted_by_short_quote_tolerance() {
        let mut source = speech();
        source[0].text = (0..55)
            .map(|n| format!("palavra{n}"))
            .collect::<Vec<_>>()
            .join(" ");
        let output = serde_json::json!({"clips":[{"title":"Viagem interrompida exige pagar hospedagem", "openingQuote":source[0].text.replace("palavra20", "inventado"),"closingQuote":"Tive de pagar um hotel"}]}).to_string();
        assert!(decode(&output, &source).is_err());
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
