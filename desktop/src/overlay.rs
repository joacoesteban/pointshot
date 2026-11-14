use crate::platform::Accessibility;
use crate::tree::{Aim, Step, Tree};
use gpui::{
    App, Bounds, BoxShadow, Context, FocusHandle, Hsla, KeyDownEvent, MouseButton, MouseDownEvent,
    MouseMoveEvent, Pixels, Point, Window, div, hsla, point, prelude::*, px,
};
use std::rc::Rc;

pub type OnPick = Rc<dyn Fn(Option<Bounds<Pixels>>, &mut App)>;

type Node = <Accessibility as Tree>::Node;

pub struct Overlay {
    tree: Rc<Accessibility>,
    aim: Aim<Node>,
    origin: Point<Pixels>,
    focus: FocusHandle,
    on_pick: OnPick,
}

// The extension's highlight, from components/highlight.svelte.
fn green(hue: f32, lightness: f32, alpha: f32) -> Hsla {
    hsla(hue / 360., 1., lightness, alpha)
}

impl Overlay {
    pub fn new(
        tree: Rc<Accessibility>,
        origin: Point<Pixels>,
        on_pick: OnPick,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        let native = tree.clone();
        window.on_next_frame(move |window, _| native.focus(window));
        Self {
            tree,
            aim: Aim::default(),
            origin,
            focus,
            on_pick,
        }
    }

    fn step(&mut self, step: Step, cx: &mut Context<Self>) {
        self.aim = std::mem::take(&mut self.aim).step(self.tree.as_ref(), step);
        cx.notify();
    }

    fn frame(&self) -> Option<Bounds<Pixels>> {
        self.aim
            .node
            .as_ref()
            .and_then(|node| self.tree.frame(node))
    }

    fn pick(&self, frame: Option<Bounds<Pixels>>, cx: &mut App) {
        (self.on_pick)(frame, cx)
    }

    fn on_move(&mut self, event: &MouseMoveEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.step(Step::Point(self.origin + event.position), cx);
    }

    fn on_down(&mut self, _: &MouseDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.pick(self.frame(), cx);
    }

    fn on_key(&mut self, event: &KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        match event.keystroke.key.as_str() {
            "up" => self.step(Step::Up, cx),
            "down" => self.step(Step::Down, cx),
            "left" => self.step(Step::Previous, cx),
            "right" => self.step(Step::Next, cx),
            "enter" => self.pick(self.frame(), cx),
            "escape" => self.pick(None, cx),
            _ => {}
        }
    }

    fn highlight(&self, frame: Bounds<Pixels>, label: String) -> impl IntoElement {
        let Bounds {
            origin,
            size: extent,
        } = frame;
        let offset = origin - self.origin;
        div()
            .absolute()
            .left(offset.x)
            .top(offset.y)
            .w(extent.width)
            .h(extent.height)
            .border_2()
            .border_color(green(145., 0.8, 1.))
            .bg(green(130., 0.5, 0.2))
            .shadow(vec![BoxShadow {
                color: green(160., 0.6, 0.2),
                offset: point(px(0.), px(0.)),
                blur_radius: px(30.),
                spread_radius: px(5.),
                inset: false,
            }])
            .child(
                div()
                    .absolute()
                    .left(px(6.))
                    .bottom(px(6.))
                    .flex()
                    .gap_2()
                    .px_2()
                    .py_1()
                    .rounded_full()
                    .bg(hsla(0., 0., 0.1, 0.75))
                    .text_xs()
                    .text_color(gpui::white())
                    .child(div().font_weight(gpui::FontWeight::BOLD).child(label))
                    .child(div().opacity(0.6).child(format!(
                        "{} × {}",
                        f32::from(extent.width).round(),
                        f32::from(extent.height).round()
                    ))),
            )
    }

    fn hint() -> impl IntoElement {
        div()
            .absolute()
            .bottom(px(32.))
            .w_full()
            .flex()
            .justify_center()
            .child(
                div()
                    .px_4()
                    .py_2()
                    .rounded_full()
                    .bg(hsla(0., 0., 0.1, 0.85))
                    .text_sm()
                    .text_color(gpui::white())
                    .child(
                        "Click or Enter to capture  ·  Arrows to walk the tree  ·  Esc to cancel",
                    ),
            )
    }
}

impl Render for Overlay {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let highlight = self.aim.node.as_ref().and_then(|node| {
            self.tree
                .frame(node)
                .map(|frame| self.highlight(frame, self.tree.label(node)))
        });
        div()
            .id("overlay")
            .track_focus(&self.focus)
            .size_full()
            .bg(hsla(0., 0., 0., 0.08))
            .on_mouse_move(cx.listener(Self::on_move))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_down))
            .on_key_down(cx.listener(Self::on_key))
            .children(highlight)
            .child(Self::hint())
    }
}
