import { browser } from 'wxt/browser'
import type en from '~/public/_locales/en/messages.json'

export type MessageKey = keyof typeof en

// Copy comes from the browser's _locales, in its interface language. Placeholders take the substitutions in order.
export const t = (key: MessageKey, ...substitutions: string[]) =>
  browser.i18n.getMessage(key, substitutions)

// Each messages file names its own locale, so dates and numbers speak the same language as the copy.
export const uiLanguage = () => t('locale')
