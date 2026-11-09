<script lang="ts">
  import '~/lib/fonts-importer'
  import { match, P } from 'ts-pattern'
  import toast from 'svelte-french-toast'
  import { okAsync, type ResultAsync } from 'neverthrow'
  import { fromEvent, of, take, timer, type Observable } from 'rxjs'
  import Filters from '~/components/filters.svelte'
  import Highlight from '~/components/highlight.svelte'
  import Editor from '~/components/editor.svelte'
  import Popup from '~/components/popup.svelte'
  import Preview from '~/components/preview.svelte'
  import Selection from '~/components/selection.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Clipboard } from '~/lib/clipboard'
  import { Diagnostics } from '~/lib/diagnostics'
  import { t } from '~/lib/i18n'
  import { DisposeBag } from '~/lib/dispose-bag'
  import { Download, fileName, pathOf } from '~/lib/download'
  import {
    ClipboardError,
    DownloadError,
    EmptyAreaError,
    QuotaError,
    StorageError,
  } from '~/lib/errors'
  import { Img } from '~/lib/image'
  import { ElementPicker } from '~/lib/picker'
  import { PopupPosition, type Position } from '~/lib/popup-position'
  import type { Shot } from '~/lib/shot'
  import { ShotLibrary } from '~/lib/shot-library'
  import { Snagger, type Target } from '~/lib/snagger'
  import { Stage } from '~/lib/stage'
  import { Stitcher } from '~/lib/stitcher'
  import { themeController } from '~/lib/theme-controller'
  import { DEFAULT_SETTINGS, SettingsStore } from '~/lib/settings'
  import type { Area } from '~/lib/region'
  import { ReplyCodec } from '~/lib/reply'
  import {
    downloadFile,
    openOptions,
    captureModeStream,
    pickElementStream,
    togglePopupStream,
    type Mode,
  } from '~/messages'

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
  const removed$ = library.removed$

  const idle$: Observable<Element | null> = of(null)

  let visible = $state(false)
  let picking = $state<boolean>(false)
  let selecting = $state<boolean>(false)
  let selectionHint = $state<string | undefined>()
  let target$ = $state(idle$)
  let settings = $state(DEFAULT_SETTINGS)
  let previewing = $state<{ shot: Shot; image: string | null } | null>(null)
  let editing = $state<{ shot: Shot; image: string } | null>(null)
  let position = $state<Position | null>(null)

  const placement = $derived({
    position,
    onrest: (position: Position) => {
      void PopupPosition.save(position)
    },
  })

  void PopupPosition.load().map((saved) => {
    position = saved
  })

  SettingsStore.changes().subscribe((next) => {
    settings = next
  })

  const explain = (error: Error) =>
    match(error)
      .with(P.instanceOf(ClipboardError), () => t('savedClipboardBlocked'))
      .with(P.instanceOf(EmptyAreaError), () => t('nothingVisible'))
      .with(P.instanceOf(QuotaError), () => t('storageFull'))
      .with(P.instanceOf(StorageError), () => t('notSaved'))
      .otherwise(({ message }) => t('couldNotSnag', message))

  const busy = $derived(picking || selecting)

  const density = () =>
    match(settings.density)
      .with('device', () => devicePixelRatio)
      .with('css', () => 1)
      .exhaustive()

  // Every failure is kept for the diagnostics the options page copies.
  const fail = (error: Error) => {
    void Diagnostics.record(error)
    toast.error(explain(error))
  }

  function snag(target: Target) {
    void snagger.snag(target, density()).match(
      (downscaled) =>
        toast.success(
          match(downscaled)
            .with(true, () => t('copiedScaled'))
            .with(false, () => t('copied'))
            .exhaustive(),
        ),
      fail,
    )
  }

  function pick(delay = 0) {
    match(busy)
      .with(false, () => {
        startPicking(delay)
      })
      .otherwise(() => undefined)
  }

  function capture(mode: Mode) {
    match({ mode, busy })
      .with({ busy: true }, () => undefined)
      .with({ mode: 'selection' }, () => {
        selecting = true
        selectionHint = toast(t('selectionHint'), {
          duration: Infinity,
        })
      })
      .with({ mode: 'visible' }, () => {
        snag({ kind: 'visible' })
      })
      .with({ mode: 'page' }, () => {
        snag({ kind: 'page' })
      })
      .exhaustive()
  }

  function endSelection() {
    selecting = false
    toast.dismiss(selectionHint)
  }

  function select(rect: Area) {
    endSelection()
    snag({ kind: 'selection', rect })
  }

  const countdown = (seconds: number) => t('countdown', String(seconds))

  function startPicking(delay: number) {
    const { target$: aimed$, picked$ } = picker.pick(delay)
    const { sink, dispose } = new DisposeBag()
    picking = true
    target$ = aimed$
    const hint = toast(
      match(delay)
        .with(0, () => t('pickHint'))
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
        snag({ kind: 'element', element, framing })
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
        void library.refresh().mapErr(fail)
      })
      .otherwise(() => undefined)
  }

  function copy(shot: Shot) {
    void Clipboard.writePng(
      library.imageUrl(shot).map((url) => Img.dataUrlToBlob(url)),
    ).match(
      () => toast.success(t('copied')),
      (error) => {
        void Diagnostics.record(error)
        toast.error(
          match(error)
            .with(P.instanceOf(ClipboardError), () => t('clipboardBlocked'))
            .otherwise(explain),
        )
      },
    )
  }

  // Save as and folders go through the downloads API, which falls back to a plain download when its permission was not granted.
  function download(shot: Shot) {
    const { format, quality, saveAs, folder } = settings
    const viaAnchor = (url: string) => {
      Download.shot(shot, url, format, host)
    }
    void library
      .imageUrl(shot)
      .andThen((imageUrl) => Img.encode(imageUrl, format, quality))
      .andThen((url) =>
        match({ saveAs, folder })
          .with({ saveAs: false, folder: '' }, () => {
            viaAnchor(url)
            return okAsync(undefined)
          })
          .otherwise(() =>
            ReplyCodec.decode(
              downloadFile({
                url,
                filename: pathOf(folder, fileName(shot, format)),
                saveAs,
              }),
              DownloadError,
            )
              .map(() => undefined)
              .orElse(() => {
                viaAnchor(url)
                return okAsync(undefined)
              }),
          ),
      )
      .mapErr(fail)
  }

  function remove(shots: readonly Shot[]) {
    const ids = shots.map(({ id }) => id)
    library.remove(shots)
    match(previewing)
      .with({ shot: { id: P.when((id) => ids.includes(id)) } }, () => {
        previewing = null
      })
      .otherwise(() => undefined)
  }

  function open(shot: Shot) {
    previewing = { shot, image: null }
    void library.imageUrl(shot).match(
      (image) => {
        match(previewing)
          .with({ shot: { id: shot.id } }, () => {
            previewing = { shot, image }
          })
          .otherwise(() => undefined)
      },
      (error) => {
        previewing = null
        fail(error)
      },
    )
  }

  function edit(shot: Shot, image: string) {
    previewing = null
    editing = { shot, image }
  }

  function saveEdit(
    png: ResultAsync<Blob, Error>,
    size: { readonly width: number; readonly height: number },
  ) {
    const source = match(editing)
      .with(P.nonNullable, ({ shot: { url, title } }) => ({ url, title }))
      .otherwise(() => ({ url: location.href, title: document.title }))
    editing = null
    void snagger
      .keep(png, okAsync({ ...source, ...size }))
      .match(() => toast.success(t('savedAndCopied')), fail)
  }

  function copyText(text: string, label: string) {
    void Clipboard.writeText(text).match(
      () => toast.success(t('copiedText', label)),
      (error) => {
        void Diagnostics.record(error)
        toast.error(t('clipboardBlocked'))
      },
    )
  }

  library.failures$.subscribe((error) => {
    void Diagnostics.record(error)
    toast.error(t('couldNotDelete'))
  })
  // Removals wait for an undo, so a page that goes away deletes them first.
  fromEvent(window, 'pagehide').subscribe(() => {
    library.flush()
  })

  togglePopupStream.subscribe(toggle)
  pickElementStream.subscribe(() => {
    pick()
  })
  captureModeStream.subscribe(([mode]) => {
    capture(mode)
  })
</script>

<div use:themeController>
  <Popup
    {visible}
    ghost={busy}
    shots={$shots$}
    removed={$removed$}
    {placement}
    onclose={() => {
      visible = false
    }}
    onpick={() => {
      pick()
    }}
    onpicklater={() => {
      pick(settings.delay)
    }}
    oncapture={capture}
    onopen={open}
    oncopy={copy}
    onremove={remove}
    onundo={() => {
      library.undo()
    }}
    onoptions={() => {
      void openOptions(undefined)
    }} />
  {#if previewing}
    <Preview
      shot={previewing.shot}
      image={previewing.image}
      onclose={() => {
        previewing = null
      }}
      oncopy={copy}
      oncopytext={copyText}
      ondownload={download}
      onremove={(shot) => {
        remove([shot])
      }}
      onedit={edit} />
  {/if}
  {#if editing}
    <Editor
      shot={editing.shot}
      image={editing.image}
      onclose={() => {
        editing = null
      }}
      onsave={saveEdit} />
  {/if}
  <Highlight {target$} />
  {#if selecting}
    <Selection onpick={select} oncancel={endSelection} />
  {/if}
  <Filters />
  <Toaster />
</div>
