use super::{
    assessment,
    text_engine::Engine,
    types::{Clip, Quality},
};
use crate::transcription::{process::ProcessControl, types::Transcript};
use std::{path::PathBuf, time::Instant};

#[test]
#[ignore = "avalia propostas reais do laboratório pelo avaliador nativo; exige modelo e fonte integral"]
fn discovered_proposals_use_the_native_assessor() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = workspace.join(".tooling/test-output/pipelines-comparados-2026-10-24");
    let input = directory.join("anchors-davyjones-direct/result.json");
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(directory.join("corpus/davyjones-transcript.json")).unwrap(),
    )
    .unwrap();
    let proposals: serde_json::Value =
        serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    let pending: Vec<Clip> = proposals["clips"].as_array().unwrap().iter().filter(|p| p.get("start").is_some()).map(|p| serde_json::from_value(serde_json::json!({
        "id": super::types::identity(&transcript.media_id,p["start"].as_f64().unwrap(),p["end"].as_f64().unwrap(),Some("9:16")),
        "start":p["start"],"end":p["end"],"title":"Proposta descoberta na fonte integral","score":0,"reasons":[],"review":"pending","format":"9:16"
    })).unwrap()).collect();
    let scratch = directory.join("native-anchor-assessment");
    std::fs::create_dir_all(&scratch).unwrap();
    let engine = Engine::discover(&directory, Quality::Qwen35).unwrap();
    let started = Instant::now();
    let judgments = assessment::evaluate(
        &engine,
        &scratch,
        &pending,
        &transcript.segments,
        &ProcessControl::default(),
    )
    .unwrap();
    let rows: Vec<_> = pending.iter().zip(&judgments).map(|(clip,j)| serde_json::json!({"start":clip.start,"end":clip.end,"standalone":j.standalone,"complete":j.complete,"score":j.score,"analysis":j.analysis,"reason":j.reason})).collect();
    let accepted = judgments
        .iter()
        .filter(|j| {
            j.standalone && j.complete && j.score >= super::types::AUTOMATIC_RELEVANCE_FLOOR
        })
        .count();
    std::fs::write(scratch.join("summary.json"),serde_json::to_vec_pretty(&serde_json::json!({"elapsedSeconds":started.elapsed().as_secs_f64(),"total":rows.len(),"accepted":accepted,"judgments":rows})).unwrap()).unwrap();
    assert!(accepted>=2,"a hipótese exige pelo menos dois episódios aceitos sem afrouxar o avaliador; recebidos {accepted}");
}

#[test]
#[ignore = "geração integral, regeneração e exportação reais em perfil exclusivo do laboratório"]
fn whole_video_generation_regeneration_and_export() {
    use super::{
        generation, store,
        types::{GenerateOptions, Review},
    };
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/pipelines-comparados-2026-10-24")
        .canonicalize()
        .unwrap();
    let dataset = std::env::var("CNP_COMPARISON_DATASET").unwrap_or_else(|_| "davyjones".into());
    assert!(["davyjones", "ux"].contains(&dataset.as_str()));
    let base = root.join(format!("native-full-{dataset}"));
    assert!(
        !base.join("summary.json").exists(),
        "esta configuração já tem resultado completo"
    );
    std::fs::create_dir_all(&base).unwrap();
    let transcript: Transcript = serde_json::from_slice(
        &std::fs::read(root.join(format!("corpus/{dataset}-transcript.json"))).unwrap(),
    )
    .unwrap();
    let source = root.join(format!("corpus/{dataset}-completo.mp4"));
    let duration = if dataset == "ux" {
        1476.789116
    } else {
        599.098
    };
    let options: GenerateOptions = serde_json::from_value(
        serde_json::json!({"automatic":true,"format":"9:16","fit":"cover","quality":"qwen35"}),
    )
    .unwrap();
    let options = options.resolve().unwrap();
    let project = std::env::var("CNP_COMPARISON_PROJECT")
        .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
    uuid::Uuid::parse_str(&project).unwrap();
    let reuse_first = std::env::var("CNP_COMPARISON_REUSE_FIRST").as_deref() == Ok("1");
    let mut previous: Option<super::types::ClipCollection> = None;
    let mut rounds = Vec::new();
    let started = Instant::now();
    let count = if dataset == "ux" { 1 } else { 2 };
    for round in 1..=count {
        let scratch = base.join(format!("round-{round}"));
        std::fs::create_dir_all(&scratch).unwrap();
        let control = std::sync::Arc::new(ProcessControl::default());
        let timer = control.clone();
        let (finish, wait) = std::sync::mpsc::channel();
        let watchdog = std::thread::spawn(move || {
            if wait
                .recv_timeout(std::time::Duration::from_secs(1200))
                .is_err()
            {
                timer.cancel();
            }
        });
        let time = Instant::now();
        let reused = reuse_first && round == 1;
        let result = if reused {
            store::load(&base, &project, &transcript.media_id, duration)
                .unwrap()
                .ok_or_else(|| "checkpoint real ausente".into())
        } else {
            generation::run(
                &base,
                &scratch,
                generation::Request {
                    project: &project,
                    media: &transcript.media_id,
                    source: &source,
                    duration,
                    speech: &transcript.segments,
                    options: &options,
                },
                &control,
                |p| eprintln!("[whole-video] {dataset} round {round}: {p}%"),
            )
        };
        let _ = finish.send(());
        watchdog.join().unwrap();
        let mut collection=result.unwrap_or_else(|error|{
            std::fs::write(base.join("failure.json"),serde_json::to_vec_pretty(&serde_json::json!({"round":round,"error":error,"elapsedSeconds":time.elapsed().as_secs_f64()})).unwrap()).unwrap();
            panic!("geração integral falhou: {error}");
        });
        let new: Vec<_> = collection
            .clips
            .iter()
            .filter(|clip| {
                previous
                    .as_ref()
                    .is_none_or(|old| old.clips.iter().all(|c| c.id != clip.id))
            })
            .cloned()
            .collect();
        assert!(
            new.len() >= 2,
            "é necessário gerar pelo menos dois episódios nesta fonte: {}",
            new.len()
        );
        let discovery = std::fs::read_to_string(scratch.join("selection-0-prompt.txt")).unwrap();
        let full_source = transcript
            .segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join("\n")
            .replace("<|", "< |");
        assert!(
            discovery.contains(&full_source),
            "a descoberta deve receber todas as falas"
        );
        if let Some(old) = &previous {
            let latest = old.clips.iter().filter_map(|c| c.created_at_ms).max();
            assert!(
                new.iter().all(|c| c.created_at_ms > latest),
                "as versões novas precisam de uma data nova"
            );
            for saved in &old.clips {
                let kept = collection.clips.iter().find(|c| c.id == saved.id).unwrap();
                assert_eq!(
                    serde_json::to_value(saved).unwrap(),
                    serde_json::to_value(kept).unwrap()
                );
            }
            assert!(
                new.iter().any(|c| old
                    .clips
                    .iter()
                    .any(|before| (before.start - c.start).abs() < 0.01
                        && (before.end - c.end).abs() < 0.01
                        && before.deleted == Some(true))),
                "conteúdo excluído deve poder gerar uma versão nova"
            );
            assert_eq!(
                discovery,
                std::fs::read_to_string(base.join("round-1/selection-0-prompt.txt")).unwrap(),
                "a biblioteca não deve alterar a descoberta inicial"
            );
        }
        store::save(&base, &project, &collection, duration).unwrap();
        let reopened = store::load(&base, &project, &transcript.media_id, duration)
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&collection).unwrap(),
            serde_json::to_value(&reopened).unwrap()
        );
        std::fs::write(
            base.join(format!("round-{round}-result.json")),
            serde_json::to_vec_pretty(&collection).unwrap(),
        )
        .unwrap();
        let mut exports = Vec::new();
        if round == 1 {
            for (index, clip) in new.iter().enumerate() {
                let face = clip.face_framing.as_ref();
                let fit = if face.is_some_and(|f| f.status == "ambiguous") {
                    "contain"
                } else {
                    "cover"
                };
                let focal = face
                    .filter(|f| f.status == "stable")
                    .map(|f| serde_json::json!({"x":f.x.unwrap()*100.0,"y":f.y.unwrap()*100.0}));
                let settings=serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":fit,"focalPoint":focal,"captionModel":2,
                    "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom","wordsPerCaption":5},
                    "volume":1,"muted":false,"background":"#000000","text":"","trimStart":clip.start,"trimEnd":clip.end})).unwrap();
                let destination = base.join(format!(
                    "Qwen35-4B-Q4-{dataset}-round1-{:02}.mp4",
                    index + 1
                ));
                if !reused || !destination.is_file() {
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
                    std::fs::copy(&output, &destination).unwrap();
                    drop(temporary);
                }
                exports.push(serde_json::json!({"file":destination,"clip":clip,"includedSpeech":super::semantic::source(clip,&transcript.segments)}));
            }
        }
        rounds.push(serde_json::json!({"round":round,"reusedGeneratedCheckpoint":reused,"elapsedSeconds":time.elapsed().as_secs_f64(),"newCount":new.len(),"newClips":new,"total":collection.clips.len(),"exports":exports}));
        std::fs::write(
            base.join(format!("round-{round}-result.json")),
            serde_json::to_vec_pretty(&collection).unwrap(),
        )
        .unwrap();
        if round == 1 && count == 2 {
            for clip in &mut collection.clips {
                clip.title = format!("Título preservado {}", clip.id);
                if let Some(analysis) = &mut clip.analysis {
                    analysis.title = clip.title.clone();
                }
                clip.review = Review::Rejected;
                clip.deleted = Some(true);
            }
            store::save(&base, &project, &collection, duration).unwrap();
        }
        previous = Some(collection);
    }
    std::fs::write(base.join("summary.json"),serde_json::to_vec_pretty(&serde_json::json!({"dataset":dataset,"fullVideo":true,"segments":transcript.segments.len(),"elapsedSeconds":started.elapsed().as_secs_f64(),"rounds":rounds})).unwrap()).unwrap();
}
