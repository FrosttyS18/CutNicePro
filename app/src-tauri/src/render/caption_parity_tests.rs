use super::ass;
use crate::render::settings::RenderSettings;
use crate::transcription::types::Segment;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    name: String,
    per_caption: u8,
    effect: String,
    segment: Segment,
    bounds: Option<Bounds>,
    samples: Vec<Sample>,
    edited: Option<Segment>,
    edited_samples: Option<Vec<Sample>>,
}

#[derive(Deserialize)]
struct Bounds {
    start: f64,
    end: f64,
}

#[derive(Deserialize)]
struct Sample {
    time: f64,
    texts: Vec<String>,
    active: Vec<usize>,
    spoken: Vec<usize>,
}

fn seconds(value: &str) -> f64 {
    let parts: Vec<f64> = value.split(':').map(|part| part.parse().unwrap()).collect();
    parts[0] * 3600.0 + parts[1] * 60.0 + parts[2]
}

pub(super) fn visible(output: &str, time: f64) -> Vec<(String, bool)> {
    let mut result = Vec::new();
    for line in output.lines().filter(|line| line.starts_with("Dialogue:")) {
        let fields: Vec<&str> = line.splitn(10, ',').collect();
        if time < seconds(fields[1]) || time >= seconds(fields[2]) {
            continue;
        }
        let mut highlighted = false;
        for part in fields[9].split('{') {
            let text = if let Some((tag, rest)) = part.split_once('}') {
                if tag.starts_with("\\c") {
                    highlighted = tag == "\\c&H00ff00&";
                }
                rest
            } else {
                part
            };
            result.extend(
                text.split_whitespace()
                    .map(|text| (text.to_owned(), highlighted)),
            );
        }
    }
    result
}

fn settings() -> RenderSettings {
    serde_json::from_value(serde_json::json!({"ratio":"9:16","fit":"cover","captionModel":2,
        "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
        "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#00ff00","effect":"highlight","position":"bottom","y":0.5,"wordsPerCaption":5},
        "volume":1,"muted":false,"background":"#000000","text":"","trimStart":0,"trimEnd":null})).unwrap()
}

#[test]
fn shared_preview_and_ass_cues_match_at_the_same_times() {
    let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
        "../../../src/test/fixtures/caption-parity.json"
    ))
    .unwrap();
    for fixture in fixtures {
        let mut config = settings();
        let style = config.caption_style.as_mut().unwrap();
        style.words_per_line = Some(fixture.per_caption);
        style.effect = fixture.effect.clone();
        let from = fixture
            .bounds
            .as_ref()
            .map(|bounds| bounds.start)
            .unwrap_or(fixture.segment.start);
        let until = fixture
            .bounds
            .as_ref()
            .map(|bounds| bounds.end)
            .unwrap_or(fixture.segment.end);
        for (segment, samples) in std::iter::once((fixture.segment, fixture.samples))
            .chain(fixture.edited.zip(fixture.edited_samples))
        {
            let output = ass::build(&[segment], &config, from, until).unwrap();
            for sample in samples {
                let shown = visible(&output, sample.time - from);
                assert_eq!(
                    shown
                        .iter()
                        .map(|(text, _)| text.clone())
                        .collect::<Vec<_>>(),
                    sample.texts,
                    "{} at {}",
                    fixture.name,
                    sample.time
                );
                let highlighted: Vec<usize> = shown
                    .iter()
                    .enumerate()
                    .filter_map(|(index, (_, active))| active.then_some(index))
                    .collect();
                assert_eq!(
                    highlighted,
                    if fixture.effect == "karaoke" {
                        sample.spoken
                    } else {
                        sample.active
                    },
                    "{} at {}",
                    fixture.name,
                    sample.time
                );
            }
        }
    }
}

#[test]
fn caption_size_outline_and_position_match_preview_reference_in_all_ratios() {
    for (ratio, width, height) in [
        ("9:16", 1080, 1920),
        ("1:1", 1080, 1080),
        ("4:5", 1080, 1350),
        ("16:9", 1920, 1080),
    ] {
        let mut config = settings();
        config.ratio = ratio.into();
        let output = ass::build(&[], &config, 0.0, 1.0).unwrap();
        let style: Vec<&str> = output
            .lines()
            .find(|line| line.starts_with("Style: Main,"))
            .unwrap()
            .split(',')
            .collect();
        assert_eq!(style[2].parse::<f64>().unwrap(), 64.0, "font {ratio}");
        assert_eq!(style[16].parse::<f64>().unwrap(), 2.0, "outline {ratio}");
        assert!(output.contains(&format!("PlayResX: {width}")));
        assert!(output.contains(&format!("PlayResY: {height}")));
    }
}
