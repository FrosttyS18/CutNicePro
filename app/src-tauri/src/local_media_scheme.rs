use std::io::{Read, Seek, SeekFrom};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Wry};
use tauri::{UriSchemeContext, UriSchemeResponder};

use crate::media_store::MediaStore;

const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

fn content_type(ext: &str) -> &'static str {
    match ext {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
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
        Some((
            start,
            (len - 1).min(start.saturating_add(MAX_RESPONSE_BYTES - 1)),
        ))
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() {
            len.saturating_sub(1)
        } else {
            b.parse().ok()?
        };
        if start <= end && start < len {
            Some((
                start,
                end.min(len - 1)
                    .min(start.saturating_add(MAX_RESPONSE_BYTES - 1)),
            ))
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
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Range, Content-Length, Accept-Ranges",
        )
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
    tauri::async_runtime::spawn_blocking(move || {
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
    serve_store(&store, request)
}

fn serve_store(store: &MediaStore, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = request
        .uri()
        .path()
        .trim_start_matches('/')
        .to_ascii_lowercase();
    let by_id = name.strip_prefix("media/");
    let filename = by_id.unwrap_or(&name);
    if filename.contains('/') || filename.contains('\\') {
        return error_response(StatusCode::NOT_FOUND, "identificador de mídia inválido");
    }
    let Some((identifier, ext)) = filename.rsplit_once('.') else {
        return error_response(StatusCode::NOT_FOUND, "mídia fora do índice");
    };
    let entry = if by_id.is_some() {
        if uuid::Uuid::parse_str(identifier).is_err() {
            return error_response(StatusCode::NOT_FOUND, "identificador de mídia inválido");
        }
        store.get(identifier).ok().flatten()
    } else {
        if identifier.len() != 64 || !identifier.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return error_response(StatusCode::NOT_FOUND, "identificador de mídia inválido");
        }
        let entries = match store.entries() {
            Ok(entries) => entries,
            Err(_) => return error_response(StatusCode::NOT_FOUND, "índice de mídia indisponível"),
        };
        let matching: Vec<_> = entries
            .into_iter()
            .filter(|entry| entry.sha256 == identifier && entry.ext == ext)
            .collect();
        let managed: Vec<_> = matching
            .iter()
            .filter(|entry| matches!(entry.storage, crate::media_store::MediaStorage::Managed))
            .collect();
        if managed.len() == 1 {
            managed.first().map(|entry| (*entry).clone())
        } else if matching.len() == 1 {
            matching.into_iter().next()
        } else {
            None
        }
    };
    let Some(entry) = entry else {
        return error_response(
            StatusCode::NOT_FOUND,
            "mídia fora do índice ou rota ambígua; use o identificador da mídia",
        );
    };
    if entry.ext != ext {
        return error_response(StatusCode::NOT_FOUND, "extensão não corresponde à mídia");
    }
    let source = match store.resolve(&entry.media_id, None) {
        Ok(source) => source,
        Err(error) => return error_response(StatusCode::CONFLICT, &error),
    };
    let file = match source.guard.file.try_clone() {
        Ok(file) => file,
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "leitura indisponível"),
    };
    let response = serve_handle(file, ext, request);
    if let Err(error) = source.recheck() {
        return error_response(StatusCode::CONFLICT, &error);
    }
    response
}

#[cfg(test)]
fn serve_file(path: &std::path::Path, ext: &str, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "arquivo de mídia não encontrado no disco",
            )
        }
    };
    serve_handle(file, ext, request)
}

fn serve_handle(file: std::fs::File, ext: &str, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, "metadados indisponíveis")
        }
    };
    let ctype = content_type(ext);

    if request.method() == tauri::http::Method::HEAD {
        return media_response(
            StatusCode::OK,
            Vec::new(),
            vec![
                (header::CONTENT_TYPE, ctype.to_string()),
                (header::CONTENT_LENGTH, len.to_string()),
            ],
        );
    }
    if request.method() != tauri::http::Method::GET {
        return error_response(StatusCode::METHOD_NOT_ALLOWED, "método não suportado");
    }
    let range = parse_range(request.headers(), len);
    if request.headers().contains_key(header::RANGE) && range.is_none() {
        return media_response(
            StatusCode::RANGE_NOT_SATISFIABLE,
            Vec::new(),
            vec![
                (header::CONTENT_RANGE, format!("bytes */{len}")),
                (header::CONTENT_LENGTH, "0".into()),
            ],
        );
    }
    if range.is_none() && len > MAX_RESPONSE_BYTES {
        return error_response(
            StatusCode::BAD_REQUEST,
            "mídias grandes exigem leitura parcial com Range",
        );
    }

    match range {
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
    use std::path::PathBuf;
    use tauri::http::HeaderMap;

    #[test]
    fn legacy_sha_route_keeps_its_managed_source_when_reference_has_same_digest() {
        let fixture = crate::media_store::reference_tests::Fixture::new();
        let store = fixture.store();
        let original = fixture.source("new.mp4", b"abc");
        let verified = crate::media_import::verify_reference(
            &original,
            &std::sync::atomic::AtomicBool::new(false),
            &|_| {},
            std::time::Duration::from_secs(10),
        )
        .unwrap();
        let part = store.files_dir().join("legacy.part");
        std::fs::write(&part, b"abc").unwrap();
        store
            .publish(
                &part,
                &verified.sha256,
                3,
                "mp4",
                "legacy.mp4",
                "legacy-project",
            )
            .unwrap();
        store
            .publish_reference(&verified, "mp4", "new.mp4", "new-project", None)
            .unwrap();
        let request = Request::builder()
            .uri(format!("http://cnplocal.localhost/{}.mp4", verified.sha256))
            .body(Vec::new())
            .unwrap();
        let response = serve_store(&store, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), b"abc");
    }

    #[test]
    fn registered_reference_serves_original_range_and_blocks_changed_source() {
        let fixture = crate::media_store::reference_tests::Fixture::new();
        let original = fixture.source("vídeo com espaços.mp4", b"0123456789");
        let checked = crate::media_import::verify_reference(
            &original,
            &std::sync::atomic::AtomicBool::new(false),
            &|_| {},
            std::time::Duration::from_secs(10),
        )
        .unwrap();
        let store = fixture.store();
        let entry = store
            .publish_reference(&checked, "mp4", "vídeo com espaços.mp4", "p1", None)
            .unwrap();
        drop(checked);
        let request = Request::builder()
            .uri(format!(
                "http://cnplocal.localhost/media/{}.mp4?reload=1",
                entry.media_id
            ))
            .header(header::RANGE, "bytes=3-6")
            .body(Vec::new())
            .unwrap();
        let response = serve_store(&store, &request);
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), b"3456");
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 3-6/10");
        let outside = Request::builder()
            .uri("http://cnplocal.localhost/media/not-registered.mp4")
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            serve_store(&store, &outside).status(),
            StatusCode::NOT_FOUND
        );
        std::fs::write(&original, b"different content").unwrap();
        assert_eq!(serve_store(&store, &request).status(), StatusCode::CONFLICT);
    }

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
        assert_eq!(parse_range(&headers_with("bytes=1000-1001"), len), None);
        assert_eq!(parse_range(&headers_with("bytes=abc"), len), None);
        assert_eq!(parse_range(&HeaderMap::new(), len), None);
    }

    #[test]
    fn range_aberto_em_video_grande_tem_leitura_limitada() {
        let len = 796_580_866;
        assert_eq!(
            parse_range(&headers_with("bytes=0-"), len),
            Some((0, 4 * 1024 * 1024 - 1))
        );
        assert_eq!(
            parse_range(&headers_with("bytes=500000000-"), len),
            Some((500000000, 500000000 + 4 * 1024 * 1024 - 1))
        );
    }

    fn fixture_file() -> PathBuf {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-media");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{}.mp4", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"0123456789").unwrap();
        path
    }

    #[test]
    fn range_invalido_nao_retorna_o_arquivo_inteiro() {
        let path = fixture_file();
        let request = Request::builder()
            .header(header::RANGE, "bytes=99-")
            .body(Vec::new())
            .unwrap();
        let response = serve_file(&path, "mp4", &request);
        std::fs::remove_file(path).unwrap();
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */10");
    }

    #[test]
    fn head_retorna_metadados_sem_carregar_corpo() {
        let path = fixture_file();
        let request = Request::builder().method("HEAD").body(Vec::new()).unwrap();
        let response = serve_file(&path, "mp4", &request);
        std::fs::remove_file(path).unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "10");
        assert!(response.body().is_empty());
    }

    #[test]
    fn leitura_parcial_preserva_conteudo_e_headers() {
        let path = fixture_file();
        let request = Request::builder()
            .header(header::RANGE, "bytes=3-6")
            .body(Vec::new())
            .unwrap();
        let response = serve_file(&path, "mp4", &request);
        std::fs::remove_file(path).unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), b"3456");
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 3-6/10");
        assert!(response
            .headers()
            .contains_key(header::ACCESS_CONTROL_EXPOSE_HEADERS));
    }

    #[test]
    fn range_com_fim_alem_do_arquivo_retorna_os_bytes_disponiveis() {
        let path = fixture_file();
        let request = Request::builder()
            .header(header::RANGE, "bytes=3-999")
            .body(Vec::new())
            .unwrap();
        let response = serve_file(&path, "mp4", &request);
        std::fs::remove_file(path).unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), b"3456789");
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 3-9/10");
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "7");
        assert_eq!(
            parse_range(&headers_with("bytes=0-1000"), 1000),
            Some((0, 999))
        );
        assert_eq!(parse_range(&headers_with("bytes=0-0"), 0), None);
    }

    #[test]
    fn video_grande_sem_range_nao_aloca_o_arquivo_inteiro() {
        let path = fixture_file();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(5 * 1024 * 1024)
            .unwrap();
        let request = Request::builder().body(Vec::new()).unwrap();
        let response = serve_file(&path, "mp4", &request);
        std::fs::remove_file(path).unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(response.body().len() < 1024);
    }
}
