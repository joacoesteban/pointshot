import { openUrl } from '@tauri-apps/plugin-opener'
import { match, P } from 'ts-pattern'
import en from '~/public/_locales/en/messages.json'
import es from '~/public/_locales/es/messages.json'
import desktopEn from './locales/en.json'
import desktopEs from './locales/es.json'
import tauri from '../tauri.conf.json'
import { COMMANDS, Shortcut } from './shortcut'

type Message = {
  readonly message: string
  readonly placeholders?: Readonly<Record<string, { readonly content: string }>>
}

// Like the browser, a language without a key falls back to English, and the desktop app's own lines win over the extension's.
const catalog: Readonly<Record<string, Message>> = match(navigator.language)
  .with(P.string.startsWith('es'), () => ({
    ...en,
    ...desktopEn,
    ...es,
    ...desktopEs,
  }))
  .otherwise(() => ({ ...en, ...desktopEn }))

// Chrome's format: $NAME$ names a placeholder, whose content refers to the substitutions as $1 to $9.
const fill = (
  { message, placeholders = {} }: Message,
  substitutions: readonly string[],
) =>
  message
    .replace(/\$(\w+)\$/g, (whole, name: string) =>
      match(placeholders[name.toLowerCase()])
        .with(P.nonNullable, ({ content }) => content)
        .otherwise(() => whole),
    )
    .replace(
      /\$(\d)/g,
      (whole, index: string) => substitutions[Number(index) - 1] ?? whole,
    )

type Changes = Record<string, { oldValue: unknown; newValue: unknown }>

type Listener = (changes: Changes, area: string) => void

const listeners = new Set<Listener>()

const parse = (raw: string | null): unknown =>
  match(raw)
    .with(P.string, (raw) => JSON.parse(raw) as unknown)
    .otherwise(() => undefined)

const notify = (changes: Changes) => {
  listeners.forEach((listener) => {
    listener(changes, 'local')
  })
}

// localStorage tells the origin's other windows about a write, which is what storage.onChanged tells extension pages.
addEventListener('storage', ({ key, oldValue, newValue }) => {
  match(key)
    .with(P.string, (key) => {
      notify({
        [key]: { oldValue: parse(oldValue), newValue: parse(newValue) },
      })
    })
    .otherwise(() => undefined)
})

const getMessage = (key: string, substitutions: readonly string[] = []) =>
  match(catalog[key])
    .with(P.nonNullable, (message) => fill(message, substitutions))
    .otherwise(() => '')

export const browser = {
  i18n: { getMessage },
  runtime: { getManifest: () => ({ version: tauri.version }) },
  commands: {
    getAll: () => {
      const shortcuts = Shortcut.all()
      return Promise.resolve(
        COMMANDS.map(({ command, mode, description }) => ({
          name: command,
          description: getMessage(description),
          shortcut: Shortcut.label(shortcuts[mode]),
        })),
      )
    },
  },
  tabs: {
    create: ({ url }: { readonly url: string }) => openUrl(url),
  },
  // The app saves downloads itself, so the options page's downloads permission is always granted.
  permissions: {
    request: () => Promise.resolve(true),
  },
  storage: {
    local: {
      get: (key: string) =>
        Promise.resolve({ [key]: parse(localStorage.getItem(key)) }),
      // A full localStorage throws, which the promise turns into a rejection.
      set: (items: Readonly<Record<string, unknown>>) =>
        new Promise<void>((resolve) => {
          const changes = Object.fromEntries(
            Object.entries(items).map(([key, newValue]) => {
              const oldValue = parse(localStorage.getItem(key))
              localStorage.setItem(key, JSON.stringify(newValue))
              return [key, { oldValue, newValue }]
            }),
          )
          notify(changes)
          resolve()
        }),
    },
    onChanged: {
      addListener: (listener: Listener) => {
        listeners.add(listener)
      },
      removeListener: (listener: Listener) => {
        listeners.delete(listener)
      },
    },
  },
}

// Lines only the desktop app has, which t() does not know.
export const say = (key: keyof typeof desktopEn) => getMessage(key)
