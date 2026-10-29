use std::{
    fs::File,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct ProcessControl {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl ProcessControl {
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err("Transcrição cancelada.".into())
        } else {
            Ok(())
        }
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.stop();
    }
    fn stop(&self) {
        if let Ok(mut slot) = self.child.lock() {
            if let Some(child) = slot.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            *slot = None;
        }
    }
    pub fn run(&self, mut command: Command, log: &Path) -> Result<(), String> {
        self.run_with_output(&mut command, log, |_| {})
    }
    pub fn run_with_output(
        &self,
        command: &mut Command,
        log: &Path,
        mut output: impl FnMut(&str),
    ) -> Result<(), String> {
        let result = self.run_process(
            command,
            log,
            None,
            Duration::from_secs(6 * 3600),
            &mut output,
        );
        if result.is_err() {
            self.stop();
        }
        result
    }
    pub fn run_to_file(
        &self,
        command: &mut Command,
        log: &Path,
        destination: &Path,
    ) -> Result<(), String> {
        self.run_to_file_with_timeout(command, log, destination, Duration::from_secs(6 * 3600))
    }
    pub fn run_with_timeout(
        &self,
        mut command: Command,
        log: &Path,
        timeout: Duration,
    ) -> Result<(), String> {
        let result = self.run_process(&mut command, log, None, timeout, &mut |_| {});
        if result.is_err() {
            self.stop();
        }
        result
    }
    pub fn run_to_file_with_timeout(
        &self,
        command: &mut Command,
        log: &Path,
        destination: &Path,
        timeout: Duration,
    ) -> Result<(), String> {
        let result = self.run_process(command, log, Some(destination), timeout, &mut |_| {});
        if result.is_err() {
            self.stop();
        }
        result
    }
    fn run_process(
        &self,
        command: &mut Command,
        log: &Path,
        destination: Option<&Path>,
        timeout: Duration,
        on_output: &mut impl FnMut(&str),
    ) -> Result<(), String> {
        self.check()?;
        let output =
            File::create(log).map_err(|e| format!("não foi possível criar log temporário: {e}"))?;
        let mut tail =
            super::progress::OutputTail::new(File::open(log).map_err(|e| e.to_string())?);
        let stdout = match destination {
            Some(path) => Stdio::from(File::create(path).map_err(|e| e.to_string())?),
            None => Stdio::null(),
        };
        command.stdin(Stdio::null()).stdout(stdout).stderr(output);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        {
            let mut slot = self
                .child
                .lock()
                .map_err(|_| "controle de processo indisponível")?;
            self.check()?;
            *slot = Some(
                command
                    .spawn()
                    .map_err(|e| format!("não foi possível iniciar o motor: {e}"))?,
            );
        }
        let started = Instant::now();
        loop {
            self.check()?;
            tail.drain(on_output)?;
            let status = {
                let mut slot = self
                    .child
                    .lock()
                    .map_err(|_| "controle de processo indisponível")?;
                let child = slot.as_mut().ok_or("Transcrição cancelada.")?;
                let result = child
                    .try_wait()
                    .map_err(|e| format!("falha ao acompanhar o motor: {e}"))?;
                if result.is_some() {
                    *slot = None;
                }
                result
            };
            if let Some(status) = status {
                tail.drain(on_output)?;
                return if status.success() {
                    self.check()
                } else {
                    let detail = std::fs::read_to_string(log).unwrap_or_default();
                    let tail: String = detail
                        .chars()
                        .rev()
                        .take(700)
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect();
                    Err(format!("O motor encerrou com erro ({status}). Verifique o arquivo, o modelo e a instalação. {}", tail.trim()))
                };
            }
            if started.elapsed() > timeout {
                self.stop();
                return Err("O processamento excedeu o tempo limite. Tente novamente.".into());
            }
            std::thread::sleep(Duration::from_millis(80));
        }
    }
}

impl Drop for ProcessControl {
    fn drop(&mut self) {
        self.cancel();
    }
}

#[cfg(test)]
#[path = "process_timeout_tests.rs"]
mod timeout_tests;
