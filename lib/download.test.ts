import { describe, expect, it } from 'vitest'
import { fileName } from './download'
import type { Shot } from './shot'

const shot: Shot = {
  id: 'id',
  createdAt: Date.UTC(2026, 10, 8, 12, 30, 15, 250),
  url: 'https://example.com/page',
  title: 'Example',
  width: 1,
  height: 1,
  thumbnail: '',
}

describe('fileName', () => {
  it('names a download after the site and time, with the extension of its format', () => {
    expect(fileName(shot, 'png')).toBe(
      'snag-example.com-2026-11-08T12-30-15-250Z.png',
    )
    expect(fileName(shot, 'jpeg')).toMatch(/\.jpg$/)
    expect(fileName(shot, 'webp')).toMatch(/\.webp$/)
  })
})
