use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub title: String,
    pub score: u8,
    pub reasons: Vec<String>,
    pub review: Review,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis: Option<super::analysis_types::Analysis>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Review {
    Pending,
    Approved,
    Rejected,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipCollection {
    pub version: u8,
    pub media_id: String,
    pub transcript_hash: String,
    pub clips: Vec<Clip>,
}
impl ClipCollection {
    pub fn invalidate_analysis(&mut self, hash: String) {
        if self.transcript_hash != hash {
            for clip in &mut self.clips {
                clip.analysis = None;
                clip.review = Review::Pending;
            }
            self.transcript_hash = hash;
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub min_seconds: f64,
    pub max_seconds: f64,
    pub count: usize,
    #[serde(default)]
    pub format: Option<String>,
}
impl Options {
    pub fn validate(&self) -> Result<(), String> {
        if !self.min_seconds.is_finite()
            || !self.max_seconds.is_finite()
            || self.min_seconds < 10.0
            || self.max_seconds > 180.0
            || self.max_seconds < self.min_seconds
            || !(1..=12).contains(&self.count)
            || self
                .format
                .as_ref()
                .is_some_and(|v| !["16:9", "9:16", "1:1", "4:5"].contains(&v.as_str()))
        {
            return Err("Escolha de 1 a 12 cortes, com duração entre 10 e 180 segundos.".into());
        }
        Ok(())
    }
}
