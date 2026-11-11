<script lang="ts">
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { t } from '~/lib/i18n'
  import { flip } from 'svelte/animate'
  import { match, P } from 'ts-pattern'
  import { draggable, type Placement } from '~/lib/draggable'
  import {
    CONFIRM_DELETE_ABOVE,
    filterShots,
    sitesOf,
    type Shot,
  } from '~/lib/shot'
  import type { OptionsView } from '~/messages'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import Confirm from './confirm.svelte'
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
    onopen: (shot: Shot) => void
    oncopy: (shot: Shot) => void
    onremove: (shots: readonly Shot[]) => void
    onshown: (shots: readonly Shot[]) => void
    onundo: () => void
    onoptions: (view: OptionsView) => void
  }

  const {
    visible,
    ghost,
    shots,
    removed,
    placement,
    onclose,
    onpick,
    onopen,
    oncopy,
    onremove,
    onshown,
    onundo,
    onoptions,
  }: Props = $props()

  let query = $state('')
  let site = $state<string | null>(null)
  let confirming = $state<readonly Shot[] | null>(null)

  const sites = $derived(sitesOf(shots))
  // A site whose snags are all gone stops filtering, so its select can disappear without hiding the rest.
  const filteredSite = $derived(sites.find((each) => each === site) ?? null)
  const shown = $derived(filterShots(shots, { query, site: filteredSite }))

  $effect(() => {
    onshown(shown)
  })

  const deleteLabel = $derived(
    match(shown.length)
      .with(shots.length, () => t('deleteAll'))
      .otherwise((count) => t('deleteShown', String(count))),
  )

  // Keys typed in the popup stop there, so the page's shortcuts do not see them.
  const contain = (event: KeyboardEvent) => {
    event.stopPropagation()
  }

  const deleted = (count: number) =>
    match(count)
      .with(1, () => t('deletedOne'))
      .otherwise((count) => t('deletedMany', String(count)))

  const removeShown = () => {
    match(shown.length)
      .with(P.number.gt(CONFIRM_DELETE_ABOVE), () => {
        confirming = shown
      })
      .otherwise(() => {
        onremove(shown)
      })
  }
</script>

<div
  class="popup-wrapper"
  data-testid="snag-popup"
  inert={!visible}
  class:visible
  class:shrink={ghost}
  use:draggable={placement}>
  <div class="popup-container bg-blur" class:force-ghost={visible && ghost}>
    <header class="flex justify-between items-center mb-4">
      <h2 class="font-black text-sm tracking-widest m-0 opacity-60">
        pointshot
      </h2>
      <div class="flex items-center gap-2">
        <SymbolButton
          name="gear"
          title={t('options')}
          size="sm"
          opaque
          disabled={ghost}
          onclick={() => {
            onoptions('settings')
          }} />
        <SymbolButton
          name="xMark"
          title={t('close')}
          size="sm"
          opaque
          disabled={ghost}
          onclick={onclose} />
      </div>
    </header>

    <div class="mb-4">
      <Button
        size="lg"
        opaque
        icon="cameraViewfinder"
        testId="snag-pick"
        disabled={ghost}
        onclick={onpick}>
        {t('snag')}
      </Button>
    </div>

    {#if shots.length}
      <div class="flex items-center gap-2 mb-3" role="search">
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
        <SymbolButton
          name="booksVerticalFill"
          title={t('browseLibrary')}
          size="sm"
          opaque
          disabled={ghost}
          onclick={() => {
            onoptions('library')
          }} />
        <SymbolButton
          name="trashFill"
          title={deleteLabel}
          size="sm"
          opaque
          colorSeed={COLOR_SEEDS.cancel}
          disabled={ghost || shown.length === 0}
          onclick={removeShown} />
      </div>
    {/if}

    <main>
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
        <div class="empty">
          <h3>{t('noMatchTitle')}</h3>
          <p>{t('noMatchBody')}</p>
        </div>
      {:else}
        <div class="empty">
          <h3>{t('emptyTitle')}</h3>
          <p>{t('emptyBody')}</p>
        </div>
      {/if}
    </main>

    {#if removed.length}
      <footer
        class="flex items-center justify-between gap-3 pt-3 text-sm"
        data-testid="snag-undo"
        in:transitionIn
        out:transitionOut>
        <span>{deleted(removed.length)}</span>
        <Button size="sm" opaque icon="undo" onclick={onundo}
          >{t('undo')}</Button>
      </footer>
    {/if}
  </div>
</div>

{#if confirming}
  <Confirm
    title={t('deleteManyTitle', String(confirming.length))}
    body={t('deleteManyBody')}
    action={t('delete')}
    onconfirm={() => {
      onremove(confirming ?? [])
      confirming = null
    }}
    oncancel={() => {
      confirming = null
    }} />
{/if}

<style lang="scss">
  .empty {
    padding: 24px 0;
    text-align: center;
    h3 {
      margin: 0 0 4px;
      font-size: 1.25em;
      font-weight: 700;
    }
    p {
      margin: 0;
      font-size: 0.875em;
      opacity: 0.6;
    }
  }
</style>
