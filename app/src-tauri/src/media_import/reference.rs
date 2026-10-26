use super::{ImportError, CHUNK};
use crate::media_source::{SourceGuard, SourceStamp};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Seek},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

pub struct VerifiedReference {
    pub sha256: String,
    guard: SourceGuard,
}

impl VerifiedReference {
    pub fn path(&self) -> &Path {
        self.guard.path()
    }
    pub fn stamp(&self) -> &SourceStamp {
        self.guard.stamp()
    }
    pub fn recheck(&self) -> Result<(), String> {
        self.guard.recheck().map_err(|error| error.message())
    }
}

pub fn verify_reference(
    source: &Path,
    cancel: &AtomicBool,
    on_chunk: &dyn Fn(u64),
    timeout: Duration,
) -> Result<VerifiedReference, ImportError> {
    let deadline = Instant::now() + timeout;
    let check = || {
        if cancel.load(Ordering::SeqCst) {
            Err(ImportError::Cancelled)
        } else if Instant::now() >= deadline {
            Err(ImportError::TimedOut)
        } else {
            Ok(())
        }
    };
    check()?;
    let mut guard = SourceGuard::open(source).map_err(|error| ImportError::Io(error.message()))?;
    if guard.stamp().size_bytes == 0 {
        return Err(ImportError::Io("arquivo de origem vazio".into()));
    }
    let mut hash = Sha256::new();
    let mut buffer = vec![0; CHUNK];
    let mut processed = 0;
    loop {
        check()?;
        let bytes = guard
            .file
            .read(&mut buffer)
            .map_err(|error| ImportError::Io(error.to_string()))?;
        if bytes == 0 {
            break;
        }
        hash.update(&buffer[..bytes]);
        processed += bytes as u64;
        on_chunk(processed);
    }
    check()?;
    if processed != guard.stamp().size_bytes {
        return Err(ImportError::SourceChanged);
    }
    guard.recheck().map_err(|_| ImportError::SourceChanged)?;
    guard
        .file
        .rewind()
        .map_err(|error| ImportError::Io(error.to_string()))?;
    Ok(VerifiedReference {
        sha256: format!("{:x}", hash.finalize()),
        guard,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_store::reference_tests::Fixture;

    #[test]
    fn verification_cancels_mid_read_and_times_out_without_copying() {
        let fixture = Fixture::new();
        let source = fixture.source("large.mp4", &vec![8; CHUNK * 2]);
        let cancel = AtomicBool::new(false);
        let result = verify_reference(
            &source,
            &cancel,
            &|_| cancel.store(true, Ordering::SeqCst),
            Duration::from_secs(10),
        );
        assert!(matches!(result, Err(ImportError::Cancelled)));
        assert!(matches!(
            verify_reference(&source, &AtomicBool::new(false), &|_| {}, Duration::ZERO),
            Err(ImportError::TimedOut)
        ));
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 1);
        std::fs::write(source, b"guard released").unwrap();
    }

    #[test]
    fn read_guard_has_real_hardlink_identity_and_releases_after_drop() {
        let fixture = Fixture::new();
        let source = fixture.source("one.mp4", b"abc");
        let alias = fixture.0.join("alias.mp4");
        std::fs::hard_link(&source, &alias).unwrap();
        let checked = verify_reference(
            &source,
            &AtomicBool::new(false),
            &|_| {},
            Duration::from_secs(10),
        )
        .unwrap();
        let alias_guard = SourceGuard::open(&alias).unwrap();
        assert_eq!(checked.stamp().identity, alias_guard.stamp().identity);
        #[cfg(windows)]
        {
            assert!(std::fs::write(&source, b"corrupt").is_err());
            assert!(std::fs::remove_file(&alias).is_err());
        }
        drop(alias_guard);
        drop(checked);
        std::fs::write(&source, b"changed after drop").unwrap();
    }
}
