#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::Accessibility;
#[cfg(target_os = "macos")]
pub use macos::Accessibility;
#[cfg(target_os = "windows")]
pub use windows::Accessibility;

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn xcap_capture(frame: gpui::Bounds<gpui::Pixels>, scale: f32) -> anyhow::Result<image::RgbaImage> {
    // xcap measures macOS displays in points and Windows displays in physical pixels.
    let native = |value: gpui::Pixels| (f32::from(value) * scale).round() as i32;
    let center = frame.center();
    let monitor = xcap::Monitor::from_point(native(center.x), native(center.y))?;
    let (x, y) = (
        native(frame.origin.x) - monitor.x()?,
        native(frame.origin.y) - monitor.y()?,
    );
    let (left, top) = (x.max(0), y.max(0));
    let right = (x + native(frame.size.width)).min(monitor.width()? as i32);
    let bottom = (y + native(frame.size.height)).min(monitor.height()? as i32);
    Ok(monitor.capture_region(
        u32::try_from(left)?,
        u32::try_from(top)?,
        u32::try_from(right - left)?,
        u32::try_from(bottom - top)?,
    )?)
}
