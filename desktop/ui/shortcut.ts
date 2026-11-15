import { match, P } from 'ts-pattern'

// The shortcut the app registers, in the menus' format.
export const ACCELERATOR = 'Alt+Shift+S'

// The same shortcut, as the platform spells it.
export const SHORTCUT = match(navigator.userAgent)
  .with(P.string.includes('Mac'), () => '⌥⇧S')
  .otherwise(() => ACCELERATOR)
