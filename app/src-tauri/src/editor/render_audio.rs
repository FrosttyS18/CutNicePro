use super::{
    render_plan,
    types::{Composition, ItemKind},
};
use crate::transcription::process::ProcessControl;
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
};

#[path = "render_audio_graph.rs"]
mod graph;

const SAMPLE_RATE: u64 = 48_000;
const BYTES_PER_FRAME: u64 = 8;
const BLOCK_SAMPLES: u64 = 480_000;
const SOURCES_PER_PASS: usize = 7;

#[derive(Clone, Copy)]
struct Block {
    start: u64,
    end: u64,
}

pub(super) fn sample_at(document: &Composition, frame: u64) -> Result<u64, String> {
    let rate = document.fps.numerator as u128;
    if rate == 0 {
        return Err("Taxa de áudio da montagem inválida".into());
    }
    let value = frame as u128 * document.fps.denominator as u128 * SAMPLE_RATE as u128;
    u64::try_from((value + rate / 2) / rate)
        .map_err(|_| "Duração do áudio excede o limite suportado".into())
}

pub(super) fn run(
    document: &Composition,
    windows: &[render_plan::Window],
    sources: &HashMap<String, PathBuf>,
    exe: &Path,
    directory: &Path,
    control: &ProcessControl,
    mut progress: impl FnMut(u64, u64),
) -> Result<PathBuf, String> {
    let total = sample_at(document, document.duration_frames())?;
    let expected = total
        .checked_mul(BYTES_PER_FRAME)
        .ok_or("Áudio intermediário excede o limite suportado")?;
    let destination = directory.join("audio.f32");
    let mut output = File::create(&destination).map_err(|error| error.to_string())?;
    for window in windows {
        let items: Vec<_> = render_plan::active(document, window.start)
            .into_iter()
            .filter(|item| item.kind == ItemKind::Audio)
            .collect();
        let end = sample_at(document, window.end)?;
        let mut start = sample_at(document, window.start)?;
        while start < end {
            control.check()?;
            let block = Block {
                start,
                end: end.min(start.saturating_add(BLOCK_SAMPLES)),
            };
            let mut previous: Option<PathBuf> = None;
            let passes = items.len().div_ceil(SOURCES_PER_PASS).max(1);
            for pass in 0..passes {
                control.check()?;
                let from = (pass * SOURCES_PER_PASS).min(items.len());
                let to = (from + SOURCES_PER_PASS).min(items.len());
                let target = directory.join(if pass % 2 == 0 {
                    "audio-a.f32"
                } else {
                    "audio-b.f32"
                });
                let args = graph::window(
                    document,
                    block,
                    &items[from..to],
                    sources,
                    previous.as_deref(),
                    &target,
                    directory,
                )?;
                let mut command = Command::new(exe);
                command.current_dir(directory).args(args);
                control.run(command, &directory.join("audio-window.log"))?;
                if let Some(path) = previous {
                    std::fs::remove_file(path).map_err(|error| error.to_string())?;
                }
                previous = Some(target);
            }
            let rendered = previous.ok_or("Áudio da janela não foi produzido")?;
            append(
                &rendered,
                &mut output,
                (block.end - block.start) * BYTES_PER_FRAME,
                control,
            )?;
            std::fs::remove_file(rendered).map_err(|error| error.to_string())?;
            start = block.end;
            progress(start, total);
        }
    }
    if output.metadata().map_err(|error| error.to_string())?.len() != expected {
        return Err("A duração do áudio intermediário diverge da montagem".into());
    }
    Ok(destination)
}

fn append(
    path: &Path,
    output: &mut File,
    expected: u64,
    control: &ProcessControl,
) -> Result<(), String> {
    let mut input = File::open(path).map_err(|error| error.to_string())?;
    if input.metadata().map_err(|error| error.to_string())?.len() != expected {
        return Err("A janela de áudio não contém a quantidade de amostras esperada".into());
    }
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        control.check()?;
        let count = input.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            return Ok(());
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| error.to_string())?;
    }
}

#[cfg(test)]
#[path = "render_audio_tests.rs"]
mod tests;
