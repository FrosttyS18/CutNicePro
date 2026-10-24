use super::{analysis_types::Analysis, semantic};

fn analysis() -> Analysis {
    serde_json::from_value(serde_json::json!({
        "title":"Falha de salvamento interrompe o jogo",
        "summary":"O participante relata que o jogo parou e perdeu o progresso. A conversa termina sem mostrar uma solução para o problema.",
        "criteria":[
            {"label":"Gancho","score":65,"explanation":"A perda de progresso dá contexto à frustração relatada.","evidence":"O jogo perdeu o progresso"},
            {"label":"Desenvolvimento","score":70,"explanation":"A falha é apresentada, mas suas causas não são explicadas.","evidence":"O jogo perdeu o progresso"},
            {"label":"Fechamento","score":25,"explanation":"O relato termina sem indicar como recuperar o salvamento.","evidence":"Sem solução para recuperar"}
        ]
    })).unwrap()
}

#[test]
fn rejects_invented_evidence_and_accepts_source_quotes() {
    let source = "O jogo perdeu o progresso. Sem solução para recuperar o salvamento.";
    let mut value = analysis();
    assert!(value.validate(source).is_ok());
    assert_eq!(value.score(), 54);
    value.criteria[0].evidence = "O jogo ganhou um prêmio".into();
    assert!(value.validate(source).is_err());
}

#[test]
fn rejects_extra_fields_wrong_criteria_and_out_of_range_scores() {
    let mut value = analysis();
    value.criteria[0].label = "Tendência".into();
    assert!(value
        .validate("O jogo perdeu o progresso. Sem solução para recuperar")
        .is_err());
    value = analysis();
    value.criteria[0].score = 101;
    assert!(value
        .validate("O jogo perdeu o progresso. Sem solução para recuperar")
        .is_err());
    assert!(serde_json::from_str::<Analysis>(
        r#"{"title":"Um título","summary":"Texto","criteria":[],"extra":true}"#
    )
    .is_err());
}

#[test]
fn changed_transcript_invalidates_analysis_and_review_without_changing_clip_format() {
    fn speech(text: &str) -> Vec<crate::transcription::types::Segment> {
        vec![crate::transcription::types::Segment {
            id: "s0".into(),
            start: 0.0,
            end: 30.0,
            text: text.into(),
            words: vec![],
        }]
    }
    let mut collection = super::types::ClipCollection {
        version: 1,
        media_id: "m".into(),
        transcript_hash: "old".into(),
        engine: None,
        clips: vec![super::types::Clip {
            id: "a".repeat(64),
            start: 0.0,
            end: 30.0,
            title: analysis().title.clone(),
            score: analysis().score(),
            reasons: vec![],
            review: super::types::Review::Approved,
            format: Some("9:16".into()),
            fit: None,
            analysis: Some(analysis()),
            analysis_error: None,
            analysis_signature: None,
            analysis_stale: None,
            multimodal: None,
            face_framing: None,
            created_at_ms: None,
            deleted: None,
            engine: None,
        }],
    };
    // transcrição atual IGUAL à janela do clipe: assinatura registrada,
    // análise mantida (migração legada confia uma vez)
    collection.refresh_analysis_state(&speech("O jogo perdeu o progresso"));
    assert!(collection.clips[0].analysis.is_some());
    assert!(collection.clips[0].analysis_signature.is_some());
    // mesma transcrição de novo: nada invalida
    collection.refresh_analysis_state(&speech("O jogo perdeu o progresso"));
    assert!(collection.clips[0].analysis.is_some());
    // edição REAL no trecho que alimenta o clipe (upd 20): a análise é
    // PRESERVADA para recuperação, marcada como desatualizada (nunca válida)
    // e a revisão histórica permanece
    collection.refresh_analysis_state(&speech("Texto corrigido pelo usuário"));
    assert!(collection.clips[0].analysis.is_some(), "preservada");
    assert_eq!(collection.clips[0].analysis_stale, Some(true));
    assert_eq!(collection.clips[0].review, super::types::Review::Approved);
    assert_eq!(collection.clips[0].format.as_deref(), Some("9:16"));
    assert_eq!(collection.clips[0].start, 0.0);
}

#[test]
#[ignore = "Executa o motor local sobre a cópia delimitada do vídeo de teste"]
fn real_local_analysis_has_grounded_content() {
    let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/vendor/analysis/validation");
    let transcript: crate::transcription::types::Transcript =
        serde_json::from_slice(&std::fs::read(base.join("transcript.json")).unwrap()).unwrap();
    let mut collection: super::types::ClipCollection =
        serde_json::from_slice(&std::fs::read(base.join("clips.json")).unwrap()).unwrap();
    let clip = &mut collection.clips[0];
    let engine = super::text_engine::Engine::Standard(super::text_engine::discover(&base).unwrap());
    semantic::run(
        &engine,
        &base,
        clip,
        &transcript.segments,
        &crate::transcription::process::ProcessControl::default(),
    )
    .unwrap();
    assert!(clip
        .analysis
        .as_ref()
        .unwrap()
        .validate(&semantic::source(clip, &transcript.segments))
        .is_ok());
    assert_ne!(clip.title, "Eu tenho até hoje.");
    std::fs::write(
        base.join("validated-clip.json"),
        serde_json::to_vec_pretty(clip).unwrap(),
    )
    .unwrap();
}
