use super::types::Clip;
use crate::transcription::process::ProcessControl;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FaceFraming {
    pub status: String,
    pub samples: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
}

impl FaceFraming {
    pub fn valid(&self) -> bool {
        if self.samples > 12
            || !["stable", "ambiguous", "noFaces", "unavailable"].contains(&self.status.as_str())
        {
            return false;
        }
        let unit = |v: Option<f64>| v.is_some_and(|v| v.is_finite() && (0.0..=1.0).contains(&v));
        if self.status == "stable" {
            self.samples > 0 && unit(self.x) && unit(self.y) && unit(self.confidence)
        } else {
            self.x.is_none() && self.y.is_none() && self.confidence.is_none()
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResultItem {
    id: String,
    #[serde(flatten)]
    framing: FaceFraming,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    version: u8,
    backend: String,
    items: Vec<ResultItem>,
    elapsed_ms: u64,
    #[serde(default)]
    peak_working_set_bytes: u64,
}

struct Python {
    executable: PathBuf,
    packages: Option<PathBuf>,
}

impl Python {
    fn command(&self, worker: &Path) -> Command {
        let mut command = Command::new(&self.executable);
        command.args(["-I", "-B"]);
        if let Some(packages) = &self.packages {
            command.args(["-S", "-c", "import runpy,sys; sys.path.insert(0,sys.argv.pop(1)); script=sys.argv.pop(1); sys.argv[0]=script; runpy.run_path(script,run_name='__main__')"])
                .arg(packages).arg(worker);
        } else {
            command.arg(worker);
        }
        command
    }
}

fn python(base: &Path) -> Option<Python> {
    let path = std::env::var_os("CNP_FACE_PYTHON")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(if cfg!(windows) {
                    "../../.tooling/venvs/face-framing/Scripts/python.exe"
                } else {
                    "../../.tooling/venvs/face-framing/bin/python"
                })
            } else {
                base.join(if cfg!(windows) {
                    "cutnicepro/engine/face-framing/python.exe"
                } else {
                    "cutnicepro/engine/face-framing/bin/python"
                })
            }
        });
    if !path.is_file() {
        return None;
    }
    if cfg!(windows) {
        if let Some(root) = path.parent().and_then(Path::parent) {
            if let Ok(config) = std::fs::read_to_string(root.join("pyvenv.cfg")) {
                let home = config
                    .lines()
                    .find_map(|line| line.strip_prefix("home = "))?;
                let executable = PathBuf::from(home).join("python.exe");
                let packages = root.join("Lib/site-packages");
                if !executable.is_file() || !packages.is_dir() {
                    return None;
                }
                return Some(Python {
                    executable,
                    packages: Some(packages),
                });
            }
        }
    }
    Some(Python {
        executable: path,
        packages: None,
    })
}

fn apply(response: Response, clips: &mut [Clip]) -> Result<(), String> {
    if response.version != 1
        || response.backend != "yunet-mouth-motion-static-v1"
        || response.items.len() > 12
    {
        return Err("Resposta inválida do enquadramento local.".into());
    }
    let mut seen = std::collections::HashSet::new();
    for item in &response.items {
        if !seen.insert(item.id.as_str())
            || !item.framing.valid()
            || !clips.iter().any(|c| c.id == item.id)
        {
            return Err("O enquadramento local retornou dados inválidos.".into());
        }
    }
    eprintln!(
        "[clips] rostos YuNet: {} cortes, {} ms, pico {} MiB, CPU/uma thread",
        response.items.len(),
        response.elapsed_ms,
        response.peak_working_set_bytes / 1024 / 1024
    );
    for item in response.items {
        if let Some(clip) = clips.iter_mut().find(|clip| clip.id == item.id) {
            clip.face_framing = Some(item.framing);
        }
    }
    Ok(())
}

pub fn enrich(
    base: &Path,
    source: &Path,
    scratch: &Path,
    clips: &mut [Clip],
    control: &ProcessControl,
) -> Result<(), String> {
    control.check()?;
    let targets = clips.iter().filter(|clip| clip.format.as_deref() == Some("9:16") && clip.fit.as_deref() == Some("cover"))
        .map(|clip| serde_json::json!({"id":clip.id,"start":clip.start,"end":clip.end,"ratio":"9:16"})).collect::<Vec<_>>();
    if targets.is_empty() {
        return Ok(());
    }
    let run = || -> Result<Response, String> {
        let python = python(base).ok_or("Componente local de rostos indisponível.")?;
        let worker = scratch.join("face-worker.py");
        let model = scratch.join("face_detection_yunet_2023mar.onnx");
        let request = scratch.join("face-request.json");
        let output = scratch.join("face-result.json");
        std::fs::write(
            &worker,
            include_str!("../../../../tools/face-framing/worker.py"),
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(
            &model,
            include_bytes!("../../resources/models/face_detection_yunet_2023mar.onnx"),
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(
            &request,
            serde_json::to_vec(
                &serde_json::json!({"version":1,"source":source,"model":model,"clips":targets}),
            )
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut command = python.command(&worker);
        command
            .arg("--request")
            .arg(request)
            .arg("--output")
            .arg(&output)
            .env("OMP_NUM_THREADS", "1")
            .env("OPENBLAS_NUM_THREADS", "1")
            .env("OPENCV_LOG_LEVEL", "ERROR");
        control.run(command, &scratch.join("face-worker.log"))?;
        let bytes = std::fs::read(output).map_err(|e| e.to_string())?;
        if bytes.len() > 16384 {
            return Err("Resposta de rostos excedeu o limite.".into());
        }
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    };
    match run().and_then(|response| apply(response, clips)) {
        Ok(()) => {}
        Err(error) => {
            control.check()?;
            eprintln!("[clips] enquadramento por rostos não aplicado: {error}");
            for clip in clips.iter_mut().filter(|clip| {
                clip.format.as_deref() == Some("9:16") && clip.fit.as_deref() == Some("cover")
            }) {
                clip.face_framing = Some(FaceFraming {
                    status: "unavailable".into(),
                    samples: 0,
                    x: None,
                    y: None,
                    confidence: None,
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requer Python local configurado"]
    fn worker_pid_is_the_direct_owned_process() {
        let python = python(Path::new("unused")).expect("runtime preparado");
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
        let scratch = crate::render::scratch::Scratch::new(&root).unwrap();
        let script = scratch.path.join("pid.py");
        std::fs::write(&script, "import os\nprint(os.getpid())\n").unwrap();
        let mut command = python.command(&script);
        command.stdout(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let child = command.spawn().unwrap();
        let owned = child.id();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout)
                .unwrap()
                .trim()
                .parse::<u32>()
                .unwrap(),
            owned
        );
    }

    #[test]
    fn rejects_unbounded_or_invented_face_positions() {
        let mut frame = FaceFraming {
            status: "stable".into(),
            samples: 3,
            x: Some(0.2),
            y: Some(0.5),
            confidence: Some(0.9),
        };
        assert!(frame.valid());
        frame.x = Some(f64::NAN);
        assert!(!frame.valid());
        frame.status = "noFaces".into();
        assert!(!frame.valid());
        frame.x = None;
        frame.y = None;
        frame.confidence = None;
        assert!(frame.valid());
        frame.samples = 13;
        assert!(!frame.valid());
    }

    #[test]
    fn accepts_the_exact_worker_contract() {
        let response: Response = serde_json::from_value(serde_json::json!({"version":1,"backend":"yunet-mouth-motion-static-v1","elapsedMs":25,"items":[{"id":"a","status":"stable","samples":3,"x":0.3,"y":0.5,"confidence":0.9}]})).unwrap();
        assert!(response.items[0].framing.valid());
    }
}
