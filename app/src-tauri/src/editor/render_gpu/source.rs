use crate::transcription::process::ProcessControl;
use serde::Deserialize;
use std::{path::Path, process::Command};

#[derive(Deserialize)]
struct Metadata {
    streams: Vec<Stream>,
}

#[derive(Deserialize)]
struct Stream {
    codec_name: Option<String>,
    pix_fmt: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    color_space: Option<String>,
    color_range: Option<String>,
    color_transfer: Option<String>,
    color_primaries: Option<String>,
    #[serde(default)]
    side_data_list: Vec<serde_json::Value>,
    #[serde(default)]
    tags: std::collections::HashMap<String, String>,
}

pub(super) fn compatible(bytes: &[u8], width: u32, height: u32) -> bool {
    let Ok(metadata) = serde_json::from_slice::<Metadata>(bytes) else {
        return false;
    };
    let [stream] = metadata.streams.as_slice() else {
        return false;
    };
    stream.codec_name.as_deref() == Some("h264")
        && stream.pix_fmt.as_deref() == Some("yuv420p")
        && stream.width == Some(width)
        && stream.height == Some(height)
        && stream.color_space.as_deref() == Some("bt709")
        && stream.color_range.as_deref() == Some("tv")
        && stream.color_transfer.as_deref() == Some("bt709")
        && stream.color_primaries.as_deref() == Some("bt709")
        && stream.side_data_list.iter().all(|data| {
            data.get("rotation")
                .is_none_or(|rotation| rotation.as_f64() == Some(0.0))
        })
        && stream
            .tags
            .get("rotate")
            .is_none_or(|rotation| rotation.parse::<f64>() == Ok(0.0))
}

pub(super) fn probe(
    ffprobe: &Path,
    source: &Path,
    directory: &Path,
    index: usize,
    width: u32,
    height: u32,
    control: &ProcessControl,
) -> Result<bool, String> {
    let output = directory.join(format!("gpu-source-{index}.json"));
    let mut command = Command::new(ffprobe);
    command.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height,color_space,color_range,color_transfer,color_primaries:stream_side_data=rotation:stream_tags=rotate", "-of", "json"]).arg(source);
    control.run_to_file(
        &mut command,
        &directory.join(format!("gpu-source-{index}.log")),
        &output,
    )?;
    Ok(compatible(
        &std::fs::read(output).map_err(|error| error.to_string())?,
        width,
        height,
    ))
}
