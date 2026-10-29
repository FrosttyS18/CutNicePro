use crate::transcription::process::ProcessControl;
use std::sync::Mutex;

#[derive(Default)]
pub struct ThumbnailJobs {
    serial: Mutex<()>,
    control: ProcessControl,
}

impl ThumbnailJobs {
    pub fn cancel(&self) {
        self.control.cancel();
    }

    pub(crate) fn run<T>(
        &self,
        work: impl FnOnce(&ProcessControl) -> Result<T, String>,
    ) -> Result<T, String> {
        self.control.check()?;
        let _guard = self.serial.lock().map_err(|_| "Miniaturas indisponíveis")?;
        self.control.check()?;
        let result = work(&self.control)?;
        self.control.check()?;
        Ok(result)
    }
}

#[cfg(test)]
#[path = "jobs_tests.rs"]
mod tests;
