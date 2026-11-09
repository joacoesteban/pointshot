<script lang="ts">
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { t } from '~/lib/i18n'
  import { age } from '~/lib/age'
  import { paint } from '~/lib/paint'
  import { siteOf, type Shot } from '~/lib/shot'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    shot: Shot
    disabled: boolean
    onopen: (shot: Shot) => void
    oncopy: (shot: Shot) => void
    onremove: (shot: Shot) => void
  }

  const { shot, disabled, onopen, oncopy, onremove }: Props = $props()

  // Twice the card's width keeps the thumbnail sharp on high-density screens.
  const THUMBNAIL_WIDTH = 480

  const { url, width, height, createdAt, thumbnail, title } = $derived(shot)
  const host = $derived(siteOf(url))
</script>

<article class="card bg-theme:soft" data-testid="snag-shot" {title}>
  <div class="thumbnail">
    <canvas use:paint={{ dataUrl: thumbnail, maxWidth: THUMBNAIL_WIDTH }}
    ></canvas>
    <div class="actions">
      <SymbolButton
        name="expand"
        title={t('open')}
        size="sm"
        opaque
        {disabled}
        onclick={() => {
          onopen(shot)
        }} />
      <SymbolButton
        name="docOnDoc"
        title={t('copy')}
        size="sm"
        opaque
        {disabled}
        onclick={() => {
          oncopy(shot)
        }} />
      <SymbolButton
        name="trashFill"
        title={t('delete')}
        size="sm"
        opaque
        colorSeed={COLOR_SEEDS.cancel}
        {disabled}
        onclick={() => {
          onremove(shot)
        }} />
    </div>
  </div>
  <footer class="flex flex-col px-3 py-2 text-xs leading-tight">
    <span class="font-bold truncate">{host}</span>
    <span class="opacity-60 truncate">
      {width} × {height} · {age(createdAt)}
    </span>
  </footer>
</article>

<style lang="scss">
  .card {
    overflow: hidden;
    border: 1px solid #ccc5;
    border-radius: 16px;
  }
  .thumbnail {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 132px;
    padding: 10px;
    background-image: repeating-conic-gradient(#8881 0 25%, transparent 0 50%);
    background-size: 16px 16px;
    canvas {
      max-width: 100%;
      max-height: 100%;
      border-radius: 6px;
      box-shadow: 0 4px 14px #0003;
    }
  }
  .actions {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: 0;
    transform: scale(0.9);
    transition-property: opacity, transform;
    transition-duration: 0.15s;
    transition-timing-function: var(--bezier-round-inverted);
    background: var(--_blur-bg-soft);
    backdrop-filter: blur(4px);
  }
  .card:hover .actions,
  .card:focus-within .actions {
    opacity: 1;
    transform: scale(1);
    transition-duration: 0.3s;
    transition-timing-function: var(--bezier-chill);
  }
</style>
