<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import toast from 'svelte-french-toast'
  import { match } from 'ts-pattern'
  import Button from '~/components/button.svelte'
  import Options from '~/components/options.svelte'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import { Img } from '~/lib/image'
  import { ShotLibrary } from '~/lib/shot-library'
  import { say } from './browser'
  import Permissions from './permissions.svelte'
  import { tray } from './tray'

  type Captured = {
    readonly image: string
    readonly width: number
    readonly height: number
    readonly app: string
    readonly title: string
  }

  // Files the captures; the options page's own library refreshes on the revision each save announces.
  const library = new ShotLibrary()

  // The app already put the image on the clipboard, so the window only files it.
  void listen<Captured>(
    'captured',
    ({ payload: { image, width, height, app, title } }) => {
      void Img.thumbnail(Img.dataUrlToBlob(image))
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
        .match(() => toast.success(t('copied')), Failure.report)
    },
  )

  void listen<string>('failed', ({ payload }) => {
    toast.error(t('couldNotSnag', payload))
  })

  void tray()
</script>

<Options>
  {#snippet toolbar()}
    <Button
      size="lg"
      opaque
      icon="cameraViewfinder"
      onclick={() => {
        void invoke('capture')
      }}>
      {t('snag')}
    </Button>
  {/snippet}
  {#snippet notice()}
    <Permissions />
  {/snippet}
</Options>
