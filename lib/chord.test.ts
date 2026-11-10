import { describe, expect, it } from 'vitest'
import { Chord, type Held, type SnagMode } from './chord'

const held = (shift: boolean, command: boolean): Held => ({ shift, command })
const rect = { left: 0, top: 0, width: 10, height: 10 }

describe('Chord.mode', () => {
  it.each<[boolean, boolean, SnagMode]>([
    [false, false, 'element'],
    [true, false, 'area'],
    [false, true, 'visible'],
    [true, true, 'page'],
  ])('shift %s, command %s means %s', (shift, command, expected) => {
    expect(
      Chord.mode({
        held: held(shift, command),
        pinned: 'element',
        marquee: null,
      }),
    ).toBe(expected)
  })

  it('falls back to the pinned mode with nothing held', () => {
    expect(
      Chord.mode({ held: Chord.released, pinned: 'page', marquee: null }),
    ).toBe('page')
  })

  it('lets a held chord override the pinned mode', () => {
    expect(
      Chord.mode({ held: held(true, false), pinned: 'page', marquee: null }),
    ).toBe('area')
  })

  it('stays in area while a drag is in progress', () => {
    expect(
      Chord.mode({ held: held(false, true), pinned: 'element', marquee: rect }),
    ).toBe('area')
  })
})

describe('Chord.reader', () => {
  const event = { shiftKey: false, metaKey: false, ctrlKey: false }
  const mac = Chord.reader('Mozilla/5.0 (Macintosh; Intel Mac OS X)')
  const linux = Chord.reader('Mozilla/5.0 (X11; Linux x86_64)')

  it('reads Command on macOS, where Control+click is a right click', () => {
    expect(mac({ ...event, metaKey: true }).command).toBe(true)
    expect(mac({ ...event, ctrlKey: true }).command).toBe(false)
  })

  it('reads Control elsewhere', () => {
    expect(linux({ ...event, ctrlKey: true }).command).toBe(true)
    expect(linux({ ...event, metaKey: true }).command).toBe(false)
  })
})

describe('Chord.commandGlyph', () => {
  it('names the key the platform has', () => {
    expect(Chord.commandGlyph('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(
      '⌘',
    )
    expect(Chord.commandGlyph('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl')
  })
})
