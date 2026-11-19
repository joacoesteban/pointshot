use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// The extension's pick shortcut, keyed by its action, until the window restores the ones recorded in its settings.
pub const DEFAULT: (&str, &str) = ("element", "Alt+Shift+KeyS");

#[derive(Default)]
pub struct Hotkey {
    shortcuts: Mutex<HashMap<String, Shortcut>>,
    paused: AtomicBool,
}

impl Hotkey {
    fn shortcuts(&self) -> MutexGuard<'_, HashMap<String, Shortcut>> {
        self.shortcuts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    // An overlay mode to start the capture in, or "library".
    pub fn action(&self, fired: &Shortcut) -> Option<String> {
        self.shortcuts()
            .iter()
            .find(|(_, shortcut)| *shortcut == fired)
            .map(|(action, _)| action.clone())
    }

    // An empty accelerator clears the action's shortcut. The new one is registered before the old one goes, so one another app holds leaves the old in place.
    pub fn set(&self, app: &AppHandle, action: &str, accelerator: &str) -> Result<(), String> {
        let next = match accelerator {
            "" => None,
            accelerator => Some(
                accelerator
                    .parse::<Shortcut>()
                    .map_err(|error| format!("{error}"))?,
            ),
        };
        let mut shortcuts = self.shortcuts();
        let current = shortcuts.get(action).copied();
        if current == next {
            return Ok(());
        }
        if let Some(next) = next {
            if shortcuts.values().any(|shortcut| *shortcut == next) {
                return Err(format!("{accelerator} is already taken by another command"));
            }
            app.global_shortcut()
                .register(next)
                .map_err(|error| error.to_string())?;
            // While recording, registering only checks that no other app holds it; resuming registers it for good.
            if self.paused.load(Ordering::SeqCst) {
                app.global_shortcut().unregister(next).ok();
            }
        }
        if let Some(previous) = current {
            app.global_shortcut().unregister(previous).ok();
        }
        match next {
            Some(next) => shortcuts.insert(action.into(), next),
            None => shortcuts.remove(action),
        };
        Ok(())
    }

    // A registered shortcut reaches the app before the window, so recording new ones releases them all.
    fn pause(&self, app: &AppHandle, paused: bool) -> Result<(), String> {
        self.paused.store(paused, Ordering::SeqCst);
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
    action: String,
    accelerator: String,
) -> Result<(), String> {
    hotkey.set(&app, &action, &accelerator)
}

#[tauri::command]
pub fn pause_shortcut(
    app: AppHandle,
    hotkey: State<'_, Hotkey>,
    paused: bool,
) -> Result<(), String> {
    hotkey.pause(&app, paused)
}
