import '~/lib/fonts-importer'
import { mount } from 'svelte'
import { match, P } from 'ts-pattern'
import Options from '~/components/options.svelte'
import style from '~/style.scss?inline'

const sheet = document.createElement('style')
sheet.textContent = style
document.head.appendChild(sheet)

match(document.getElementById('app'))
  .with(P.nonNullable, (target) => mount(Options, { target }))
  .otherwise(() => undefined)
