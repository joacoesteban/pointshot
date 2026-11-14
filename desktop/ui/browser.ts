import { match, P } from 'ts-pattern'
import en from '~/public/_locales/en/messages.json'
import es from '~/public/_locales/es/messages.json'
import desktopEn from './locales/en.json'
import desktopEs from './locales/es.json'

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

export const browser = {
  i18n: {
    getMessage: (key: string, substitutions: readonly string[] = []) =>
      match(catalog[key])
        .with(P.nonNullable, (message) => fill(message, substitutions))
        .otherwise(() => ''),
  },
}
