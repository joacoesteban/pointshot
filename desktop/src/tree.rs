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

    // Rounded to whole units, so frames that differ by a fraction count as one.
    fn same(&self, other: &Self) -> bool {
        let units = |frame: &Self| {
            [frame.x, frame.y, frame.width, frame.height].map(|value| value.round() as i64)
        };
        units(self) == units(other)
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
            ) => match above(tree, &node) {
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
                    let child = aim.node.as_ref().and_then(|node| below(tree, node));
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
        let node = wrapper(tree, self.node.as_ref()?);
        let siblings = rendered(tree, tree.children(&tree.parent(&exposed(tree, &node))?));
        let index = siblings.iter().position(|sibling| *sibling == node)?;
        siblings.get(index.checked_add_signed(offset)?).cloned()
    }
}

// A node with no area shows nothing, so the walk passes through it to its children.
fn visible<T: Tree>(tree: &T, node: &T::Node) -> bool {
    tree.frame(node).is_some_and(|frame| frame.rendered())
}

// Nodes on the same frame look alike, as nested containers do, so the walk takes them as one step.
fn twins<T: Tree>(tree: &T, node: &T::Node, other: &T::Node) -> bool {
    matches!((tree.frame(node), tree.frame(other)), (Some(a), Some(b)) if a.same(&b))
}

// The nodes as the walk sees them, those with no area replaced by their children.
fn rendered<T: Tree>(tree: &T, nodes: Vec<T::Node>) -> Vec<T::Node> {
    nodes
        .into_iter()
        .flat_map(|node| match visible(tree, &node) {
            true => vec![node],
            false => rendered(tree, tree.children(&node)),
        })
        .collect()
}

// Above the node, past the ancestors on its frame, then up through those on the frame it lands on.
fn above<T: Tree>(tree: &T, node: &T::Node) -> Option<T::Node> {
    let mut ancestors = std::iter::successors(tree.parent(node), |node| tree.parent(node))
        .filter(|ancestor| visible(tree, ancestor))
        .skip_while(|ancestor| twins(tree, node, ancestor));
    let parent = ancestors.next()?;
    Some(
        ancestors
            .take_while(|ancestor| twins(tree, &parent, ancestor))
            .last()
            .unwrap_or(parent),
    )
}

// The node's only child, when it sits on the same frame, as in nested containers.
fn nested_in<T: Tree>(tree: &T, node: &T::Node) -> Option<T::Node> {
    match rendered(tree, tree.children(node)).as_slice() {
        [child] if twins(tree, node, child) => Some(child.clone()),
        _ => None,
    }
}

fn innermost<T: Tree>(tree: &T, node: T::Node) -> T::Node {
    match nested_in(tree, &node) {
        Some(child) => innermost(tree, child),
        None => node,
    }
}

// The first descendant off the node's frame, past the wrappers and overlays on it, then in as far as its frame goes.
fn below<T: Tree>(tree: &T, node: &T::Node) -> Option<T::Node> {
    fn descend<T: Tree>(tree: &T, on: &T::Node, nodes: Vec<T::Node>) -> Option<T::Node> {
        nodes.into_iter().find_map(
            |node| match visible(tree, &node) && !twins(tree, on, &node) {
                true => Some(innermost(tree, node)),
                false => descend(tree, on, tree.children(&node)),
            },
        )
    }
    descend(tree, node, tree.children(node))
}

// The outermost of the wrappers around the node.
fn wrapper<T: Tree>(tree: &T, node: &T::Node) -> T::Node {
    let parent = std::iter::successors(tree.parent(node), |node| tree.parent(node))
        .find(|ancestor| visible(tree, ancestor));
    match parent {
        Some(parent) if nested_in(tree, &parent).as_ref() == Some(node) => wrapper(tree, &parent),
        _ => node.clone(),
    }
}

// The top of the parents with no area above the node, whose parent's children flatten to the node's siblings.
fn exposed<T: Tree>(tree: &T, node: &T::Node) -> T::Node {
    match tree.parent(node) {
        Some(parent) if !visible(tree, &parent) && tree.parent(&parent).is_some() => {
            exposed(tree, &parent)
        }
        _ => node.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture;

    // 0 is the window, 1 to 3 its children side by side, 4 a child of 2, 5 an empty child of 1.
    // 3 holds 6, with no area, which holds 7 on the frame of 3, which holds 8.
    // 11 is a leaf on the frame of 2, before 4.
    // 9 is a child of 0 between 2 and 3 with no area, whose child 10 shows.
    impl Tree for Fixture {
        type Node = u8;

        fn at(&self, point: Point) -> Option<u8> {
            [8, 7, 6, 4, 10, 1, 2, 3, 0]
                .into_iter()
                .find(|node| self.frame(node).is_some_and(|frame| frame.contains(point)))
        }

        fn parent(&self, node: &u8) -> Option<u8> {
            match node {
                1..=3 | 9 => Some(0),
                4 => Some(2),
                5 => Some(1),
                6 => Some(3),
                7 => Some(6),
                8 => Some(7),
                10 => Some(9),
                11 => Some(2),
                _ => None,
            }
        }

        fn children(&self, node: &u8) -> Vec<u8> {
            match node {
                0 => vec![1, 2, 9, 3],
                1 => vec![5],
                2 => vec![11, 4],
                3 => vec![6],
                6 => vec![7],
                7 => vec![8],
                9 => vec![10],
                _ => vec![],
            }
        }

        fn frame(&self, node: &u8) -> Option<Frame> {
            let (x, width) = match node {
                0 => (0., 300.),
                1 | 5 => (0., 100.),
                2 | 11 => (100., 100.),
                3 | 6 | 7 => (200., 100.),
                8 => (210., 20.),
                9 | 10 => (190., 5.),
                _ => (120., 20.),
            };
            let height = match node {
                5 | 6 | 9 => 0.,
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
    const ON_8: Step = Step::Point(Point { x: 215., y: 10. });

    fn from(node: u8, steps: &[Step]) -> Aim<u8> {
        steps.iter().fold(
            Aim {
                node: Some(node),
                trail: Vec::new(),
            },
            |aim, step| aim.step(&Fixture, *step),
        )
    }

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
    fn siblings_stop_at_the_ends() {
        assert_eq!(aim(&[ON_4, Step::Up, Step::Previous]).node, Some(1));
        assert_eq!(
            aim(&[ON_4, Step::Up, Step::Previous, Step::Previous]).node,
            Some(1)
        );
        assert_eq!(from(3, &[Step::Next]).node, Some(3));
    }

    #[test]
    fn siblings_reach_the_children_of_a_sibling_with_no_area() {
        assert_eq!(aim(&[ON_4, Step::Up, Step::Next]).node, Some(10));
        assert_eq!(aim(&[ON_4, Step::Up, Step::Next, Step::Next]).node, Some(3));
        assert_eq!(from(10, &[Step::Previous]).node, Some(2));
    }

    #[test]
    fn descending_passes_through_a_child_with_no_area() {
        assert_eq!(below(&Fixture, &9), Some(10));
        assert_eq!(rendered(&Fixture, vec![2, 9, 3]), vec![2, 10, 3]);
    }

    #[test]
    fn climbing_passes_over_a_parent_with_no_area() {
        assert_eq!(from(10, &[Step::Up]).node, Some(0));
    }

    #[test]
    fn climbing_lands_on_the_outermost_of_a_frame() {
        assert_eq!(aim(&[ON_8, Step::Up]).node, Some(3));
        assert_eq!(aim(&[ON_8, Step::Up]).trail, vec![8]);
        assert_eq!(aim(&[ON_8, Step::Up, Step::Down]).node, Some(8));
    }

    #[test]
    fn climbing_passes_the_wrappers_on_the_same_frame() {
        assert_eq!(from(7, &[Step::Up]).node, Some(0));
    }

    #[test]
    fn descending_lands_past_the_wrappers() {
        assert_eq!(from(3, &[Step::Down]).node, Some(8));
        assert_eq!(
            from(
                0,
                &[Step::Down, Step::Next, Step::Next, Step::Next, Step::Down]
            )
            .node,
            Some(8)
        );
    }

    #[test]
    fn descending_passes_an_overlay_on_the_same_frame() {
        assert_eq!(from(2, &[Step::Down]).node, Some(4));
    }

    #[test]
    fn siblings_of_an_inner_wrapper_are_those_of_the_outermost() {
        assert_eq!(from(7, &[Step::Previous]).node, Some(10));
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
