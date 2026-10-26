use super::{
    render_media, render_plan,
    types::{Composition, Item, ItemKind},
};
use crate::render::ass;
use std::path::Path;

pub fn source_video<'a>(document: &'a Composition, caption: &Item) -> Option<&'a Item> {
    if caption.kind != ItemKind::Caption || !caption.follows_main {
        return None;
    }
    let mut matches = document.items.iter().filter(|video| {
        video.kind == ItemKind::Video
            && video.asset_id == caption.asset_id
            && video.group_id == caption.group_id
            && video.start_frame == caption.start_frame
            && video.duration_frames == caption.duration_frames
            && video.source_start_us == caption.source_start_us
            && video.source_end_us == caption.source_end_us
    });
    let video = matches.next()?;
    if matches.next().is_some()
        || !document
            .tracks
            .iter()
            .any(|track| track.id == video.track_id && track.kind == "visual")
    {
        return None;
    }
    Some(video)
}

pub fn filter(
    document: &Composition,
    item: &Item,
    window: &render_plan::Window,
    directory: &Path,
    filename: &str,
) -> Result<Option<String>, String> {
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == item.asset_id)
        .ok_or("Fonte da legenda ausente")?;
    let mut config = render_media::settings(document, Some(asset), &item.settings)?;
    config.text.clear();
    if config.caption_model == 0 {
        return Ok(None);
    }
    let duration = (window.end - window.start) as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    let time = render_plan::source_time(document, item, window.start);
    let captions = ass::build(
        &render_media::captions(asset, item)?,
        &config,
        time,
        time + duration,
    )?;
    std::fs::write(directory.join(filename), captions).map_err(|error| error.to_string())?;
    Ok(Some(format!("ass=filename={filename}:fontsdir=fonts")))
}
