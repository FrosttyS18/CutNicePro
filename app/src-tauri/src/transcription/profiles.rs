use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Profile {
    Turbo,
    Large,
}
impl Profile {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("turbo") {
            "turbo" => Ok(Self::Turbo),
            "large" => Ok(Self::Large),
            _ => Err("Escolha uma opção de transcrição disponível.".into()),
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Turbo => "turbo",
            Self::Large => "large",
        }
    }
    pub fn model(self) -> &'static str {
        match self {
            Self::Turbo => "whisper-large-v3-turbo",
            Self::Large => "whisper-large-v3",
        }
    }
    pub fn filename(self) -> &'static str {
        match self {
            Self::Turbo => "ggml-large-v3-turbo.bin",
            Self::Large => "ggml-large-v3.bin",
        }
    }
    pub fn alignment(self) -> &'static str {
        match self {
            Self::Turbo => "large.v3.turbo",
            Self::Large => "large.v3",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatus {
    pub id: &'static str,
    pub available: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_selects_exactly_one_model_and_matching_alignment() {
        assert_eq!(Profile::parse(None).unwrap(), Profile::Turbo);
        let full = Profile::parse(Some("large")).unwrap();
        assert_eq!(full.filename(), "ggml-large-v3.bin");
        assert_eq!(full.alignment(), "large.v3");
        assert_ne!(full.model(), Profile::Turbo.model());
        assert!(Profile::parse(Some("../base")).is_err());
        assert!(Profile::parse(Some("qwen")).is_err());
    }
}
