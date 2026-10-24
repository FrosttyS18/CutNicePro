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
    candidates.retain(|candidate| {
        fresh
            .iter()
            .all(|old| candidate.end <= old.start || candidate.start >= old.end)
    });
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
    pool.truncate(12);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bounds {
    first_id: usize,
    last_id: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    repair: Option<Bounds>,
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
    let refined = super::borders::refine_boundaries(
        first.start,
        last.end,
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
        let mut input = None;
        for padding in [45.0, 20.0, 0.0] {
            let start = speech
                .iter()
                .position(|s| s.end >= original.start - padding)
                .unwrap_or(speech.len());
            let end = speech.partition_point(|s| s.start <= original.end + padding);
            let range = start..end;
            if range.is_empty() {
                continue;
            }
            let data = serde_json::json!({"rejected":{"start":original.start,"end":original.end,"analysis":original.analysis,"reasons":original.reasons},
                "minSeconds":options.min_seconds,"maxSeconds":options.max_seconds,
                "speech":range.clone().map(|i|serde_json::json!([i,speech[i].start,speech[i].end,speech[i].text])).collect::<Vec<_>>()});
            let prompt = engine.prompt(include_str!("repair-prompt.txt"), &data)?;
            let fits = engine.count_tokens(scratch, &prompt)?
                <= super::engine_tools::CONTEXT_TOKENS - 1000;
            if fits {
                input = Some((range, prompt));
                break;
            }
        }
        let Some((range, prompt)) = input else {
            continue;
        };
        let ids: Vec<_> = range.clone().collect();
        let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["repair"],"properties":{"repair":{"anyOf":[{"type":"null"},{"type":"object","additionalProperties":false,"required":["firstId","lastId"],"properties":{"firstId":{"type":"integer","enum":ids},"lastId":{"type":"integer","enum":ids}}}]}}});
        *budget -= 1;
        eprintln!(
            "[clips] reparando [{:.2}-{:.2}] com falas vizinhas; {} tentativas restantes",
            original.start, original.end, budget
        );
        let output = engine.generate(
            scratch,
            &format!("repair-{budget}"),
            &prompt,
            &schema,
            600,
            control,
        )?;
        let reply = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<Reply>()
            .next()
            .ok_or("A correção do intervalo não gerou resposta.")?
            .map_err(|_| "A correção do intervalo retornou uma resposta inválida.")?;
        if let Some(bounds) = reply.repair {
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
        assert_eq!((fresh[1].start, fresh[1].end), (30.0, 50.0));
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
                last_id: 1
            },
            &(0..6),
            &speech,
            "m",
            &options
        )
        .is_some());
    }
    #[test]
    fn repair_rejects_unchanged_out_of_context_or_overlong_intervals() {
        let (clip, speech, options) = fixture();
        for bounds in [
            Bounds {
                first_id: 1,
                last_id: 2,
            },
            Bounds {
                first_id: 0,
                last_id: 3,
            },
            Bounds {
                first_id: 1,
                last_id: 7,
            },
            Bounds {
                first_id: 4,
                last_id: 3,
            },
        ] {
            assert!(apply(&clip, bounds, &(1..7), &speech, "m", &options).is_none());
        }
    }
}
