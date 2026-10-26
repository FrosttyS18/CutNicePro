use super::*;
use crate::media_store::reference_tests::Fixture;
use std::sync::Barrier;

#[test]
fn cancellation_before_publication_does_not_write_reference() {
    let fixture = Fixture::new();
    let source = fixture.source("cancelled.mp4", b"abc");
    let verified = verify_reference(
        &source,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    let store = fixture.store();
    let jobs = ImportJobs::new();
    jobs.start("job").unwrap();
    assert!(jobs.cancel("job"));
    let result = jobs.commit("job", || {
        store.publish_reference(&verified, "mp4", "cancelled.mp4", "p1", None)
    });
    assert!(result.unwrap_err().contains("cancelada"));
    assert!(store.entries().unwrap().is_empty());
    assert_eq!(std::fs::read(source).unwrap(), b"abc");
}

#[test]
fn publication_winning_the_race_returns_success_and_late_cancel_is_false() {
    let fixture = Fixture::new();
    let source = fixture.source("committed.mp4", b"abc");
    let verified = verify_reference(
        &source,
        &AtomicBool::new(false),
        &|_| {},
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    let store = fixture.store();
    let jobs = ImportJobs::new();
    jobs.start("job").unwrap();
    let entered = Barrier::new(2);
    let release = Barrier::new(2);
    std::thread::scope(|scope| {
        let publishing = scope.spawn(|| {
            jobs.commit("job", || {
                entered.wait();
                release.wait();
                store.publish_reference(&verified, "mp4", "committed.mp4", "p1", None)
            })
        });
        entered.wait();
        let cancelling = scope.spawn(|| jobs.cancel("job"));
        release.wait();
        let entry = publishing.join().unwrap().unwrap();
        assert!(!cancelling.join().unwrap());
        assert!(store.resolve(&entry.media_id, Some("p1")).is_ok());
    });
}

#[test]
fn duplicate_job_id_does_not_replace_its_cancellation_owner() {
    let jobs = ImportJobs::new();
    let owner = jobs.start("job").unwrap();
    assert!(jobs.start("job").is_err());
    assert!(jobs.cancel("job"));
    assert!(owner.load(Ordering::SeqCst));
}
