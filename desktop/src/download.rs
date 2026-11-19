use anyhow::Context as _;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

// Like the browser's downloads: a taken name gets a counter, as in "name (1).png".
fn free(path: PathBuf) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    std::iter::once(path.clone())
        .chain((1..).map(|count| path.with_file_name(format!("{stem} ({count}){extension}"))))
        .find(|candidate| !candidate.exists())
        .expect("some counter is free")
}

// Linux knows the downloads folder only from the XDG user dirs, which a desktop without them lacks.
fn downloads(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let paths = app.path();
    Ok(paths
        .download_dir()
        .or_else(|_| paths.home_dir().map(|home| home.join("Downloads")))?)
}

// Link downloads too: the webview's own choice differs per platform, and on Linux without XDG user dirs is the working directory.
pub fn place(app: &AppHandle, destination: &mut PathBuf) {
    if let (Some(name), Ok(folder)) = (destination.file_name(), downloads(app)) {
        std::fs::create_dir_all(&folder).ok();
        *destination = free(folder.join(name));
    }
}

fn target(app: &AppHandle, filename: &str, save_as: bool) -> anyhow::Result<Option<PathBuf>> {
    let path = downloads(app)?.join(filename);
    // Save As opens in the folder only when it exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match save_as {
        true => app
            .dialog()
            .file()
            .set_directory(path.parent().unwrap_or(Path::new("")))
            .set_file_name(
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            )
            .blocking_save_file()
            .map(|chosen| chosen.into_path().context("the chosen file is not a path"))
            .transpose(),
        false => Ok(Some(free(path))),
    }
}

// The options page's folder is relative to the downloads folder, as in the browser. A dismissed Save As saves nothing and is no failure.
#[tauri::command]
pub async fn download(
    app: AppHandle,
    url: String,
    filename: String,
    save_as: bool,
) -> Result<u32, String> {
    let saved = || -> anyhow::Result<()> {
        let (_, data) = url
            .split_once(',')
            .context("the download is not a data URL")?;
        let bytes = STANDARD.decode(data)?;
        if let Some(path) = target(&app, &filename, save_as)? {
            std::fs::write(path, bytes)?;
        }
        Ok(())
    };
    saved().map(|()| 0).map_err(|error| format!("{error:#}"))
}

#[cfg(test)]
mod tests {
    use super::free;

    #[test]
    fn counts_past_taken_names() {
        let folder = std::env::temp_dir().join(format!("pointshot-free-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let shot = folder.join("shot.png");
        assert_eq!(free(shot.clone()), shot);
        std::fs::write(&shot, b"").unwrap();
        std::fs::write(folder.join("shot (1).png"), b"").unwrap();
        assert_eq!(free(shot), folder.join("shot (2).png"));
        std::fs::remove_dir_all(folder).unwrap();
    }
}
