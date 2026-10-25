use super::{
    assessment, editorial_repair, store,
    text_engine::Engine,
    types::{ClipCollection, GenerateOptions, Quality},
};
use crate::transcription::{process::ProcessControl, types::Transcript};
use std::path::PathBuf;

fn inputs() -> (PathBuf, Transcript, ClipCollection) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/pipelines-comparados-2026-10-24")
        .canonicalize()
        .unwrap();
    let transcript = serde_json::from_slice(
        &std::fs::read(root.join("corpus/davyjones-transcript.json")).unwrap(),
    )
    .unwrap();
    let collection = serde_json::from_slice(
        &std::fs::read(root.join("native-full-davyjones/round-1-result.json")).unwrap(),
    )
    .unwrap();
    (root, transcript, collection)
}

#[test]
#[ignore = "revisão delimitada de uma proposta real, recebendo toda a transcrição"]
fn narrative_review_recovers_the_explanation_before_the_next_topic() {
    let (root, transcript, _) = inputs();
    let saved: serde_json::Value = serde_json::from_slice(
        &std::fs::read(
            root.join("../feedback-editorial-2026-10-25/sampling-v3/whole-video/result.json"),
        )
        .unwrap(),
    )
    .unwrap();
    let clip = serde_json::from_value(saved["exports"][0]["clip"].clone()).unwrap();
    let mut clips = vec![clip];
    let scratch = scratch("focused-narrative");
    let engine = Engine::discover(&root, Quality::Qwen35).unwrap();
    let options = serde_json::from_value::<GenerateOptions>(
        serde_json::json!({"automatic":true,"format":"9:16","fit":"cover"}),
    )
    .unwrap()
    .resolve()
    .unwrap();
    let started = std::time::Instant::now();
    super::narrative_bounds::review(
        &engine,
        &scratch,
        &mut clips,
        &transcript.segments,
        &options,
        &ProcessControl::default(),
    )
    .unwrap();
    let source = super::semantic::source(&clips[0], &transcript.segments);
    std::fs::write(scratch.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({"fullTranscript":true,"segments":transcript.segments.len(),"scope":"Revisão de uma proposta, não geração integral do pipeline","elapsedSeconds":started.elapsed().as_secs_f64(),"clip":clips[0],"includedSpeech":source})).unwrap()).unwrap();
    assert!(
        source.contains("não revisaram") && source.contains("tudo errado"),
        "A revisão não recuperou a conclusão: {source}"
    );
}

fn scratch(case: &str) -> PathBuf {
    let arm = std::env::var("CNP_FEEDBACK_ARM").unwrap_or_else(|_| "before".into());
    assert!(
        !arm.is_empty()
            && arm
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    );
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/feedback-editorial-2026-10-25")
        .join(arm)
        .join(case);
    assert!(!path.exists(), "o caso já foi executado");
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[test]
#[ignore = "geração integral após feedback manual, preservação e MP4 reais sem operar a interface"]
fn whole_video_after_manual_feedback() {
    let (root, transcript, previous) = inputs();
    let base = scratch("whole-video");
    let project = uuid::Uuid::new_v4().to_string();
    let source = root.join("corpus/davyjones-completo.mp4");
    let duration = 599.098;
    std::fs::create_dir_all(base.join("scratch")).unwrap();
    store::save(&base, &project, &previous, duration).unwrap();
    let options: GenerateOptions = serde_json::from_value(
        serde_json::json!({"automatic":true,"format":"9:16","fit":"cover","quality":"qwen35"}),
    )
    .unwrap();
    let options = options.resolve().unwrap();
    let started = std::time::Instant::now();
    let result = super::generation::run(
        &base,
        &base.join("scratch"),
        super::generation::Request {
            project: &project,
            media: &transcript.media_id,
            source: &source,
            duration,
            speech: &transcript.segments,
            options: &options,
        },
        &ProcessControl::default(),
        |percent| eprintln!("[feedback] progresso {percent}%"),
    )
    .unwrap();
    store::save(&base, &project, &result, duration).unwrap();
    let reopened = store::load(&base, &project, &transcript.media_id, duration)
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::to_value(&result).unwrap(),
        serde_json::to_value(reopened).unwrap()
    );
    for old in &previous.clips {
        assert_eq!(
            serde_json::to_value(old).unwrap(),
            serde_json::to_value(result.clips.iter().find(|c| c.id == old.id).unwrap()).unwrap()
        );
    }
    let fresh = result
        .clips
        .iter()
        .filter(|c| previous.clips.iter().all(|old| old.id != c.id))
        .cloned()
        .collect::<Vec<_>>();
    let mut exports = Vec::new();
    for (index, clip) in fresh.iter().enumerate() {
        let focal = clip
            .face_framing
            .as_ref()
            .filter(|f| f.status == "stable")
            .map(|f| serde_json::json!({"x":f.x.unwrap()*100.0,"y":f.y.unwrap()*100.0}));
        let settings=serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":"cover","focalPoint":focal,"captionModel":2,
            "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom","wordsPerCaption":5},
            "volume":1,"muted":false,"background":"#000000","text":"","trimStart":clip.start,"trimEnd":clip.end})).unwrap();
        let (temporary, output) = crate::render::pipeline::run(
            &base,
            &source,
            &transcript.segments,
            &settings,
            duration,
            true,
            &ProcessControl::default(),
            |_| {},
        )
        .unwrap();
        let destination = base.join(format!("Qwen35-Davy-{:02}.mp4", index + 1));
        std::fs::copy(output, &destination).unwrap();
        drop(temporary);
        exports.push(serde_json::json!({"file":destination,"clip":clip,"fit":"cover","includedSpeech":super::semantic::source(clip,&transcript.segments)}));
    }
    std::fs::write(base.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({"fullVideo":true,"segments":transcript.segments.len(),"elapsedSeconds":started.elapsed().as_secs_f64(),"preserved":previous.clips.len(),"newCount":fresh.len(),"exports":exports})).unwrap()).unwrap();
    assert!(
        fresh.len() >= 4,
        "esta fonte ainda ficou abaixo de quatro episódios úteis: {}",
        fresh.len()
    );
    let therapy = fresh
        .iter()
        .map(|c| super::semantic::source(c, &transcript.segments))
        .find(|s| s.contains("therapy"))
        .expect("a história do erro de nome precisa ser recuperada");
    assert!(
        therapy.contains("não revisaram") && therapy.contains("tudo errado"),
        "o corte ainda perdeu a explicação e sua conclusão: {therapy}"
    );
}

#[test]
#[ignore = "reproduz a redação metalinguística com o modelo local e fonte real"]
fn copy_names_the_event_instead_of_reporting_that_someone_spoke() {
    let (root, transcript, collection) = inputs();
    let clip = collection
        .clips
        .iter()
        .max_by(|a, b| (a.end - a.start).total_cmp(&(b.end - b.start)))
        .unwrap()
        .clone();
    let scratch = scratch("copy");
    let engine = Engine::discover(&root, Quality::Qwen35).unwrap();
    let results = assessment::evaluate(
        &engine,
        &scratch,
        &[clip],
        &transcript.segments,
        &ProcessControl::default(),
    )
    .unwrap();
    let analysis = results[0].analysis.as_ref().unwrap();
    std::fs::write(
        scratch.join("analysis.json"),
        serde_json::to_vec_pretty(analysis).unwrap(),
    )
    .unwrap();
    assert!(
        !analysis.title.to_lowercase().contains("relata"),
        "título: {}",
        analysis.title
    );
    assert!(
        ![
            "os participantes",
            "um participante",
            "o participante",
            "o falante",
            "o trecho",
            "os jogadores relatam"
        ]
        .iter()
        .any(|prefix| analysis.summary.to_lowercase().starts_with(prefix)),
        "resumo: {}",
        analysis.summary
    );
    assert!(results[0].standalone && results[0].complete);
}

#[test]
#[ignore = "protótipo local de redação dos fatos, sem alterar notas ou publicar clipes"]
fn dedicated_copy_uses_the_events_in_the_actual_interval() {
    let (root, transcript, collection) = inputs();
    let clip = collection
        .clips
        .iter()
        .max_by(|a, b| (a.end - a.start).total_cmp(&(b.end - b.start)))
        .unwrap();
    let source = super::semantic::source(clip, &transcript.segments);
    let scratch = scratch("copy-prototype");
    let engine = Engine::discover(&root, Quality::Qwen35).unwrap();
    let system = "Escreva o título e a descrição de um vídeo curto em português brasileiro. Você recebe APENAS as falas realmente incluídas nele. Conte o acontecimento diretamente: o que aconteceu e o resultado. O título precisa ter assunto e acontecimento específicos; pode usar o preço, contraste ou consequência quando ditos na fonte. O resumo deve ter duas frases curtas sobre a história. Não use narrador de relatório: nada de participantes/jogadores relatam, o falante comenta, o trecho mostra. Não conte que alguém falou; conte o que aconteceu. Não invente intenções, nomes, números, causa ou solução. Uma ação que acontece depois de outra não é prova de tentativa de corrigir um problema. Retorne somente title e summary.";
    let schema = serde_json::json!({"type":"object","additionalProperties":false,"required":["title","summary"],"properties":{"title":{"type":"string","minLength":8,"maxLength":120},"summary":{"type":"string","minLength":40,"maxLength":1400}}});
    let prompt = engine
        .prompt(system, &serde_json::json!({"includedSpeech":source}))
        .unwrap();
    let output = engine
        .generate(
            &scratch,
            "copy",
            &prompt,
            &schema,
            800,
            &ProcessControl::default(),
        )
        .unwrap();
    let value: serde_json::Value = serde_json::Deserializer::from_str(output.trim())
        .into_iter()
        .next()
        .unwrap()
        .unwrap();
    std::fs::write(
        scratch.join("copy.json"),
        serde_json::to_vec_pretty(&value).unwrap(),
    )
    .unwrap();
    let summary = value["summary"].as_str().unwrap().to_lowercase();
    assert!(
        !summary.contains("relatam")
            && !summary.contains("participantes")
            && !summary.starts_with("o trecho")
    );
    assert!(!value["title"]
        .as_str()
        .unwrap()
        .to_lowercase()
        .contains("relata"));
}

#[test]
#[ignore = "reparo local do corte reprovado pelo mantenedor, com contexto completo"]
fn repair_has_the_complete_source_and_does_not_end_on_a_promised_explanation() {
    let (root, transcript, collection) = inputs();
    let mut clip = collection
        .clips
        .iter()
        .min_by(|a, b| (a.end - a.start).total_cmp(&(b.end - b.start)))
        .unwrap()
        .clone();
    let source = super::semantic::source(&clip, &transcript.segments);
    let analysis = clip.analysis.as_mut().unwrap();
    assert!(super::editorial::enforce_ending(analysis, &source));
    clip.reasons.push(format!(
        "Correção necessária: {}",
        analysis.criteria[2].explanation
    ));
    let scratch = scratch("repair");
    let engine = Engine::discover(&root, Quality::Qwen35).unwrap();
    let options: GenerateOptions =
        serde_json::from_value(serde_json::json!({"automatic":true,"format":"9:16","fit":"cover"}))
            .unwrap();
    let options = options.resolve().unwrap();
    let control = ProcessControl::default();
    let mut budget = 1;
    let repaired = editorial_repair::recover(
        &engine,
        &scratch,
        &[clip],
        &transcript.segments,
        &transcript.media_id,
        &options,
        &control,
        &mut budget,
    )
    .unwrap();
    let prompt = std::fs::read_to_string(scratch.join("repair-0-prompt.txt")).unwrap();
    let source = transcript
        .segments
        .iter()
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        prompt.contains(&source),
        "o reparo deve receber o vídeo inteiro sem recortes"
    );
    assert!(!repaired.is_empty(), "nenhum reparo proposto");
    let pending = repaired.into_iter().map(|r| r.clip).collect::<Vec<_>>();
    let results =
        assessment::evaluate(&engine, &scratch, &pending, &transcript.segments, &control).unwrap();
    std::fs::write(scratch.join("result.json"), serde_json::to_vec_pretty(&serde_json::json!({"clips":pending,"judgments":results.iter().map(|r|serde_json::json!({"standalone":r.standalone,"complete":r.complete,"analysis":r.analysis,"reason":r.reason})).collect::<Vec<_>>()})).unwrap()).unwrap();
    assert!(results.iter().all(|r| r.standalone && r.complete));
    for (mut clip, judgment) in pending.into_iter().zip(results) {
        assessment::apply(&mut clip, &judgment);
        let collection = ClipCollection {
            clips: vec![clip],
            ..collection.clone()
        };
        store::validate(&collection, transcript.segments.last().unwrap().end + 0.1).unwrap();
    }
}
