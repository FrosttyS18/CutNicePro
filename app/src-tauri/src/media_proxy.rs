//! Proxy de mídia da Home — Fase 03B.6 (INTEGRAÇÃO CDN, módulo ISOLADO).
//!
//! O bucket R2 oficial NÃO envia Access-Control-Allow-Origin (comprovado por
//! teste: preflight 403 e GET sem ACAO), o que impede usar <video> como
//! VideoTexture WebGL direto da CDN (taint sem crossOrigin; load falha com).
//! Este proxy registra o scheme `cnpmedia://` servido pelo processo Rust:
//!
//!   cnpmedia://localhost/cutNicePro/16-9/16-9_01.mp4
//!     → GET https://pub-...r2.dev/cutNicePro/16-9/16-9_01.mp4
//!
//! - Responde Access-Control-Allow-Origin: * (o vídeo usa crossOrigin=
//!   "anonymous", mesma prática do Hero Galaxy original com o CDN deles).
//! - Cache em disco (app-data/cnp-media): a primeira requisição baixa o
//!   arquivo completo e o grava; requisições seguintes (inclusive OFFLINE)
//!   servem do cache com suporte a Range local — a Home nunca depende da
//!   rede para abrir (posters locais + vídeos em cache).
//! - Não toca em storage.rs, comandos IPC ou qualquer regra existente.
//!
//! Limitações deliberadas: aceita apenas os 20 caminhos do manifesto
//! (whitelist por padrão de nome), sem proxy genérico.

use std::path::PathBuf;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeContext, Wry};

const CDN_BASE: &str = "https://pub-d187d959393643849829e2af107e1fd4.r2.dev/cutNicePro";

/// Whitelist: diretório/pasta/nome.mp4 permitidos (os 20 arquivos da 03B.6).
const ALLOWED: &[&str] = &[
    "1-1/1-1_01.mp4",
    "1-1/1-1_02.mp4",
    "1-1/1-1_03.mp4",
    "1-1/1-1_04.mp4",
    "1-1/1-1_05.mp4",
    "1-1/1-1_06.mp4",
    "1-1/1-1_07.mp4",
    "9-16/9-16_01.mp4",
    "9-16/9-16_02.mp4",
    "9-16/9-16_03.mp4",
    "9-16/9-16_04.mp4",
    "9-16/9-16_05.mp4",
    "9-16/9-16_06.mp4",
    "9-16/9-16_07.mp4",
    "16-9/16-9_01.mp4",
    "16-9/16-9_02.mp4",
    "16-9/16-9_03.mp4",
    "16-9/16-9_05.mp4",
    "16-9/16-9_06.mp4",
    "16-9/16-9_07.mp4",
];

fn cache_path(app: &AppHandle, rel: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("cnp-media");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(rel.replace('/', "_"))
}

/// Extrai o caminho relativo permitido do URI do request.
fn allowed_rel(uri: &tauri::http::Uri) -> Option<String> {
    let path = uri.path().trim_start_matches('/');
    // aceita "cutNicePro/<dir>/<file>" e "<dir>/<file>"
    let rel = path.strip_prefix("cutNicePro/").unwrap_or(path);
    if ALLOWED.contains(&rel) {
        Some(rel.to_string())
    } else {
        None
    }
}

fn parse_range(headers: &tauri::http::HeaderMap, len: u64) -> Option<(u64, u64)> {
    let h = headers.get(header::RANGE)?.to_str().ok()?;
    let spec = h.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let start: u64 = a.parse().ok()?;
    let end = if b.is_empty() {
        len - 1
    } else {
        b.parse().ok()?
    };
    if start <= end && end < len {
        Some((start, end))
    } else {
        None
    }
}

fn video_response(
    status: StatusCode,
    body: Vec<u8>,
    extra: Vec<(header::HeaderName, String)>,
) -> Response<Vec<u8>> {
    let mut b = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "public, max-age=604800");
    for (k, v) in extra {
        b = b.header(k, v);
    }
    b.body(body).unwrap_or_else(|_| Response::new(Vec::new()))
}

fn error_response(code: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Handler assíncrono do scheme (registrado no builder do Tauri).
pub fn handle(
    ctx: UriSchemeContext<'_, Wry>,
    request: Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        let resp = serve(&app, &request).await;
        responder.respond(resp);
    });
}

async fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(rel) = allowed_rel(request.uri()) else {
        return error_response(StatusCode::NOT_FOUND, "mídia fora do manifesto");
    };

    let cache = cache_path(app, &rel);
    let data: Vec<u8> = if cache.is_file() {
        match std::fs::read(&cache) {
            Ok(d) => d,
            Err(e) => {
                return error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("cache: {e}"))
            }
        }
    } else {
        // Primeira requisição: baixa completo, grava no cache e serve.
        let url = format!("{CDN_BASE}/{rel}");
        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                Ok(bytes) => {
                    let d = bytes.to_vec();
                    if !d.is_empty() {
                        let _ = std::fs::write(&cache, &d);
                    }
                    d
                }
                Err(e) => return error_response(StatusCode::BAD_GATEWAY, &format!("corpo: {e}")),
            },
            Ok(resp) => {
                return error_response(
                    StatusCode::BAD_GATEWAY,
                    &format!("CDN respondeu {}", resp.status()),
                )
            }
            Err(e) => return error_response(StatusCode::BAD_GATEWAY, &format!("rede: {e}")),
        }
    };

    if data.is_empty() {
        return error_response(StatusCode::BAD_GATEWAY, "corpo vazio");
    }

    let len = data.len() as u64;
    match parse_range(request.headers(), len) {
        Some((s, e)) => {
            let slice = data[s as usize..=(e as usize)].to_vec();
            video_response(
                StatusCode::PARTIAL_CONTENT,
                slice,
                vec![
                    (header::CONTENT_RANGE, format!("bytes {s}-{e}/{len}")),
                    (header::CONTENT_LENGTH, format!("{}", e - s + 1)),
                ],
            )
        }
        None => video_response(
            StatusCode::OK,
            data,
            vec![(header::CONTENT_LENGTH, format!("{len}"))],
        ),
    }
}
