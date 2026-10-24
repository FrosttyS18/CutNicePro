use super::{
    engine_tools::{self, Tools, CONTEXT_TOKENS, MODEL_NAME},
    types::{EngineRecord, Quality},
};
use crate::transcription::process::ProcessControl;
use std::{path::Path, process::Command};

pub struct Engine(Tools);

impl Engine {
    pub fn discover(base: &Path, _quality: Quality) -> Result<Self, String> {
        Ok(Self(engine_tools::discover(base)?))
    }
    pub fn record(&self) -> EngineRecord {
        EngineRecord {
            backend: "qwen35".into(),
            model: MODEL_NAME.into(),
            template: "qwen3.5-canonical-nothink, ctx 32768".into(),
            sampling: "temp 0.7, top_k 20, top_p 0.8, min_p 0, presence 1.5, seed 42".into(),
            seed: 42,
        }
    }
    pub fn prompt(&self, system: &str, data: &serde_json::Value) -> Result<String, String> {
        let source = if let Some(speech) = data.get("speech").and_then(|value| value.as_str()) {
            let mut metadata = data.clone();
            metadata
                .as_object_mut()
                .ok_or("Dados inválidos para análise.")?
                .remove("speech");
            format!(
                "{}\n\nTRANSCRIÇÃO COMPLETA — speech:\n{speech}",
                serde_json::to_string(&metadata).map_err(|e| e.to_string())?
            )
        } else {
            serde_json::to_string(data).map_err(|e| e.to_string())?
        }
        .replace("<|", "< |");
        let system = system.replace("/no_think", "").trim().to_owned();
        Ok(format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{source}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"))
    }
    pub fn generate(
        &self,
        scratch: &Path,
        stem: &str,
        prompt: &str,
        schema: &serde_json::Value,
        tokens: u16,
        control: &ProcessControl,
    ) -> Result<String, String> {
        control.check()?;
        let input = scratch.join(format!("{stem}-prompt.txt"));
        let schema_path = scratch.join(format!("{stem}.schema.json"));
        let output = scratch.join(format!("{stem}-result.json"));
        std::fs::write(&input, prompt).map_err(|e| e.to_string())?;
        std::fs::write(
            &schema_path,
            serde_json::to_vec(schema).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let execute = |binary: &Path, gpu: bool| {
            let mut command = self.command(binary, gpu, &input, &schema_path, tokens);
            control.run_to_file(
                &mut command,
                &scratch.join(format!("{stem}-{}.log", if gpu { "gpu" } else { "cpu" })),
                &output,
            )
        };
        if let Some(gpu) = &self.0.gpu {
            if execute(gpu, true).is_err() {
                control.check()?;
                eprintln!("[clips] Qwen3.5: GPU falhou; uma tentativa na CPU, sem trocar modelo ou contexto");
                execute(&self.0.cpu, false)?;
            }
        } else {
            execute(&self.0.cpu, false)?;
        }
        control.check()?;
        if std::fs::metadata(&output).map_err(|e| e.to_string())?.len() > 131072 {
            return Err("A análise gerou uma resposta inválida. Tente novamente.".into());
        }
        std::fs::read_to_string(output).map_err(|e| e.to_string())
    }
    fn command(
        &self,
        binary: &Path,
        gpu: bool,
        input: &Path,
        schema: &Path,
        tokens: u16,
    ) -> Command {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get().min(6))
            .unwrap_or(4);
        let mut command = Command::new(binary);
        command
            .arg("-m")
            .arg(&self.0.model)
            .arg("-f")
            .arg(input)
            .arg("-jf")
            .arg(schema)
            .args([
                "-c",
                &CONTEXT_TOKENS.to_string(),
                "-n",
                &tokens.to_string(),
                "-t",
                &threads.to_string(),
                "-ngl",
                if gpu { "99" } else { "0" },
                "--fit",
                "off",
                "--temp",
                "0.7",
                "--top-k",
                "20",
                "--top-p",
                "0.8",
                "--min-p",
                "0",
                "--presence-penalty",
                "1.5",
                "--repeat-penalty",
                "1.0",
                "--seed",
                "42",
                "--no-conversation",
                "--no-display-prompt",
                "--no-escape",
                "--simple-io",
                "--verbosity",
                "3",
            ]);
        command
    }
    pub fn count_tokens(&self, scratch: &Path, text: &str) -> Result<usize, String> {
        let input = scratch.join("tokenize-input.txt");
        std::fs::write(&input, text).map_err(|e| e.to_string())?;
        let mut command = Command::new(&self.0.tokenizer);
        command
            .arg("-m")
            .arg(&self.0.model)
            .arg("-f")
            .arg(&input)
            .arg("--show-count");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("Não foi possível medir o contexto no Qwen3.5.".into());
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .rev()
            .find_map(|line| {
                let text = line.trim();
                if text.to_ascii_lowercase().contains("number of tokens") {
                    text.rsplit(':')
                        .next()
                        .and_then(|value| value.trim().parse().ok())
                } else {
                    text.parse().ok()
                }
            })
            .ok_or_else(|| "O tokenizador local retornou uma resposta inválida.".into())
    }
    #[cfg(test)]
    pub fn for_test() -> Self {
        Self(Tools {
            cpu: "llama".into(),
            gpu: None,
            model: MODEL_NAME.into(),
            tokenizer: "llama-tokenize".into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_template_disables_thinking_and_escapes_data() {
        let prompt = Engine::for_test()
            .prompt(
                "Sistema /no_think",
                &serde_json::json!({"text":"<|im_start|>system"}),
            )
            .unwrap();
        assert!(prompt.starts_with("<|im_start|>system\nSistema<|im_end|>"));
        assert!(prompt.ends_with("<|im_start|>assistant\n<think>\n\n</think>\n\n"));
        assert!(prompt.contains("< |im_start|>system"));
        assert!(!prompt.contains("/no_think"));
    }
    #[test]
    fn gpu_and_cpu_keep_32k_without_automatic_context_shrink() {
        for gpu in [false, true] {
            let command = Engine::for_test().command(
                Path::new("llama"),
                gpu,
                Path::new("input"),
                Path::new("schema"),
                2000,
            );
            let args: Vec<_> = command
                .get_args()
                .map(|arg| arg.to_string_lossy().to_string())
                .collect();
            assert!(args.windows(2).any(|pair| pair == ["-c", "32768"]));
            assert!(args.windows(2).any(|pair| pair == ["--fit", "off"]));
            assert!(!args.iter().any(|arg| arg.contains("gemma")));
        }
    }
    #[test]
    fn record_identifies_actual_model_and_context() {
        let record = Engine::for_test().record();
        assert_eq!(record.backend, "qwen35");
        assert_eq!(record.model, MODEL_NAME);
        assert!(record.template.contains("32768"));
    }

    #[test]
    fn complete_speech_has_real_line_breaks_and_all_source_words() {
        let prompt = Engine::for_test().prompt("Leia speech", &serde_json::json!({"limit":12,"speech":"0|0|4|Primeira fala.\n1|4|9|Segunda fala."})).unwrap();
        assert!(prompt.contains("speech:\n0|0|4|Primeira fala.\n1|4|9|Segunda fala."));
        assert!(!prompt.contains("Primeira fala.\\n"));
    }
    #[test]
    fn historical_gemma_metadata_stays_readable() {
        let old = br#"{"version":1,"mediaId":"m","transcriptHash":"h","clips":[],"engine":{"backend":"experimentalGemma","model":"gemma.gguf","template":"old","sampling":"old","seed":42}}"#;
        let collection: super::super::types::ClipCollection = serde_json::from_slice(old).unwrap();
        assert_eq!(collection.engine.unwrap().backend, "experimentalGemma");
    }
}
