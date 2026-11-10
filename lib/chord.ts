import { match, P } from 'ts-pattern'
import type { Area } from './region'

export type SnagMode = 'element' | 'area' | 'visible' | 'page'

export type Held = { readonly shift: boolean; readonly command: boolean }

export type SnagState = {
  readonly mode: SnagMode
  readonly held: Held
  readonly marquee: Area | null
}

type Modifiers = Readonly<Record<'shiftKey' | 'metaKey' | 'ctrlKey', boolean>>

type Intent = {
  readonly held: Held
  readonly pinned: SnagMode
  readonly marquee: Area | null
}

const RELEASED: Held = { shift: false, command: false }

export class Chord {
  static readonly released = RELEASED
  static readonly idle: SnagState = {
    mode: 'element',
    held: RELEASED,
    marquee: null,
  }

  static readonly read = ({ shiftKey, metaKey, ctrlKey }: Modifiers): Held => ({
    shift: shiftKey,
    command: metaKey || ctrlKey,
  })

  static readonly same = (a: Held, b: Held) =>
    a.shift === b.shift && a.command === b.command

  // A drag in progress keeps the area mode, so letting go of Shift halfway does not drop it.
  static mode({ held, pinned, marquee }: Intent): SnagMode {
    return match({ held, marquee })
      .returnType<SnagMode>()
      .with({ marquee: P.nonNullable }, () => 'area')
      .with({ held: { command: true, shift: true } }, () => 'page')
      .with({ held: { command: true } }, () => 'visible')
      .with({ held: { shift: true } }, () => 'area')
      .otherwise(() => pinned)
  }

  static commandGlyph(userAgent: string) {
    return match(userAgent)
      .with(P.string.includes('Mac'), () => '⌘')
      .otherwise(() => 'Ctrl')
  }
}
