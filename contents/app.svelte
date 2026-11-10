<script lang="ts">
  import '~/lib/fonts-importer'
  import { match } from 'ts-pattern'
  import toast from 'svelte-french-toast'
  import { of, type Observable } from 'rxjs'
  import Filters from '~/components/filters.svelte'
  import Highlight from '~/components/highlight.svelte'
  import Popup from '~/components/popup.svelte'
  import Selection from '~/components/selection.svelte'
  import ShotDialogs from '~/components/shot-dialogs.svelte'
  import SnagToast from '~/components/snag-toast.svelte'
  import Toaster from '~/components/toaster.svelte'
  import { Chord, type SnagMode, type SnagState } from '~/lib/chord'
  import { Failure } from '~/lib/failure'
  import { t } from '~/lib/i18n'
  import { ElementPicker, type PickSession } from '~/lib/picker'
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
  let session = $state.raw<PickSession | null>(null)
  let live = $state.raw<SnagState>(Chord.idle)
  let target$ = $state(idle$)
  let settings = $state(DEFAULT_SETTINGS)
  // What the popup's grid shows after its search and site filter, so the preview's arrow keys walk the same list.
  let shown = $state<readonly Shot[]>([])
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

  const busy = $derived(session !== null)

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

  function pick() {
    match(busy)
      .with(false, () => {
        begin('element')
      })
      .otherwise(() => undefined)
  }

  function capture(mode: Mode) {
    match({ mode, busy })
      .with({ busy: true }, () => undefined)
      .with({ mode: 'selection' }, () => {
        begin('area')
      })
      .with({ mode: 'visible' }, () => {
        snag({ kind: 'visible' })
      })
      .with({ mode: 'page' }, () => {
        snag({ kind: 'page' })
      })
      .exhaustive()
  }

  function begin(mode: SnagMode) {
    const current = picker.pick(mode)
    const { target$: aimed$, state$, picked$ } = current
    session = current
    target$ = aimed$
    state$.subscribe((state) => {
      live = state
    })
    picked$.subscribe({
      next: snag,
      complete: () => {
        session = null
        live = Chord.idle
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

  const viewer = new ShotViewer(
    library,
    actions,
    () => settings,
    () => shown,
    remove,
  )

  library.failures$.subscribe((error) => {
    Failure.report(error, t('couldNotDelete'))
  })
  togglePopupStream.subscribe(toggle)
  pickElementStream.subscribe(pick)
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
    onpick={pick}
    onopen={(shot: Shot) => {
      viewer.open(shot)
    }}
    oncopy={(shot: Shot) => {
      viewer.copy(shot)
    }}
    onremove={remove}
    onshown={(shots: readonly Shot[]) => {
      shown = shots
    }}
    onundo={() => {
      library.undo()
    }}
    onoptions={(view: OptionsView) => {
      void openOptions(view)
    }} />
  <ShotDialogs {viewer} />
  <Highlight {target$} mode={live.mode} />
  {#if session}
    {@const { pin, mark, cancel } = session}
    {#if live.mode === 'area'}
      <Selection
        onpick={(rect: Area) => {
          cancel()
          snag({ kind: 'selection', rect })
        }}
        oncancel={cancel}
        onmarquee={mark} />
    {/if}
    <SnagToast {live} onpin={pin} oncancel={cancel} />
  {/if}
  <Filters />
  <Toaster lifted={busy} />
</div>
