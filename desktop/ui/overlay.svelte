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
  import { theme } from './theme'

  type Aimed = {
    readonly frame: Readonly<Record<'x' | 'y' | 'width' | 'height', number>>
    readonly label: string
  }

  type Direction = 'up' | 'down' | 'previous' | 'next'

  const MODES: readonly SnagMode[] = ['element', 'area', 'visible']

  let aimed = $state.raw<Aimed | null>(null)
  let held = $state.raw<Held>(Chord.released)
  let pinned = $state<SnagMode>('element')
  let marquee = $state.raw<Area | null>(null)
  let width = $state(innerWidth)
  let height = $state(innerHeight)

  const mode = $derived(
    match(Chord.mode({ held, pinned, marquee }))
      .with('element', 'area', 'visible', (mode) => mode)
      .otherwise(() => pinned),
  )

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
      .with(
        { mode: 'element', aimed: P.nonNullable },
        ({ aimed: { frame, label } }) => {
          const bounds = {
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
          }
          return { bounds, size: bounds, radius: '0', label, scope: null }
        },
      )
      .otherwise(() => null),
  )

  const send = ({ left, top, width, height }: Area) => {
    void invoke('pick', { frame: { x: left, y: top, width, height } })
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

<div use:theme>
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
