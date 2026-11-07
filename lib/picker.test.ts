// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { match, P } from 'ts-pattern'
import { type Aim, step } from './picker'

const make = (tag: string, id: string, ...children: Element[]) => {
  const element = document.createElement(tag)
  element.id = id
  element.append(...children)
  return element
}

const build = () => {
  const c = make('span', 'c')
  const b = make('div', 'b', c)
  const a = make('div', 'a')
  const hidden = make('div', 'hidden')
  const section = make('section', 'section', a, hidden, b)
  document.body.replaceChildren(section)
  return { section, a, b, c }
}

const renderOnly = (...elements: Element[]) => {
  const rect = [new DOMRect()] as unknown as DOMRectList
  const none = [] as unknown as DOMRectList
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (
    this: Element,
  ) {
    return match(this)
      .with(
        P.when((element) => elements.includes(element)),
        () => rect,
      )
      .otherwise(() => none)
  })
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
    renderOnly()
    expect(step({ element: c, trail: [] }, { kind: 'up' })).toEqual({
      element: b,
      trail: [c],
    })
  })

  it('up stays put instead of climbing to BODY or HTML', () => {
    const { section } = build()
    renderOnly()
    const aim: Aim = { element: section, trail: [] }
    expect(step(aim, { kind: 'up' })).toBe(aim)
    const onBody: Aim = { element: document.body, trail: [] }
    expect(step(onBody, { kind: 'up' })).toBe(onBody)
  })

  it('down pops the trail back to the element it climbed from', () => {
    const { b, c } = build()
    renderOnly()
    expect(step({ element: b, trail: [c] }, { kind: 'down' })).toEqual({
      element: c,
      trail: [],
    })
  })

  it('down with an empty trail goes to the first rendered child', () => {
    const { section, a } = build()
    renderOnly(section, a)
    expect(step({ element: section, trail: [] }, { kind: 'down' })).toEqual({
      element: a,
      trail: [],
    })
  })

  it('next and previous move between rendered siblings, skipping unrendered ones', () => {
    const { a, b } = build()
    renderOnly(a, b)
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
    renderOnly(a, b)
    const first: Aim = { element: a, trail: [] }
    const last: Aim = { element: b, trail: [] }
    expect(step(first, { kind: 'previous' })).toBe(first)
    expect(step(last, { kind: 'next' })).toBe(last)
  })
})
