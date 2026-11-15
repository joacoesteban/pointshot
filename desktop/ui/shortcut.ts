import { invoke } from '@tauri-apps/api/core'
import { Result, ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { z } from 'zod'
import type { MessageKey } from '~/lib/i18n'

// The overlay mode each shortcut starts in.
export type Mode = 'element' | 'area' | 'visible' | 'page'

// The extension's commands, which name the shortcuts in the settings and the tray.
export const COMMANDS: readonly {
  readonly command: string
  readonly mode: Mode
  readonly description: MessageKey
}[] = [
  { command: 'pick-element', mode: 'element', description: 'commandPick' },
  { command: 'snag-selection', mode: 'area', description: 'commandSelection' },
  { command: 'snag-visible', mode: 'visible', description: 'commandVisible' },
  { command: 'snag-page', mode: 'page', description: 'commandPage' },
]

const KEY = 'shortcuts'

// In the format the app registers: modifiers, then the key's KeyboardEvent.code. Empty is unset; like the extension, only picking has one by default.
const Shortcuts = z.object({
  element: z.string().catch('Alt+Shift+KeyS'),
  area: z.string().catch(''),
  visible: z.string().catch(''),
  page: z.string().catch(''),
})

type Shortcuts = z.infer<typeof Shortcuts>

const parse = Result.fromThrowable((raw: string): unknown => JSON.parse(raw))

type Modifier = 'Control' | 'Alt' | 'Shift' | 'Super'

const MODIFIERS: readonly Modifier[] = ['Control', 'Alt', 'Shift', 'Super']

const mac = navigator.userAgent.includes('Mac')

// macOS spells shortcuts with glyphs in this order; the others join names with a plus.
const GLYPHS: Readonly<Record<Modifier, string>> = match(mac)
  .with(true, () => ({ Control: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘' }))
  .otherwise(() => ({
    Control: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Super: 'Win',
  }))

const isModifier = (part: string): part is Modifier =>
  MODIFIERS.some((modifier) => modifier === part)

const keyLabel = (code: string) =>
  code.replace(/^(Key|Digit|Numpad)/, '').replace(/^Arrow/, '')

export class Shortcut {
  static all(): Shortcuts {
    return Shortcuts.parse(
      parse(localStorage.getItem(KEY) ?? '{}').unwrapOr({}),
    )
  }

  static label(accelerator: string): string {
    const parts = accelerator.split('+')
    const labels = [
      ...MODIFIERS.filter((modifier) => parts.includes(modifier)).map(
        (modifier) => GLYPHS[modifier],
      ),
      ...parts.filter((part) => !isModifier(part)).map(keyLabel),
    ]
    return labels.join(
      match(mac)
        .with(true, () => '')
        .otherwise(() => '+'),
    )
  }

  // A shortcut needs a modifier and a key that is not one, so a keydown of a modifier alone reads as nothing yet.
  static read({
    code,
    ctrlKey,
    altKey,
    shiftKey,
    metaKey,
  }: KeyboardEvent): string | null {
    const held = MODIFIERS.filter(
      (_, index) => [ctrlKey, altKey, shiftKey, metaKey][index],
    )
    return match({ held, code })
      .with({ held: [] }, () => null)
      .with(
        { code: P.string.regex(/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/) },
        () => null,
      )
      .otherwise(({ held, code }) => [...held, code].join('+'))
  }

  static save(mode: Mode, accelerator: string): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('set_shortcut', { mode, accelerator }),
      String,
    ).map(() => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ ...Shortcut.all(), [mode]: accelerator }),
      )
    })
  }

  // The app registers the extension's pick shortcut at launch, and the window puts back the ones recorded since.
  static restore(): ResultAsync<void, string> {
    const shortcuts = Shortcut.all()
    return ResultAsync.combine(
      COMMANDS.map(({ mode }) => Shortcut.save(mode, shortcuts[mode])),
    ).map(() => undefined)
  }

  static pause(paused: boolean): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('pause_shortcut', { paused }),
      String,
    ).map(() => undefined)
  }
}
