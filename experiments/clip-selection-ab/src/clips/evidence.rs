use super::analysis_types::{Analysis, Criterion};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftCriterion {
    pub score: u8,
    pub explanation: String,
    pub evidence_id: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftAnalysis {
    pub title: String,
    pub summary: String,
    pub hook: DraftCriterion,
    pub development: DraftCriterion,
    pub closing: DraftCriterion,
}

pub fn quotes(source: &str) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut words = Vec::new();
    for word in source.split_whitespace() {
        words.push(word);
        if words.len() >= 28 || (words.len() >= 12 && word.ends_with(['.', '?', '!', '…'])) {
            result.push(words.join(" "));
            words.clear();
        }
    }
    if !words.is_empty() {
        if words.len() < 3 && !result.is_empty() {
            result
                .last_mut()
                .unwrap()
                .push_str(&format!(" {}", words.join(" ")));
        } else {
            result.push(words.join(" "));
        }
    }
    result
}

impl DraftAnalysis {
    pub fn ground(self, quotes: &[String], source: &str) -> Result<Analysis, String> {
        let mut criteria = Vec::new();
        for (label, item) in [
            ("Gancho", self.hook),
            ("Desenvolvimento", self.development),
            ("Fechamento", self.closing),
        ] {
            let evidence = quotes
                .get(item.evidence_id)
                .ok_or("A análise referenciou uma fala inexistente. Tente novamente.")?
                .clone();
            criteria.push(Criterion {
                label: label.into(),
                score: item.score,
                explanation: item.explanation,
                evidence,
            });
        }
        let value = Analysis {
            title: self.title,
            summary: self.summary,
            criteria,
        };
        value.validate(source)?;
        Ok(value)
    }
}

pub fn schema(quote_count: usize) -> serde_json::Value {
    let criterion = serde_json::json!({"type":"object","additionalProperties":false,"required":["score","explanation","evidenceId"],"properties":{
        "score":{"type":"integer","minimum":0,"maximum":100},"explanation":{"type":"string","minLength":20,"maxLength":600},
        "evidenceId":{"type":"integer","enum":(0..quote_count).collect::<Vec<_>>()}}});
    serde_json::json!({"type":"object","additionalProperties":false,"required":["title","summary","hook","development","closing"],"properties":{
        "title":{"type":"string","minLength":8,"maxLength":120},"summary":{"type":"string","minLength":40,"maxLength":1400},
        "hook":criterion,"development":criterion,"closing":criterion}})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grounds_references_in_source_and_rejects_unknown_ids() {
        let source="O jogo apagou o salvamento e travou depois que a criação do personagem falhou. O relato termina sem apresentar uma solução para recuperar o progresso perdido.";
        let quotes = quotes(source);
        let draft = |id| {
            serde_json::from_value::<DraftAnalysis>(serde_json::json!({"title":"Jogo trava e apaga o progresso","summary":"O participante relata uma falha na criação do personagem seguida da perda do salvamento. Não apresenta uma solução para recuperar o progresso.","hook":{"score":70,"explanation":"A falha no jogo apresenta o motivo da frustração.","evidenceId":id},"development":{"score":65,"explanation":"O relato descreve como o problema afetou a partida.","evidenceId":0},"closing":{"score":30,"explanation":"O encerramento não oferece uma solução para a perda.","evidenceId":0}})).unwrap()
        };
        let value = draft(0).ground(&quotes, source).unwrap();
        assert_eq!(value.criteria[0].evidence, quotes[0]);
        assert_eq!(value.criteria[0].label, "Gancho");
        assert!(draft(999).ground(&quotes, source).is_err());
    }
}
