<script lang="ts">
  import chroma from 'chroma-js'
  import ColorHash from 'color-hash'
  import { createEventDispatcher } from 'svelte'
  import { Id } from '~/lib/id'

  const colorHash = new ColorHash()
  const opacity = 0.5

  export let colorSeed = Id.random()
  export let round = false
  export let opaque = false
  export let glassy = false
  export let ping = false
  export let disabled = false
  export let roundSize = ''
  export let roundPadding = ''
  export let title = ''
  export let testId: string | undefined = undefined

  $: base = chroma(colorHash.hex(colorSeed))
  $: topGradient = base.alpha(opacity).hex()
  $: bottomGradient = chroma(topGradient)
    .set('hsl.h', '+90')
    .alpha(opacity)
    .hex()
  $: focusColor = base.brighten(2).hex()
  $: insetShadowColor = base.brighten(1).alpha(0.3).hex()

  const dispatch = createEventDispatcher<{ click: MouseEvent }>()
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
    class:ping
    style:--gradient-top={topGradient}
    style:--gradient-bottom={bottomGradient}
    style:--focus-color={focusColor}
    style:--inset-shadow-color={insetShadowColor}
    style:--_button-size_={roundSize}
    style:--_round-padding_={roundPadding}
    on:click={(event) => dispatch('click', event)}>
    <div class="inner flex gap-2 items-center">
      <slot />
    </div>
  </button>
</div>
