//! Scheme `cnplocal` — serve a MÍDIA PERSISTENTE DO USUÁRIO (M2A) ao WebView.
//! Padrão do `media_proxy.rs` (03B.6, intocado): no Windows o scheme é servido
//! como `http://cnplocal.localhost/<sha256>.<ext>`. Whitelist = hashes do
//! índice de mídia; Range/206 para seek; ACAO:* para os canvases de
//! miniaturas (filmstrip usa crossOrigin="anonymous").
//!
//! Atualização 20: Range pede SÓ os bytes do intervalo (seek + read_exact),
//! sem carregar o arquivo inteiro na memória. A leitura integral permanece
//! apenas no caminho SEM Range (carga inicial), pois o responder do Tauri
//! exige o corpo completo.

use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Wry};
use tauri::{UriSchemeContext, UriSchemeResponder};

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

/// Interpreta `Range: bytes=...`. Suporta fechado (a-b), aberto (a-) e
/// sufixo (-n). Retorna None se o header está ausente ou é inválido.
fn parse_range(headers: &tauri::http::HeaderMap, len: u64) -> Option<(u64, u64)> {
    let h = headers.get(header::RANGE)?.to_str().ok()?;
    let spec = h.strip_prefix("bytes=")?;
    // múltiplos ranges não são suportados (devolve None = 200 completo)
    if spec.contains(',') {
        return None;
    }
    let (a, b) = spec.split_once('-')?;
    if a.is_empty() {
        // sufixo: últimos N bytes
        let n: u64 = b.parse().ok()?;
        if n == 0 || len == 0 {
            return None;
        }
        let start = len.saturating_sub(n);
        Some((start, len - 1))
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() {
            len.saturating_sub(1)
        } else {
            b.parse().ok()?
        };
        if start <= end && end < len {
            Some((start, end))
        } else {
            None
        }
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

pub fn handle(
    ctx: UriSchemeContext<'_, Wry>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        let resp = serve(&app, &request);
        responder.respond(resp);
    });
}

fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(store) = app.try_state::<MediaStore>() else {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "store de mídia indisponível",
        );
    };
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

    let file = match std::fs::File::open(&path) {
        Ok(f) => f,
        Err(_) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "arquivo de mídia não encontrado no disco",
            )
        }
    };
    let len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, "metadados indisponíveis")
        }
    };
    let ctype = content_type(ext);

    match parse_range(request.headers(), len) {
        Some((s, e)) => {
            // LER SOMENTE O INTERVALO: posiciona no início e lê os bytes
            // pedidos — sem carregar o resto do arquivo na memória
            let count = (e - s + 1) as usize;
            let mut buf = vec![0u8; count];
            let mut f = file;
            if f.seek(SeekFrom::Start(s)).is_err() {
                return error_response(StatusCode::INTERNAL_SERVER_ERROR, "seek indisponível");
            }
            if f.read_exact(&mut buf).is_err() {
                return error_response(StatusCode::INTERNAL_SERVER_ERROR, "leitura parcial falhou");
            }
            media_response(
                StatusCode::PARTIAL_CONTENT,
                buf,
                vec![
                    (header::CONTENT_TYPE, ctype.to_string()),
                    (header::CONTENT_RANGE, format!("bytes {s}-{e}/{len}")),
                    (header::CONTENT_LENGTH, format!("{}", e - s + 1)),
                ],
            )
        }
        None => {
            // sem Range (carga inicial): lê o arquivo completo — o responder
            // do Tauri exige o corpo inteiro; o browser usa Range daqui em
            // diante para seek/playback
            let mut data = Vec::with_capacity(len as usize);
            let mut f = file;
            if f.read_to_end(&mut data).is_err() {
                return error_response(StatusCode::INTERNAL_SERVER_ERROR, "leitura falhou");
            }
            media_response(
                StatusCode::OK,
                data,
                vec![
                    (header::CONTENT_TYPE, ctype.to_string()),
                    (header::CONTENT_LENGTH, format!("{len}")),
                ],
            )
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::http::HeaderMap;

    fn headers_with(range: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(header::RANGE, range.parse().unwrap());
        h
    }

    #[test]
    fn parse_range_fechado_aberto_e_sufixo() {
        let len = 1000u64;
        assert_eq!(parse_range(&headers_with("bytes=0-99"), len), Some((0, 99)));
        assert_eq!(
            parse_range(&headers_with("bytes=500-"), len),
            Some((500, 999))
        );
        assert_eq!(
            parse_range(&headers_with("bytes=-100"), len),
            Some((900, 999))
        );
        assert_eq!(
            parse_range(&headers_with("bytes=0-999"), len),
            Some((0, 999))
        );
        // inválidos
        assert_eq!(parse_range(&headers_with("bytes=999-0"), len), None);
        assert_eq!(parse_range(&headers_with("bytes=0-1000"), len), None);
        assert_eq!(parse_range(&headers_with("bytes=abc"), len), None);
        assert_eq!(parse_range(&HeaderMap::new(), len), None);
    }
}
