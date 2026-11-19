#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::{Accessibility, tray_supported};
#[cfg(target_os = "macos")]
pub use macos::{Accessibility, grant, permissions, pixels_per_unit, place};
#[cfg(target_os = "windows")]
pub use windows::Accessibility;

// Only macOS asks for permissions to read other apps and the screen.
#[cfg(not(target_os = "macos"))]
pub fn permissions() -> crate::permissions::Permissions {
    crate::permissions::Permissions {
        accessibility: true,
        screen: true,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn grant(_: crate::permissions::Permission) {}

#[cfg(not(target_os = "linux"))]
pub fn tray_supported() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn pixels_per_unit(_: f64) -> f64 {
    1.
}

#[cfg(not(target_os = "macos"))]
pub fn place(window: &tauri::WebviewWindow, screen: &crate::stage::Screen) -> tauri::Result<()> {
    window.set_position(screen.origin)?;
    window.set_size(screen.size)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn xcap_capture(frame: crate::tree::Frame) -> anyhow::Result<image::RgbaImage> {
    let round = |value: f64| value.round() as i32;
    let center = frame.center();
    let monitor = xcap::Monitor::from_point(round(center.x), round(center.y))?;
    let (x, y) = (round(frame.x) - monitor.x()?, round(frame.y) - monitor.y()?);
    let (left, top) = (x.max(0), y.max(0));
    let right = (x + round(frame.width)).min(monitor.width()? as i32);
    let bottom = (y + round(frame.height)).min(monitor.height()? as i32);
    Ok(monitor.capture_region(
        u32::try_from(left)?,
        u32::try_from(top)?,
        u32::try_from(right - left)?,
        u32::try_from(bottom - top)?,
    )?)
}
