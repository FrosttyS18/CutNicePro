use super::types::{render_settings, Composition, Item, ItemKind};
use std::collections::BTreeSet;

pub struct Window {
    pub start: u64,
    pub end: u64,
}

pub fn source_time(document: &Composition, item: &Item, frame: u64) -> f64 {
    let elapsed = frame.saturating_sub(item.start_frame) as f64 * document.fps.denominator as f64
        / document.fps.numerator as f64;
    (item.source_start_us as f64 / 1_000_000.0 + elapsed)
        .min(item.source_end_us as f64 / 1_000_000.0)
}

fn source_audio_pair(document: &Composition, video: &Item, audio: &Item) -> bool {
    video.kind == ItemKind::Video
        && audio.kind == ItemKind::Audio
        && audio.follows_main
        && video.asset_id == audio.asset_id
        && video.group_id == audio.group_id
        && video.start_frame == audio.start_frame
        && video.duration_frames == audio.duration_frames
        && video.source_start_us == audio.source_start_us
        && video.source_end_us == audio.source_end_us
        && document
            .tracks
            .iter()
            .any(|track| track.id == video.track_id && track.kind == "visual")
        && document
            .tracks
            .iter()
            .any(|track| track.id == audio.track_id && track.kind == "audio")
}

fn source_audio_muted(document: &Composition, audio: &Item) -> bool {
    let mut videos = document
        .items
        .iter()
        .filter(|video| source_audio_pair(document, video, audio));
    let Some(video) = videos.next() else {
        return false;
    };
    if videos.next().is_some()
        || !document
            .tracks
            .iter()
            .any(|track| track.id == video.track_id && track.muted)
    {
        return false;
    }
    document
        .items
        .iter()
        .filter(|candidate| source_audio_pair(document, video, candidate))
        .take(2)
        .count()
        == 1
}

pub fn active(document: &Composition, frame: u64) -> Vec<&Item> {
    let mut result = Vec::new();
    for track in &document.tracks {
        if track.hidden {
            continue;
        }
        for item in document.items.iter().filter(|item| {
            item.track_id == track.id
                && item.start_frame <= frame
                && item.start_frame + item.duration_frames > frame
        }) {
            if item.kind == ItemKind::Audio
                && (track.muted
                    || item.settings.get("muted").and_then(|value| value.as_bool()) == Some(true)
                    || source_audio_muted(document, item))
            {
                continue;
            }
            result.push(item);
        }
    }
    result
}

pub fn windows(document: &Composition) -> Result<Vec<Window>, String> {
    document.validate()?;
    let duration = document.duration_frames();
    if duration == 0 {
        return Err("Adicione conteúdo à montagem antes de exportar".into());
    }
    let mut edges = BTreeSet::from([0, duration]);
    for item in &document.items {
        edges.insert(item.start_frame);
        edges.insert(item.start_frame + item.duration_frames);
        if let Some(layout) = render_settings(&item.settings)?
            .split_screen
            .filter(|layout| layout.valid())
        {
            for shot in layout.shots.iter().flatten() {
                for source in [shot.source_start, shot.source_end] {
                    let offset = (source - item.source_start_us as f64 / 1_000_000.0)
                        * document.fps.numerator as f64
                        / document.fps.denominator as f64;
                    if offset > 0.0 && offset < item.duration_frames as f64 {
                        edges.insert(item.start_frame + offset.round() as u64);
                    }
                }
            }
        }
    }
    let edges: Vec<_> = edges.into_iter().collect();
    Ok(edges
        .windows(2)
        .filter(|pair| pair[1] > pair[0])
        .map(|pair| Window {
            start: pair[0],
            end: pair[1],
        })
        .collect())
}
