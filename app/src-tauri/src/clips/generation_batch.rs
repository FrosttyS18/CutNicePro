use super::types::Clip;
use sha2::{Digest, Sha256};

pub fn publish(clips: &mut [Clip], batch: &str, at_ms: u64) {
    for clip in clips {
        clip.id = format!("{:x}", Sha256::digest(format!("{batch}:{}", clip.id)));
        clip.created_at_ms = Some(at_ms);
    }
}

#[cfg(test)]
mod tests {
    use super::super::types::{ClipCollection, EngineRecord};
    use super::*;

    fn clip() -> Clip {
        serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":10.0,"end":30.0,"title":"Um acontecimento completo","score":80,"reasons":[],"review":"pending","format":"9:16"})).unwrap()
    }

    #[test]
    fn regeneration_keeps_both_versions_and_saved_reviews_in_the_store() {
        for (review, deleted) in [
            ("pending", false),
            ("approved", false),
            ("rejected", false),
            ("pending", true),
        ] {
            let mut first = clip();
            first.review = serde_json::from_str(&format!("\"{review}\"")).unwrap();
            first.deleted = Some(deleted);
            publish(std::slice::from_mut(&mut first), "first-run", 100);
            let before = serde_json::to_value(&first).unwrap();
            let mut second = clip();
            publish(std::slice::from_mut(&mut second), "second-run", 200);
            let collection = ClipCollection {
                version: 1,
                media_id: "m".into(),
                transcript_hash: "h".into(),
                clips: vec![first, second],
                engine: Some(EngineRecord {
                    backend: "qwen35".into(),
                    model: "qwen".into(),
                    template: "canonical".into(),
                    sampling: "fixed".into(),
                    seed: 42,
                }),
            };
            super::super::store::validate(&collection, 60.0)
                .expect("versões repetidas precisam continuar salváveis");
            let restored: ClipCollection =
                serde_json::from_slice(&serde_json::to_vec(&collection).unwrap()).unwrap();
            assert_ne!(restored.clips[0].id, restored.clips[1].id);
            assert_eq!(serde_json::to_value(&restored.clips[0]).unwrap(), before);
            assert_eq!(restored.clips[1].created_at_ms, Some(200));
            assert_eq!(
                (restored.clips[1].start, restored.clips[1].end),
                (10.0, 30.0)
            );
        }
    }
}
