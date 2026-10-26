use super::*;
use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

const TOKENIZER: &str = r#"
use std::{io::Write, path::PathBuf, time::Duration};
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 5);
    assert_eq!(args[0], "-m");
    assert_eq!(args[2], "-f");
    assert_eq!(args[4], "--show-count");
    let input = PathBuf::from(&args[3]);
    assert_eq!(std::fs::read_to_string(&input).unwrap(), "Texto integral\nsem alteração.");
    std::fs::write(input.with_extension("argv"), args.join("\n")).unwrap();
    eprintln!("tokenizer fixture stderr");
    match args[1].as_str() {
        "labelled" => {
            std::io::stdout().write_all(b"\xffdiagnostic\n Number of tokens: 41 \n").unwrap();
        }
        "numeric" => println!("diagnostic\n 17 "),
        "invalid" => println!("no token count"),
        "failed" => std::process::exit(7),
        "slow" => {
            std::fs::write(input.with_extension("pid"), std::process::id().to_string()).unwrap();
            std::thread::sleep(Duration::from_secs(4));
            std::fs::write(input.with_extension("finished"), "finished").unwrap();
            println!("29");
        }
        _ => panic!("unexpected fixture mode"),
    }
}
"#;

fn tokenizer_fixture(directory: &Path) -> PathBuf {
    let source = directory.join("tokenizer-fixture.rs");
    let binary = directory.join(format!("tokenizer-fixture{}", std::env::consts::EXE_SUFFIX));
    std::fs::write(&source, TOKENIZER).unwrap();
    let result = Command::new("rustc")
        .args(["--crate-name", "cnp_tokenizer_fixture", "--edition=2021"])
        .arg(source)
        .arg("-o")
        .arg(&binary)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    binary
}

fn fixture_engine(binary: &Path, mode: &str) -> Engine {
    let mut engine = Engine::for_test();
    engine.0.tokenizer = binary.to_owned();
    engine.0.model = mode.into();
    engine
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
    fn WaitForSingleObject(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
struct ObservedProcess(*mut std::ffi::c_void);

#[cfg(windows)]
impl ObservedProcess {
    fn new(pid: &str) -> Self {
        let handle = unsafe { OpenProcess(0x00100000, 0, pid.parse().unwrap()) };
        assert!(!handle.is_null(), "{}", std::io::Error::last_os_error());
        Self(handle)
    }
    fn has_exited(&self) -> bool {
        unsafe { WaitForSingleObject(self.0, 0) == 0 }
    }
}

#[cfg(windows)]
impl Drop for ObservedProcess {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

#[cfg(not(windows))]
struct ObservedProcess(String);

#[cfg(not(windows))]
impl ObservedProcess {
    fn new(pid: &str) -> Self {
        Self(pid.to_owned())
    }
    fn has_exited(&self) -> bool {
        !Command::new("kill")
            .args(["-0", &self.0])
            .status()
            .unwrap()
            .success()
    }
}

#[test]
fn token_count_preserves_stdout_contract_and_cancels_owned_process() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/test-output");
    let scratch = crate::render::scratch::Scratch::new(&root).unwrap();
    let binary = tokenizer_fixture(&scratch.path);
    let text = "Texto integral\nsem alteração.";
    let control = ProcessControl::default();
    for (mode, expected) in [("labelled", 41), ("numeric", 17)] {
        let engine = fixture_engine(&binary, mode);
        assert_eq!(
            engine.count_tokens(&scratch.path, text, &control).unwrap(),
            expected
        );
        let args = std::fs::read_to_string(scratch.path.join("tokenize-input.argv")).unwrap();
        assert_eq!(args.lines().next(), Some("-m"));
        assert_eq!(args.lines().nth(1), Some(mode));
    }
    assert_eq!(
        fixture_engine(&binary, "invalid")
            .count_tokens(&scratch.path, text, &control)
            .unwrap_err(),
        "O tokenizador local retornou uma resposta inválida."
    );
    assert_eq!(
        fixture_engine(&binary, "failed")
            .count_tokens(&scratch.path, text, &control)
            .unwrap_err(),
        "Não foi possível medir o contexto no Qwen3.5."
    );
    let missing = scratch.path.join("missing-tokenizer");
    let spawn_error = Command::new(&missing).output().unwrap_err().to_string();
    assert_eq!(
        fixture_engine(&missing, "numeric")
            .count_tokens(&scratch.path, text, &control)
            .unwrap_err(),
        spawn_error
    );

    let control = Arc::new(ProcessControl::default());
    let worker_control = control.clone();
    let directory = scratch.path.clone();
    let engine = fixture_engine(&binary, "slow");
    let worker = std::thread::spawn(move || engine.count_tokens(&directory, text, &worker_control));
    let pid_path = scratch.path.join("tokenize-input.pid");
    let started = Instant::now();
    while !pid_path.is_file() && started.elapsed() < Duration::from_secs(5) {
        std::thread::sleep(Duration::from_millis(10));
    }
    let observed = std::fs::read_to_string(&pid_path)
        .ok()
        .map(|pid| ObservedProcess::new(pid.trim()));
    let cancel_started = Instant::now();
    control.cancel();
    let result = worker.join().unwrap();
    assert!(pid_path.is_file(), "owned tokenizer did not start");
    assert!(result.unwrap_err().contains("cancelada"));
    assert!(cancel_started.elapsed() < Duration::from_secs(2));
    assert!(observed.unwrap().has_exited());
    assert!(!scratch.path.join("tokenize-input.finished").exists());
    assert!(scratch.path.join("tokenize-output.txt").is_file());
    assert!(std::fs::read_to_string(scratch.path.join("tokenize.log"))
        .unwrap()
        .contains("tokenizer fixture stderr"));
}
