<script lang="ts">
  import toast from 'svelte-french-toast'
  import Filters from '~/components/filters.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { t } from '~/lib/i18n'
  import { themeController } from '~/lib/theme-controller'

  // The app opens this window for one capture and closes it once the toast is gone.
  toast.success(t('copied'))
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
</style>
