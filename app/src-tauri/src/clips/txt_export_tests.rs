//! Exporta os 3 cortes REAIS do baseline textual (goal-cortes-texto, gate B)
//! pelo MESMO pipeline do app (render::pipeline::run com FFmpeg real,
//! transcrição REAL e legendas) — o único passo não automatizável é o
//! diálogo nativo de destino, que fica no GUIA do mantenedor.
//! Executa SOMENTE com TXT_EXPORT_DIR: lê txt-export-manifest.json da
//! pasta de evidências {windows:[[s,e]...], edited:[[s,e]...]}.
#[test]
fn export_real_txt_clips_when_requested() {
    let Ok(dir) = std::env::var("TXT_EXPORT_DIR") else {
        return;
    };
    let dir = std::path::PathBuf::from(dir);
    // G8: manifest do goal-recuperacao (windows reais gerados pelo pipeline novo)
    let manifest_path = dir.join("txt-export-manifest.json");
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(manifest_path).expect("manifest")).unwrap();
    let media = std::path::PathBuf::from(
        "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4",
    );
    let transcript: crate::transcription::types::Transcript = serde_json::from_str(
        &std::fs::read_to_string("C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json").expect("transcrição real"),
    )
    .unwrap();
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    std::fs::create_dir_all(&base).unwrap();
    let control = crate::transcription::process::ProcessControl::default();

    let windows = manifest["windows"].as_array().expect("windows");
    for (index, window) in windows.iter().enumerate() {
        let (start, end) = (window[0].as_f64().unwrap(), window[1].as_f64().unwrap());
        let settings = serde_json::from_value::<crate::render::settings::RenderSettings>(serde_json::json!({
            "ratio":"9:16","fit":"cover","captionModel":2,
            "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
                "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
            "volume":1,"muted":false,"background":"#000000","text":"","trimStart":start,"trimEnd":end
        })).unwrap();
        let (scratch, output) = crate::render::pipeline::run(
            &base,
            &media,
            &transcript.segments,
            &settings,
            1476.789116,
            true,
            &control,
            |_| {},
        )
        .expect("render");
        let dest = dir.join(format!("corte-real-{}.mp4", index + 1));
        std::fs::copy(&output, &dest).unwrap_or_else(|e| {
            panic!(
                "copy {} -> {}: {e} (dir existe: {})",
                output.display(),
                dest.display(),
                dir.is_dir()
            )
        });
        println!("exportado {}", dest.display());
        drop(scratch); // limpa o temporário APÓS copiar
    }
    // EDITADO (gate D): plano com remoção interna no corte 1 (mesmo pipeline
    // multi-janela do app; a EDIÇÃO na UI foi comprovada no M2 — aqui apenas
    // o arquivo para o mantenedor conferir o resultado da montagem)
    if let Some(edited) = manifest["edited"].as_array() {
        let segments: Vec<crate::render::settings::RenderSegment> = edited
            .iter()
            .map(|s| crate::render::settings::RenderSegment {
                source_start: s[0].as_f64().unwrap(),
                source_end: s[1].as_f64().unwrap(),
            })
            .collect();
        let trim = manifest["windows"][0].as_array().unwrap();
        let settings = serde_json::from_value::<crate::render::settings::RenderSettings>(serde_json::json!({
            "ratio":"9:16","fit":"cover","captionModel":2,
            "captionStyle":{"font":"Poppins","size":64,"weight":600,"color":"#ffffff","italic":false,"underline":false,"uppercase":false,
                "outline":2,"outlineColor":"#000000","shadow":true,"background":"transparent","highlightColor":"#02c2be","effect":"highlight","position":"bottom"},
            "volume":1,"muted":false,"background":"#000000","text":"","trimStart":trim[0].as_f64().unwrap(),"trimEnd":trim[1].as_f64().unwrap(),
            "segments": edited
        })).unwrap();
        let (_scratch, output) = crate::render::pipeline::run(
            &base,
            &media,
            &transcript.segments,
            &settings,
            1476.789116,
            true,
            &control,
            |_| {},
        )
        .expect("render editado");
        let dest = dir.join("corte-real-1-EDITADO.mp4");
        std::fs::copy(&output, &dest).unwrap();
        println!("editado {} (plano {:?})", dest.display(), segments.len());
    }
}
