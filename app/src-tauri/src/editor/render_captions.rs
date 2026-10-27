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
    let captions = ass::build_for_window(
        &render_media::captions(asset, item)?,
        &config,
        time..time + duration,
        item.source_start_us as f64 / 1e6..item.source_end_us as f64 / 1e6,
    )?;
    std::fs::write(directory.join(filename), captions).map_err(|error| error.to_string())?;
    Ok(Some(format!("ass=filename={filename}:fontsdir=fonts")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn technical_render_windows_preserve_the_caption_item_group() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/fixtures/caption-parity.json"
        ))
        .unwrap();
        let config = json!({"ratio":"9:16","fit":"cover","captionModel":2,"captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,"outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#00ff00","effect":"highlight","position":"bottom","y":0.5,"wordsPerCaption":5},"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null});
        let mut document: Composition = serde_json::from_value(json!({
            "version":1,"revision":0,"fps":{"numerator":30,"denominator":1},"settings":config,
            "assets":[{"id":"source","mediaId":"source","name":"video.mp4","kind":"video","durationUs":4000000,"width":1920,"height":1080,"transcript":[fixtures[0]["segment"]]}],
            "tracks":[{"id":"C1","name":"Legendas","kind":"caption","primary":false,"hidden":false,"locked":false,"muted":false}],
            "items":[{"id":"caption","assetId":"source","groupId":"group","trackId":"C1","kind":"caption","startFrame":0,"durationFrames":120,"sourceStartUs":0,"sourceEndUs":4000000,"followsMain":false,"captionEdits":{},"settings":config}]
        })).unwrap();
        let directory =
            std::env::temp_dir().join(format!("cnp-caption-window-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let first_result = filter(
            &document,
            &document.items[0],
            &render_plan::Window { start: 30, end: 60 },
            &directory,
            "caption.ass",
        );
        let first = std::fs::read_to_string(directory.join("caption.ass"));
        let mut duplicate = document.items[0].clone();
        duplicate.id = "duplicate".into();
        duplicate.start_frame = 120;
        document.items.push(duplicate);
        let duplicate_result = filter(
            &document,
            &document.items[1],
            &render_plan::Window {
                start: 150,
                end: 180,
            },
            &directory,
            "duplicate.ass",
        );
        let duplicate = std::fs::read_to_string(directory.join("duplicate.ass"));
        document.items[1].caption_edits.insert("partial".into(), serde_json::from_value(json!({"text":fixtures[0]["edited"]["text"],"words":fixtures[0]["edited"]["words"]})).unwrap());
        let edited_result = filter(
            &document,
            &document.items[1],
            &render_plan::Window {
                start: 150,
                end: 180,
            },
            &directory,
            "edited.ass",
        );
        let edited = std::fs::read_to_string(directory.join("edited.ass"));
        std::fs::remove_dir_all(&directory).unwrap();
        first_result.unwrap();
        duplicate_result.unwrap();
        edited_result.unwrap();
        let output = first.unwrap();
        assert_eq!(duplicate.unwrap(), output);
        assert_eq!(edited.unwrap(), output.replace("preservar", "manter"));
        assert!(output.contains("Quero"));
        assert!(output.contains("preservar"));
        assert!(output.contains("toda"));
        assert!(output.contains("conclusão"));
        assert!(!output.contains("vídeo."));
    }
}
