use crate::permissions::{Permission, Permissions};
use crate::picker::Source;
use crate::stage::Screen;
use crate::tree::{Frame, Point, Tree};
use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::{declare_TCFType, impl_TCFType};
use core_graphics::geometry::{CGPoint, CGRect, CGSize};
use core_graphics::window::{
    kCGNullWindowID, kCGWindowBounds, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
};
use image::RgbaImage;
use objc2::rc::Retained;
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWindow, NSWorkspace};
use std::cell::RefCell;
use std::collections::HashSet;
use std::ffi::c_void;
use std::mem::MaybeUninit;
use tauri::{LogicalPosition, WebviewWindow};

#[repr(C)]
pub struct OpaqueElement(c_void);
type ElementRef = *const OpaqueElement;

declare_TCFType!(Element, ElementRef);
impl_TCFType!(Element, ElementRef, AXUIElementGetTypeID);

// AXValueType constants from HIServices' AXValue.h.
const CG_POINT: u32 = 1;
const CG_SIZE: u32 = 2;
const SUCCESS: i32 = 0;
// The menu bar sits at kCGMainMenuWindowLevel (24), above Tauri's always-on-top level, so the overlay takes the pop-up menu level.
const OVER_MENU_BAR: isize = 101;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementGetTypeID() -> core_foundation::base::CFTypeID;
    fn AXUIElementCreateApplication(pid: i32) -> ElementRef;
    fn AXUIElementGetPid(element: ElementRef, pid: *mut i32) -> i32;
    fn AXUIElementCopyElementAtPosition(
        application: ElementRef,
        x: f32,
        y: f32,
        element: *mut ElementRef,
    ) -> i32;
    fn AXUIElementCopyAttributeValue(
        element: ElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: ElementRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> i32;
    fn AXValueGetValue(value: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowListCopyWindowInfo(options: u32, relative_to: u32) -> CFArrayRef;
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

pub struct Accessibility {
    pid: i32,
    exposed: RefCell<HashSet<i32>>,
    front: RefCell<Option<Retained<NSRunningApplication>>>,
}

// Lists Pointshot in the Accessibility pane, and prompts the first time.
fn trusted() -> bool {
    let prompt = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
    let options = CFDictionary::from_CFType_pairs(&[(prompt, CFBoolean::true_value())]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

pub fn permissions() -> Permissions {
    Permissions {
        accessibility: unsafe { AXIsProcessTrusted() },
        screen: unsafe { CGPreflightScreenCaptureAccess() },
    }
}

// A request prompts only the first time, so the pane opens too.
pub fn grant(permission: Permission) {
    let pane = match permission {
        Permission::Accessibility => {
            trusted();
            "Privacy_Accessibility"
        }
        Permission::Screen => {
            unsafe { CGRequestScreenCaptureAccess() };
            "Privacy_ScreenCapture"
        }
    };
    std::process::Command::new("open")
        .arg(format!(
            "x-apple.systempreferences:com.apple.preference.security?{pane}"
        ))
        .spawn()
        .ok();
}

impl Accessibility {
    pub fn connect() -> anyhow::Result<Self> {
        match trusted() {
            true => Ok(Self {
                pid: std::process::id() as i32,
                exposed: RefCell::default(),
                front: RefCell::default(),
            }),
            false => anyhow::bail!(
                "Pointshot needs the Accessibility permission. Allow it in System Settings, Privacy & Security, Accessibility, then try again."
            ),
        }
    }

    fn owner_at(&self, point: Point) -> Option<i32> {
        let windows: CFArray<CFDictionary<CFString, CFType>> = unsafe {
            CFArray::wrap_under_create_rule(CGWindowListCopyWindowInfo(
                kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
                kCGNullWindowID,
            ))
        };
        let owner_key = unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerPID) };
        let bounds_key = unsafe { CFString::wrap_under_get_rule(kCGWindowBounds) };
        windows.iter().find_map(|window| {
            let pid = window.find(&owner_key)?.downcast::<CFNumber>()?.to_i32()?;
            let bounds = CGRect::from_dict_representation(
                &window.find(&bounds_key)?.downcast::<CFDictionary>()?,
            )?;
            match (pid == self.pid, frame_of(bounds).contains(point)) {
                (false, true) => Some(pid),
                _ => None,
            }
        })
    }

    // Electron builds its accessibility tree only for a client that sets this on the application, about a second after it does.
    fn expose(&self, application: &Element, pid: i32) {
        if self.exposed.borrow_mut().insert(pid) {
            manual(application, CFBoolean::true_value());
        }
    }

    // Electron's getter does not report the flag, so an app that had it on before the pick loses it too.
    pub fn release(&self) {
        self.exposed.take().into_iter().for_each(|pid| {
            let application =
                unsafe { Element::wrap_under_create_rule(AXUIElementCreateApplication(pid)) };
            manual(&application, CFBoolean::false_value());
        });
    }

    fn attribute(&self, node: &Element, name: &'static str) -> Option<CFType> {
        let mut value: CFTypeRef = std::ptr::null();
        let name = CFString::from_static_string(name);
        match unsafe {
            AXUIElementCopyAttributeValue(
                node.as_concrete_TypeRef(),
                name.as_concrete_TypeRef(),
                &mut value,
            )
        } {
            SUCCESS if !value.is_null() => Some(unsafe { CFType::wrap_under_create_rule(value) }),
            _ => None,
        }
    }

    fn value<T>(&self, node: &Element, name: &'static str, kind: u32) -> Option<T> {
        let attribute = self.attribute(node, name)?;
        let mut out = MaybeUninit::<T>::uninit();
        match unsafe { AXValueGetValue(attribute.as_CFTypeRef(), kind, out.as_mut_ptr().cast()) } {
            true => Some(unsafe { out.assume_init() }),
            false => None,
        }
    }

    fn text(&self, node: &Element, name: &'static str) -> String {
        self.attribute(node, name)
            .and_then(|value| value.downcast::<CFString>())
            .map(|value| value.to_string())
            .unwrap_or_default()
    }

    fn application(&self, node: &Element) -> Option<Retained<NSRunningApplication>> {
        let mut pid = 0;
        match unsafe { AXUIElementGetPid(node.as_concrete_TypeRef(), &mut pid) } {
            SUCCESS => NSRunningApplication::runningApplicationWithProcessIdentifier(pid),
            _ => None,
        }
    }

    // Pointshot itself is in front when the library's Capture button starts the pick.
    pub fn hold(&self) {
        let front = NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .filter(|application| application.processIdentifier() != self.pid);
        self.front.replace(front);
    }

    // The overlay activates Pointshot, so the app in front before it is activated again before the capture shows it inactive. Raising the app under the frame instead would reorder windows the user never picked.
    #[allow(deprecated)]
    pub fn raise(&self, node: &Element) {
        if let Some(application) = self.front.take().or_else(|| self.application(node)) {
            application.activateWithOptions(NSApplicationActivationOptions::empty());
        }
    }

    pub fn source(&self, node: &Element) -> Source {
        Source {
            app: self
                .application(node)
                .and_then(|application| application.localizedName())
                .map(|name| name.to_string())
                .unwrap_or_default(),
            title: self
                .attribute(node, "AXWindow")
                .and_then(|window| window.downcast::<Element>())
                .map(|window| self.text(&window, "AXTitle"))
                .unwrap_or_default(),
        }
    }

    pub fn capture(&self, frame: Frame) -> anyhow::Result<RgbaImage> {
        crate::platform::xcap_capture(frame)
    }
}

fn manual(application: &Element, value: CFBoolean) {
    let name = CFString::from_static_string("AXManualAccessibility");
    unsafe {
        AXUIElementSetAttributeValue(
            application.as_concrete_TypeRef(),
            name.as_concrete_TypeRef(),
            value.as_CFTypeRef(),
        )
    };
}

pub fn pixels_per_unit(scale: f64) -> f64 {
    scale
}

pub fn place(window: &WebviewWindow, screen: &Screen) -> tauri::Result<()> {
    window.set_position(LogicalPosition::new(
        f64::from(screen.origin.x) / screen.scale,
        f64::from(screen.origin.y) / screen.scale,
    ))?;
    window.set_size(screen.size.to_logical::<f64>(screen.scale))?;
    let target = window.clone();
    window.run_on_main_thread(move || {
        if let Ok(native) = target.ns_window() {
            unsafe { &*native.cast::<NSWindow>() }.setLevel(OVER_MENU_BAR);
        }
    })
}

fn frame_of(
    CGRect {
        origin,
        size: extent,
    }: CGRect,
) -> Frame {
    Frame {
        x: origin.x,
        y: origin.y,
        width: extent.width,
        height: extent.height,
    }
}

impl Tree for Accessibility {
    type Node = Element;

    fn at(&self, point: Point) -> Option<Element> {
        let pid = self.owner_at(point)?;
        let application =
            unsafe { Element::wrap_under_create_rule(AXUIElementCreateApplication(pid)) };
        self.expose(&application, pid);
        let mut element: ElementRef = std::ptr::null();
        match unsafe {
            AXUIElementCopyElementAtPosition(
                application.as_concrete_TypeRef(),
                point.x as f32,
                point.y as f32,
                &mut element,
            )
        } {
            SUCCESS if !element.is_null() => {
                Some(unsafe { Element::wrap_under_create_rule(element) })
            }
            _ => None,
        }
    }

    fn parent(&self, node: &Element) -> Option<Element> {
        let parent = self.attribute(node, "AXParent")?.downcast::<Element>()?;
        match self.text(&parent, "AXRole").as_str() {
            "AXApplication" => None,
            _ => Some(parent),
        }
    }

    fn children(&self, node: &Element) -> Vec<Element> {
        self.attribute(node, "AXChildren")
            .and_then(|children| children.downcast::<CFArray>())
            .map(|children| {
                children
                    .iter()
                    .map(|child| unsafe { Element::wrap_under_get_rule(*child as ElementRef) })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn frame(&self, node: &Element) -> Option<Frame> {
        let origin: CGPoint = self.value(node, "AXPosition", CG_POINT)?;
        let extent: CGSize = self.value(node, "AXSize", CG_SIZE)?;
        Some(frame_of(CGRect::new(&origin, &extent)))
    }

    fn label(&self, node: &Element) -> String {
        [
            self.text(node, "AXRoleDescription"),
            self.text(node, "AXTitle"),
            self.text(node, "AXDescription"),
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
    }
}
