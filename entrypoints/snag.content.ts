import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { mount, unmount } from 'svelte'
import { match, P } from 'ts-pattern'
import App from '~/contents/app.svelte'
import style from '~/style.scss?inline'

export default defineContentScript({
  registration: 'runtime',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'snag-ui',
      position: 'inline',
      anchor: 'html',
      append: 'first',
      css: style,
      onMount: (container, _shadow, host) => {
        container.style.position = 'relative'
        container.style.zIndex = '2147483647'
        return mount(App, { target: container, props: { host, container } })
      },
      onRemove: (app) => {
        match(app)
          .with(P.nonNullable, (app) => void unmount(app))
          .otherwise(() => undefined)
      },
    })

    ui.mount()
  },
})
