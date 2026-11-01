<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { flip } from 'svelte/animate'
  import { draggable } from '~/lib/draggable'
  import type { Shot } from '~/lib/shot'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import ShotCard from './shot-card.svelte'
  import SymbolButton from './symbol-button.svelte'

  export let visible = false
  export let ghost = false
  export let shots: Shot[] = []

  const dispatch = createEventDispatcher<{
    close: undefined
    pick: undefined
    copy: Shot
    download: Shot
    remove: Shot
  }>()
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
      <h2 class="made-tommy font-black text-2xl m-0 opacity-25">snag</h2>
      <SymbolButton
        name="xMark"
        title="Close"
        opaque
        size="40px"
        padding="30%"
        disabled={ghost}
        on:click={() => dispatch('close')} />
    </header>

    <main class="px-1">
      {#if shots.length}
        <div class="grid grid-cols-2 gap-3">
          {#each shots as shot (shot.id)}
            <div
              animate:flip={{ duration: 300 }}
              in:transitionIn
              out:transitionOut>
              <ShotCard {shot} disabled={ghost} on:copy on:download on:remove />
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-center py-8 made-tommy">
          <h3 class="font-bold text-xl mb-1">No snags yet</h3>
          <p class="opacity-60 text-sm">
            Pick an element and it lands in your clipboard.
          </p>
        </div>
      {/if}
    </main>

    <footer class="flex flex-col items-center sticky bottom-0 pt-4">
      <Button
        testId="snag-pick"
        disabled={ghost}
        on:click={() => dispatch('pick')}>Snag</Button>
      <p class="made-tommy text-xs opacity-50 mt-2">
        Esc cancels · ↑ ↓ walk the tree
      </p>
    </footer>
  </div>
</div>
