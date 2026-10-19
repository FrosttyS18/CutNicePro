use super::{parser, process::ProcessControl, tools::EngineTools, types::Transcript};
use std::{path::Path, process::Command};

struct Scratch(std::path::PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub fn run(
    base: &Path,
    media: &Path,
    media_id: &str,
    duration: f64,
    tools: EngineTools,
    control: &ProcessControl,
    stage: impl Fn(&str),
    progress: impl Fn(u8),
) -> Result<Transcript, String> {
    control.check()?;
    let scratch = Scratch(
        base.join("cutnicepro/transcription-jobs")
            .join(uuid::Uuid::new_v4().to_string()),
    );
    std::fs::create_dir_all(&scratch.0)
        .map_err(|e| format!("não foi possível preparar áudio temporário: {e}"))?;
    let wav = scratch.0.join("audio.wav");
    let mut extract = Command::new(tools.ffmpeg);
    extract
        .args(["-nostdin", "-v", "error", "-y", "-i"])
        .arg(media)
        .args([
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(&wav);
    control.run(extract, &scratch.0.join("extract.log"))?;
    stage("transcribing");
    let output = scratch.0.join("result");
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
        .to_string();
    let mut transcribe = Command::new(tools.whisper);
    transcribe
        .arg("-m")
        .arg(tools.model)
        .arg("-f")
        .arg(wav)
        .args([
            "-l",
            "pt",
            "-nfa",
            "-dtw",
            tools.profile.alignment(),
            "-t",
            &threads,
            "-pp",
            "-ojf",
            "-bs",
            "5",
            "-bo",
            "5",
            "-mc",
            "0",
            "-sns",
            "-of",
        ])
        .arg(&output);
    if !tools.gpu {
        transcribe.arg("-ng");
    }
    control.run_with_output(&mut transcribe, &scratch.0.join("whisper.log"), |line| {
        if let Some(value) = super::progress::whisper_percent(line) {
            progress(value);
        }
    })?;
    control.check()?;
    let json = std::fs::read_to_string(output.with_extension("json"))
        .map_err(|e| format!("o transcritor não gerou um resultado legível: {e}"))?;
    let segments = parser::parse(&json, duration)?;
    stage("saving");
    Ok(Transcript {
        version: 1,
        media_id: media_id.into(),
        language: "pt".into(),
        model: tools.profile.model().into(),
        segments,
    })
}
