use super::{render_audio, render_gpu, render_graph, render_plan, types::Composition};
use crate::{
    render::{encoder::Encoder, scratch::Scratch},
    transcription::process::ProcessControl,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    time::Instant,
};

#[cfg(test)]
fn render_with_encoder(
    selected: Encoder,
    directory: &Path,
    control: &ProcessControl,
    render_all: impl FnMut(Encoder) -> Result<(), String>,
) -> Result<Encoder, String> {
    render_profile(
        selected,
        directory,
        control,
        super::export_options::ExportOptions::default(),
        || Ok(()),
        render_all,
    )
}

fn render_profile(
    selected: Encoder,
    directory: &Path,
    control: &ProcessControl,
    options: super::export_options::ExportOptions,
    cpu_available: impl FnOnce() -> Result<(), String>,
    mut render_all: impl FnMut(Encoder) -> Result<(), String>,
) -> Result<Encoder, String> {
    control.check()?;
    eprintln!(
        "[editor] Codificador selecionado: {}.",
        super::export_encoding::name(options.codec, selected)
    );
    let mut actual = selected;
    if let Err(error) = render_all(selected) {
        control.check()?;
        if selected == Encoder::Cpu {
            return Err(error);
        }
        std::fs::write(directory.join("encoder-fallback.log"), error)
            .map_err(|error| error.to_string())?;
        cpu_available()?;
        eprintln!("[editor] A codificação por GPU falhou; repetindo com CPU e o mesmo codec. Diagnóstico no log temporário encoder-fallback.log.");
        actual = Encoder::Cpu;
        render_all(actual)?;
    }
    control.check()?;
    let name = super::export_encoding::name(options.codec, actual);
    std::fs::write(directory.join("encoder.txt"), name).map_err(|error| error.to_string())?;
    eprintln!("[editor] Codificador efetivo: {name}.");
    Ok(actual)
}

#[cfg(test)]
pub fn run(
    base: &Path,
    document: &Composition,
    sources: &HashMap<String, PathBuf>,
    control: &ProcessControl,
    progress: impl FnMut(u8),
) -> Result<(Scratch, PathBuf), String> {
    run_with_options(
        base,
        document,
        sources,
        control,
        super::export_options::ExportOptions::default(),
        progress,
    )
}

pub(super) fn run_with_options(
    base: &Path,
    document: &Composition,
    sources: &HashMap<String, PathBuf>,
    control: &ProcessControl,
    options: super::export_options::ExportOptions,
    mut progress: impl FnMut(u8),
) -> Result<(Scratch, PathBuf), String> {
    let started = Instant::now();
    options.validate()?;
    let windows = render_plan::windows(document)?;
    let config = super::render_media::settings(document, None, &document.settings)?;
    let canvas_dimensions = config.dimensions()?;
    let dimensions = options.dimensions(canvas_dimensions.0, canvas_dimensions.1);
    if dimensions.0 > 16384 || dimensions.1 > 16384 {
        return Err("A proporção da edição excede as dimensões de exportação suportadas. Escolha uma resolução menor.".into());
    }
    let output_frames = options.output_frame(document.duration_frames(), &document.fps);
    if output_frames == 0 {
        return Err("A montagem é curta demais para a taxa de quadros escolhida.".into());
    }
    control.check()?;
    let scratch = Scratch::new(base)?;
    crate::render::fonts::prepare(&scratch.path)?;
    let tools = crate::media_analyze::detect_fftools().ok_or("FFmpeg não encontrado")?;
    let exe = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let selected = super::export_encoding::select(&exe, &scratch.path, control, options)?;
    let total = document.duration_frames() as f64;
    let video_started = Instant::now();
    eprintln!(
        "[editor] Preparando vídeo: {} janelas; filtros com até {} threads.",
        windows.len(),
        render_graph::filter_threads()
    );
    let mut last_progress = 0;
    let mut render_all = |selected: Encoder| -> Result<(), String> {
        let mut gpu = render_gpu::Session::default();
        for (index, window) in windows.iter().enumerate() {
            control.check()?;
            if options.window_frames(window, &document.fps) == 0 {
                continue;
            }
            let arguments = gpu.arguments_with_options(
                document,
                window,
                sources,
                &scratch.path,
                index,
                &tools.ffprobe,
                selected,
                control,
                options,
            )?;
            gpu.render(
                arguments,
                control,
                &scratch.path.join(format!("gpu-fallback-{index}.log")),
                || {
                    render_graph::video_with_options(
                        document,
                        window,
                        sources,
                        &scratch.path,
                        index,
                        selected,
                        options,
                    )
                },
                |arguments, hardware| {
                    let mut command = Command::new(&exe);
                    command.current_dir(&scratch.path).args(arguments);
                    let log = format!("video-{index}{}.log", if hardware { "-gpu" } else { "" });
                    eprintln!(
                        "[editor] Janela {}: composição {}.",
                        index + 1,
                        if hardware { "CUDA" } else { "CPU" }
                    );
                    control.run_with_output(&mut command, &scratch.path.join(log), |line| {
                        if let Some(us) = line
                            .strip_prefix("out_time_us=")
                            .and_then(|value| value.parse::<f64>().ok())
                            .filter(|value| value.is_finite())
                        {
                            let frames = us / 1e6 * document.fps.numerator as f64
                                / document.fps.denominator as f64;
                            let current = ((window.start as f64 + frames).min(window.end as f64)
                                / total
                                * 70.0)
                                .clamp(0.0, 70.0) as u8;
                            last_progress = last_progress.max(current);
                            progress(last_progress);
                        }
                    })
                },
            )?;
        }
        Ok(())
    };
    render_profile(
        selected,
        &scratch.path,
        control,
        options,
        || super::export_encoding::cpu_available(&exe, &scratch.path, control, options.codec),
        &mut render_all,
    )?;
    eprintln!(
        "[editor] Etapa vídeo concluída em {:.2}s.",
        video_started.elapsed().as_secs_f64()
    );
    let list = windows
        .iter()
        .enumerate()
        .filter(|(_, window)| options.window_frames(window, &document.fps) > 0)
        .map(|(index, window)| {
            let mut entry = format!("file 'part-{index}.{}'\n", options.extension());
            if options.frame_rate != super::export_options::FrameRate::Original {
                let rate = options.output_rate(&document.fps);
                let duration = options.window_frames(window, &document.fps) as f64
                    * f64::from(rate.1)
                    / f64::from(rate.0);
                entry.push_str(&format!("duration {duration:.15}\n"));
            }
            entry
        })
        .collect::<String>();
    std::fs::write(scratch.path.join("concat.txt"), list).map_err(|error| error.to_string())?;
    let audio_started = Instant::now();
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
    eprintln!(
        "[editor] Etapa áudio concluída em {:.2}s.",
        audio_started.elapsed().as_secs_f64()
    );
    let mix_started = Instant::now();
    let mut command = Command::new(&exe);
    command
        .current_dir(&scratch.path)
        .args(render_graph::final_mix_with_options(
            document,
            sources,
            &scratch.path,
            options,
        )?);
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
    eprintln!(
        "[editor] Etapa de combinação final concluída em {:.2}s.",
        mix_started.elapsed().as_secs_f64()
    );
    let output = scratch
        .path
        .join(format!("output.part.{}", options.extension()));
    control.check()?;
    let metadata = super::export_encoding::validate_output(
        &tools.ffprobe,
        &output,
        &scratch.path,
        options,
        output_frames,
        control,
    )?;
    let (rate_numerator, rate_denominator) = options.output_rate(&document.fps);
    let rate = f64::from(rate_numerator) / f64::from(rate_denominator);
    if (metadata.width, metadata.height) != dimensions
        || !metadata.has_audio
        || metadata.video_codec != options.codec.video_codec()
        || (metadata.fps - rate).abs() > 0.001
    {
        eprintln!("[editor] Perfil final inválido: {}x{}, codec={}, áudio={}, fps={} (esperado {}x{}, codec={}, fps={}).",metadata.width,metadata.height,metadata.video_codec,metadata.has_audio,metadata.fps,dimensions.0,dimensions.1,options.codec.video_codec(),rate);
        return Err("O arquivo exportado diverge das opções escolhidas. Exporte novamente.".into());
    }
    let frame_ms = 1000.0 / rate;
    if (metadata.duration_ms as f64 - duration * 1000.0).abs() > frame_ms + 1.0 {
        return Err("A duração exportada diverge da montagem salva".into());
    }
    eprintln!(
        "[editor] Renderização validada em {:.2}s.",
        started.elapsed().as_secs_f64()
    );
    progress(100);
    Ok((scratch, output))
}

#[cfg(test)]
#[path = "render_encoder_tests.rs"]
mod encoder_tests;

#[cfg(test)]
#[path = "export_profile_tests.rs"]
mod profile_tests;
