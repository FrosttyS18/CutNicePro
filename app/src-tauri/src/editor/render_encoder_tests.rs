use super::{render_with_encoder, Encoder, ProcessControl};
use crate::render::scratch::Scratch;

fn scratch() -> Scratch {
    Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-editor-encoder"),
    )
    .unwrap()
}

#[test]
fn available_gpu_is_used_without_a_cpu_attempt() {
    let scratch = scratch();
    let control = ProcessControl::default();
    let mut attempts = Vec::new();
    let actual = render_with_encoder(Encoder::Nvenc, &scratch.path, &control, |encoder| {
        attempts.push(encoder);
        Ok(())
    })
    .unwrap();
    assert_eq!(actual, Encoder::Nvenc);
    assert_eq!(attempts, [Encoder::Nvenc]);
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("encoder.txt")).unwrap(),
        "h264_nvenc"
    );
    assert!(!scratch.path.join("encoder-fallback.log").exists());
}

#[test]
fn unavailable_gpu_uses_cpu_without_retry() {
    let scratch = scratch();
    let mut attempts = Vec::new();
    let actual = render_with_encoder(
        Encoder::Cpu,
        &scratch.path,
        &ProcessControl::default(),
        |encoder| {
            attempts.push(encoder);
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(actual, Encoder::Cpu);
    assert_eq!(attempts, [Encoder::Cpu]);
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("encoder.txt")).unwrap(),
        "libx264"
    );
    assert!(!scratch.path.join("encoder-fallback.log").exists());
}

#[test]
fn failed_gpu_retries_cpu_and_preserves_the_failure_in_the_job_log() {
    let scratch = scratch();
    let mut attempts = Vec::new();
    let actual = render_with_encoder(
        Encoder::Nvenc,
        &scratch.path,
        &ProcessControl::default(),
        |encoder| {
            attempts.push(encoder);
            match encoder {
                Encoder::Nvenc => Err("NVENC controlled failure 42".into()),
                Encoder::Cpu => Ok(()),
            }
        },
    )
    .unwrap();
    assert_eq!(actual, Encoder::Cpu);
    assert_eq!(attempts, [Encoder::Nvenc, Encoder::Cpu]);
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("encoder.txt")).unwrap(),
        "libx264"
    );
    assert_eq!(
        std::fs::read_to_string(scratch.path.join("encoder-fallback.log")).unwrap(),
        "NVENC controlled failure 42"
    );
}

#[test]
fn cancellation_during_gpu_failure_does_not_retry_or_publish_an_encoder() {
    let scratch = scratch();
    let control = ProcessControl::default();
    let mut attempts = Vec::new();
    let result = render_with_encoder(Encoder::Nvenc, &scratch.path, &control, |encoder| {
        attempts.push(encoder);
        control.cancel();
        Err("interrupted GPU".into())
    });
    assert!(result.unwrap_err().contains("cancelada"));
    assert_eq!(attempts, [Encoder::Nvenc]);
    assert!(!scratch.path.join("encoder.txt").exists());
    assert!(!scratch.path.join("encoder-fallback.log").exists());
}

#[test]
fn cancellation_before_render_does_not_start_an_attempt() {
    let scratch = scratch();
    let control = ProcessControl::default();
    control.cancel();
    let result = render_with_encoder(Encoder::Nvenc, &scratch.path, &control, |_| {
        panic!("cancelled render must not start")
    });
    assert!(result.unwrap_err().contains("cancelada"));
    assert!(!scratch.path.join("encoder.txt").exists());
}

#[test]
fn cancellation_after_gpu_render_does_not_publish_an_encoder_or_retry() {
    let scratch = scratch();
    let control = ProcessControl::default();
    let mut attempts = Vec::new();
    let result = render_with_encoder(Encoder::Nvenc, &scratch.path, &control, |encoder| {
        attempts.push(encoder);
        control.cancel();
        Ok(())
    });
    assert!(result.unwrap_err().contains("cancelada"));
    assert_eq!(attempts, [Encoder::Nvenc]);
    assert!(!scratch.path.join("encoder.txt").exists());
}

#[test]
fn failed_cpu_fallback_returns_the_error_without_publishing_an_encoder() {
    let scratch = scratch();
    let mut attempts = Vec::new();
    let result = render_with_encoder(
        Encoder::Nvenc,
        &scratch.path,
        &ProcessControl::default(),
        |encoder| {
            attempts.push(encoder);
            Err(match encoder {
                Encoder::Nvenc => "controlled GPU failure".into(),
                Encoder::Cpu => "controlled CPU failure".into(),
            })
        },
    );
    assert_eq!(result.unwrap_err(), "controlled CPU failure");
    assert_eq!(attempts, [Encoder::Nvenc, Encoder::Cpu]);
    assert!(!scratch.path.join("encoder.txt").exists());
}
