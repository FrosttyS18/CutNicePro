use super::types::{render_settings, Asset, CaptionEdit, Composition, Item, MediaKind};
use crate::{
    render::settings::{CaptionStyle, RenderSettings},
    transcription::types::{Segment, Word},
};

fn caption_preset(model: u8) -> CaptionStyle {
    let mut style = CaptionStyle {
        font: "Poppins".into(),
        size: 64.0,
        weight: 600,
        color: "#ffffff".into(),
        italic: false,
        underline: false,
        uppercase: false,
        outline: 2.0,
        outline_color: "#000000".into(),
        shadow: true,
        background: "transparent".into(),
        highlight_color: "#02c2be".into(),
        effect: "none".into(),
        position: "bottom".into(),
        y: Some(0.86),
        words_per_line: Some(5),
    };
    match model {
        2 => {
            style.effect = "highlight".into();
            style.weight = 700;
        }
        3 => {
            style.effect = "karaoke".into();
            style.uppercase = true;
            style.weight = 700;
        }
        4 => {
            style.font = "Georgia".into();
            style.italic = true;
            style.outline = 0.0;
        }
        5 => {
            style.background = "#181818".into();
            style.outline = 0.0;
            style.shadow = false;
        }
        6 => {
            style.font = "Impact".into();
            style.uppercase = true;
            style.size = 80.0;
            style.outline = 3.0;
        }
        7 => {
            style.uppercase = true;
            style.outline = 5.0;
            style.weight = 700;
        }
        8 => {
            style.size = 56.0;
            style.weight = 400;
            style.outline = 0.0;
        }
        9 => {
            style.color = "#ffe6a7".into();
            style.font = "Georgia".into();
            style.outline = 1.0;
        }
        _ => {}
    }
    style
}

pub fn settings(
    document: &Composition,
    asset: Option<&Asset>,
    value: &serde_json::Value,
) -> Result<RenderSettings, String> {
    let mut result = render_settings(value)?;
    if result.caption_style.is_none() && (1..=9).contains(&result.caption_model) {
        result.caption_style = Some(caption_preset(result.caption_model));
    }
    result.ratio = render_settings(&document.settings)?.ratio;
    let origin = document
        .assets
        .iter()
        .find(|asset| asset.kind == MediaKind::Video)
        .or_else(|| {
            document
                .assets
                .iter()
                .find(|asset| asset.kind == MediaKind::Image)
        });
    let size = if result.ratio == "original" {
        origin
    } else {
        asset
    };
    result.source_width = Some(
        size.map(|asset| asset.width)
            .filter(|size| *size >= 2)
            .unwrap_or(1920),
    );
    result.source_height = Some(
        size.map(|asset| asset.height)
            .filter(|size| *size >= 2)
            .unwrap_or(1080),
    );
    result.trim_start = 0.0;
    result.trim_end = None;
    result.segments = None;
    if result
        .split_screen
        .as_ref()
        .is_some_and(|layout| !layout.face_validated)
    {
        result.split_screen = None;
    }
    let duration = asset
        .map(|asset| asset.duration_us as f64 / 1e6)
        .unwrap_or_else(|| {
            document.duration_frames() as f64 * document.fps.denominator as f64
                / document.fps.numerator as f64
        })
        .max(0.05);
    result.validate(duration)?;
    Ok(result)
}

pub fn geometry(
    settings: &RenderSettings,
    asset: &Asset,
    width: u32,
    height: u32,
    time: f64,
) -> Result<String, String> {
    if let Some(layout) = settings
        .split_screen
        .as_ref()
        .and_then(|layout| layout.at(time))
    {
        return layout.geometry(asset.width, asset.height);
    }
    if asset.width < 2 || asset.height < 2 {
        return Err("Dimensões da mídia inválidas".into());
    }
    let zoom = settings.zoom.unwrap_or(1.0);
    let pick = if settings.fit == "cover" {
        f64::max
    } else {
        f64::min
    };
    let scale = pick(
        width as f64 / asset.width as f64,
        height as f64 / asset.height as f64,
    ) * zoom;
    let even = |value: f64| ((value.round() as i64) / 2 * 2).max(2) as u32;
    let (rw, rh) = (
        even(asset.width as f64 * scale),
        even(asset.height as f64 * scale),
    );
    let (cw, ch) = (width.min(rw), height.min(rh));
    let (fx, fy) = settings
        .focal_point
        .as_ref()
        .map(|point| (point.x / 100.0, point.y / 100.0))
        .unwrap_or((0.5, 0.5));
    let (cx, cy) = (
        ((rw - cw) as f64 * fx) as u32,
        ((rh - ch) as f64 * fy) as u32,
    );
    let (px, py) = (
        ((width - cw) as f64 * fx) as u32,
        ((height - ch) as f64 * fy) as u32,
    );
    Ok(format!("scale={rw}:{rh},crop={cw}:{ch}:{cx}:{cy},pad={width}:{height}:{px}:{py}:color=black@0,setsar=1"))
}

pub fn captions(asset: &Asset, item: &Item) -> Result<Vec<Segment>, String> {
    asset
        .transcript
        .iter()
        .map(|value| {
            let mut segment: Segment = serde_json::from_value(value.clone())
                .map_err(|error| format!("Legenda da fonte inválida: {error}"))?;
            if let Some(edit) = item.caption_edits.get(&segment.id) {
                match edit {
                    CaptionEdit::Text(text) => {
                        segment.text = text.clone();
                        segment.words.clear();
                    }
                    CaptionEdit::Timed(edit) => {
                        segment.text = edit.text.clone();
                        segment.words = edit
                            .words
                            .as_ref()
                            .map(|words| {
                                words
                                    .iter()
                                    .map(|word| Word {
                                        text: word.text.clone(),
                                        start: word.start,
                                        end: word.end,
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                    }
                }
            }
            Ok(segment)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn document() -> Composition {
        serde_json::from_value(json!({
            "version":1,"revision":4,"fps":{"numerator":30,"denominator":1},
            "settings":{"ratio":"9:16","fit":"contain","zoom":1,"captionModel":1,"text":"","volume":1,"muted":false,"background":"#000000","trimStart":0,"trimEnd":null},
            "assets":[],"items":[],
            "tracks":[{"id":"V1","name":"Principal","kind":"visual","primary":true,"locked":false,"hidden":false,"muted":false}]
        })).unwrap()
    }

    #[test]
    fn implicit_editor_caption_preset_can_render_without_rewriting_saved_settings() {
        let document = document();
        let original = document.settings.clone();
        let result = settings(&document, None, &document.settings);
        assert!(
            result.is_ok(),
            "raw export error: {}",
            result.err().unwrap_or_default()
        );
        assert_eq!(document.settings, original);
    }

    #[test]
    fn implicit_editor_caption_presets_preserve_the_preview_presentation() {
        for (model, font, size, weight, effect, uppercase, outline, background) in [
            (1, "Poppins", 64.0, 600, "none", false, 2.0, "transparent"),
            (
                2,
                "Poppins",
                64.0,
                700,
                "highlight",
                false,
                2.0,
                "transparent",
            ),
            (3, "Poppins", 64.0, 700, "karaoke", true, 2.0, "transparent"),
            (4, "Georgia", 64.0, 600, "none", false, 0.0, "transparent"),
            (5, "Poppins", 64.0, 600, "none", false, 0.0, "#181818"),
            (6, "Impact", 80.0, 600, "none", true, 3.0, "transparent"),
            (7, "Poppins", 64.0, 700, "none", true, 5.0, "transparent"),
            (8, "Poppins", 56.0, 400, "none", false, 0.0, "transparent"),
            (9, "Georgia", 64.0, 600, "none", false, 1.0, "transparent"),
        ] {
            let mut document = document();
            document.settings["captionModel"] = json!(model);
            let config = settings(&document, None, &document.settings).unwrap();
            let style = config.caption_style.unwrap();
            assert_eq!(style.font, font);
            assert_eq!(style.size, size);
            assert_eq!(style.weight, weight);
            assert_eq!(style.effect, effect);
            assert_eq!(style.uppercase, uppercase);
            assert_eq!(style.outline, outline);
            assert_eq!(style.background, background);
            assert_eq!(style.italic, model == 4);
            assert_eq!(style.shadow, model != 5);
            assert_eq!(style.color, if model == 9 { "#ffe6a7" } else { "#ffffff" });
            assert_eq!(style.vertical(), 0.86);
            assert_eq!(style.per_line(), 5);
        }
    }

    #[test]
    fn explicit_caption_settings_stay_authoritative_and_invalid_values_are_rejected() {
        let mut document = document();
        document.settings["captionStyle"] = json!({"font":"Arial","size":93,"weight":700,"color":"#abcdef","italic":true,"underline":true,"uppercase":true,"outline":3,"outlineColor":"#123456","shadow":false,"background":"transparent","highlightColor":"#ffffff","effect":"karaoke","position":"top","y":0.2,"wordsPerCaption":3});
        let config = settings(&document, None, &document.settings).unwrap();
        let style = config.caption_style.unwrap();
        assert_eq!(style.font, "Arial");
        assert_eq!(style.size, 93.0);
        assert_eq!(style.color, "#abcdef");
        assert_eq!(style.vertical(), 0.2);
        assert_eq!(style.per_line(), 3);
        document.settings["captionStyle"]["size"] = json!(900);
        assert!(settings(&document, None, &document.settings).is_err());
        document
            .settings
            .as_object_mut()
            .unwrap()
            .remove("captionStyle");
        document.settings["captionModel"] = json!(10);
        assert!(settings(&document, None, &document.settings).is_err());
    }
}
