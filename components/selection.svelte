<script lang="ts">
  import { fade } from 'svelte/transition'
  import { match, P } from 'ts-pattern'
  import { span, type Area, type Point } from '~/lib/region'

  type Props = {
    onpick: (rect: Area) => void
    oncancel: () => void
    onmarquee: (rect: Area | null) => void
  }

  const { onpick, oncancel, onmarquee }: Props = $props()

  // CSS pixels a drag must cover on each side, so a stray click does not snag a sliver.
  const MIN_SIDE = 4

  let start = $state<Point | null>(null)
  let current = $state<Point | null>(null)

  const rect = $derived(
    match({ start, current })
      .with(
        { start: P.nonNullable, current: P.nonNullable },
        ({ start, current }) => span(start, current),
      )
      .otherwise(() => null),
  )

  const pointOf = ({ clientX: x, clientY: y }: PointerEvent): Point => ({
    x,
    y,
  })

  $effect(() => {
    onmarquee(rect)
  })

  function down(event: PointerEvent) {
    const { currentTarget, pointerId } = event
    match(currentTarget)
      .with(P.instanceOf(Element), (overlay) => {
        overlay.setPointerCapture(pointerId)
      })
      .otherwise(() => undefined)
    start = pointOf(event)
    current = start
  }

  function move(event: PointerEvent) {
    match(start)
      .with(P.nonNullable, () => {
        current = pointOf(event)
      })
      .otherwise(() => undefined)
  }

  // Runs inside the pointerup dispatch, which is the user gesture the clipboard needs.
  function up() {
    match(rect)
      .with(
        { width: P.number.gte(MIN_SIDE), height: P.number.gte(MIN_SIDE) },
        onpick,
      )
      .otherwise(() => {
        start = null
        current = null
      })
  }
</script>

<div
  class="overlay"
  class:dim={rect === null}
  data-testid="snag-selection"
  role="presentation"
  transition:fade={{ duration: 120 }}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  oncontextmenu={(event) => {
    event.preventDefault()
    oncancel()
  }}>
  {#if rect}
    <div
      class="marquee"
      style:left={`${String(rect.left)}px`}
      style:top={`${String(rect.top)}px`}
      style:width={`${String(rect.width)}px`}
      style:height={`${String(rect.height)}px`}>
      <span class="tag bg-blur bg-blur:soft bg-blur:round">
        {Math.round(rect.width)} × {Math.round(rect.height)}
      </span>
    </div>
  {/if}
</div>

<style lang="scss">
  .overlay {
    position: fixed;
    inset: 0;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    transition: background-color 0.15s linear;
    &.dim {
      background: #0003;
    }
  }
  .marquee {
    pointer-events: auto;
  }
  .tag {
    position: absolute;
    left: -1px;
    bottom: calc(100% + 8px);
    padding: 0.25em 0.8em;
    font-size: 12px;
    white-space: nowrap;
  }
</style>
