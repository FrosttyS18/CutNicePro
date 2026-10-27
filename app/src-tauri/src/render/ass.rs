use super::settings::{CaptionStyle, RenderSettings};
use crate::transcription::types::Segment;
#[path = "caption_cues.rs"]
mod cues;

pub fn timestamp(seconds: f64) -> String {
    let cs = (seconds.max(0.0) * 100.0).round() as u64;
    format!(
        "{}:{:02}:{:02}.{:02}",
        cs / 360_000,
        (cs / 6000) % 60,
        (cs / 100) % 60,
        cs % 100
    )
}
pub fn escape(text: &str) -> String {
    text.replace('\\', "＼")
        .replace('{', "｛")
        .replace('}', "｝")
        .replace(['\n', '\r'], " ")
}
fn color(value: &str) -> String {
    format!("&H00{}{}{}", &value[5..7], &value[3..5], &value[1..3])
}
fn override_color(value: &str) -> String {
    format!("&H{}{}{}&", &value[5..7], &value[3..5], &value[1..3])
}
fn styled(text: &str, style: &CaptionStyle) -> String {
    escape(&if style.uppercase {
        text.to_uppercase()
    } else {
        text.to_owned()
    })
}
fn event(out: &mut String, start: f64, end: f64, style: &str, text: &str) {
    if end > start {
        out.push_str(&format!(
            "Dialogue: 0,{},{},{style},,0,0,0,,{text}\n",
            timestamp(start),
            timestamp(end)
        ));
    }
}

fn group(
    out: &mut String,
    words: &[cues::Token],
    start: f64,
    end: f64,
    offset: f64,
    style: &CaptionStyle,
    position: &str,
) {
    let start = start.max(offset) - offset;
    let end = end - offset;
    if end <= start {
        return;
    }
    if style.effect == "none" {
        event(
            out,
            start,
            end,
            "Main",
            &format!(
                "{position}{}",
                words
                    .iter()
                    .map(|w| styled(&w.text, style))
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
        );
        return;
    }
    let mut boundaries = vec![start, end];
    for word in words {
        if let (Some(from), Some(until)) = (word.start, word.end) {
            boundaries.extend([
                (from - offset).clamp(start, end),
                (until - offset).clamp(start, end),
            ]);
        }
    }
    boundaries.sort_by(f64::total_cmp);
    boundaries.dedup();
    for interval in boundaries.windows(2) {
        let time = (interval[0] + interval[1]) / 2.0 + offset;
        let text = words
            .iter()
            .map(|word| {
                let active = word
                    .start
                    .zip(word.end)
                    .is_some_and(|(start, end)| time >= start && time < end);
                let emphasized = active
                    || (style.effect == "karaoke" && word.start.is_some_and(|start| time >= start));
                let tint = if emphasized {
                    &style.highlight_color
                } else {
                    &style.color
                };
                format!(
                    "{{\\c{}}}{}",
                    override_color(tint),
                    styled(&word.text, style)
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        event(
            out,
            interval[0],
            interval[1],
            "Main",
            &format!("{position}{text}"),
        );
    }
}
pub fn build(
    segments: &[Segment],
    settings: &RenderSettings,
    start: f64,
    end: f64,
) -> Result<String, String> {
    build_for_window(segments, settings, start..end, start..end)
}

pub(crate) fn build_for_window(
    segments: &[Segment],
    settings: &RenderSettings,
    window: std::ops::Range<f64>,
    bounds: std::ops::Range<f64>,
) -> Result<String, String> {
    let start = window.start;
    let end = window.end;
    let (width, height) = settings.dimensions()?;
    let mut out=format!("[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n");
    if let Some(style) = settings
        .caption_style
        .as_ref()
        .filter(|_| settings.caption_model > 0)
    {
        let size = style.size * width.min(height) as f64 / 1080.0;
        let outline = style.outline * width.min(height) as f64 / 1080.0;
        let background = if style.background == "transparent" {
            "&H80000000".into()
        } else {
            color(&style.background)
        };
        // a posição real vem do \pos por evento (y contínuo); alinhamento 5
        out.push_str(&format!("Style: Main,{},{size},{},{},{},{background},{},{},{},0,100,100,0,0,{},{outline},{},5,60,60,0,1\n",
            style.font,color(&style.color),color(&style.highlight_color),if style.background=="transparent" { color(&style.outline_color) } else { color(&style.background) },
            if style.weight>=600 { -1 } else { 0 },if style.italic { -1 } else { 0 },if style.underline { -1 } else { 0 },
            if style.background=="transparent" { 1 } else { 3 },if style.shadow { 2 } else { 0 }));
    }
    out.push_str("Style: Callout,Poppins,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,60,60,70,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n");
    if let Some(style) = settings
        .caption_style
        .as_ref()
        .filter(|_| settings.caption_model > 0)
    {
        let position = format!(
            "{{\\pos({:.2},{:.2})}}",
            width as f64 / 2.0,
            height as f64 * style.vertical()
        );
        for segment in segments.iter().filter(|s| s.start < end && s.end > start) {
            for cue in cues::groups(segment, bounds.start, bounds.end, style.per_line()) {
                group(
                    &mut out,
                    &cue.words,
                    cue.start.max(start),
                    cue.end.min(end),
                    start,
                    style,
                    &position,
                );
            }
        }
    }
    if !settings.text.is_empty() {
        event(
            &mut out,
            0.0,
            end - start,
            "Callout",
            &escape(&settings.text),
        );
    }
    Ok(out)
}
