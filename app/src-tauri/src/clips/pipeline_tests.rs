use super::{
    generation, store, text_engine,
    types::{Options, Quality},
};
use crate::transcription::{process::ProcessControl, types::Transcript};

#[test]
#[ignore = "Executa seleção e análise reais no vídeo local delimitado"]
fn real_generation_selects_and_persists_grounded_clips() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor");
    let base = root.join("pipeline-validation");
    let scratch = base.join("generation");
    std::fs::create_dir_all(&scratch).unwrap();
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(root.join("analysis/validation/transcript.json")).unwrap(),
    )
    .unwrap();
    let options = Options {
        min_seconds: 25.0,
        max_seconds: 90.0,
        count: 3,
        format: Some("9:16".into()),
        fit: None,
        quality: None,
        automatic: false,
    };
    let project = "9ad76c20-1af3-401b-81db-386b84d454ca";
    let collection = generation::run(
        &base,
        &scratch,
        generation::Request {
            project,
            media: &transcript.media_id,
            source: &base.join("source.mp4"),
            duration: 599.098,
            speech: &transcript.segments,
            options: &options,
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    assert_eq!(collection.clips.len(), 3);
    for clip in &collection.clips {
        assert!(clip.analysis_error.is_none(), "{:?}", clip.analysis_error);
        assert_eq!(clip.format.as_deref(), Some("9:16"));
        clip.analysis
            .as_ref()
            .unwrap()
            .validate(&super::semantic::source(clip, &transcript.segments))
            .unwrap();
    }
    store::save(&base, project, &collection, 599.098).unwrap();
    assert_eq!(store::read(&base, project).unwrap().unwrap().clips.len(), 3);
    std::fs::write(
        base.join("generated-clips.json"),
        serde_json::to_vec_pretty(&collection).unwrap(),
    )
    .unwrap();
}

#[test]
#[ignore = "Executa o motor local real sobre o vídeo delimitado; não comprova os artefatos históricos"]
fn real_local_generation_end_to_end() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor");
    // base ISOLADO: nada do modo experimental toca os artefatos do padrão
    let base = root.join("pipeline-validation-local");
    let scratch = base.join("generation");
    std::fs::create_dir_all(&scratch).unwrap();
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(root.join("analysis/validation/transcript.json")).unwrap(),
    )
    .unwrap();
    let options = Options {
        min_seconds: 25.0,
        max_seconds: 90.0,
        count: 3,
        format: Some("9:16".into()),
        fit: None,
        quality: Some(Quality::Qwen35),
        automatic: false,
    };
    // etapa 1: descoberta do motor (modelo/config preparada + prova de GPU)
    let t0 = std::time::Instant::now();
    let engine = text_engine::Engine::discover(&base, options.quality()).unwrap();
    let engine_discovery_s = t0.elapsed().as_secs_f64();
    let engine_record = engine.record();
    assert_eq!(engine_record.backend, "qwen35");
    assert!(engine_record.model.contains("Qwen3.5"));

    // etapa 2..n: pipeline completo (janelas com orçamento → seleção →
    // avaliação própria → cenas → análise publicada)
    let project = "7c3f9d1e-5a2b-4f8a-9f1c-2b6d8e4a1c35";
    let t1 = std::time::Instant::now();
    let collection = generation::run(
        &base,
        &scratch,
        generation::Request {
            project,
            media: &transcript.media_id,
            source: &root.join("pipeline-validation/source.mp4"),
            duration: 599.098,
            speech: &transcript.segments,
            options: &options,
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let pipeline_s = t1.elapsed().as_secs_f64();

    assert_eq!(collection.clips.len(), 3);
    assert_eq!(
        collection
            .engine
            .as_ref()
            .map(|record| record.backend.as_str()),
        Some("qwen35")
    );
    for clip in &collection.clips {
        assert!(clip.analysis_error.is_none(), "{:?}", clip.analysis_error);
        assert_eq!(clip.format.as_deref(), Some("9:16"));
        // título concreto pelo caminho real (não o marcador "Trecho MM:SS")
        assert!(
            !clip.title.starts_with("Trecho "),
            "título placeholder: {}",
            clip.title
        );
        clip.analysis
            .as_ref()
            .unwrap()
            .validate(&super::semantic::source(clip, &transcript.segments))
            .unwrap();
    }
    // persistência + reabertura pelo mesmo caminho do app
    store::save(&base, project, &collection, 599.098).unwrap();
    let reopened = store::read(&base, project).unwrap().unwrap();
    assert_eq!(reopened.clips.len(), 3);
    assert_eq!(reopened.engine, collection.engine);
    std::fs::write(
        base.join("generated-clips-local.json"),
        serde_json::to_vec_pretty(&collection).unwrap(),
    )
    .unwrap();
    std::fs::write(
        base.join("measurements.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "engine_discovery_s": engine_discovery_s,
            "pipeline_total_s": pipeline_s,
        }))
        .unwrap(),
    )
    .unwrap();
}

/// Comparação delimitada (atualização 9): personalizado com mínima técnica
/// (10 s — sem vínculo com a máxima) × AUTOMÁTICO (limites técnicos
/// resolvidos pelo app; quantidade e duração vindos do conteúdo). Mesma
/// transcrição, mesmo motor padrão — a variável é o modo.
#[test]
#[ignore = "Executa a comparação real entre modos no vídeo local delimitado"]
fn real_comparison_custom_floor_vs_automatic() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor");
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(root.join("analysis/validation/transcript.json")).unwrap(),
    )
    .unwrap();
    let source = root.join("pipeline-validation/source.mp4");

    // 1) PERSONALIZADO: mínima técnica, máxima 90, três cortes
    let custom_base = root.join("pipeline-validation-mode-custom");
    std::fs::create_dir_all(custom_base.join("generation")).unwrap();
    let custom_options = Options {
        min_seconds: 10.0,
        max_seconds: 90.0,
        count: 3,
        format: Some("9:16".into()),
        fit: None,
        quality: None,
        automatic: false,
    };
    let t0 = std::time::Instant::now();
    let custom = generation::run(
        &custom_base,
        &custom_base.join("generation"),
        generation::Request {
            project: "b1c2d3e4-0001-4000-8000-000000000001",
            media: &transcript.media_id,
            source: &source,
            duration: 599.098,
            speech: &transcript.segments,
            options: &custom_options,
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let custom_s = t0.elapsed().as_secs_f64();
    for clip in &custom.clips {
        assert!(clip.analysis_error.is_none(), "{:?}", clip.analysis_error);
        clip.analysis
            .as_ref()
            .unwrap()
            .validate(&super::semantic::source(clip, &transcript.segments))
            .unwrap();
    }

    // 2) AUTOMÁTICO pelo contrato da UI (sem duração/quantidade)
    let auto_base = root.join("pipeline-validation-mode-automatic");
    std::fs::create_dir_all(auto_base.join("generation")).unwrap();
    let auto_options: Options = serde_json::from_str::<super::types::GenerateOptions>(
        "{\"automatic\":true,\"format\":\"9:16\"}",
    )
    .unwrap()
    .resolve()
    .unwrap();
    assert!(auto_options.automatic);
    let t1 = std::time::Instant::now();
    let automatic = generation::run(
        &auto_base,
        &auto_base.join("generation"),
        generation::Request {
            project: "b1c2d3e4-0002-4000-8000-000000000002",
            media: &transcript.media_id,
            source: &source,
            duration: 599.098,
            speech: &transcript.segments,
            options: &auto_options,
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let auto_s = t1.elapsed().as_secs_f64();
    assert!(!automatic.clips.is_empty(), "automático sem sugestões");
    for clip in &automatic.clips {
        assert!(clip.analysis_error.is_none(), "{:?}", clip.analysis_error);
        clip.analysis
            .as_ref()
            .unwrap()
            .validate(&super::semantic::source(clip, &transcript.segments))
            .unwrap();
    }
    std::fs::write(
        root.join("mode-comparison.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "custom": {"seconds": custom_s, "clips": custom.clips, "options": {
                "minSeconds": custom_options.min_seconds, "maxSeconds": custom_options.max_seconds,
                "count": custom_options.count}},
            "automatic": {"seconds": auto_s, "clips": automatic.clips, "resolved": {
                "minSeconds": auto_options.min_seconds, "maxSeconds": auto_options.max_seconds,
                "count": auto_options.count}},
        }))
        .unwrap(),
    )
    .unwrap();
}

#[test]
#[ignore = "Executa geração incremental local real e exportação verificável no vídeo delimitado"]
fn real_incremental_local_generation_and_verifiable_export() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor");
    let base = root.join("pipeline-validation-upd19");
    let scratch = base.join("generation");
    std::fs::create_dir_all(&scratch).unwrap();
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(root.join("analysis/validation/transcript.json")).unwrap(),
    )
    .unwrap();
    let options = |count: usize| Options {
        min_seconds: 25.0,
        max_seconds: 90.0,
        count,
        format: Some("9:16".into()),
        fit: Some("cover".into()),
        quality: Some(Quality::Qwen35),
        automatic: false,
    };
    let project = "d1e2f3a4-0001-4000-8000-00000000a001";
    let source = root.join("pipeline-validation/source.mp4");
    let duration = 599.098;

    let first = generation::run(
        &base,
        &scratch,
        generation::Request {
            project,
            media: &transcript.media_id,
            source: &source,
            duration,
            speech: &transcript.segments,
            options: &options(3),
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    assert_eq!(first.clips.len(), 3, "execução 1 deve publicar 3 cortes");
    for clip in &first.clips {
        assert!(
            clip.analysis.is_some(),
            "execução 1 sem análise: {:?}",
            clip.analysis_error
        );
        assert!(
            clip.analysis_signature.is_some(),
            "assinatura granular ausente"
        );
        assert_eq!(clip.fit.as_deref(), Some("cover"));
    }
    store::save(&base, project, &first, duration).unwrap();
    let snapshot: Vec<(String, String, u8, super::types::Review)> = first
        .clips
        .iter()
        .map(|c| (c.id.clone(), c.title.clone(), c.score, c.review.clone()))
        .collect();

    // execução 2: biblioteca CUMULATIVA — anteriores preservados íntegros
    let second = generation::run(
        &base,
        &scratch,
        generation::Request {
            project,
            media: &transcript.media_id,
            source: &source,
            duration,
            speech: &transcript.segments,
            options: &options(6),
        },
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    for (id, title, score, review) in &snapshot {
        let kept = second
            .clips
            .iter()
            .find(|c| c.id == *id)
            .expect("clipe da execução 1 deve permanecer na biblioteca");
        assert_eq!(
            &kept.title, title,
            "título do clipe preservado foi alterado"
        );
        assert_eq!(kept.score, *score, "nota do clipe preservado foi alterada");
        assert_eq!(
            &kept.review, review,
            "revisão do clipe preservado foi alterada"
        );
    }
    assert!(
        second.clips.len() >= snapshot.len(),
        "biblioteca não pode encolher em nova geração"
    );
    for clip in &second.clips {
        assert!(clip.analysis_signature.is_some());
    }
    store::save(&base, project, &second, duration).unwrap();
    let reopened = store::read(&base, project).unwrap().unwrap();
    assert_eq!(
        reopened.clips.len(),
        second.clips.len(),
        "biblioteca cumulativa persistiu"
    );

    // exportação verificável do melhor clipe, SEM aprovação: intervalo do
    // clipe, 9:16 cover, legendas da transcrição real. O pipeline valida
    // duração (±0,3 s), dimensões e presença de áudio antes de publicar.
    let clip = second
        .clips
        .iter()
        .max_by(|a, b| a.score.cmp(&b.score))
        .unwrap();
    let mut render: crate::render::settings::RenderSettings = serde_json::from_value(serde_json::json!({
        "ratio":"9:16","fit":"cover","captionModel":2,
        "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,
            "uppercase":false,"outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent",
            "highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
        "volume":1.0,"muted":false,"background":"#000000","text":"",
        "trimStart":clip.start,"trimEnd":clip.end,"focalPoint":{"x":50,"y":50}
    }))
    .unwrap();
    render.source_width = None;
    render.source_height = None;
    let (_render_scratch, output) = crate::render::pipeline::run(
        &base,
        &source,
        &transcript.segments,
        &render,
        duration,
        true,
        &ProcessControl::default(),
        |_| {},
    )
    .unwrap();
    let size = std::fs::metadata(&output).unwrap().len();
    assert!(size > 100_000, "exportação minúscula: {size} bytes");
    std::fs::copy(&output, base.join("upd19-clip-export.mp4")).unwrap();
    std::fs::write(
        base.join("upd19-incremental.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "first": {"clips": first.clips.len()},
            "second": {"clips": second.clips.len()},
            "export": {"clip_id": clip.id, "bytes": size},
        }))
        .unwrap(),
    )
    .unwrap();
}
