<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { from, fromEvent, throttle } from 'rxjs'
  import { match, P } from 'ts-pattern'
  import Filters from '~/components/filters.svelte'
  import Outline from '~/components/outline.svelte'
  import Selection from '~/components/selection.svelte'
  import SnagToast from '~/components/snag-toast.svelte'
  import { Chord, type Held, type SnagMode } from '~/lib/chord'
  import type { Frame } from '~/lib/frame'
  import { t } from '~/lib/i18n'
  import type { Area } from '~/lib/region'
  import { SettingsStore, type Settings } from '~/lib/settings'
  import { themeController } from '~/lib/theme-controller'

  type Target = {
    readonly frame: Readonly<Record<'x' | 'y' | 'width' | 'height', number>>
    readonly label: string
  }

  // The aimed node, and the window it sits in for the Window mode, which takes the extension's page slot.
  type Aimed = Target & { readonly window: Target | null }

  type Direction = 'up' | 'down' | 'previous' | 'next'

  const MODES: readonly SnagMode[] = ['element', 'area', 'visible', 'page']

  let aimed = $state.raw<Aimed | null>(null)
  let held = $state.raw<Held>(Chord.released)
  // A shortcut or tray item for one of the extension's other commands opens the overlay pinned to its mode.
  let pinned = $state<SnagMode>(
    match(new URLSearchParams(location.search).get('mode'))
      .with('area', 'visible', 'page', (mode) => mode)
      .otherwise(() => 'element'),
  )
  let marquee = $state.raw<Area | null>(null)
  let density = $state<Settings['density']>('device')
  let width = $state(innerWidth)
  let height = $state(innerHeight)

  SettingsStore.changes().subscribe((settings) => {
    density = settings.density
  })

  const mode = $derived(
    match(Chord.mode({ held, pinned, marquee }))
      .with('element', 'area', 'visible', 'page', (mode) => mode)
      .otherwise(() => pinned),
  )

  const outline = ({
    frame: { x, y, width, height },
    label,
  }: Target): Frame => {
    const bounds = { left: x, top: y, width, height }
    return { bounds, size: bounds, radius: '0', label, scope: null }
  }

  const frame = $derived(
    match({ mode, aimed })
      .returnType<Frame | null>()
      .with({ mode: 'visible' }, ({ mode }) => {
        const bounds = { left: 0, top: 0, width, height }
        return {
          bounds,
          size: bounds,
          radius: '0',
          label: t('modeVisible'),
          scope: mode,
        }
      })
      .with({ mode: 'element', aimed: P.nonNullable }, ({ aimed }) =>
        outline(aimed),
      )
      .with(
        { mode: 'page', aimed: { window: P.nonNullable } },
        ({ aimed: { window } }) => outline(window),
      )
      .otherwise(() => null),
  )

  const send = ({ left, top, width, height }: Area) => {
    void invoke('pick', {
      frame: { x: left, y: top, width, height },
      density,
    })
  }

  const pick = () => {
    match(frame)
      .with(P.nonNullable, ({ bounds }) => {
        send(bounds)
      })
      .otherwise(() => undefined)
  }

  const cancel = () => {
    void invoke('cancel')
  }

  const walk = (direction: Direction) => {
    void invoke('walk', { direction })
  }

  const onkeydown = (event: KeyboardEvent) => {
    held = Chord.read(event)
    match(event.key)
      .with('ArrowUp', () => {
        walk('up')
      })
      .with('ArrowDown', () => {
        walk('down')
      })
      .with('ArrowLeft', () => {
        walk('previous')
      })
      .with('ArrowRight', () => {
        walk('next')
      })
      .with('Enter', pick)
      .with('Escape', cancel)
      .otherwise(() => undefined)
  }

  void listen<Aimed | null>('aim', ({ payload }) => {
    aimed = payload
  })

  // The next point waits for the last hit test, so a slow tree answers the newest point instead of queueing every move.
  fromEvent<MouseEvent>(window, 'mousemove')
    .pipe(
      throttle(
        ({ clientX, clientY }) =>
          from(
            invoke('aim', { x: clientX, y: clientY }).catch(() => undefined),
          ),
        { leading: true, trailing: true },
      ),
    )
    .subscribe()

  // With an overlay on each display, the keys follow the one under the pointer.
  fromEvent(document.documentElement, 'mouseenter').subscribe(() => {
    void getCurrentWindow().setFocus()
  })
</script>

<svelte:window
  bind:innerWidth={width}
  bind:innerHeight={height}
  {onkeydown}
  onkeyup={(event: KeyboardEvent) => {
    held = Chord.read(event)
  }} />

<div use:themeController>
  <!-- The window takes the keys, so the stage needs only the click. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="stage" onclick={pick}></div>
  <Outline {frame} />
  {#if mode === 'area'}
    <Selection
      onpick={send}
      oncancel={cancel}
      onmarquee={(next: Area | null) => {
        marquee = next
      }} />
  {/if}
  <SnagToast
    live={{ mode, held, marquee }}
    modes={MODES}
    onpin={(mode: SnagMode) => {
      pinned = mode
    }}
    oncancel={cancel} />
  <Filters />
</div>

<style lang="scss">
  :global(html),
  :global(body) {
    background: transparent !important;
  }

  /* macOS and Windows pass clicks through fully transparent pixels, so the stage keeps a faint shade to take them. */
  .stage {
    position: fixed;
    inset: 0;
    background-color: rgb(0 0 0 / 0.08);
    cursor: crosshair;
  }
</style>
