// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Dom } from './dom'

const shadowed = () => {
  const host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  const inner = document.createElement('span')
  const sibling = document.createElement('b')
  root.append(inner, sibling)
  document.body.replaceChildren(host)
  return { host, inner, sibling }
}

describe('Dom', () => {
  it('steps out of a shadow root to its host', () => {
    const { host, inner } = shadowed()
    expect(Dom.parent(inner)).toBe(host)
    expect(Dom.ancestors(inner)).toEqual([
      host,
      document.body,
      document.documentElement,
    ])
  })

  it('lists a host by its shadow children', () => {
    const { host, inner, sibling } = shadowed()
    expect(Dom.children(host)).toEqual([inner, sibling])
  })

  it('lists the siblings of a shadow root child', () => {
    const { inner, sibling } = shadowed()
    expect(Dom.siblings(inner)).toEqual([inner, sibling])
  })

  it('tells elements apart from other values', () => {
    expect(Dom.isElement(document.body)).toBe(true)
    expect(Dom.isElement(document)).toBe(false)
    expect(Dom.isElement({ nodeType: 1 })).toBe(false)
  })
})
