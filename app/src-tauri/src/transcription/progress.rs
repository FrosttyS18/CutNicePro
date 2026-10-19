use std::{fs::File, io::Read};

pub struct OutputTail {
    file: File,
    pending: Vec<u8>,
}

impl OutputTail {
    pub fn new(file: File) -> Self {
        Self {
            file,
            pending: Vec::new(),
        }
    }
    pub fn drain(&mut self, output: &mut impl FnMut(&str)) -> Result<(), String> {
        let mut chunk = [0u8; 4096];
        loop {
            let size = self
                .file
                .read(&mut chunk)
                .map_err(|e| format!("leitura de progresso falhou: {e}"))?;
            if size == 0 {
                break;
            }
            for byte in &chunk[..size] {
                if *byte == b'\n' || *byte == b'\r' {
                    if !self.pending.is_empty() {
                        output(&String::from_utf8_lossy(&self.pending));
                    }
                    self.pending.clear();
                } else if self.pending.len() < 16_384 {
                    self.pending.push(*byte);
                }
            }
        }
        Ok(())
    }
}

pub fn whisper_percent(line: &str) -> Option<u8> {
    let value = line
        .strip_prefix("whisper_print_progress_callback: progress =")?
        .trim()
        .strip_suffix('%')?
        .trim();
    value.parse::<u8>().ok().filter(|p| *p <= 100)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consumes_upstream_callback_without_reading_other_numbers_as_progress() {
        assert_eq!(
            whisper_percent("whisper_print_progress_callback: progress =  45%"),
            Some(45)
        );
        for line in [
            "whisper_init: 100 layers",
            "progress = 45%",
            "whisper_print_progress_callback: progress = 101%",
        ] {
            assert_eq!(whisper_percent(line), None);
        }
    }
    #[test]
    fn handles_fragmented_lines_without_duplicate_updates() {
        use std::io::Write;
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("progress-{}.log", uuid::Uuid::new_v4()));
        let mut writer = File::create(&path).unwrap();
        let mut tail = OutputTail::new(File::open(&path).unwrap());
        let mut lines = Vec::new();
        writer
            .write_all(b"whisper_print_progress_callback: progress =  ")
            .unwrap();
        tail.drain(&mut |l| lines.push(l.to_string())).unwrap();
        assert!(lines.is_empty());
        writer.write_all(b"45%\r\n").unwrap();
        tail.drain(&mut |l| lines.push(l.to_string())).unwrap();
        tail.drain(&mut |l| lines.push(l.to_string())).unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(whisper_percent(&lines[0]), Some(45));
        drop(writer);
        drop(tail);
        std::fs::remove_file(path).unwrap();
    }
}
