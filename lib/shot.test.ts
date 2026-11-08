import { describe, expect, it } from 'vitest'
import { filterShots, siteOf, sitesOf, type Shot } from './shot'

describe('siteOf', () => {
  it('names a page after its hostname', () => {
    expect(siteOf('https://example.com/docs?page=2')).toBe('example.com')
  })

  it('names a file page after its scheme', () => {
    expect(siteOf('file:///x.html')).toBe('file')
  })
})

const shotOf = (url: string, title: string): Shot => ({
  id: url,
  createdAt: 0,
  url,
  title,
  width: 1,
  height: 1,
  thumbnail: '',
})

describe('filterShots', () => {
  const shots = [
    shotOf('https://a.com/one', 'Pricing table'),
    shotOf('https://b.com/two', 'Hero banner'),
    shotOf('https://a.com/three', 'Footer'),
  ]

  it('keeps every shot for an empty query and no site', () => {
    expect(filterShots(shots, { query: ' ', site: null })).toEqual(shots)
  })

  it('matches the title or the address, ignoring case', () => {
    expect(
      filterShots(shots, { query: 'HERO', site: null }).map(({ id }) => id),
    ).toEqual(['https://b.com/two'])
    expect(
      filterShots(shots, { query: 'three', site: null }).map(({ id }) => id),
    ).toEqual(['https://a.com/three'])
  })

  it('narrows to one site', () => {
    expect(
      filterShots(shots, { query: '', site: 'a.com' }).map(({ id }) => id),
    ).toEqual(['https://a.com/one', 'https://a.com/three'])
  })
})

describe('sitesOf', () => {
  it('lists each site once, sorted', () => {
    expect(
      sitesOf([
        shotOf('https://b.com/', ''),
        shotOf('https://a.com/', ''),
        shotOf('https://b.com/x', ''),
      ]),
    ).toEqual(['a.com', 'b.com'])
  })
})
