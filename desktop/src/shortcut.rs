use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// The extension's pick shortcut, until the window restores the one recorded in its settings.
pub const DEFAULT: &str = "Alt+Shift+KeyS";

#[derive(Default)]
pub struct Hotkey(Mutex<Option<Shortcut>>);

impl Hotkey {
    fn current(&self) -> MutexGuard<'_, Option<Shortcut>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    // The new shortcut is registered before the old one goes, so one another app holds leaves the old in place.
    pub fn set(&self, app: &AppHandle, accelerator: &str) -> Result<(), String> {
        let next: Shortcut = accelerator.parse().map_err(|error| format!("{error}"))?;
        let mut current = self.current();
        if *current != Some(next) {
            app.global_shortcut()
                .register(next)
                .map_err(|error| error.to_string())?;
            if let Some(previous) = current.replace(next) {
                app.global_shortcut().unregister(previous).ok();
            }
        }
        Ok(())
    }

    // A registered shortcut reaches the app before the window, so recording a new one releases it.
    fn pause(&self, app: &AppHandle, paused: bool) -> Result<(), String> {
        let shortcuts = app.global_shortcut();
        match (paused, *self.current()) {
            (true, Some(shortcut)) if shortcuts.is_registered(shortcut) => {
                shortcuts.unregister(shortcut)
            }
            (false, Some(shortcut)) if !shortcuts.is_registered(shortcut) => {
                shortcuts.register(shortcut)
            }
            _ => Ok(()),
        }
        .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn set_shortcut(
    app: AppHandle,
    hotkey: State<'_, Hotkey>,
    accelerator: String,
) -> Result<(), String> {
    hotkey.set(&app, &accelerator)
}

#[tauri::command]
pub fn pause_shortcut(
    app: AppHandle,
    hotkey: State<'_, Hotkey>,
    paused: bool,
) -> Result<(), String> {
    hotkey.pause(&app, paused)
}
