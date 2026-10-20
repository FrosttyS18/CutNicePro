use super::{
    scene_regions, selection, semantic, store, text_engine,
    types::{Clip, ClipCollection, Options},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::path::Path;

pub struct Request<'a> {
    pub project: &'a str,
    pub media: &'a str,
    pub source: &'a Path,
    pub duration: f64,
    pub speech: &'a [Segment],
    pub options: &'a Options,
}

fn analyze(
    clips: &mut [Clip],
    control: &ProcessControl,
    mut action: impl FnMut(&mut Clip) -> Result<(), String>,
    mut progress: impl FnMut(u8),
) -> Result<(), String> {
    let total = clips.len().max(1);
    for (index, clip) in clips.iter_mut().enumerate() {
        control.check()?;
        if let Some(analysis) = &clip.analysis {
            clip.title = analysis.title.clone();
            clip.score = analysis.score();
            // preserva a proveniência (marcações de alternativa/avaliação
            // do intervalo) e acrescenta os critérios — não substitui.
            let provenance: Vec<String> = clip
                .reasons
                .iter()
                .filter(|reason| {
                    reason.contains("proveniência") || reason.contains("Avaliação do intervalo")
                })
                .cloned()
                .collect();
            let criteria: Vec<String> = analysis
                .criteria
                .iter()
                .map(|item| item.explanation.clone())
                .collect();
            let mut merged = provenance;
            merged.extend(criteria);
            clip.reasons = merged;
        } else if let Err(error) = action(clip) {
            control.check()?;
            eprintln!("[clips] analysis {}: {error}", clip.id);
            clip.analysis = None;
            clip.score = 0;
            clip.reasons.clear();
            clip.analysis_error = Some(
                "Não foi possível analisar este trecho. Tente novamente na prévia do clipe.".into(),
            );
        }
        progress((55 + 40 * (index + 1) / total) as u8);
    }
    Ok(())
}

/// Revisões humanas valem para qualquer motor; ANÁLISE (título/nota/
/// critérios) só é reaproveitada quando produzida pelo MESMO backend — o
/// experimental não pode publicar avaliações de outro modelo, nem o padrão
/// as do experimental.
pub(crate) fn merge_previous(value: &mut ClipCollection, previous: &ClipCollection) {
    let same_engine = previous
        .engine
        .as_ref()
        .is_some_and(|record| value.engine.as_ref().is_some_and(|new| new.backend == record.backend));
    for clip in &mut value.clips {
        if let Some(old) = previous.clips.iter().find(|old| {
            old.id == clip.id
                && old.format == clip.format
                && previous.transcript_hash == value.transcript_hash
        }) {
            clip.review = old.review.clone();
            if same_engine {
                clip.analysis = old.analysis.clone();
            }
        }
    }
}

pub fn run(
    base: &Path,
    scratch: &Path,
    request: Request<'_>,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<ClipCollection, String> {
    let engine = text_engine::Engine::discover(base, request.options.quality())?;
    let evaluator = |pending: &[Clip],
                     segments: &[crate::transcription::types::Segment]|
     -> Result<Vec<(String, u8, String)>, String> {
        selection::evaluate_batch_with(&engine, scratch, pending, segments, control)
    };
    let mut clips = selection::select(
        &engine,
        scratch,
        request.speech,
        request.media,
        request.duration,
        request.options,
        control,
        &evaluator,
        |percent| progress(percent / 2),
    )?;
    scene_regions::refine(
        base,
        request.source,
        scratch,
        &mut clips,
        request.speech,
        request.duration,
        request.options,
        control,
    )?;
    for clip in &mut clips {
        clip.id =
            super::types::identity(request.media, clip.start, clip.end, clip.format.as_deref());
    }
    let engine_record = engine.record();
    let mut value = ClipCollection {
        version: 1,
        media_id: request.media.into(),
        transcript_hash: store::fingerprint(request.speech)?,
        clips,
        engine: Some(engine_record.clone()),
    };
    if let Some(previous) = store::load(base, request.project, request.media, request.duration)? {
        merge_previous(&mut value, &previous);
    }
    analyze(
        &mut value.clips,
        control,
        |clip| semantic::run(&engine, scratch, clip, request.speech, control),
        progress,
    )?;
    value
        .clips
        .sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    store::validate(&value, request.duration)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn one_failed_analysis_preserves_other_clips_and_cancellation_stops_publication() {
        let clip = Clip {
            id: "a".repeat(64),
            start: 0.0,
            end: 30.0,
            title: "Trecho sem análise".into(),
            score: 80,
            reasons: vec![],
            review: super::super::types::Review::Pending,
            format: Some("9:16".into()),
            analysis: None,
            analysis_error: None,
        };
        let mut clips = vec![
            clip.clone(),
            Clip {
                id: "b".repeat(64),
                start: 30.0,
                end: 60.0,
                ..clip
            },
        ];
        let mut calls = 0;
        analyze(&mut clips,&ProcessControl::default(),|value| {
            calls+=1;
            if calls==1 { return Err("resposta inválida".into()); }
            value.analysis=Some(serde_json::from_value(serde_json::json!({"title":"Jogo perde o progresso salvo","summary":"O participante relata a perda do salvamento depois de uma falha durante a partida. O trecho termina sem apresentar uma solução.","criteria":[{"label":"Gancho","score":70,"explanation":"A perda do salvamento apresenta o problema central.","evidence":"O jogo perdeu o progresso"},{"label":"Desenvolvimento","score":60,"explanation":"O relato descreve o impacto da falha durante o jogo.","evidence":"O jogo perdeu o progresso"},{"label":"Fechamento","score":30,"explanation":"Não apresenta uma solução para recuperar o progresso.","evidence":"O jogo perdeu o progresso"}]})).unwrap());
            let analysis=value.analysis.as_ref().unwrap();value.title=analysis.title.clone();value.score=analysis.score();
            Ok(())
        },|_|{}).unwrap();
        assert_eq!(calls, 2);
        assert!(clips[0].analysis_error.is_some());
        assert_eq!(clips[0].score, 0);
        assert!(clips[1].analysis.is_some());
        store::validate(
            &ClipCollection {
                version: 1,
                media_id: "m".into(),
                transcript_hash: "h".into(),
                engine: None,
                clips: clips.clone(),
            },
            60.0,
        )
        .unwrap();
        let cancelled = ProcessControl::default();
        cancelled.cancel();
        assert!(analyze(
            &mut clips,
            &cancelled,
            |_| panic!("cancelled task must not analyze"),
            |_| {}
        )
        .is_err());
    }
}

#[cfg(test)]
mod merge_tests {
    use super::merge_previous;
    use super::super::types::{Clip, ClipCollection, EngineRecord, Review};

    fn record(backend: &str) -> Option<EngineRecord> {
        Some(EngineRecord {
            backend: backend.into(),
            model: "modelo.gguf".into(),
            template: "t".into(),
            sampling: "s".into(),
            seed: 42,
        })
    }
    fn clip(id: &str, analysis: bool) -> Clip {
        Clip {
            id: id.into(),
            start: 1.0,
            end: 30.0,
            title: "T".into(),
            score: 10,
            reasons: vec![],
            review: Review::Pending,
            format: None,
            analysis: if analysis {
                Some(serde_json::from_value(serde_json::json!({
                    "title":"T","summary":"S",
                    "criteria":[
                        {"label":"Gancho","score":1,"explanation":"a","evidence":"e"},
                        {"label":"Desenvolvimento","score":1,"explanation":"a","evidence":"e"},
                        {"label":"Fechamento","score":1,"explanation":"a","evidence":"e"}]})).unwrap())
            } else {
                None
            },
            analysis_error: None,
        }
    }
    fn collection(engine: Option<EngineRecord>, clips: Vec<Clip>) -> ClipCollection {
        ClipCollection {
            version: 1,
            media_id: "m".into(),
            transcript_hash: "h".into(),
            clips,
            engine,
        }
    }

    #[test]
    fn review_merges_across_engines_but_analysis_only_within_same_backend() {
        let old_clip = clip("a", true);
        let mut previous = collection(record("standard"), vec![Clip {
            review: Review::Approved,
            ..old_clip.clone()
        }]);
        previous.transcript_hash = "h".into();
        let mut experimental = collection(record("experimentalGemma"), vec![clip("a", false)]);
        merge_previous(&mut experimental, &previous);
        // revisão humana vale para qualquer motor
        assert_eq!(experimental.clips[0].review, Review::Approved);
        // análise de OUTRO motor não é reutilizada
        assert!(experimental.clips[0].analysis.is_none());

        let mut same = collection(record("standard"), vec![clip("a", false)]);
        merge_previous(&mut same, &previous);
        assert!(same.clips[0].analysis.is_some(), "mesmo backend deve reaproveitar");
    }

    #[test]
    fn legacy_collection_without_engine_keeps_review_and_never_reuses_analysis() {
        let mut previous = collection(None, vec![Clip {
            review: Review::Approved,
            ..clip("a", true)
        }]);
        previous.transcript_hash = "h".into();
        let mut standard = collection(record("standard"), vec![clip("a", false)]);
        merge_previous(&mut standard, &previous);
        assert_eq!(standard.clips[0].review, Review::Approved);
        // sem metadado não há garantia de origem: só reanálise publica nota
        assert!(standard.clips[0].analysis.is_none());
    }
}
