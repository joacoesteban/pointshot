<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { ResultAsync, okAsync } from 'neverthrow'
  import toast from 'svelte-french-toast'
  import { match } from 'ts-pattern'
  import Button from '~/components/button.svelte'
  import Options from '~/components/options.svelte'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import { Img } from '~/lib/image'
  import type { Shot } from '~/lib/shot'
  import { ShotLibrary } from '~/lib/shot-library'
  import { say } from './browser'
  import Permissions from './permissions.svelte'
  import { Shortcut } from './shortcut'
  import ShortcutDialog from './shortcut-dialog.svelte'
  import { showLibrary, tray } from './tray'

  type Captured = {
    readonly image: string
    readonly width: number
    readonly height: number
    readonly app: string
    readonly title: string
  }

  // Files the captures; the options page's own library refreshes on the revision each save announces.
  const library = new ShotLibrary()

  // The latest capture's save, which a click on the toast may outrun.
  let latest = okAsync<Shot | null, Error>(null)
  let editing = $state.raw<Shot | null>(null)

  // The app already put the image on the clipboard, so the window only files it.
  void listen<Captured>(
    'captured',
    ({ payload: { image, width, height, app, title } }) => {
      latest = Img.thumbnail(Img.dataUrlToBlob(image))
        .andThen((thumbnail) =>
          library.save({
            url: `app:${encodeURIComponent(
              match(app)
                .with('', () => say('screen'))
                .otherwise((app) => app),
            )}`,
            title,
            width,
            height,
            createdAt: Date.now(),
            thumbnail,
            image,
          }),
        )
        .map(([shot]) => shot ?? null)
      void latest.match(() => toast.success(t('copied')), Failure.report)
    },
  )

  // The toast after a capture made with the library hidden opens that capture in the editor.
  void listen('edit', () => {
    showLibrary()
    void latest.map((shot) => {
      editing = shot
    })
  })

  // The extension's toggle-popup: the shortcut hides the window when it is in front, and shows the library otherwise.
  void listen('library', () => {
    const window = getCurrentWindow()
    void ResultAsync.fromPromise(
      Promise.all([window.isVisible(), window.isFocused()]),
      String,
    ).map(([visible, focused]) =>
      match({ visible, focused })
        .with({ visible: true, focused: true }, () => window.hide())
        .otherwise(showLibrary),
    )
  })

  void listen<string>('failed', ({ payload }) => {
    toast.error(t('couldNotSnag', payload))
  })

  // The options page reloads the shortcuts once the promise its button got settles.
  let recording = $state<(() => void) | null>(null)

  const changeShortcut = () =>
    new Promise<void>((resolve) => {
      recording = resolve
    })

  void Shortcut.restore().andThen(tray)
</script>

<Options
  onchangeshortcuts={changeShortcut}
  {editing}
  oneditopened={() => {
    editing = null
  }}>
  {#snippet toolbar()}
    <Button
      size="lg"
      opaque
      icon="cameraViewfinder"
      onclick={() => {
        void invoke('capture', { mode: 'element' })
      }}>
      {t('snag')}
    </Button>
  {/snippet}
  {#snippet notice()}
    <Permissions />
    {#if recording}
      <ShortcutDialog
        onclose={() => {
          recording?.()
          recording = null
        }} />
    {/if}
  {/snippet}
</Options>
