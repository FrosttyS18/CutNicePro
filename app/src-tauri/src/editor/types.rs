use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Video,
    Image,
    Audio,
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    Video,
    Image,
    Audio,
    Caption,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub media_id: String,
    pub name: String,
    pub kind: MediaKind,
    pub duration_us: u64,
    pub width: u32,
    pub height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_audio: Option<bool>,
    pub transcript: Vec<Value>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Track {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub primary: bool,
    pub locked: bool,
    pub hidden: bool,
    pub muted: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present_option"
    )]
    pub color: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Marker {
    pub id: String,
    pub name: String,
    pub frame: u64,
    pub color: String,
}

fn present_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

const COMPOSITION_NAME_LIMIT: usize = 120;

fn valid_name(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= COMPOSITION_NAME_LIMIT
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub track_id: String,
    pub asset_id: String,
    pub kind: ItemKind,
    pub start_frame: u64,
    pub duration_frames: u64,
    pub source_start_us: u64,
    pub source_end_us: u64,
    pub group_id: String,
    pub follows_main: bool,
    pub settings: Value,
    pub caption_edits: HashMap<String, CaptionEdit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<Placement>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Placement {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
}
impl Default for Placement {
    fn default() -> Self {
        Self {
            x: 50.0,
            y: 50.0,
            scale: 1.0,
            opacity: 1.0,
        }
    }
}
impl Placement {
    pub fn valid(&self) -> bool {
        [self.x, self.y, self.scale, self.opacity]
            .iter()
            .all(|value| value.is_finite())
            && (0.0..=100.0).contains(&self.x)
            && (0.0..=100.0).contains(&self.y)
            && (0.1..=2.0).contains(&self.scale)
            && (0.0..=1.0).contains(&self.opacity)
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CaptionEdit {
    Text(String),
    Timed(CaptionOverride),
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionOverride {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<CaptionWord>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

impl CaptionEdit {
    pub fn validate(&self) -> bool {
        match self {
            Self::Text(_) => true,
            Self::Timed(value) => value.words.as_ref().is_none_or(|words| {
                words.iter().all(|word| {
                    word.start.is_finite()
                        && word.end.is_finite()
                        && word.start >= 0.0
                        && word.end >= word.start
                })
            }),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Composition {
    pub version: u8,
    pub revision: u64,
    pub fps: FrameRate,
    pub settings: Value,
    pub assets: Vec<Asset>,
    pub tracks: Vec<Track>,
    pub items: Vec<Item>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present_option"
    )]
    pub markers: Option<Vec<Marker>>,
}

pub fn render_settings(value: &Value) -> Result<crate::render::settings::RenderSettings, String> {
    let mut value = value.clone();
    let settings = value.as_object_mut().ok_or("Ajustes inválidos")?;
    settings.remove("editPlan");
    serde_json::from_value(value).map_err(|error| format!("Contrato dos ajustes inválido: {error}"))
}

impl Composition {
    pub fn duration_frames(&self) -> u64 {
        self.items
            .iter()
            .map(|item| item.start_frame.saturating_add(item.duration_frames))
            .max()
            .unwrap_or(0)
    }

    pub fn validate(&self) -> Result<(), String> {
        let invalid = || "Documento de montagem inválido".to_string();
        if self.version != 1
            || self.fps.numerator == 0
            || self.fps.denominator == 0
            || self.fps.numerator as f64 / self.fps.denominator as f64 > 60.0
            || self.duration_frames() > 9_007_199_254_740_991
        {
            return Err(invalid());
        }
        render_settings(&self.settings)?;
        let tracks: HashMap<_, _> = self.tracks.iter().map(|track| (&track.id, track)).collect();
        let assets: HashMap<_, _> = self.assets.iter().map(|asset| (&asset.id, asset)).collect();
        if tracks.len() != self.tracks.len()
            || assets.len() != self.assets.len()
            || self
                .tracks
                .iter()
                .filter(|track| track.primary && track.kind == "visual")
                .count()
                != 1
        {
            return Err(invalid());
        }
        if self.tracks.iter().any(|track| {
            track.id.is_empty()
                || !valid_name(&track.name)
                || !["visual", "audio", "caption"].contains(&track.kind.as_str())
                || (track.primary && track.kind != "visual")
                || track
                    .color
                    .as_ref()
                    .is_some_and(|color| !valid_color(color))
        }) || self.assets.iter().any(|asset| {
            asset.id.is_empty()
                || asset.media_id.is_empty()
                || asset.name.is_empty()
                || asset.duration_us > 9_007_199_254_740_991
        }) {
            return Err(invalid());
        }
        if let Some(markers) = &self.markers {
            let mut ids = HashSet::new();
            let mut frames = HashSet::new();
            if markers.iter().any(|marker| {
                marker.id.trim().is_empty()
                    || !valid_name(&marker.name)
                    || marker.frame > 9_007_199_254_740_991
                    || !valid_color(&marker.color)
                    || !ids.insert(&marker.id)
                    || !frames.insert(marker.frame)
            }) {
                return Err("Marcadores inválidos".into());
            }
        }
        let mut ids = HashSet::new();
        for item in &self.items {
            let track = tracks.get(&item.track_id).ok_or_else(invalid)?;
            let asset = assets.get(&item.asset_id).ok_or_else(invalid)?;
            let compatible = match item.kind {
                ItemKind::Video => track.kind == "visual" && asset.kind == MediaKind::Video,
                ItemKind::Image => track.kind == "visual" && asset.kind == MediaKind::Image,
                ItemKind::Audio => track.kind == "audio" && asset.kind != MediaKind::Image,
                ItemKind::Caption => track.kind == "caption" && asset.kind != MediaKind::Image,
            };
            if !compatible
                || item.id.is_empty()
                || item.group_id.is_empty()
                || !ids.insert(&item.id)
                || item.duration_frames == 0
                || item.start_frame.checked_add(item.duration_frames).is_none()
                || item.start_frame.saturating_add(item.duration_frames) > 9_007_199_254_740_991
                || item.source_start_us > item.source_end_us
                || (asset.kind != MediaKind::Image
                    && (item.source_end_us <= item.source_start_us
                        || item.source_end_us > asset.duration_us))
            {
                return Err(invalid());
            }
            render_settings(&item.settings)?;
            if item
                .placement
                .as_ref()
                .is_some_and(|placement| !placement.valid())
            {
                return Err("Posição ou escala inválida".into());
            }
            if item.caption_edits.values().any(|edit| !edit.validate()) {
                return Err("Tempos de legenda inválidos".into());
            }
        }
        for track in &self.tracks {
            let mut items: Vec<_> = self
                .items
                .iter()
                .filter(|item| item.track_id == track.id)
                .collect();
            items.sort_by_key(|item| item.start_frame);
            if items
                .windows(2)
                .any(|pair| pair[0].start_frame + pair[0].duration_frames > pair[1].start_frame)
            {
                return Err("Itens sobrepostos na mesma faixa".into());
            }
        }
        Ok(())
    }
}
