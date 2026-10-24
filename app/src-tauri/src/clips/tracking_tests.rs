//! Testes de integração do tracking com FFmpeg REAL (M4): as três
//! demonstrações obrigatórias do MVP em fixtures sintéticas IDENTIFICADAS
//! (pessoa em movimento; duas pessoas + troca de plano; objeto controlado
//! com alvo selecionado por cor do primeiro frame).

use super::tracking::*;
use crate::transcription::process::ProcessControl;
use std::path::Path;
use std::process::Command;

fn ffmpeg_path() -> std::path::PathBuf {
    let tools = crate::media_analyze::detect_fftools()
        .expect("FFmpeg de sistema exigido para este teste de integração");
    tools.ffprobe.with_file_name(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    })
}

fn make_fixture(ffmpeg: &Path, destination: &Path, script: &[&str]) {
    let mut command = Command::new(ffmpeg);
    command
        .args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y"])
        .args(script)
        .arg(destination);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(
        command.output().unwrap().status.success(),
        "fixture falhou: {destination:?}"
    );
}

/** Pessoa-proxy: corpo 40x70 + cabeça 20x20 (overlays com expressão em t —
 *  drawbox com expressão não renderiza neste build) andando da esquerda
 *  para a direita em fundo cinza estático, 6 s @ 10 fps. */
fn fixture_person(destination: &Path) {
    let ffmpeg = ffmpeg_path();
    make_fixture(
        &ffmpeg,
        destination,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=gray:s=320x180:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=navy:s=40x70:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=navy:s=20x20:r=10",
            "-t",
            "6",
            "-filter_complex",
            "[0:v][1:v]overlay=x=20+40*t:y=60[body];[body][2:v]overlay=x=30+40*t:y=40",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
    );
}

/** Duas pessoas + TROCA DE PLANO (corte duro em t=3 s para outro cenário). */
fn fixture_two_people_cut(destination: &Path) {
    let ffmpeg = ffmpeg_path();
    let a = destination.with_extension("a.mp4");
    let b = destination.with_extension("b.mp4");
    make_fixture(
        &ffmpeg,
        &a,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=gray:s=320x180:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=darkgreen:s=36x64:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=indigo:s=36x64:r=10",
            "-t",
            "3",
            "-filter_complex",
            "[0:v][1:v]overlay=x=20+30*t:y=60[p1];[p1][2:v]overlay=x=250-25*t:y=60",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
    );
    make_fixture(
        &ffmpeg,
        &b,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x180:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=darkred:s=36x64:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=darkblue:s=36x64:r=10",
            "-t",
            "3",
            "-filter_complex",
            "[0:v][1:v]overlay=x=60+30*t:y=60[p1];[p1][2:v]overlay=x=230-25*t:y=60",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
    );
    let list = destination.with_extension("list.txt");
    std::fs::write(
        &list,
        format!(
            "file '{}'
file '{}'
",
            a.to_string_lossy().replace('\\', "/"),
            b.to_string_lossy().replace('\\', "/")
        ),
    )
    .unwrap();
    let mut command = Command::new(&ffmpeg);
    command
        .args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y"])
        .args(["-f", "concat", "-safe", "0", "-i"])
        .arg(&list)
        .args(["-c", "copy"])
        .arg(destination);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    assert!(command.output().unwrap().status.success());
}

/** Objeto controlado: bola laranja 18x18 cruzando com 1 s de oclusão
 *  (2 s–3 s) sobre fundo branco. */
fn fixture_object(destination: &Path) {
    let ffmpeg = ffmpeg_path();
    make_fixture(
        &ffmpeg,
        destination,
        &[
            "-f",
            "lavfi",
            "-i",
            "color=c=white:s=320x180:r=10",
            "-f",
            "lavfi",
            "-i",
            "color=c=0xFF7700:s=18x18:r=10",
            "-t",
            "6",
            "-filter_complex",
            "[0:v][1:v]overlay=x=10+45*t:y=90:enable='lt(t,2)+gte(t,3)'",
            "-c:v",
            "libx264",
            "-threads",
            "2",
        ],
    );
}

#[test]
fn real_ffmpeg_tracks_one_person_walking_left_to_right() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    std::fs::create_dir_all(&base).unwrap();
    let source = base.join("m4-person.mp4");
    fixture_person(&source);
    let control = ProcessControl::default();
    let (width, height, frames) =
        decode_frames(&ffmpeg_path(), &source, 0.0, 6.0, 5.0, &control).unwrap();
    assert!(frames.len() >= 25, "frames insuficientes: {}", frames.len());
    let tracks = motion_tracks(&frames, width, height);
    assert!(!tracks.is_empty(), "nenhuma trilha");
    let dominant = &tracks[0];
    let visible: Vec<&TrackPoint> = dominant.points.iter().filter(|p| !p.occluded).collect();
    assert!(
        visible.len() >= 10,
        "trilha dominante curta: {}",
        visible.len()
    );
    // a pessoa anda da esquerda para a direita: cx final > cx inicial
    let first = visible.first().unwrap().cx;
    let last = visible.last().unwrap().cx;
    assert!(
        last - first > 0.15,
        "movimento insuficiente: {first:.3} → {last:.3}"
    );
    // framing suavizado existe e está dentro dos limites seguros
    let (cx, cy) = dominant
        .smoothed_framing(0.02)
        .expect("framing para pessoa em movimento");
    assert!((0.12..=0.88).contains(&cx) && (0.12..=0.88).contains(&cy));
}

#[test]
fn real_ffmpeg_two_people_and_scene_cut_resets_without_jumps() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    std::fs::create_dir_all(&base).unwrap();
    let source = base.join("m4-two-cut.mp4");
    fixture_two_people_cut(&source);
    let control = ProcessControl::default();
    let (width, height, frames) =
        decode_frames(&ffmpeg_path(), &source, 0.0, 6.0, 5.0, &control).unwrap();
    let tracks = motion_tracks(&frames, width, height);
    // duas pessoas no primeiro plano → pelo menos 2 trilhas confirmadas
    assert!(
        tracks.len() >= 2,
        "esperava ≥2 trilhas, veio {}",
        tracks.len()
    );
    // NENHUMA trilha pode ter pontos VISÍVEIS dos dois lados do corte (t≈3 s)
    // sem marcação de reinício: isso seria um salto indevido entre planos.
    for track in &tracks {
        let before = track.points.iter().any(|p| !p.occluded && p.t < 2.8);
        let after = track.points.iter().any(|p| !p.occluded && p.t > 3.2);
        assert!(
            !(before && after) || track.reset_by_scene,
            "trilha {} atravessa o corte sem reinício",
            track.id
        );
    }
    // e existem trilhas nos DOIS lados do corte (rastreamento continuou)
    let has_before = tracks
        .iter()
        .any(|t| t.points.iter().any(|p| !p.occluded && p.t < 2.8));
    let has_after = tracks
        .iter()
        .any(|t| t.points.iter().any(|p| !p.occluded && p.t > 3.2));
    assert!(has_before && has_after, "sem rastreamento em um dos lados do corte (antes={has_before} depois={has_after}; trilhas: {:?})",
        tracks.iter().map(|t| (t.id, t.points.len(), t.points.iter().filter(|p| !p.occluded).count(), t.reset_by_scene)).collect::<Vec<_>>());
}

#[test]
fn real_ffmpeg_tracks_controlled_object_by_color_with_occlusion() {
    let base =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    std::fs::create_dir_all(&base).unwrap();
    let source = base.join("m4-object.mp4");
    fixture_object(&source);
    let control = ProcessControl::default();
    let (width, height, frames) =
        decode_frames(&ffmpeg_path(), &source, 0.0, 6.0, 5.0, &control).unwrap();
    // alvo selecionado pela COR dominante do primeiro frame (região central
    // inferior, onde a bola começa): categoria "bola laranja"
    let target = dominant_color(&frames[0].1, width, height, (0.02, 0.48, 0.12, 0.64));
    for channel in 0..3 {
        assert!(
            (target[channel] as i32 - [0xFF, 0x77, 0x00][channel] as i32).abs() <= 12,
            "cor dominante longe do laranja da bola: {target:?}"
        );
    }
    let track = color_track(&frames, width, height, target, 48);
    let visible: Vec<&TrackPoint> = track.points.iter().filter(|p| !p.occluded).collect();
    assert!(
        visible.len() >= 15,
        "poucos pontos visíveis: {}",
        visible.len()
    );
    // atravessa da esquerda para a direita
    assert!(visible.last().unwrap().cx - visible.first().unwrap().cx > 0.2);
    // oclusão (2 s–3 s): exatamente os frames desse intervalo projetados
    let occluded = track.points.iter().filter(|p| p.occluded).count();
    assert!(occluded >= 3, "oclusão não marcada: {occluded} frames");
    // após reaparecer, recupera o rastro (cx pós-3 s segue crescendo)
    let after: Vec<&TrackPoint> = visible.iter().copied().filter(|p| p.t > 3.2).collect();
    assert!(after.len() >= 5, "não recuperou após oclusão");
    assert!(after.last().unwrap().cx > after.first().unwrap().cx);
    // framing da bola também é viável
    assert!(track.smoothed_framing(0.02).is_some());
}

#[test]
fn association_is_optimal_and_thresholded() {
    // unidade pura: atribuição ótima + limiares de IoU
    let a = Detection {
        x1: 0.1,
        y1: 0.1,
        x2: 0.3,
        y2: 0.3,
        score: 0.9,
    };
    let b = Detection {
        x1: 0.5,
        y1: 0.1,
        x2: 0.7,
        y2: 0.3,
        score: 0.9,
    };
    let a_moved = Detection {
        x1: 0.12,
        y1: 0.1,
        x2: 0.32,
        y2: 0.3,
        score: 0.9,
    };
    let b_moved = Detection {
        x1: 0.52,
        y1: 0.1,
        x2: 0.72,
        y2: 0.3,
        score: 0.9,
    };
    let cost = vec![
        vec![iou_cost(&a, &a_moved), iou_cost(&a, &b_moved)],
        vec![iou_cost(&b, &a_moved), iou_cost(&b, &b_moved)],
    ];
    let matches = assign(&cost, 0.7);
    assert_eq!(matches.len(), 2);
    assert!(
        matches.contains(&(0, 0)) && matches.contains(&(1, 1)),
        "atribuição cruzada errada: {matches:?}"
    );
    // limiar: caixa longe não casa
    let far = Detection {
        x1: 0.9,
        y1: 0.9,
        x2: 1.0,
        y2: 1.0,
        score: 0.9,
    };
    assert!(iou_cost(&a, &far) > 0.7);
}

#[test]
fn motion_detections_ignores_scene_change_and_noise() {
    let w = 32usize;
    let h = 18usize;
    let black = vec![0u8; w * h * 3];
    let mut moved = black.clone();
    // "pessoa" 4x6 movendo em x=10..14
    for y in 5..11 {
        for x in 10..14 {
            let i = (y * w + x) * 3;
            moved[i] = 200;
            moved[i + 1] = 200;
            moved[i + 2] = 200;
        }
    }
    let (dets, change) = motion_detections(&black, &moved, w, h);
    assert!(change < 0.45);
    assert_eq!(dets.len(), 1);
    assert!(dets[0].score > 0.0);
    // mudança de cena (tudo muda): sem detecções e change alto
    let white = vec![240u8; w * h * 3];
    let (dets_scene, change_scene) = motion_detections(&black, &white, w, h);
    assert!(change_scene > 0.45 && dets_scene.is_empty());
}

#[test]
fn dump_m4_evidence_when_requested() {
    // Executado com M4_EVIDENCE_DIR: grava trajetórias/framing das três
    // demos para a pasta de evidências do objetivo (no-op em CI normal).
    let Ok(dir) = std::env::var("M4_EVIDENCE_DIR") else {
        return;
    };
    let dir = std::path::PathBuf::from(dir);
    std::fs::create_dir_all(&dir).unwrap();
    let control = ProcessControl::default();
    let cases: [(&str, fn(&Path)); 3] = [
        ("person", fixture_person as fn(&Path)),
        ("two-people-cut", fixture_two_people_cut),
        ("controlled-object", fixture_object),
    ];
    for (name, make) in cases {
        let source = dir.join(format!("m4-{name}.mp4"));
        make(&source);
        std::fs::copy(&source, dir.join(format!("demo-{name}.mp4"))).unwrap();
        let (width, height, frames) =
            decode_frames(&ffmpeg_path(), &source, 0.0, 6.0, 5.0, &control).unwrap();
        let tracks = motion_tracks(&frames, width, height);
        let dump: Vec<serde_json::Value> = tracks
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "resetByScene": t.reset_by_scene,
                    "motionVariance": t.motion_variance(),
                    "framing": t.smoothed_framing(0.02),
                    "points": t.points.iter().map(|p| serde_json::json!({
                        "t": p.t, "cx": p.cx, "cy": p.cy, "occluded": p.occluded,
                    })).collect::<Vec<_>>(),
                })
            })
            .collect();
        std::fs::write(
            dir.join(format!("demo-{name}-trajetorias.json")),
            serde_json::to_string_pretty(&serde_json::json!({ "demo": name, "tracks": dump }))
                .unwrap(),
        )
        .unwrap();
        // objeto controlado: extra da cor alvo
        if name == "controlled-object" {
            let target = dominant_color(&frames[0].1, width, height, (0.02, 0.48, 0.12, 0.64));
            let track = color_track(&frames, width, height, target, 48);
            std::fs::write(dir.join("demo-controlled-object-cor.json"),
                serde_json::to_string_pretty(&serde_json::json!({
                    "categoria": "bola laranja 18x18", "selecaoDoAlvo": "cor dominante (pixel mais saturado) da região do primeiro frame",
                    "corAlvo": target,
                    "occlusionFrames": track.points.iter().filter(|p| p.occluded).count(),
                })).unwrap()).unwrap();
        }
    }
}
