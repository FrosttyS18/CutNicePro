use super::{
    borders, editorial, editorial_repair, face_framing, scene_regions, selection, semantic, store,
    text_engine,
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
                    reason.to_lowercase().contains("proveniência")
                        || reason.contains("Avaliação do intervalo")
                        || reason.contains("Conteúdo promocional")
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

#[cfg(test)]
pub(crate) use super::novelty::duplicate_of;

/// Geração incremental (atualizações 19/20): a biblioteca é CUMULATIVA. Os
/// cortes existentes permanecem INTACTOS — id, título, revisão, análise,
/// assinatura, exclusão e motor de origem — e somente candidatos NOVOS
/// (após deduplicação) são acrescentados. A origem CONHECIDA dos históricos
/// é preservada ANTES de a coleção registrar o motor da última execução:
/// clipes legados sem metadado próprio herdam o da coleção anterior; quem
/// não tem nenhum permanece sem origem (reanálise representa honestamente).
pub(crate) fn merge_incremental(
    previous: Option<ClipCollection>,
    fresh: Vec<Clip>,
    media: &str,
    speech: &[crate::transcription::types::Segment],
    engine_record: super::types::EngineRecord,
) -> ClipCollection {
    match previous {
        Some(mut previous) => {
            let inherited = previous.engine.clone();
            for clip in &mut previous.clips {
                if clip.engine.is_none() {
                    clip.engine = inherited.clone();
                }
            }
            previous.clips.extend(fresh);
            previous.engine = Some(engine_record);
            // estado granular: edição real na transcrição marca SOMENTE os
            // clipes afetados como desatualizados (análise preservada);
            // legados sem baseline ficam com a incerteza representada.
            previous.refresh_analysis_state(speech);
            previous
        }
        None => {
            let mut value = ClipCollection {
                version: 1,
                media_id: media.into(),
                transcript_hash: String::new(),
                clips: fresh,
                engine: Some(engine_record),
            };
            value.refresh_analysis_state(speech);
            value
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
    let repair_pool = std::cell::RefCell::new(Vec::new());
    let evaluator = |pending: &[Clip],
                     _segments: &[Segment]|
     -> Result<Vec<selection::Evaluation>, String> {
        let judgments =
            selection::evaluate_batch_with(&engine, scratch, pending, request.speech, control)?;
        editorial_repair::remember_rejections(&mut repair_pool.borrow_mut(), pending, &judgments);
        Ok(judgments)
    };
    let previous = store::load(base, request.project, request.media, request.duration)?;
    let search_history = std::cell::RefCell::new(selection::DiscoveryHistory::default());
    let known_ids: std::collections::HashSet<String> = previous
        .as_ref()
        .map(|library| library.clips.iter().map(|c| c.id.clone()).collect())
        .unwrap_or_default();
    let prepare = |speech: &[Segment],
                   on_progress: &mut dyn FnMut(u8)|
     -> Result<Vec<Clip>, String> {
        let mut clips = selection::select(
            &engine,
            scratch,
            speech,
            request.media,
            request.duration,
            request.options,
            &mut search_history.borrow_mut(),
            control,
            &evaluator,
            |percent| on_progress(percent / 2),
        )?;
        let original_bounds = clips
            .iter()
            .map(|clip| (clip.id.clone(), (clip.start, clip.end)))
            .collect();
        scene_regions::refine(
            base,
            request.source,
            scratch,
            &mut clips,
            speech,
            request.duration,
            request.options,
            control,
        )?;
        // G6 nº 2 (goal-recuperacao-autoclip): refine determinístico de
        // fronteiras frase+pausa DEPOIS do ajuste por cenas — o LLM escolheu
        // o momento, o código garante bordas em unidades de fala completas
        // (adaptado dos dois AutoClip; insumos já presentes: words do Whisper
        // + pausas reais quando o modo multimodal as calculou). Sem words →
        // janela intacta (borders.rs é conservador). IDs dependem dos limites
        // e são recalculados no laço seguinte.
        borders::refine_candidates(
            &mut clips,
            speech,
            request.options.min_seconds,
            request.duration,
        );
        clips.retain(|clip| clip.end - clip.start <= request.options.max_seconds + 1e-6);
        editorial::recheck_adjusted(&mut clips, &original_bounds, speech, &evaluator)?;
        control.check()?;
        for clip in &mut clips {
            clip.fit = request.options.fit.clone();
            clip.id =
                super::types::identity(request.media, clip.start, clip.end, clip.format.as_deref());
            clip.engine = Some(engine.record());
        }
        Ok(clips)
    };
    let mut fresh = prepare(request.speech, &mut |percent| progress(percent / 2))?;
    let mut repair_budget = 3usize;
    let mut finish_candidates = |fresh: &mut Vec<Clip>,
                                 on_progress: &mut dyn FnMut(u8)|
     -> Result<(), String> {
        analyze(
            fresh,
            control,
            |clip| semantic::run(&engine, scratch, clip, request.speech, control),
            &mut *on_progress,
        )?;
        let mut rejected: Vec<_> = fresh
            .iter()
            .filter(|c| !editorial::is_complete(c))
            .cloned()
            .collect();
        rejected.extend(std::mem::take(&mut *repair_pool.borrow_mut()));
        rejected.sort_by(|a, b| b.score.cmp(&a.score));
        let mut seen = std::collections::HashSet::new();
        rejected.retain(|c| seen.insert(c.id.clone()));
        search_history
            .borrow_mut()
            .rejected
            .extend(rejected.iter().cloned());
        editorial::retain_analyzed_complete(fresh);
        editorial_repair::fill_remaining(fresh, &rejected, request.options, || {
            let repaired = editorial_repair::recover(
                &engine,
                scratch,
                &rejected,
                request.speech,
                request.media,
                request.options,
                control,
                &mut repair_budget,
            )?;
            let originals = repaired
                .iter()
                .map(|r| (r.clip.id.clone(), r.original))
                .collect();
            let mut candidates: Vec<_> = repaired.into_iter().map(|r| r.clip).collect();
            editorial::recheck_adjusted(&mut candidates, &originals, request.speech, &evaluator)?;
            analyze(
                &mut candidates,
                control,
                |clip| semantic::run(&engine, scratch, clip, request.speech, control),
                &mut *on_progress,
            )?;
            candidates.retain(|c| c.analysis.is_some());
            editorial::retain_analyzed_complete(&mut candidates);
            candidates.retain(|c| {
                !request.options.automatic || c.score >= super::types::AUTOMATIC_RELEVANCE_FLOOR
            });
            Ok(candidates)
        })?;
        Ok(())
    };
    // análise SOMENTE dos novos (upd 20): antigos, excluídos, rejeitados e
    // desatualizados não recebem trabalho oculto do motor nesta geração.
    finish_candidates(&mut fresh, &mut |percent| progress(percent / 2))?;
    let additional = super::generation_rounds::extend(
        &mut fresh,
        request.options.automatic,
        request.options.count,
        |attempted| {
            eprintln!("[clips] busca de cobertura com a transcrição completa; {} resultados já aproveitáveis nesta execução", attempted.len());
            search_history
                .borrow_mut()
                .accepted
                .extend(attempted.iter().cloned());
            let mut more = prepare(request.speech, &mut |percent| {
                progress(50 + (u16::from(percent) * 45 / 100) as u8)
            })?;
            finish_candidates(&mut more, &mut |percent| {
                progress(50 + (u16::from(percent) * 45 / 100) as u8)
            })?;
            Ok(more)
        },
    );
    if let Err(error) = additional {
        control.check()?;
        if fresh.is_empty() {
            return Err(error);
        }
        eprintln!(
            "[clips] busca adicional não concluída; {} resultados válidos mantidos: {error}",
            fresh.len()
        );
    }
    fresh =
        selection::finalize_prioritized(fresh, request.options.count, request.options.automatic, 0);
    progress(95);
    if fresh.is_empty() && previous.is_none() {
        return Err("Não encontramos cortes com abertura e fechamento completos nesta rodada. Tente outra faixa ou amplie a duração máxima.".into());
    }
    face_framing::enrich(base, request.source, scratch, &mut fresh, control)?;
    let published_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    super::generation_batch::publish(
        &mut fresh,
        &uuid::Uuid::new_v4().to_string(),
        published_at_ms,
    );
    stamp_creation(&mut fresh, &known_ids, published_at_ms);
    let mut value = merge_incremental(
        previous,
        fresh,
        request.media,
        request.speech,
        engine.record(),
    );
    value
        .clips
        .sort_by(|a, b| b.score.cmp(&a.score).then(a.start.total_cmp(&b.start)));
    store::validate(&value, request.duration)?;
    Ok(value)
}

fn stamp_creation(
    clips: &mut [Clip],
    known_ids: &std::collections::HashSet<String>,
    published_at_ms: u64,
) {
    for clip in clips {
        if clip.created_at_ms.is_none() && !known_ids.contains(&clip.id) {
            clip.created_at_ms = Some(published_at_ms);
        }
    }
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
            fit: None,
            analysis: None,
            analysis_error: None,
            analysis_signature: None,
            analysis_stale: None,
            multimodal: None,
            face_framing: None,
            created_at_ms: None,
            deleted: None,
            deleted_at_ms: None,
            engine: None,
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
mod incremental_tests {
    use super::super::types::{Clip, ClipCollection, EngineRecord, Review};
    use super::stamp_creation;
    use super::{duplicate_of, merge_incremental};
    use crate::transcription::types::Segment;

    fn record(backend: &str) -> EngineRecord {
        EngineRecord {
            backend: backend.into(),
            model: "modelo.gguf".into(),
            template: "t".into(),
            sampling: "s".into(),
            seed: 42,
        }
    }
    fn clip(id: &str, start: f64, end: f64) -> Clip {
        Clip {
            id: id.into(),
            start,
            end,
            title: format!("T {id}"),
            score: 10,
            reasons: vec![],
            review: Review::Pending,
            format: Some("9:16".into()),
            fit: None,
            analysis: None,
            analysis_error: None,
            analysis_signature: None,
            analysis_stale: None,
            multimodal: None,
            face_framing: None,
            created_at_ms: None,
            deleted: None,
            deleted_at_ms: None,
            engine: None,
        }
    }
    #[test]
    fn creation_is_stamped_once_without_rejuvenating_known_or_legacy_clips() {
        let mut fresh = vec![
            clip(&"a".repeat(64), 0.0, 10.0),
            clip(&"b".repeat(64), 10.0, 20.0),
            clip(&"c".repeat(64), 20.0, 30.0),
        ];
        fresh[2].created_at_ms = Some(10);
        let known = std::collections::HashSet::from([fresh[1].id.clone(), fresh[2].id.clone()]);
        stamp_creation(&mut fresh, &known, 20);
        assert_eq!(fresh[0].created_at_ms, Some(20));
        assert_eq!(fresh[1].created_at_ms, None);
        assert_eq!(fresh[2].created_at_ms, Some(10));
        stamp_creation(&mut fresh, &known, 30);
        assert_eq!(fresh[0].created_at_ms, Some(20));
        assert_eq!(fresh[1].created_at_ms, None);
    }

    /// Análise com FORMA válida (o validate do store roda ao salvar em disco).
    /// Critérios 1/1/1 → score() = 1.
    fn valid_analysis() -> Option<super::super::analysis_types::Analysis> {
        Some(
            serde_json::from_value(serde_json::json!({
            "title":"Falha de salvamento interrompe o jogo",
            "summary":"O participante relata que o jogo parou e perdeu o progresso salvo durante a partida, sem solução apresentada no trecho.",
            "criteria":[
                {"label":"Gancho","score":1,"explanation":"A perda do progresso dá contexto à frustração relatada.","evidence":"o jogo perdeu o progresso"},
                {"label":"Desenvolvimento","score":1,"explanation":"O relato descreve o impacto da falha durante a partida.","evidence":"o jogo perdeu o progresso"},
                {"label":"Fechamento","score":1,"explanation":"O trecho termina sem indicar como recuperar o salvamento.","evidence":"sem solução para recuperar"}]}))
            .unwrap(),
        )
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
    fn segment(start: f64, end: f64, text: &str) -> Segment {
        Segment {
            id: format!("s{start}"),
            start,
            end,
            text: text.into(),
            words: vec![],
        }
    }
    fn speech() -> Vec<Segment> {
        vec![
            segment(0.0, 10.0, "a"),
            segment(10.0, 20.0, "b"),
            segment(20.0, 30.0, "c"),
        ]
    }

    #[test]
    fn duplicates_require_the_same_identity_or_interval() {
        let existing = [clip(&"a".repeat(64), 11.0, 60.0)];
        assert!(duplicate_of(&existing, &clip(&"a".repeat(64), 20.0, 30.0)));
        let same_story = clip(&"b".repeat(64), 12.0, 58.0);
        assert!(!duplicate_of(&existing, &same_story));
        assert!(duplicate_of(&existing, &clip(&"8".repeat(64), 11.0, 60.0)));
        let variation = clip(&"c".repeat(64), 10.0, 60.0);
        assert!(!duplicate_of(&existing, &variation));
        let mut other_format = clip(&"d".repeat(64), 11.0, 60.0);
        other_format.format = Some("16:9".into());
        assert!(!duplicate_of(&existing, &other_format));
        assert!(!duplicate_of(&existing, &clip(&"e".repeat(64), 80.0, 95.0)));
        let anchor = [clip(&"f".repeat(64), 0.0, 50.0)];
        let tail = clip(&"9".repeat(64), 45.0, 95.0); // IoU 5/95 — baixo
        assert!(!duplicate_of(&anchor, &tail));
    }

    #[test]
    fn generation_preserves_library_and_publishes_new_versions_of_its_moments() {
        let mut kept = clip(&"a".repeat(64), 0.0, 100.0);
        kept.title = "Título editado por mim".into();
        kept.review = Review::Approved;
        let deleted = Clip {
            deleted: Some(true),
            ..clip(&"f".repeat(64), 400.0, 500.0)
        };
        let previous = collection(
            Some(record("standard")),
            vec![kept.clone(), deleted.clone()],
        );
        let mut fresh = vec![
            clip(&"a".repeat(64), 0.0, 100.0),
            clip(&"f".repeat(64), 400.0, 500.0),
            clip(&"c".repeat(64), 200.0, 260.0),
        ];
        for candidate in &mut fresh {
            candidate.engine = Some(record("qwen35"));
        }
        super::super::generation_batch::publish(&mut fresh, "new-run", 200);
        let added = fresh.clone();
        let value = merge_incremental(Some(previous), fresh, "m", &speech(), record("qwen35"));
        let kept_now = value.clips.iter().find(|c| c.id == kept.id).unwrap();
        assert_eq!(kept_now.title, "Título editado por mim");
        assert_eq!(kept_now.review, Review::Approved);
        // upd 20: legado SEM metadado HERDA a origem conhecida da coleção
        // anterior ANTES da troca — não a origem da execução atual
        assert_eq!(kept_now.engine.as_ref().unwrap().backend, "standard");
        assert!(value
            .clips
            .iter()
            .any(|c| c.id == deleted.id && c.deleted == Some(true)));
        assert_eq!(value.clips.len(), 5);
        assert_eq!(value.engine.as_ref().unwrap().backend, "qwen35");
        for new in added {
            let saved = value.clips.iter().find(|c| c.id == new.id).unwrap();
            assert_eq!(saved.created_at_ms, Some(200));
            assert_eq!(saved.review, Review::Pending);
            assert_eq!(saved.engine.as_ref().unwrap().backend, "qwen35");
        }
    }

    #[test]
    fn deleted_ranges_do_not_blacklist_distinct_future_moments() {
        let deleted = Clip {
            deleted: Some(true),
            ..clip(&"a".repeat(64), 0.0, 600.0)
        };
        let distinct = clip(&"b".repeat(64), 0.0, 12.0);
        assert!(!super::duplicate_of(&[deleted], &distinct));
    }

    #[test]
    fn new_version_of_deleted_content_does_not_restore_the_deleted_record() {
        let speech = vec![
            segment(10.0, 11.0, "intro"),
            segment(11.0, 60.0, "historia"),
        ];
        let deleted = Clip {
            deleted: Some(true),
            ..clip(&"a".repeat(64), 10.0, 60.0)
        };
        let previous = collection(None, vec![deleted]);
        let mut fresh = vec![clip(&"a".repeat(64), 10.0, 60.0)];
        super::super::generation_batch::publish(&mut fresh, "new-run", 200);
        let value = merge_incremental(Some(previous), fresh, "m", &speech, record("qwen35"));
        assert_eq!(value.clips.len(), 2);
        assert_eq!(value.clips[0].deleted, Some(true));
        assert_eq!(value.clips[1].deleted, None);
        assert_ne!(value.clips[0].id, value.clips[1].id);
    }

    /// upd 20: a edição marca SOMENTE os clipes afetados como desatualizados.
    /// A análise é PRESERVADA (recuperável) e nunca publicada como válida; a
    /// revisão histórica permanece intocada.
    #[test]
    fn transcript_edit_marks_only_affected_clips_stale_keeping_analysis() {
        let mut affected = clip(&"a".repeat(64), 0.0, 15.0);
        affected.analysis = valid_analysis();
        affected.title = "T".into();
        affected.score = 10;
        affected.review = Review::Approved;
        let mut untouched = clip(&"b".repeat(64), 20.0, 30.0);
        untouched.analysis = valid_analysis();
        untouched.title = "T".into();
        untouched.score = 10;
        untouched.review = Review::Approved;
        let mut previous = collection(None, vec![affected, untouched]);
        // coleção consistente com a transcrição atual (como a geração grava):
        // hash confere → assinaturas atribuídas com som, análises válidas
        previous.transcript_hash = super::store::fingerprint(&speech()).unwrap();
        previous.refresh_analysis_state(&speech());
        assert!(previous.clips.iter().all(|c| c.analysis_stale.is_none()));

        // edição REAL: texto do segmento 0–10 muda (janela do clipe A)
        let mut edited = speech();
        edited[0].text = "a corrigido".into();
        previous.refresh_analysis_state(&edited);
        let a = previous
            .clips
            .iter()
            .find(|c| c.id == "a".repeat(64))
            .unwrap();
        let b = previous
            .clips
            .iter()
            .find(|c| c.id == "b".repeat(64))
            .unwrap();
        assert!(a.analysis.is_some(), "análise preservada para recuperação");
        assert_eq!(a.analysis_stale, Some(true), "afetado fica desatualizado");
        assert_eq!(a.review, Review::Approved, "revisão histórica intocada");
        assert!(b.analysis.is_some());
        assert_eq!(
            b.analysis_stale, None,
            "fora da janela editada segue válido"
        );
        // recarregar/salvar sem editar não muda nada
        let before = previous.clips[1].analysis_signature.clone();
        previous.refresh_analysis_state(&edited);
        assert_eq!(previous.clips[1].analysis_signature, before);
        assert_eq!(previous.clips[1].analysis_stale, None);
    }

    /// Cenário completo da auditoria (upd 20 obj. 4) com DISCO — não apenas
    /// duas chamadas sobre o mesmo objeto em memória: legado sem assinatura
    /// NÃO renova confiança a cada leitura; a incerteza é representada e a
    /// análise preservada. Nenhum comando de leitura grava no disco.
    #[test]
    fn legacy_migration_is_durable_across_save_and_reload() {
        let base = std::env::temp_dir().join(format!("cnp-clips-legacy-{}", uuid::Uuid::new_v4()));
        let project = uuid::Uuid::new_v4().to_string();
        let speech_v1 = vec![segment(0.0, 10.0, "texto um"), segment(10.0, 20.0, "b")];
        let speech_v2 = vec![
            segment(0.0, 10.0, "texto um corrigido"),
            segment(10.0, 20.0, "b"),
        ];

        // 1. coleção legada salva com hash ANTIGO, sem assinatura por clipe
        let mut legacy = clip(&"a".repeat(64), 0.0, 15.0);
        legacy.analysis = valid_analysis();
        legacy.title = "Falha de salvamento interrompe o jogo".into();
        legacy.score = legacy.analysis.as_ref().unwrap().score();
        let mut saved = collection(None, vec![legacy]);
        saved.transcript_hash = "hash-antigo".into();
        super::store::save(&base, &project, &saved, 100.0).unwrap();

        // 2. leitura (presentation): atribui assinatura EM MEMÓRIA e marca a
        //    incerteza — o hash não confere e não há baseline por clipe
        let mut view = super::store::read(&base, &project).unwrap().unwrap();
        view.refresh_analysis_state(&speech_v1);
        assert_eq!(view.clips[0].analysis_stale, Some(true));
        assert!(view.clips[0].analysis.is_some(), "análise preservada");
        assert!(view.clips[0].analysis_signature.is_some());
        // NADA foi gravado: o disco segue sem assinatura
        let disk = super::store::read(&base, &project).unwrap().unwrap();
        assert!(disk.clips[0].analysis_signature.is_none());

        // 3. transcrição muda de novo; NOVA leitura do disco — a confiança
        //    NÃO é renovada (o estado desatualizado é recomputado, estável)
        let mut view2 = super::store::read(&base, &project).unwrap().unwrap();
        view2.refresh_analysis_state(&speech_v2);
        assert_eq!(view2.clips[0].analysis_stale, Some(true));
        assert!(view2.clips[0].analysis.is_some());

        // 4. contraste: coleção CONSISTENTE (hash confere) salva em disco;
        //    leitura atribui assinatura válida; gravação a torna durável e a
        //    granularidade passa a valer contra edições futuras
        let mut consistent = collection(None, vec![clip(&"a".repeat(64), 0.0, 15.0)]);
        consistent.clips[0].analysis = valid_analysis();
        consistent.clips[0].title = "Falha de salvamento interrompe o jogo".into();
        consistent.clips[0].score = consistent.clips[0].analysis.as_ref().unwrap().score();
        consistent.transcript_hash = super::store::fingerprint(&speech_v1).unwrap();
        super::store::save(&base, &project, &consistent, 100.0).unwrap();
        let mut reloaded = super::store::read(&base, &project).unwrap().unwrap();
        reloaded.refresh_analysis_state(&speech_v1);
        assert_eq!(
            reloaded.clips[0].analysis_stale, None,
            "hash confere: válida"
        );
        super::store::save(&base, &project, &reloaded, 100.0).unwrap(); // gravação durável
        let mut after_edit = super::store::read(&base, &project).unwrap().unwrap();
        after_edit.refresh_analysis_state(&speech_v2);
        assert_eq!(
            after_edit.clips[0].analysis_stale,
            Some(true),
            "assinatura persistida tornou a granularidade durável"
        );
        assert!(after_edit.clips[0].analysis.is_some());
        std::fs::remove_dir_all(base).unwrap();
    }

    /// upd 20 obj. 5: biblioteca mista — a mesclagem preserva a origem
    /// conhecida dos históricos, não reanisa nada e não reescreve campos de
    /// existentes (válidos, rejeitados, excluídos e desatualizados).
    #[test]
    fn merge_preserves_mixed_provenance_and_never_touches_existing() {
        let mut standard_clip = clip(&"a".repeat(64), 0.0, 30.0);
        standard_clip.engine = Some(record("standard"));
        standard_clip.analysis = valid_analysis();
        standard_clip.title = "Análise do Qwen".into();
        standard_clip.score = 10;
        standard_clip.review = Review::Approved;
        let mut legacy_clip = clip(&"b".repeat(64), 30.0, 60.0);
        legacy_clip.analysis = valid_analysis();
        legacy_clip.title = "T".into();
        legacy_clip.score = 10;
        let mut rejected = clip(&"c".repeat(64), 60.0, 90.0);
        rejected.review = Review::Rejected;
        let mut deleted = clip(&"d".repeat(64), 90.0, 120.0);
        deleted.deleted = Some(true);
        deleted.engine = Some(record("experimentalGemma"));
        let mut stale_clip = clip(&"e".repeat(64), 120.0, 150.0);
        stale_clip.analysis = valid_analysis();
        stale_clip.title = "T".into();
        stale_clip.score = 10;
        stale_clip.analysis_stale = Some(true);
        let previous = collection(
            Some(record("standard")),
            vec![
                standard_clip.clone(),
                legacy_clip.clone(),
                rejected.clone(),
                deleted.clone(),
                stale_clip.clone(),
            ],
        );
        let mut fresh = clip(&"9".repeat(64), 200.0, 260.0);
        fresh.engine = Some(record("experimentalGemma"));
        let value = merge_incremental(
            Some(previous),
            vec![fresh],
            "m",
            &speech(),
            record("experimentalGemma"),
        );
        let a = value
            .clips
            .iter()
            .find(|c| c.id == standard_clip.id)
            .unwrap();
        assert_eq!(a.engine.as_ref().unwrap().backend, "standard");
        assert_eq!(a.title, "Análise do Qwen", "título não é reescrito");
        assert_eq!(a.review, Review::Approved);
        assert!(a.analysis.is_some());
        // legado herda a origem CONHECIDA da coleção anterior
        let b = value.clips.iter().find(|c| c.id == legacy_clip.id).unwrap();
        assert_eq!(b.engine.as_ref().unwrap().backend, "standard");
        // rejeitado, excluído e desatualizado permanecem como estão
        assert_eq!(
            value
                .clips
                .iter()
                .find(|c| c.id == rejected.id)
                .unwrap()
                .review,
            Review::Rejected
        );
        assert_eq!(
            value
                .clips
                .iter()
                .find(|c| c.id == deleted.id)
                .unwrap()
                .deleted,
            Some(true)
        );
        assert_eq!(
            value
                .clips
                .iter()
                .find(|c| c.id == stale_clip.id)
                .unwrap()
                .analysis_stale,
            Some(true)
        );
        // coleção registra a última execução; novo clipe carrega a sua
        assert_eq!(value.engine.as_ref().unwrap().backend, "experimentalGemma");
        assert_eq!(
            value
                .clips
                .iter()
                .find(|c| c.id == "9".repeat(64))
                .unwrap()
                .engine
                .as_ref()
                .unwrap()
                .backend,
            "experimentalGemma"
        );
        assert_eq!(value.clips.len(), 6);
    }

    #[test]
    fn library_above_generation_limit_preserves_overlapping_versions() {
        let base =
            std::env::temp_dir().join(format!("cnp-clips-cumulative-{}", uuid::Uuid::new_v4()));
        let project = uuid::Uuid::new_v4().to_string();
        let clips: Vec<Clip> = (0..20)
            .map(|index| {
                clip(
                    &super::super::types::identity(
                        "m",
                        index as f64,
                        index as f64 + 30.0,
                        Some("9:16"),
                    ),
                    index as f64,
                    index as f64 + 30.0,
                )
            })
            .collect();
        let value = collection(None, clips);
        super::store::save(&base, &project, &value, 1000.0).unwrap();
        let reopened = super::store::read(&base, &project).unwrap().unwrap();
        assert_eq!(
            reopened.clips.len(),
            20,
            "biblioteca cumulativa sem teto por execução"
        );
        assert_eq!(
            serde_json::to_value(reopened).unwrap(),
            serde_json::to_value(value).unwrap()
        );
        std::fs::remove_dir_all(base).unwrap();
    }
}
