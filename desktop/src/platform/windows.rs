use crate::tree::Tree;
use gpui::{Bounds, Pixels, PlatformDisplay, Point, point, px, size};
use image::RgbaImage;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GW_HWNDNEXT, GetTopWindow, GetWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
};

#[derive(Clone)]
pub struct Node {
    element: IUIAutomationElement,
    automation: IUIAutomation,
}

impl PartialEq for Node {
    fn eq(&self, other: &Self) -> bool {
        unsafe {
            self.automation
                .CompareElements(&self.element, &other.element)
        }
        .is_ok_and(|same| same.as_bool())
    }
}

pub struct Accessibility {
    automation: IUIAutomation,
    walker: IUIAutomationTreeWalker,
    scale: f32,
    pid: u32,
}

impl Accessibility {
    pub fn connect(scale: f32) -> anyhow::Result<Self> {
        let _ = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        let automation: IUIAutomation =
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
        let walker = unsafe { automation.ControlViewWalker()? };
        Ok(Self {
            automation,
            walker,
            scale,
            pid: std::process::id(),
        })
    }

    fn node(&self, element: IUIAutomationElement) -> Node {
        Node {
            element,
            automation: self.automation.clone(),
        }
    }

    fn physical(&self, point: Point<Pixels>) -> POINT {
        POINT {
            x: (f32::from(point.x) * self.scale) as i32,
            y: (f32::from(point.y) * self.scale) as i32,
        }
    }

    fn logical(
        &self,
        RECT {
            left,
            top,
            right,
            bottom,
        }: RECT,
    ) -> Bounds<Pixels> {
        let logical = |value: i32| px(value as f32 / self.scale);
        Bounds::new(
            point(logical(left), logical(top)),
            size(logical(right - left), logical(bottom - top)),
        )
    }

    fn foreign(&self, window: HWND, at: POINT) -> bool {
        let mut pid = 0;
        let mut rect = RECT::default();
        let mut cloaked = 0u32;
        unsafe {
            GetWindowThreadProcessId(window, Some(&mut pid));
            let _ = GetWindowRect(window, &mut rect);
            let _ = DwmGetWindowAttribute(
                window,
                DWMWA_CLOAKED,
                (&mut cloaked as *mut u32).cast(),
                size_of::<u32>() as u32,
            );
        }
        unsafe { IsWindowVisible(window) }.as_bool()
            && cloaked == 0
            && pid != self.pid
            && contains(rect, at)
    }

    fn window_at(&self, at: POINT) -> Option<HWND> {
        std::iter::successors(unsafe { GetTopWindow(None) }.ok(), |window| unsafe {
            GetWindow(*window, GW_HWNDNEXT).ok()
        })
        .find(|window| self.foreign(*window, at))
    }

    fn deepest(&self, node: Node, at: POINT) -> Node {
        let inside = self.children(&node).into_iter().rev().find(|child| {
            unsafe { child.element.CurrentBoundingRectangle() }.is_ok_and(|rect| contains(rect, at))
        });
        match inside {
            Some(child) => self.deepest(child, at),
            None => node,
        }
    }

    pub fn origin(display: &dyn PlatformDisplay) -> Point<Pixels> {
        display.bounds().origin
    }

    pub fn capture(&self, frame: Bounds<Pixels>) -> anyhow::Result<RgbaImage> {
        crate::platform::xcap_capture(frame, self.scale)
    }
}

fn contains(
    RECT {
        left,
        top,
        right,
        bottom,
    }: RECT,
    POINT { x, y }: POINT,
) -> bool {
    (left..right).contains(&x) && (top..bottom).contains(&y)
}

impl Tree for Accessibility {
    type Node = Node;

    fn at(&self, point: Point<Pixels>) -> Option<Node> {
        let at = self.physical(point);
        let window = self.window_at(at)?;
        let root = unsafe { self.automation.ElementFromHandle(window) }.ok()?;
        Some(self.deepest(self.node(root), at))
    }

    fn parent(&self, node: &Node) -> Option<Node> {
        let parent = unsafe { self.walker.GetParentElement(&node.element) }.ok()?;
        let root = unsafe { self.automation.GetRootElement() }.ok()?;
        match unsafe { self.automation.CompareElements(&parent, &root) }
            .is_ok_and(|same| same.as_bool())
        {
            true => None,
            false => Some(self.node(parent)),
        }
    }

    fn children(&self, node: &Node) -> Vec<Node> {
        std::iter::successors(
            unsafe { self.walker.GetFirstChildElement(&node.element) }.ok(),
            |child| unsafe { self.walker.GetNextSiblingElement(child) }.ok(),
        )
        .map(|element| self.node(element))
        .collect()
    }

    fn frame(&self, node: &Node) -> Option<Bounds<Pixels>> {
        unsafe { node.element.CurrentBoundingRectangle() }
            .ok()
            .map(|rect| self.logical(rect))
    }

    fn label(&self, node: &Node) -> String {
        let read = |text: windows::core::Result<windows::core::BSTR>| {
            text.map(|text| text.to_string()).unwrap_or_default()
        };
        [
            read(unsafe { node.element.CurrentLocalizedControlType() }),
            read(unsafe { node.element.CurrentName() }),
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
    }
}
