use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
};

fn supported(output: &str) -> bool {
    output
        .lines()
        .any(|line| line.contains("Device 0:") && line.contains("compute capability"))
        && output.contains("loaded CUDA backend")
}

pub fn executable(root: &Path) -> Option<PathBuf> {
    static PROBE: OnceLock<(PathBuf, bool)> = OnceLock::new();
    let path = root.join("gpu/Release/whisper-cli.exe");
    if !cfg!(windows) || !path.is_file() {
        return None;
    }
    let available = match PROBE.get().filter(|(previous, _)| previous == &path) {
        Some((_, ready)) => *ready,
        None => {
            let probe = path.with_file_name("parakeet-cli.exe");
            let mut command = Command::new(probe);
            command
                .arg("--help")
                .stdin(Stdio::null())
                .stdout(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            let ready = command.output().is_ok_and(|output| {
                output.status.success() && supported(&String::from_utf8_lossy(&output.stderr))
            });
            let _ = PROBE.set((path.clone(), ready));
            ready
        }
    };
    available.then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gpu_probe_requires_detected_device_and_loaded_cuda_backend() {
        assert!(supported("Device 0: NVIDIA GeForce RTX 5070, compute capability 12.0\nload_backend: loaded CUDA backend"));
        assert!(!supported("load_backend: loaded CPU backend"));
        assert!(!supported(
            "load_backend: loaded CUDA backend\nggml_cuda_init: no CUDA-capable device is detected"
        ));
    }
}
