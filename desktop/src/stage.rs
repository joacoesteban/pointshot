use crate::picker::{Aimed, Picker};
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
const MAIN: &str = "main";

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
pub struct Shot {
    id: usize,
    url: String,
    width: u32,
    height: u32,
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
    ending: Mutex<Option<oneshot::Sender<Option<Frame>>>>,
    shots: Mutex<Vec<RgbaImage>>,
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

    fn end(&self, frame: Option<Frame>) {
        if let Some(ending) = locked(&self.ending).take() {
            ending.send(frame).ok();
        }
    }

    fn show(&self, app: &AppHandle, aimed: Option<Aimed>) -> tauri::Result<()> {
        locked(&self.screens)
            .iter()
            .try_for_each(|(label, screen)| {
                let local = aimed.clone().map(|Aimed { frame, label }| Aimed {
                    frame: screen.reframe(frame, |point| screen.client(point)),
                    label,
                });
                app.emit_to(label, "aim", local)
            })
    }

    fn keep(&self, app: &AppHandle, image: RgbaImage) -> anyhow::Result<Shot> {
        let (width, height) = image.dimensions();
        app.clipboard()
            .write_image(&Image::new(image.as_raw(), width, height))?;
        let mut png = Vec::new();
        image.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)?;
        let mut shots = locked(&self.shots);
        shots.push(image);
        Ok(Shot {
            id: shots.len() - 1,
            url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
            width,
            height,
        })
    }

    async fn session(
        &self,
        app: &AppHandle,
        picker: &Picker,
        main: Option<&WebviewWindow>,
    ) -> anyhow::Result<Option<Shot>> {
        picker.connect().await?;
        let (ending, ended) = oneshot::channel();
        *locked(&self.ending) = Some(ending);
        let home = main
            .and_then(|main| main.current_monitor().ok().flatten())
            .map(|monitor| Screen::of(&monitor));
        main.iter().try_for_each(|main| main.hide())?;
        self.open(app, home)?;
        let frame = ended.await.ok().flatten();
        self.close(app);
        picker.finish().await;
        match frame {
            Some(frame) => {
                tokio::time::sleep(OFFSTAGE).await;
                Ok(Some(self.keep(app, picker.capture(frame).await?)?))
            }
            None => Ok(None),
        }
    }
}

#[tauri::command]
pub async fn capture(
    app: AppHandle,
    picker: State<'_, Picker>,
    stage: State<'_, Stage>,
) -> Result<Option<Shot>, String> {
    let main = app.get_webview_window(MAIN);
    let shot = stage.session(&app, &picker, main.as_ref()).await;
    if shot.is_err() {
        stage.close(&app);
    }
    main.iter().for_each(|main| {
        main.show().ok();
        main.set_focus().ok();
    });
    shot.map_err(|error| format!("{error:#}"))
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
pub fn pick(window: WebviewWindow, stage: State<'_, Stage>, frame: Frame) -> Result<(), String> {
    let screen = stage.screen(window.label())?;
    stage.end(Some(screen.reframe(frame, |point| screen.native(point))));
    Ok(())
}

#[tauri::command]
pub fn cancel(stage: State<'_, Stage>) {
    stage.end(None);
}

#[tauri::command]
pub fn copy(app: AppHandle, stage: State<'_, Stage>, id: usize) -> Result<(), String> {
    let shots = locked(&stage.shots);
    let image = shots.get(id).ok_or("that screenshot is gone")?;
    let (width, height) = image.dimensions();
    app.clipboard()
        .write_image(&Image::new(image.as_raw(), width, height))
        .map_err(|error| error.to_string())
}
