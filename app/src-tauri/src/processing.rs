use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Default)]
pub struct ProcessingGate(AtomicBool);
pub struct Lease(Arc<ProcessingGate>);

impl ProcessingGate {
    pub fn acquire(self: &Arc<Self>) -> Result<Lease, String> {
        self.0
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| {
                "Há um processamento em andamento. Aguarde ou cancele antes de continuar."
            })?;
        Ok(Lease(self.clone()))
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.0 .0.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serializes_processing_and_releases_on_failure() {
        let gate = Arc::new(ProcessingGate::default());
        let lease = gate.acquire().unwrap();
        assert!(gate.acquire().is_err());
        drop(lease);
        assert!(gate.acquire().is_ok());
    }
}
