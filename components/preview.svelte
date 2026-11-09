<script lang="ts">
  import { t } from '~/lib/i18n'
  import { match, P } from 'ts-pattern'
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { age } from '~/lib/age'
  import { paint } from '~/lib/paint'
  import { siteOf, type Shot } from '~/lib/shot'
  import Dialog from './dialog.svelte'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    shot: Shot
    image: string | null
    onclose: () => void
    oncopy: (shot: Shot) => void
    ondownload: (shot: Shot) => void
    onremove: (shot: Shot) => void
    onedit: (shot: Shot, image: string) => void
  }

  const {
    shot,
    image,
    onclose,
    oncopy,
    ondownload,
    onremove,
    onedit,
  }: Props = $props()

  const { url, title, width, height, createdAt } = $derived(shot)

</script>

<Dialog title={title || siteOf(url)} testId="snag-preview" {onclose}>
  {#snippet subtitle()}
    <a href={url} target="_blank" rel="noreferrer" class="underline"
      >{siteOf(url)}</a>
    · {width} × {height} · {age(createdAt)}
  {/snippet}

  <div class="image">
    {#if image}
      <canvas use:paint={{ dataUrl: image, maxWidth: Infinity }}></canvas>
    {:else}
      <span class="loading loading-spinner"></span>
    {/if}
  </div>

  {#snippet footer()}
    <div class="flex items-center gap-2">
      <SymbolButton
        name="docOnDoc"
        title={t('copy')}
        onclick={() => {
          oncopy(shot)
        }} />
      <SymbolButton
        name="squareAndArrowDown"
        title={t('download')}
        onclick={() => {
          ondownload(shot)
        }} />
      <SymbolButton
        name="pencil"
        title={t('edit')}
        disabled={image === null}
        onclick={() => {
          match(image)
            .with(P.string, (image) => {
              onedit(shot, image)
            })
            .otherwise(() => undefined)
        }} />
    </div>
    <SymbolButton
      name="trashFill"
      title={t('delete')}
      opaque
      colorSeed={COLOR_SEEDS.cancel}
      onclick={() => {
        onremove(shot)
      }} />
  {/snippet}
</Dialog>

<style lang="scss">
  .image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    overflow: auto;
    border-radius: 10px;
    background-image: repeating-conic-gradient(#8881 0 25%, transparent 0 50%);
    background-size: 16px 16px;
    canvas {
      max-width: 100%;
      max-height: calc(100vh - 240px);
      object-fit: contain;
    }
  }
</style>
