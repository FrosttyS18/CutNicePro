//! Scheme `cnplocal` — serve a MÍDIA PERSISTENTE DO USUÁRIO (M2A) ao WebView.
//! Padrão do `media_proxy.rs` (03B.6, intocado): no Windows o scheme é servido
//! como `http://cnplocal.localhost/<sha256>.<ext>`. Whitelist = hashes do
//! índice de mídia; Range/206 para seek; ACAO:* para os canvases de
//! miniaturas (filmstrip usa crossOrigin="anonymous").

use std::path::PathBuf;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};
use tauri::{AppHandle, Manager, Wry};

use crate::media_store::MediaStore;

fn content_type(ext: &str) -> &'static str {
    match ext {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}

fn parse_range(headers: &tauri::http::HeaderMap, len: u64) -> Option<(u64, u64)> {
    let h = headers.get(header::RANGE)?.to_str().ok()?;
    let spec = h.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let start: u64 = a.parse().ok()?;
    let end = if b.is_empty() { len - 1 } else { b.parse().ok()? };
    if start <= end && end < len {
        Some((start, end))
    } else {
        None
    }
}

fn media_response(
    status: StatusCode,
    body: Vec<u8>,
    extra: Vec<(header::HeaderName, String)>,
) -> Response<Vec<u8>> {
    let mut b = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "private, no-store");
    for (k, v) in extra {
        b = b.header(k, v);
    }
    b.body(body).unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn handle(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        let resp = serve(&app, &request);
        responder.respond(resp);
    });
}

fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(store) = app.try_state::<MediaStore>() else {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, "store de mídia indisponível");
    };
    // Aceita "cnplocal://localhost/<file>" e sobras "http://cnplocal.localhost/<file>"
    let name = request
        .uri()
        .path()
        .trim_start_matches('/')
        .to_ascii_lowercase();
    let Some((sha, ext)) = name.rsplit_once('.') else {
        return error_response(StatusCode::NOT_FOUND, "mídia fora do índice");
    };
    if sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return error_response(StatusCode::NOT_FOUND, "identificador de mídia inválido");
    }
    // Whitelist: o hash precisa existir no índice (e não estar unavailable).
    let entry = match store.find(sha) {
        Ok(Some(e)) if !e.unavailable => e,
        Ok(Some(_)) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "arquivo de mídia ausente do disco (marcada indisponível)",
            )
        }
        _ => return error_response(StatusCode::NOT_FOUND, "mídia fora do índice"),
    };
    if entry.ext != ext {
        return error_response(StatusCode::NOT_FOUND, "extensão não corresponde à mídia");
    }
    let path: PathBuf = store.files_dir().join(&name);
    let data = match std::fs::read(&path) {
        Ok(d) => d,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "arquivo de mídia não encontrado no disco")
        }
    };
    let len = data.len() as u64;
    let ctype = content_type(ext);
    match parse_range(request.headers(), len) {
        Some((s, e)) => {
            let slice = data[s as usize..=(e as usize)].to_vec();
            media_response(
                StatusCode::PARTIAL_CONTENT,
                slice,
                vec![
                    (header::CONTENT_TYPE, ctype.to_string()),
                    (
                        header::CONTENT_RANGE,
                        format!("bytes {s}-{e}/{len}"),
                    ),
                    (header::CONTENT_LENGTH, format!("{}", e - s + 1)),
                ],
            )
        }
        None => media_response(
            StatusCode::OK,
            data,
            vec![
                (header::CONTENT_TYPE, ctype.to_string()),
                (header::CONTENT_LENGTH, format!("{len}")),
            ],
        ),
    }
}

fn error_response(code: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}
