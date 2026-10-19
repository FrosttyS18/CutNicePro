use std::path::{Path, PathBuf};

pub struct Scratch {
    pub path: PathBuf,
}
impl Scratch {
    pub fn new(base: &Path) -> Result<Self, String> {
        let path = base
            .join("cutnicepro/render-temp")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        Ok(Self { path })
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}
