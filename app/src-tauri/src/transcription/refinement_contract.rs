#[test]
#[ignore = "Lê os seis resultados reais da comparação delimitada de 86 segundos"]
fn refinement_results_preserve_real_words_and_later_times() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/vendor/asr-refinement");
    for name in [
        "turbo-baseline.json",
        "turbo-context.json",
        "turbo-vocabulary.json",
        "large-baseline.json",
        "large-context.json",
        "large-vocabulary-ascii-retry.json",
    ] {
        let raw = std::fs::read_to_string(root.join(name)).unwrap();
        let segments = super::parser::parse(&raw, 86.0).unwrap();
        super::parser::validate(&segments, 86.0).unwrap();
        let words = segments
            .iter()
            .flat_map(|segment| &segment.words)
            .collect::<Vec<_>>();
        assert!(words.len() > 200, "{name}: too few aligned words");
        assert!(
            words.iter().any(|word| word.start > 80.0),
            "{name}: missing later timestamps"
        );
        assert!(
            segments
                .iter()
                .all(|segment| !segment.text.contains('\u{fffd}')),
            "{name}: invalid recognition text"
        );
    }
}
