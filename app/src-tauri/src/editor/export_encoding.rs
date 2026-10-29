mod probe;

use super::export_options::{BitrateMode, Codec, ExportOptions, Quality};
use crate::{render::encoder::Encoder, transcription::process::ProcessControl};
use serde::Serialize;
use std::{path::Path, process::Command};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecCapability {
    pub codec: Codec,
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

pub fn capabilities(
    ffmpeg: &Path,
    directory: &Path,
    control: &ProcessControl,
) -> Result<Vec<CodecCapability>, String> {
    let mut result = Vec::new();
    for codec in [
        Codec::H264,
        Codec::Hevc,
        Codec::HevcAlpha,
        Codec::Hevc422,
        Codec::Av1,
        Codec::Rle,
    ] {
        let support = probe::support(ffmpeg, directory, control, codec)?;
        result.push(CodecCapability {
            codec,
            supported: support.gpu || support.cpu,
            reason: support.reason,
        });
    }
    Ok(result)
}

pub(super) fn select(
    ffmpeg: &Path,
    directory: &Path,
    control: &ProcessControl,
    options: ExportOptions,
) -> Result<Encoder, String> {
    options.validate()?;
    let support = probe::support(ffmpeg, directory, control, options.codec)?;
    if support.gpu {
        Ok(Encoder::Nvenc)
    } else if support.cpu {
        Ok(Encoder::Cpu)
    } else {
        Err(support
            .reason
            .unwrap_or_else(|| "O codec escolhido não está disponível nesta instalação.".into()))
    }
}

pub(super) fn cpu_available(
    ffmpeg: &Path,
    directory: &Path,
    control: &ProcessControl,
    codec: Codec,
) -> Result<(), String> {
    if probe::support(ffmpeg, directory, control, codec)?.cpu {
        Ok(())
    } else {
        Err("O encoder por CPU para o mesmo codec não está disponível. A exportação não foi alterada para outro codec.".into())
    }
}

pub(super) fn name(codec: Codec, encoder: Encoder) -> &'static str {
    match (codec, encoder) {
        (Codec::H264, Encoder::Nvenc) => "h264_nvenc",
        (Codec::H264, Encoder::Cpu) => "libx264",
        (Codec::Hevc | Codec::Hevc422, Encoder::Nvenc) => "hevc_nvenc",
        (Codec::Hevc | Codec::Hevc422 | Codec::HevcAlpha, Encoder::Cpu) => "libx265",
        (Codec::Av1, Encoder::Nvenc) => "av1_nvenc",
        (Codec::Av1, Encoder::Cpu) => "libaom-av1",
        (Codec::Rle, _) => "qtrle",
        (Codec::HevcAlpha, Encoder::Nvenc) => "hevc_nvenc",
    }
}

pub(super) fn arguments(
    options: ExportOptions,
    encoder: Encoder,
    width: u32,
    height: u32,
    rate: (u32, u32),
) -> Vec<String> {
    let bitrate = options.bitrate(width, height, rate);
    if options.codec == Codec::H264 && bitrate.is_none() {
        return options
            .encoder_arguments(encoder)
            .into_iter()
            .map(str::to_owned)
            .collect();
    }
    let mut args: Vec<String> = vec!["-c:v".into(), name(options.codec, encoder).into()];
    if options.codec == Codec::Rle {
        return args;
    }
    args.extend([
        "-preset".into(),
        if encoder == Encoder::Nvenc {
            "p5"
        } else if options.codec == Codec::Av1 {
            "6"
        } else {
            "veryfast"
        }
        .into(),
    ]);
    if options.codec == Codec::Av1 && encoder == Encoder::Cpu {
        args.truncate(2);
        args.extend(["-cpu-used".into(), "6".into(), "-row-mt".into(), "1".into()]);
    }
    if options.codec == Codec::Hevc422 {
        args.extend([
            "-profile:v".into(),
            if encoder == Encoder::Nvenc {
                "rext"
            } else {
                "main422-10"
            }
            .into(),
        ]);
    }
    if encoder == Encoder::Cpu
        && matches!(
            options.codec,
            Codec::Hevc | Codec::HevcAlpha | Codec::Hevc422
        )
    {
        args.extend([
            "-x265-params".into(),
            "pools=4:frame-threads=2:log-level=error".into(),
        ]);
    }
    if let Some(kbps) = bitrate {
        let value = format!("{kbps}k");
        let buffer = format!("{}k", u64::from(kbps) * 2);
        if encoder == Encoder::Nvenc {
            args.extend([
                "-rc".into(),
                if options.bitrate_mode == BitrateMode::Cbr {
                    "cbr"
                } else {
                    "vbr"
                }
                .into(),
            ]);
        }
        args.extend([
            "-b:v".into(),
            value.clone(),
            "-maxrate".into(),
            if options.bitrate_mode == BitrateMode::Cbr {
                value.clone()
            } else {
                format!("{}k", u64::from(kbps) * 3 / 2)
            },
            "-bufsize".into(),
            buffer,
        ]);
        if options.bitrate_mode == BitrateMode::Cbr {
            args.extend(["-minrate".into(), value]);
            if encoder == Encoder::Nvenc {
                args.extend(["-cbr_padding".into(), "1".into()]);
            } else if options.codec == Codec::H264 {
                args.extend(["-x264-params".into(), "nal-hrd=cbr:force-cfr=1".into()]);
            } else if matches!(
                options.codec,
                Codec::Hevc | Codec::Hevc422 | Codec::HevcAlpha
            ) {
                if let Some(index) = args.iter().position(|arg| arg == "-x265-params") {
                    args[index + 1].push_str(":strict-cbr=1:hrd=1");
                }
            }
        }
    } else {
        let value = match options.quality {
            Quality::High => "20",
            Quality::Balanced => "23",
            Quality::Smaller => "27",
            Quality::Custom => "20",
        };
        args.extend([
            if encoder == Encoder::Nvenc {
                "-cq"
            } else {
                "-crf"
            }
            .into(),
            value.into(),
        ]);
        if encoder == Encoder::Nvenc || options.codec == Codec::Av1 {
            args.extend(["-b:v".into(), "0".into()]);
        }
    }
    args
}

pub(super) fn validate_output(
    ffprobe: &Path,
    output: &Path,
    directory: &Path,
    options: ExportOptions,
    frames: u64,
    control: &ProcessControl,
) -> Result<crate::media_analyze::MediaAnalysis, String> {
    let path = directory.join("final-video-profile.json");
    let mut command = Command::new(ffprobe);
    command.args(["-v","error","-show_entries","stream=codec_type,codec_name,pix_fmt,nb_frames,width,height,avg_frame_rate,bit_rate:format=duration","-of","json"]).arg(output);
    control.run_to_file_with_timeout(
        &mut command,
        &directory.join("final-video-profile.log"),
        &path,
        std::time::Duration::from_secs(15),
    )?;
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let videos: Vec<_> = value
        .get("streams")
        .and_then(|streams| streams.as_array())
        .ok_or("O vídeo exportado não contém streams.")?
        .iter()
        .filter(|stream| stream.get("codec_type").and_then(|value| value.as_str()) == Some("video"))
        .collect();
    let [stream] = videos.as_slice() else {
        return Err("O vídeo exportado não contém um stream válido.".into());
    };
    let count = stream
        .get("nb_frames")
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<u64>().ok());
    let pixel = stream
        .get("pix_fmt")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if stream.get("codec_name").and_then(|value| value.as_str())
        != Some(options.codec.video_codec())
        || count != Some(frames)
        || options.codec == Codec::Hevc422 && !pixel.starts_with("yuv422p")
        || options.codec.alpha()
            && !(pixel == "argb"
                || pixel == "rgba"
                || pixel == "bgra"
                || pixel == "abgr"
                || pixel.starts_with("yuva")
                || pixel.starts_with("gbrap"))
    {
        return Err("O arquivo final não preservou o codec, o canal alpha, a amostragem ou a contagem de frames solicitados.".into());
    }
    control.check()?;
    crate::media_analyze::parse_probe_output(&bytes)
        .ok_or("Não foi possível validar os metadados do vídeo concluído.".into())
}

#[cfg(test)]
#[path = "export_encoding_tests.rs"]
mod tests;
