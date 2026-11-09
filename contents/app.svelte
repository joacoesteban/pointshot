<script lang="ts">
  import '~/lib/fonts-importer'
  import { match } from 'ts-pattern'
  import toast from 'svelte-french-toast'
  import { fromEvent, of, take, timer, type Observable } from 'rxjs'
  import Filters from '~/components/filters.svelte'
  import Highlight from '~/components/highlight.svelte'
  import Popup from '~/components/popup.svelte'
  import Selection from '~/components/selection.svelte'
  import ShotDialogs from '~/components/shot-dialogs.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import { DisposeBag } from '~/lib/dispose-bag'
  import { ElementPicker } from '~/lib/picker'
  import { PopupPosition, type Position } from '~/lib/popup-position'
  import type { Shot } from '~/lib/shot'
  import { ShotActions } from '~/lib/shot-actions'
  import { ShotLibrary } from '~/lib/shot-library'
  import { ShotViewer } from '~/lib/shot-viewer'
  import { Snagger, type Target } from '~/lib/snagger'
  import { Stage } from '~/lib/stage'
  import { Stitcher } from '~/lib/stitcher'
  import { themeController } from '~/lib/theme-controller'
  import { DEFAULT_SETTINGS, SettingsStore } from '~/lib/settings'
  import type { Area } from '~/lib/region'
  import {
    openOptions,
    captureModeStream,
    pickElementStream,
    togglePopupStream,
    type Mode,
    type OptionsView,
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
  // svelte-ignore state_referenced_locally
  const actions = new ShotActions(library, host)
  const shots$ = library.shots$
  const removed$ = library.removed$

  const idle$: Observable<Element | null> = of(null)

  let visible = $state(false)
  let picking = $state<boolean>(false)
  let selecting = $state<boolean>(false)
  let selectionHint = $state<string | undefined>()
  let target$ = $state(idle$)
  let settings = $state(DEFAULT_SETTINGS)
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

  const busy = $derived(picking || selecting)

  const density = () =>
    match(settings.density)
      .with('device', () => devicePixelRatio)
      .with('css', () => 1)
      .exhaustive()

  const fail = (error: Error) => {
    Failure.report(error)
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

  function remove(shots: readonly Shot[]) {
    library.remove(shots)
    viewer.forget(shots)
  }

  const viewer = new ShotViewer(library, actions, () => settings, remove)

  library.failures$.subscribe((error) => {
    Failure.report(error, t('couldNotDelete'))
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
    onopen={(shot: Shot) => {
      viewer.open(shot)
    }}
    oncopy={(shot: Shot) => {
      viewer.copy(shot)
    }}
    onremove={remove}
    onundo={() => {
      library.undo()
    }}
    onoptions={(view: OptionsView) => {
      void openOptions(view)
    }} />
  <ShotDialogs {viewer} />
  <Highlight {target$} />
  {#if selecting}
    <Selection onpick={select} oncancel={endSelection} />
  {/if}
  <Filters />
  <Toaster />
</div>
