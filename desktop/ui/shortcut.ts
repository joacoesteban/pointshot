import { invoke } from '@tauri-apps/api/core'
import { Result, ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { z } from 'zod'
import type { MessageKey } from '~/lib/i18n'

// What each shortcut does: start the overlay in one of its modes, or show or hide the library.
export type Action = 'element' | 'area' | 'visible' | 'page' | 'library'

// The extension's commands, which name the shortcuts in the settings and the tray.
export const COMMANDS: readonly {
  readonly command: string
  readonly action: Action
  readonly description: MessageKey
}[] = [
  { command: 'pick-element', action: 'element', description: 'commandPick' },
  {
    command: 'snag-selection',
    action: 'area',
    description: 'commandSelection',
  },
  { command: 'snag-visible', action: 'visible', description: 'commandVisible' },
  { command: 'snag-page', action: 'page', description: 'commandPage' },
  { command: 'toggle-popup', action: 'library', description: 'commandToggle' },
]

const KEY = 'shortcuts'

// In the format the app registers: modifiers, then the key's KeyboardEvent.code. Empty is unset; only picking has one by default, since the extension's Alt+S would take Option+S, which types ß on a Mac, from every app.
const Shortcuts = z.object({
  element: z.string().catch('Alt+Shift+KeyS'),
  area: z.string().catch(''),
  visible: z.string().catch(''),
  page: z.string().catch(''),
  library: z.string().catch(''),
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

  static save(action: Action, accelerator: string): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('set_shortcut', { action, accelerator }),
      String,
    ).map(() => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ ...Shortcut.all(), [action]: accelerator }),
      )
    })
  }

  // The app registers the extension's pick shortcut at launch, and the window puts back the ones recorded since.
  static restore(): ResultAsync<void, string> {
    const shortcuts = Shortcut.all()
    return ResultAsync.combine(
      COMMANDS.map(({ action }) => Shortcut.save(action, shortcuts[action])),
    ).map(() => undefined)
  }

  static pause(paused: boolean): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('pause_shortcut', { paused }),
      String,
    ).map(() => undefined)
  }
}
