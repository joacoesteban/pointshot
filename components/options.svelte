<script lang="ts">
  import { ResultAsync } from 'neverthrow'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import { browser } from 'wxt/browser'
  import { Diagnostics } from '~/lib/diagnostics'
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
  let folder = $state('')

  SettingsStore.changes().subscribe((next) => {
    settings = next
    folder = next.folder
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
      toast.error('Could not save the setting'),
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
                toast.error(
                  'Snag needs permission to manage downloads for this',
                )
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
        () => toast.success('Copied diagnostics'),
        () => toast.error('Could not copy the diagnostics'),
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
        <p class="opacity-60 m-0">Options</p>
      </header>

      <section>
        <h2>Capture</h2>
        <label class="row">
          <span>
            <b>Resolution</b>
            <small>Screen keeps sharp detail on high-density displays.</small>
          </span>
          <select
            class="select select-sm select-bordered"
            aria-label="Resolution"
            value={settings.density}
            onchange={({ currentTarget: { value } }) => {
              update({
                density: match(value)
                  .with('css', () => 'css' as const)
                  .otherwise(() => 'device' as const),
              })
            }}>
            <option value="device">Screen pixels</option>
            <option value="css">One pixel per CSS pixel</option>
          </select>
        </label>
        <label class="row">
          <span>
            <b>Countdown</b>
            <small>How long the timer waits before it snags.</small>
          </span>
          <select
            class="select select-sm select-bordered"
            aria-label="Countdown"
            value={String(settings.delay)}
            onchange={(event) => {
              update({ delay: numberOf(event) })
            }}>
            {#each [1, 2, 3, 5, 10] as seconds (seconds)}
              <option value={String(seconds)}>{seconds} s</option>
            {/each}
          </select>
        </label>
      </section>

      <section>
        <h2>Downloads</h2>
        <label class="row">
          <span>
            <b>Format</b>
            <small>Copies stay PNG, the only format the clipboard takes.</small>
          </span>
          <select
            class="select select-sm select-bordered"
            aria-label="Format"
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
              <b>Quality</b>
              <small>{Math.round(settings.quality * 100)}%</small>
            </span>
            <input
              type="range"
              class="range range-sm max-w-[12rem]"
              aria-label="Quality"
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
            <b>Folder</b>
            <small
              >Inside your downloads folder. Leave empty to save there.</small>
          </span>
          <input
            type="text"
            class="input input-sm input-bordered max-w-[12rem]"
            aria-label="Folder"
            bind:value={folder}
            onchange={() => {
              updateDownloads({ folder: folder.trim() })
            }} />
        </label>
        <label class="row">
          <span>
            <b>Ask where to save</b>
            <small>Show the Save As dialog for every download.</small>
          </span>
          <input
            type="checkbox"
            class="toggle"
            aria-label="Ask where to save"
            checked={settings.saveAs}
            onchange={({ currentTarget: { checked } }) => {
              updateDownloads({ saveAs: checked })
            }} />
        </label>
      </section>

      <section>
        <h2>Library</h2>
        <label class="row">
          <span>
            <b>Snags to keep</b>
            <small>The oldest go once there are more.</small>
          </span>
          <input
            type="number"
            class="input input-sm input-bordered w-24"
            aria-label="Snags to keep"
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
        <h2>Appearance</h2>
        <label class="row">
          <b>Theme</b>
          <select
            class="select select-sm select-bordered"
            aria-label="Theme"
            value={settings.theme}
            onchange={({ currentTarget: { value } }) => {
              update({
                theme: match(value)
                  .with('light', () => 'light' as const)
                  .with('dark', () => 'dark' as const)
                  .otherwise(() => 'system' as const),
              })
            }}>
            <option value="system">Same as the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Keyboard shortcuts</h2>
        <ul class="shortcuts">
          {#each commands as { name, shortcut } (name)}
            <li class="row">
              <span>{name}</span>
              <kbd class="kbd kbd-sm">{shortcut || 'Not set'}</kbd>
            </li>
          {/each}
        </ul>
        {#if import.meta.env.FIREFOX}
          <p class="text-sm opacity-60">
            Change them in Add-ons and themes, under the gear, in Manage
            extension shortcuts.
          </p>
        {:else}
          <button type="button" class="chip mt-2" onclick={openShortcuts}
            >Change shortcuts</button>
        {/if}
      </section>

      <section>
        <h2>Help</h2>
        <div class="row">
          <span>
            <b>Diagnostics</b>
            <small
              >Version, browser, settings and recent errors, to paste in a bug
              report. No page addresses.</small>
          </span>
          <button type="button" class="chip" onclick={copyDiagnostics}
            >Copy diagnostics</button>
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
