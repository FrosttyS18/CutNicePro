use crate::render::encoder::Encoder;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportOptions {
    #[serde(default)]
    pub resolution: Resolution,
    #[serde(default)]
    pub quality: Quality,
    #[serde(default)]
    pub codec: Codec,
    #[serde(default)]
    pub format: Format,
    #[serde(default)]
    pub frame_rate: FrameRate,
    #[serde(default)]
    pub bitrate_kbps: Option<u32>,
    #[serde(default)]
    pub bitrate_mode: BitrateMode,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Resolution {
    #[default]
    Original,
    Hd480,
    Hd720,
    Hd1080,
    Qhd1440,
    Uhd2160,
    Uhd4320,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    #[default]
    High,
    Balanced,
    Smaller,
    Custom,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum Codec {
    #[default]
    H264,
    Hevc,
    HevcAlpha,
    Hevc422,
    Av1,
    Rle,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Format {
    #[default]
    Mp4,
    Mov,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FrameRate {
    #[default]
    Original,
    Fps24,
    Fps25,
    Fps2997,
    Fps30,
    Fps50,
    Fps5994,
    Fps60,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BitrateMode {
    #[default]
    Vbr,
    Cbr,
}

impl Codec {
    pub fn alpha(self) -> bool {
        matches!(self, Self::Rle | Self::HevcAlpha)
    }

    pub fn video_codec(self) -> &'static str {
        match self {
            Self::H264 => "h264",
            Self::Hevc | Self::HevcAlpha | Self::Hevc422 => "hevc",
            Self::Av1 => "av1",
            Self::Rle => "qtrle",
        }
    }

    pub fn pixel_format(self, encoder: Encoder) -> &'static str {
        match self {
            Self::Hevc422 if encoder == Encoder::Nvenc => "p210le",
            Self::Hevc422 => "yuv422p10le",
            Self::HevcAlpha => "yuva420p",
            Self::Rle => "argb",
            _ => "yuv420p",
        }
    }
}

impl ExportOptions {
    pub fn validate(self) -> Result<(), String> {
        if self.codec.alpha() && self.format != Format::Mov {
            return Err("RLE e vídeo com alpha exigem o formato MOV.".into());
        }
        if self
            .bitrate_kbps
            .is_some_and(|rate| !(100..=500_000).contains(&rate))
            || self.quality == Quality::Custom && self.bitrate_kbps.is_none()
        {
            return Err("Informe uma taxa entre 100 e 500000 kbps.".into());
        }
        if self.codec == Codec::Rle
            && (self.quality == Quality::Custom
                || self.bitrate_kbps.is_some()
                || self.bitrate_mode != BitrateMode::Vbr)
        {
            return Err("RLE é sem perdas e não utiliza controle de bitrate.".into());
        }
        Ok(())
    }

    pub fn extension(self) -> &'static str {
        match self.format {
            Format::Mp4 => "mp4",
            Format::Mov => "mov",
        }
    }

    pub fn dimensions(self, width: u32, height: u32) -> (u32, u32) {
        let edge = match self.resolution {
            Resolution::Original => return (width, height),
            Resolution::Hd480 => 480,
            Resolution::Hd720 => 720,
            Resolution::Hd1080 => 1080,
            Resolution::Qhd1440 => 1440,
            Resolution::Uhd2160 => 2160,
            Resolution::Uhd4320 => 4320,
        };
        let factor = f64::from(edge) / f64::from(width.min(height).max(1));
        let even = |value: u32| ((f64::from(value) * factor / 2.0).round() as u32 * 2).max(2);
        (even(width), even(height))
    }

    pub fn output_rate(self, original: &super::types::FrameRate) -> (u32, u32) {
        match self.frame_rate {
            FrameRate::Original => (original.numerator, original.denominator),
            FrameRate::Fps24 => (24, 1),
            FrameRate::Fps25 => (25, 1),
            FrameRate::Fps2997 => (30_000, 1001),
            FrameRate::Fps30 => (30, 1),
            FrameRate::Fps50 => (50, 1),
            FrameRate::Fps5994 => (60_000, 1001),
            FrameRate::Fps60 => (60, 1),
        }
    }

    pub fn output_frame(self, boundary: u64, original: &super::types::FrameRate) -> u64 {
        let (numerator, denominator) = self.output_rate(original);
        let value = u128::from(boundary) * u128::from(original.denominator) * u128::from(numerator);
        let divisor = u128::from(original.numerator) * u128::from(denominator);
        ((value + divisor / 2) / divisor.max(1)).min(u128::from(u64::MAX)) as u64
    }

    pub(super) fn window_frames(
        self,
        window: &super::render_plan::Window,
        original: &super::types::FrameRate,
    ) -> u64 {
        self.output_frame(window.end, original)
            .saturating_sub(self.output_frame(window.start, original))
    }

    pub(super) fn timing_filter(
        self,
        window: &super::render_plan::Window,
        original: &super::types::FrameRate,
    ) -> String {
        let rate = self.output_rate(original);
        if u64::from(rate.0) * u64::from(original.denominator)
            == u64::from(rate.1) * u64::from(original.numerator)
        {
            return String::new();
        }
        let source_start =
            window.start as f64 * f64::from(original.denominator) / f64::from(original.numerator);
        let target_start = self.output_frame(window.start, original) as f64 * f64::from(rate.1)
            / f64::from(rate.0);
        format!("settb=AVTB,setpts=PTS+({})/TB,tpad=stop_mode=clone:stop_duration={},fps={}/{}:start_time=0:round=near,trim=end_frame={},setpts=PTS-STARTPTS,", source_start - target_start, f64::from(rate.1) / f64::from(rate.0), rate.0, rate.1, self.window_frames(window, original))
    }

    pub fn bitrate(self, width: u32, height: u32, rate: (u32, u32)) -> Option<u32> {
        if self.codec == Codec::Rle {
            return None;
        }
        if let Some(kbps) = self.bitrate_kbps {
            return Some(kbps);
        }
        if self.resolution == Resolution::Original
            && self.frame_rate == FrameRate::Original
            && self.codec == Codec::H264
            && self.bitrate_mode == BitrateMode::Vbr
        {
            return None;
        }
        let bpp = match self.quality {
            Quality::High => 0.15,
            Quality::Balanced => 0.10,
            Quality::Smaller => 0.07,
            Quality::Custom => return None,
        };
        let factor = match self.codec {
            Codec::Hevc | Codec::HevcAlpha => 0.65,
            Codec::Av1 => 0.55,
            Codec::Hevc422 => 1.25,
            _ => 1.0,
        };
        Some(
            (f64::from(width) * f64::from(height) * f64::from(rate.0) / f64::from(rate.1.max(1))
                * bpp
                * factor
                / 1000.0)
                .round()
                .clamp(100.0, 500_000.0) as u32,
        )
    }

    pub fn encoder_arguments(self, encoder: Encoder) -> Vec<&'static str> {
        let mut arguments = encoder.arguments();
        let value = match self.quality {
            Quality::High => "20",
            Quality::Balanced => "23",
            Quality::Smaller => "27",
            Quality::Custom => "20",
        };
        let flag = if encoder == Encoder::Nvenc {
            "-cq"
        } else {
            "-crf"
        };
        if let Some(index) = arguments.iter().position(|argument| *argument == flag) {
            arguments[index + 1] = value;
        }
        arguments
    }

    pub fn output_filter(self, current: &str, width: u32, height: u32, hardware: bool) -> String {
        self.output_filter_to(current, width, height, hardware, "out")
    }

    pub(super) fn output_filter_to(
        self,
        current: &str,
        width: u32,
        height: u32,
        hardware: bool,
        output: &str,
    ) -> String {
        let (target_width, target_height) = self.dimensions(width, height);
        let pixel_format = self.codec.pixel_format(Encoder::Cpu);
        if (target_width, target_height) == (width, height) {
            return if hardware {
                String::new()
            } else {
                format!("[{current}]format={pixel_format}[{output}]")
            };
        }
        if hardware {
            format!("[{current}]scale_cuda={target_width}:{target_height}:format=yuv420p:interp_algo=bicubic[{output}]")
        } else {
            format!(
                "[{current}]scale={target_width}:{target_height},format={pixel_format}[{output}]"
            )
        }
    }
}

#[cfg(test)]
#[path = "export_options_tests.rs"]
mod tests;
