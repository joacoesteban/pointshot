import '~/lib/fonts-importer'
import { mount } from 'svelte'
import { match, P } from 'ts-pattern'
import Options from '~/components/options.svelte'
import { t, uiLanguage } from '~/lib/i18n'
import style from '~/style.scss?inline'

document.title = t('optionsTitle')
document.documentElement.lang = uiLanguage()

const sheet = document.createElement('style')
sheet.textContent = style
document.head.appendChild(sheet)

match(document.getElementById('app'))
  .with(P.nonNullable, (target) => mount(Options, { target }))
  .otherwise(() => undefined)
