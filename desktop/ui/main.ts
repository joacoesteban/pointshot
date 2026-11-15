import { match } from 'ts-pattern'
import { boot } from './boot'
import App from './app.svelte'

// The options page opens on its settings without a hash, and the app's window opens on the library.
match(location.hash)
  .with('', () => {
    history.replaceState(null, '', '#library')
  })
  .otherwise(() => undefined)

boot(App)
