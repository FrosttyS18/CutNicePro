use super::{analysis_types::Analysis, types::Clip};
use crate::transcription::{process::ProcessControl, types::Segment};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub fn discover(base: &Path) -> Result<(PathBuf, PathBuf), String> {
    let root = std::env::var_os("CNP_ANALYSIS_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor/analysis")
            } else {
                base.join("cutnicepro/engine/analysis")
            }
        });
    let binary = root.join("bin").join(if cfg!(windows) {
        "llama-completion.exe"
    } else {
        "llama-completion"
    });
    let model = root.join("Qwen3-4B-Q4_K_M.gguf");
    if !binary.is_file() || !model.is_file() {
        return Err("O recurso de análise está indisponível. Repare a instalação do aplicativo e tente novamente.".into());
    }
    Ok((binary, model))
}

pub fn source(clip: &Clip, segments: &[Segment]) -> String {
    segments
        .iter()
        .filter(|s| s.start < clip.end && s.end > clip.start)
        .map(|s| {
            if (s.start < clip.start || s.end > clip.end) && !s.words.is_empty() {
                s.words
                    .iter()
                    .filter(|w| w.start < clip.end && w.end > clip.start)
                    .map(|w| w.text.trim())
                    .collect::<Vec<_>>()
                    .join(" ")
            } else {
                s.text.trim().into()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn prompt(source: &str) -> Result<String, String> {
    let data = serde_json::to_string(&serde_json::json!({"transcription": source}))
        .map_err(|e| e.to_string())?
        .replace("<|", "< |");
    Ok(format!("<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n", include_str!("analysis-prompt.txt"), data))
}

pub fn run(
    base: &Path,
    scratch: &Path,
    clip: &mut Clip,
    segments: &[Segment],
    control: &ProcessControl,
) -> Result<(), String> {
    let (binary, model) = discover(base)?;
    let text = source(clip, segments);
    if text.split_whitespace().count() < 6 || text.len() > 24000 {
        return Err(
            "O trecho não tem fala suficiente para análise. Escolha outro intervalo.".into(),
        );
    }
    let prompt_file = scratch.join("analysis-prompt.txt");
    let schema = scratch.join("analysis.schema.json");
    let result = scratch.join("analysis-result.json");
    std::fs::write(&prompt_file, prompt(&text)?).map_err(|e| e.to_string())?;
    std::fs::write(&schema, include_str!("analysis.schema.json")).map_err(|e| e.to_string())?;
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
        .to_string();
    let mut command = Command::new(binary);
    command
        .arg("-m")
        .arg(model)
        .arg("-f")
        .arg(prompt_file)
        .arg("-jf")
        .arg(schema)
        .args([
            "-ngl",
            "0",
            "-t",
            &threads,
            "-c",
            "8192",
            "-n",
            "1100",
            "--temp",
            "0",
            "--seed",
            "42",
            "--no-conversation",
            "--no-display-prompt",
            "--no-escape",
            "--simple-io",
        ]);
    control.run_to_file(&mut command, &scratch.join("analysis.log"), &result)?;
    let size = std::fs::metadata(&result).map_err(|e| e.to_string())?.len();
    if size > 65536 {
        return Err("A análise gerou uma resposta inválida. Tente novamente.".into());
    }
    let output = std::fs::read_to_string(result).map_err(|e| e.to_string())?;
    let mut stream = serde_json::Deserializer::from_str(output.trim()).into_iter::<Analysis>();
    let analysis = stream
        .next()
        .ok_or("A análise não gerou uma resposta. Tente novamente.")?
        .map_err(|_| "Não foi possível concluir a análise do trecho. Tente novamente.")?;
    analysis.validate(&text)?;
    control.check()?;
    clip.score = analysis.score();
    clip.title = analysis.title.clone();
    clip.reasons = analysis
        .criteria
        .iter()
        .map(|item| item.explanation.clone())
        .collect();
    clip.analysis = Some(analysis);
    Ok(())
}
