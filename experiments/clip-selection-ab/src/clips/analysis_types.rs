use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Criterion {
    pub label: String,
    pub score: u8,
    pub explanation: String,
    pub evidence: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Analysis {
    pub title: String,
    pub summary: String,
    pub criteria: Vec<Criterion>,
}

fn normalized(value: &str) -> String {
    value
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

impl Analysis {
    pub fn validate_shape(&self) -> Result<(), String> {
        if !(8..=120).contains(&self.title.chars().count())
            || !(40..=1400).contains(&self.summary.chars().count())
            || self.criteria.len() != 3
            || self
                .criteria
                .iter()
                .zip(["Gancho", "Desenvolvimento", "Fechamento"])
                .any(|(item, label)| {
                    item.label != label
                        || item.score > 100
                        || !(20..=600).contains(&item.explanation.chars().count())
                        || item.evidence.split_whitespace().count() < 3
                        || item.evidence.len() > 600
                })
        {
            return Err(
                "A análise não apresentou evidências válidas do trecho. Tente analisar novamente."
                    .into(),
            );
        }
        Ok(())
    }
    pub fn validate(&self, source: &str) -> Result<(), String> {
        self.validate_shape()?;
        let text = normalized(source);
        if self
            .criteria
            .iter()
            .any(|item| !text.contains(&normalized(&item.evidence)))
        {
            return Err(
                "A análise não apresentou evidências válidas do trecho. Tente analisar novamente."
                    .into(),
            );
        }
        Ok(())
    }
    pub fn score(&self) -> u8 {
        ((u16::from(self.criteria[0].score) * 4
            + u16::from(self.criteria[1].score) * 3
            + u16::from(self.criteria[2].score) * 3)
            / 10) as u8
    }
}
