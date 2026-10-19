use super::{parser, store};
use std::path::Path;

fn timestamp(time: f64) -> String {
    let ms = (time * 1000.0).round().max(0.0) as u64;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3_600_000,
        (ms / 60_000) % 60,
        (ms / 1000) % 60,
        ms % 1000
    )
}
pub fn contents(
    base: &Path,
    id: &str,
    media_id: &str,
    duration: f64,
    kind: &str,
) -> Result<String, String> {
    let record = store::load(base, id)?.ok_or("transcrição indisponível")?;
    if record.media_id != media_id {
        return Err("transcrição de outro vídeo".into());
    }
    parser::validate(&record.segments, duration)?;
    match kind {
        "txt" => Ok(record
            .segments
            .iter()
            .map(|s| super::words::clean_text(&s.text))
            .collect::<Vec<_>>()
            .join("\n\n")),
        "srt" => Ok(record
            .segments
            .iter()
            .enumerate()
            .map(|(i, s)| {
                format!(
                    "{}\r\n{} --> {}\r\n{}\r\n\r\n",
                    i + 1,
                    timestamp(s.start),
                    timestamp(s.end),
                    super::words::clean_text(&s.text)
                )
            })
            .collect()),
        _ => Err("formato não suportado".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exports_persisted_portuguese_text_and_millisecond_srt_with_media_validation() {
        let base = std::env::temp_dir().join(format!("cnp-srt-{}", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        let dir = base.join("cutnicepro/transcripts");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{id}.json")),r#"{"version":1,"mediaId":"m","language":"pt","model":"test","segments":[{"id":"s","start":3601.125,"end":3602.5,"text":"-Olá, ação!"}]}"#).unwrap();
        assert_eq!(
            contents(&base, &id, "m", 4000.0, "txt").unwrap(),
            "Olá, ação!"
        );
        assert_eq!(
            contents(&base, &id, "m", 4000.0, "srt").unwrap(),
            "1\r\n01:00:01,125 --> 01:00:02,500\r\nOlá, ação!\r\n\r\n"
        );
        assert!(contents(&base, &id, "another", 4000.0, "srt").is_err());
        assert!(contents(&base, &id, "m", 1.0, "srt").is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
}
