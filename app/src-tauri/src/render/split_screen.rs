use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Panel {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SplitScreen {
    pub version: u8,
    #[serde(default)]
    pub face_validated: bool,
    pub top: Panel,
    pub bottom: Panel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shots: Option<Vec<SplitShot>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SplitShot {
    pub source_start: f64,
    pub source_end: f64,
    pub top: Panel,
    pub bottom: Panel,
}

impl SplitShot {
    fn valid(&self) -> bool {
        self.source_start.is_finite()
            && self.source_end.is_finite()
            && self.source_start >= 0.0
            && self.source_end - self.source_start >= 0.05
            && self.top.valid()
            && self.bottom.valid()
    }
}

impl Panel {
    pub fn valid(&self) -> bool {
        [self.x, self.y]
            .iter()
            .all(|n| n.is_finite() && (0.0..=100.0).contains(n))
            && self.zoom.is_finite()
            && (1.0..=3.0).contains(&self.zoom)
    }

    fn geometry(&self, width: u32, height: u32) -> String {
        let scale = (1080.0 / width as f64).max(960.0 / height as f64) * self.zoom;
        let even_up = |value: f64| (value / 2.0).ceil() as u32 * 2;
        let w = even_up(width as f64 * scale);
        let h = even_up(height as f64 * scale);
        let x = (((w - 1080) as f64 * self.x / 100.0 / 2.0).floor() as u32) * 2;
        let y = (((h - 960) as f64 * self.y / 100.0 / 2.0).floor() as u32) * 2;
        format!("scale={w}:{h},crop=1080:960:{x}:{y},setsar=1")
    }
}

impl SplitScreen {
    pub fn valid(&self) -> bool {
        if self.version != 1 || !self.face_validated || !self.top.valid() || !self.bottom.valid() {
            return false;
        }
        self.shots.as_ref().is_none_or(|shots| {
            !shots.is_empty()
                && shots.len() <= 64
                && shots.iter().all(SplitShot::valid)
                && shots
                    .windows(2)
                    .all(|pair| pair[0].source_end <= pair[1].source_start)
        })
    }

    pub fn at(&self, source_time: f64) -> Option<Self> {
        match &self.shots {
            None => Some(self.clone()),
            Some(shots) => shots
                .iter()
                .find(|shot| source_time >= shot.source_start && source_time < shot.source_end)
                .map(|shot| Self {
                    version: self.version,
                    face_validated: self.face_validated,
                    top: shot.top.clone(),
                    bottom: shot.bottom.clone(),
                    shots: None,
                }),
        }
    }

    pub fn geometry(&self, width: u32, height: u32) -> Result<String, String> {
        if !self.valid() || width < 2 || height < 2 {
            return Err(
                "Localize e confirme duas pessoas no editor antes de exportar a tela dividida."
                    .into(),
            );
        }
        Ok(format!(
            "split=2[top][bottom];[top]{}[t];[bottom]{}[b];[t][b]vstack=inputs=2,setsar=1",
            self.top.geometry(width, height),
            self.bottom.geometry(width, height)
        ))
    }
}
