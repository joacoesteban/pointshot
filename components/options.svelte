<script lang="ts">
  import { fromEvent, map, startWith } from 'rxjs'
  import { match, P } from 'ts-pattern'
  import { browser } from 'wxt/browser'
  import type { Command } from '~/lib/command'
  import { t } from '~/lib/i18n'
  import {
    DEFAULT_SETTINGS,
    SettingsStore,
    type Settings,
  } from '~/lib/settings'
  import logo from '~/assets/icon.png'
  import { REPOSITORY_URL } from '~/lib/links'
  import { ShotActions } from '~/lib/shot-actions'
  import { ShotLibrary } from '~/lib/shot-library'
  import type { SymbolName } from '~/lib/symbols'
  import { themeController } from '~/lib/theme-controller'
  import type { OptionsView } from '~/messages'
  import Button from './button.svelte'
  import Filters from './filters.svelte'
  import Library from './library.svelte'
  import Backdrop from './options/backdrop.svelte'
  import Footer from './options/footer.svelte'
  import SettingsView from './options/settings.svelte'
  import SymbolButton from './symbol-button.svelte'
  import Toaster from './toaster.svelte'

  let settings = $state<Settings>(DEFAULT_SETTINGS)
  let commands = $state<readonly Command[]>([])

  const { version } = browser.runtime.getManifest()

  const library = new ShotLibrary()
  const actions = new ShotActions(library, document.body)

  // The view lives in the URL hash, so the popup can open the library directly and reloads keep it.
  const viewOf = (hash: string): OptionsView =>
    match(hash)
      .with('#library', () => 'library' as const)
      .otherwise(() => 'settings' as const)

  let view = $state<OptionsView>(viewOf(location.hash))

  fromEvent(window, 'hashchange')
    .pipe(
      startWith(null),
      map(() => viewOf(location.hash)),
    )
    .subscribe((next) => {
      view = next
    })

  const views: readonly {
    view: OptionsView
    label: string
    icon: SymbolName
  }[] = [
    { view: 'settings', label: t('settingsTitle'), icon: 'sliderHorizontal3' },
    { view: 'library', label: t('libraryTitle'), icon: 'booksVerticalFill' },
  ]

  SettingsStore.changes().subscribe((next) => {
    settings = next
  })

  void browser.commands.getAll().then((all) => {
    commands = all.flatMap(({ name, description, shortcut }) =>
      match({ name, description })
        .with(
          { name: P.string, description: P.string.minLength(1) },
          ({ name: command, description: name }) => [
            { command, name, shortcut: shortcut ?? '' },
          ],
        )
        .otherwise(() => []),
    )
  })

  const pickShortcut = $derived(
    commands.find(({ command }) => command === 'pick-element')?.shortcut ?? '',
  )

  const open = (url: string) => {
    void browser.tabs.create({ url })
  }
</script>

<div use:themeController>
  <div class="page">
    <Backdrop />
    <main class="options" class:wide={view === 'library'}>
      <header class="flex items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <img src={logo} alt="" class="w-14 h-14" />
          <h1 class="blend font-black text-4xl m-0">Pointshot</h1>
        </div>
        <SymbolButton
          name="github"
          title={t('sourceCode')}
          size="lg"
          opaque
          onclick={() => {
            open(REPOSITORY_URL)
          }} />
      </header>

      <nav class="flex gap-2 mb-8" aria-label={t('optionsTitle')}>
        {#each views as { view: option, label, icon } (option)}
          <Button
            size="sm"
            opaque
            {icon}
            colorSeed={option}
            highlight={view === option}
            onclick={() => {
              location.hash = option
            }}>{label}</Button>
        {/each}
      </nav>

      {#if view === 'library'}
        <Library {library} {actions} {settings} shortcut={pickShortcut} />
      {:else}
        <SettingsView {settings} {commands} />
      {/if}

      <Footer {version} />
    </main>
  </div>
  <Filters />
  <Toaster />
</div>

<style lang="scss">
  :global(body) {
    margin: 0;
  }
  .page {
    min-height: 100vh;
  }
  .options {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    max-width: 640px;
    margin: 0 auto;
    padding: 48px 24px;
    transition: max-width 0.3s var(--bezier-chill);
    &.wide {
      max-width: 1100px;
    }
  }
</style>
