use super::{
    checkpoints::{self, Cache, Chunk},
    chunk_text, parser,
    process::ProcessControl,
    tools::EngineTools,
    types::{Segment, Transcript},
};
use std::{path::Path, process::Command};

struct Scratch(std::path::PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub struct Output {
    pub transcript: Transcript,
    pub cache: Cache,
}

fn transcribe(
    media: &Path,
    scratch: &Path,
    chunk: &Chunk,
    tools: &EngineTools,
    control: &ProcessControl,
    progress: impl Fn(u8),
) -> Result<Vec<Segment>, String> {
    let wav = scratch.join("audio.wav");
    let mut extract = Command::new(&tools.ffmpeg);
    extract
        .args([
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-ss",
            &chunk.audio_start.to_string(),
            "-i",
        ])
        .arg(media)
        .args([
            "-t",
            &(chunk.audio_end - chunk.audio_start).to_string(),
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
    control.run(extract, &scratch.join("extract.log"))?;
    let output = scratch.join("result");
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
        .to_string();
    let mut command = Command::new(&tools.whisper);
    command
        .arg("-m")
        .arg(&tools.model)
        .arg("-f")
        .arg(&wav)
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
        command.arg("-ng");
    }
    control.run_with_output(&mut command, &scratch.join("whisper.log"), |line| {
        if let Some(value) = super::progress::whisper_percent(line) {
            progress(value);
        }
    })?;
    control.check()?;
    let json = std::fs::read_to_string(output.with_extension("json"))
        .map_err(|e| format!("o transcritor não gerou um resultado legível: {e}"))?;
    parser::parse(&json, chunk.audio_end - chunk.audio_start)
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
) -> Result<Output, String> {
    control.check()?;
    parser::validate(&[], duration)?;
    let cache = Cache::open(base, media, media_id, duration, &tools)?;
    let scratch = Scratch(
        base.join("cutnicepro/transcription-jobs")
            .join(uuid::Uuid::new_v4().to_string()),
    );
    std::fs::create_dir_all(&scratch.0)
        .map_err(|e| format!("não foi possível preparar áudio temporário: {e}"))?;
    let mut all = Vec::new();
    for (index, chunk) in checkpoints::chunks(duration).iter().enumerate() {
        control.check()?;
        let segments = match cache.load(index, chunk) {
            Some(segments) => segments,
            None => {
                stage("transcribing");
                let directory = scratch.0.join(index.to_string());
                std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
                let value = transcribe(media, &directory, chunk, &tools, control, |percent| {
                    progress(
                        ((chunk.start
                            + (chunk.end - chunk.start) * f64::from(percent.min(90)) / 100.0)
                            / duration
                            * 95.0) as u8,
                    );
                })?;
                cache.save(index, chunk, &value)?;
                value
            }
        };
        chunk_text::append(&mut all, segments, chunk, index);
        progress((chunk.end / duration * 95.0) as u8);
    }
    control.check()?;
    parser::validate(&all, duration)?;
    stage("saving");
    Ok(Output {
        transcript: Transcript {
            version: 1,
            media_id: media_id.into(),
            language: "pt".into(),
            model: tools.profile.model().into(),
            segments: all,
        },
        cache,
    })
}
