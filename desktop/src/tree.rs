use serde::{Deserialize, Serialize};

// In the platform's screen units, from the top-left corner of the main display: points on macOS, physical pixels elsewhere.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Frame {
    pub fn contains(&self, Point { x, y }: Point) -> bool {
        (self.x..self.x + self.width).contains(&x) && (self.y..self.y + self.height).contains(&y)
    }

    pub fn center(&self) -> Point {
        Point {
            x: self.x + self.width / 2.,
            y: self.y + self.height / 2.,
        }
    }

    fn rendered(&self) -> bool {
        self.width > 0. && self.height > 0.
    }
}

pub trait Tree {
    type Node: Clone + PartialEq;

    fn at(&self, point: Point) -> Option<Self::Node>;
    fn parent(&self, node: &Self::Node) -> Option<Self::Node>;
    fn children(&self, node: &Self::Node) -> Vec<Self::Node>;
    fn frame(&self, node: &Self::Node) -> Option<Frame>;
    fn label(&self, node: &Self::Node) -> String;

    // Every platform's parent() stops below the application or the desktop, so the last ancestor is the top-level window.
    fn window(&self, node: &Self::Node) -> Self::Node {
        std::iter::successors(Some(node.clone()), |node| self.parent(node))
            .last()
            .unwrap_or_else(|| node.clone())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Aim<N> {
    pub node: Option<N>,
    pub trail: Vec<N>,
}

impl<N> Default for Aim<N> {
    fn default() -> Self {
        Self {
            node: None,
            trail: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Step {
    Point(Point),
    Up,
    Down,
    Previous,
    Next,
}

impl<N: Clone + PartialEq> Aim<N> {
    pub fn step<T: Tree<Node = N>>(self, tree: &T, step: Step) -> Self {
        match (self, step) {
            (_, Step::Point(point)) => Self {
                node: tree.at(point),
                trail: Vec::new(),
            },
            (
                Self {
                    node: Some(node),
                    trail,
                },
                Step::Up,
            ) => match tree.parent(&node) {
                Some(parent) => Self {
                    node: Some(parent),
                    trail: [vec![node], trail].concat(),
                },
                None => Self {
                    node: Some(node),
                    trail,
                },
            },
            (aim @ Self { node: Some(_), .. }, Step::Down) => match aim.trail.split_first() {
                Some((child, rest)) => Self {
                    node: Some(child.clone()),
                    trail: rest.to_vec(),
                },
                None => {
                    let child = aim
                        .node
                        .as_ref()
                        .and_then(|node| rendered(tree, tree.children(node)).into_iter().next());
                    aim.land(child)
                }
            },
            (aim @ Self { node: Some(_), .. }, Step::Previous) => {
                let sibling = aim.sibling(tree, -1);
                aim.land(sibling)
            }
            (aim @ Self { node: Some(_), .. }, Step::Next) => {
                let sibling = aim.sibling(tree, 1);
                aim.land(sibling)
            }
            (aim, _) => aim,
        }
    }

    fn land(self, node: Option<N>) -> Self {
        match node {
            Some(node) => Self {
                node: Some(node),
                trail: Vec::new(),
            },
            None => self,
        }
    }

    fn sibling<T: Tree<Node = N>>(&self, tree: &T, offset: isize) -> Option<N> {
        let node = self.node.as_ref()?;
        let siblings = rendered(tree, tree.children(&tree.parent(node)?));
        let index = siblings.iter().position(|sibling| sibling == node)?;
        siblings.get(index.checked_add_signed(offset)?).cloned()
    }
}

fn rendered<T: Tree>(tree: &T, nodes: Vec<T::Node>) -> Vec<T::Node> {
    nodes
        .into_iter()
        .filter(|node| tree.frame(node).is_some_and(|frame| frame.rendered()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture;

    // 0 is the window, 1 to 3 its children side by side, 4 a child of 2, 5 an empty child of 1.
    impl Tree for Fixture {
        type Node = u8;

        fn at(&self, point: Point) -> Option<u8> {
            [4, 1, 2, 3, 0]
                .into_iter()
                .find(|node| self.frame(node).is_some_and(|frame| frame.contains(point)))
        }

        fn parent(&self, node: &u8) -> Option<u8> {
            match node {
                1..=3 => Some(0),
                4 => Some(2),
                5 => Some(1),
                _ => None,
            }
        }

        fn children(&self, node: &u8) -> Vec<u8> {
            match node {
                0 => vec![1, 2, 3],
                1 => vec![5],
                2 => vec![4],
                _ => vec![],
            }
        }

        fn frame(&self, node: &u8) -> Option<Frame> {
            let (x, width) = match node {
                0 => (0., 300.),
                1 | 5 => (0., 100.),
                2 => (100., 100.),
                3 => (200., 100.),
                _ => (120., 20.),
            };
            let height = match node {
                5 => 0.,
                _ => 100.,
            };
            Some(Frame {
                x,
                y: 0.,
                width,
                height,
            })
        }

        fn label(&self, node: &u8) -> String {
            node.to_string()
        }
    }

    fn aim(steps: &[Step]) -> Aim<u8> {
        steps
            .iter()
            .fold(Aim::default(), |aim, step| aim.step(&Fixture, *step))
    }

    const ON_4: Step = Step::Point(Point { x: 125., y: 10. });

    #[test]
    fn pointing_picks_the_deepest_node() {
        assert_eq!(aim(&[ON_4]).node, Some(4));
    }

    #[test]
    fn climbing_keeps_the_trail_down() {
        assert_eq!(aim(&[ON_4, Step::Up, Step::Up]).trail, vec![2, 4]);
        assert_eq!(aim(&[ON_4, Step::Up, Step::Up, Step::Down]).node, Some(2));
        assert_eq!(
            aim(&[ON_4, Step::Up, Step::Up, Step::Down, Step::Down]).node,
            Some(4)
        );
    }

    #[test]
    fn climbing_stops_at_the_window() {
        assert_eq!(aim(&[ON_4, Step::Up, Step::Up, Step::Up]).node, Some(0));
    }

    #[test]
    fn siblings_skip_nothing_and_stop_at_the_ends() {
        assert_eq!(aim(&[ON_4, Step::Up, Step::Next]).node, Some(3));
        assert_eq!(aim(&[ON_4, Step::Up, Step::Next, Step::Next]).node, Some(3));
        assert_eq!(
            aim(&[ON_4, Step::Up, Step::Previous, Step::Previous]).node,
            Some(1)
        );
    }

    #[test]
    fn descending_skips_empty_children() {
        assert_eq!(
            aim(&[ON_4, Step::Up, Step::Previous, Step::Down]).node,
            Some(1)
        );
    }

    #[test]
    fn walking_from_nothing_stays_on_nothing() {
        assert_eq!(aim(&[Step::Up, Step::Down, Step::Next]), Aim::default());
    }

    #[test]
    fn finds_the_window_above_a_node() {
        assert_eq!(Fixture.window(&4), 0);
        assert_eq!(Fixture.window(&0), 0);
    }
}
