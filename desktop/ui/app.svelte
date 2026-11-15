<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import toast from 'svelte-french-toast'
  import { match, P } from 'ts-pattern'
  import logo from '~/assets/icon.png'
  import Button from '~/components/button.svelte'
  import Filters from '~/components/filters.svelte'
  import Library from '~/components/library.svelte'
  import Backdrop from '~/components/options/backdrop.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import { Img } from '~/lib/image'
  import {
    DEFAULT_SETTINGS,
    SettingsStore,
    type Settings,
  } from '~/lib/settings'
  import { ShotActions } from '~/lib/shot-actions'
  import { ShotLibrary } from '~/lib/shot-library'
  import { theme } from './theme'

  type Captured = {
    readonly image: string
    readonly width: number
    readonly height: number
    readonly app: string
    readonly title: string
  }

  const SHORTCUT = match(navigator.userAgent)
    .with(P.string.includes('Mac'), () => '⌥⇧S')
    .otherwise(() => 'Alt+Shift+S')

  let settings = $state<Settings>(DEFAULT_SETTINGS)

  const library = new ShotLibrary()
  const actions = new ShotActions(library, document.body)

  SettingsStore.changes().subscribe((next) => {
    settings = next
  })

  // The app already put the image on the clipboard, so the window only files it.
  void listen<Captured>(
    'captured',
    ({ payload: { image, width, height, app, title } }) => {
      void Img.thumbnail(Img.dataUrlToBlob(image))
        .andThen((thumbnail) =>
          library.save({
            url: `app:${encodeURIComponent(app)}`,
            title,
            width,
            height,
            createdAt: Date.now(),
            thumbnail,
            image,
          }),
        )
        .match(() => toast.success(t('copied')), Failure.report)
    },
  )

  void listen<string>('failed', ({ payload }) => {
    toast.error(t('couldNotSnag', payload))
  })
</script>

<div use:theme>
  <div class="page">
    <Backdrop />
    <main class="library">
      <header class="flex items-center justify-between gap-4 mb-8">
        <div class="flex items-center gap-4">
          <img src={logo} alt="" class="w-14 h-14" />
          <h1 class="blend font-black text-4xl m-0">Pointshot</h1>
        </div>
        <Button
          size="lg"
          opaque
          icon="cameraViewfinder"
          onclick={() => {
            void invoke('capture')
          }}>
          {t('snag')}
        </Button>
      </header>
      <Library {library} {actions} {settings} shortcut={SHORTCUT} />
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
  .library {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 24px;
  }
</style>
