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

/// Caminho REAL integrado do modo experimental (atualização 8): mesma
/// transcrição de validação, motor Gemma 4 pela configuração preparada,
/// janelas com orçamento de tokens, avaliação própria e análise publicada.
/// Mede as etapas e grava artefatos para comparação com o experimento.
#[test]
#[ignore = "Executa o motor experimental Gemma real sobre o vídeo local delimitado"]
fn real_experimental_gemma_generation_end_to_end() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor");
    // base ISOLADO: nada do modo experimental toca os artefatos do padrão
    let base = root.join("pipeline-validation-gemma");
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
        quality: Some(Quality::ExperimentalGemma),
        automatic: false,
    };
    // etapa 1: descoberta do motor (modelo/config preparada + prova de GPU)
    let t0 = std::time::Instant::now();
    let engine = text_engine::Engine::discover(&base, options.quality()).unwrap();
    let engine_discovery_s = t0.elapsed().as_secs_f64();
    let engine_record = engine.record();
    assert_eq!(engine_record.backend, "experimentalGemma");
    assert!(engine_record.model.contains("gemma"));

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
        Some("experimentalGemma")
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
        base.join("generated-clips-gemma.json"),
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
