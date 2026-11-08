import { describe, expect, it } from 'vitest'
import { arrowHead, dragged } from './sketch'

describe('arrowHead', () => {
  it('puts the tip on the end and both sides behind it, mirrored', () => {
    const [tip, left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4)
    expect(tip).toEqual({ x: 100, y: 0 })
    // 4.5 widths of 4 px is 18 px along sides opened by π / 7.
    expect(left.x).toBeCloseTo(100 - 18 * Math.cos(Math.PI / 7))
    expect(left.y).toBeCloseTo(-18 * Math.sin(Math.PI / 7))
    expect(right.x).toBeCloseTo(left.x)
    expect(right.y).toBeCloseTo(-left.y)
  })
})

describe('dragged', () => {
  it('normalises the drag and clamps it to the image', () => {
    expect(
      dragged({ x: 150, y: -20 }, { x: 40, y: 60 }, { width: 100, height: 50 }),
    ).toEqual({ left: 40, top: 0, width: 60, height: 50 })
  })
})
