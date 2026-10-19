use super::{generation, store, types::Options};
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
