use std::path::{Path, PathBuf};

pub fn managed_filename(hash: &str, extension: &str) -> Result<String, String> {
    if hash.len() != 64
        || !hash.chars().all(|c| c.is_ascii_hexdigit())
        || !["mp4", "m4v", "mov", "webm", "mkv", "avi"].contains(&extension)
    {
        return Err("O vídeo está inválido. Importe o arquivo original novamente.".into());
    }
    Ok(format!("{hash}.{extension}"))
}

fn executable(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}
fn pair(directory: &Path) -> Option<PathBuf> {
    let probe = directory.join(executable("ffprobe"));
    (probe.is_file() && directory.join(executable("ffmpeg")).is_file()).then_some(probe)
}
fn installation(root: &Path) -> Option<PathBuf> {
    pair(root).or_else(|| pair(&root.join("bin"))).or_else(|| {
        let mut builds: Vec<_> = std::fs::read_dir(root)
            .ok()?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_type()
                    .is_ok_and(|kind| kind.is_dir() && !kind.is_symlink())
            })
            .map(|entry| entry.path())
            .collect();
        builds.sort();
        builds
            .into_iter()
            .rev()
            .find_map(|build| pair(&build.join("bin")))
    })
}
pub fn ffprobe() -> Option<PathBuf> {
    if let Some(configured) =
        std::env::var_os("CNP_FFMPEG_HOME").and_then(|path| installation(Path::new(&path)))
    {
        return Some(configured);
    }
    if let Some(path) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path) {
            if directory
                .to_string_lossy()
                .to_lowercase()
                .contains("ms-playwright")
            {
                continue;
            }
            if let Some(probe) = pair(&directory) {
                return Some(probe);
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(local).join("Microsoft/WinGet");
        if let Some(probe) = pair(&root.join("Links")) {
            return Some(probe);
        }
        if let Ok(packages) = std::fs::read_dir(root.join("Packages")) {
            for package in packages
                .flatten()
                .filter(|p| p.file_name().to_string_lossy().starts_with("Gyan.FFmpeg"))
            {
                if let Some(probe) = installation(&package.path()) {
                    return Some(probe);
                }
            }
        }
    }
    if let Some(roaming) = std::env::var_os("APPDATA") {
        if let Some(probe) = pair(&PathBuf::from(roaming).join("com.cutnicepro.app/cutnicepro/bin"))
        {
            return Some(probe);
        }
    }
    if cfg!(debug_assertions) {
        return installation(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.tooling/vendor/ffmpeg"),
        );
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn managed_source_rejects_traversal_and_unknown_media_extensions() {
        assert_eq!(
            managed_filename(&"a".repeat(64), "mp4").unwrap(),
            format!("{}.mp4", "a".repeat(64))
        );
        assert!(managed_filename("../../private", "mp4").is_err());
        assert!(managed_filename(&"a".repeat(64), "../private.mp4").is_err());
        assert!(managed_filename(&"a".repeat(64), "exe").is_err());
    }
    #[test]
    fn requires_complete_pair_and_discovers_portable_build_without_changing_path() {
        let base = std::env::temp_dir().join(format!("cnp-tools-{}", uuid::Uuid::new_v4()));
        let bin = base.join("ffmpeg-test-build/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join(executable("ffprobe")), b"fixture").unwrap();
        assert!(installation(&base).is_none());
        std::fs::write(bin.join(executable("ffmpeg")), b"fixture").unwrap();
        assert_eq!(
            installation(&base).unwrap(),
            bin.join(executable("ffprobe"))
        );
        std::fs::remove_dir_all(base).unwrap();
    }
}
