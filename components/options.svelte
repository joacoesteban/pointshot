<script lang="ts">
  import { ResultAsync } from 'neverthrow'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import { browser } from 'wxt/browser'
  import { Diagnostics } from '~/lib/diagnostics'
  import { t } from '~/lib/i18n'
  import { ClipboardError, toError } from '~/lib/errors'
  import {
    DEFAULT_SETTINGS,
    SettingsStore,
    type Settings,
  } from '~/lib/settings'
  import { REPOSITORY_URL } from '~/lib/links'
  import { themeController } from '~/lib/theme-controller'
  import Button from './button.svelte'
  import Divider from './divider.svelte'
  import Filters from './filters.svelte'
  import Backdrop from './options/backdrop.svelte'
  import Footer from './options/footer.svelte'
  import Row from './options/row.svelte'
  import SymbolButton from './symbol-button.svelte'
  import Toaster from './toaster.svelte'
  import Toggle from './toggle.svelte'

  type Command = { readonly name: string; readonly shortcut: string }

  let settings = $state<Settings>(DEFAULT_SETTINGS)
  let commands = $state<readonly Command[]>([])
  // The folder field and the Save As toggle hold what was typed or clicked until the permission it needs is granted or refused.
  let folder = $state('')
  let saveAs = $state(false)

  const { version } = browser.runtime.getManifest()

  SettingsStore.changes().subscribe((next) => {
    settings = next
    folder = next.folder
    saveAs = next.saveAs
  })

  void browser.commands.getAll().then((all) => {
    commands = all.flatMap(({ description, shortcut }) =>
      match(description)
        .with(P.string.minLength(1), (name) => [
          { name, shortcut: shortcut ?? '' },
        ])
        .otherwise(() => []),
    )
  })

  const update = (patch: Partial<Settings>) => {
    void SettingsStore.update(patch).mapErr(() =>
      toast.error(t('settingNotSaved')),
    )
  }

  // The downloads permission is optional, so it is asked for when a setting first needs it, inside the click or change that set it.
  const updateDownloads = (
    patch: Pick<Partial<Settings>, 'saveAs' | 'folder'>,
  ) => {
    match({ ...settings, ...patch })
      .with({ saveAs: false, folder: '' }, () => {
        update(patch)
      })
      .otherwise(() => {
        void browser.permissions
          .request({ permissions: ['downloads'] })
          .then((granted) => {
            match(granted)
              .with(true, () => {
                update(patch)
              })
              .with(false, () => {
                folder = settings.folder
                saveAs = settings.saveAs
                toast.error(t('downloadsPermission'))
              })
              .exhaustive()
          })
      })
  }

  const open = (url: string) => {
    void browser.tabs.create({ url })
  }

  const copyDiagnostics = () => {
    void Diagnostics.report()
      .andThen((report) =>
        ResultAsync.fromPromise(
          navigator.clipboard.writeText(report),
          toError(ClipboardError),
        ),
      )
      .match(
        () => toast.success(t('copiedDiagnostics')),
        () => toast.error(t('couldNotCopyDiagnostics')),
      )
  }

  const numberOf = ({ currentTarget }: Event) =>
    match(currentTarget)
      .with(
        P.instanceOf(HTMLInputElement),
        ({ valueAsNumber }) => valueAsNumber,
      )
      .with(P.instanceOf(HTMLSelectElement), ({ value }) => Number(value))
      .otherwise(() => NaN)
</script>

<div use:themeController>
  <div class="page">
    <Backdrop />
    <main class="options">
      <header class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="blend font-black text-4xl mt-0 mb-2">
            {t('optionsTitle')}
          </h1>
          <code class="pill blend">{t('version')} <b>{version}</b></code>
        </div>
        <SymbolButton
          name="github"
          title={t('sourceCode')}
          opaque
          onclick={() => {
            open(REPOSITORY_URL)
          }} />
      </header>

      <section>
        <h2 class="blend">{t('sectionCapture')}</h2>
        <Row title={t('resolution')} help={t('resolutionHelp')}>
          <select
            class="select select-sm select-bordered field"
            aria-label={t('resolution')}
            value={settings.density}
            onchange={({ currentTarget: { value } }) => {
              update({
                density: match(value)
                  .with('css', () => 'css' as const)
                  .otherwise(() => 'device' as const),
              })
            }}>
            <option value="device">{t('resolutionDevice')}</option>
            <option value="css">{t('resolutionCss')}</option>
          </select>
        </Row>
        <Row title={t('countdownLabel')} help={t('countdownHelp')}>
          <select
            class="select select-sm select-bordered field"
            aria-label={t('countdownLabel')}
            value={String(settings.delay)}
            onchange={(event) => {
              update({ delay: numberOf(event) })
            }}>
            {#each [1, 2, 3, 5, 10] as seconds (seconds)}
              <option value={String(seconds)}
                >{t('seconds', String(seconds))}</option>
            {/each}
          </select>
        </Row>
      </section>

      <Divider />

      <section>
        <h2 class="blend">{t('sectionDownloads')}</h2>
        <Row title={t('format')} help={t('formatHelp')}>
          <select
            class="select select-sm select-bordered field"
            aria-label={t('format')}
            value={settings.format}
            onchange={({ currentTarget: { value } }) => {
              update({
                format: match(value)
                  .with('jpeg', () => 'jpeg' as const)
                  .with('webp', () => 'webp' as const)
                  .otherwise(() => 'png' as const),
              })
            }}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </Row>
        {#if settings.format !== 'png'}
          <Row title={t('quality')} help={`${String(Math.round(settings.quality * 100))}%`}>
            <input
              type="range"
              class="range range-sm max-w-[12rem]"
              aria-label={t('quality')}
              min="0.5"
              max="1"
              step="0.05"
              value={settings.quality}
              onchange={(event) => {
                update({ quality: numberOf(event) })
              }} />
          </Row>
        {/if}
        <Row title={t('folder')} help={t('folderHelp')}>
          <input
            type="text"
            class="input input-sm input-bordered field max-w-[12rem]"
            aria-label={t('folder')}
            bind:value={folder}
            onchange={() => {
              updateDownloads({ folder: folder.trim() })
            }} />
        </Row>
        <Row title={t('saveAs')} help={t('saveAsHelp')}>
          <Toggle
            checked={saveAs}
            title={t('saveAs')}
            onclick={() => {
              saveAs = !saveAs
              updateDownloads({ saveAs })
            }} />
        </Row>
      </section>

      <Divider />

      <section>
        <h2 class="blend">{t('sectionLibrary')}</h2>
        <Row title={t('keep')} help={t('keepHelp')}>
          <input
            type="number"
            class="input input-sm input-bordered field w-24"
            aria-label={t('keep')}
            min="10"
            max="1000"
            step="10"
            value={settings.limit}
            onchange={(event) => {
              update({ limit: numberOf(event) })
            }} />
        </Row>
      </section>

      <Divider />

      <section>
        <h2 class="blend">{t('sectionAppearance')}</h2>
        <Row title={t('theme')}>
          <select
            class="select select-sm select-bordered field"
            aria-label={t('theme')}
            value={settings.theme}
            onchange={({ currentTarget: { value } }) => {
              update({
                theme: match(value)
                  .with('light', () => 'light' as const)
                  .with('dark', () => 'dark' as const)
                  .otherwise(() => 'system' as const),
              })
            }}>
            <option value="system">{t('themeSystem')}</option>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
          </select>
        </Row>
      </section>

      <Divider />

      <section>
        <h2 class="blend">{t('sectionShortcuts')}</h2>
        <ul class="shortcuts">
          {#each commands as { name, shortcut } (name)}
            <Row as="li" title={name}>
              <kbd class="pill blend">{shortcut || t('notSet')}</kbd>
            </Row>
          {/each}
        </ul>
        {#if import.meta.env.FIREFOX}
          <p class="blend text-sm">{t('firefoxShortcuts')}</p>
        {:else}
          <div class="flex mt-2">
            <Button
              small
              opaque
              onclick={() => {
                open('chrome://extensions/shortcuts')
              }}>{t('changeShortcuts')}</Button>
          </div>
        {/if}
      </section>

      <Divider />

      <section>
        <h2 class="blend">{t('sectionHelp')}</h2>
        <Row as="div" title={t('diagnostics')} help={t('diagnosticsHelp')}>
          <Button small opaque icon="docOnDoc" onclick={copyDiagnostics}
            >{t('copyDiagnostics')}</Button>
        </Row>
      </section>

      <Footer />
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
    max-width: 640px;
    margin: 0 auto;
    padding: 48px 24px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1.5em;
    font-weight: 700;
  }
  .shortcuts {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
