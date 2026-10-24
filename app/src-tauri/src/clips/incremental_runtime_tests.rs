use super::{generation, types::GenerateOptions};
use crate::transcription::{process::ProcessControl, types::Transcript};
use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

#[test]
#[ignore = "diagnóstico local delimitado; exige cópia da transcrição e da coleção"]
fn incremental_generation_runtime_probe() {
    let dir = PathBuf::from(std::env::var("CNP_INCREMENTAL_EVIDENCE").expect("pasta isolada"));
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = dir.canonicalize().unwrap();
    assert!(dir.starts_with(
        workspace
            .join(".tooling/test-output")
            .canonicalize()
            .unwrap()
    ));
    let source =
        PathBuf::from(std::env::var("CNP_INCREMENTAL_SOURCE").expect("fonte somente de leitura"));
    assert!(
        source.is_file(),
        "a mídia de leitura deve existir antes de carregar o modelo"
    );
    let transcript: Transcript =
        serde_json::from_slice(&std::fs::read(dir.join("transcript.json")).unwrap()).unwrap();
    let mut previous: super::types::ClipCollection =
        serde_json::from_slice(&std::fs::read(dir.join("previous.json")).unwrap()).unwrap();
    let project = "453eefc7-2f8e-4681-aa61-980ab6cf39d9";
    let run = std::env::var("CNP_INCREMENTAL_RUN").unwrap_or_else(|_| "before".into());
    assert!([
        "before",
        "after",
        "after-repair1",
        "after-repair2",
        "after-assessment1",
        "after-assessment2",
        "qwen35-incremental-1",
        "qwen35-incremental-2",
        "qwen35-incremental-3",
        "qwen35-incremental-4",
        "qwen35-incremental-5",
        "qwen35-incremental-6",
        "qwen35-fresh-1",
        "qwen35-fresh-2",
        "qwen35-fresh-3",
        "qwen35-fresh-4",
        "qwen35-fresh-5"
    ]
    .contains(&run.as_str()));
    let fresh_baseline = run.starts_with("qwen35-fresh-");
    let base = dir.join(format!("base-{run}"));
    let store = base.join("cutnicepro/clips");
    std::fs::create_dir_all(&store).unwrap();
    if fresh_baseline {
        assert!(!store.join(format!("{project}.json")).exists());
        previous.clips.clear();
    } else {
        std::fs::copy(
            dir.join("previous.json"),
            store.join(format!("{project}.json")),
        )
        .unwrap();
    }
    let scratch = dir.join(&run);
    std::fs::create_dir_all(&scratch).unwrap();
    let options: GenerateOptions = serde_json::from_value(serde_json::json!({
        "automatic":true,"format":"9:16","fit":"cover","quality":"qwen35"
    }))
    .unwrap();
    let options = options.resolve().unwrap();
    let control = Arc::new(ProcessControl::default());
    let (finish, timeout) = std::sync::mpsc::channel();
    let timer_control = control.clone();
    let watchdog = std::thread::spawn(move || {
        if timeout.recv_timeout(Duration::from_secs(1200)).is_err() {
            timer_control.cancel();
        }
    });
    let started = Instant::now();
    let result = generation::run(
        &base,
        &scratch,
        generation::Request {
            project,
            media: &transcript.media_id,
            source: &source,
            duration: 599.098,
            speech: &transcript.segments,
            options: &options,
        },
        &control,
        |p| eprintln!("[probe] {p}%"),
    );
    let _ = finish.send(());
    watchdog.join().unwrap();
    let report = match &result {
        Ok(collection) => {
            let added: Vec<_> = collection
                .clips
                .iter()
                .filter(|c| !previous.clips.iter().any(|old| old.id == c.id))
                .collect();
            serde_json::json!({"status":"completed","baselineRecords":previous.clips.len(),"elapsedSeconds":started.elapsed().as_secs_f64(),"newCount":added.len(),"newClips":added,"existingPreserved":previous.clips.iter().all(|old| collection.clips.iter().any(|c| c.id==old.id && c.title==old.title && c.deleted==old.deleted && c.review==old.review)),"total":collection.clips.len()})
        }
        Err(error) => {
            serde_json::json!({"status":"failed","elapsedSeconds":started.elapsed().as_secs_f64(),"error":error})
        }
    };
    std::fs::write(
        dir.join(format!("{run}-summary.json")),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    eprintln!("[probe] resultado {report}");
    assert!(result.is_ok(), "{}", report);
    if run != "before" {
        assert!(
            report["newCount"].as_u64().unwrap() > 0,
            "a correção precisa acrescentar cortes reais nesta amostra"
        );
        assert_eq!(report["existingPreserved"], true);
    }
}
