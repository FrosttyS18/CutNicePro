use super::{
    scenes,
    types::{Clip, Options},
};
use crate::transcription::{process::ProcessControl, types::Segment};
use sha2::{Digest, Sha256};
use std::{path::Path, process::Command};

pub fn regions(clips: &[Clip], duration: f64) -> Vec<(f64, f64)> {
    let mut regions = clips
        .iter()
        .flat_map(|clip| [clip.start, clip.end])
        .map(|time| ((time - 1.0).max(0.0), (time + 1.0).min(duration)))
        .filter(|(start, end)| end > start)
        .collect::<Vec<_>>();
    regions.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut merged: Vec<(f64, f64)> = Vec::new();
    for (start, end) in regions {
        if let Some(last) = merged.last_mut().filter(|last| last.1 >= start) {
            last.1 = last.1.max(end);
        } else {
            merged.push((start, end));
        }
    }
    merged
}

pub fn refine(
    base: &Path,
    input: &Path,
    scratch: &Path,
    clips: &mut [Clip],
    speech: &[Segment],
    duration: f64,
    options: &Options,
    control: &ProcessControl,
) -> Result<(), String> {
    let windows = regions(clips, duration);
    let key = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(input.display().to_string(), duration, &windows))
                .map_err(|e| e.to_string())?
        )
    );
    let cached = base
        .join("cutnicepro/scene-cache")
        .join(format!("{key}.json"));
    let known = std::fs::read(&cached)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Vec<f64>>(&bytes).ok())
        .filter(|values| {
            values
                .iter()
                .all(|v| v.is_finite() && *v >= 0.0 && *v <= duration)
        });
    let times = if let Some(values) = known {
        values
    } else {
        let tools = crate::media_analyze::detect_fftools()
            .ok_or("FFmpeg não encontrado. Repare a instalação e tente novamente.")?;
        let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        let mut values = Vec::new();
        for (index, (start, end)) in windows.iter().enumerate() {
            control.check()?;
            let mut command = Command::new(&ffmpeg);
            command.current_dir(scratch).args(["-nostdin","-hide_banner","-loglevel","error","-threads","4","-ss",&start.to_string(),"-i"]).arg(input)
                .args(["-t",&(end-start).to_string(),"-map","0:v:0","-vf","scale=320:-2,scdet=threshold=10,metadata=mode=print:key=lavfi.scd.time:file=region-scenes.txt","-an","-f","null","-"]);
            control.run(command, &scratch.join(format!("scene-region-{index}.log")))?;
            let metadata = std::fs::read_to_string(scratch.join("region-scenes.txt"))
                .map_err(|e| e.to_string())?;
            values.extend(
                metadata
                    .lines()
                    .filter_map(scenes::timestamp)
                    .map(|time| time + start)
                    .filter(|time| *time >= *start && *time <= *end),
            );
        }
        control.check()?;
        if let Some(parent) = cached.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        crate::file_output::atomic_write(&cached, |file| {
            use std::io::Write;
            file.write_all(&serde_json::to_vec(&values).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())
        })?;
        values
    };
    for i in 0..clips.len() {
        let clip = &clips[i];
        let start = times
            .iter()
            .copied()
            .filter(|time| {
                *time <= clip.start
                    && clip.start - *time < 0.8
                    && !speech.iter().any(|s| s.start < clip.start && s.end > *time)
            })
            .max_by(f64::total_cmp)
            .unwrap_or(clip.start);
        let end = times
            .iter()
            .copied()
            .filter(|time| {
                *time >= clip.end
                    && *time - clip.end < 0.8
                    && !speech.iter().any(|s| s.end > clip.end && s.start < *time)
            })
            .min_by(f64::total_cmp)
            .unwrap_or(clip.end);
        if end - start <= options.max_seconds
            && end - start >= options.min_seconds
            && clips
                .iter()
                .enumerate()
                .all(|(j, other)| i == j || start >= other.end || end <= other.start)
        {
            clips[i].start = start;
            clips[i].end = end;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn short_regions_stay_near_candidates_instead_of_scanning_entire_video() {
        let clip = Clip {
            id: "a".repeat(64),
            start: 3600.0,
            end: 3660.0,
            title: "Trecho".into(),
            score: 0,
            reasons: vec![],
            review: super::super::types::Review::Pending,
            format: None,
            fit: None,
            analysis: None,
            analysis_error: None,
        };
        let selected = regions(&[clip], 7200.0);
        assert_eq!(selected, vec![(3599.0, 3601.0), (3659.0, 3661.0)]);
        assert_eq!(selected.iter().map(|(a, b)| b - a).sum::<f64>(), 4.0);
    }
}
