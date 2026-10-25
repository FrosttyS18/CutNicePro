use super::{
    text_engine::Engine,
    types::{Clip, Options, Review},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::Deserialize;
use std::{ops::Range, path::Path};

pub struct Repaired {
    pub clip: Clip,
    pub original: (f64, f64),
}

pub fn fill_remaining(
    fresh: &mut Vec<Clip>,
    rejected: &[Clip],
    options: &Options,
    repair: impl FnOnce() -> Result<Vec<Clip>, String>,
) -> Result<usize, String> {
    if rejected.is_empty() {
        return Ok(0);
    }
    let remaining = options.count.saturating_sub(fresh.len());
    if remaining == 0 {
        return Ok(0);
    }
    let mut candidates = repair()?;
    candidates.retain(|candidate| !super::novelty::duplicate_of(fresh, candidate));
    let selected =
        super::selection::finalize_prioritized(candidates, remaining, options.automatic, 0);
    let count = selected.len();
    fresh.extend(selected);
    Ok(count)
}

pub fn remember_rejections(
    pool: &mut Vec<Clip>,
    pending: &[Clip],
    judgments: &[super::selection::Evaluation],
) {
    for judgment in judgments.iter().filter(|j| !j.standalone || !j.complete) {
        let index = judgment
            .id
            .strip_prefix('E')
            .and_then(|s| s.parse::<usize>().ok())
            .and_then(|n| n.checked_sub(1));
        if let Some(clip) = index.and_then(|i| pending.get(i)) {
            if pool.iter().any(|old| old.id == clip.id) {
                continue;
            }
            let mut rejected = clip.clone();
            super::assessment::apply(&mut rejected, judgment);
            rejected
                .reasons
                .push(format!("Correção necessária: {}", judgment.reason));
            pool.push(rejected);
        }
    }
    pool.sort_by(|a, b| b.score.cmp(&a.score));
    pool.truncate(super::types::AUTOMATIC_MAX_CLIPS);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bounds {
    first_id: usize,
    last_id: usize,
    #[serde(skip)]
    quote_bounds: Option<(f64, f64)>,
}

fn apply(
    original: &Clip,
    bounds: Bounds,
    range: &Range<usize>,
    speech: &[Segment],
    media: &str,
    options: &Options,
) -> Option<Repaired> {
    if bounds.first_id > bounds.last_id
        || !range.contains(&bounds.first_id)
        || !range.contains(&bounds.last_id)
    {
        return None;
    }
    let first = speech.get(bounds.first_id)?;
    let last = speech.get(bounds.last_id)?;
    let (start, end) = if let Some(quote_bounds) = bounds.quote_bounds {
        let candidate = super::selection::Candidate {
            moment: String::new(),
            first_id: bounds.first_id,
            last_id: bounds.last_id,
            score: 0,
            quote_bounds: Some(quote_bounds),
        };
        let contender =
            super::selection::conform(candidate, speech, media, speech.last()?.end, options)
                .ok()?;
        (contender.clip.start, contender.clip.end)
    } else {
        (first.start, last.end)
    };
    let refined = super::borders::refine_boundaries(
        start,
        end,
        speech,
        &[],
        options.min_seconds,
        None,
        None,
        speech.last()?.end,
    );
    if refined.end - refined.start < options.min_seconds
        || refined.end - refined.start > options.max_seconds
        || refined.start >= original.end
        || refined.end <= original.start
        || ((refined.start - original.start).abs() < 0.001
            && (refined.end - original.end).abs() < 0.001)
    {
        return None;
    }
    let clip = Clip {
        id: super::types::identity(
            media,
            refined.start,
            refined.end,
            original.format.as_deref(),
        ),
        start: refined.start,
        end: refined.end,
        fit: options.fit.clone(),
        score: 0,
        reasons: vec![
            "Proveniência: intervalo reparado a partir da análise de abertura/fechamento".into(),
        ],
        analysis: None,
        analysis_error: None,
        analysis_signature: None,
        analysis_stale: None,
        created_at_ms: None,
        review: Review::Pending,
        deleted: None,
        face_framing: None,
        multimodal: None,
        ..original.clone()
    };
    Some(Repaired {
        clip,
        original: (original.start, original.end),
    })
}

pub fn recover(
    engine: &Engine,
    scratch: &Path,
    rejected: &[Clip],
    speech: &[Segment],
    media: &str,
    options: &Options,
    control: &ProcessControl,
    budget: &mut usize,
) -> Result<Vec<Repaired>, String> {
    let mut recovered = Vec::new();
    for original in rejected {
        if *budget == 0 {
            break;
        }
        control.check()?;
        let range = 0..speech.len();
        if range.is_empty() {
            continue;
        }
        let defects = original
            .analysis
            .as_ref()
            .map(|analysis| {
                analysis
                    .criteria
                    .iter()
                    .filter(|c| c.score < super::types::AUTOMATIC_RELEVANCE_FLOOR)
                    .map(|c| c.explanation.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let issues = if defects.is_empty() {
            &original.reasons
        } else {
            &defects
        };
        let data = serde_json::json!({"rejected":{"start":original.start,"end":original.end,"includedSpeech":super::semantic::source(original,speech),"issues":issues},
            "minSeconds":options.min_seconds,"maxSeconds":options.max_seconds,
            "speech":speech.iter().map(|s|s.text.as_str()).collect::<Vec<_>>().join("\n")});
        let prompt = engine.prompt(include_str!("repair-prompt.txt"), &data)?;
        if engine.count_tokens(scratch, &prompt)? > super::engine_tools::CONTEXT_TOKENS - 1000 {
            return Err("A transcrição completa excede o contexto disponível para corrigir o corte. Nenhum texto foi dividido ou truncado.".into());
        }
        let schema = super::source_anchors::schema(1);
        *budget -= 1;
        eprintln!(
            "[clips] reparando [{:.2}-{:.2}] com a transcrição completa; {} tentativas restantes",
            original.start, original.end, budget
        );
        let output = engine.generate_extraction(
            scratch,
            &format!("repair-{budget}"),
            &prompt,
            &schema,
            600,
            control,
        )?;
        let candidates = match super::discovery_reply::decode(&output, speech) {
            Ok(candidates) => candidates,
            Err(error) => {
                eprintln!("[clips] reparo sem bordas localizadas: {error}");
                continue;
            }
        };
        if let Some(candidate) = candidates.into_iter().next() {
            let bounds = Bounds {
                first_id: candidate.first_id,
                last_id: candidate.last_id,
                quote_bounds: candidate.quote_bounds,
            };
            if let Some(mut repaired) = apply(original, bounds, &range, speech, media, options) {
                repaired.clip.engine = Some(engine.record());
                eprintln!(
                    "[clips] intervalo reparado: [{:.2}-{:.2}] → [{:.2}-{:.2}]",
                    original.start, original.end, repaired.clip.start, repaired.clip.end
                );
                recovered.push(repaired);
            }
        }
    }
    Ok(recovered)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Clip, Vec<Segment>, Options) {
        let clip:Clip=serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":10.0,"end":30.0,"title":"Versão sem conclusão","score":30,"reasons":[],"review":"pending","createdAtMs":10})).unwrap();
        let speech = (0..8)
            .map(|i| Segment {
                id: i.to_string(),
                start: i as f64 * 10.0,
                end: (i + 1) as f64 * 10.0,
                text: "Uma fala.".into(),
                words: vec![],
            })
            .collect();
        let options = Options {
            min_seconds: 10.0,
            max_seconds: 50.0,
            count: 3,
            format: Some("9:16".into()),
            fit: Some("cover".into()),
            quality: None,
            automatic: true,
        };
        (clip, speech, options)
    }
    #[test]
    fn repairs_fill_free_slots_without_displacing_accepted_moments() {
        let (mut accepted, _, mut options) = fixture();
        accepted.id = "accepted".into();
        accepted.start = 0.0;
        accepted.end = 20.0;
        let rejected = vec![accepted.clone()];
        let mut fresh = vec![accepted.clone()];
        options.count = 2;
        let mut called = false;
        let added = fill_remaining(&mut fresh, &rejected, &options, || {
            called = true;
            Ok([(10.0, 30.0, 99), (30.0, 50.0, 90), (60.0, 80.0, 80)]
                .into_iter()
                .enumerate()
                .map(|(index, (start, end, score))| Clip {
                    id: format!("repaired-{index}"),
                    start,
                    end,
                    score,
                    ..accepted.clone()
                })
                .collect())
        })
        .unwrap();
        assert!(called);
        assert_eq!(added, 1);
        assert_eq!(fresh.len(), 2);
        assert_eq!(
            serde_json::to_value(&fresh[0]).unwrap(),
            serde_json::to_value(&accepted).unwrap()
        );
        assert_eq!((fresh[1].start, fresh[1].end), (10.0, 30.0));
        assert_eq!(
            fill_remaining(&mut fresh, &rejected, &options, || panic!("sem vagas")),
            Ok(0)
        );
    }
    #[test]
    fn rejected_candidates_reach_repair_without_becoming_approved_clips() {
        let (clip, _, _) = fixture();
        let mut pool = Vec::new();
        let judgments = vec![super::super::selection::Evaluation {
            id: "E1".into(),
            score: 75,
            reason: "Falta a apresentação do assunto".into(),
            nature: super::super::selection::Nature::Relato,
            advertising: false,
            standalone: false,
            complete: true,
            analysis: None,
            analysis_signature: None,
        }];
        remember_rejections(&mut pool, &[clip.clone()], &judgments);
        assert_eq!(pool.len(), 1);
        assert!(pool[0]
            .reasons
            .iter()
            .any(|r| r.contains("Falta a apresentação")));
        assert_eq!(pool[0].score, 75);
        assert_eq!(clip.score, 30);
        remember_rejections(&mut pool, &[clip], &judgments);
        assert_eq!(pool.len(), 1);
    }

    #[test]
    fn grounded_repair_can_include_context_or_remove_a_dangling_tail() {
        let (clip, speech, options) = fixture();
        let fixed = apply(
            &clip,
            Bounds {
                first_id: 0,
                last_id: 3,
                quote_bounds: None,
            },
            &(0..6),
            &speech,
            "m",
            &options,
        )
        .expect("intervalo reparado");
        assert_eq!((fixed.clip.start, fixed.clip.end), (0.0, 40.0));
        assert_eq!(fixed.original, (10.0, 30.0));
        assert_ne!(fixed.clip.id, clip.id);
        assert!(fixed.clip.analysis.is_none());
        assert_eq!(fixed.clip.created_at_ms, None);
        assert_eq!(clip.created_at_ms, Some(10));
        assert!(apply(
            &clip,
            Bounds {
                first_id: 1,
                last_id: 1,
                quote_bounds: None,
            },
            &(0..6),
            &speech,
            "m",
            &options
        )
        .is_some());
    }
    #[test]
    fn a_repaired_cut_keeps_the_requested_fit_when_the_original_draft_has_none() {
        let (clip, speech, mut options) = fixture();
        assert!(clip.fit.is_none());
        for fit in ["cover", "contain"] {
            options.fit = Some(fit.into());
            let repaired = apply(
                &clip,
                Bounds {
                    first_id: 0,
                    last_id: 3,
                    quote_bounds: None,
                },
                &(0..6),
                &speech,
                "m",
                &options,
            )
            .unwrap();
            assert_eq!(repaired.clip.fit.as_deref(), Some(fit));
            assert!(clip.fit.is_none());
        }
    }
    #[test]
    fn repair_rejects_unchanged_out_of_context_or_overlong_intervals() {
        let (clip, speech, options) = fixture();
        for bounds in [
            Bounds {
                first_id: 1,
                last_id: 2,
                quote_bounds: None,
            },
            Bounds {
                first_id: 0,
                last_id: 3,
                quote_bounds: None,
            },
            Bounds {
                first_id: 1,
                last_id: 7,
                quote_bounds: None,
            },
            Bounds {
                first_id: 4,
                last_id: 3,
                quote_bounds: None,
            },
        ] {
            assert!(apply(&clip, bounds, &(1..7), &speech, "m", &options).is_none());
        }
    }

    #[test]
    fn repaired_quote_boundaries_stop_at_the_source_word_and_preserve_fit() {
        let (clip, mut speech, options) = fixture();
        speech.truncate(2);
        speech[0].text = "Comprei uma passagem para viajar.".into();
        speech[1].text = "O voo cancelou e paguei um hotel. Mas e amanhã?".into();
        speech[1].end = 30.0;
        speech[1].words = [
            ("O", 10.0, 10.5),
            ("voo", 10.5, 11.0),
            ("cancelou", 11.0, 12.0),
            ("e", 12.0, 12.5),
            ("paguei", 12.5, 14.0),
            ("um", 14.0, 14.5),
            ("hotel.", 14.5, 15.0),
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
        let output = r#"{"clips":[{"title":"A viagem cancelada exigiu hospedagem","openingQuote":"Comprei uma passagem para viajar","closingQuote":"voo cancelou e paguei um hotel"}]}"#;
        let candidate = super::super::discovery_reply::decode(output, &speech)
            .unwrap()
            .remove(0);
        let repaired = apply(
            &clip,
            Bounds {
                first_id: candidate.first_id,
                last_id: candidate.last_id,
                quote_bounds: candidate.quote_bounds,
            },
            &(0..2),
            &speech,
            "m",
            &options,
        )
        .unwrap();
        assert_eq!((repaired.clip.start, repaired.clip.end), (0.0, 15.0));
        assert_eq!(repaired.clip.fit.as_deref(), Some("cover"));
        assert_eq!(repaired.original, (10.0, 30.0));
        assert_eq!(
            repaired.clip.id,
            super::super::types::identity("m", 0.0, 15.0, None)
        );
        assert!(repaired.clip.analysis.is_none());
    }
}
