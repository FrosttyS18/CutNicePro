use super::types::{render_settings, Asset, CaptionEdit, Composition, Item, MediaKind};
use crate::{
    render::settings::RenderSettings,
    transcription::types::{Segment, Word},
};

pub fn settings(
    document: &Composition,
    asset: Option<&Asset>,
    value: &serde_json::Value,
) -> Result<RenderSettings, String> {
    let mut result = render_settings(value)?;
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
