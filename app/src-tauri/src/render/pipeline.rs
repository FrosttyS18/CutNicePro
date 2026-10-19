use super::{ass, scratch::Scratch, settings::RenderSettings};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub fn arguments(
    source: &Path,
    destination: &Path,
    settings: &RenderSettings,
    duration: f64,
    has_audio: bool,
) -> Result<Vec<std::ffi::OsString>, String> {
    let (start, end) = settings.validate(duration)?;
    let mut args: Vec<std::ffi::OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-threads",
        "4",
        "-ss",
        &start.to_string(),
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(source.into());
    let filter = format!(
        "{},ass=filename=captions.ass:fontsdir=fonts",
        settings.geometry()?
    );
    args.extend(
        [
            "-t",
            &(end - start).to_string(),
            "-map",
            "0:v:0",
            "-vf",
            &filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "4",
        ]
        .iter()
        .map(std::ffi::OsString::from),
    );
    if has_audio {
        args.extend(
            [
                "-map",
                "0:a:0",
                "-af",
                &format!(
                    "volume={}",
                    if settings.muted { 0.0 } else { settings.volume }
                ),
                "-c:a",
                "aac",
                "-b:a",
                "192k",
            ]
            .iter()
            .map(std::ffi::OsString::from),
        );
    } else {
        args.push("-an".into());
    }
    args.extend(
        [
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:2",
            "-nostats",
            "-f",
            "mp4",
        ]
        .iter()
        .map(std::ffi::OsString::from),
    );
    args.push(destination.into());
    Ok(args)
}

pub fn run(
    base: &Path,
    source: &Path,
    segments: &[Segment],
    settings: &RenderSettings,
    duration: f64,
    has_audio: bool,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<(Scratch, PathBuf), String> {
    let (start, end) = settings.validate(duration)?;
    let scratch = Scratch::new(base)?;
    std::fs::write(
        scratch.path.join("captions.ass"),
        ass::build(segments, settings, start, end)?,
    )
    .map_err(|e| e.to_string())?;
    let fonts = scratch.path.join("fonts");
    std::fs::create_dir_all(&fonts).map_err(|e| e.to_string())?;
    let assets: &[(&str, &[u8])] = &[
        (
            "Poppins-Regular.ttf",
            include_bytes!("../../resources/fonts/Poppins-Regular.ttf"),
        ),
        (
            "Poppins-SemiBold.ttf",
            include_bytes!("../../resources/fonts/Poppins-SemiBold.ttf"),
        ),
        (
            "Poppins-Bold.ttf",
            include_bytes!("../../resources/fonts/Poppins-Bold.ttf"),
        ),
        (
            "Poppins-Italic.ttf",
            include_bytes!("../../resources/fonts/Poppins-Italic.ttf"),
        ),
        (
            "Poppins-SemiBoldItalic.ttf",
            include_bytes!("../../resources/fonts/Poppins-SemiBoldItalic.ttf"),
        ),
        (
            "Poppins-BoldItalic.ttf",
            include_bytes!("../../resources/fonts/Poppins-BoldItalic.ttf"),
        ),
    ];
    for (name, bytes) in assets {
        std::fs::write(fonts.join(name), bytes).map_err(|e| e.to_string())?;
    }
    let output = scratch.path.join("output.part.mp4");
    let tools = crate::media_analyze::detect_fftools()
        .ok_or("FFmpeg não encontrado. Repare a instalação e tente novamente.")?;
    let mut command = Command::new(tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }));
    command
        .current_dir(&scratch.path)
        .args(arguments(source, &output, settings, duration, has_audio)?);
    control.run_with_output(&mut command, &scratch.path.join("render.log"), |line| {
        if let Some(us) = line
            .strip_prefix("out_time_us=")
            .and_then(|v| v.parse::<f64>().ok())
        {
            if us.is_finite() {
                progress((us / 1_000_000.0 / (end - start) * 95.0).clamp(0.0, 95.0) as u8);
            }
        }
    })?;
    control.check()?;
    let analysis = crate::media_analyze::analyze(&tools, &output)?;
    let (width, height) = settings.dimensions()?;
    if analysis.width != width
        || analysis.height != height
        || ((analysis.duration_ms as f64 / 1000.0) - (end - start)).abs() > 0.3
        || analysis.has_audio != has_audio
    {
        return Err("O vídeo exportado não passou na verificação. Tente novamente.".into());
    }
    Ok((scratch, output))
}
