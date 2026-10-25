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
    assert!(fresh.len() <= options.count);
    let generation_only = std::env::var("CNP_FEEDBACK_GENERATE_ONLY").as_deref() == Ok("1");
    let generated = fresh
        .iter()
        .map(|clip| serde_json::json!({"clip":clip,"includedSpeech":super::semantic::source(clip,&transcript.segments)}))
        .collect::<Vec<_>>();
    std::fs::write(
        base.join("generated-clips.json"),
        serde_json::to_vec_pretty(&serde_json::json!({"scope":"Real generation::run, persistence and reopened data; not a UI test","generationOnly":generation_only,"clips":generated})).unwrap(),
    ).unwrap();
    let mut exports = Vec::new();
    for (index, clip) in fresh.iter().enumerate().filter(|_| !generation_only) {
        assert_eq!(clip.fit.as_deref(), Some("cover"));
        let focal = clip
            .face_framing
            .as_ref()
            .filter(|f| f.status == "stable")
            .map(|f| serde_json::json!({"x":f.x.unwrap()*100.0,"y":f.y.unwrap()*100.0}));
        let settings=serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":clip.fit,"focalPoint":focal,"captionModel":2,
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
    let overlaps = fresh
        .iter()
        .enumerate()
        .flat_map(|(i, a)| {
            fresh[i + 1..]
                .iter()
                .filter(move |b| a.start < b.end && b.start < a.end)
                .map(move |b| serde_json::json!([a.id, b.id]))
        })
        .collect::<Vec<_>>();
    std::fs::write(base.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({"fullVideo":true,"segments":transcript.segments.len(),"elapsedSeconds":started.elapsed().as_secs_f64(),"preserved":previous.clips.len(),"newCount":fresh.len(),"generationLimit":options.count,"generationOnly":generation_only,"overlappingPairs":overlaps,"exports":exports})).unwrap()).unwrap();
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
#[ignore = "auditoria de propostas reais preservadas, com avaliação e reparo locais reais; não publica no perfil do mantenedor"]
fn audits_recorded_discovery_pool_with_real_editorial_stages() {
    let (root, transcript, _) = inputs();
    let directory = scratch("recorded-pool");
    let engine = Engine::discover(&root, Quality::Qwen35).unwrap();
    let options = serde_json::from_value::<GenerateOptions>(
        serde_json::json!({"automatic":true,"format":"9:16","fit":"cover"}),
    )
    .unwrap()
    .resolve()
    .unwrap();
    let lab = root.join("../editorial-stories-2026-10-25");
    let cases = [
        "goal-seed-43",
        "goal-seed-44",
        "goal-local-decoder-1",
        "goal-local-decoder-2",
    ];
    let mut candidates = Vec::new();
    let mut failures = Vec::new();
    for case in cases {
        let output = std::fs::read_to_string(lab.join(case).join("output.txt")).unwrap();
        let decoded =
            super::discovery_reply::decode_with_feedback(&output, &transcript.segments).unwrap();
        candidates.extend(decoded.candidates);
        failures.extend(decoded.failures);
    }
    let rejected = std::cell::RefCell::new(Vec::new());
    let evaluate = |pending: &[super::types::Clip], _: &[crate::transcription::types::Segment]| {
        let judgments = assessment::evaluate(
            &engine,
            &directory,
            pending,
            &transcript.segments,
            &ProcessControl::default(),
        )?;
        editorial_repair::remember_rejections(&mut rejected.borrow_mut(), pending, &judgments);
        Ok(judgments)
    };
    let started = std::time::Instant::now();
    let proposed = candidates.len();
    let mut chosen = super::selection::resolve(
        &[(0..transcript.segments.len(), candidates)],
        &transcript.segments,
        &transcript.media_id,
        599.098,
        &options,
        &evaluate,
    )
    .unwrap();
    let mut budget = 3;
    let repaired = editorial_repair::recover(
        &engine,
        &directory,
        &rejected.borrow(),
        &transcript.segments,
        &transcript.media_id,
        &options,
        &ProcessControl::default(),
        &mut budget,
    )
    .unwrap();
    let originals = repaired
        .iter()
        .map(|r| (r.clip.id.clone(), r.original))
        .collect();
    let mut repaired: Vec<_> = repaired.into_iter().map(|r| r.clip).collect();
    super::editorial::recheck_adjusted(&mut repaired, &originals, &transcript.segments, &evaluate)
        .unwrap();
    super::editorial::retain_analyzed_complete(&mut repaired);
    chosen.extend(repaired);
    chosen = super::selection::finalize_prioritized(chosen, options.count, true, 0);
    let values = chosen.iter().map(|clip| serde_json::json!({"clip":clip,"includedSpeech":super::semantic::source(clip,&transcript.segments)})).collect::<Vec<_>>();
    std::fs::write(directory.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({
        "scope":"Recorded real discovery outputs replayed through native selection, real local assessment and repair; NOT a fresh generation::run, NOT UI, NOT a normal library publication",
        "cases":cases,"fullTranscriptEveryAssessment":true,"segments":transcript.segments.len(),
        "proposed":proposed,"locationFailures":failures,"selected":chosen.len(),"clips":values,
        "elapsedSeconds":started.elapsed().as_secs_f64()})).unwrap()).unwrap();
}

#[test]
#[ignore = "localiza uma resposta salva na fonte integral, sem inferência, avaliação editorial ou publicação"]
fn ground_saved_discovery_without_model_calls() {
    use sha2::Digest;
    use std::io::Write;

    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let allowed = workspace
        .join(".tooling/test-output")
        .canonicalize()
        .unwrap();
    let input =
        PathBuf::from(std::env::var("CNP_GROUNDING_RAW").expect("CNP_GROUNDING_RAW ausente"))
            .canonicalize()
            .unwrap();
    assert!(input.starts_with(&allowed) && input.is_file());
    assert!(std::fs::metadata(&input).unwrap().len() <= 131_072);
    let explicit_transcript = std::env::var_os("CNP_GROUNDING_TRANSCRIPT");
    let transcript_path = explicit_transcript
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            allowed.join("pipelines-comparados-2026-10-24/corpus/davyjones-transcript.json")
        })
        .canonicalize()
        .unwrap();
    assert!(transcript_path.starts_with(&allowed));
    let transcript: Transcript =
        serde_json::from_slice(&std::fs::read(&transcript_path).unwrap()).unwrap();
    let duration = 599.098;
    if explicit_transcript.is_none() {
        assert_eq!(transcript.segments.len(), 334);
    }
    crate::transcription::parser::validate(&transcript.segments, duration).unwrap();
    let options = serde_json::from_value::<GenerateOptions>(
        serde_json::json!({"automatic":true,"format":"9:16","fit":"cover"}),
    )
    .unwrap()
    .resolve()
    .unwrap();
    let raw = std::fs::read_to_string(&input).unwrap();
    let decoded = super::discovery_reply::decode_with_feedback(&raw, &transcript.segments);
    let parse_error = decoded.as_ref().err().cloned();
    let location_failures = decoded
        .as_ref()
        .map(|reply| reply.failures.clone())
        .unwrap_or_default();
    let candidates = decoded.map(|reply| reply.candidates).unwrap_or_default();
    let localized = candidates.len();
    let mut conform_rejected = 0;
    let mut refined_in_range = 0;
    let mut rows = Vec::new();
    for candidate in candidates {
        let source = &transcript.segments[candidate.first_id..=candidate.last_id];
        let bounds = candidate
            .quote_bounds
            .unwrap_or((source[0].start, source.last().unwrap().end.min(duration)));
        let invalid_duration =
            bounds.1 - bounds.0 < options.min_seconds || bounds.1 - bounds.0 > options.max_seconds;
        let mut row = serde_json::json!({
            "candidate":{"firstId":candidate.first_id,"lastId":candidate.last_id,
                "quoteBounds":candidate.quote_bounds,"resolvedBounds":bounds,"sourceQuotes":candidate.moment},
            "sourceSegmentText":source.iter().map(|segment|segment.text.as_str()).collect::<Vec<_>>().join("\n"),
            "requestedFit":options.fit,"invalidDurationBeforeConform":invalid_duration,
            "editorialStatus":"NOT ASSESSED"
        });
        match super::selection::conform(
            candidate,
            &transcript.segments,
            &transcript.media_id,
            duration,
            &options,
        ) {
            Ok(mut contender) => {
                row["conformStatus"] = serde_json::json!("PASS");
                row["conformedClip"] = serde_json::json!({"clip":contender.clip,
                    "includedSpeech":super::semantic::source(&contender.clip,&transcript.segments)});
                let refined = super::borders::refine_boundaries(
                    contender.clip.start,
                    contender.clip.end,
                    &transcript.segments,
                    &[],
                    options.min_seconds,
                    None,
                    None,
                    duration,
                );
                contender.clip.start = refined.start;
                contender.clip.end = refined.end;
                contender.clip.id = super::types::identity(
                    &transcript.media_id,
                    refined.start,
                    refined.end,
                    contender.clip.format.as_deref(),
                );
                let invalid_refined_duration = refined.end - refined.start < options.min_seconds
                    || refined.end - refined.start > options.max_seconds;
                refined_in_range += usize::from(!invalid_refined_duration);
                row["refinedClip"] = serde_json::json!({"clip":contender.clip,"operations":refined.ops,
                    "includedSpeech":super::semantic::source(&contender.clip,&transcript.segments),
                    "invalidDuration":invalid_refined_duration});
            }
            Err(_) => {
                conform_rejected += 1;
                row["conformStatus"] = serde_json::json!("REJECTED");
                row["refinedClip"] = serde_json::Value::Null;
            }
        }
        rows.push(row);
    }
    let audit = serde_json::json!({
        "scope":"Native localization, conform and deterministic borders only; no inference, editorial assessment, export or publication",
        "parseStatus":if parse_error.is_none(){"PASS"}else{"FAIL"},"parseError":parse_error,
        "editorialStatus":"NOT ASSESSED","published":false,"exported":false,
        "input":input.strip_prefix(&workspace).unwrap().to_string_lossy(),
        "inputSha256":format!("{:x}",sha2::Sha256::digest(raw.as_bytes())),
        "transcript":transcript_path.strip_prefix(&workspace).unwrap().to_string_lossy(),
        "segments":transcript.segments.len(),"durationSeconds":duration,
        "minSeconds":options.min_seconds,"maxSeconds":options.max_seconds,
        "localizedCandidates":localized,"locationFailures":location_failures,
        "conformRejected":conform_rejected,"conformed":localized-conform_rejected,
        "refinedWithinDuration":refined_in_range,"candidates":rows
    });
    let output = input
        .parent()
        .unwrap()
        .join(format!("native-grounding-{}.json", uuid::Uuid::new_v4()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)
        .unwrap();
    file.write_all(&serde_json::to_vec_pretty(&audit).unwrap())
        .unwrap();
    file.sync_all().unwrap();
    let reread: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&output).unwrap()).unwrap();
    assert_eq!(reread, audit);
    eprintln!("[grounding] {}", output.display());
    eprintln!(
        "[grounding] localizados={localized}; conformados={}; refinados_na_faixa={refined_in_range}",
        localized - conform_rejected
    );
    assert!(audit["parseError"].is_null(), "{}", audit["parseError"]);
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
    let prompt =
        std::fs::read_to_string(scratch.join("repair-0-call-0000/repair-0-prompt.txt")).unwrap();
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
