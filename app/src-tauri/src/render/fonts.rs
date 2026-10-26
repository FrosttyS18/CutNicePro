pub fn prepare(path: &std::path::Path) -> Result<(), String> {
    let directory = path.join("fonts");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let assets: &[(&str, &[u8])] = &[
        (
            "Poppins-Regular.ttf",
            include_bytes!("../../resources/fonts/Poppins-Regular.ttf"),
        ),
        (
            "Poppins-SemiBold.ttf",
            include_bytes!("../../resources/fonts/Poppins-SemiBold.ttf"),
        ),
        (
            "Poppins-Bold.ttf",
            include_bytes!("../../resources/fonts/Poppins-Bold.ttf"),
        ),
        (
            "Poppins-Italic.ttf",
            include_bytes!("../../resources/fonts/Poppins-Italic.ttf"),
        ),
        (
            "Poppins-SemiBoldItalic.ttf",
            include_bytes!("../../resources/fonts/Poppins-SemiBoldItalic.ttf"),
        ),
        (
            "Poppins-BoldItalic.ttf",
            include_bytes!("../../resources/fonts/Poppins-BoldItalic.ttf"),
        ),
    ];
    for (name, bytes) in assets {
        std::fs::write(directory.join(name), bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}
