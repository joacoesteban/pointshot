<script lang="ts">
  import { age } from '~/lib/age'
  import { paint } from '~/lib/paint'
  import { siteOf, type Shot } from '~/lib/shot'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    shot: Shot
    disabled: boolean
    onopen: (shot: Shot) => void
    oncopy: (shot: Shot) => void
    ondownload: (shot: Shot) => void
    onremove: (shot: Shot) => void
  }

  const { shot, disabled, onopen, oncopy, ondownload, onremove }: Props =
    $props()

  // Twice the card's width keeps the thumbnail sharp on high-density screens.
  const THUMBNAIL_WIDTH = 480

  const { url, width, height, createdAt, thumbnail, title } = $derived(shot)
  const host = $derived(siteOf(url))
</script>

<article class="card bg-blur bg-blur:soft" data-testid="snag-shot" {title}>
  <div class="thumbnail">
    <canvas use:paint={{ dataUrl: thumbnail, maxWidth: THUMBNAIL_WIDTH }}
    ></canvas>
    <div class="actions">
      <SymbolButton
        name="expand"
        title="Open"
        size="38px"
        padding="28%"
        glassy
        opaque
        {disabled}
        onclick={() => {
          onopen(shot)
        }} />
      <SymbolButton
        name="docOnDoc"
        title="Copy"
        size="38px"
        padding="28%"
        glassy
        opaque
        {disabled}
        onclick={() => {
          oncopy(shot)
        }} />
      <SymbolButton
        name="squareAndArrowDown"
        title="Download"
        size="38px"
        padding="28%"
        glassy
        opaque
        {disabled}
        onclick={() => {
          ondownload(shot)
        }} />
      <SymbolButton
        name="trashFill"
        title="Delete"
        size="38px"
        padding="28%"
        glassy
        opaque
        {disabled}
        onclick={() => {
          onremove(shot)
        }} />
    </div>
  </div>
  <footer class="flex flex-col px-3 py-2 text-xs leading-tight">
    <span class="font-bold truncate">{host}</span>
    <span class="opacity-50 truncate">
      {width} × {height} · {age(createdAt)}
    </span>
  </footer>
</article>

<style lang="scss">
  .card {
    overflow: hidden;
    border-radius: 16px !important;
    filter: none !important;
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
    gap: 6px;
    opacity: 0;
    transform: scale(0.9);
    transition-property: opacity, transform;
    transition-duration: 0.15s;
    transition-timing-function: var(--bezier-round-inverted);
    backdrop-filter: blur(3px);
  }
  .card:hover .actions,
  .card:focus-within .actions {
    opacity: 1;
    transform: scale(1);
    transition-duration: 0.3s;
    transition-timing-function: var(--bezier-chill);
  }
</style>
