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

/// Unidades narrativas da transcrição dentro de uma janela — os IDs dos
/// segmentos que a alimentam. Estratégia determinística de conteúdo (upd 20):
/// a sobreposição temporal é SINAL, não prova; a equivalência editorial
/// precisa das mesmas unidades de fala.
fn speech_units(segments: &[Segment], start: f64, end: f64) -> std::collections::BTreeSet<&str> {
    segments
        .iter()
        .filter(|s| s.start < end && s.end > start)
        .map(|s| s.id.as_str())
        .collect()
}

/// Duplicata = mesmo momento JÁ presente na biblioteca (atualizações 19/20).
/// - Id idêntico: duplicata exata (mesma mídia, limites e formato).
/// - Quase duplicata: MESMO formato, interseção ≥ 75% da união E as unidades
///   de fala do candidato estão CONTIDAS nas do existente — a mesma história
///   com outros limites. A sobreposição sozinha NÃO decide: histórias
///   distintas que compartilham a janela (unidades novas no candidato) são
///   variação editorial legítima e entram como cortes novos.
/// Clipes EXCLUÍDOS e REJEITADOS participam da verificação: a geração não
/// ressuscita o mesmo CONTEÚDO que o usuário descartou.
pub(crate) fn duplicate_of(existing: &[Clip], candidate: &Clip, segments: &[Segment]) -> bool {
    let units = speech_units(segments, candidate.start, candidate.end);
    existing.iter().any(|old| {
        if old.id == candidate.id {
            return true;
        }
        if old.format != candidate.format {
            return false;
        }
        let overlap = old.end.min(candidate.end) - old.start.max(candidate.start);
        if overlap <= 0.0
            || overlap / (old.end.max(candidate.end) - old.start.min(candidate.start)) < 0.75
        {
            return false;
        }
        let old_units = speech_units(segments, old.start, old.end);
        units.iter().all(|unit| old_units.contains(unit))
    })
}

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

/// Partes da fala ainda não ocupadas por nenhum clipe da biblioteca — insumo
/// da SEGUNDA passada de descoberta, delimitada e única (upd 20).
fn unoccupied_speech(speech: &[Segment], existing: &[Clip]) -> Vec<Segment> {
    speech
        .iter()
        .filter(|s| !existing.iter().any(|c| s.start < c.end && s.end > c.start))
        .cloned()
        .collect()
}

pub fn run(
    base: &Path,
    scratch: &Path,
    request: Request<'_>,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<ClipCollection, String> {
    let engine = text_engine::Engine::discover(base, request.options.quality())?;
    let evaluator =
        |pending: &[Clip], segments: &[Segment]| -> Result<Vec<selection::Evaluation>, String> {
            selection::evaluate_batch_with(&engine, scratch, pending, segments, control)
        };
    // descoberta → cenas → fit/id/proveniência (mesma preparação para a
    // primeira passada e para a segunda delimitada)
    let mut prepare = |speech: &[Segment]| -> Result<Vec<Clip>, String> {
        let mut clips = selection::select(
            &engine,
            scratch,
            speech,
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
            speech,
            request.duration,
            request.options,
            control,
        )?;
        for clip in &mut clips {
            clip.fit = request.options.fit.clone();
            clip.id =
                super::types::identity(request.media, clip.start, clip.end, clip.format.as_deref());
            clip.engine = Some(engine.record());
        }
        Ok(clips)
    };
    let previous = store::load(base, request.project, request.media, request.duration)?;
    // descoberta considera o que já existe: candidatos que repetem CONTEÚDO
    // da biblioteca (incluindo excluídos/rejeitados) são descartados.
    let mut fresh: Vec<Clip> = match previous.as_ref() {
        Some(library) => prepare(request.speech)?
            .into_iter()
            .filter(|candidate| !duplicate_of(&library.clips, candidate, request.speech))
            .collect(),
        None => prepare(request.speech)?,
    };
    // Segunda passada DELIMITADA (uma única, sem loops): quando a primeira
    // não encontrou nada novo, a descoberta tenta as partes do vídeo ainda
    // não ocupadas pela biblioteca — momentos de verdade inéditos, não
    // repetições com outros limites. Falta de fala livre preserva a
    // biblioteca e informa "nenhum corte novo".
    if fresh.is_empty() {
        if let Some(library) = previous.as_ref() {
            let free = unoccupied_speech(request.speech, &library.clips);
            let free_seconds: f64 = free.iter().map(|s| s.end - s.start).sum();
            if free_seconds >= request.options.min_seconds {
                if let Ok(more) = prepare(&free) {
                    fresh = more
                        .into_iter()
                        .filter(|candidate| {
                            !duplicate_of(&library.clips, candidate, request.speech)
                        })
                        .collect();
                }
            }
        }
    }
    // análise SOMENTE dos novos (upd 20): antigos, excluídos, rejeitados e
    // desatualizados não recebem trabalho oculto do motor nesta geração.
    analyze(
        &mut fresh,
        control,
        |clip| semantic::run(&engine, scratch, clip, request.speech, control),
        progress,
    )?;
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
            deleted: None,
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
            deleted: None,
            engine: None,
        }
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

    /// Contrato upd 20: sobreposição é SINAL; equivalência editorial precisa
    /// das mesmas unidades de fala. Casos: id exato; mesma história com
    /// limites diferentes (unidades contidas); história DISTINTA que inclui
    /// unidade nova (variação legítima); outro formato; sem interseção.
    #[test]
    fn duplicates_use_speech_units_not_overlap_alone() {
        let speech = vec![
            segment(10.0, 11.0, "intro"),
            segment(11.0, 60.0, "historia"),
        ];
        let existing = [clip(&"a".repeat(64), 11.0, 60.0)];
        // id idêntico → duplicata exata
        assert!(duplicate_of(
            &existing,
            &clip(&"a".repeat(64), 20.0, 30.0),
            &speech
        ));
        // mesma história, limites diferentes: unidades contidas + IoU 0.92
        let same_story = clip(&"b".repeat(64), 12.0, 58.0);
        assert!(duplicate_of(&existing, &same_story, &speech));
        // história distinta sobreposta: inclui a "intro" (unidade nova) —
        // IoU 0.98, mas o conteúdo difere → variação legítima, NÃO duplicata
        let variation = clip(&"c".repeat(64), 10.0, 60.0);
        assert!(!duplicate_of(&existing, &variation, &speech));
        // mesmo intervalo em OUTRO formato não é duplicata
        let mut other_format = clip(&"d".repeat(64), 11.0, 60.0);
        other_format.format = Some("16:9".into());
        assert!(!duplicate_of(&existing, &other_format, &speech));
        // momento totalmente fora
        assert!(!duplicate_of(
            &existing,
            &clip(&"e".repeat(64), 80.0, 95.0),
            &speech
        ));
        // sobreposição sem unidades compartilhadas de verdade não é provada
        let wide = vec![segment(0.0, 50.0, "x"), segment(50.0, 100.0, "y")];
        let anchor = [clip(&"f".repeat(64), 0.0, 50.0)];
        let tail = clip(&"9".repeat(64), 45.0, 95.0); // IoU 5/95 — baixo
        assert!(!duplicate_of(&anchor, &tail, &wide));
    }

    #[test]
    fn generation_preserves_existing_library_and_adds_only_new_moments() {
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
        // candidatos: 1 repetido (mesmo id), 1 sobreposição sem unidade nova,
        // 1 novo momento (fora da fala da biblioteca)
        let mut fresh = vec![
            clip(&"a".repeat(64), 10.0, 90.0),
            clip(&"b".repeat(64), 2.0, 98.0),
            clip(&"c".repeat(64), 200.0, 260.0),
        ];
        for candidate in &mut fresh {
            candidate.engine = Some(record("experimentalGemma"));
        }
        let filtered: Vec<Clip> = fresh
            .into_iter()
            .filter(|candidate| !duplicate_of(&previous.clips, candidate, &speech()))
            .collect();
        let value = merge_incremental(
            Some(previous),
            filtered,
            "m",
            &speech(),
            record("experimentalGemma"),
        );
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
        assert_eq!(value.clips.len(), 3);
        assert!(value.clips.iter().any(|c| c.id == "c".repeat(64)));
        assert_eq!(value.engine.as_ref().unwrap().backend, "experimentalGemma");
        assert_eq!(
            value
                .clips
                .iter()
                .find(|c| c.id == "c".repeat(64))
                .unwrap()
                .engine
                .as_ref()
                .unwrap()
                .backend,
            "experimentalGemma"
        );
        assert!(!value.clips.iter().any(|c| c.id == "b".repeat(64)));
    }

    #[test]
    fn deleted_clip_content_is_not_restored_by_new_generation() {
        let speech = vec![
            segment(10.0, 11.0, "intro"),
            segment(11.0, 60.0, "historia"),
        ];
        let deleted = Clip {
            deleted: Some(true),
            ..clip(&"a".repeat(64), 10.0, 60.0)
        };
        let previous = collection(None, vec![deleted]);
        // mesmo CONTEÚDO (unidades contidas) com limites diferentes
        let fresh = vec![clip(&"z".repeat(64), 12.0, 58.0)];
        let filtered: Vec<Clip> = fresh
            .into_iter()
            .filter(|candidate| !duplicate_of(&previous.clips, candidate, &speech))
            .collect();
        let value = merge_incremental(Some(previous), filtered, "m", &speech, record("standard"));
        assert_eq!(value.clips.len(), 1, "conteúdo excluído não volta");
        assert_eq!(value.clips[0].deleted, Some(true));
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
    fn library_above_twelve_clips_persists_and_reloads() {
        let base =
            std::env::temp_dir().join(format!("cnp-clips-cumulative-{}", uuid::Uuid::new_v4()));
        let project = uuid::Uuid::new_v4().to_string();
        let clips: Vec<Clip> = (0..15)
            .map(|index| {
                clip(
                    &format!("{index:x}").repeat(64),
                    index as f64 * 10.0,
                    index as f64 * 10.0 + 8.0,
                )
            })
            .collect();
        let value = collection(None, clips);
        super::store::save(&base, &project, &value, 1000.0).unwrap();
        let reopened = super::store::read(&base, &project).unwrap().unwrap();
        assert_eq!(
            reopened.clips.len(),
            15,
            "biblioteca cumulativa sem teto de 12"
        );
        std::fs::remove_dir_all(base).unwrap();
    }
}
