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
  import { themeController } from '~/lib/theme-controller'
  import Toaster from './toaster.svelte'

  type Command = { readonly name: string; readonly shortcut: string }

  let settings = $state<Settings>(DEFAULT_SETTINGS)
  let commands = $state<readonly Command[]>([])
  // The folder field and the Save As toggle hold what was typed or clicked until the permission it needs is granted or refused.
  let folder = $state('')
  let saveAs = $state(false)

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

  const openShortcuts = () => {
    void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })
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
    <main class="options">
      <header class="mb-8">
        <h1 class="font-black text-4xl m-0">snag</h1>
        <p class="opacity-60 m-0">{t('options')}</p>
      </header>

      <section>
        <h2>{t('sectionCapture')}</h2>
        <label class="row">
          <span>
            <b>{t('resolution')}</b>
            <small>{t('resolutionHelp')}</small>
          </span>
          <select
            class="select select-sm select-bordered"
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
        </label>
        <label class="row">
          <span>
            <b>{t('countdownLabel')}</b>
            <small>{t('countdownHelp')}</small>
          </span>
          <select
            class="select select-sm select-bordered"
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
        </label>
      </section>

      <section>
        <h2>{t('sectionDownloads')}</h2>
        <label class="row">
          <span>
            <b>{t('format')}</b>
            <small>{t('formatHelp')}</small>
          </span>
          <select
            class="select select-sm select-bordered"
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
        </label>
        {#if settings.format !== 'png'}
          <label class="row">
            <span>
              <b>{t('quality')}</b>
              <small>{Math.round(settings.quality * 100)}%</small>
            </span>
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
          </label>
        {/if}
        <label class="row">
          <span>
            <b>{t('folder')}</b>
            <small>{t('folderHelp')}</small>
          </span>
          <input
            type="text"
            class="input input-sm input-bordered max-w-[12rem]"
            aria-label={t('folder')}
            bind:value={folder}
            onchange={() => {
              updateDownloads({ folder: folder.trim() })
            }} />
        </label>
        <label class="row">
          <span>
            <b>{t('saveAs')}</b>
            <small>{t('saveAsHelp')}</small>
          </span>
          <input
            type="checkbox"
            class="toggle"
            aria-label={t('saveAs')}
            bind:checked={saveAs}
            onchange={() => {
              updateDownloads({ saveAs })
            }} />
        </label>
      </section>

      <section>
        <h2>{t('sectionLibrary')}</h2>
        <label class="row">
          <span>
            <b>{t('keep')}</b>
            <small>{t('keepHelp')}</small>
          </span>
          <input
            type="number"
            class="input input-sm input-bordered w-24"
            aria-label={t('keep')}
            min="10"
            max="1000"
            step="10"
            value={settings.limit}
            onchange={(event) => {
              update({ limit: numberOf(event) })
            }} />
        </label>
      </section>

      <section>
        <h2>{t('sectionAppearance')}</h2>
        <label class="row">
          <b>{t('theme')}</b>
          <select
            class="select select-sm select-bordered"
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
        </label>
      </section>

      <section>
        <h2>{t('sectionShortcuts')}</h2>
        <ul class="shortcuts">
          {#each commands as { name, shortcut } (name)}
            <li class="row">
              <span>{name}</span>
              <kbd class="kbd kbd-sm">{shortcut || t('notSet')}</kbd>
            </li>
          {/each}
        </ul>
        {#if import.meta.env.FIREFOX}
          <p class="text-sm opacity-60">{t('firefoxShortcuts')}</p>
        {:else}
          <button type="button" class="chip mt-2" onclick={openShortcuts}
            >{t('changeShortcuts')}</button>
        {/if}
      </section>

      <section>
        <h2>{t('sectionHelp')}</h2>
        <div class="row">
          <span>
            <b>{t('diagnostics')}</b>
            <small>{t('diagnosticsHelp')}</small>
          </span>
          <button type="button" class="chip" onclick={copyDiagnostics}
            >{t('copyDiagnostics')}</button>
        </div>
      </section>
    </main>
  </div>
  <Toaster />
</div>

<style lang="scss">
  :global(body) {
    margin: 0;
  }
  .page {
    min-height: 100vh;
    background: oklch(var(--b1));
    color: oklch(var(--bc));
  }
  .options {
    max-width: 640px;
    margin: 0 auto;
    padding: 48px 24px;
  }
  section {
    margin-bottom: 32px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.5;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 12px 0;
    border-bottom: 1px solid #8883;
    > span {
      display: flex;
      flex-direction: column;
    }
    small {
      opacity: 0.6;
    }
  }
  .shortcuts {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
