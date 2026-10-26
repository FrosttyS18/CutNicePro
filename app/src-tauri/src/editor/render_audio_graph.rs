use super::{sample_at, Block, SAMPLE_RATE, SOURCES_PER_PASS};
use crate::editor::{
    render_media,
    types::{Composition, Item},
};
use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
};

pub(super) fn window(
    document: &Composition,
    block: Block,
    items: &[&Item],
    sources: &HashMap<String, PathBuf>,
    previous: Option<&Path>,
    destination: &Path,
    directory: &Path,
) -> Result<Vec<OsString>, String> {
    if items.len() > SOURCES_PER_PASS || block.end <= block.start {
        return Err("Janela de áudio fora dos limites de processamento".into());
    }
    let samples = block.end - block.start;
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
        "anullsrc=r=48000:cl=stereo",
    ]
    .iter()
    .map(Into::into)
    .collect();
    let mut filters = format!("[0:a]atrim=end_sample={samples},asetpts=PTS-STARTPTS[silence];");
    let mut labels = vec!["[silence]".to_string()];
    let mut input = 1;
    if let Some(path) = previous {
        args.extend([
            "-f".into(),
            "f32le".into(),
            "-ar".into(),
            SAMPLE_RATE.to_string().into(),
            "-ac".into(),
            "2".into(),
            "-i".into(),
            path.as_os_str().into(),
        ]);
        labels.push(format!("[{input}:a]"));
        input += 1;
    }
    for item in items {
        let asset = document
            .assets
            .iter()
            .find(|asset| asset.id == item.asset_id)
            .ok_or("Fonte do áudio ausente")?;
        let config = render_media::settings(document, Some(asset), &item.settings)?;
        if config.muted {
            continue;
        }
        let elapsed = block
            .start
            .saturating_sub(sample_at(document, item.start_frame)?);
        let source_length =
            ((item.source_end_us - item.source_start_us) as u128 * SAMPLE_RATE as u128 + 500_000)
                / 1_000_000;
        let remaining = source_length.saturating_sub(elapsed as u128);
        let available = remaining.min(samples as u128) as u64;
        if available == 0 {
            continue;
        }
        let path = sources
            .get(&item.asset_id)
            .ok_or("Arquivo de áudio ausente")?;
        let source_time = item.source_start_us as f64 / 1e6 + elapsed as f64 / SAMPLE_RATE as f64;
        args.extend([
            "-ss".into(),
            format!("{source_time:.9}").into(),
            "-t".into(),
            format!("{:.9}", available as f64 / SAMPLE_RATE as f64).into(),
            "-threads".into(),
            "1".into(),
            "-i".into(),
            path.as_os_str().into(),
        ]);
        filters.push_str(&format!("[{input}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end_sample={available},asetpts=PTS-STARTPTS,volume={},apad=whole_len={samples},atrim=end_sample={samples}[a{input}];", config.volume));
        labels.push(format!("[a{input}]"));
        input += 1;
    }
    filters.push_str(&format!("{}amix=inputs={}:duration=first:dropout_transition=0:normalize=0,atrim=end_sample={samples}[audio]", labels.join(""), labels.len()));
    std::fs::write(directory.join("audio-window.txt"), filters)
        .map_err(|error| error.to_string())?;
    args.extend([
        "-/filter_complex".into(),
        "audio-window.txt".into(),
        "-map".into(),
        "[audio]".into(),
        "-vn".into(),
        "-c:a".into(),
        "pcm_f32le".into(),
        "-ar".into(),
        SAMPLE_RATE.to_string().into(),
        "-ac".into(),
        "2".into(),
        "-f".into(),
        "f32le".into(),
        destination.as_os_str().into(),
    ]);
    Ok(args)
}
