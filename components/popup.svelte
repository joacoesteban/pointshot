<script lang="ts">
  import { flip } from 'svelte/animate'
  import { draggable } from '~/lib/draggable'
  import type { Shot } from '~/lib/shot'
  import type { Mode } from '~/messages'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import ShotCard from './shot-card.svelte'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    visible: boolean
    ghost: boolean
    shots: Shot[]
    onclose: () => void
    onpick: () => void
    onpicklater: () => void
    oncapture: (mode: Mode) => void
    oncopy: (shot: Shot) => void
    ondownload: (shot: Shot) => void
    onremove: (shot: Shot) => void
  }

  const {
    visible,
    ghost,
    shots,
    onclose,
    onpick,
    onpicklater,
    oncapture,
    oncopy,
    ondownload,
    onremove,
  }: Props = $props()

  const modes = [
    { name: 'region', title: 'Snag an area', mode: 'selection' },
    { name: 'window', title: 'Snag what the window shows', mode: 'visible' },
    { name: 'page', title: 'Snag the whole page', mode: 'page' },
  ] as const
</script>

<div
  class="popup-wrapper"
  data-testid="snag-popup"
  inert={!visible}
  class:visible
  class:shrink={ghost}
  use:draggable>
  <div class="popup-container bg-blur" class:force-ghost={ghost}>
    <header class="flex justify-between items-center sticky top-0 z-10 mb-3">
      <h2 class="font-black text-2xl m-0 opacity-25">snag</h2>
      <SymbolButton
        name="xMark"
        title="Close"
        opaque
        size="40px"
        padding="30%"
        disabled={ghost}
        onclick={onclose} />
    </header>

    <main class="px-1">
      {#if shots.length}
        <div class="grid grid-cols-2 gap-3">
          {#each shots as shot (shot.id)}
            <div
              animate:flip={{ duration: 300 }}
              in:transitionIn
              out:transitionOut>
              <ShotCard
                {shot}
                disabled={ghost}
                {oncopy}
                {ondownload}
                {onremove} />
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-center py-8">
          <h3 class="font-bold text-xl mb-1">No snags yet</h3>
          <p class="opacity-60 text-sm">
            Pick an element and it lands in your clipboard.
          </p>
        </div>
      {/if}
    </main>

    <footer class="flex flex-col items-center sticky bottom-0 pt-4">
      <div class="flex items-center gap-2">
        <Button testId="snag-pick" disabled={ghost} onclick={onpick}
          >Snag</Button>
        {#each modes as { name, title, mode } (mode)}
          <SymbolButton
            {name}
            {title}
            size="40px"
            padding="26%"
            glassy
            disabled={ghost}
            onclick={() => {
              oncapture(mode)
            }} />
        {/each}
        <SymbolButton
          name="timer"
          title="Snag after a countdown"
          size="40px"
          padding="26%"
          glassy
          disabled={ghost}
          onclick={onpicklater} />
      </div>
      <p class="text-xs opacity-50 mt-2">
        ↑ ↓ ← → walk the page · ⇧ adds a margin · Esc cancels
      </p>
    </footer>
  </div>
</div>
