use super::{render_audio, render_graph, render_plan, types::Composition};
use crate::{
    render::{
        encoder::{self, Encoder},
        scratch::Scratch,
    },
    transcription::process::ProcessControl,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
};

pub fn run(
    base: &Path,
    document: &Composition,
    sources: &HashMap<String, PathBuf>,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<(Scratch, PathBuf), String> {
    let windows = render_plan::windows(document)?;
    control.check()?;
    let scratch = Scratch::new(base)?;
    crate::render::fonts::prepare(&scratch.path)?;
    let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg não encontrado")?;
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let selected = encoder::detect(&exe, &scratch.path, control)?;
    let total = document.duration_frames() as f64;
    let mut render_all = |selected: Encoder| -> Result<(), String> {
        for (index, window) in windows.iter().enumerate() {
            control.check()?;
            let mut command = Command::new(&exe);
            command.current_dir(&scratch.path).args(render_graph::video(
                document,
                window,
                sources,
                &scratch.path,
                index,
                selected,
            )?);
            control.run_with_output(&mut command, &scratch.path.join("video.log"), |line| {
                if let Some(us) = line
                    .strip_prefix("out_time_us=")
                    .and_then(|value| value.parse::<f64>().ok())
                    .filter(|value| value.is_finite())
                {
                    let frames =
                        us / 1e6 * document.fps.numerator as f64 / document.fps.denominator as f64;
                    progress(
                        ((window.start as f64 + frames).min(window.end as f64) / total * 70.0)
                            .clamp(0.0, 70.0) as u8,
                    );
                }
            })?;
        }
        Ok(())
    };
    if let Err(error) = render_all(selected) {
        control.check()?;
        if selected == Encoder::Nvenc {
            render_all(Encoder::Cpu)?;
        } else {
            return Err(error);
        }
    }
    let list = windows
        .iter()
        .enumerate()
        .map(|(index, _)| format!("file 'part-{index}.mp4'\n"))
        .collect::<String>();
    std::fs::write(scratch.path.join("concat.txt"), list).map_err(|error| error.to_string())?;
    render_audio::run(
        document,
        &windows,
        sources,
        &exe,
        &scratch.path,
        control,
        |samples, total| {
            progress((70.0 + samples as f64 / total as f64 * 20.0).clamp(70.0, 90.0) as u8);
        },
    )?;
    let mut command = Command::new(&exe);
    command
        .current_dir(&scratch.path)
        .args(render_graph::final_mix(document, sources, &scratch.path)?);
    let duration = total * document.fps.denominator as f64 / document.fps.numerator as f64;
    control.run_with_output(&mut command, &scratch.path.join("mix.log"), |line| {
        if let Some(us) = line
            .strip_prefix("out_time_us=")
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| value.is_finite())
        {
            progress((90.0 + us / 1e6 / duration * 9.0).clamp(90.0, 99.0) as u8);
        }
    })?;
    let output = scratch.path.join("output.part.mp4");
    control.check()?;
    let metadata = crate::media_analyze::analyze(&tools, &output)?;
    let frame_ms = 1000.0 * document.fps.denominator as f64 / document.fps.numerator as f64;
    if (metadata.duration_ms as f64 - duration * 1000.0).abs() > frame_ms + 1.0 {
        return Err("A duração exportada diverge da montagem salva".into());
    }
    progress(100);
    Ok((scratch, output))
}
