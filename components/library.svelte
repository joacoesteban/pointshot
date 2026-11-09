<script lang="ts">
  import { flip } from 'svelte/animate'
  import { match } from 'ts-pattern'
  import { COLOR_SEEDS } from '~/lib/color-seeds'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import type { Settings } from '~/lib/settings'
  import { filterShots, siteOf, type Shot } from '~/lib/shot'
  import type { ShotActions } from '~/lib/shot-actions'
  import type { ShotLibrary } from '~/lib/shot-library'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import Button from './button.svelte'
  import ShotCard from './shot-card.svelte'
  import { ShotViewer } from '~/lib/shot-viewer'
  import ShotDialogs from './shot-dialogs.svelte'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    library: ShotLibrary
    actions: ShotActions
    settings: Settings
  }

  const { library, actions, settings }: Props = $props()

  // svelte-ignore state_referenced_locally
  const shots$ = library.shots$
  // svelte-ignore state_referenced_locally
  const removed$ = library.removed$

  let query = $state('')
  let site = $state<string | null>(null)

  // Sites with their snag counts, most snagged first.
  const sites = $derived(
    [
      ...$shots$.reduce(
        (counts, { url }) =>
          counts.set(siteOf(url), (counts.get(siteOf(url)) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)),
  )
  const filteredSite = $derived(
    sites.find(([each]) => each === site)?.[0] ?? null,
  )
  const shown = $derived(filterShots($shots$, { query, site: filteredSite }))

  const count = (count: number) =>
    match(count)
      .with(1, () => t('snagCountOne'))
      .otherwise((count) => t('snagCount', String(count)))

  const deleted = (count: number) =>
    match(count)
      .with(1, () => t('deletedOne'))
      .otherwise((count) => t('deletedMany', String(count)))

  const deleteLabel = $derived(
    match(shown.length)
      .with($shots$.length, () => t('deleteAll'))
      .otherwise((count) => t('deleteShown', String(count))),
  )

  function remove(shots: readonly Shot[]) {
    library.remove(shots)
    viewer.forget(shots)
  }

  // svelte-ignore state_referenced_locally
  const viewer = new ShotViewer(library, actions, () => settings, remove)

  // svelte-ignore state_referenced_locally
  void library.refresh().mapErr(Failure.report)
  // svelte-ignore state_referenced_locally
  library.failures$.subscribe((error) => {
    Failure.report(error, t('couldNotDelete'))
  })
</script>

<section class="library">
  {#if $shots$.length}
    <div class="bar">
      <input
        type="search"
        class="input input-sm input-bordered field search"
        placeholder={t('searchSnags')}
        aria-label={t('searchSnags')}
        bind:value={query} />
      <span class="blend count">{count(shown.length)}</span>
      <SymbolButton
        name="trashFill"
        title={deleteLabel}
        size="sm"
        opaque
        colorSeed={COLOR_SEEDS.cancel}
        disabled={shown.length === 0}
        onclick={() => {
          remove(shown)
        }} />
    </div>
    <div class="sites" role="group" aria-label={t('site')}>
      <Button
        size="sm"
        opaque
        icon="globe"
        colorSeed="all"
        highlight={site === null}
        onclick={() => {
          site = null
        }}>{t('allSites')}</Button>
      {#each sites as [each, total] (each)}
        <Button
          size="sm"
          opaque
          colorSeed={each}
          highlight={site === each}
          onclick={() => {
            site = match(site)
              .with(each, () => null)
              .otherwise(() => each)
          }}>{each} · {total}</Button>
      {/each}
    </div>
  {/if}

  {#if shown.length}
    <div class="grid">
      {#each shown as shot (shot.id)}
        <div animate:flip={{ duration: 300 }} in:transitionIn out:transitionOut>
          <ShotCard
            {shot}
            disabled={false}
            onopen={(shot: Shot) => {
              viewer.open(shot)
            }}
            oncopy={(shot: Shot) => {
              viewer.copy(shot)
            }}
            onremove={(shot: Shot) => {
              remove([shot])
            }} />
        </div>
      {/each}
    </div>
  {:else if $shots$.length}
    <div class="empty blend">
      <h3>{t('noMatchTitle')}</h3>
      <p>{t('noMatchBody')}</p>
    </div>
  {:else}
    <div class="empty blend">
      <h3>{t('emptyTitle')}</h3>
      <p>{t('libraryEmptyBody')}</p>
    </div>
  {/if}

  {#if $removed$.length}
    <div class="undo bg-blur" in:transitionIn out:transitionOut>
      <span>{deleted($removed$.length)}</span>
      <Button
        size="sm"
        opaque
        icon="undo"
        onclick={() => {
          library.undo()
        }}>{t('undo')}</Button>
    </div>
  {/if}
</section>

<ShotDialogs {viewer} />

<style lang="scss">
  .library {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .search {
    flex: 1 1 0;
    min-width: 0;
    max-width: 24rem;
  }
  .count {
    flex: 1 1 auto;
    text-align: right;
    font-weight: 500;
  }
  .sites {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }
  .empty {
    padding: 64px 0;
    text-align: center;
    h3 {
      margin: 0 0 4px;
      font-size: 1.5em;
      font-weight: 700;
    }
    p {
      margin: 0;
    }
  }
  .undo {
    position: sticky;
    bottom: 16px;
    align-self: center;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 8px 8px 20px;
  }
</style>
