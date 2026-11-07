import { describe, expect, it } from 'vitest'
import { siteOf } from './shot'

describe('siteOf', () => {
  it('names a page after its hostname', () => {
    expect(siteOf('https://example.com/docs?page=2')).toBe('example.com')
  })

  it('names a file page after its scheme', () => {
    expect(siteOf('file:///x.html')).toBe('file')
  })
})
