#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod picker;
mod platform;
mod stage;
mod tree;

use picker::Picker;
use stage::{MAIN, Stage};
use tauri::{AppHandle, Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// The extension's pick-element shortcut. The library's empty state names it too.
const CAPTURE: &str = "Alt+Shift+S";

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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        tauri::async_runtime::spawn(stage::start(app.clone()));
                    }
                })
                .build(),
        )
        .manage(Picker::spawn())
        .manage(Stage::default())
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == MAIN)
                .ok_or("the config declares the main window")?
                .clone();
            // Without a handler the webview drops downloads; with one, it saves them in the downloads folder.
            WebviewWindowBuilder::from_config(app, &config)?
                .on_download(|_, _| true)
                .build()?;
            // Another app may hold the shortcut, which leaves the Capture button and the tray.
            app.global_shortcut().register(CAPTURE).ok();
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
