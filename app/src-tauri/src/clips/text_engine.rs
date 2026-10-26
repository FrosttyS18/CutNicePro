use super::{
    engine_tools::{self, Tools, CONTEXT_TOKENS, MODEL_NAME},
    types::{EngineRecord, Quality},
};
use crate::transcription::process::ProcessControl;
use std::{path::Path, process::Command};

pub struct Engine(Tools, #[cfg(test)] bool);

#[derive(Clone, Copy)]
struct Generation {
    tokens: u16,
    temperature: f32,
}

impl Engine {
    pub fn discover(base: &Path, _quality: Quality) -> Result<Self, String> {
        Ok(Self(
            engine_tools::discover(base)?,
            #[cfg(test)]
            true,
        ))
    }
    pub fn record(&self) -> EngineRecord {
        EngineRecord {
            backend: "qwen35".into(),
            model: MODEL_NAME.into(),
            template: "qwen3.5-canonical-nothink, ctx 32768".into(),
            sampling:
                "extração 0.4, avaliação 0.7, top_k 20, top_p 0.8, min_p 0, presence 1.5, seed 42"
                    .into(),
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
        self.complete(
            scratch,
            stem,
            prompt,
            schema,
            Generation {
                tokens,
                temperature: 0.7,
            },
            control,
        )
    }
    pub fn generate_extraction(
        &self,
        scratch: &Path,
        stem: &str,
        prompt: &str,
        schema: &serde_json::Value,
        tokens: u16,
        control: &ProcessControl,
    ) -> Result<String, String> {
        self.complete(
            scratch,
            stem,
            prompt,
            schema,
            Generation {
                tokens,
                temperature: 0.4,
            },
            control,
        )
    }
    fn complete(
        &self,
        scratch: &Path,
        stem: &str,
        prompt: &str,
        schema: &serde_json::Value,
        generation: Generation,
        control: &ProcessControl,
    ) -> Result<String, String> {
        control.check()?;
        let files = super::model_artifacts::Artifacts::create(scratch, stem)?;
        let input = files.prompt();
        let schema_path = files.schema();
        eprintln!(
            "[clips] chamada {stem}: {}",
            files
                .directory
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        );
        std::fs::write(&input, prompt).map_err(|e| e.to_string())?;
        std::fs::write(
            &schema_path,
            serde_json::to_vec(schema).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let execute = |binary: &Path, gpu: bool| {
            let mut command = self.command(binary, gpu, &input, &schema_path, generation);
            let output = files.output(gpu);
            control.run_to_file(&mut command, &files.log(gpu), &output)?;
            Ok::<_, String>(output)
        };
        let output = if let Some(gpu) = &self.0.gpu {
            match execute(gpu, true) {
                Ok(output) => output,
                Err(_error) => {
                    #[cfg(test)]
                    if !self.1 {
                        return Err(_error);
                    }
                    control.check()?;
                    eprintln!("[clips] Qwen3.5: GPU falhou; uma tentativa na CPU, sem trocar modelo ou contexto");
                    execute(&self.0.cpu, false)?
                }
            }
        } else {
            execute(&self.0.cpu, false)?
        };
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
        generation: Generation,
    ) -> Command {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get().min(6))
            .unwrap_or(4);
        let mut command = Command::new(binary);
        command
            .arg("-m")
            .arg(&self.0.model)
            .arg("-bf")
            .arg(input)
            .arg("-jf")
            .arg(schema)
            .args([
                "-c",
                &CONTEXT_TOKENS.to_string(),
                "-n",
                &generation.tokens.to_string(),
                "-t",
                &threads.to_string(),
                "-ngl",
                if gpu { "99" } else { "0" },
                "--fit",
                "off",
                "--temp",
                &generation.temperature.to_string(),
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
    pub fn count_tokens(
        &self,
        scratch: &Path,
        text: &str,
        control: &ProcessControl,
    ) -> Result<usize, String> {
        control.check()?;
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
        let output = scratch.join("tokenize-output.txt");
        if let Err(error) =
            control.run_to_file(&mut command, &scratch.join("tokenize.log"), &output)
        {
            control.check()?;
            if error.starts_with("O motor encerrou com erro (") {
                return Err("Não foi possível medir o contexto no Qwen3.5.".into());
            }
            return Err(error
                .strip_prefix("não foi possível iniciar o motor: ")
                .unwrap_or(&error)
                .to_owned());
        }
        control.check()?;
        let output = std::fs::read(output).map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&output)
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
    pub fn for_test_runtime(runtime: &Path, model: &Path) -> Result<Self, String> {
        let completion = runtime.join("llama-completion.exe");
        let tokenizer = runtime.join("llama-tokenize.exe");
        if !completion.is_file() || !tokenizer.is_file() || !model.is_file() {
            return Err("Runtime ou modelo de auditoria ausente.".into());
        }
        Ok(Self(
            Tools {
                cpu: completion.clone(),
                gpu: Some(completion),
                model: model.to_owned(),
                tokenizer,
            },
            false,
        ))
    }
    #[cfg(test)]
    pub fn for_test() -> Self {
        Self(
            Tools {
                cpu: "llama".into(),
                gpu: None,
                model: MODEL_NAME.into(),
                tokenizer: "llama-tokenize".into(),
            },
            true,
        )
    }
}

#[cfg(test)]
#[path = "text_engine_tokenizer_tests.rs"]
mod tokenizer_process_tests;

#[cfg(test)]
mod tests {
    use super::*;

    fn observed_native_prompt(log: &str) -> (String, Vec<u32>) {
        let log = log.replace("\r\n", "\n");
        let prompt_start = log.find(": prompt: '").unwrap() + ": prompt: '".len();
        let count_start = log[prompt_start..]
            .find("number of tokens in prompt = ")
            .unwrap()
            + prompt_start;
        let prompt_end = log[prompt_start..count_start].rfind("'\n").unwrap() + prompt_start;
        let count_and_tokens = &log[count_start + "number of tokens in prompt = ".len()..];
        let (count, tokens) = count_and_tokens.split_once('\n').unwrap();
        let count = count.trim().parse::<usize>().unwrap();
        let tokens = tokens.split_once("sampler seed:").unwrap().0;
        let ids = tokens
            .lines()
            .filter_map(|line| {
                line.split_once(" -> '")?
                    .0
                    .split_whitespace()
                    .last()?
                    .parse::<u32>()
                    .ok()
            })
            .collect::<Vec<_>>();
        assert_eq!(ids.len(), count);
        (log[prompt_start..prompt_end].to_string(), ids)
    }

    fn vocabulary_ids(engine: &Engine, input: &Path, directory: &Path, stem: &str) -> Vec<u32> {
        let mut command = Command::new(&engine.0.tokenizer);
        command
            .arg("-m")
            .arg(&engine.0.model)
            .arg("-f")
            .arg(input)
            .args(["--ids", "--no-escape", "--offline"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command.output().unwrap();
        std::fs::write(
            directory.join(format!("{stem}-tokenizer.stdout")),
            &output.stdout,
        )
        .unwrap();
        std::fs::write(
            directory.join(format!("{stem}-tokenizer.stderr")),
            &output.stderr,
        )
        .unwrap();
        assert!(output.status.success());
        serde_json::from_slice(&output.stdout).unwrap()
    }

    fn native_transport(
        engine: &Engine,
        input: &Path,
        schema: &Path,
        directory: &Path,
        flag: &str,
    ) -> (String, Vec<u32>) {
        std::fs::create_dir(directory).unwrap();
        let original = engine.command(
            &engine.0.cpu,
            false,
            input,
            schema,
            Generation {
                tokens: 0,
                temperature: 0.4,
            },
        );
        let mut command = Command::new(original.get_program());
        for arg in original.get_args() {
            command.arg(if arg == "-f" || arg == "-bf" {
                std::ffi::OsStr::new(flag)
            } else {
                arg
            });
        }
        command.args([
            "--device",
            "none",
            "--no-op-offload",
            "--no-warmup",
            "--verbose-prompt",
            "--offline",
        ]);
        let log_path = directory.join("runtime.log");
        ProcessControl::default()
            .run_to_file(&mut command, &log_path, &directory.join("output.txt"))
            .unwrap();
        let log = std::fs::read_to_string(log_path).unwrap();
        assert!(log.contains("n_predict = 0,"));
        observed_native_prompt(&log)
    }

    #[test]
    #[ignore = "prova nativa n0 de transporte/tokenização Qwen em CPU, sem geração editorial"]
    fn real_completion_transport_preserves_the_canonical_prefix_bytes_and_tokens() {
        use sha2::Digest;
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let directory = workspace
            .join(".tooling/test-output/goal-story-coverage-2026-10-25")
            .join(format!("qwen-transport-n0-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let engine = Engine::discover(&workspace, Quality::Qwen35).unwrap();
        let prompt = engine
            .prompt(
                "Responda somente JSON.",
                &serde_json::json!({"speech":"Uma fala completa."}),
            )
            .unwrap();
        let input = directory.join("submitted-prompt.txt");
        let trimmed_input = directory.join("trimmed-prompt.txt");
        let schema = directory.join("schema.json");
        std::fs::write(&input, &prompt).unwrap();
        std::fs::write(&trimmed_input, prompt.strip_suffix('\n').unwrap()).unwrap();
        std::fs::write(&schema, r#"{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false}"#).unwrap();
        let expected_full = vocabulary_ids(&engine, &input, &directory, "full");
        let expected_trimmed = vocabulary_ids(&engine, &trimmed_input, &directory, "trimmed");
        let (text_prompt, text_ids) =
            native_transport(&engine, &input, &schema, &directory.join("text"), "-f");
        let (binary_prompt, binary_ids) =
            native_transport(&engine, &input, &schema, &directory.join("binary"), "-bf");
        assert_eq!(text_prompt, prompt.strip_suffix('\n').unwrap());
        assert_eq!(text_ids, expected_trimmed);
        assert_eq!(binary_prompt, prompt);
        assert_eq!(binary_ids, expected_full);
        let command = engine.command(
            &engine.0.cpu,
            false,
            &input,
            &schema,
            Generation {
                tokens: 0,
                temperature: 0.4,
            },
        );
        let current_flag = command
            .get_args()
            .find(|arg| *arg == "-f" || *arg == "-bf")
            .unwrap()
            .to_string_lossy()
            .to_string();
        let (current_prompt, current_ids) = if current_flag == "-bf" {
            (&binary_prompt, &binary_ids)
        } else {
            (&text_prompt, &text_ids)
        };
        let matches_canonical = current_prompt == &prompt && current_ids == &expected_full;
        let report = serde_json::json!({
            "scope":"Real completion and vocabulary tokenizer; CPU only; n_predict=0; no warmup, editorial generation or quality claim",
            "engineTransportFlag":current_flag,"enginePreservesCanonicalPrefix":matches_canonical,
            "submittedBytes":prompt.len(),"submittedSha256":format!("{:x}",sha2::Sha256::digest(prompt.as_bytes())),
            "text":{"receivedBytes":text_prompt.len(),"receivedPrompt":text_prompt,"tokenIds":text_ids,"lastTokenIds":&text_ids[text_ids.len().saturating_sub(8)..]},
            "binary":{"receivedBytes":binary_prompt.len(),"receivedPrompt":binary_prompt,"tokenIds":binary_ids,"lastTokenIds":&binary_ids[binary_ids.len().saturating_sub(8)..]},
            "vocabularyExpectedFull":expected_full,"vocabularyExpectedTrimmed":expected_trimmed
        });
        std::fs::write(
            directory.join("result.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        eprintln!("[transport] {}", directory.join("result.json").display());
        assert!(
            matches_canonical,
            "o completion não recebeu os bytes/tokens canônicos medidos pelo tokenizador"
        );
    }

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
                Generation {
                    tokens: 2000,
                    temperature: 0.7,
                },
            );
            let args: Vec<_> = command
                .get_args()
                .map(|arg| arg.to_string_lossy().to_string())
                .collect();
            assert!(args.windows(2).any(|pair| pair == ["-c", "32768"]));
            assert!(args.windows(2).any(|pair| pair == ["--fit", "off"]));
            assert!(!args.iter().any(|arg| arg.contains("gemma")));
            assert!(args.windows(2).any(|pair| pair == ["--temp", "0.7"]));
        }
    }
    #[test]
    fn extraction_sampling_reaches_the_process_without_changing_context_or_seed() {
        let command = Engine::for_test().command(
            Path::new("llama"),
            true,
            Path::new("input"),
            Path::new("schema"),
            Generation {
                tokens: 4096,
                temperature: 0.4,
            },
        );
        let args: Vec<_> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        for pair in [
            ["--temp", "0.4"],
            ["-c", "32768"],
            ["--seed", "42"],
            ["-n", "4096"],
        ] {
            assert!(args.windows(2).any(|actual| actual == pair));
        }
    }
    #[test]
    fn record_identifies_actual_model_and_context() {
        let record = Engine::for_test().record();
        assert_eq!(record.backend, "qwen35");
        assert_eq!(record.model, MODEL_NAME);
        assert!(record.template.contains("32768"));
        assert!(record.sampling.contains("extração 0.4"));
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
