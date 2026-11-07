<script lang="ts">
  import chroma from 'chroma-js'
  import ColorHash from 'color-hash'
  import type { Snippet } from 'svelte'
  import { Id } from '~/lib/id'

  type Props = {
    children: Snippet
    onclick: (event: MouseEvent) => void
    round?: boolean
    opaque?: boolean
    glassy?: boolean
    disabled?: boolean
    roundSize?: string
    roundPadding?: string
    title?: string
    testId?: string
  }

  const {
    children,
    onclick,
    round = false,
    opaque = false,
    glassy = false,
    disabled = false,
    roundSize = '',
    roundPadding = '',
    title = '',
    testId,
  }: Props = $props()

  const colorHash = new ColorHash()
  const opacity = 0.5
  const base = chroma(colorHash.hex(Id.random()))
  const topGradient = base.alpha(opacity).hex()
  const bottomGradient = chroma(topGradient)
    .set('hsl.h', '+90')
    .alpha(opacity)
    .hex()
  const focusColor = base.brighten(2).hex()
  const insetShadowColor = base.brighten(1).alpha(0.3).hex()
</script>

<div class="button-container">
  <button
    type="button"
    {disabled}
    {title}
    aria-label={title || undefined}
    data-testid={testId}
    class="outer f-center btn"
    class:round
    class:opaque
    class:glassy
    style:--gradient-top={topGradient}
    style:--gradient-bottom={bottomGradient}
    style:--focus-color={focusColor}
    style:--inset-shadow-color={insetShadowColor}
    style:--_button-size_={roundSize}
    style:--_round-padding_={roundPadding}
    {onclick}>
    <div class="inner flex gap-2 items-center">
      {@render children()}
    </div>
  </button>
</div>
