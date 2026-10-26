use super::{
    ass,
    encoder::{self, Encoder},
    scratch::Scratch,
    settings::RenderSettings,
};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(test)]
pub fn arguments(
    source: &Path,
    destination: &Path,
    settings: &RenderSettings,
    duration: f64,
    has_audio: bool,
) -> Result<Vec<std::ffi::OsString>, String> {
    let segments = settings.composition_windows(duration)?;
    let (start, end) = match segments.as_slice() {
        [only] => (only.source_start, only.source_end),
        _ => return Err("argumentos de um único segmento exigem plano único".into()),
    };
    window_arguments(
        source,
        destination,
        settings,
        start,
        end,
        has_audio,
        Encoder::Cpu,
        "captions.ass",
    )
}
/// Argumentos de UMA janela (segmento) da composição. Legendas em arquivo
/// próprio por janela: `ass::build` já re-basa as cue para o início da
/// janela — na concatenação, o tempo local do segmento == tempo de saída.
#[allow(clippy::too_many_arguments)]
pub(super) fn window_arguments(
    source: &Path,
    destination: &Path,
    settings: &RenderSettings,
    start: f64,
    end: f64,
    has_audio: bool,
    encoder: Encoder,
    captions: &str,
) -> Result<Vec<std::ffi::OsString>, String> {
    if !start.is_finite() || !end.is_finite() || end - start < 0.05 {
        return Err("Revise o intervalo e a duração do corte e tente novamente.".into());
    }
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
    let effects = settings
        .effects_filter()
        .map(|filter| format!("{filter},"))
        .unwrap_or_default();
    let filter = format!(
        "{},{}ass=filename={captions}:fontsdir=fonts",
        settings.geometry_at(start + (end - start) / 2.0)?,
        effects
    );
    args.extend(
        [
            "-t",
            &(end - start).to_string(),
            "-map",
            "0:v:0",
            "-vf",
            &filter,
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "4",
        ]
        .iter()
        .map(std::ffi::OsString::from),
    );
    args.extend(encoder.arguments().iter().map(std::ffi::OsString::from));
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
    let windows = settings.composition_windows(duration)?;
    let total: f64 = windows.iter().map(|w| w.duration()).sum();
    if total < 0.05 {
        return Err("Revise o intervalo e a duração do corte e tente novamente.".into());
    }
    let scratch = Scratch::new(base)?;
    super::fonts::prepare(&scratch.path)?;
    let output = scratch.path.join("output.part.mp4");
    let tools = crate::media_analyze::detect_fftools()
        .ok_or("FFmpeg não encontrado. Repare a instalação e tente novamente.")?;
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let selected = encoder::detect(&ffmpeg, &scratch.path, control)?;
    let single = windows.len() == 1;
    // Renderiza TODAS as janelas com o MESMO codificador (parâmetros idênticos
    // são pré-condição do concat sem recodificação) e concatena com demuxer.
    let mut render_all = |selected: Encoder| -> Result<(), String> {
        let mut rendered: Vec<std::ffi::OsString> = Vec::new();
        let mut done = 0.0f64;
        for (index, window) in windows.iter().enumerate() {
            let captions = if single {
                std::fs::write(
                    scratch.path.join("captions.ass"),
                    ass::build(segments, settings, window.source_start, window.source_end)?,
                )
                .map_err(|e| e.to_string())?;
                "captions.ass".to_string()
            } else {
                let name = format!("captions_{index}.ass");
                std::fs::write(
                    scratch.path.join(&name),
                    ass::build(segments, settings, window.source_start, window.source_end)?,
                )
                .map_err(|e| e.to_string())?;
                name
            };
            let destination = if single {
                output.clone()
            } else {
                scratch.path.join(format!("seg_{index}.mp4"))
            };
            let mut command = Command::new(&ffmpeg);
            command.current_dir(&scratch.path).args(window_arguments(
                source,
                &destination,
                settings,
                window.source_start,
                window.source_end,
                has_audio,
                selected,
                &captions,
            )?);
            control.run_with_output(
                &mut command,
                &scratch.path.join(if selected == Encoder::Nvenc {
                    "render-nvenc.log"
                } else {
                    "render-cpu.log"
                }),
                |line| {
                    if let Some(us) = line
                        .strip_prefix("out_time_us=")
                        .and_then(|v| v.parse::<f64>().ok())
                    {
                        if us.is_finite() {
                            progress(
                                ((done + us / 1_000_000.0) / total * 95.0).clamp(0.0, 95.0) as u8
                            );
                        }
                    }
                },
            )?;
            rendered.push(destination.into());
            done += window.duration();
        }
        if !single {
            // concat demuxer com -c copy: janelas codificadas com os mesmos
            // parâmetros (codificador, filtros, dimensões, áudio) — sem
            // recodificação e sem alteração da mídia original.
            let mut list = String::new();
            for path in &rendered {
                let name = path
                    .to_str()
                    .ok_or("caminho de segmento inválido")?
                    .replace('\\', "/");
                list.push_str(&format!("file '{name}'\n"));
            }
            std::fs::write(scratch.path.join("concat.txt"), list).map_err(|e| e.to_string())?;
            let mut command = Command::new(&ffmpeg);
            command
                .current_dir(&scratch.path)
                .args([
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    "concat.txt",
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                ])
                .arg(&output);
            control.run_with_output(
                &mut command,
                &scratch.path.join("render-concat.log"),
                |_| {},
            )?;
        }
        Ok(())
    };
    let mut actual = selected;
    if let Err(error) = render_all(selected) {
        control.check()?;
        if selected == Encoder::Cpu {
            return Err(error);
        }
        actual = Encoder::Cpu;
        render_all(Encoder::Cpu)?;
    }
    std::fs::write(
        scratch.path.join("encoder.txt"),
        if actual == Encoder::Nvenc {
            "h264_nvenc"
        } else {
            "libx264"
        },
    )
    .map_err(|e| e.to_string())?;
    control.check()?;
    let analysis = crate::media_analyze::analyze(&tools, &output)?;
    let (width, height) = settings.dimensions()?;
    if analysis.width != width
        || analysis.height != height
        || ((analysis.duration_ms as f64 / 1000.0) - total).abs() > 0.3
        || analysis.has_audio != has_audio
    {
        return Err("O vídeo exportado não passou na verificação. Tente novamente.".into());
    }
    Ok((scratch, output))
}
