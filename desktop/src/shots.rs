use crate::overlay::{OnPick, Overlay};
use crate::platform::Accessibility;
use gpui::{
    AnyWindowHandle, App, AppContext as _, Bounds, ClipboardItem, Context, Image, ImageFormat,
    Pixels, SharedString, WeakEntity, Window, WindowBackgroundAppearance, WindowBounds,
    WindowHandle, WindowKind, WindowOptions, div, hsla, img, prelude::*, px,
};
use std::io::Cursor;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

// Long enough for the window server to take the overlay off screen before the capture.
const OFFSTAGE: Duration = Duration::from_millis(200);

pub struct Shots {
    main: AnyWindowHandle,
    tree: Option<Rc<Accessibility>>,
    overlays: Vec<WindowHandle<Overlay>>,
    shots: Vec<Arc<Image>>,
    status: SharedString,
}

impl Shots {
    pub fn new(main: AnyWindowHandle) -> Self {
        Self {
            main,
            tree: None,
            overlays: Vec::new(),
            shots: Vec::new(),
            status: "Capture an element of any app.".into(),
        }
    }

    fn tree(&mut self, scale: f32) -> anyhow::Result<Rc<Accessibility>> {
        match &self.tree {
            Some(tree) => Ok(tree.clone()),
            None => {
                let tree = Rc::new(Accessibility::connect(scale)?);
                self.tree = Some(tree.clone());
                Ok(tree)
            }
        }
    }

    fn capture(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match self.tree(window.scale_factor()) {
            Ok(tree) => {
                window.minimize_window();
                self.open_overlays(tree, cx)
            }
            Err(error) => self.report(error, cx),
        }
    }

    fn open_overlays(&mut self, tree: Rc<Accessibility>, cx: &mut Context<Self>) {
        let shots = cx.weak_entity();
        let on_pick: OnPick = Rc::new(move |frame, cx| {
            shots.update(cx, |shots, cx| shots.picked(frame, cx)).ok();
        });
        self.overlays = cx
            .displays()
            .into_iter()
            .filter_map(|display| {
                let bounds = display.bounds();
                let origin = Accessibility::origin(display.as_ref());
                cx.open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(bounds)),
                        display_id: Some(display.id()),
                        titlebar: None,
                        kind: WindowKind::PopUp,
                        window_background: WindowBackgroundAppearance::Transparent,
                        focus: true,
                        is_movable: false,
                        is_resizable: false,
                        ..Default::default()
                    },
                    |window, cx| {
                        cx.new(|cx| Overlay::new(tree.clone(), origin, on_pick.clone(), window, cx))
                    },
                )
                .ok()
            })
            .collect();
    }

    fn picked(&mut self, frame: Option<Bounds<Pixels>>, cx: &mut Context<Self>) {
        std::mem::take(&mut self.overlays)
            .into_iter()
            .for_each(|overlay| {
                overlay
                    .update(cx, |_, window, _| window.remove_window())
                    .ok();
            });
        match frame {
            Some(frame) => cx
                .spawn(async move |shots: WeakEntity<Self>, cx| {
                    cx.background_executor().timer(OFFSTAGE).await;
                    shots
                        .update(cx, |shots, cx| {
                            shots.shoot(frame, cx);
                            shots.restore(cx);
                        })
                        .ok();
                })
                .detach(),
            None => self.restore(cx),
        }
    }

    fn restore(&self, cx: &mut Context<Self>) {
        self.main
            .update(cx, |_, window, _| window.activate_window())
            .ok();
    }

    fn shoot(&mut self, frame: Bounds<Pixels>, cx: &mut Context<Self>) {
        match self.encode(frame) {
            Ok(image) => {
                cx.write_to_clipboard(ClipboardItem::new_image(&image));
                self.shots.insert(0, Arc::new(image));
                self.status = "Copied to the clipboard.".into();
                cx.notify();
            }
            Err(error) => self.report(error, cx),
        }
    }

    fn encode(&self, frame: Bounds<Pixels>) -> anyhow::Result<Image> {
        let tree = self
            .tree
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("the accessibility tree is not connected"))?;
        let mut bytes = Vec::new();
        tree.capture(frame)?
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)?;
        Ok(Image::from_bytes(ImageFormat::Png, bytes))
    }

    fn copy(&mut self, image: &Image, cx: &mut Context<Self>) {
        cx.write_to_clipboard(ClipboardItem::new_image(image));
        self.status = "Copied to the clipboard.".into();
        cx.notify();
    }

    fn report(&mut self, error: anyhow::Error, cx: &mut Context<Self>) {
        self.status = format!("{error:#}").into();
        cx.notify();
    }

    fn header(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap_4()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .text_xl()
                            .font_weight(gpui::FontWeight::BOLD)
                            .child("Pointshot"),
                    )
                    .child(div().text_sm().opacity(0.6).child(self.status.clone())),
            )
            .child(
                div()
                    .id("capture")
                    .px_4()
                    .py_2()
                    .rounded_full()
                    .bg(hsla(145. / 360., 0.7, 0.36, 1.))
                    .hover(|style| style.bg(hsla(145. / 360., 0.7, 0.42, 1.)))
                    .text_color(gpui::white())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .cursor_pointer()
                    .child("Capture element")
                    .on_click(cx.listener(|shots, _, window, cx| shots.capture(window, cx))),
            )
    }

    fn gallery(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("gallery")
            .flex_1()
            .overflow_y_scroll()
            .flex()
            .flex_wrap()
            .content_start()
            .gap_3()
            .children(self.shots.iter().enumerate().map(|(index, shot)| {
                let image = shot.clone();
                div()
                    .id(index)
                    .size(px(160.))
                    .p_2()
                    .rounded_lg()
                    .bg(hsla(0., 0., 1., 0.06))
                    .hover(|style| style.bg(hsla(0., 0., 1., 0.12)))
                    .cursor_pointer()
                    .child(
                        img(shot.clone())
                            .size_full()
                            .object_fit(gpui::ObjectFit::Contain),
                    )
                    .on_click(cx.listener(move |shots, _, _, cx| shots.copy(&image, cx)))
            }))
    }
}

impl Render for Shots {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .flex_col()
            .gap_6()
            .p_6()
            .bg(hsla(0., 0., 0.09, 1.))
            .text_color(hsla(0., 0., 0.95, 1.))
            .child(self.header(cx))
            .child(self.gallery(cx))
    }
}

pub fn open(cx: &mut App) -> anyhow::Result<WindowHandle<Shots>> {
    let bounds = Bounds::centered(None, gpui::size(px(720.), px(480.)), cx);
    cx.open_window(
        WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            ..Default::default()
        },
        |window, cx| {
            let main = window.window_handle();
            cx.new(|_| Shots::new(main))
        },
    )
}
