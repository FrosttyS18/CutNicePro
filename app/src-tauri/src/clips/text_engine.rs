use crate::transcription::process::ProcessControl;
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub struct Tools {
    pub cpu: PathBuf,
    pub gpu: Option<PathBuf>,
    pub model: PathBuf,
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
    let exe = if cfg!(windows) {
        "llama-completion.exe"
    } else {
        "llama-completion"
    };
    let cpu = root.join("bin").join(exe);
    let model = root.join("Qwen3-4B-Q4_K_M.gguf");
    if !cpu.is_file() || !model.is_file() {
        return Err("O recurso de análise está indisponível. Repare a instalação do aplicativo e tente novamente.".into());
    }
    let accelerated = root.join("gpu").join(exe);
    let gpu = accelerated
        .is_file()
        .then_some(accelerated)
        .filter(|binary| {
            let mut probe = Command::new(binary);
            probe.arg("--list-devices");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                probe.creation_flags(0x08000000);
            }
            probe
                .output()
                .ok()
                .filter(|output| output.status.success())
                .is_some_and(|output| {
                    let text = String::from_utf8_lossy(&output.stdout).to_string()
                        + &String::from_utf8_lossy(&output.stderr);
                    available_gpu(&text)
                })
        });
    Ok(Tools { cpu, gpu, model })
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
                .is_some_and(|free| free >= 2048)
    })
}

pub fn prompt(system: &str, data: &serde_json::Value) -> Result<String, String> {
    let source = serde_json::to_string(data)
        .map_err(|e| e.to_string())?
        .replace("<|", "< |");
    Ok(format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{source}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"))
}

pub fn generate(
    base: &Path,
    scratch: &Path,
    stem: &str,
    prompt: &str,
    schema: &serde_json::Value,
    tokens: u16,
    control: &ProcessControl,
) -> Result<String, String> {
    let tools = discover(base)?;
    let input = scratch.join(format!("{stem}-prompt.txt"));
    let schema_path = scratch.join(format!("{stem}.schema.json"));
    let output = scratch.join(format!("{stem}-result.json"));
    std::fs::write(&input, prompt).map_err(|e| e.to_string())?;
    std::fs::write(
        &schema_path,
        serde_json::to_vec(schema).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
        .to_string();
    let execute = |binary: &Path, gpu: bool| {
        let mut command = Command::new(binary);
        command
            .arg("-m")
            .arg(&tools.model)
            .arg("-f")
            .arg(&input)
            .arg("-jf")
            .arg(&schema_path)
            .args([
                "-ngl",
                if gpu { "auto" } else { "0" },
                "-t",
                &threads,
                "-c",
                "8192",
                "-n",
                &tokens.to_string(),
                "--temp",
                "0",
                "--seed",
                "42",
                "--no-conversation",
                "--no-display-prompt",
                "--no-escape",
                "--simple-io",
                "--verbosity",
                "3",
            ]);
        if gpu {
            command.args(["--fit", "on", "--fit-target", "1024"]);
        }
        control.run_to_file(
            &mut command,
            &scratch.join(format!("{stem}-{}.log", if gpu { "gpu" } else { "cpu" })),
            &output,
        )
    };
    if let Some(gpu) = &tools.gpu {
        if execute(gpu, true).is_err() {
            control.check()?;
            execute(&tools.cpu, false)?;
        }
    } else {
        execute(&tools.cpu, false)?;
    }
    if std::fs::metadata(&output).map_err(|e| e.to_string())?.len() > 131072 {
        return Err("A análise gerou uma resposta inválida. Tente novamente.".into());
    }
    control.check()?;
    std::fs::read_to_string(output).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gpu_probe_requires_device_and_available_memory() {
        assert!(available_gpu(
            "Available devices:\n Vulkan0: NVIDIA GeForce RTX 5070 (11943 MiB, 11175 MiB free)"
        ));
        assert!(!available_gpu("Vulkan0: NVIDIA (4096 MiB, 768 MiB free)"));
        assert!(!available_gpu("Available devices:"));
    }
}
