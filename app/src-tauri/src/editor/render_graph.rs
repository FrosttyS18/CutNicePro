use super::{
    render_captions, render_media, render_plan,
    types::{Composition, ItemKind, Placement},
};
use crate::render::{ass, encoder::Encoder};
use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
};

pub(super) fn filter_threads() -> usize {
    std::thread::available_parallelism()
        .map(|threads| filter_thread_budget(threads.get()))
        .unwrap_or(1)
}

fn filter_thread_budget(available: usize) -> usize {
    available.clamp(1, 16)
}

#[cfg(test)]
mod filter_thread_tests {
    use super::filter_thread_budget;

    #[test]
    fn scales_the_filter_pool_with_the_available_cpus() {
        for (available, expected) in [(0, 1), (1, 1), (2, 2), (4, 4), (8, 8), (12, 12), (16, 16)] {
            assert_eq!(filter_thread_budget(available), expected);
        }
    }

    #[test]
    fn bounds_the_filter_pool_on_larger_machines() {
        for available in [24, 32, 64, 128] {
            let budget = filter_thread_budget(available);
            assert_eq!(budget, 16);
            assert!(budget <= available);
        }
    }
}

pub(super) struct LayerBounds {
    pub width: u32,
    pub height: u32,
    pub x: f64,
    pub y: f64,
}

pub(super) fn layer_bounds(width: u32, height: u32, placement: &Placement) -> LayerBounds {
    let even = |value: f64| ((value.round() as i64) / 2 * 2).max(2) as u32;
    let (scaled_width, scaled_height) = (
        even(width as f64 * placement.scale),
        even(height as f64 * placement.scale),
    );
    let (x, y) = (
        width as f64 * placement.x / 100.0 - scaled_width as f64 / 2.0,
        height as f64 * placement.y / 100.0 - scaled_height as f64 / 2.0,
    );
    LayerBounds {
        width: scaled_width,
        height: scaled_height,
        x,
        y,
    }
}

fn layer_transform(width: u32, height: u32, placement: &Placement) -> (String, f64, f64) {
    let LayerBounds {
        width: scaled_width,
        height: scaled_height,
        x,
        y,
    } = layer_bounds(width, height, placement);
    if placement.scale <= 2.0 {
        return (format!("scale={scaled_width}:{scaled_height}"), x, y);
    }
    let sx = scaled_width as f64 / width as f64;
    let sy = scaled_height as f64 / height as f64;
    let left = ((-x / sx).floor() - 1.0).clamp(0.0, width as f64 - 1.0) as u32;
    let top = ((-y / sy).floor() - 1.0).clamp(0.0, height as f64 - 1.0) as u32;
    let right =
        (((width as f64 - x) / sx).ceil() + 1.0).clamp(left as f64 + 1.0, width as f64) as u32;
    let bottom =
        (((height as f64 - y) / sy).ceil() + 1.0).clamp(top as f64 + 1.0, height as f64) as u32;
    let cropped_width = ((right - left) as f64 * sx).round().max(1.0) as u32;
    let cropped_height = ((bottom - top) as f64 * sy).round().max(1.0) as u32;
    (
        format!(
            "crop={}:{}:{left}:{top}:exact=1,scale={cropped_width}:{cropped_height}",
            right - left,
            bottom - top
        ),
        x + left as f64 * sx,
        y + top as f64 * sy,
    )
}

pub fn video(
    document: &Composition,
    window: &render_plan::Window,
    sources: &HashMap<String, PathBuf>,
    directory: &Path,
    index: usize,
    encoder: Encoder,
) -> Result<Vec<OsString>, String> {
    video_with_options(
        document,
        window,
        sources,
        directory,
        index,
        encoder,
        super::export_options::ExportOptions::default(),
    )
}

pub(super) fn video_with_options(
    document: &Composition,
    window: &render_plan::Window,
    sources: &HashMap<String, PathBuf>,
    directory: &Path,
    index: usize,
    encoder: Encoder,
    options: super::export_options::ExportOptions,
) -> Result<Vec<OsString>, String> {
    let config = render_media::settings(document, None, &document.settings)?;
    let (width, height) = config.dimensions()?;
    let rate = format!("{}/{}", document.fps.numerator, document.fps.denominator);
    let duration = (window.end - window.start) as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    options.validate()?;
    let output_frames = options.window_frames(window, &document.fps);
    if output_frames == 0 {
        return Err("A janela não contém frames na taxa de saída escolhida.".into());
    }
    let output_rate = options.output_rate(&document.fps);
    let output_rate = format!("{}/{}", output_rate.0, output_rate.1);
    let preserve_channels =
        options.codec.alpha() || options.codec == super::export_options::Codec::Hevc422;
    let background = if options.codec.alpha() {
        format!("{}@0", config.background)
    } else {
        config.background.clone()
    };
    let canvas_format = if preserve_channels {
        ",format=rgba"
    } else {
        ""
    };
    let filter_threads = if window.end - window.start == 1 {
        1
    } else {
        filter_threads()
    }
    .to_string();
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-filter_complex_threads",
        &filter_threads,
        "-f",
        "lavfi",
        "-i",
        &format!("color=c={background}:s={width}x{height}:r={rate}:d={duration}{canvas_format}"),
    ]
    .iter()
    .map(Into::into)
    .collect();
    let active = render_plan::active(document, window.start);
    let mut graph = String::new();
    let mut current = "0:v".to_string();
    let mut input = 1;
    let mut caption_index = 0;
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
        let (transform, x, y) = layer_transform(width, height, &placement);
        let effects = config
            .effects_filter()
            .map(|value| format!(",{value}"))
            .unwrap_or_default();
        let mut captions = String::new();
        for caption in active.iter().filter(|caption| {
            render_captions::source_video(document, caption)
                .is_some_and(|owner| owner.id == item.id)
        }) {
            let filename = format!("caption-{index}-{caption_index}.ass");
            if let Some(filter) =
                render_captions::filter(document, caption, window, directory, &filename)?
            {
                captions.push(',');
                captions.push_str(&filter);
                caption_index += 1;
            }
        }
        let alpha = if placement.opacity == 1.0 {
            "format=rgba".to_owned()
        } else {
            format!("colorchannelmixer=aa={}", placement.opacity)
        };
        let overlay_format = if preserve_channels {
            ":format=auto"
        } else {
            ""
        };
        graph.push_str(&format!("[{input}:v]setpts=PTS-STARTPTS,fps={rate},format=rgba,{geometry}{effects}{captions},{transform},{alpha}[layer{input}];[{current}][layer{input}]overlay=x={x}:y={y}:eof_action=pass:repeatlast=0{overlay_format}[mix{input}];"));
        current = format!("mix{input}");
        input += 1;
    }
    for item in active.iter().filter(|item| {
        item.kind == ItemKind::Caption && render_captions::source_video(document, item).is_none()
    }) {
        let filename = format!("caption-{index}-{caption_index}.ass");
        let Some(filter) = render_captions::filter(document, item, window, directory, &filename)?
        else {
            continue;
        };
        graph.push_str(&format!("[{current}]{filter}[caption{caption_index}];"));
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
    let timing = options.timing_filter(window, &document.fps);
    if !timing.is_empty() {
        graph.push_str(&format!(
            "[{current}]{}[retimed];",
            timing.trim_end_matches(',')
        ));
        current = "retimed".into();
    }
    graph.push_str(&options.output_filter(&current, width, height, false));
    let script = format!("video-{index}.txt");
    std::fs::write(directory.join(&script), graph).map_err(|error| error.to_string())?;
    args.extend([
        "-/filter_complex".into(),
        script.into(),
        "-map".into(),
        "[out]".into(),
        "-an".into(),
        "-r".into(),
        output_rate.into(),
        "-frames:v".into(),
        output_frames.to_string().into(),
        "-pix_fmt".into(),
        options.codec.pixel_format(encoder).into(),
        "-threads".into(),
        "4".into(),
    ]);
    let (target_width, target_height) = options.dimensions(width, height);
    args.extend(
        super::export_encoding::arguments(
            options,
            encoder,
            target_width,
            target_height,
            options.output_rate(&document.fps),
        )
        .into_iter()
        .map(Into::into),
    );
    if matches!(
        options.codec,
        super::export_options::Codec::Hevc
            | super::export_options::Codec::HevcAlpha
            | super::export_options::Codec::Hevc422
    ) {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }
    args.extend([
        "-progress".into(),
        "pipe:2".into(),
        "-nostats".into(),
        format!("part-{index}.{}", options.extension()).into(),
    ]);
    Ok(args)
}

#[cfg(test)]
pub fn final_mix(
    document: &Composition,
    _sources: &HashMap<String, PathBuf>,
    _directory: &Path,
) -> Result<Vec<OsString>, String> {
    final_mix_with_options(
        document,
        _sources,
        _directory,
        super::export_options::ExportOptions::default(),
    )
}

pub(super) fn final_mix_with_options(
    document: &Composition,
    _sources: &HashMap<String, PathBuf>,
    _directory: &Path,
    options: super::export_options::ExportOptions,
) -> Result<Vec<OsString>, String> {
    let duration = document.duration_frames() as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    let rate = options.output_rate(&document.fps);
    let duration = duration.max(
        options.output_frame(document.duration_frames(), &document.fps) as f64 * f64::from(rate.1)
            / f64::from(rate.0),
    );
    let samples = super::render_audio::sample_at(document, document.duration_frames())?;
    let mut args: Vec<OsString> = [
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
    ]
    .iter()
    .map(Into::into)
    .collect();
    if matches!(
        options.codec,
        super::export_options::Codec::Hevc
            | super::export_options::Codec::HevcAlpha
            | super::export_options::Codec::Hevc422
    ) {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }
    args.push(format!("output.part.{}", options.extension()).into());
    Ok(args)
}

#[cfg(test)]
#[path = "render_audio_contract_tests.rs"]
mod audio_contract_tests;
