<script lang="ts">
  import '~/lib/fonts-importer'
  import { match, P } from 'ts-pattern'
  import toast from 'svelte-french-toast'
  import { of, type Observable } from 'rxjs'
  import Filters from '~/components/filters.svelte'
  import Highlight from '~/components/highlight.svelte'
  import Popup from '~/components/popup.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Clipboard } from '~/lib/clipboard'
  import { Download } from '~/lib/download'
  import { ClipboardError, EmptyAreaError, StorageError } from '~/lib/errors'
  import { Img } from '~/lib/image'
  import { ElementPicker } from '~/lib/picker'
  import type { Shot } from '~/lib/shot'
  import { ShotLibrary } from '~/lib/shot-library'
  import { Snagger } from '~/lib/snagger'
  import { Stage } from '~/lib/stage'
  import { themeController } from '~/lib/theme-controller'
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
  const snagger = new Snagger(new Stage(container), library)
  const shots$ = library.shots$

  const idle$: Observable<Element | null> = of(null)

  let visible = $state(false)
  let picking = $state(false)
  let target$ = $state(idle$)

  const explain = (error: Error) =>
    match(error)
      .with(
        P.instanceOf(ClipboardError),
        () => 'Saved, but the page blocked the clipboard',
      )
      .with(P.instanceOf(EmptyAreaError), () => 'Nothing visible to snag')
      .with(
        P.instanceOf(StorageError),
        () => 'Copied, but it could not be saved',
      )
      .otherwise(({ message }) => `Could not snag that: ${message}`)

  function pick() {
    match(picking)
      .with(false, startPicking)
      .otherwise(() => undefined)
  }

  function startPicking() {
    const { target$: aimed$, picked$ } = picker.pick()
    picking = true
    target$ = aimed$
    const hint = toast(
      'Click to snag, ↑ ↓ to change element. Press ESC to cancel.',
      { duration: Infinity },
    )
    picked$.subscribe({
      next: (element) => {
        void snagger.snag(element).match(
          () => toast.success('Copied to clipboard'),
          (error) => toast.error(explain(error)),
        )
      },
      complete: () => {
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
  pickElementStream.subscribe(pick)
</script>

<div use:themeController>
  <Popup
    {visible}
    ghost={picking}
    shots={$shots$}
    onclose={() => {
      visible = false
    }}
    onpick={pick}
    oncopy={copy}
    ondownload={download}
    onremove={remove} />
  <Highlight {target$} />
  <Filters />
  <Toaster />
</div>
