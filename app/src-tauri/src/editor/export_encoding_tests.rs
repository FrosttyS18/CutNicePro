use super::super::export_options::{Format, FrameRate, Resolution};
use super::*;

#[test]
fn default_h264_arguments_preserve_the_approved_route() {
    for encoder in [Encoder::Cpu, Encoder::Nvenc] {
        assert_eq!(
            arguments(ExportOptions::default(), encoder, 1080, 1920, (30, 1)),
            encoder.arguments()
        );
    }
}

#[test]
fn codec_profiles_and_bitrate_controls_are_explicit() {
    let options = ExportOptions {
        codec: Codec::Hevc422,
        bitrate_kbps: Some(24000),
        bitrate_mode: BitrateMode::Cbr,
        ..Default::default()
    };
    let gpu = arguments(options, Encoder::Nvenc, 1920, 1080, (30, 1));
    assert!(gpu.windows(2).any(|pair| pair == ["-c:v", "hevc_nvenc"]));
    assert!(gpu.windows(2).any(|pair| pair == ["-profile:v", "rext"]));
    assert!(gpu.windows(2).any(|pair| pair == ["-rc", "cbr"]));
    assert!(gpu.windows(2).any(|pair| pair == ["-b:v", "24000k"]));
    let cpu = arguments(options, Encoder::Cpu, 1920, 1080, (30, 1));
    assert!(cpu.windows(2).any(|pair| pair == ["-c:v", "libx265"]));
    assert!(cpu
        .windows(2)
        .any(|pair| pair == ["-profile:v", "main422-10"]));
    assert_eq!(Codec::Hevc422.pixel_format(Encoder::Nvenc), "p210le");
}

#[test]
fn real_local_codec_capabilities_require_a_valid_encoded_frame() {
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg exigido");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = crate::render::scratch::Scratch::new(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-export-codecs"),
    )
    .unwrap();
    let control = ProcessControl::default();
    let capabilities = capabilities(&ffmpeg, &scratch.path, &control).unwrap();
    let evidence = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.tooling/test-output/editor-export-capabilities-2026-10-28.json");
    std::fs::write(evidence, serde_json::to_vec_pretty(&capabilities).unwrap()).unwrap();
    assert_eq!(capabilities.len(), 6);
    assert!(
        capabilities
            .iter()
            .find(|capability| capability.codec == Codec::H264)
            .unwrap()
            .supported
    );
    assert!(
        capabilities
            .iter()
            .find(|capability| capability.codec == Codec::Rle)
            .unwrap()
            .supported
    );
    for capability in capabilities {
        if !capability.supported {
            assert!(capability.reason.is_some());
        }
    }
}

#[test]
fn cancelled_capability_probe_does_not_start_a_process() {
    let control = ProcessControl::default();
    control.cancel();
    assert!(capabilities(
        Path::new("missing-ffmpeg"),
        Path::new("missing-directory"),
        &control
    )
    .is_err());
}

#[test]
fn explicit_profiles_have_real_rates_and_distinct_output_containers() {
    let options = ExportOptions {
        resolution: Resolution::Hd1080,
        frame_rate: FrameRate::Fps30,
        ..Default::default()
    };
    assert_eq!(options.bitrate(1920, 1080, (30, 1)), Some(9331));
    assert!(arguments(options, Encoder::Cpu, 1920, 1080, (30, 1))
        .windows(2)
        .any(|pair| pair == ["-b:v", "9331k"]));
    assert_eq!(
        ExportOptions {
            codec: Codec::Rle,
            format: Format::Mov,
            ..Default::default()
        }
        .extension(),
        "mov"
    );
}
