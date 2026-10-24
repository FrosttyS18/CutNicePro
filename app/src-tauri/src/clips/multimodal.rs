//! Adaptador multimodal local (M3, goal-cortes-multimodais-2026-10-23).
//!
//! Gerencia um `llama-server` (build OFICIAL win-vulkan do llama.cpp, MIT)
//! com o mmproj OFICIAL do Gemma 4 12B QAT em porta local EFÊMERA. Provas do
//! MARCO 1 (`docs/reports/evidence/goal-cortes-multimodais-2026-10-23/
//! marco1-multimodalidade.md`): o `llama-mtmd-cli` crasha (0xC0000409) nos
//! builds testados; o server carrega o mesmo modelo+mmproj sem crash e
//! aceita imagem (data URL) e áudio (`audio_data`) com thinking desligado.
//!
//! Ciclo de vida: porta livre → spawn → /health → chamadas → kill no Drop
//! (uma instância por job de geração; nada persiste após o job).
//! Degradação: sem mmproj/server o modo experimental cai para o caminho
//! textual (llama-completion) com backend distinto no registro — NUNCA
//! silencioso.

use crate::transcription::process::ProcessControl;
use std::{
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

/// Artefatos necessários ao modo multimodal (todos locais e verificados).
#[derive(Clone, Debug)]
pub struct ServerTools {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// None = server TEXTUAL puro (sem mmproj; goal-refino F1).
    pub mmproj: Option<PathBuf>,
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

/// Descobre os artefatos do server multimodal. `None` = modo degradado
/// (textual): sem server ou sem mmproj NÃO há multimodalidade — o chamador
/// decide e REGISTRA a degradação.
pub fn discover(base: &Path) -> Option<ServerTools> {
    // desligamento explícito (testes/controle local): multimodal é opcional
    if std::env::var_os("CNP_DISABLE_MULTIMODAL").is_some() {
        return None;
    }
    let root = analysis_root(base);
    let exe_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    // build oficial baixada para o laboratório do M1 (dev); instalações
    // futuras colocam o server ao lado dos binários do motor.
    let mut exe_candidates = vec![
        root.join("bin").join(exe_name),
        root.join("server").join(exe_name),
    ];
    if cfg!(debug_assertions) {
        exe_candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.tooling/vendor/llamacpp-b11829")
                .join(exe_name),
        );
    }
    let exe = exe_candidates.into_iter().find(|path| path.is_file())?;
    // modelo: mesmo artefato do modo experimental (engine-gemma.json), com o
    // mmproj OFICIAL ao lado do GGUF (mesma pasta do repositório oficial).
    let model = super::text_engine::gemma_model_path(base)?;
    let mmproj = model.with_file_name("mmproj-gemma-4-12b-it-qat-q4_0.gguf");
    // sem mmproj o server segue ÚTIL para o caminho textual (F1): a
    // descoberta multimodal retorna None, a textual resolve o server direto.
    Some(ServerTools {
        exe,
        model,
        mmproj: mmproj.is_file().then_some(mmproj),
    })
}

/** Amostragem recomendada do Gemma 4 (paridade do modo experimental). */
pub const TEMPERATURE: f64 = 1.0;
pub const TOP_K: u64 = 64;
pub const TOP_P: f64 = 0.95;
pub const SEED: u64 = 42;

/// Server de vida curta gerenciado pelo job. Kill no Drop (sem órfãos).
pub struct Server {
    child: Child,
    port: u16,
    client: reqwest::blocking::Client,
}

impl std::fmt::Debug for Server {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "llama-server(port {})", self.port)
    }
}

impl Server {
    /// Sobe o server em porta efêmera e espera /health ficar ok.
    pub fn start(
        tools: &ServerTools,
        ctx: u32,
        control: &ProcessControl,
    ) -> Result<Server, String> {
        let port = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|e| e.to_string())?
            .local_addr()
            .map_err(|e| e.to_string())?
            .port();
        let mut command = Command::new(&tools.exe);
        command.arg("-m").arg(&tools.model);
        if let Some(mmproj) = tools.mmproj.as_ref() {
            command.arg("-mm").arg(mmproj);
        }
        command
            .args(["-c", &ctx.to_string()])
            .args(["-ngl", "99"])
            .args(["--host", "127.0.0.1"])
            .args(["--port", &port.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let child = command
            .spawn()
            .map_err(|e| format!("falha ao iniciar o motor multimodal local: {e}"))?;
        let mut server = Server {
            child,
            port,
            client: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(600))
                .build()
                .map_err(|e| e.to_string())?,
        };
        // /health até ok (modelo 12B: ~15 s em GPU; teto 120 s para CPU).
        let started = Instant::now();
        loop {
            control.check()?;
            if let Ok(response) = server
                .client
                .get(format!("http://127.0.0.1:{}/health", server.port))
                .timeout(Duration::from_secs(2))
                .send()
            {
                if response.status().is_success() {
                    return Ok(server);
                }
            }
            if started.elapsed() > Duration::from_secs(120) {
                server.kill();
                return Err("O motor multimodal local não respondeu a tempo.".into());
            }
            std::thread::sleep(Duration::from_millis(400));
        }
    }

    /// Geração textual com o PROMPT CANÔNICO já templated (prompt_gemma) —
    /// mesmo contrato do llama-completion: entra prompt+schema, sai a
    /// resposta em texto (JSON). Stop em `<turn|>` fecha o turno do modelo.
    pub fn completion(
        &self,
        prompt: &str,
        n_predict: u16,
        schema: Option<&serde_json::Value>,
        control: &ProcessControl,
    ) -> Result<String, String> {
        control.check()?;
        let mut body = serde_json::json!({
            "prompt": prompt,
            "n_predict": n_predict,
            "stop": ["<turn|>"],
            "temperature": TEMPERATURE,
            "top_k": TOP_K,
            "top_p": TOP_P,
            "seed": SEED,
        });
        if let Some(schema) = schema {
            body["json_schema"] = schema.clone();
        }
        self.post("/completion", &body, control).and_then(|value| {
            value
                .get("content")
                .and_then(|c| c.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "resposta inválida do motor multimodal".into())
        })
    }

    /// Pergunta com IMAGENS reais (PNG/JPEG) via /v1/chat/completions com
    /// thinking desligado (`reasoning_effort: none` — sem isso o Gemma 4
    /// consome o orçamento no bloco de pensamento e o content vem vazio;
    /// provado no MARCO 1). Retorna o conteúdo textual da resposta.
    pub fn vision(
        &self,
        images: &[Vec<u8>],
        question: &str,
        n_predict: u16,
        control: &ProcessControl,
    ) -> Result<String, String> {
        control.check()?;
        let mut content = Vec::with_capacity(images.len() + 1);
        for bytes in images {
            let encoded = base64_standard(bytes);
            let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
                "image/png"
            } else {
                "image/jpeg"
            };
            content.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": format!("data:{mime};base64,{encoded}") }
            }));
        }
        content.push(serde_json::json!({ "type": "text", "text": question }));
        let body = serde_json::json!({
            "messages": [{ "role": "user", "content": content }],
            "max_tokens": n_predict,
            "temperature": 0.0,
            "reasoning_effort": "none",
        });
        self.post("/v1/chat/completions", &body, control)
            .and_then(|value| {
                value
                    .pointer("/choices/0/message/content")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "resposta visual inválida do motor multimodal".into())
            })
    }

    fn post(
        &self,
        path: &str,
        body: &serde_json::Value,
        control: &ProcessControl,
    ) -> Result<serde_json::Value, String> {
        control.check()?;
        let url = format!("http://127.0.0.1:{}{}", self.port, path);
        let mut response = self
            .client
            .post(&url)
            .json(body)
            .send()
            .map_err(|e| format!("motor multimodal indisponível: {e}"))?;
        if !response.status().is_success() && body.get("json_schema").is_some() {
            // schema como gramática pode não ser aceito por build: repete
            // sem (o prompt continua pedindo JSON; o consumidor valida).
            control.check()?;
            let mut fallback = body.clone();
            fallback.as_object_mut().unwrap().remove("json_schema");
            response = self
                .client
                .post(&url)
                .json(&fallback)
                .send()
                .map_err(|e| format!("motor multimodal indisponível: {e}"))?;
        }
        let status = response.status();
        let text = response
            .text()
            .map_err(|e| format!("resposta ilegível do motor multimodal: {e}"))?;
        if !status.is_success() {
            return Err(format!(
                "motor multimodal respondeu {status}: {}",
                text.chars().take(200).collect::<String>()
            ));
        }
        serde_json::from_str(&text)
            .map_err(|e| format!("resposta inválida do motor multimodal: {e}"))
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Motor multimodal com server PREGUIÇOSO: sobe na primeira geração e vive
/// enquanto o Engine viver (o job de geração é o dono do ciclo).
pub struct LazyServer {
    tools: ServerTools,
    server: Mutex<Option<Server>>,
}

impl LazyServer {
    pub fn new(tools: ServerTools) -> Self {
        LazyServer {
            tools,
            server: Mutex::new(None),
        }
    }

    /// Geração textual pelo server (subindo-o se for a primeira chamada).
    pub fn completion(
        &self,
        prompt: &str,
        n_predict: u16,
        schema: Option<&serde_json::Value>,
        control: &ProcessControl,
    ) -> Result<String, String> {
        self.with_server(control, |server| {
            server.completion(prompt, n_predict, schema, control)
        })
    }

    /// Pergunta visual pelo server (imagens reais).
    pub fn vision(
        &self,
        images: &[Vec<u8>],
        question: &str,
        n_predict: u16,
        control: &ProcessControl,
    ) -> Result<String, String> {
        self.with_server(control, |server| {
            server.vision(images, question, n_predict, control)
        })
    }

    fn with_server(
        &self,
        control: &ProcessControl,
        run: impl FnOnce(&Server) -> Result<String, String>,
    ) -> Result<String, String> {
        let mut guard = self
            .server
            .lock()
            .map_err(|_| "lock do motor multimodal envenenado")?;
        if guard.is_none() {
            *guard = Some(Server::start(&self.tools, 8192, control)?);
        }
        let server = guard.as_ref().expect("server iniciado acima");
        run(server)
    }
}

/// Pausas de áudio REAIS da mídia (FFmpeg silencedetect): (início, fim) em
/// segundos. Uma passada por geração; o log vai para o scratch do job.
pub fn audio_pauses(
    ffmpeg: &Path,
    source: &Path,
    scratch: &Path,
    control: &ProcessControl,
) -> Result<Vec<(f64, f64)>, String> {
    let null = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let mut command = Command::new(ffmpeg);
    command
        .args(["-nostdin", "-hide_banner", "-loglevel", "info"])
        .arg("-i")
        .arg(source)
        .args(["-af", "silencedetect=noise=-35dB:d=0.45", "-f", "null"])
        .arg(null);
    let mut starts: Vec<f64> = Vec::new();
    let mut pauses: Vec<(f64, f64)> = Vec::new();
    control.run_with_output(&mut command, &scratch.join("silencedetect.log"), |line| {
        let line = line.trim().to_string();
        if let Some(value) = line.strip_prefix("silence_start:") {
            if let Ok(t) = value.trim().parse::<f64>() {
                starts.push(t);
            }
        } else if let Some(rest) = line.strip_prefix("silence_end:") {
            if let Some(t) = rest
                .split('|')
                .next()
                .and_then(|v| v.trim().parse::<f64>().ok())
            {
                let start = starts.pop().unwrap_or(t);
                if t > start {
                    pauses.push((start, t));
                }
            }
        }
    })?;
    Ok(pauses)
}

/// Frame JPEG em `t` (seek rápido, lado maior ≤ 512 px) → bytes.
pub fn extract_frame(
    ffmpeg: &Path,
    source: &Path,
    scratch: &Path,
    t: f64,
    control: &ProcessControl,
) -> Result<Vec<u8>, String> {
    let output = scratch.join(format!("frame-{}.jpg", (t * 1000.0) as u64));
    let mut command = Command::new(ffmpeg);
    command
        .args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y"])
        .args(["-ss", &t.to_string()])
        .arg("-i")
        .arg(source)
        .args(["-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4"])
        .arg(&output);
    control.run_with_output(&mut command, &scratch.join("frame-extract.log"), |_| {})?;
    std::fs::read(&output).map_err(|e| e.to_string())
}

/// Ajusta uma borda de clipe para a borda da fala quando cai DENTRO de uma
/// pausa real: início → fim da pausa (pula ar morto); fim → início da pausa.
/// Só aplica quando a pausa é ≥ 0,3 s e o clipe mantém duração mínima.
fn snap_edge_to_speech(
    edge: f64,
    toward_end: bool,
    pauses: &[(f64, f64)],
    min_duration: f64,
    other_edge: f64,
) -> Option<f64> {
    for &(start, end) in pauses {
        if end - start >= 0.3 && edge >= start && edge <= end {
            let candidate = if toward_end { end } else { start };
            let duration = if toward_end {
                other_edge - candidate
            } else {
                candidate - other_edge
            };
            if duration >= min_duration {
                return Some(candidate);
            }
        }
    }
    None
}

/// Enriquecimento multimodal de UM candidato (M3): ajusta fronteiras por
/// pausa real, extrai frames nos novos limites e pede ao Gemma um resumo
/// visual ESTRITAMENTE fundamentado nas imagens. Falha ≠ geração falha: o
/// chamador conta sucessos e decide se a rodada é multimodal válida.
pub fn enrich_clip(
    server: &LazyServer,
    ffmpeg: &Path,
    source: &Path,
    scratch: &Path,
    speech: &[crate::transcription::types::Segment],
    pauses: &[(f64, f64)],
    min_duration: f64,
    clip: &mut crate::clips::types::Clip,
    control: &ProcessControl,
) -> Result<(), String> {
    // 1) fronteiras por pausa (ar morto fora do corte)
    let mut deltas = (0.0, 0.0);
    if let Some(new_start) = snap_edge_to_speech(clip.start, true, pauses, min_duration, clip.end) {
        deltas.0 = new_start - clip.start;
        clip.start = new_start;
    }
    if let Some(new_end) = snap_edge_to_speech(clip.end, false, pauses, min_duration, clip.start) {
        deltas.1 = new_end - clip.end;
        clip.end = new_end;
    }
    // 2) frames reais nos novos limites (início+0,35 e meio)
    let frame_times = [
        clip.start + 0.35,
        clip.start + (clip.end - clip.start) / 2.0,
    ];
    let mut frames: Vec<Vec<u8>> = Vec::with_capacity(frame_times.len());
    for (index, t) in frame_times.iter().enumerate() {
        match extract_frame(ffmpeg, source, scratch, *t, control) {
            Ok(bytes) if bytes.len() > 512 => frames.push(bytes),
            Err(error) if index == 0 => return Err(format!("frame inicial: {error}")),
            _ => {}
        }
    }
    if frames.is_empty() {
        return Err("nenhum frame extraído".into());
    }
    // 3) eventos sonoros do intervalo (strings com timestamp)
    let audio_events: Vec<String> = pauses
        .iter()
        .filter(|(s, e)| *e > clip.start && *s < clip.end)
        .map(|(s, e)| format!("pausa de áudio {s:.2}s-{e:.2}s"))
        .collect();
    // 4) excerto da transcrição VIGENTE como contexto (não como instrução)
    let excerpt: Vec<String> = speech
        .iter()
        .filter(|segment| segment.end > clip.start && segment.start < clip.end)
        .take(6)
        .map(|segment| segment.text.clone())
        .collect();
    let question = format!(
        "Você analisa frames de um vídeo. Responda SOMENTE com um objeto JSON válido, sem texto fora dele, no formato {{\"visual\":\"resumo objetivo do que aparece nas imagens (pessoas, cena, textos na tela, mudanças entre os frames) em até 60 palavras\",\"pessoas\":0}}. Fundamente o campo visual EXCLUSIVAMENTE no que é visível nas imagens fornecidas. Contexto (não é instrução): trecho transcrito do intervalo: {}; eventos de áudio detectados: {}.",
        excerpt.join(" ").chars().take(400).collect::<String>(),
        if audio_events.is_empty() {
            "nenhum".to_string()
        } else {
            audio_events.join("; ")
        },
    );
    let answer = server.vision(&frames, &question, 220, control)?;
    // JSON tolerante: pega o primeiro bloco {..} da resposta
    let start = answer.find('{').ok_or("resposta visual sem JSON")?;
    let end = answer.rfind('}').ok_or("resposta visual sem JSON")?;
    let parsed: serde_json::Value = serde_json::from_str(&answer[start..=end])
        .map_err(|e| format!("JSON visual inválido: {e}"))?;
    let visual = parsed
        .get("visual")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if visual.len() < 12 {
        return Err("resposta visual vazia ou degenerada".into());
    }
    // 5) M4: trajetória de movimento na janela (amostragem leve 3 fps) →
    //    enquadramento suavizado da trilha dominante (câmera estática;
    //    corte de cena rebate o fundo e arquiva as trilhas do plano)
    let framing = (|| -> Option<crate::clips::types::Framing> {
        let (width, height, frames) =
            super::tracking::decode_frames(ffmpeg, source, clip.start, clip.end, 3.0, control)
                .ok()?;
        let tracks = super::tracking::motion_tracks(&frames, width, height);
        let dominant = tracks.first()?;
        let (cx, cy) = dominant.smoothed_framing(0.02)?;
        Some(crate::clips::types::Framing {
            cx,
            cy,
            source: "tracking".into(),
        })
    })();
    clip.multimodal = Some(crate::clips::types::MultimodalEvidence {
        frames: frame_times.to_vec(),
        visual,
        audio_events,
        boundary_adjustments: deltas,
        backend: "experimentalGemmaMultimodal".into(),
        framing,
    });
    Ok(())
}

/// Base64 padrão (RFC 4648, com padding) — evita dependência só para isto.
pub fn base64_standard(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(triple >> 18) as usize & 63] as char);
        out.push(ALPHABET[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(triple >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[triple as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_reference_vectors() {
        assert_eq!(base64_standard(b""), "");
        assert_eq!(base64_standard(b"f"), "Zg==");
        assert_eq!(base64_standard(b"fo"), "Zm8=");
        assert_eq!(base64_standard(b"foo"), "Zm9v");
        assert_eq!(base64_standard(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn discover_degrades_when_disabled_or_incomplete() {
        // kill-switch explícito → degradação textual (None) mesmo na árvore
        // de dev, que possui todos os artefatos
        std::env::set_var("CNP_DISABLE_MULTIMODAL", "1");
        let base = std::env::temp_dir().join("cnp-mm-test-inexistivel");
        let degraded = discover(&base).is_none();
        std::env::remove_var("CNP_DISABLE_MULTIMODAL");
        assert!(degraded);
    }

    #[test]
    fn snap_edge_skips_dead_air_and_respects_minimum() {
        let pauses = vec![(10.0, 12.0), (30.0, 31.0)];
        // início dentro da pausa 10–12 → vai para 12 mantendo mínimo
        assert_eq!(
            snap_edge_to_speech(11.0, true, &pauses, 5.0, 25.0),
            Some(12.0)
        );
        // fim dentro da pausa 30–31 → recua para 30 (mantém 20 s)
        assert_eq!(
            snap_edge_to_speech(30.5, false, &pauses, 5.0, 10.0),
            Some(30.0)
        );
        // pausa curta demais não mexe
        let short = vec![(10.0, 10.2)];
        assert_eq!(snap_edge_to_speech(10.1, true, &short, 5.0, 25.0), None);
        // fora de pausa não mexe
        assert_eq!(snap_edge_to_speech(20.0, true, &pauses, 5.0, 25.0), None);
    }

    #[test]
    fn server_posts_completion_with_canonical_sampling() {
        use std::io::{Read, Write};
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 8192];
            let read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
            let body_start = request.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
            let body: serde_json::Value = serde_json::from_str(&request[body_start..]).unwrap();
            let response = serde_json::json!({ "content": "ok-do-mock" });
            let payload = response.to_string();
            let _ = stream.write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    payload.len(),
                    payload
                )
                .as_bytes(),
            );
            body
        });
        let server = Server {
            child: if cfg!(windows) {
                Command::new("cmd").args(["/c", "exit 0"]).spawn().unwrap()
            } else {
                Command::new("true").spawn().unwrap()
            },
            port,
            client: reqwest::blocking::Client::new(),
        };
        let control = ProcessControl::default();
        let answer = server
            .completion("<|turn>user\nolá<turn|", 16, None, &control)
            .unwrap();
        assert_eq!(answer, "ok-do-mock");
        let body = handle.join().unwrap();
        assert_eq!(body["stop"][0], "<turn|>");
        assert_eq!(body["temperature"], TEMPERATURE);
        assert_eq!(body["seed"], SEED);
        drop(server);
    }
}

/** F1 (goal-refino-editorial-fluxo-local): artefatos do server TEXTUAL —
 *  mesmo binário/modelo, SEM exigir mmproj. O transporte por server não é
 *  modalidade visual: nenhuma pergunta de visão/áudio acontece por aqui. */
pub fn text_server_tools(base: &Path) -> Option<ServerTools> {
    if std::env::var_os("CNP_DISABLE_MULTIMODAL").is_some() {
        return None; // kill-switch também vale para o server textual
    }
    let root = analysis_root(base);
    let exe_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    let mut exe_candidates = vec![
        root.join("bin").join(exe_name),
        root.join("server").join(exe_name),
    ];
    if cfg!(debug_assertions) {
        exe_candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.tooling/vendor/llamacpp-b11829")
                .join(exe_name),
        );
    }
    let exe = exe_candidates.into_iter().find(|path| path.is_file())?;
    let model = super::text_engine::gemma_model_path(base)?;
    Some(ServerTools {
        exe,
        model,
        mmproj: None,
    })
}
