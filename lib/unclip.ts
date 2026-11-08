import { match, P } from 'ts-pattern'
import { Dom } from './dom'
import { InlineStyle } from './inline-style'

const SCROLLING = ['auto', 'scroll']
const CLIPPING = [...SCROLLING, 'hidden', 'clip']
// Sub-pixel layout leaves rects a fraction past their container.
const TOLERANCE = 1

const clips = (element: Element, kinds: readonly string[]) => {
  const { overflowX, overflowY } = Dom.style(element)
  return kinds.includes(overflowX) || kinds.includes(overflowY)
}

const scrolls = (element: Element) =>
  clips(element, SCROLLING) &&
  (element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth)

const cuts = (ancestor: Element, element: Element) => {
  const outer = Dom.rect(ancestor)
  const inner = Dom.rect(element)
  return (
    clips(ancestor, CLIPPING) &&
    (inner.left < outer.left - TOLERANCE ||
      inner.top < outer.top - TOLERANCE ||
      inner.left + inner.width > outer.left + outer.width + TOLERANCE ||
      inner.top + inner.height > outer.top + outer.height + TOLERANCE)
  )
}

const layoutOf = (element: Element) =>
  match(Dom.parent(element))
    .with(P.nonNullable, (parent) => {
      const { display, flexDirection } = Dom.style(parent)
      return { display, flexDirection }
    })
    .otherwise(() => ({ display: 'block', flexDirection: 'row' }))

// Lets the element grow to its content: an absolute box stretched between insets, a column flex item and a grid item would otherwise keep the size their container gives them.
const grown = (element: Element): Record<string, string> => ({
  overflow: 'visible',
  height: 'auto',
  'max-height': 'none',
  ...match(element.scrollWidth > element.clientWidth)
    .with(true, () => ({ width: 'max-content', 'max-width': 'none' }))
    .otherwise(() => ({})),
  ...match(Dom.style(element).position)
    .with('absolute', 'fixed', () => ({ bottom: 'auto' }))
    .otherwise(() => ({})),
  ...match(layoutOf(element))
    .with(
      {
        display: P.union('flex', 'inline-flex'),
        flexDirection: P.string.startsWith('column'),
      },
      () => ({ flex: 'none' }),
    )
    .with({ display: P.union('grid', 'inline-grid') }, () => ({
      'align-self': 'start',
    }))
    .otherwise(() => ({})),
})

const open = (element: Element) => {
  const { scrollLeft, scrollTop } = element
  const restore = InlineStyle.override([element], grown(element))
  return () => {
    restore()
    element.scrollLeft = scrollLeft
    element.scrollTop = scrollTop
  }
}

// Opening a container grows it, which can push the element past the next clipping ancestor, so ancestors are opened until none cuts it.
const expand = (
  element: Element,
  lineage: readonly Element[],
  opened: readonly Element[],
  next: readonly Element[],
): (() => void)[] =>
  match(next)
    .with([], () => [])
    .otherwise((next) => {
      const restores = next.map(open)
      const done = [...opened, ...next]
      return [
        ...expand(
          element,
          lineage,
          done,
          lineage.filter(
            (ancestor) => !done.includes(ancestor) && cuts(ancestor, element),
          ),
        ),
        ...restores.reverse(),
      ]
    })

export class Unclip {
  // Lays out an element that sits in, or is, a scrolling container at its full size, and returns a function that puts the page back.
  // Only scrolling containers start it: content hidden by overflow: hidden is left hidden.
  static open(element: Element): () => void {
    const lineage = Dom.ancestors(element)
    const restores = expand(
      element,
      lineage,
      [],
      [
        ...[element].filter(scrolls),
        ...lineage.filter(
          (ancestor) => scrolls(ancestor) && cuts(ancestor, element),
        ),
      ],
    )
    return () => {
      restores.forEach((restore) => {
        restore()
      })
    }
  }
}
