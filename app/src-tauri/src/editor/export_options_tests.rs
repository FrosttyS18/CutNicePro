use super::*;

#[test]
fn explicit_export_profile_is_accepted_and_roundtrips_without_losing_fields() {
    let value = serde_json::json!({"resolution":"uhd2160","quality":"custom","codec":"hevc","format":"mov","frameRate":"fps2997","bitrateKbps":24000,"bitrateMode":"cbr"});
    let parsed = serde_json::from_value::<ExportOptions>(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    assert!(parsed.validate().is_ok());
}

#[test]
fn legacy_default_preserves_approved_encoder_and_filter() {
    let options: ExportOptions =
        serde_json::from_str(r#"{"resolution":"original","quality":"high"}"#).unwrap();
    assert_eq!(options, ExportOptions::default());
    assert_eq!(
        options.encoder_arguments(Encoder::Nvenc),
        Encoder::Nvenc.arguments()
    );
    assert_eq!(
        options.encoder_arguments(Encoder::Cpu),
        Encoder::Cpu.arguments()
    );
    assert_eq!(
        options.output_filter("mix", 1080, 1920, false),
        "[mix]format=yuv420p[out]"
    );
    assert_eq!(options.bitrate(1080, 1920, (30, 1)), None);
}

#[test]
fn explicit_resolution_uses_nearest_even_pixels_and_upscales_when_chosen() {
    for (resolution, edge) in [
        (Resolution::Hd480, 480),
        (Resolution::Hd720, 720),
        (Resolution::Hd1080, 1080),
        (Resolution::Qhd1440, 1440),
        (Resolution::Uhd2160, 2160),
        (Resolution::Uhd4320, 4320),
    ] {
        let options = ExportOptions {
            resolution,
            ..Default::default()
        };
        let portrait = options.dimensions(360, 640);
        let landscape = options.dimensions(640, 360);
        assert_eq!(portrait.0, edge);
        assert_eq!(landscape.1, edge);
        assert_eq!(portrait, (landscape.1, landscape.0));
    }
    assert_eq!(
        ExportOptions {
            resolution: Resolution::Hd480,
            ..Default::default()
        }
        .dimensions(1920, 1080),
        (854, 480)
    );
}

#[test]
fn absolute_frame_boundaries_do_not_accumulate_rounding_drift() {
    let source = crate::editor::types::FrameRate {
        numerator: 30,
        denominator: 1,
    };
    for (frame_rate, total) in [
        (FrameRate::Fps24, 800),
        (FrameRate::Fps2997, 999),
        (FrameRate::Fps60, 2000),
    ] {
        let options = ExportOptions {
            frame_rate,
            ..Default::default()
        };
        let frames: u64 = (0..1000)
            .map(|start| {
                options.window_frames(
                    &crate::editor::render_plan::Window {
                        start,
                        end: start + 1,
                    },
                    &source,
                )
            })
            .sum();
        assert_eq!(frames, total);
        assert_eq!(options.output_frame(1000, &source), total);
    }
}

#[test]
fn invalid_container_and_bitrate_fail_before_rendering() {
    assert!(ExportOptions {
        codec: Codec::Rle,
        ..Default::default()
    }
    .validate()
    .is_err());
    assert!(ExportOptions {
        codec: Codec::Rle,
        format: Format::Mov,
        ..Default::default()
    }
    .validate()
    .is_ok());
    assert!(ExportOptions {
        quality: Quality::Custom,
        ..Default::default()
    }
    .validate()
    .is_err());
    for bitrate in [99, 500001] {
        assert!(ExportOptions {
            bitrate_kbps: Some(bitrate),
            ..Default::default()
        }
        .validate()
        .is_err());
    }
    assert!(serde_json::from_str::<ExportOptions>(r#"{"codec":"fake"}"#).is_err());
}
