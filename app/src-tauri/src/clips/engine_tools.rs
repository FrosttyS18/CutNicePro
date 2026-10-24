use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub const MODEL_NAME: &str = "Qwen3.5-4B-Q4_K_M.gguf";
pub const CONTEXT_TOKENS: usize = 32768;

pub struct Tools {
    pub cpu: PathBuf,
    pub gpu: Option<PathBuf>,
    pub model: PathBuf,
    pub tokenizer: PathBuf,
}

pub fn discover(base: &Path) -> Result<Tools, String> {
    let root = std::env::var_os("CNP_ANALYSIS_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor/analysis")
            } else {
                base.join("cutnicepro/engine/analysis")
            }
        });
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let model = [
        Some(root.join(MODEL_NAME)),
        cfg!(debug_assertions).then(|| {
            workspace
                .join("experiments/clip-selection-ab/models")
                .join(MODEL_NAME)
        }),
    ]
    .into_iter()
    .flatten()
    .find(|path| path.is_file())
    .ok_or("O Qwen3.5-4B está indisponível. Repare a instalação e tente novamente.")?;
    let executable = if cfg!(windows) {
        "llama-completion.exe"
    } else {
        "llama-completion"
    };
    let runtime = [
        cfg!(debug_assertions).then(|| workspace.join(".tooling/vendor/llamacpp-b11829")),
        Some(root.join("bin")),
    ]
    .into_iter()
    .flatten()
    .find(|path| path.join(executable).is_file())
    .ok_or("O motor local está indisponível. Repare a instalação e tente novamente.")?;
    let cpu = runtime.join(executable);
    let tokenizer = runtime.join(if cfg!(windows) {
        "llama-tokenize.exe"
    } else {
        "llama-tokenize"
    });
    if !tokenizer.is_file() {
        return Err("O tokenizador do Qwen3.5 está indisponível. Repare a instalação.".into());
    }
    let accelerated = root.join("gpu").join(executable);
    let gpu = [&cpu, &accelerated]
        .into_iter()
        .filter(|path| path.is_file())
        .find(|binary| {
            let mut command = Command::new(binary);
            command.arg("--list-devices");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            command
                .output()
                .ok()
                .filter(|output| output.status.success())
                .is_some_and(|output| {
                    available_gpu(
                        &(String::from_utf8_lossy(&output.stdout).to_string()
                            + &String::from_utf8_lossy(&output.stderr)),
                    )
                })
        })
        .cloned();
    Ok(Tools {
        cpu,
        gpu,
        model,
        tokenizer,
    })
}

pub fn available_gpu(text: &str) -> bool {
    text.lines().any(|line| {
        (line.contains("Vulkan") || line.contains("CUDA"))
            && line.contains("MiB free")
            && line
                .rsplit(',')
                .next()
                .and_then(|tail| tail.split_whitespace().next())
                .and_then(|value| value.parse::<u64>().ok())
                .is_some_and(|free| free >= 4096)
    })
}
