#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod download;
mod permissions;
mod picker;
mod platform;
mod shortcut;
mod stage;
mod tree;

use picker::Picker;
use stage::{MAIN, Stage};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn tray_supported() -> bool {
    platform::tray_supported()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && let Some(mode) = app.state::<shortcut::Hotkey>().mode(shortcut)
                    {
                        tauri::async_runtime::spawn(stage::start(app.clone(), mode));
                    }
                })
                .build(),
        )
        .manage(Picker::spawn())
        .manage(Stage::default())
        .manage(shortcut::Hotkey::default())
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == MAIN)
                .ok_or("the config declares the main window")?
                .clone();
            let handle = app.handle().clone();
            // Without a handler the webview drops downloads.
            // Links that open a new window, like the options page's footer, go to the default browser instead.
            WebviewWindowBuilder::from_config(app, &config)?
                .on_download(|webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        download::place(webview.app_handle(), destination);
                    }
                    true
                })
                .on_new_window(move |url, _| {
                    if let "http" | "https" = url.scheme() {
                        handle.opener().open_url(url.as_str(), None::<&str>).ok();
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            // Another app may hold the shortcut, which leaves the Capture button and the tray.
            let (mode, accelerator) = shortcut::DEFAULT;
            app.state::<shortcut::Hotkey>()
                .set(app.handle(), mode, accelerator)
                .ok();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let (MAIN, WindowEvent::CloseRequested { api, .. }) = (window.label(), event) {
                api.prevent_close();
                window.hide().ok();
            }
        })
        .invoke_handler(tauri::generate_handler![
            stage::capture,
            stage::aim,
            stage::walk,
            stage::pick,
            stage::cancel,
            clipboard::copy,
            clipboard::copy_text,
            download::download,
            permissions::permissions,
            permissions::grant,
            shortcut::set_shortcut,
            shortcut::pause_shortcut,
            quit,
            tray_supported
        ])
        .build(tauri::generate_context!())
        .expect("the app builds")
        .run(|app, event| match event {
            RunEvent::Exit => {
                tauri::async_runtime::block_on(app.state::<Picker>().finish(None));
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if let Some(main) = app.get_webview_window(MAIN) {
                    main.show().ok();
                    main.set_focus().ok();
                }
            }
            _ => {}
        });
}
