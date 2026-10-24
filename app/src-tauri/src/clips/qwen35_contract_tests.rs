use super::types::Options;

#[test]
fn new_and_legacy_requests_resolve_to_qwen35_without_reviving_old_models() {
    for payload in [
        r#"{"minSeconds":10,"maxSeconds":60,"count":3}"#,
        r#"{"minSeconds":10,"maxSeconds":60,"count":3,"quality":"qwen35"}"#,
        r#"{"minSeconds":10,"maxSeconds":60,"count":3,"quality":"standard"}"#,
        r#"{"minSeconds":10,"maxSeconds":60,"count":3,"quality":"experimentalGemma"}"#,
    ] {
        let options: Options = serde_json::from_str(payload).unwrap();
        assert_eq!(format!("{:?}", options.quality()), "Qwen35");
    }
    assert!(serde_json::from_str::<Options>(
        r#"{"minSeconds":10,"maxSeconds":60,"count":3,"quality":"modelo-inventado"}"#
    )
    .is_err());
}
