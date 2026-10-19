#[test]
#[ignore = "requires real ASR benchmark files; run explicitly after models finish"]
fn real_gpu_results_have_valid_later_word_times() {
    let directory =
        std::env::var_os("CNP_ASR_EVALUATION_DIR").expect("CNP_ASR_EVALUATION_DIR is required");
    let root = std::path::PathBuf::from(directory);
    let turbo = super::tools::discover_profile(&root, super::profiles::Profile::Turbo).unwrap();
    let full = super::tools::discover_profile(&root, super::profiles::Profile::Large).unwrap();
    assert!(turbo.gpu && full.gpu);
    assert_ne!(turbo.model, full.model);
    assert_eq!(turbo.profile.alignment(), "large.v3.turbo");
    assert_eq!(full.profile.alignment(), "large.v3");
    for name in [
        "native-turbo-cuda.json",
        "native-large-cuda.json",
        "large-native-cpu.json",
    ] {
        let raw = std::fs::read_to_string(root.join(name)).unwrap();
        let segments = super::parser::parse(&raw, 30.0).unwrap();
        super::parser::validate(&segments, 30.0).unwrap();
        let words = segments
            .iter()
            .flat_map(|segment| &segment.words)
            .collect::<Vec<_>>();
        assert!(words.len() > 80, "{name}: {} words", words.len());
        assert!(
            words.iter().any(|word| word.start > 25.0),
            "{name}: missing later timestamps"
        );
    }
}
