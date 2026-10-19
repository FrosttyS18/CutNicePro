use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionStyle {
    pub font: String,
    pub size: f64,
    pub weight: u16,
    pub color: String,
    pub italic: bool,
    pub underline: bool,
    pub uppercase: bool,
    pub outline: f64,
    pub outline_color: String,
    pub shadow: bool,
    pub background: String,
    pub highlight_color: String,
    pub effect: String,
    pub position: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FocalPoint {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderSettings {
    pub ratio: String,
    pub fit: String,
    pub focal_point: Option<FocalPoint>,
    pub caption_model: u8,
    pub caption_style: Option<CaptionStyle>,
    pub text: String,
    pub volume: f64,
    pub muted: bool,
    pub background: String,
    pub trim_start: f64,
    pub trim_end: Option<f64>,
}
pub fn color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}
impl CaptionStyle {
    pub fn validate(&self) -> bool {
        [
            "Poppins",
            "Arial",
            "Georgia",
            "Impact",
            "Verdana",
            "Courier New",
        ]
        .contains(&self.font.as_str())
            && self.size.is_finite()
            && (16.0..=160.0).contains(&self.size)
            && [400, 600, 700].contains(&self.weight)
            && color(&self.color)
            && color(&self.outline_color)
            && color(&self.highlight_color)
            && self.outline.is_finite()
            && (0.0..=12.0).contains(&self.outline)
            && (self.background == "transparent" || color(&self.background))
            && ["none", "highlight", "karaoke"].contains(&self.effect.as_str())
            && ["bottom", "middle", "top"].contains(&self.position.as_str())
    }
}
impl RenderSettings {
    pub fn dimensions(&self) -> Result<(u32, u32), String> {
        match self.ratio.as_str() {
            "16:9" => Ok((1920, 1080)),
            "9:16" => Ok((1080, 1920)),
            "1:1" => Ok((1080, 1080)),
            "4:5" => Ok((1080, 1350)),
            _ => Err("Escolha uma proporção válida.".into()),
        }
    }
    pub fn validate(&self, duration: f64) -> Result<(f64, f64), String> {
        self.dimensions()?;
        let end = self.trim_end.unwrap_or(duration);
        if !["contain", "cover"].contains(&self.fit.as_str())
            || !color(&self.background)
            || !self.volume.is_finite()
            || !(0.0..=1.0).contains(&self.volume)
            || self.caption_model > 9
            || self.text.chars().count() > 240
            || self.focal_point.as_ref().is_some_and(|point| {
                [point.x, point.y]
                    .iter()
                    .any(|v| !v.is_finite() || !(0.0..=100.0).contains(v))
            })
            || self
                .caption_style
                .as_ref()
                .is_some_and(|style| !style.validate())
            || (self.caption_model > 0 && self.caption_style.is_none())
        {
            return Err("Revise as configurações do vídeo antes de exportar.".into());
        }
        if !duration.is_finite()
            || duration <= 0.0
            || !self.trim_start.is_finite()
            || !end.is_finite()
            || self.trim_start < 0.0
            || end > duration
            || end - self.trim_start < 0.05
        {
            return Err("Escolha um intervalo válido para exportar.".into());
        }
        Ok((self.trim_start, end))
    }
    pub fn geometry(&self) -> Result<String, String> {
        let (width, height) = self.dimensions()?;
        if self.fit == "cover" {
            let (x, y) = self
                .focal_point
                .as_ref()
                .map(|p| (p.x / 100.0, p.y / 100.0))
                .unwrap_or((0.5, 0.5));
            Ok(format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}:(iw-ow)*{x}:(ih-oh)*{y},setsar=1"))
        } else {
            Ok(format!("scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={},setsar=1",self.background))
        }
    }
}
