use crate::transcription::process::ProcessControl;
use std::{path::Path, process::Command};

pub fn timestamp(line: &str) -> Option<f64> {
    let value = line
        .trim()
        .strip_prefix("lavfi.scd.time=")?
        .parse::<f64>()
        .ok()?;
    (value.is_finite() && value >= 0.0).then_some(value)
}
pub fn analyze(
    input: &Path,
    scratch: &Path,
    duration: f64,
    control: &ProcessControl,
    mut progress: impl FnMut(u8),
) -> Result<Vec<f64>, String> {
    let tools = crate::media_analyze::detect_fftools()
        .ok_or("FFmpeg não encontrado. Repare a instalação e tente novamente.")?;
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let metadata = scratch.join("scenes.txt");
    let mut command = Command::new(ffmpeg);
    command.current_dir(scratch).args(["-nostdin","-hide_banner","-loglevel","error","-threads","4","-i"]).arg(input)
        .args(["-map","0:v:0","-vf","scale=320:-2,scdet=threshold=10,metadata=mode=print:key=lavfi.scd.time:file=scenes.txt","-an","-progress","pipe:2","-nostats","-f","null","-"]);
    control.run_with_output(&mut command, &scratch.join("analysis.log"), |line| {
        if let Some(us) = line
            .strip_prefix("out_time_us=")
            .and_then(|v| v.parse::<f64>().ok())
        {
            if us.is_finite() {
                progress((us / 1_000_000.0 / duration * 95.0).clamp(0.0, 95.0) as u8);
            }
        }
    })?;
    control.check()?;
    let raw =
        std::fs::read_to_string(metadata).map_err(|e| format!("falha na análise de cenas: {e}"))?;
    Ok(raw
        .lines()
        .filter_map(timestamp)
        .filter(|time| *time <= duration)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_only_real_scene_times_and_rejects_invalid_numbers() {
        assert_eq!(timestamp("lavfi.scd.time=3.25"), Some(3.25));
        assert_eq!(timestamp("pts_time=3.25"), None);
        assert_eq!(timestamp("lavfi.scd.time=NaN"), None);
        assert_eq!(timestamp("lavfi.scd.time=-1"), None);
    }
}
