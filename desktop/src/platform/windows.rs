use crate::picker::Source;
use crate::tree::{Frame, Point, Tree};
use image::RgbaImage;
use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
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
    pid: u32,
}

impl Accessibility {
    pub fn connect() -> anyhow::Result<Self> {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let automation: IUIAutomation =
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
        let walker = unsafe { automation.ControlViewWalker()? };
        Ok(Self {
            automation,
            walker,
            pid: std::process::id(),
        })
    }

    fn node(&self, element: IUIAutomationElement) -> Node {
        Node {
            element,
            automation: self.automation.clone(),
        }
    }

    fn foreign(&self, window: HWND, point: Point) -> bool {
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
            && frame_of(rect).contains(point)
    }

    fn window_at(&self, point: Point) -> Option<HWND> {
        std::iter::successors(unsafe { GetTopWindow(None) }.ok(), |window| unsafe {
            GetWindow(*window, GW_HWNDNEXT).ok()
        })
        .find(|window| self.foreign(*window, point))
    }

    fn deepest(&self, node: Node, point: Point) -> Node {
        let inside = self
            .children(&node)
            .into_iter()
            .rev()
            .find(|child| self.frame(child).is_some_and(|frame| frame.contains(point)));
        match inside {
            Some(child) => self.deepest(child, point),
            None => node,
        }
    }

    pub fn hold(&self) {}

    pub fn raise(&self, _: &Node) {}

    pub fn source(&self, node: &Node) -> Source {
        Source {
            app: unsafe { node.element.CurrentProcessId() }
                .ok()
                .and_then(|pid| u32::try_from(pid).ok())
                .and_then(process_name)
                .unwrap_or_default(),
            title: unsafe { self.window(node).element.CurrentName() }
                .ok()
                .map(|name| name.to_string())
                .unwrap_or_default(),
        }
    }

    pub fn release(&self) {}

    pub fn capture(&self, frame: Frame) -> anyhow::Result<RgbaImage> {
        crate::platform::xcap_capture(frame)
    }
}

fn process_name(pid: u32) -> Option<String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut path = [0u16; 1024];
    let mut length = path.len() as u32;
    let named = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(path.as_mut_ptr()),
            &mut length,
        )
    };
    unsafe { CloseHandle(process) }.ok();
    named.ok()?;
    std::path::Path::new(&String::from_utf16_lossy(&path[..length as usize]))
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
}

fn frame_of(
    RECT {
        left,
        top,
        right,
        bottom,
    }: RECT,
) -> Frame {
    Frame {
        x: left.into(),
        y: top.into(),
        width: (right - left).into(),
        height: (bottom - top).into(),
    }
}

impl Tree for Accessibility {
    type Node = Node;

    fn at(&self, point: Point) -> Option<Node> {
        let window = self.window_at(point)?;
        let root = unsafe { self.automation.ElementFromHandle(window) }.ok()?;
        Some(self.deepest(self.node(root), point))
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

    fn frame(&self, node: &Node) -> Option<Frame> {
        unsafe { node.element.CurrentBoundingRectangle() }
            .ok()
            .map(frame_of)
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
