use super::types::{EngineRecord, Quality};
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
    let root = analysis_root(base);
    let exe = llama_exe_name();
    let cpu = root.join("bin").join(exe);
    let model = root.join("Qwen3-4B-Q4_K_M.gguf");
    if !cpu.is_file() || !model.is_file() {
        return Err("O recurso de análise está indisponível. Repare a instalação do aplicativo e tente novamente.".into());
    }
    let gpu = probe_gpu(&root, exe);
    Ok(Tools { cpu, gpu, model })
}

/// Motor de análise selecionável. `Standard` é o caminho de produção
/// (Qwen3-4B local, ChatML com think vazio, temp 0); `Gemma` é o modo
/// EXPERIMENTAL de qualidade validado na atualização 7 do experimento
/// (Gemma-4-12B-IT QAT Q4_0, template canônico do GGUF com thinking
/// desativado, amostragem recomendada do modelo). Não existe fallback de
/// modelo: se o artefato experimental não estiver disponível, o erro é
/// explícito e o usuário decide reverter para o padrão.
pub enum Engine {
    Standard(Tools),
    Gemma(GemmaTools),
}
#[derive(Clone)]
pub struct GemmaTools {
    pub cpu: PathBuf,
    pub gpu: Option<PathBuf>,
    pub model: PathBuf,
    pub tokenizer: PathBuf,
}

impl Engine {
    pub fn discover(base: &Path, quality: Quality) -> Result<Engine, String> {
        match quality {
            Quality::Standard => Ok(Engine::Standard(discover(base)?)),
            Quality::ExperimentalGemma => Ok(Engine::Gemma(discover_gemma(base)?)),
        }
    }
    /// Registro técnico persistido com a coleção (metadado, não conteúdo).
    pub fn record(&self) -> EngineRecord {
        match self {
            Engine::Standard(tools) => EngineRecord {
                backend: "standard".into(),
                model: tools
                    .model
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                template: "chatml-nothink".into(),
                sampling: "temp 0 (greedy), seed 42".into(),
                seed: 42,
            },
            Engine::Gemma(tools) => EngineRecord {
                backend: "experimentalGemma".into(),
                model: tools
                    .model
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                template: "gemma4-canonical-nothink".into(),
                sampling: "temp 1.0, top_k 64, top_p 0.95, min_p 0, seed 42".into(),
                seed: 42,
            },
        }
    }
    pub fn prompt(&self, system: &str, data: &serde_json::Value) -> Result<String, String> {
        match self {
            Engine::Standard(_) => prompt(system, data),
            Engine::Gemma(_) => prompt_gemma(system, data),
        }
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
        match self {
            Engine::Standard(tools) => generate_with(
                tools.cpu.as_path(),
                tools.gpu.as_deref(),
                &tools.model,
                scratch,
                stem,
                prompt,
                schema,
                tokens,
                control,
                StandardArgs,
            ),
            Engine::Gemma(tools) => generate_with(
                tools.cpu.as_path(),
                tools.gpu.as_deref(),
                &tools.model,
                scratch,
                stem,
                prompt,
                schema,
                tokens,
                control,
                GemmaArgs,
            ),
        }
    }
    /// Contagem de tokens com o tokenizador real do modelo (llama-tokenize).
    /// Usada pelo orçamento real de janelas do modo experimental.
    pub fn count_tokens(&self, scratch: &Path, text: &str) -> Result<usize, String> {
        let tools = match self {
            Engine::Gemma(tools) => tools,
            Engine::Standard(_) => {
                return Err("tokenizador disponível apenas no motor experimental".into())
            }
        };
        let input = scratch.join("tokenize-input.txt");
        std::fs::write(&input, text).map_err(|e| e.to_string())?;
        let output = Command::new(&tools.tokenizer)
            .arg("-m")
            .arg(&tools.model)
            .arg("-f")
            .arg(&input)
            .arg("--show-count")
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("falha ao medir o tamanho do texto com o motor experimental".into());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        // formato observado do runtime: "Total number of tokens: N"
        stdout
            .lines()
            .rev()
            .find_map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return None;
                }
                if let Some(index) = trimmed.to_ascii_lowercase().find("number of tokens") {
                    return trimmed[index..]
                        .split(':')
                        .nth(1)
                        .and_then(|value| value.trim().parse::<usize>().ok());
                }
                trimmed.parse::<usize>().ok()
            })
            .ok_or_else(|| "falha ao medir o tamanho do texto com o motor experimental".into())
    }
}

fn analysis_root(base: &Path) -> PathBuf {
    std::env::var_os("CNP_ANALYSIS_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor/analysis")
            } else {
                base.join("cutnicepro/engine/analysis")
            }
        })
}
fn llama_exe_name() -> &'static str {
    if cfg!(windows) {
        "llama-completion.exe"
    } else {
        "llama-completion"
    }
}
fn probe_gpu(root: &Path, exe: &str) -> Option<PathBuf> {
    let accelerated = root.join("gpu").join(exe);
    accelerated
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
        })
}

/// Resolve o modelo experimental: (1) instalado junto ao motor; (2)
/// configuração local preparada `engine-gemma.json`; (3) artefato verificado
/// do experimento em builds de desenvolvimento. Sem fallback de modelo.
fn discover_gemma(base: &Path) -> Result<GemmaTools, String> {
    let root = analysis_root(base);
    let exe = llama_exe_name();
    let cpu = root.join("bin").join(exe);
    let tokenizer = root.join("bin").join(if cfg!(windows) {
        "llama-tokenize.exe"
    } else {
        "llama-tokenize"
    });
    let candidates = [
        Some(root.join("gemma-4-12b-it-qat-q4_0.gguf")),
        std::fs::read(root.join("engine-gemma.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|value| {
                value
                    .get("model")
                    .and_then(|m| m.as_str())
                    .map(PathBuf::from)
            }),
        cfg!(debug_assertions).then(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
                "../../experiments/clip-selection-ab/models/home-e/gemma-4-12b-it-qat-q4_0.gguf",
            )
        }),
    ];
    let model = candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            "O motor experimental está indisponível neste dispositivo. Use a análise padrão."
                .to_string()
        })?;
    if !cpu.is_file() || !tokenizer.is_file() {
        return Err("O recurso de análise está indisponível. Repare a instalação do aplicativo e tente novamente.".into());
    }
    let gpu = probe_gpu(&root, exe);
    Ok(GemmaTools {
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
                .is_some_and(|free| free >= 2048)
    })
}

pub fn prompt(system: &str, data: &serde_json::Value) -> Result<String, String> {
    let source = serde_json::to_string(data)
        .map_err(|e| e.to_string())?
        .replace("<|", "< |");
    Ok(format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{source}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"))
}

/// Template canônico do GGUF Gemma 4 (atualização 7): turnos `<|turn>`/
/// `<turn|>` e, com thinking desativado, bloco thought vazio no início da
/// resposta. O marcador `/no_think` do Qwen não existe no Gemma e é removido
/// do system; o escape `<|` impede injeção de tags do template pelos dados.
pub fn prompt_gemma(system: &str, data: &serde_json::Value) -> Result<String, String> {
    let source = serde_json::to_string(data)
        .map_err(|e| e.to_string())?
        .replace("<|", "< |")
        .replace("<turn|", "< turn|")
        .replace("<channel|", "< channel|");
    let system = system.replace(" /no_think", "");
    Ok(format!(
        "<|turn>system\n{system}<turn|\n<|turn>user\n{source}<turn|\n<|turn>model\n<|channel>thought\n<channel|>"
    ))
}

/// Diferenças de argv por motor. O padrão mantém EXATAMENTE o comportamento
/// anterior (temp 0, `--fit` na GPU); o experimental aplica a amostragem
/// recomendada do Gemma 4 (temp 1.0 / top_k 64 / top_p 0.95 / min_p 0) SEM
/// `--fit` — o contexto solicitado deve chegar inteiro ao executável.
trait EngineArgs {
    fn sampling(&self) -> &'static [&'static str];
    fn extra(&self, gpu: bool) -> &'static [&'static str];
}
struct StandardArgs;
struct GemmaArgs;
impl EngineArgs for StandardArgs {
    fn sampling(&self) -> &'static [&'static str] {
        &["--temp", "0", "--seed", "42"]
    }
    fn extra(&self, gpu: bool) -> &'static [&'static str] {
        if gpu {
            &["-ngl", "auto", "--fit", "on", "--fit-target", "1024"]
        } else {
            &["-ngl", "0"]
        }
    }
}
impl EngineArgs for GemmaArgs {
    fn sampling(&self) -> &'static [&'static str] {
        &[
            "--temp", "1.0", "--top-k", "64", "--top-p", "0.95", "--min-p", "0", "--seed", "42",
        ]
    }
    fn extra(&self, gpu: bool) -> &'static [&'static str] {
        if gpu {
            &["-ngl", "auto"]
        } else {
            &["-ngl", "0"]
        }
    }
}

fn generate_with(
    cpu: &Path,
    gpu: Option<&Path>,
    model: &Path,
    scratch: &Path,
    stem: &str,
    prompt: &str,
    schema: &serde_json::Value,
    tokens: u16,
    control: &ProcessControl,
    args: impl EngineArgs,
) -> Result<String, String> {
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
    let sampling = args.sampling();
    let execute = |binary: &Path, gpu: bool| {
        let mut command = Command::new(binary);
        command
            .arg("-m")
            .arg(model)
            .arg("-f")
            .arg(&input)
            .arg("-jf")
            .arg(&schema_path)
            .args(["-t", &threads, "-c", "8192", "-n", &tokens.to_string()])
            .args(sampling)
            .args([
                "--no-conversation",
                "--no-display-prompt",
                "--no-escape",
                "--simple-io",
                "--verbosity",
                "3",
            ])
            .args(args.extra(gpu));
        control.run_to_file(
            &mut command,
            &scratch.join(format!("{stem}-{}.log", if gpu { "gpu" } else { "cpu" })),
            &output,
        )
    };
    if let Some(gpu) = gpu {
        if execute(gpu, true).is_err() {
            control.check()?;
            execute(cpu, false)?;
        }
    } else {
        execute(cpu, false)?;
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
    use crate::clips::types::{ClipCollection, Options};

    #[test]
    fn gpu_probe_requires_device_and_available_memory() {
        assert!(available_gpu(
            "Available devices:\n Vulkan0: NVIDIA GeForce RTX 5070 (11943 MiB, 11175 MiB free)"
        ));
        assert!(!available_gpu("Vulkan0: NVIDIA (4096 MiB, 768 MiB free)"));
        assert!(!available_gpu("Available devices:"));
    }

    fn standard() -> Engine {
        Engine::Standard(Tools {
            cpu: PathBuf::from("llama"),
            gpu: None,
            model: PathBuf::from("qwen.gguf"),
        })
    }
    fn gemma() -> Engine {
        Engine::Gemma(GemmaTools {
            cpu: PathBuf::from("llama"),
            gpu: None,
            model: PathBuf::from("gemma.gguf"),
            tokenizer: PathBuf::from("llama-tokenize"),
        })
    }

    #[test]
    fn standard_prompt_keeps_production_parity() {
        let prompt = standard()
            .prompt("Sistema /no_think", &serde_json::json!({"a": 1}))
            .unwrap();
        assert_eq!(
            prompt,
            "<|im_start|>system\nSistema /no_think<|im_end|>\n\
             <|im_start|>user\n{\"a\":1}<|im_end|>\n\
             <|im_start|>assistant\n<think>\n\n</think>\n\n"
        );
    }

    #[test]
    fn gemma_prompt_uses_canonical_template_and_strips_no_think() {
        let prompt = gemma()
            .prompt("Sistema /no_think", &serde_json::json!({"a": 1}))
            .unwrap();
        assert_eq!(
            prompt,
            "<|turn>system\nSistema<turn|\n\
             <|turn>user\n{\"a\":1}<turn|\n\
             <|turn>model\n<|channel>thought\n<channel|>"
        );
        assert!(!prompt.contains("no_think"));
        assert!(!prompt.contains("<|im_start|>"));
    }

    #[test]
    fn gemma_prompt_escapes_template_tags_from_data() {
        let prompt = gemma()
            .prompt("S", &serde_json::json!({"a": "<|turn>x<turn|<channel|"}))
            .unwrap();
        let user = prompt.split("<|turn>user\n").nth(1).unwrap();
        // os dados não podem injetar tags do template do Gemma
        assert!(!user.contains("\": \"<|turn>"));
        assert!(user.contains("< |"));
    }

    #[test]
    fn engine_records_distinguish_backends() {
        let standard = standard().record();
        let gemma = gemma().record();
        assert_eq!(standard.backend, "standard");
        assert_eq!(gemma.backend, "experimentalGemma");
        assert!(gemma.sampling.contains("top_k 64"));
        assert_ne!(standard, gemma);
    }

    #[test]
    fn options_default_to_gemma_and_standard_remains_parseable_for_legacy() {
        // atualização 17: Gemma 4 é o ÚNICO motor de geração — o default do
        // payload resolve para Gemma; Standard continua desserializável
        // (re-análise de coleções antigas)
        let base: Options =
            serde_json::from_str("{\"minSeconds\":10,\"maxSeconds\":60,\"count\":3}").unwrap();
        assert_eq!(base.quality(), Quality::ExperimentalGemma);
        let explicit_gemma: Options = serde_json::from_str(
            "{\"minSeconds\":10,\"maxSeconds\":60,\"count\":3,\"quality\":\"experimentalGemma\"}",
        )
        .unwrap();
        assert_eq!(explicit_gemma.quality(), Quality::ExperimentalGemma);
        let legacy_standard: Options = serde_json::from_str(
            "{\"minSeconds\":10,\"maxSeconds\":60,\"count\":3,\"quality\":\"standard\"}",
        )
        .unwrap();
        assert_eq!(legacy_standard.quality(), Quality::Standard);
        assert!(serde_json::from_str::<Options>(
            "{\"minSeconds\":10,\"maxSeconds\":60,\"count\":3,\"quality\":\"outra\"}"
        )
        .is_err());
    }

    #[test]
    fn clip_collection_round_trips_engine_metadata_and_accepts_legacy_files() {
        let value = ClipCollection {
            version: 1,
            media_id: "m".into(),
            transcript_hash: "h".into(),
            clips: vec![],
            engine: Some(gemma().record()),
        };
        let bytes = serde_json::to_vec(&value).unwrap();
        let restored: ClipCollection = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(restored.engine, value.engine);
        let legacy: ClipCollection = serde_json::from_slice(
            b"{\"version\":1,\"mediaId\":\"m\",\"transcriptHash\":\"h\",\"clips\":[]}",
        )
        .unwrap();
        assert!(legacy.engine.is_none());
    }
}
