// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Aim, step } from './picker'

type Box = readonly [left: number, top: number, width: number, height: number]

const make = (tag: string, id: string, ...children: Element[]) => {
  const element = document.createElement(tag)
  element.id = id
  element.append(...children)
  return element
}

// Elements left out have no box, as under display: none or display: contents.
const layout = (boxes: ReadonlyMap<Element, Box>) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return new DOMRect(...(boxes.get(this) ?? [0, 0, 0, 0]))
    },
  )
}

// section holds a, an empty div, and b, which holds c.
const build = () => {
  const c = make('span', 'c')
  const b = make('div', 'b', c)
  const a = make('div', 'a')
  const empty = make('div', 'empty')
  const section = make('section', 'section', a, empty, b)
  document.body.replaceChildren(section)
  layout(
    new Map<Element, Box>([
      [section, [0, 0, 300, 200]],
      [a, [0, 0, 300, 100]],
      [empty, [0, 100, 300, 0]],
      [b, [0, 100, 300, 100]],
      [c, [10, 110, 50, 20]],
    ]),
  )
  return { section, a, empty, b, c }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('step', () => {
  it('point lands on the element and resets the trail', () => {
    const { a, b, c } = build()
    const aim: Aim = { element: c, trail: [b] }
    expect(step(aim, { kind: 'point', element: a })).toEqual({
      element: a,
      trail: [],
    })
  })

  it('up climbs to the parent and remembers the element it left', () => {
    const { b, c } = build()
    expect(step({ element: c, trail: [] }, { kind: 'up' })).toEqual({
      element: b,
      trail: [c],
    })
  })

  it('up stays put instead of climbing to BODY or HTML', () => {
    const { section } = build()
    const aim: Aim = { element: section, trail: [] }
    expect(step(aim, { kind: 'up' })).toBe(aim)
    const onBody: Aim = { element: document.body, trail: [] }
    expect(step(onBody, { kind: 'up' })).toBe(onBody)
  })

  it('down pops the trail back to the element it climbed from', () => {
    const { b, c } = build()
    expect(step({ element: b, trail: [c] }, { kind: 'down' })).toEqual({
      element: c,
      trail: [],
    })
  })

  it('down with an empty trail goes to the first child with an area', () => {
    const { section, a } = build()
    expect(step({ element: section, trail: [] }, { kind: 'down' })).toEqual({
      element: a,
      trail: [],
    })
  })

  it('next and previous move between siblings, skipping those with no area', () => {
    const { a, b } = build()
    expect(step({ element: a, trail: [] }, { kind: 'next' })).toEqual({
      element: b,
      trail: [],
    })
    expect(step({ element: b, trail: [] }, { kind: 'previous' })).toEqual({
      element: a,
      trail: [],
    })
  })

  it('next and previous stay put at the ends', () => {
    const { a, b } = build()
    const first: Aim = { element: a, trail: [] }
    const last: Aim = { element: b, trail: [] }
    expect(step(first, { kind: 'previous' })).toBe(first)
    expect(step(last, { kind: 'next' })).toBe(last)
  })
})

describe('step through elements with no area', () => {
  // section holds a, then a flat div, 0px tall, whose child overflows it, then b.
  const build = () => {
    const inside = make('div', 'inside')
    const flat = make('div', 'flat', inside)
    const a = make('div', 'a')
    const b = make('div', 'b')
    const section = make('section', 'section', a, flat, b)
    document.body.replaceChildren(section)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 300]],
        [a, [0, 0, 300, 100]],
        [flat, [0, 100, 300, 0]],
        [inside, [0, 100, 300, 100]],
        [b, [0, 200, 300, 100]],
      ]),
    )
    return { section, a, flat, inside, b }
  }

  it('siblings reach the children of a sibling with no area', () => {
    const { a, inside, b } = build()
    expect(step({ element: a, trail: [] }, { kind: 'next' }).element).toBe(
      inside,
    )
    expect(step({ element: inside, trail: [] }, { kind: 'next' }).element).toBe(
      b,
    )
    expect(
      step({ element: inside, trail: [] }, { kind: 'previous' }).element,
    ).toBe(a)
  })

  it('down passes through a child with no area', () => {
    const { section, flat, inside } = build()
    section.replaceChildren(flat)
    expect(
      step({ element: section, trail: [] }, { kind: 'down' }).element,
    ).toBe(inside)
  })

  it('up passes over a parent with no area', () => {
    const { section, inside } = build()
    expect(step({ element: inside, trail: [] }, { kind: 'up' }).element).toBe(
      section,
    )
  })

  it('does not look inside an element with no height that clips', () => {
    const { section, a, flat, b } = build()
    // happy-dom leaves the overflow shorthand unexpanded, so this sets the axis itself.
    flat.style.overflowY = 'hidden'
    expect(step({ element: a, trail: [] }, { kind: 'next' }).element).toBe(b)
    expect(step({ element: b, trail: [] }, { kind: 'previous' }).element).toBe(
      a,
    )
    section.replaceChildren(flat)
    const aim: Aim = { element: section, trail: [] }
    expect(step(aim, { kind: 'down' })).toBe(aim)
  })

  it('next and previous stay put on an element with no area', () => {
    const { flat } = build()
    const aim: Aim = { element: flat, trail: [] }
    expect(step(aim, { kind: 'next' })).toBe(aim)
    expect(step(aim, { kind: 'previous' })).toBe(aim)
  })

  it('does not look inside display: none', () => {
    const { section, a, b } = build()
    const ghost = make('div', 'ghost')
    const gone = make('div', 'gone', ghost)
    gone.style.display = 'none'
    section.replaceChildren(a, gone, b)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 300]],
        [a, [0, 0, 300, 100]],
        [ghost, [0, 100, 300, 100]],
        [b, [0, 200, 300, 100]],
      ]),
    )
    expect(step({ element: a, trail: [] }, { kind: 'next' }).element).toBe(b)
  })
})

describe('step over elements on the same box', () => {
  // section holds a and outer, which wraps middle, which wraps card, all on one box, and card holds title.
  const build = () => {
    const title = make('h2', 'title')
    const card = make('div', 'card', title)
    const middle = make('div', 'middle', card)
    const outer = make('div', 'outer', middle)
    const a = make('div', 'a')
    const section = make('section', 'section', a, outer)
    document.body.replaceChildren(section)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 200]],
        [a, [0, 0, 300, 100]],
        [outer, [0, 100, 300, 100]],
        [middle, [0, 100, 300, 100]],
        [card, [0, 100, 300, 100]],
        [title, [10, 110, 100, 20]],
      ]),
    )
    return { section, a, outer, middle, card, title }
  }

  it('up passes the wrappers on the same box', () => {
    const { section, card } = build()
    expect(step({ element: card, trail: [] }, { kind: 'up' })).toEqual({
      element: section,
      trail: [card],
    })
  })

  it('up lands on the outermost of the ancestors on the box it reaches', () => {
    const { outer, title } = build()
    expect(step({ element: title, trail: [] }, { kind: 'up' })).toEqual({
      element: outer,
      trail: [title],
    })
  })

  it('up stays put when every ancestor is on the same box', () => {
    const { section, outer } = build()
    section.replaceChildren(outer)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 100]],
        [outer, [0, 0, 300, 100]],
      ]),
    )
    const aim: Aim = { element: outer, trail: [] }
    expect(step(aim, { kind: 'up' })).toBe(aim)
  })

  it('down lands past the wrappers, on the first child of the innermost', () => {
    const { outer, title } = build()
    expect(step({ element: outer, trail: [] }, { kind: 'down' }).element).toBe(
      title,
    )
  })

  it('down from a wrapper skips the rest of its wrappers', () => {
    const { section, outer, card } = build()
    section.replaceChildren(outer)
    expect(
      step({ element: section, trail: [] }, { kind: 'down' }).element,
    ).toBe(card)
  })

  it('siblings of an inner wrapper are those of the outermost', () => {
    const { a, card } = build()
    expect(
      step({ element: card, trail: [] }, { kind: 'previous' }).element,
    ).toBe(a)
  })

  it('a wrapper counts past a parent with no area between them', () => {
    const { a, outer, middle, card } = build()
    layout(
      new Map<Element, Box>([
        [a, [0, 0, 300, 100]],
        [outer, [0, 100, 300, 100]],
        [middle, [0, 100, 300, 0]],
        [card, [0, 100, 300, 100]],
      ]),
    )
    expect(
      step({ element: card, trail: [] }, { kind: 'previous' }).element,
    ).toBe(a)
  })

  it('down passes an overlay on the same box to the next child', () => {
    const { section, a } = build()
    const overlay = make('div', 'overlay')
    section.replaceChildren(overlay, a)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 100]],
        [overlay, [0, 0, 300, 100]],
        [a, [0, 0, 300, 50]],
      ]),
    )
    expect(
      step({ element: section, trail: [] }, { kind: 'down' }).element,
    ).toBe(a)
  })

  it('an overlay on its parent box keeps its own siblings', () => {
    const { section, a } = build()
    const overlay = make('div', 'overlay')
    section.replaceChildren(a, overlay)
    layout(
      new Map<Element, Box>([
        [section, [0, 0, 300, 100]],
        [a, [0, 0, 300, 50]],
        [overlay, [0, 0, 300, 100]],
      ]),
    )
    expect(
      step({ element: overlay, trail: [] }, { kind: 'previous' }).element,
    ).toBe(a)
  })
})
