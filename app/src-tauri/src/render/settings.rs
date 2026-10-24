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
    /// Posição vertical contínua (0,1–0,9); rascunhos antigos usam `position`.
    pub y: Option<f64>,
    /// Palavras por legenda (1–8); rascunhos antigos usam 5.
    /// Alias: a UI envia `wordsPerCaption` (lib/captions.ts) — sem ele o
    /// serde rejeitava o export inteiro (deny_unknown_fields).
    #[serde(alias = "wordsPerCaption")]
    pub words_per_line: Option<u8>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FocalPoint {
    pub x: f64,
    pub y: f64,
}
/// Ajustes visuais do vídeo (paridade SupoClip); neutro = 100/100/100/0/0.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Effects {
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub blur: f64,
    pub hue: f64,
}
impl Effects {
    pub fn neutral(&self) -> bool {
        self.brightness == 100.0
            && self.contrast == 100.0
            && self.saturation == 100.0
            && self.blur == 0.0
            && self.hue == 0.0
    }
    pub fn valid(&self) -> bool {
        (40.0..=180.0).contains(&self.brightness)
            && (40.0..=180.0).contains(&self.contrast)
            && (0.0..=220.0).contains(&self.saturation)
            && (0.0..=8.0).contains(&self.blur)
            && (-180.0..=180.0).contains(&self.hue)
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderSettings {
    pub ratio: String,
    pub fit: String,
    pub focal_point: Option<FocalPoint>,
    /// Ampliação 1–3 aplicada à imagem (paridade SupoClip).
    pub zoom: Option<f64>,
    pub effects: Option<Effects>,
    pub caption_model: u8,
    pub caption_style: Option<CaptionStyle>,
    pub text: String,
    pub volume: f64,
    pub muted: bool,
    pub background: String,
    pub trim_start: f64,
    pub trim_end: Option<f64>,
    /// Dimensões do vídeo de origem (preenchidas pelo backend com a análise real).
    pub source_width: Option<u32>,
    pub source_height: Option<u32>,
    /// Plano de edição multi-intervalo (M2 cortes-multimodais): tempos da
    /// mídia ORIGINAL em segundos; quando presente e válido, substitui
    /// trim_start/trim_end na exportação. Ausente/vazio = intervalo único do
    /// trim (projetos antigos, sem migração).
    pub segments: Option<Vec<RenderSegment>>,
}

/** Intervalo de mídia original incluído na composição (segundos). */
#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderSegment {
    pub source_start: f64,
    pub source_end: f64,
}

impl RenderSegment {
    pub fn duration(&self) -> f64 {
        self.source_end - self.source_start
    }
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
            && self
                .y
                .is_none_or(|y| y.is_finite() && (0.1..=0.9).contains(&y))
            && self.words_per_line.is_none_or(|n| (1..=8).contains(&n))
    }
    /** Posição vertical efetiva: y contínuo ou derivado da posição antiga. */
    pub fn vertical(&self) -> f64 {
        self.y.unwrap_or(match self.position.as_str() {
            "top" => 0.14,
            "middle" => 0.5,
            _ => 0.86,
        })
    }
    pub fn per_line(&self) -> usize {
        self.words_per_line.unwrap_or(5).max(1) as usize
    }
}
impl RenderSettings {
    /// Intervalos efetivos da composição: plano multi-segmento validado ou o
    /// intervalo único do trim (validate). Mesma semântica da prévia
    /// (`effectiveSegments` em edit-plan.ts) — os três consumidores
    /// (prévia/timeline/export) devem concordar.
    pub fn effective_segments(&self, duration: f64) -> Result<Vec<RenderSegment>, String> {
        let Some(segments) = self.segments.as_ref().filter(|list| !list.is_empty()) else {
            let (start, end) = self.validate(duration)?;
            return Ok(vec![RenderSegment {
                source_start: start,
                source_end: end,
            }]);
        };
        let mut previous_end = f64::NEG_INFINITY;
        for segment in segments {
            if !segment.source_start.is_finite()
                || !segment.source_end.is_finite()
                || segment.source_start < 0.0
                || segment.source_end > duration + 1e-6
                || segment.duration() < 0.05
                || segment.source_start < previous_end - 1e-6
            {
                return Err("Revise os segmentos do corte e tente novamente.".into());
            }
            previous_end = segment.source_end;
        }
        Ok(segments.clone())
    }
    pub fn dimensions(&self) -> Result<(u32, u32), String> {
        match self.ratio.as_str() {
            "16:9" => Ok((1920, 1080)),
            "9:16" => Ok((1080, 1920)),
            "1:1" => Ok((1080, 1080)),
            "4:5" => Ok((1080, 1350)),
            // proporção da fonte, limitada a 1920 no maior lado (paridade SupoClip)
            "original" => {
                let (sw, sh) = self.source_size()?;
                let scale = 1920.0 / sw.max(sh) as f64;
                let scale = if scale > 1.0 { 1.0 } else { scale };
                Ok((
                    ((sw as f64 * scale).floor() as u32 / 2 * 2).max(2),
                    ((sh as f64 * scale).floor() as u32 / 2 * 2).max(2),
                ))
            }
            _ => Err("Escolha uma proporção válida.".into()),
        }
    }
    fn source_size(&self) -> Result<(u32, u32), String> {
        match (self.source_width, self.source_height) {
            (Some(w), Some(h)) if w >= 2 && h >= 2 => Ok((w, h)),
            _ => Err("Reconecte o vídeo para usar esta proporção.".into()),
        }
    }
    fn focal(&self) -> (f64, f64) {
        self.focal_point
            .as_ref()
            .map(|p| (p.x / 100.0, p.y / 100.0))
            .unwrap_or((0.5, 0.5))
    }
    pub fn validate(&self, duration: f64) -> Result<(f64, f64), String> {
        self.dimensions()?;
        let end = self.trim_end.unwrap_or(duration);
        if !["contain", "cover"].contains(&self.fit.as_str())
            || !color(&self.background)
            || !self.volume.is_finite()
            || !(0.0..=2.0).contains(&self.volume)
            || self.caption_model > 9
            || self.text.chars().count() > 240
            || self
                .zoom
                .is_some_and(|z| !z.is_finite() || !(1.0..=3.0).contains(&z))
            || self
                .zoom
                .is_some_and(|z| z > 1.0 && self.source_size().is_err())
            || self.effects.as_ref().is_some_and(|fx| !fx.valid())
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
    /**
     * Geometria com zoom e âncora focal (paridade SupoClip): escala, corte do
     * excedente e letterbox posicionados pela mesma âncora. Sem dimensões de
     * origem, usa o filtro clássico (sem zoom).
     */
    pub fn geometry(&self) -> Result<String, String> {
        let (width, height) = self.dimensions()?;
        let (fx, fy) = self.focal();
        let zoom = self.zoom.unwrap_or(1.0);
        if let Ok((sw, sh)) = self.source_size() {
            let pick = if self.fit == "cover" {
                f64::max
            } else {
                f64::min
            };
            let scale = pick(width as f64 / sw as f64, height as f64 / sh as f64) * zoom;
            let even = |value: f64| ((value.round() as i64) / 2 * 2).max(2) as u32;
            let (rw, rh) = (even(sw as f64 * scale), even(sh as f64 * scale));
            let cw = width.min(rw);
            let ch = height.min(rh);
            let (crop_x, crop_y) = (
                ((rw - cw) as f64 * fx) as u32,
                ((rh - ch) as f64 * fy) as u32,
            );
            let (pad_x, pad_y) = (
                ((width - cw) as f64 * fx) as u32,
                ((height - ch) as f64 * fy) as u32,
            );
            return Ok(format!(
                "scale={rw}:{rh},crop={cw}:{ch}:{crop_x}:{crop_y},pad={width}:{height}:{pad_x}:{pad_y}:color={},setsar=1",
                self.background
            ));
        }
        if self.fit == "cover" {
            Ok(format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}:(iw-ow)*{fx}:(ih-oh)*{fy},setsar=1"))
        } else {
            Ok(format!("scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={},setsar=1",self.background))
        }
    }
    /**
     * Filtro de efeitos (aplicado ao vídeo, antes das legendas): brilho/contraste
     * via LUT RGB combinada, matiz/saturação via hue e desfoque proporcional à
     * largura — mesma fórmula do SupoClip.
     */
    pub fn effects_filter(&self) -> Option<String> {
        let fx = self.effects.as_ref()?;
        if fx.neutral() {
            return None;
        }
        let width = self.dimensions().ok()?.0 as f64;
        let gain = fx.brightness / 100.0 * fx.contrast / 100.0;
        let offset = 128.0 * (1.0 - fx.contrast / 100.0);
        let mut filter = format!(
            "lutrgb=r='clip(val*{gain:.4}+{offset:.2},0,255)':g='clip(val*{gain:.4}+{offset:.2},0,255)':b='clip(val*{gain:.4}+{offset:.2},0,255)',hue=h={}:s={:.4}",
            fx.hue,
            fx.saturation / 100.0
        );
        if fx.blur > 0.0 {
            filter.push_str(&format!(",gblur=sigma={:.4}", fx.blur * width / 1080.0));
        }
        Some(filter)
    }
}
