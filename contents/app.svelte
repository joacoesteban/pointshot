<script lang="ts">
  import '~/lib/fonts-importer'
  import { match, P } from 'ts-pattern'
  import toast from 'svelte-french-toast'
  import { of, take, timer, type Observable } from 'rxjs'
  import Filters from '~/components/filters.svelte'
  import Highlight from '~/components/highlight.svelte'
  import Popup from '~/components/popup.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Clipboard } from '~/lib/clipboard'
  import { DisposeBag } from '~/lib/dispose-bag'
  import { Download } from '~/lib/download'
  import {
    ClipboardError,
    EmptyAreaError,
    QuotaError,
    StorageError,
  } from '~/lib/errors'
  import { Img } from '~/lib/image'
  import { ElementPicker } from '~/lib/picker'
  import type { Shot } from '~/lib/shot'
  import { ShotLibrary } from '~/lib/shot-library'
  import { Snagger } from '~/lib/snagger'
  import { Stage } from '~/lib/stage'
  import { Stitcher } from '~/lib/stitcher'
  import { themeController } from '~/lib/theme-controller'
  import { DEFAULT_SETTINGS, SettingsStore } from '~/lib/settings'
  import { pickElementStream, togglePopupStream } from '~/messages'

  type Props = {
    host: HTMLElement
    container: HTMLElement
  }

  const { host, container }: Props = $props()

  const library = new ShotLibrary()
  // svelte-ignore state_referenced_locally
  const picker = new ElementPicker(host)
  // svelte-ignore state_referenced_locally
  const snagger = new Snagger(new Stitcher(new Stage(container)), library, host)
  const shots$ = library.shots$

  const idle$: Observable<Element | null> = of(null)

  let visible = $state(false)
  let picking = $state(false)
  let target$ = $state(idle$)
  let settings = $state(DEFAULT_SETTINGS)

  SettingsStore.changes().subscribe((next) => {
    settings = next
  })

  const explain = (error: Error) =>
    match(error)
      .with(
        P.instanceOf(ClipboardError),
        () => 'Saved, but the page blocked the clipboard',
      )
      .with(P.instanceOf(EmptyAreaError), () => 'Nothing visible to snag')
      .with(
        P.instanceOf(QuotaError),
        () => 'Copied, but storage is full. Delete some snags to keep more',
      )
      .with(
        P.instanceOf(StorageError),
        () => 'Copied, but it could not be saved',
      )
      .otherwise(({ message }) => `Could not snag that: ${message}`)

  function pick(delay = 0) {
    match(picking)
      .with(false, () => {
        startPicking(delay)
      })
      .otherwise(() => undefined)
  }

  const countdown = (seconds: number) =>
    `Snagging what is under the pointer in ${String(seconds)}… Esc cancels.`

  function startPicking(delay: number) {
    const { target$: aimed$, picked$ } = picker.pick(delay)
    const { sink, dispose } = new DisposeBag()
    picking = true
    target$ = aimed$
    const hint = toast(
      match(delay)
        .with(
          0,
          () =>
            'Click or press Enter to snag, with Shift to add a margin. Arrows change the element, Esc cancels.',
        )
        .otherwise(countdown),
      { duration: Infinity },
    )
    timer(1000, 1000)
      .pipe(take(Math.max(delay - 1, 0)), sink())
      .subscribe((tick) => {
        toast(countdown(delay - tick - 1), { id: hint, duration: Infinity })
      })
    picked$.subscribe({
      next: ({ element, framing }) => {
        void snagger.snag(element, framing).match(
          () => toast.success('Copied to clipboard'),
          (error) => toast.error(explain(error)),
        )
      },
      complete: () => {
        dispose()
        toast.dismiss(hint)
        picking = false
        target$ = idle$
      },
    })
  }

  function toggle() {
    visible = !visible
    match(visible)
      .with(true, () => {
        void library.refresh().mapErr((error) => toast.error(explain(error)))
      })
      .otherwise(() => undefined)
  }

  function copy(shot: Shot) {
    void Clipboard.writePng(
      library.imageUrl(shot).map((url) => Img.dataUrlToBlob(url)),
    ).match(
      () => toast.success('Copied to clipboard'),
      (error) =>
        toast.error(
          match(error)
            .with(
              P.instanceOf(ClipboardError),
              () => 'The page blocked the clipboard',
            )
            .otherwise(explain),
        ),
    )
  }

  function download(shot: Shot) {
    void library.imageUrl(shot).match(
      (imageUrl) => {
        Download.shot(shot, imageUrl, host)
      },
      (error) => toast.error(explain(error)),
    )
  }

  function remove(shot: Shot) {
    void library.remove(shot).mapErr((error) => toast.error(explain(error)))
  }

  togglePopupStream.subscribe(toggle)
  pickElementStream.subscribe(() => {
    pick()
  })
</script>

<div use:themeController>
  <Popup
    {visible}
    ghost={picking}
    shots={$shots$}
    onclose={() => {
      visible = false
    }}
    onpick={() => {
      pick()
    }}
    onpicklater={() => {
      pick(settings.delay)
    }}
    oncopy={copy}
    ondownload={download}
    onremove={remove} />
  <Highlight {target$} />
  <Filters />
  <Toaster />
</div>
