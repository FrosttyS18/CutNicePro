use super::FileIdentity;
use std::{ffi::c_void, fs::File, io, os::windows::io::AsRawHandle};

#[repr(C)]
#[derive(Default)]
struct FileIdInfo {
    volume: u64,
    id: [u8; 16],
}

#[link(name = "kernel32")]
extern "system" {
    fn GetFileInformationByHandleEx(
        handle: *mut c_void,
        class: i32,
        info: *mut c_void,
        size: u32,
    ) -> i32;
}

pub(super) fn identity(file: &File) -> io::Result<FileIdentity> {
    let mut information = FileIdInfo::default();
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            18,
            (&mut information as *mut FileIdInfo).cast(),
            std::mem::size_of::<FileIdInfo>() as u32,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(FileIdentity {
        volume: information.volume,
        file: information.id,
    })
}
