use std::path::{Path, PathBuf};

pub struct Artifacts {
    pub directory: PathBuf,
    stem: String,
}

impl Artifacts {
    pub fn create(scratch: &Path, stem: &str) -> Result<Self, String> {
        if stem.is_empty()
            || !stem
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err("Identificador inválido para diagnóstico do modelo.".into());
        }
        std::fs::create_dir_all(scratch).map_err(|e| e.to_string())?;
        for index in 0..10_000 {
            let directory = scratch.join(format!("{stem}-call-{index:04}"));
            match std::fs::create_dir(&directory) {
                Ok(()) => {
                    return Ok(Self {
                        directory,
                        stem: stem.to_string(),
                    })
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error.to_string()),
            }
        }
        Err("Limite de chamadas locais de diagnóstico excedido.".into())
    }

    pub fn prompt(&self) -> PathBuf {
        self.directory.join(format!("{}-prompt.txt", self.stem))
    }

    pub fn schema(&self) -> PathBuf {
        self.directory.join(format!("{}.schema.json", self.stem))
    }

    pub fn output(&self, gpu: bool) -> PathBuf {
        self.directory.join(format!(
            "{}-{}-result.json",
            self.stem,
            if gpu { "gpu" } else { "cpu" }
        ))
    }

    pub fn log(&self, gpu: bool) -> PathBuf {
        self.directory.join(format!(
            "{}-{}.log",
            self.stem,
            if gpu { "gpu" } else { "cpu" }
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_calls_and_a_failed_retry_do_not_overwrite_previous_evidence() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
        let scratch = crate::render::scratch::Scratch::new(&root).unwrap();
        let first = Artifacts::create(&scratch.path, "selection-0").unwrap();
        std::fs::write(first.prompt(), "source one").unwrap();
        std::fs::write(first.output(true), "answer one").unwrap();
        let second = Artifacts::create(&scratch.path, "selection-0").unwrap();
        std::fs::write(second.prompt(), "source two").unwrap();
        std::fs::write(second.output(true), "partial failure").unwrap();
        assert_ne!(first.directory, second.directory);
        assert_eq!(
            std::fs::read_to_string(first.prompt()).unwrap(),
            "source one"
        );
        assert_eq!(
            std::fs::read_to_string(first.output(true)).unwrap(),
            "answer one"
        );
    }

    #[test]
    fn cpu_fallback_does_not_replace_the_gpu_response() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
        let scratch = crate::render::scratch::Scratch::new(&root).unwrap();
        let files = Artifacts::create(&scratch.path, "assessment-0").unwrap();
        std::fs::write(files.output(true), "gpu partial").unwrap();
        std::fs::write(files.output(false), "cpu complete").unwrap();
        assert_eq!(
            std::fs::read_to_string(files.output(true)).unwrap(),
            "gpu partial"
        );
        assert_eq!(
            std::fs::read_to_string(files.output(false)).unwrap(),
            "cpu complete"
        );
    }
}
