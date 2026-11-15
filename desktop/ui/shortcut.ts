import { invoke } from '@tauri-apps/api/core'
import { ResultAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'

const KEY = 'shortcut'
// The extension's pick shortcut, in the format the app registers: modifiers, then the key's KeyboardEvent.code.
const DEFAULT = 'Alt+Shift+KeyS'

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
  static current(): string {
    return localStorage.getItem(KEY) ?? DEFAULT
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

  static save(accelerator: string): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('set_shortcut', { accelerator }),
      String,
    ).map(() => {
      localStorage.setItem(KEY, accelerator)
    })
  }

  // The app registers the extension's shortcut at launch, and the window puts back the one recorded since.
  static restore(): ResultAsync<void, string> {
    return match(Shortcut.current())
      .with(DEFAULT, () => okAsync(undefined))
      .otherwise((accelerator) => Shortcut.save(accelerator))
  }

  static pause(paused: boolean): ResultAsync<void, string> {
    return ResultAsync.fromPromise(
      invoke('pause_shortcut', { paused }),
      String,
    ).map(() => undefined)
  }
}
