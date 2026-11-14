mod overlay;
mod platform;
mod shots;
mod tree;

fn main() {
    gpui_platform::application().run(|cx| {
        shots::open(cx).expect("the main window opens");
        cx.activate(true);
    });
}
