import { describe, expect, it } from 'vitest'
import { fileName, pathOf } from './download'
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

describe('pathOf', () => {
  it('puts the file in a folder of the download folder', () => {
    expect(pathOf('Snag/shots', 'a.png')).toBe('Snag/shots/a.png')
  })

  it('drops empty and relative parts and replaces reserved characters', () => {
    expect(pathOf(' /../Snag\\./what?/ ', 'a.png')).toBe('Snag/what_/a.png')
    expect(pathOf('', 'a.png')).toBe('a.png')
  })
})
