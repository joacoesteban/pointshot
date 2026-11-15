<script lang="ts">
  import { emitTo } from '@tauri-apps/api/event'
  import { fromEvent } from 'rxjs'
  import toast from 'svelte-french-toast'
  import Filters from '~/components/filters.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { themeController } from '~/lib/theme-controller'
  import { say } from './browser'

  // The app opens this window for one capture and closes it once the toast is gone. A click on it opens the capture in the editor.
  toast.success(say('copiedEdit'))

  fromEvent(window, 'click').subscribe(() => {
    void emitTo('main', 'edit')
  })
</script>

<div use:themeController>
  <Toaster />
  <Filters />
</div>

<style lang="scss">
  :global(html),
  :global(body) {
    background: transparent !important;
  }
  :global(.snag-toast) {
    cursor: pointer;
  }
</style>
