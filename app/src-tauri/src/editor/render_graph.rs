use super::{
    render_media, render_plan,
    types::{Composition, ItemKind},
};
use crate::render::{ass, encoder::Encoder};
use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
};

pub fn video(
    document: &Composition,
    window: &render_plan::Window,
    sources: &HashMap<String, PathBuf>,
    directory: &Path,
    index: usize,
    encoder: Encoder,
) -> Result<Vec<OsString>, String> {
    let config = render_media::settings(document, None, &document.settings)?;
    let (width, height) = config.dimensions()?;
    let rate = format!("{}/{}", document.fps.numerator, document.fps.denominator);
    let duration = (window.end - window.start) as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-filter_complex_threads",
        "1",
        "-f",
        "lavfi",
        "-i",
        &format!(
            "color=c={}:s={width}x{height}:r={rate}:d={duration}",
            config.background
        ),
    ]
    .iter()
    .map(Into::into)
    .collect();
    let active = render_plan::active(document, window.start);
    let mut graph = String::new();
    let mut current = "0:v".to_string();
    let mut input = 1;
    for item in active
        .iter()
        .filter(|item| matches!(item.kind, ItemKind::Video | ItemKind::Image))
    {
        let asset = document
            .assets
            .iter()
            .find(|asset| asset.id == item.asset_id)
            .ok_or("Mídia da camada não encontrada")?;
        let source = sources
            .get(&item.asset_id)
            .ok_or("Arquivo da camada ausente")?;
        let config = render_media::settings(document, Some(asset), &item.settings)?;
        let time = render_plan::source_time(document, item, window.start);
        if item.kind == ItemKind::Image {
            args.extend(["-loop".into(), "1".into()]);
        } else {
            args.extend(["-ss".into(), time.to_string().into()]);
        }
        args.extend([
            "-t".into(),
            duration.to_string().into(),
            "-threads".into(),
            "2".into(),
            "-i".into(),
            source.as_os_str().into(),
        ]);
        let mut geometry =
            render_media::geometry(&config, asset, width, height, time + duration / 2.0)?;
        for label in ["top", "bottom", "t", "b"] {
            geometry = geometry.replace(&format!("[{label}]"), &format!("[layer{input}_{label}]"));
        }
        let placement = item.placement.clone().unwrap_or_default();
        let even = |value: f64| ((value.round() as i64) / 2 * 2).max(2) as u32;
        let (scaled_width, scaled_height) = (
            even(width as f64 * placement.scale),
            even(height as f64 * placement.scale),
        );
        let (x, y) = (
            width as f64 * placement.x / 100.0 - scaled_width as f64 / 2.0,
            height as f64 * placement.y / 100.0 - scaled_height as f64 / 2.0,
        );
        let effects = config
            .effects_filter()
            .map(|value| format!(",{value}"))
            .unwrap_or_default();
        graph.push_str(&format!("[{input}:v]setpts=PTS-STARTPTS,fps={rate},format=rgba,{geometry}{effects},scale={scaled_width}:{scaled_height},colorchannelmixer=aa={}[layer{input}];[{current}][layer{input}]overlay=x={x}:y={y}:eof_action=pass:repeatlast=0[mix{input}];",placement.opacity));
        current = format!("mix{input}");
        input += 1;
    }
    let mut caption_index = 0;
    for item in active.iter().filter(|item| item.kind == ItemKind::Caption) {
        let asset = document
            .assets
            .iter()
            .find(|asset| asset.id == item.asset_id)
            .ok_or("Fonte da legenda ausente")?;
        let mut config = render_media::settings(document, Some(asset), &item.settings)?;
        config.text.clear();
        if config.caption_model == 0 {
            continue;
        }
        let source_time = render_plan::source_time(document, item, window.start);
        let captions = ass::build(
            &render_media::captions(asset, item)?,
            &config,
            source_time,
            source_time + duration,
        )?;
        let filename = format!("caption-{index}-{caption_index}.ass");
        std::fs::write(directory.join(&filename), captions).map_err(|error| error.to_string())?;
        graph.push_str(&format!(
            "[{current}]ass=filename={filename}:fontsdir=fonts[caption{caption_index}];"
        ));
        current = format!("caption{caption_index}");
        caption_index += 1;
    }
    if !config.text.is_empty() {
        let mut text_config = config.clone();
        text_config.caption_model = 0;
        let filename = format!("text-{index}.ass");
        std::fs::write(
            directory.join(&filename),
            ass::build(&[], &text_config, 0.0, duration)?,
        )
        .map_err(|error| error.to_string())?;
        graph.push_str(&format!(
            "[{current}]ass=filename={filename}:fontsdir=fonts[text];"
        ));
        current = "text".into();
    }
    graph.push_str(&format!("[{current}]format=yuv420p[out]"));
    let script = format!("video-{index}.txt");
    std::fs::write(directory.join(&script), graph).map_err(|error| error.to_string())?;
    args.extend([
        "-/filter_complex".into(),
        script.into(),
        "-map".into(),
        "[out]".into(),
        "-an".into(),
        "-r".into(),
        rate.into(),
        "-frames:v".into(),
        (window.end - window.start).to_string().into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-threads".into(),
        "4".into(),
    ]);
    args.extend(encoder.arguments().into_iter().map(Into::into));
    args.extend([
        "-progress".into(),
        "pipe:2".into(),
        "-nostats".into(),
        format!("part-{index}.mp4").into(),
    ]);
    Ok(args)
}

pub fn final_mix(
    document: &Composition,
    _sources: &HashMap<String, PathBuf>,
    _directory: &Path,
) -> Result<Vec<OsString>, String> {
    let duration = document.duration_frames() as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    let samples = super::render_audio::sample_at(document, document.duration_frames())?;
    Ok([
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
        "-f",
        "f32le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-i",
        "audio.f32",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-af",
        &format!("atrim=end_sample={samples}"),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        &duration.to_string(),
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:2",
        "-nostats",
        "output.part.mp4",
    ]
    .iter()
    .map(Into::into)
    .collect())
}

#[cfg(test)]
#[path = "render_audio_contract_tests.rs"]
mod audio_contract_tests;
