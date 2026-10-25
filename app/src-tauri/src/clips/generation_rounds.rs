use super::types::Clip;

pub fn extend(
    fresh: &mut Vec<Clip>,
    automatic: bool,
    limit: usize,
    next: impl FnOnce(&[Clip]) -> Result<Vec<Clip>, String>,
) -> Result<(), String> {
    if fresh.is_empty() || (automatic && fresh.len() < limit) {
        let additional = next(fresh)?;
        fresh.extend(additional);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(id: &str) -> Clip {
        serde_json::from_value(serde_json::json!({"id":id.repeat(64),"start":0,"end":20,"title":"Uma história completa","score":80,"reasons":[],"review":"pending"})).unwrap()
    }

    #[test]
    fn automatic_search_looks_for_other_stories_after_the_first_usable_results() {
        let mut fresh = vec![clip("a"), clip("b")];
        let before = serde_json::to_value(&fresh).unwrap();
        let mut calls = 0;
        extend(&mut fresh, true, 12, |attempted| {
            calls += 1;
            assert_eq!(serde_json::to_value(attempted).unwrap(), before);
            Ok(vec![clip("c"), clip("d")])
        })
        .unwrap();
        assert_eq!(calls, 1);
        assert_eq!(fresh.len(), 4);
        assert_eq!(serde_json::to_value(&fresh[..2]).unwrap(), before);
    }

    #[test]
    fn a_second_search_is_bounded_and_does_not_change_custom_success() {
        for automatic in [false, true] {
            let mut fresh = vec![clip("a")];
            extend(&mut fresh, automatic, 1, |_| {
                panic!("nenhuma busca adicional esperada")
            })
            .unwrap();
        }
        let mut empty = Vec::new();
        extend(&mut empty, false, 3, |_| Ok(vec![clip("b")])).unwrap();
        assert_eq!(empty.len(), 1);
    }

    #[test]
    fn a_failed_additional_search_preserves_results_for_error_recovery() {
        let mut fresh = vec![clip("a")];
        let before = serde_json::to_value(&fresh).unwrap();
        assert!(extend(&mut fresh, true, 12, |_| Err("cancelled".into())).is_err());
        assert_eq!(serde_json::to_value(fresh).unwrap(), before);
    }
}
