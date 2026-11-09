<script lang="ts">
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { t } from '~/lib/i18n'
  import { flip } from 'svelte/animate'
  import { match } from 'ts-pattern'
  import { draggable, type Placement } from '~/lib/draggable'
  import { filterShots, sitesOf, type Shot } from '~/lib/shot'
  import type { Mode } from '~/messages'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import ShotCard from './shot-card.svelte'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    visible: boolean
    ghost: boolean
    shots: Shot[]
    removed: readonly Shot[]
    placement: Placement
    onclose: () => void
    onpick: () => void
    onpicklater: () => void
    oncapture: (mode: Mode) => void
    onopen: (shot: Shot) => void
    oncopy: (shot: Shot) => void
    onremove: (shots: readonly Shot[]) => void
    onundo: () => void
    onoptions: () => void
  }

  const {
    visible,
    ghost,
    shots,
    removed,
    placement,
    onclose,
    onpick,
    onpicklater,
    oncapture,
    onopen,
    oncopy,
    onremove,
    onundo,
    onoptions,
  }: Props = $props()

  const modes = [
    { name: 'region', title: t('snagArea'), mode: 'selection' },
    { name: 'window', title: t('snagVisible'), mode: 'visible' },
    { name: 'page', title: t('snagPage'), mode: 'page' },
  ] as const

  let query = $state('')
  let site = $state<string | null>(null)

  const sites = $derived(sitesOf(shots))
  // A site whose snags are all gone stops filtering, so its select can disappear without hiding the rest.
  const filteredSite = $derived(sites.find((each) => each === site) ?? null)
  const shown = $derived(filterShots(shots, { query, site: filteredSite }))

  // Keys typed in the popup stop there, so the page's shortcuts do not see them.
  const contain = (event: KeyboardEvent) => {
    event.stopPropagation()
  }

  const deleted = (count: number) =>
    match(count)
      .with(1, () => t('deletedOne'))
      .otherwise((count) => t('deletedMany', String(count)))
</script>

<div
  class="popup-wrapper"
  data-testid="snag-popup"
  inert={!visible}
  class:visible
  class:shrink={ghost}
  use:draggable={placement}>
  <div class="popup-container bg-blur" class:force-ghost={ghost}>
    <header class="flex justify-between items-center mb-3">
      <h2 class="font-black text-sm tracking-widest m-0 opacity-60">snag</h2>
      <div class="flex items-center gap-2">
        <SymbolButton
          name="gear"
          title={t('options')}
          opaque
          disabled={ghost}
          onclick={onoptions} />
        <SymbolButton
          name="xMark"
          title={t('close')}
          opaque
          disabled={ghost}
          onclick={onclose} />
      </div>
    </header>

    {#if shots.length}
      <div class="toolbar flex items-center gap-2 mb-3 px-1" role="search">
        <input
          type="search"
          class="input input-sm input-bordered field flex-1 min-w-0"
          placeholder={t('searchSnags')}
          aria-label={t('searchSnags')}
          onkeydown={contain}
          onkeyup={contain}
          onkeypress={contain}
          bind:value={query} />
        {#if sites.length > 1}
          <select
            class="select select-sm select-bordered field max-w-[9rem]"
            aria-label={t('site')}
            onkeydown={contain}
            onkeyup={contain}
            onkeypress={contain}
            bind:value={site}>
            <option value={null}>{t('allSites')}</option>
            {#each sites as site (site)}
              <option value={site}>{site}</option>
            {/each}
          </select>
        {/if}
        <Button
          size="sm"
          opaque
          colorSeed={COLOR_SEEDS.cancel}
          disabled={ghost || shown.length === 0}
          onclick={() => {
            onremove(shown)
          }}>
          {match(shown.length)
            .with(shots.length, () => t('deleteAll'))
            .otherwise((count) => t('deleteShown', String(count)))}
        </Button>
      </div>
    {/if}

    <main class="px-1">
      {#if shown.length}
        <div class="grid grid-cols-2 gap-3">
          {#each shown as shot (shot.id)}
            <div
              animate:flip={{ duration: 300 }}
              in:transitionIn
              out:transitionOut>
              <ShotCard
                {shot}
                disabled={ghost}
                {onopen}
                {oncopy}
                onremove={(shot) => {
                  onremove([shot])
                }} />
            </div>
          {/each}
        </div>
      {:else if shots.length}
        <div class="text-center py-8">
          <h3 class="font-bold text-xl mb-1">{t('noMatchTitle')}</h3>
          <p class="opacity-60 text-sm">{t('noMatchBody')}</p>
        </div>
      {:else}
        <div class="text-center py-8">
          <h3 class="font-bold text-xl mb-1">{t('emptyTitle')}</h3>
          <p class="opacity-60 text-sm">{t('emptyBody')}</p>
        </div>
      {/if}
    </main>

    <footer class="flex flex-col items-center pt-4">
      {#if removed.length}
        <div
          class="undo flex items-center gap-3 mb-3 text-sm"
          data-testid="snag-undo"
          in:transitionIn
          out:transitionOut>
          <span>{deleted(removed.length)}</span>
          <Button size="sm" opaque icon="undo" onclick={onundo}
            >{t('undo')}</Button>
        </div>
      {/if}
      <div class="flex items-center gap-2">
        <Button size="lg" testId="snag-pick" disabled={ghost} onclick={onpick}
          >{t('snag')}</Button>
        {#each modes as { name, title, mode } (mode)}
          <SymbolButton
            {name}
            {title}
            disabled={ghost}
            onclick={() => {
              oncapture(mode)
            }} />
        {/each}
        <SymbolButton
          name="timer"
          title={t('snagLater')}
          disabled={ghost}
          onclick={onpicklater} />
      </div>
    </footer>
  </div>
</div>
