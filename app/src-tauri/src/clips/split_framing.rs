use crate::{
    media_store::MediaStore, processing::ProcessingGate, render::split_screen::SplitScreen,
    transcription::process::ProcessControl,
};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{mpsc, Arc},
    thread::JoinHandle,
    time::Duration,
};
use tauri::{AppHandle, Manager};

const MAX_RESPONSE_BYTES: usize = 65536;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Viewport {
    fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|value| value.is_finite())
            && self.x >= 0.0
            && self.y >= 0.0
            && self.width > 0.0
            && self.height > 0.0
            && self.x + self.width <= 1.0 + 1e-9
            && self.y + self.height <= 1.0 + 1e-9
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SplitSuggestion {
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<SplitScreen>,
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    version: u8,
    backend: String,
    samples: usize,
    suggestion: SplitSuggestion,
    elapsed_ms: u64,
    peak_working_set_bytes: u64,
}

fn manual(message: &str) -> SplitSuggestion {
    SplitSuggestion {
        status: "manual".into(),
        layout: None,
        message: message.into(),
    }
}

fn parse_response(bytes: &[u8]) -> Result<SplitSuggestion, String> {
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Resposta de tela dividida excedeu o limite.".into());
    }
    let response: Response = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let mut suggestion = response.suggestion;
    if suggestion.status == "found" {
        if let Some(layout) = suggestion.layout.as_mut() {
            layout.face_validated = true;
        }
    }
    let layout_valid = match suggestion.status.as_str() {
        "found" => suggestion.layout.as_ref().is_some_and(|layout| {
            layout.valid()
                && layout
                    .shots
                    .as_ref()
                    .is_some_and(|shots| response.samples >= shots.len() * 3)
        }),
        "manual" => suggestion.layout.is_none(),
        _ => false,
    };
    if response.version != 2
        || response.backend != "yunet-split-scenes-v2"
        || response.samples > 192
        || (suggestion.status == "found" && response.samples < 3)
        || !layout_valid
        || suggestion.message.trim().is_empty()
        || suggestion.message.len() > 500
    {
        return Err("Resposta de tela dividida inválida.".into());
    }
    eprintln!(
        "[split] YuNet: {} amostras, {} ms, pico {} MiB",
        response.samples,
        response.elapsed_ms,
        response.peak_working_set_bytes / 1024 / 1024
    );
    Ok(suggestion)
}

fn parse_window_response(bytes: &[u8], start: f64, end: f64) -> Result<SplitSuggestion, String> {
    let suggestion = parse_response(bytes)?;
    if suggestion
        .layout
        .as_ref()
        .and_then(|layout| layout.shots.as_ref())
        .is_some_and(|shots| {
            shots
                .iter()
                .any(|shot| shot.source_start < start || shot.source_end > end)
        })
    {
        return Err("O detector retornou regiões fora do intervalo solicitado.".into());
    }
    Ok(suggestion)
}

fn validate_window(start: f64, end: f64, duration: f64) -> Result<(), String> {
    if ![start, end, duration].iter().all(|n| n.is_finite())
        || start < 0.0
        || end - start < 0.05
        || duration <= 0.0
        || end > duration
    {
        return Err("Selecione um intervalo válido da mídia para sugerir os painéis.".into());
    }
    Ok(())
}

fn deadline(
    control: &Arc<ProcessControl>,
    timeout: Duration,
) -> (mpsc::Sender<()>, JoinHandle<()>) {
    let (sender, receiver) = mpsc::channel();
    let owned_control = control.clone();
    let watcher = std::thread::spawn(move || {
        if matches!(
            receiver.recv_timeout(timeout),
            Err(mpsc::RecvTimeoutError::Timeout)
        ) {
            owned_control.cancel();
        }
    });
    (sender, watcher)
}

fn suggest(
    base: &Path,
    source: &Path,
    start: f64,
    end: f64,
    viewport: Option<Viewport>,
) -> Result<SplitSuggestion, String> {
    let Some(python) = super::face_framing::python(base) else {
        return Ok(manual(
            "O detector local de rostos está indisponível. Use quadro único ou tente novamente após verificar o recurso local.",
        ));
    };
    let tools = crate::media_analyze::detect_fftools()
        .ok_or("FFmpeg não encontrado. Verifique o recurso local e tente novamente.")?;
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let scratch = crate::render::scratch::Scratch::new(base)?;
    let worker = scratch.path.join("face-worker.py");
    let model = scratch.path.join("face_detection_yunet_2023mar.onnx");
    let request = scratch.path.join("split-request.json");
    let output = scratch.path.join("split-result.json");
    std::fs::write(
        &worker,
        include_str!("../../../../tools/face-framing/worker.py"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        scratch.path.join("split_worker.py"),
        include_str!("../../../../tools/face-framing/split_worker.py"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        &model,
        include_bytes!("../../resources/models/face_detection_yunet_2023mar.onnx"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        &request,
        serde_json::to_vec(&serde_json::json!({
            "version":2,"mode":"split","source":source,"model":model,"start":start,"end":end,
            "ffmpeg":ffmpeg,"viewport":viewport
        }))
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let mut command = python.command(&worker);
    command
        .arg("--request")
        .arg(&request)
        .arg("--output")
        .arg(&output)
        .env("OMP_NUM_THREADS", "1")
        .env("OPENBLAS_NUM_THREADS", "1")
        .env("OPENCV_LOG_LEVEL", "ERROR");
    let control = Arc::new(ProcessControl::default());
    let (finished, watcher) = deadline(&control, Duration::from_secs(75));
    let result = control.run(command, &scratch.path.join("split-worker.log"));
    let _ = finished.send(());
    let _ = watcher.join();
    result?;
    if std::fs::metadata(&output).map_err(|e| e.to_string())?.len() > MAX_RESPONSE_BYTES as u64 {
        return Err("Resposta de tela dividida excedeu o limite.".into());
    }
    parse_window_response(
        &std::fs::read(output).map_err(|e| e.to_string())?,
        start,
        end,
    )
}

#[tauri::command]
pub async fn suggest_split_screen(
    app: AppHandle,
    project_id: String,
    media_id: String,
    start: f64,
    end: f64,
    viewport: Option<Viewport>,
) -> Result<SplitSuggestion, String> {
    if viewport.as_ref().is_some_and(|viewport| !viewport.valid()) {
        return Err("Selecione uma região válida do vídeo para localizar as pessoas.".into());
    }
    let lease = app.state::<Arc<ProcessingGate>>().acquire()?;
    let (entry, duration) = super::commands::media(&app, &project_id, &media_id)?;
    validate_window(start, end, duration)?;
    let base = crate::app_data_base(&app)?;
    let source = app
        .state::<MediaStore>()
        .files_dir()
        .join(format!("{}.{}", entry.sha256, entry.ext));
    if !source.is_file() {
        return Err("O vídeo está indisponível. Reconecte o arquivo original.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        match suggest(&base, &source, start, end, viewport) {
            Ok(suggestion) => suggestion,
            Err(error) => {
                eprintln!("[split] sugestão local não aplicada: {error}");
                manual("Não foi possível concluir a sugestão local. Tente novamente ou use quadro único.")
            }
        }
    }).await.map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "split_framing_tests.rs"]
mod tests;
