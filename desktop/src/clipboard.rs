use tauri::AppHandle;
use tauri::image::Image;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_clipboard_manager::ClipboardExt;

// The library sends the PNG as the request's raw body, which spares encoding its bytes as a JSON array.
#[tauri::command]
pub fn copy(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(png) = request.body() else {
        return Err("the clipboard takes a PNG".into());
    };
    let image = image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .map_err(|error| error.to_string())?
        .to_rgba8();
    app.clipboard()
        .write_image(&Image::new(image.as_raw(), image.width(), image.height()))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|error| error.to_string())
}
