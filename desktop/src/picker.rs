use crate::platform::Accessibility;
use crate::tree::{Aim, Frame, Step, Tree};
use image::RgbaImage;
use serde::Serialize;
use std::sync::mpsc;
use tokio::sync::oneshot;

type Node = <Accessibility as Tree>::Node;

type Job = Box<dyn FnOnce(&mut Session) + Send>;

#[derive(Clone, Debug, Serialize)]
pub struct Aimed {
    pub frame: Frame,
    pub label: String,
}

// Where a capture came from: the library files it under the app, titled by the window, as the extension does with sites and pages.
#[derive(Clone, Debug, Default, Serialize)]
pub struct Source {
    pub app: String,
    pub title: String,
}

#[derive(Default)]
struct Session {
    tree: Option<Accessibility>,
    aim: Aim<Node>,
}

impl Session {
    fn connect(&mut self) -> anyhow::Result<()> {
        if self.tree.is_none() {
            self.tree = Some(Accessibility::connect()?);
        }
        self.aim = Aim::default();
        Ok(())
    }

    fn step(&mut self, step: Step) -> Option<Aimed> {
        let tree = self.tree.as_ref()?;
        self.aim = std::mem::take(&mut self.aim).step(tree, step);
        let node = self.aim.node.as_ref()?;
        Some(Aimed {
            frame: tree.frame(node)?,
            label: tree.label(node),
        })
    }

    fn finish(&mut self) -> Source {
        let source = match (&self.tree, &self.aim.node) {
            (Some(tree), Some(node)) => {
                tree.raise(node);
                tree.source(node)
            }
            _ => Source::default(),
        };
        self.tree.iter().for_each(Accessibility::release);
        self.aim = Aim::default();
        source
    }

    fn capture(&self, frame: Frame) -> anyhow::Result<RgbaImage> {
        self.tree
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("the accessibility tree is not connected"))?
            .capture(frame)
    }
}

// The platforms' accessibility handles are bound to the thread that made them, so one thread owns them and runs every job.
pub struct Picker {
    jobs: mpsc::Sender<Job>,
}

impl Picker {
    pub fn spawn() -> Self {
        let (jobs, queue) = mpsc::channel::<Job>();
        std::thread::spawn(move || {
            let mut session = Session::default();
            queue.into_iter().for_each(|job| job(&mut session));
        });
        Self { jobs }
    }

    async fn run<R: Send + 'static>(
        &self,
        job: impl FnOnce(&mut Session) -> R + Send + 'static,
    ) -> R {
        let (reply, answer) = oneshot::channel();
        self.jobs
            .send(Box::new(move |session| {
                reply.send(job(session)).ok();
            }))
            .expect("the picker thread lives as long as the app");
        answer.await.expect("the picker thread answers every job")
    }

    pub async fn connect(&self) -> anyhow::Result<()> {
        self.run(Session::connect).await
    }

    pub async fn step(&self, step: Step) -> Option<Aimed> {
        self.run(move |session| session.step(step)).await
    }

    pub async fn finish(&self) -> Source {
        self.run(Session::finish).await
    }

    pub async fn capture(&self, frame: Frame) -> anyhow::Result<RgbaImage> {
        self.run(move |session| session.capture(frame)).await
    }
}
