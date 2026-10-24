use super::{selection::Evaluate, types::Clip};
use crate::transcription::types::Segment;
use std::collections::{HashMap, HashSet};

pub fn is_complete(clip: &Clip) -> bool {
    clip.analysis.as_ref().is_none_or(|analysis| {
        analysis
            .criteria
            .iter()
            .filter(|criterion| ["Gancho", "Fechamento"].contains(&criterion.label.as_str()))
            .all(|criterion| criterion.score >= super::types::AUTOMATIC_RELEVANCE_FLOOR)
    })
}

pub fn retain_analyzed_complete(clips: &mut Vec<Clip>) {
    let before = clips.len();
    clips.retain(|clip| {
        clip.analysis.as_ref().is_none_or(|analysis| {
            let complete = is_complete(clip);
            if !complete {
                for criterion in &analysis.criteria {
                    if ["Gancho", "Fechamento"].contains(&criterion.label.as_str())
                        && criterion.score < super::types::AUTOMATIC_RELEVANCE_FLOOR
                    {
                        eprintln!(
                            "[clips] [{:.2}-{:.2}] recusado na análise final: {}={}; {}",
                            clip.start,
                            clip.end,
                            criterion.label,
                            criterion.score,
                            criterion
                                .explanation
                                .replace(['\r', '\n'], " ")
                                .chars()
                                .take(350)
                                .collect::<String>()
                        );
                    }
                }
            }
            complete
        })
    });
    eprintln!(
        "[clips] {} cortes recusados pela própria análise de abertura/fechamento",
        before - clips.len()
    );
}

pub fn recheck_adjusted(
    clips: &mut Vec<Clip>,
    original: &HashMap<String, (f64, f64)>,
    speech: &[Segment],
    evaluate: Evaluate<'_>,
) -> Result<(), String> {
    let adjusted = clips
        .iter()
        .filter(|clip| {
            original.get(&clip.id).is_some_and(|(start, end)| {
                (start - clip.start).abs() > 0.001 || (end - clip.end).abs() > 0.001
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    if adjusted.is_empty() {
        return Ok(());
    }
    let judgments = evaluate(&adjusted, speech)?;
    let mut seen = HashSet::new();
    let mut approved = HashSet::new();
    for judgment in judgments {
        let index = judgment
            .id
            .strip_prefix('E')
            .and_then(|n| n.parse::<usize>().ok())
            .and_then(|n| n.checked_sub(1));
        if let Some(index) = index.filter(|&index| index < adjusted.len()) {
            if seen.insert(index) && judgment.standalone && judgment.complete {
                let id = adjusted[index].id.as_str();
                if let Some(clip) = clips.iter_mut().find(|clip| clip.id == id) {
                    super::assessment::apply(clip, &judgment);
                }
                approved.insert(id);
            }
        }
    }
    let altered = adjusted
        .iter()
        .map(|clip| clip.id.as_str())
        .collect::<HashSet<_>>();
    let before = clips.len();
    clips.retain(|clip| !altered.contains(clip.id.as_str()) || approved.contains(clip.id.as_str()));
    eprintln!(
        "[clips] {} intervalos ajustados reavaliados; {} recusados por contexto/conclusão",
        adjusted.len(),
        before - clips.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_average_does_not_hide_an_interrupted_ending() {
        let mut clip: Clip = serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":0,"end":10,"title":"Uma ideia","score":80,"reasons":[],"review":"pending"})).unwrap();
        let mut clips = vec![clip.clone()];
        retain_analyzed_complete(&mut clips);
        assert_eq!(clips.len(), 1);
        clip.analysis = Some(serde_json::from_value(serde_json::json!({"title":"Uma ideia completa","summary":"Uma explicação que ainda não terminou no corte.","criteria":[
            {"label":"Gancho","score":95,"explanation":"Tema claro","evidence":"fala"},
            {"label":"Desenvolvimento","score":95,"explanation":"Conteúdo útil","evidence":"fala"},
            {"label":"Fechamento","score":30,"explanation":"A explicação continua depois","evidence":"fala"}]})).unwrap());
        let mut clips = vec![clip];
        retain_analyzed_complete(&mut clips);
        assert!(clips.is_empty());
    }

    #[test]
    fn changed_interval_requires_its_own_evaluation() {
        let clip: Clip = serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":0,"end":10,"title":"Uma ideia","score":90,"reasons":[],"review":"pending"})).unwrap();
        let original = HashMap::from([(clip.id.clone(), (0.0, 9.0))]);
        let mut clips = vec![clip];
        recheck_adjusted(&mut clips, &original, &[], &|pending, _| {
            assert_eq!(pending[0].end, 10.0);
            Ok(vec![])
        })
        .unwrap();
        assert!(clips.is_empty());
    }
}
