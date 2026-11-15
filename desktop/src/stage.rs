use crate::picker::{Aimed, Picker, Source, Target};
use crate::platform;
use crate::tree::{Frame, Point, Step};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use image::RgbaImage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::image::Image;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::oneshot;

// Long enough for the window server to take the overlays off screen, and the picked app to come back to the front, before the capture.
const OFFSTAGE: Duration = Duration::from_millis(200);
pub const MAIN: &str = "main";
const TOAST: &str = "toast";
// Room for the extension's toast at the bottom of a display, in points, and how long it stays: the toast's own two seconds and its exit.
const TOAST_SIZE: (f64, f64) = (480., 96.);
const TOAST_FOR: Duration = Duration::from_millis(2600);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub origin: PhysicalPosition<i32>,
    pub size: PhysicalSize<u32>,
    pub scale: f64,
}

// An overlay measures in CSS pixels from its own corner, which the scale turns into physical pixels on its display.
impl Screen {
    fn of(monitor: &Monitor) -> Self {
        Self {
            origin: *monitor.position(),
            size: *monitor.size(),
            scale: monitor.scale_factor(),
        }
    }

    fn unit(&self) -> f64 {
        platform::pixels_per_unit(self.scale)
    }

    fn native(&self, Point { x, y }: Point) -> Point {
        Point {
            x: (f64::from(self.origin.x) + x * self.scale) / self.unit(),
            y: (f64::from(self.origin.y) + y * self.scale) / self.unit(),
        }
    }

    fn client(&self, Point { x, y }: Point) -> Point {
        Point {
            x: (x * self.unit() - f64::from(self.origin.x)) / self.scale,
            y: (y * self.unit() - f64::from(self.origin.y)) / self.scale,
        }
    }

    fn reframe(&self, frame: Frame, convert: impl Fn(Point) -> Point) -> Frame {
        let Point { x, y } = convert(Point {
            x: frame.x,
            y: frame.y,
        });
        let Point {
            x: right,
            y: bottom,
        } = convert(Point {
            x: frame.x + frame.width,
            y: frame.y + frame.height,
        });
        Frame {
            x,
            y,
            width: right - x,
            height: bottom - y,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Captured {
    image: String,
    width: u32,
    height: u32,
    #[serde(flatten)]
    source: Source,
}

// The options page's resolution: the display's pixels, or one image pixel per point, as the extension's one per CSS pixel.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Device,
    Css,
}

#[derive(Clone, Copy, Debug)]
struct Picked {
    frame: Frame,
    scale: f64,
    density: Density,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Walk {
    Up,
    Down,
    Previous,
    Next,
}

#[derive(Default)]
pub struct Stage {
    screens: Mutex<HashMap<String, Screen>>,
    ending: Mutex<Option<oneshot::Sender<Option<Picked>>>>,
    running: tokio::sync::Mutex<()>,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Stage {
    fn screen(&self, label: &str) -> Result<Screen, String> {
        locked(&self.screens)
            .get(label)
            .copied()
            .ok_or_else(|| format!("{label} is not an overlay"))
    }

    fn open(&self, app: &AppHandle, home: Option<Screen>) -> tauri::Result<()> {
        let screens: HashMap<String, Screen> = app
            .available_monitors()?
            .iter()
            .enumerate()
            .map(|(index, monitor)| (format!("overlay-{index}"), Screen::of(monitor)))
            .collect();
        *locked(&self.screens) = screens.clone();
        screens.iter().try_for_each(|(label, screen)| {
            let window =
                WebviewWindowBuilder::new(app, label, WebviewUrl::App("overlay.html".into()))
                    .title("Pointshot")
                    .transparent(true)
                    .decorations(false)
                    .shadow(false)
                    .always_on_top(true)
                    .visible_on_all_workspaces(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .focused(false)
                    .visible(false)
                    .build()?;
            platform::place(&window, screen)?;
            window.show()?;
            match home {
                Some(home) if home == *screen => window.set_focus(),
                _ => Ok(()),
            }
        })
    }

    fn close(&self, app: &AppHandle) {
        locked(&self.screens).drain().for_each(|(label, _)| {
            app.get_webview_window(&label)
                .map(|window| window.destroy());
        });
    }

    fn end(&self, picked: Option<Picked>) {
        if let Some(ending) = locked(&self.ending).take() {
            ending.send(picked).ok();
        }
    }

    fn show(&self, app: &AppHandle, aimed: Option<Aimed>) -> tauri::Result<()> {
        locked(&self.screens)
            .iter()
            .try_for_each(|(label, screen)| {
                let local = |Target { frame, label }: Target| Target {
                    frame: screen.reframe(frame, |point| screen.client(point)),
                    label,
                };
                let local = aimed.clone().map(|Aimed { node, window }| Aimed {
                    node: local(node),
                    window: window.map(local),
                });
                app.emit_to(label, "aim", local)
            })
    }

    async fn session(&self, app: &AppHandle, picker: &Picker) -> anyhow::Result<Option<Captured>> {
        picker.connect().await?;
        let (ending, ended) = oneshot::channel();
        *locked(&self.ending) = Some(ending);
        self.open(app, home(app))?;
        let picked = ended.await.ok().flatten();
        self.close(app);
        let source = picker
            .finish(picked.map(|Picked { frame, .. }| frame))
            .await;
        match picked {
            Some(Picked {
                frame,
                scale,
                density,
            }) => {
                tokio::time::sleep(OFFSTAGE).await;
                let image = picker.capture(frame).await?;
                Ok(Some(keep(app, image, scale, density, source)?))
            }
            None => Ok(None),
        }
    }
}

// The overlay under the pointer takes the keys first.
fn home(app: &AppHandle) -> Option<Screen> {
    let PhysicalPosition { x, y } = app.cursor_position().ok()?;
    app.monitor_from_point(x, y)
        .ok()
        .flatten()
        .map(|monitor| Screen::of(&monitor))
}

// The library sizes a capture in points, the desktop's CSS pixels.
fn keep(
    app: &AppHandle,
    image: RgbaImage,
    scale: f64,
    density: Density,
    source: Source,
) -> anyhow::Result<Captured> {
    let points = |pixels: u32| (f64::from(pixels) / scale).round().max(1.) as u32;
    let (width, height) = image.dimensions();
    let (width, height) = (points(width), points(height));
    let image = match density {
        Density::Device => image,
        Density::Css => {
            image::imageops::resize(&image, width, height, image::imageops::FilterType::Lanczos3)
        }
    };
    app.clipboard()
        .write_image(&Image::new(image.as_raw(), image.width(), image.height()))?;
    let mut png = Vec::new();
    image.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)?;
    Ok(Captured {
        image: format!("data:image/png;base64,{}", STANDARD.encode(png)),
        width,
        height,
        source,
    })
}

// A capture made while the library stays hidden would end in silence, so the extension's toast shows on the display under the pointer.
// It takes no focus and lets clicks through, so the app just captured keeps both.
fn toast(app: &AppHandle) -> tauri::Result<()> {
    let Some(screen) = home(app) else {
        return Ok(());
    };
    if app.get_webview_window(TOAST).is_some() {
        return Ok(());
    }
    let (width, height) = TOAST_SIZE;
    let size = PhysicalSize::new(
        (width * screen.scale).round() as u32,
        (height * screen.scale).round() as u32,
    );
    let place = Screen {
        origin: PhysicalPosition::new(
            screen.origin.x + (screen.size.width.saturating_sub(size.width) / 2) as i32,
            screen.origin.y + screen.size.height.saturating_sub(size.height) as i32,
        ),
        size,
        scale: screen.scale,
    };
    // GTK keeps a fixed-size window at least as large as it was built, and places it on showing, so the builder gets both.
    let window = WebviewWindowBuilder::new(app, TOAST, WebviewUrl::App("toast.html".into()))
        .title("Pointshot")
        .inner_size(width, height)
        .position(
            f64::from(place.origin.x) / screen.scale,
            f64::from(place.origin.y) / screen.scale,
        )
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    platform::place(&window, &place)?;
    window.show()?;
    // tao on Linux unwraps the GTK window, which a hidden window does not have yet.
    window.set_ignore_cursor_events(true)?;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(TOAST_FOR).await;
        window.destroy().ok();
    });
    Ok(())
}

// The library files what this sends, so the main window lives on hidden while the app runs.
pub async fn start(app: AppHandle) {
    let stage = app.state::<Stage>();
    let picker = app.state::<Picker>();
    let Ok(_running) = stage.running.try_lock() else {
        return;
    };
    let main = app.get_webview_window(MAIN);
    // Without them the overlay finds nothing and captures come out blank, so the library asks for them instead.
    if !platform::permissions().granted() {
        app.emit_to(MAIN, "permissions", ()).ok();
        main.iter().for_each(|main| {
            main.show().ok();
            main.set_focus().ok();
        });
        return;
    }
    let shown = main
        .as_ref()
        .is_some_and(|main| main.is_visible().unwrap_or(false));
    main.iter().for_each(|main| {
        main.hide().ok();
    });
    let captured = stage.session(&app, &picker).await;
    if captured.is_err() {
        stage.close(&app);
        picker.finish(None).await;
    }
    match &captured {
        Ok(Some(captured)) => app.emit_to(MAIN, "captured", captured),
        Ok(None) => Ok(()),
        Err(error) => app.emit_to(MAIN, "failed", format!("{error:#}")),
    }
    .ok();
    match (shown, &captured) {
        (false, Ok(Some(_))) => {
            toast(&app).ok();
        }
        (true, _) | (_, Err(_)) => main.iter().for_each(|main| {
            main.show().ok();
            main.set_focus().ok();
        }),
        _ => {}
    }
}

#[tauri::command]
pub fn capture(app: AppHandle) {
    tauri::async_runtime::spawn(start(app));
}

#[tauri::command]
pub async fn aim(
    window: WebviewWindow,
    app: AppHandle,
    picker: State<'_, Picker>,
    stage: State<'_, Stage>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let screen = stage.screen(window.label())?;
    let aimed = picker
        .step(Step::Point(screen.native(Point { x, y })))
        .await;
    stage.show(&app, aimed).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn walk(
    app: AppHandle,
    picker: State<'_, Picker>,
    stage: State<'_, Stage>,
    direction: Walk,
) -> Result<(), String> {
    let step = match direction {
        Walk::Up => Step::Up,
        Walk::Down => Step::Down,
        Walk::Previous => Step::Previous,
        Walk::Next => Step::Next,
    };
    let aimed = picker.step(step).await;
    stage.show(&app, aimed).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pick(
    window: WebviewWindow,
    stage: State<'_, Stage>,
    frame: Frame,
    density: Density,
) -> Result<(), String> {
    let screen = stage.screen(window.label())?;
    stage.end(Some(Picked {
        frame: screen.reframe(frame, |point| screen.native(point)),
        scale: screen.scale,
        density,
    }));
    Ok(())
}

#[tauri::command]
pub fn cancel(stage: State<'_, Stage>) {
    stage.end(None);
}
