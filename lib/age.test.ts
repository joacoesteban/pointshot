import { describe, expect, it } from 'vitest'
import { age } from './age'

const now = Date.UTC(2026, 10, 7, 12)
const minutesAgo = (minutes: number) => now - minutes * 60_000

describe('age', () => {
  it('names a snag from this minute as this minute', () => {
    expect(age(now, now)).toBe('this minute')
  })

  it('counts minutes up to 59', () => {
    expect(age(minutesAgo(1), now)).toBe('1 minute ago')
    expect(age(minutesAgo(59), now)).toBe('59 minutes ago')
  })

  it('switches to hours at 60 minutes', () => {
    expect(age(minutesAgo(60), now)).toBe('1 hour ago')
    expect(age(minutesAgo(23 * 60), now)).toBe('23 hours ago')
  })

  it('switches to days at 24 hours', () => {
    expect(age(minutesAgo(24 * 60), now)).toBe('yesterday')
    expect(age(minutesAgo(3 * 24 * 60), now)).toBe('3 days ago')
  })
})
