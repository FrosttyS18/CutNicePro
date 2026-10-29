use super::{render_graph, render_plan, types::Composition};
use crate::{render::encoder, transcription::process::ProcessControl};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    path::{Component, Path, PathBuf},
    process::Command,
    time::Instant,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    document: Composition,
    sources: HashMap<String, PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Measurement {
    filter_threads: u8,
    elapsed_ms: u128,
    frames: u64,
    encoder: String,
}

pub(super) fn output_directory() -> PathBuf {
    let workspace = fs::canonicalize("C:/CutNicePro").expect("Workspace do laboratório ausente");
    let allowed = fs::canonicalize("C:/CutNicePro/.tooling/test-output")
        .expect("Crie .tooling/test-output antes de executar o laboratório");
    assert!(
        allowed.starts_with(&workspace),
        "Destino base fora do workspace"
    );
    let requested = PathBuf::from(
        env::var_os("CNP_RENDER_PERF_OUTPUT").expect("Defina CNP_RENDER_PERF_OUTPUT"),
    );
    assert!(requested.is_absolute(), "O destino deve ser absoluto");
    assert!(
        !requested
            .components()
            .any(|part| part == Component::ParentDir),
        "O destino não pode conter .."
    );
    let existing = requested
        .ancestors()
        .find(|path| path.exists())
        .expect("O destino não possui ancestral acessível");
    let existing = fs::canonicalize(existing).expect("Ancestral do destino inválido");
    assert!(
        existing.starts_with(&allowed),
        "CNP_RENDER_PERF_OUTPUT deve ficar dentro de C:/CutNicePro/.tooling/test-output"
    );
    fs::create_dir_all(&requested).expect("Não foi possível criar o destino do laboratório");
    let output = fs::canonicalize(requested).expect("Destino do laboratório inválido");
    assert!(
        output.starts_with(&allowed),
        "Destino resolvido fora da área permitida"
    );
    let run = output.join(format!("run-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&run).expect("Não foi possível criar uma execução nova");
    run
}

fn run_case(
    input: &Input,
    window: &render_plan::Window,
    directory: &Path,
    ffmpeg: &Path,
    ffprobe: &Path,
    threads: u8,
    control: &ProcessControl,
) -> Measurement {
    fs::create_dir(directory).expect("Não foi possível criar a variante");
    crate::render::fonts::prepare(directory).expect("Preparação das fontes falhou");
    let mut args = render_graph::video(
        &input.document,
        window,
        &input.sources,
        directory,
        0,
        encoder::Encoder::Nvenc,
    )
    .expect("Não foi possível gerar o grafo real da montagem");
    let position = args
        .iter()
        .position(|argument| argument == "-filter_complex_threads")
        .expect("O comando não define filter_complex_threads");
    *args
        .get_mut(position + 1)
        .expect("filter_complex_threads sem valor") = threads.to_string().into();
    let arguments: Vec<_> = args
        .iter()
        .map(|argument| argument.to_str().expect("Argumento sem UTF-8 válido"))
        .collect();
    fs::write(
        directory.join("arguments.json"),
        serde_json::to_vec_pretty(&arguments).unwrap(),
    )
    .expect("Não foi possível preservar os argumentos");
    let mut command = Command::new(ffmpeg);
    command.current_dir(directory).args(&args);
    let started = Instant::now();
    control
        .run(command, &directory.join("ffmpeg.log"))
        .expect("Render do laboratório falhou; consulte ffmpeg.log");
    let elapsed_ms = started.elapsed().as_millis();
    let metadata_path = directory.join("metadata.json");
    let mut probe = Command::new(ffprobe);
    probe
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_frames,codec_name:stream_tags=encoder",
            "-of",
            "json",
        ])
        .arg(directory.join("part-0.mp4"));
    control
        .run_to_file(&mut probe, &directory.join("ffprobe.log"), &metadata_path)
        .expect("Não foi possível conferir o MP4 do laboratório");
    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(metadata_path).unwrap()).unwrap();
    let stream = &metadata["streams"][0];
    let frames: u64 = stream["nb_frames"]
        .as_str()
        .expect("MP4 sem contagem de frames")
        .parse()
        .expect("Contagem de frames inválida");
    assert_eq!(frames, window.end - window.start, "MP4 incompleto");
    let encoder = stream["tags"]["encoder"]
        .as_str()
        .expect("MP4 sem identificação do encoder")
        .to_owned();
    assert!(encoder.contains("h264_nvenc"), "O MP4 não confirma NVENC");
    eprintln!("[render-perf] threads={threads} frames={frames} elapsed_ms={elapsed_ms} encoder=h264_nvenc");
    Measurement {
        filter_threads: threads,
        elapsed_ms,
        frames,
        encoder,
    }
}

#[test]
#[ignore = "Laboratório explícito de 20s com mídia local; exige CNP_RENDER_PERF_INPUT e CNP_RENDER_PERF_OUTPUT"]
fn real_composition_nvenc_filter_threads_one_vs_four() {
    let input_path = env::var_os("CNP_RENDER_PERF_INPUT").expect("Defina CNP_RENDER_PERF_INPUT");
    let input: Input = serde_json::from_slice(
        &fs::read(input_path).expect("Não foi possível ler o JSON de entrada"),
    )
    .unwrap_or_else(|error| {
        panic!(
            "JSON inválido na linha {}, coluna {}",
            error.line(),
            error.column()
        )
    });
    let windows = render_plan::windows(&input.document).expect("Snapshot inválido");
    let first = windows
        .first()
        .expect("A montagem não possui janela inicial");
    let frames = (20_u64 * input.document.fps.numerator as u64)
        .div_ceil(input.document.fps.denominator as u64);
    assert!(
        first.start == 0 && first.end >= frames,
        "A montagem não possui uma janela inicial estável de pelo menos 20 segundos"
    );
    for source in input.sources.values() {
        assert!(
            source.is_absolute() && source.is_file(),
            "Fonte local ausente ou relativa"
        );
    }
    let window = render_plan::Window {
        start: 0,
        end: frames,
    };
    let directory = output_directory();
    eprintln!("[render-perf] Artefatos locais: {}", directory.display());
    let tools = crate::media_analyze::detect_fftools().expect("FFmpeg e ffprobe indisponíveis");
    let ffmpeg = tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let control = ProcessControl::default();
    assert_eq!(
        encoder::detect(&ffmpeg, &directory, &control).expect("Probe NVENC interrompido"),
        encoder::Encoder::Nvenc,
        "NVENC indisponível; consulte nvenc-probe.log. O laboratório não usa fallback CPU"
    );
    let mut measurements = Vec::new();
    let cases = match env::var("CNP_RENDER_PERF_FILTER_THREADS").as_deref() {
        Ok("4") => vec![4],
        Err(env::VarError::NotPresent) => vec![1, 4],
        _ => panic!("CNP_RENDER_PERF_FILTER_THREADS aceita somente 4; omita para comparar 1 e 4"),
    };
    for threads in &cases {
        measurements.push(run_case(
            &input,
            &window,
            &directory.join(format!("threads-{threads}")),
            &ffmpeg,
            &tools.ffprobe,
            *threads,
            &control,
        ));
    }
    if cases.len() == 2 {
        assert_eq!(
            fs::read(directory.join("threads-1/video-0.txt")).unwrap(),
            fs::read(directory.join("threads-4/video-0.txt")).unwrap(),
            "Os grafos das variantes devem ser idênticos"
        );
    }
    fs::write(
        directory.join("results.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "windowStartFrame": window.start,
            "windowEndFrame": window.end,
            "fps": input.document.fps,
            "ffmpeg": ffmpeg,
            "ffprobe": tools.ffprobe,
            "measurements": measurements
        }))
        .unwrap(),
    )
    .expect("Não foi possível preservar as medições");
}

#[test]
#[ignore = "Exportação integral explícita; exige snapshot e destinos locais do laboratório"]
fn real_saved_composition_full_export() {
    let input_path = env::var_os("CNP_RENDER_PERF_INPUT").expect("Defina CNP_RENDER_PERF_INPUT");
    let input: Input = serde_json::from_slice(&fs::read(input_path).unwrap()).unwrap();
    for source in input.sources.values() {
        assert!(source.is_absolute() && source.is_file());
    }
    let directory = output_directory();
    eprintln!("[render-full] Artefatos locais: {}", directory.display());
    let control = ProcessControl::default();
    let started = Instant::now();
    let mut progress = Vec::new();
    let (scratch, video) = super::render::run(
        &directory,
        &input.document,
        &input.sources,
        &control,
        |value| progress.push(value),
    )
    .expect("Exportação integral do laboratório falhou");
    assert_eq!(progress.last(), Some(&100));
    assert!(progress.windows(2).all(|pair| pair[0] <= pair[1]));
    let elapsed_ms = started.elapsed().as_millis();
    let encoder = fs::read_to_string(scratch.path.join("encoder.txt")).unwrap();
    fs::copy(&video, directory.join("output.mp4")).unwrap();
    for entry in fs::read_dir(&scratch.path).unwrap() {
        let entry = entry.unwrap();
        if entry.file_type().unwrap().is_file()
            && entry.path().extension().is_some_and(|extension| {
                extension == "ass"
                    || extension == "txt"
                    || extension == "log"
                    || extension == "json"
            })
        {
            fs::copy(entry.path(), directory.join(entry.file_name())).unwrap();
        }
    }
    let tools = crate::media_analyze::detect_fftools().unwrap();
    let metadata = crate::media_analyze::analyze(&tools, &directory.join("output.mp4")).unwrap();
    let expected_frames = input
        .document
        .items
        .iter()
        .map(|item| item.start_frame + item.duration_frames)
        .max()
        .unwrap();
    fs::write(
        directory.join("results.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "elapsedMs": elapsed_ms,
            "encoder": encoder,
            "expectedFrames": expected_frames,
            "durationMs": metadata.duration_ms,
            "width": metadata.width,
            "height": metadata.height,
            "hasAudio": metadata.has_audio,
            "fps": metadata.fps
        }))
        .unwrap(),
    )
    .unwrap();
    eprintln!(
        "[render-full] elapsed_ms={elapsed_ms} encoder={encoder} frames_expected={expected_frames}"
    );
}
