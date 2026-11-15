use crate::picker::Source;
use crate::tree::{Frame, Point, Tree};
use anyhow::Context as _;
use image::RgbaImage;
use serde::de::DeserializeOwned;
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt as _, ImageFormat, MapState, Window};
use x11rb::rust_connection::RustConnection;
use zbus::blocking::Connection;
use zbus::zvariant::{DynamicType, OwnedObjectPath, OwnedValue};

const REGISTRY: &str = "org.a11y.atspi.Registry";
const ROOT: &str = "/org/a11y/atspi/accessible/root";
const NULL: &str = "/org/a11y/atspi/null";
const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const COMPONENT: &str = "org.a11y.atspi.Component";
const SCREEN: u32 = 0;
// Bit positions in AT-SPI's state set: ATSPI_STATE_ACTIVE, ATSPI_STATE_SHOWING.
const ACTIVE: u32 = 1;
const SHOWING: u32 = 25;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize, zbus::zvariant::Type)]
pub struct Node {
    bus: String,
    path: OwnedObjectPath,
}

pub struct Accessibility {
    bus: Connection,
    x11: RustConnection,
    root: Window,
    stacking: Atom,
    owner: Atom,
    pid: u32,
}

impl Accessibility {
    pub fn connect() -> anyhow::Result<Self> {
        let address: String = Connection::session()?
            .call_method(
                Some("org.a11y.Bus"),
                "/org/a11y/bus",
                Some("org.a11y.Bus"),
                "GetAddress",
                &(),
            )?
            .body()
            .deserialize()?;
        let bus = zbus::blocking::connection::Builder::address(address.as_str())?.build()?;
        let (x11, screen) = x11rb::connect(None).context("Pointshot needs an X11 session")?;
        let root = x11.setup().roots[screen].root;
        let atom = |name: &[u8]| -> anyhow::Result<Atom> {
            Ok(x11.intern_atom(false, name)?.reply()?.atom)
        };
        let (stacking, owner) = (atom(b"_NET_CLIENT_LIST_STACKING")?, atom(b"_NET_WM_PID")?);
        Ok(Self {
            bus,
            x11,
            root,
            stacking,
            owner,
            pid: std::process::id(),
        })
    }

    // The X server knows the stacking order, which AT-SPI does not expose.
    fn owner_at(&self, at: (i32, i32)) -> Option<u32> {
        let windows: Vec<Window> = self
            .x11
            .get_property(
                false,
                self.root,
                self.stacking,
                AtomEnum::WINDOW,
                0,
                u32::MAX,
            )
            .ok()?
            .reply()
            .ok()?
            .value32()?
            .collect();
        windows.into_iter().rev().find_map(|window| {
            let pid = self.window_pid(window)?;
            (pid != self.pid && self.covers(window, at)).then_some(pid)
        })
    }

    fn window_pid(&self, window: Window) -> Option<u32> {
        self.x11
            .get_property(false, window, self.owner, AtomEnum::CARDINAL, 0, 1)
            .ok()?
            .reply()
            .ok()?
            .value32()?
            .next()
    }

    fn covers(&self, window: Window, (x, y): (i32, i32)) -> bool {
        let viewable = || {
            Some(
                self.x11
                    .get_window_attributes(window)
                    .ok()?
                    .reply()
                    .ok()?
                    .map_state,
            )
        };
        let extent = || {
            let geometry = self.x11.get_geometry(window).ok()?.reply().ok()?;
            let origin = self
                .x11
                .translate_coordinates(window, self.root, 0, 0)
                .ok()?
                .reply()
                .ok()?;
            Some((
                i32::from(origin.dst_x),
                i32::from(origin.dst_y),
                i32::from(geometry.width),
                i32::from(geometry.height),
            ))
        };
        match (viewable(), extent()) {
            (Some(MapState::VIEWABLE), Some((left, top, width, height))) => {
                (left..left + width).contains(&x) && (top..top + height).contains(&y)
            }
            _ => false,
        }
    }

    fn call<B, R>(&self, node: &Node, interface: &str, method: &str, body: &B) -> Option<R>
    where
        B: serde::Serialize + DynamicType,
        R: DeserializeOwned + zbus::zvariant::Type,
    {
        self.bus
            .call_method(
                Some(node.bus.as_str()),
                &node.path,
                Some(interface),
                method,
                body,
            )
            .ok()?
            .body()
            .deserialize()
            .ok()
    }

    fn property<R: TryFrom<OwnedValue>>(&self, node: &Node, name: &str) -> Option<R> {
        let value: OwnedValue = self.call(
            node,
            "org.freedesktop.DBus.Properties",
            "Get",
            &(ACCESSIBLE, name),
        )?;
        R::try_from(value).ok()
    }

    fn states(&self, node: &Node) -> u64 {
        self.call::<_, Vec<u32>>(node, ACCESSIBLE, "GetState", &())
            .map(|words| {
                words
                    .iter()
                    .rev()
                    .fold(0, |states, word| (states << 32) | u64::from(*word))
            })
            .unwrap_or(0)
    }

    fn pid(&self, bus: &str) -> Option<u32> {
        self.bus
            .call_method(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                Some("org.freedesktop.DBus"),
                "GetConnectionUnixProcessID",
                &bus,
            )
            .ok()?
            .body()
            .deserialize()
            .ok()
    }

    fn deepest(&self, node: Node, (x, y): (i32, i32)) -> Node {
        match self.call::<_, Node>(&node, COMPONENT, "GetAccessibleAtPoint", &(x, y, SCREEN)) {
            Some(child) if child.path.as_str() != NULL && child != node => {
                self.deepest(child, (x, y))
            }
            _ => node,
        }
    }

    pub fn raise(&self, _: &Node) {}

    // A window's parent is its application's root, which parent() stops at, so the last ancestor is the window.
    pub fn source(&self, node: &Node) -> Source {
        let name = |node: Option<&Node>| {
            node.and_then(|node| self.property::<String>(node, "Name"))
                .unwrap_or_default()
        };
        let application: Option<Node> = self.call(node, ACCESSIBLE, "GetApplication", &());
        let window = std::iter::successors(Some(node.clone()), |node| self.parent(node)).last();
        Source {
            app: name(application.as_ref()),
            title: name(window.as_ref()),
        }
    }

    pub fn release(&self) {}

    pub fn capture(&self, frame: Frame) -> anyhow::Result<RgbaImage> {
        let root = self
            .x11
            .setup()
            .roots
            .iter()
            .find(|screen| screen.root == self.root)
            .context("the X server lost its root window")?;
        let [x, y, width, height] =
            [frame.x, frame.y, frame.width, frame.height].map(|value| value.round() as i32);
        let (left, top) = (x.max(0), y.max(0));
        let right = (x + width).min(i32::from(root.width_in_pixels));
        let bottom = (y + height).min(i32::from(root.height_in_pixels));
        let (width, height) = (u16::try_from(right - left)?, u16::try_from(bottom - top)?);
        let reply = self
            .x11
            .get_image(
                ImageFormat::Z_PIXMAP,
                root.root,
                i16::try_from(left)?,
                i16::try_from(top)?,
                width,
                height,
                !0,
            )?
            .reply()?;
        let pixels = reply
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|[blue, green, red, _]| [*red, *green, *blue, 255])
            .collect();
        RgbaImage::from_raw(width.into(), height.into(), pixels)
            .context("the X server sent a short image")
    }
}

impl Tree for Accessibility {
    type Node = Node;

    fn at(&self, point: Point) -> Option<Node> {
        let physical = (point.x.round() as i32, point.y.round() as i32);
        let desktop = Node {
            bus: REGISTRY.into(),
            path: OwnedObjectPath::try_from(ROOT).ok()?,
        };
        let owner = self.owner_at(physical)?;
        let windows: Vec<(Node, u64)> = self
            .children(&desktop)
            .into_iter()
            .filter(|app| self.pid(&app.bus) == Some(owner))
            .flat_map(|app| self.children(&app))
            .filter(|window| {
                self.frame(window)
                    .is_some_and(|frame| frame.contains(point))
            })
            .map(|window| {
                let states = self.states(&window);
                (window, states)
            })
            .filter(|(_, states)| states & (1 << SHOWING) != 0)
            .collect();
        let window = windows
            .iter()
            .find(|(_, states)| states & (1 << ACTIVE) != 0)
            .or(windows.last())
            .map(|(window, _)| window.clone())?;
        Some(self.deepest(window, physical))
    }

    fn parent(&self, node: &Node) -> Option<Node> {
        let (bus, path): (String, OwnedObjectPath) = self.property(node, "Parent")?;
        match path.as_str() {
            ROOT | NULL => None,
            _ => Some(Node { bus, path }),
        }
    }

    fn children(&self, node: &Node) -> Vec<Node> {
        self.call(node, ACCESSIBLE, "GetChildren", &())
            .unwrap_or_default()
    }

    fn frame(&self, node: &Node) -> Option<Frame> {
        let (x, y, width, height): (i32, i32, i32, i32) =
            self.call(node, COMPONENT, "GetExtents", &SCREEN)?;
        Some(Frame {
            x: x.into(),
            y: y.into(),
            width: width.into(),
            height: height.into(),
        })
    }

    fn label(&self, node: &Node) -> String {
        let role: String = self
            .call(node, ACCESSIBLE, "GetRoleName", &())
            .unwrap_or_default();
        let name: String = self.property(node, "Name").unwrap_or_default();
        [role, name]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" · ")
    }
}
