use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// The extension's pick shortcut, keyed by the overlay mode it starts in, until the window restores the ones recorded in its settings.
pub const DEFAULT: (&str, &str) = ("element", "Alt+Shift+KeyS");

#[derive(Default)]
pub struct Hotkey(Mutex<HashMap<String, Shortcut>>);

impl Hotkey {
    fn shortcuts(&self) -> MutexGuard<'_, HashMap<String, Shortcut>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn mode(&self, fired: &Shortcut) -> Option<String> {
        self.shortcuts()
            .iter()
            .find(|(_, shortcut)| *shortcut == fired)
            .map(|(mode, _)| mode.clone())
    }

    // An empty accelerator clears the mode's shortcut. The new one is registered before the old one goes, so one another app holds leaves the old in place.
    pub fn set(&self, app: &AppHandle, mode: &str, accelerator: &str) -> Result<(), String> {
        let next = match accelerator {
            "" => None,
            accelerator => Some(
                accelerator
                    .parse::<Shortcut>()
                    .map_err(|error| format!("{error}"))?,
            ),
        };
        let mut shortcuts = self.shortcuts();
        let current = shortcuts.get(mode).copied();
        if current == next {
            return Ok(());
        }
        if let Some(next) = next {
            if shortcuts.values().any(|shortcut| *shortcut == next) {
                return Err(format!("{accelerator} already starts another capture"));
            }
            app.global_shortcut()
                .register(next)
                .map_err(|error| error.to_string())?;
        }
        if let Some(previous) = current {
            app.global_shortcut().unregister(previous).ok();
        }
        match next {
            Some(next) => shortcuts.insert(mode.into(), next),
            None => shortcuts.remove(mode),
        };
        Ok(())
    }

    // A registered shortcut reaches the app before the window, so recording new ones releases them all.
    fn pause(&self, app: &AppHandle, paused: bool) -> Result<(), String> {
        let shortcuts = app.global_shortcut();
        self.shortcuts()
            .values()
            .try_for_each(
                |&shortcut| match (paused, shortcuts.is_registered(shortcut)) {
                    (true, true) => shortcuts.unregister(shortcut),
                    (false, false) => shortcuts.register(shortcut),
                    _ => Ok(()),
                },
            )
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn set_shortcut(
    app: AppHandle,
    hotkey: State<'_, Hotkey>,
    mode: String,
    accelerator: String,
) -> Result<(), String> {
    hotkey.set(&app, &mode, &accelerator)
}

#[tauri::command]
pub fn pause_shortcut(
    app: AppHandle,
    hotkey: State<'_, Hotkey>,
    paused: bool,
) -> Result<(), String> {
    hotkey.pause(&app, paused)
}
