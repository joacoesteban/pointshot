use crate::tree::Tree;
use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::{declare_TCFType, impl_TCFType};
use core_graphics::display::CGDisplay;
use core_graphics::geometry::{CGPoint, CGRect, CGSize};
use core_graphics::window::{
    kCGNullWindowID, kCGWindowBounds, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
};
use gpui::{Bounds, Pixels, PlatformDisplay, Point, point, px, size};
use image::RgbaImage;
use objc2_app_kit::{NSView, NSWindowStyleMask};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::cell::RefCell;
use std::collections::HashSet;
use std::ffi::c_void;
use std::mem::MaybeUninit;

#[repr(C)]
pub struct OpaqueElement(c_void);
type ElementRef = *const OpaqueElement;

declare_TCFType!(Element, ElementRef);
impl_TCFType!(Element, ElementRef, AXUIElementGetTypeID);

// AXValueType constants from HIServices' AXValue.h.
const CG_POINT: u32 = 1;
const CG_SIZE: u32 = 2;
const SUCCESS: i32 = 0;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementGetTypeID() -> core_foundation::base::CFTypeID;
    fn AXUIElementCreateApplication(pid: i32) -> ElementRef;
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
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowListCopyWindowInfo(options: u32, relative_to: u32) -> CFArrayRef;
}

pub struct Accessibility {
    pid: i32,
    exposed: RefCell<HashSet<i32>>,
}

impl Accessibility {
    pub fn connect() -> anyhow::Result<Self> {
        let prompt = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let options = CFDictionary::from_CFType_pairs(&[(prompt, CFBoolean::true_value())]);
        match unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) } {
            true => Ok(Self {
                pid: std::process::id() as i32,
                exposed: RefCell::default(),
            }),
            false => anyhow::bail!(
                "Pointshot needs the Accessibility permission. Allow it in System Settings, Privacy & Security, Accessibility, then try again."
            ),
        }
    }

    fn owner_at(&self, point: Point<Pixels>) -> Option<i32> {
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
            match (pid == self.pid, frame_of(bounds).contains(&point)) {
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

    // gpui places every macOS display at the origin, so its place on the desktop comes from CoreGraphics.
    pub fn origin(display: &dyn PlatformDisplay) -> Point<Pixels> {
        let CGRect { origin, .. } = CGDisplay::new(u64::from(display.id()) as u32).bounds();
        point(px(origin.x as f32), px(origin.y as f32))
    }

    pub fn rescale(&self, _: f32) {}

    pub fn focus(&self, _: &gpui::Window) {}

    // AppKit keeps titled windows below the menu bar, and gpui opens every window titled.
    // Changing the style mask drops the key focus, so it goes back to gpui's view.
    pub fn place(&self, window: &gpui::Window) {
        if let Some(view) = view(window)
            && let Some(native) = view.window()
            && let Some(screen) = native.screen()
        {
            native.setStyleMask(NSWindowStyleMask::Borderless);
            native.setFrame_display(screen.frame(), true);
            native.makeFirstResponder(Some(view));
        }
    }

    pub fn capture(&self, frame: Bounds<Pixels>) -> anyhow::Result<RgbaImage> {
        crate::platform::xcap_capture(frame, 1.)
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

fn view(window: &gpui::Window) -> Option<&NSView> {
    match HasWindowHandle::window_handle(window).map(|handle| handle.as_raw()) {
        Ok(RawWindowHandle::AppKit(handle)) => {
            Some(unsafe { handle.ns_view.cast::<NSView>().as_ref() })
        }
        _ => None,
    }
}

fn frame_of(
    CGRect {
        origin,
        size: extent,
    }: CGRect,
) -> Bounds<Pixels> {
    Bounds::new(
        point(px(origin.x as f32), px(origin.y as f32)),
        size(px(extent.width as f32), px(extent.height as f32)),
    )
}

impl Tree for Accessibility {
    type Node = Element;

    fn at(&self, point: Point<Pixels>) -> Option<Element> {
        let pid = self.owner_at(point)?;
        let application =
            unsafe { Element::wrap_under_create_rule(AXUIElementCreateApplication(pid)) };
        self.expose(&application, pid);
        let mut element: ElementRef = std::ptr::null();
        match unsafe {
            AXUIElementCopyElementAtPosition(
                application.as_concrete_TypeRef(),
                f32::from(point.x),
                f32::from(point.y),
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

    fn frame(&self, node: &Element) -> Option<Bounds<Pixels>> {
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
