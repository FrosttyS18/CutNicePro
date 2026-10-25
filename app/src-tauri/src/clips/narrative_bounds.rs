use super::{
    source_anchors,
    text_engine::Engine,
    types::{Clip, Options},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::Deserialize;
use std::{collections::HashMap, path::Path};

struct Draft {
    id: String,
    opening_quote: String,
    closing_quote: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    clips: Vec<Quote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Quote {
    #[serde(rename = "title")]
    _title: String,
    opening_quote: String,
    closing_quote: String,
}

fn apply(clips: &mut [Clip], drafts: Vec<Draft>, speech: &[Segment], options: &Options) -> usize {
    let counts = drafts.iter().fold(HashMap::new(), |mut counts, draft| {
        *counts.entry(draft.id.clone()).or_insert(0usize) += 1;
        counts
    });
    let mut changed = 0;
    for draft in drafts {
        if counts[&draft.id] != 1 {
            continue;
        }
        let Some(clip) = clips.iter_mut().find(|c| c.id == draft.id) else {
            continue;
        };
        let Some((start, end)) =
            source_anchors::quote_bounds(&draft.opening_quote, &draft.closing_quote, speech)
        else {
            continue;
        };
        let span = end - start;
        if span < options.min_seconds
            || span > options.max_seconds
            || start < (clip.start - 40.0).max(0.0)
            || end > clip.end + 60.0
            || start >= clip.end
            || end <= clip.start
            || ((start - clip.start).abs() < 0.001 && (end - clip.end).abs() < 0.001)
        {
            continue;
        }
        eprintln!(
            "[clips] revisão narrativa: [{:.2}-{:.2}] → [{start:.2}-{end:.2}]",
            clip.start, clip.end
        );
        clip.start = start;
        clip.end = end;
        clip.analysis = None;
        clip.analysis_signature = None;
        clip.analysis_error = None;
        clip.analysis_stale = None;
        clip.reasons.push("Proveniência: limites narrativos revistos na transcrição completa, com tempos da fonte".into());
        changed += 1;
    }
    changed
}

fn approved_review(mut candidate: Clip, judgment: &super::selection::Evaluation) -> Option<Clip> {
    if !judgment.standalone
        || !judgment.complete
        || judgment.score < super::types::AUTOMATIC_RELEVANCE_FLOOR
    {
        return None;
    }
    super::assessment::apply(&mut candidate, judgment);
    Some(candidate)
}

pub fn review(
    engine: &Engine,
    scratch: &Path,
    clips: &mut [Clip],
    speech: &[Segment],
    options: &Options,
    control: &ProcessControl,
) -> Result<(), String> {
    if !options.automatic || clips.is_empty() {
        return Ok(());
    }
    let mut updates = Vec::new();
    for (index, original) in clips.iter().enumerate() {
        control.check()?;
        let data = serde_json::json!({"roughClip":{"start":original.start,"end":original.end,"includedSpeech":super::semantic::source(original,speech)},
            "nearbySpeech":speech.iter().filter(|s|s.end>original.start-40.0 && s.start<original.end+60.0).map(|s|serde_json::json!({"start":s.start,"end":s.end,"text":s.text})).collect::<Vec<_>>(),
            "speech":speech.iter().map(|s|s.text.as_str()).collect::<Vec<_>>().join("\n")});
        let prompt = engine.prompt(include_str!("bounds-prompt.txt"), &data)?;
        if engine.count_tokens(scratch, &prompt)? > super::engine_tools::CONTEXT_TOKENS - 1000 {
            return Err("A transcrição completa excede o contexto para rever os limites. Nenhum texto foi truncado.".into());
        }
        let output = engine.generate_extraction(
            scratch,
            &format!("bounds-{}", uuid::Uuid::new_v4()),
            &prompt,
            &source_anchors::schema(1),
            800,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<Reply>()
            .next();
        let Some(Ok(reply)) = reply else {
            continue;
        };
        let Some(quote) = reply.clips.into_iter().next() else {
            continue;
        };
        let mut candidate = original.clone();
        if apply(
            std::slice::from_mut(&mut candidate),
            vec![Draft {
                id: original.id.clone(),
                opening_quote: quote.opening_quote,
                closing_quote: quote.closing_quote,
            }],
            speech,
            options,
        ) == 0
        {
            continue;
        }
        let judgments = super::assessment::evaluate(
            engine,
            scratch,
            std::slice::from_ref(&candidate),
            speech,
            control,
        )?;
        if let Some(candidate) = judgments
            .first()
            .and_then(|j| approved_review(candidate, j))
        {
            updates.push((index, candidate));
        } else {
            eprintln!("[clips] revisão narrativa recusada; proposta original aprovada preservada");
        }
    }
    eprintln!(
        "[clips] revisão narrativa: {} ajustes aprovados",
        updates.len()
    );
    for (index, candidate) in updates {
        clips[index] = candidate;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_complete_but_low_value_review_cannot_replace_an_approved_cut() {
        let candidate:Clip=serde_json::from_value(serde_json::json!({"id":"a","start":0,"end":20,"title":"Uma história completa","score":80,"reasons":[],"review":"pending"})).unwrap();
        let analysis = super::super::analysis_types::Analysis {
            title: "Uma história completa".into(),
            summary:
                "A viagem foi cancelada e exigiu pagar uma hospedagem que não estava prevista."
                    .into(),
            criteria: [("Gancho", 50), ("Desenvolvimento", 0), ("Fechamento", 50)]
                .into_iter()
                .map(|(label, score)| super::super::analysis_types::Criterion {
                    label: label.into(),
                    score,
                    explanation: "Explicação controlada para este teste de regressão.".into(),
                    evidence: "Comprei uma passagem para viajar".into(),
                })
                .collect(),
        };
        let judgment = super::super::selection::Evaluation {
            id: "E1".into(),
            score: analysis.score(),
            reason: "História completa mas sem desenvolvimento suficiente.".into(),
            nature: super::super::selection::Nature::Relato,
            advertising: false,
            standalone: true,
            complete: true,
            analysis: Some(analysis),
            analysis_signature: None,
        };
        assert_eq!(judgment.score, 35);
        assert!(approved_review(candidate.clone(), &judgment).is_none());
        assert_eq!(candidate.score, 80);
    }

    #[test]
    fn a_review_cannot_change_an_unknown_repeated_or_unrelated_clip() {
        let mut clips:Vec<Clip>=serde_json::from_value(serde_json::json!([{"id":"a","start":0,"end":10,"title":"Um relato inicial","score":80,"reasons":[],"review":"pending","fit":"cover"}])).unwrap();
        let before = serde_json::to_value(&clips).unwrap();
        let speech = vec![Segment {
            id: "0".into(),
            start: 20.0,
            end: 40.0,
            text: "Um outro assunto começa e termina aqui.".into(),
            words: vec![],
        }];
        let options = serde_json::from_value::<super::super::types::GenerateOptions>(
            serde_json::json!({"automatic":true}),
        )
        .unwrap()
        .resolve()
        .unwrap();
        let draft = |id: &str| Draft {
            id: id.into(),
            opening_quote: "Um outro assunto começa e termina aqui".into(),
            closing_quote: "Um outro assunto começa e termina aqui".into(),
        };
        for drafts in [
            vec![draft("unknown")],
            vec![draft("a"), draft("a")],
            vec![draft("a")],
        ] {
            assert_eq!(apply(&mut clips, drafts, &speech, &options), 0);
            assert_eq!(serde_json::to_value(&clips).unwrap(), before);
        }
    }

    #[test]
    fn changed_bounds_invalidate_the_previous_judgment_and_preserve_the_clip_identity_until_reassessment(
    ) {
        let mut clips:Vec<Clip>=serde_json::from_value(serde_json::json!([{"id":"a","start":0,"end":10,"title":"Uma história da viagem","score":80,"reasons":[],"review":"pending","fit":"cover","analysisSignature":"old"}])).unwrap();
        let speech = vec![
            Segment {
                id: "0".into(),
                start: 0.0,
                end: 8.0,
                text: "Comprei uma passagem para viajar.".into(),
                words: vec![],
            },
            Segment {
                id: "1".into(),
                start: 8.0,
                end: 16.0,
                text: "O voo cancelou e paguei um hotel.".into(),
                words: vec![],
            },
        ];
        let options = serde_json::from_value::<super::super::types::GenerateOptions>(
            serde_json::json!({"automatic":true}),
        )
        .unwrap()
        .resolve()
        .unwrap();
        let result = apply(
            &mut clips,
            vec![Draft {
                id: "a".into(),
                opening_quote: "Comprei uma passagem para viajar".into(),
                closing_quote: "O voo cancelou e paguei um hotel".into(),
            }],
            &speech,
            &options,
        );
        assert_eq!(result, 1);
        assert_eq!((clips[0].start, clips[0].end), (0.0, 16.0));
        assert_eq!(clips[0].id, "a");
        assert_eq!(clips[0].fit.as_deref(), Some("cover"));
        assert!(clips[0].analysis_signature.is_none());
        assert_eq!(clips[0].score, 80);
    }
}
