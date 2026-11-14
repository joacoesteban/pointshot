import '~/lib/fonts-importer'
import '~/style.scss'
import { mount, type Component } from 'svelte'
import { match, P } from 'ts-pattern'
import { uiLanguage } from '~/lib/i18n'

export const boot = (app: Component) => {
  document.documentElement.lang = uiLanguage()
  match(document.getElementById('app'))
    .with(P.nonNullable, (target) => mount(app, { target }))
    .otherwise(() => undefined)
}
