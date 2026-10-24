use super::{
    borders, face_framing, generation,
    types::{Options, Quality},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::path::PathBuf;

#[test]
#[ignore = "regressão delimitada com mídia e transcrição reais"]
fn autoclip_observed_boundary_native_regression() {
    let dir = PathBuf::from(std::env::var("CNP_EDITORIAL_EVIDENCE").expect("pasta exclusiva"));
    let source =
        PathBuf::from(std::env::var("CNP_EDITORIAL_SOURCE").expect("mídia somente de leitura"));
    let speech: Vec<Segment> =
        serde_json::from_slice(&std::fs::read(dir.join("editorial-speech.json")).unwrap()).unwrap();
    let refined =
        borders::refine_boundaries(1194.42, 1228.92, &speech, &[], 10.0, None, None, 1476.789);
    assert!(
        refined.end >= 1228.9,
        "A conclusão não pode recuar para 1220.88: {:?}",
        refined
    );
    assert!(refined.start <= 1194.42);
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let scratch = crate::render::scratch::Scratch::new(&base).unwrap();
    let mut clips = vec![serde_json::from_value::<super::types::Clip>(serde_json::json!({"id":"b".repeat(64),"start":refined.start,"end":refined.end,"title":"Referência técnica de fronteiras","score":0,"reasons":[],"review":"pending","format":"9:16","fit":"cover"})).unwrap()];
    let control = ProcessControl::default();
    face_framing::enrich(&base, &source, &scratch.path, &mut clips, &control).unwrap();
    let face = clips[0].face_framing.as_ref().expect("detecção executada");
    assert_ne!(face.status, "unavailable");
    let fit = if face.status == "ambiguous" {
        "contain"
    } else {
        "cover"
    };
    let focal = if face.status == "stable" {
        Some(serde_json::json!({"x":face.x.unwrap()*100.0,"y":face.y.unwrap()*100.0}))
    } else {
        None
    };
    let settings = serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":fit,"focalPoint":focal,"captionModel":2,
        "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
        "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
        "volume":1.0,"muted":false,"background":"#000000","text":"","trimStart":refined.start,"trimEnd":refined.end})).unwrap();
    let (render_scratch, output) = crate::render::pipeline::run(
        &base,
        &source,
        &speech,
        &settings,
        1476.789,
        true,
        &control,
        |_| {},
    )
    .unwrap();
    let destination = dir.join("referencia-TECNICA-bordas-YuNet.mp4");
    std::fs::copy(output, &destination).unwrap();
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let actual = crate::media_analyze::analyze(&tools, &destination).unwrap();
    assert_eq!((actual.width, actual.height), (1080, 1920));
    assert!((actual.duration_ms as f64 / 1000.0 - (refined.end - refined.start)).abs() < 0.3);
    let result = serde_json::json!({"scope":"Regressão do intervalo observado, SEM nova inferência de seleção e SEM aceite editorial. Não é corte novo entregue pela IA.","rawStart":1194.42,"rawEnd":1228.92,"beforeFixEnd":1220.88,"afterStart":refined.start,"afterEnd":refined.end,"operations":refined.ops,"faceFraming":face,"fit":fit,"focalPoint":focal,"actualDurationMs":actual.duration_ms,"width":actual.width,"height":actual.height,"filename":"referencia-TECNICA-bordas-YuNet.mp4"});
    std::fs::write(
        dir.join("boundary-face-export-regression.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    drop(render_scratch);
}

#[test]
#[ignore = "requer modelo local e amostra de mídia indicada explicitamente"]
fn autoclip_editorial_runtime_probe() {
    let dir = PathBuf::from(
        std::env::var("CNP_EDITORIAL_EVIDENCE").expect("pasta exclusiva de evidências"),
    );
    let source = PathBuf::from(std::env::var("CNP_EDITORIAL_SOURCE").expect("mídia de leitura"));
    let speech: Vec<Segment> =
        serde_json::from_slice(&std::fs::read(dir.join("editorial-speech.json")).unwrap()).unwrap();
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/autoclip-editorial-base");
    let run_id = std::env::var("CNP_EDITORIAL_RUN").unwrap_or_else(|_| "2".into());
    assert!(run_id.chars().all(|c| c.is_ascii_digit()));
    let scratch = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "../../.tooling/test-output/autoclip-editorial-run{run_id}"
    ));
    std::fs::create_dir_all(&scratch).unwrap();
    let options = Options {
        min_seconds: 10.0,
        max_seconds: 120.0,
        count: 3,
        format: Some("9:16".into()),
        fit: Some("cover".into()),
        quality: Some(Quality::ExperimentalGemma),
        automatic: false,
    };
    let project = uuid::Uuid::new_v4().to_string();
    let control = ProcessControl::default();
    let started = std::time::Instant::now();
    let result = generation::run(
        &base,
        &scratch,
        generation::Request {
            project: &project,
            media: "autoclip-editorial-probe",
            source: &source,
            duration: 1476.789,
            speech: &speech,
            options: &options,
        },
        &control,
        |p| eprintln!("[probe] progresso real {p}%"),
    );
    let elapsed = started.elapsed().as_secs_f64();
    let summary = match &result {
        Ok(collection) => {
            serde_json::json!({"status":"completed","elapsedSeconds":elapsed,"collection":collection,"scope":"Amostra textual a partir de 1170 s até o fim real do vídeo; pipeline nativo, sem UI nem gravação em projeto do mantenedor."})
        }
        Err(error) => serde_json::json!({"status":"failed","elapsedSeconds":elapsed,"error":error}),
    };
    std::fs::write(
        dir.join("editorial-result.json"),
        serde_json::to_vec_pretty(&summary).unwrap(),
    )
    .unwrap();
    let collection = result.expect("geração real da amostra");
    assert!(!collection.clips.is_empty());
    assert!(collection
        .clips
        .iter()
        .all(|c| c.analysis.is_some() && c.end > c.start && c.end - c.start <= 120.0));
    let clip = &collection.clips[0];
    let face = clip.face_framing.as_ref();
    let fit = if face.is_some_and(|f| f.status == "ambiguous") {
        "contain"
    } else {
        "cover"
    };
    let focal = face
        .filter(|f| f.status == "stable")
        .map(|f| serde_json::json!({"x":f.x.unwrap()*100.0,"y":f.y.unwrap()*100.0}));
    let settings = serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":fit,"focalPoint":focal,
        "captionModel":2,"captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
            "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
        "volume":1.0,"muted":false,"background":"#000000","text":"","trimStart":clip.start,"trimEnd":clip.end,
        "effects":{"brightness":100,"contrast":100,"saturation":100,"blur":0,"hue":0},"zoom":1.0})).unwrap();
    let (render_scratch, output) = crate::render::pipeline::run(
        &base,
        &source,
        &speech,
        &settings,
        1476.789,
        true,
        &control,
        |_| {},
    )
    .expect("MP4 pelo render real");
    let destination = dir.join("amostra-Gemma12B-YuNet.mp4");
    std::fs::copy(&output, &destination).unwrap();
    let tools = crate::media_analyze::detect_fftools().expect("ffprobe instalado");
    let actual = crate::media_analyze::analyze(&tools, &destination).expect("ffprobe do resultado");
    assert!((actual.duration_ms as f64 / 1000.0 - (clip.end - clip.start)).abs() < 0.3);
    std::fs::write(dir.join("export-result.json"), serde_json::to_vec_pretty(&serde_json::json!({"clipId":clip.id,"title":clip.title,"model":collection.engine,"sourceStart":clip.start,"sourceEnd":clip.end,"actualDurationMs":actual.duration_ms,"width":actual.width,"height":actual.height,"fit":fit,"focalPoint":focal,"faceFraming":face,"filename":"amostra-Gemma12B-YuNet.mp4","method":"render::pipeline, sem diálogo/IPC/UI"})).unwrap()).unwrap();
    drop(render_scratch);
}
