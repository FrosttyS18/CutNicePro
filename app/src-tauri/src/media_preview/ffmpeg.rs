use std::{path::Path, process::Command};

pub fn thumbnail(
    exe: &Path,
    input: &Path,
    output: &Path,
    index: usize,
    count: usize,
    duration: f64,
) -> Command {
    let mut cmd = Command::new(exe);
    cmd.args([
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-ss",
        &format!("{:.3}", (index as f64 + 0.5) * duration / count as f64),
        "-i",
    ])
    .arg(input)
    .args([
        "-an",
        "-frames:v",
        "1",
        "-vf",
        "scale=160:90:force_original_aspect_ratio=increase,crop=160:90",
        "-q:v",
        "4",
    ])
    .arg(output);
    cmd
}
pub fn audio(exe: &Path, input: &Path, output: &Path) -> Command {
    let mut cmd = Command::new(exe);
    cmd.args(["-nostdin", "-v", "error", "-y", "-i"])
        .arg(input)
        .args([
            "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le",
        ])
        .arg(output);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frame_seek_and_paths_are_separate_arguments_without_a_shell() {
        let cmd = thumbnail(
            Path::new("ffmpeg.exe"),
            Path::new("video com espaço.mp4"),
            Path::new("0.jpg"),
            0,
            24,
            240.0,
        );
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.windows(2).any(|a| a == ["-ss", "5.000"]));
        assert!(args.contains(&"video com espaço.mp4".into()));
        assert_eq!(cmd.get_program(), "ffmpeg.exe");
    }
    #[test]
    fn audio_has_explicit_pcm_contract_used_by_waveform() {
        let cmd = audio(
            Path::new("ffmpeg.exe"),
            Path::new("video.mp4"),
            Path::new("wave.pcm"),
        );
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.windows(2).any(|a| a == ["-ar", "16000"]));
        assert!(args.windows(2).any(|a| a == ["-f", "s16le"]));
        assert!(args.windows(2).any(|a| a == ["-map", "0:a:0"]));
    }
}
