import { describe, expect, it } from 'vitest'
import {
  axis,
  intersect,
  radius,
  shift,
  span,
  steps,
  type Area,
} from './region'

const box = (
  left: number,
  top: number,
  width: number,
  height: number,
): Area => ({
  left,
  top,
  width,
  height,
})

describe('intersect', () => {
  it('keeps the overlapping rectangle', () => {
    expect(intersect(box(0, 0, 100, 100), box(50, 50, 100, 100))).toEqual(
      box(50, 50, 50, 50),
    )
  })

  it('gives non-positive sizes when the rectangles are disjoint', () => {
    expect(intersect(box(0, 0, 100, 100), box(200, 200, 100, 100))).toEqual(
      box(200, 200, -100, -100),
    )
  })
})

describe('shift', () => {
  it('moves the area by the offset without resizing it', () => {
    expect(shift(box(10, 20, 100, 50), { x: 5, y: -5 })).toEqual(
      box(15, 15, 100, 50),
    )
  })
})

describe('steps', () => {
  it('keeps at least one step for an empty length', () => {
    expect(steps(0, 0, 100)).toEqual([0])
  })

  it('rounds the number of spans up', () => {
    expect(steps(10, 250, 100)).toEqual([10, 110, 210])
  })

  it('does not add a step when the length fits exactly', () => {
    expect(steps(0, 100, 100)).toEqual([0])
  })
})

describe('axis', () => {
  it('keeps the offset when the area is already in view', () => {
    expect(axis(10, 20, 0, 100)).toEqual([0])
  })

  it('walks the steps from the start when the area is out of view', () => {
    expect(axis(150, 250, 0, 100)).toEqual([150, 250, 350])
  })
})

describe('radius', () => {
  const area = box(0, 0, 200, 100)

  it('applies one length to both axes', () => {
    expect(radius('12px', area)).toEqual({ x: 12, y: 12 })
  })

  it('reads horizontal and vertical lengths in that order', () => {
    expect(radius('10px 20px', area)).toEqual({ x: 10, y: 20 })
  })

  it('resolves percentages against the width and the height', () => {
    expect(radius('50%', area)).toEqual({ x: 100, y: 50 })
  })
})

describe('span', () => {
  it('spans two corners whichever way the drag went', () => {
    expect(span({ x: 300, y: 230 }, { x: 100, y: 130 })).toEqual(
      box(100, 130, 200, 100),
    )
  })
})
