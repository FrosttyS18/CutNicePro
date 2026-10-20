use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub fn identity(media: &str, start: f64, end: f64, format: Option<&str>) -> String {
    let mut value = format!("{media}:{start:.3}:{end:.3}");
    if let Some(format) = format {
        value.push(':');
        value.push_str(format);
    }
    format!("{:x}", Sha256::digest(value))
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_error: Option<String>,
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
    /// Metadados técnicos do motor que produziu a coleção (backend, modelo,
    /// template, amostragem). Não é conteúdo editorial — a UI não despeja
    /// textos internos; serve para reanálise pelo motor correto e para
    /// decidir quando uma análise antiga pode ser reaproveitada.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineRecord>,
}
impl ClipCollection {
    pub fn invalidate_analysis(&mut self, hash: String) {
        if self.transcript_hash != hash {
            for clip in &mut self.clips {
                clip.analysis = None;
                clip.analysis_error = None;
                clip.review = Review::Pending;
            }
            self.transcript_hash = hash;
        }
    }
}

/// Registro técnico do motor usado na geração (atualização 8: modo
/// experimental Gemma 4). `backend` distingue coleções e veda reuso de
/// análise entre motores diferentes.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineRecord {
    pub backend: String,
    pub model: String,
    pub template: String,
    pub sampling: String,
    pub seed: u32,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    /// Motor padrão de produção (Qwen3-4B local, ChatML + think vazio).
    #[default]
    Standard,
    /// Modo experimental de qualidade (Gemma-4-12B-IT QAT Q4_0 local) —
    /// fluxo validado na atualização 7 do experimento.
    ExperimentalGemma,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub min_seconds: f64,
    pub max_seconds: f64,
    pub count: usize,
    #[serde(default)]
    pub format: Option<String>,
    /// Escolha explícita de motor; ausente = padrão de produção. Nunca há
    /// troca silenciosa: o experimental falha com erro próprio se o modelo
    /// não estiver disponível.
    #[serde(default)]
    pub quality: Option<Quality>,
}
impl Options {
    pub fn quality(&self) -> Quality {
        self.quality.unwrap_or_default()
    }
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
