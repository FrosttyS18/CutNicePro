use super::{arguments, Codec, ExportOptions};
use crate::{
    media_source::{SourceGuard, SourceStamp},
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

#[derive(Clone)]
pub(super) struct Support {
    pub gpu: bool,
    pub cpu: bool,
    pub reason: Option<String>,
}

struct Entry {
    stamp: SourceStamp,
    path: PathBuf,
    codec: Codec,
    checked: Instant,
    support: Support,
}

fn cache() -> &'static Mutex<Vec<Entry>> {
    static CACHE: OnceLock<Mutex<Vec<Entry>>> = OnceLock::new();
    CACHE.get_or_init(Mutex::default)
}

pub(super) fn support(
    ffmpeg: &Path,
    directory: &Path,
    control: &ProcessControl,
    codec: Codec,
) -> Result<Support, String> {
    control.check()?;
    let source = SourceGuard::open(ffmpeg).map_err(|error| error.message())?;
    if let Some(entry) = cache()
        .lock()
        .map_err(|_| "Consulta de codecs indisponível.")?
        .iter()
        .find(|entry| {
            entry.path == source.path()
                && entry.stamp == *source.stamp()
                && entry.codec == codec
                && entry.checked.elapsed() < Duration::from_secs(300)
        })
    {
        control.check()?;
        return Ok(entry.support.clone());
    }
    let scratch = Scratch::new(directory)?;
    let check = |encoder| -> Result<bool, String> {
        let result = probe(ffmpeg, &scratch.path, control, codec, encoder);
        match result {
            Ok(()) => Ok(true),
            Err(error) => {
                control.check()?;
                eprintln!("[editor] Probe {codec:?}/{encoder:?}: {error}");
                Ok(false)
            }
        }
    };
    let gpu = if codec.alpha() {
        false
    } else {
        check(Encoder::Nvenc)?
    };
    let cpu = check(Encoder::Cpu)?;
    source.recheck().map_err(|error| error.message())?;
    let support = Support {
        gpu,
        cpu,
        reason: if gpu || cpu {
            None
        } else {
            Some(
                if codec.alpha() {
                    "A transparência não foi preservada pelo codificador disponível."
                } else {
                    "Não disponível neste computador."
                }
                .into(),
            )
        },
    };
    control.check()?;
    let mut entries = cache()
        .lock()
        .map_err(|_| "Consulta de codecs indisponível.")?;
    entries.retain(|entry| entry.path != source.path() || entry.codec != codec);
    if entries.len() >= 24 {
        entries.remove(0);
    }
    entries.push(Entry {
        stamp: source.stamp().clone(),
        path: source.path().into(),
        codec,
        checked: Instant::now(),
        support: support.clone(),
    });
    Ok(support)
}

fn probe(
    ffmpeg: &Path,
    directory: &Path,
    control: &ProcessControl,
    codec: Codec,
    encoder: Encoder,
) -> Result<(), String> {
    let options = ExportOptions {
        codec,
        format: if codec.alpha() {
            super::super::export_options::Format::Mov
        } else {
            Default::default()
        },
        ..Default::default()
    };
    let output = directory.join(format!("{codec:?}-{encoder:?}.{}", options.extension()));
    let mut command = Command::new(ffmpeg);
    command
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red@0.5:s=320x192:r=30,format=rgba",
            "-vf",
        ])
        .arg(format!("format={}", codec.pixel_format(encoder)))
        .args(["-frames:v", "1", "-an", "-threads", "4"])
        .args(arguments(options, encoder, 320, 192, (30, 1)));
    if matches!(codec, Codec::Hevc | Codec::Hevc422 | Codec::HevcAlpha) {
        command.args(["-tag:v", "hvc1"]);
    }
    command.arg(&output);
    control.run_with_timeout(
        command,
        &directory.join(format!("{codec:?}-{encoder:?}.log")),
        Duration::from_secs(10),
    )?;
    let ffprobe = ffmpeg.with_file_name(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });
    super::validate_output(&ffprobe, &output, directory, options, 1, control)?;
    if codec.alpha() {
        let alpha = directory.join("alpha.gray");
        let mut command = Command::new(ffmpeg);
        command
            .args(["-nostdin", "-v", "error", "-y", "-i"])
            .arg(output)
            .args([
                "-frames:v",
                "1",
                "-vf",
                "alphaextract",
                "-pix_fmt",
                "gray",
                "-f",
                "rawvideo",
            ])
            .arg(&alpha);
        control.run_with_timeout(
            command,
            &directory.join("alpha.log"),
            Duration::from_secs(10),
        )?;
        let bytes = std::fs::read(alpha).map_err(|error| error.to_string())?;
        if bytes.len() != 320 * 192 || bytes.iter().any(|alpha| !(120..=136).contains(alpha)) {
            return Err(
                "O canal alpha não sobreviveu à codificação e decodificação locais.".into(),
            );
        }
    }
    Ok(())
}
