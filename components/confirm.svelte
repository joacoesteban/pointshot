<script lang="ts">
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { t } from '~/lib/i18n'
  import Button from './button.svelte'
  import Dialog from './dialog.svelte'

  type Props = {
    title: string
    body: string
    action: string
    onconfirm: () => void
    oncancel: () => void
  }

  const { title, body, action, onconfirm, oncancel }: Props = $props()
</script>

<Dialog {title} testId="snag-confirm" onclose={oncancel}>
  <p class="body">{body}</p>
  {#snippet footer()}
    <div class="flex-1"></div>
    <div class="flex items-center gap-2">
      <Button icon="xMark" onclick={oncancel}>{t('cancel')}</Button>
      <Button icon="trashFill" colorSeed={COLOR_SEEDS.cancel} onclick={onconfirm}
        >{action}</Button>
    </div>
  {/snippet}
</Dialog>

<style lang="scss">
  .body {
    margin: 0;
    max-width: 28rem;
    opacity: 0.8;
  }
</style>
