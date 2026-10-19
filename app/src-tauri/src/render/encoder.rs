use crate::transcription::process::ProcessControl;
use std::{path::Path, process::Command};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Encoder {
    Cpu,
    Nvenc,
}
impl Encoder {
    pub fn arguments(self) -> Vec<&'static str> {
        match self {
            Self::Cpu => vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"],
            Self::Nvenc => vec![
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p5",
                "-cq",
                "20",
                "-b:v",
                "0",
            ],
        }
    }
}
pub fn detect(ffmpeg: &Path, scratch: &Path, control: &ProcessControl) -> Result<Encoder, String> {
    let mut probe = Command::new(ffmpeg);
    probe.args([
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=s=640x360:r=30",
        "-frames:v",
        "1",
        "-c:v",
        "h264_nvenc",
        "-f",
        "null",
        "-",
    ]);
    match control.run(probe, &scratch.join("nvenc-probe.log")) {
        Ok(()) => Ok(Encoder::Nvenc),
        Err(_) => {
            control.check()?;
            Ok(Encoder::Cpu)
        }
    }
}
