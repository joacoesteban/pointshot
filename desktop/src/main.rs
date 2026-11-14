#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod picker;
mod platform;
mod stage;
mod tree;

use picker::Picker;
use stage::Stage;
use tauri::{Manager, RunEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Picker::spawn())
        .manage(Stage::default())
        .invoke_handler(tauri::generate_handler![
            stage::capture,
            stage::aim,
            stage::walk,
            stage::pick,
            stage::cancel,
            stage::copy
        ])
        .build(tauri::generate_context!())
        .expect("the app builds")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                tauri::async_runtime::block_on(app.state::<Picker>().finish());
            }
        });
}
