use crate::platform;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Permissions {
    pub accessibility: bool,
    pub screen: bool,
}

impl Permissions {
    pub fn granted(&self) -> bool {
        self.accessibility && self.screen
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Accessibility,
    Screen,
}

#[tauri::command]
pub fn permissions() -> Permissions {
    platform::permissions()
}

#[tauri::command]
pub fn grant(permission: Permission) {
    platform::grant(permission);
}
