<script lang="ts">
  import chroma from 'chroma-js'
  import ColorHash from 'color-hash'
  import type { Snippet } from 'svelte'
  import type { ButtonSize } from '~/lib/button-size'
  import { Id } from '~/lib/id'
  import type { SymbolName } from '~/lib/symbols'
  import Symbol from './symbol.svelte'

  type Props = {
    children: Snippet
    onclick: (event: MouseEvent) => void
    colorSeed?: string | undefined
    size?: ButtonSize
    round?: boolean
    opaque?: boolean
    disabled?: boolean
    highlight?: boolean | undefined
    icon?: SymbolName | undefined
    role?: 'switch' | undefined
    checked?: boolean | undefined
    title?: string
    testId?: string | undefined
  }

  const randomSeed = Id.random()

  const {
    children,
    onclick,
    colorSeed = randomSeed,
    size = 'md',
    round = false,
    opaque = false,
    disabled = false,
    highlight,
    icon,
    role,
    checked,
    title = '',
    testId,
  }: Props = $props()

  const colorHash = new ColorHash()
  const opacity = 0.5
  const base = $derived(chroma(colorHash.hex(colorSeed)))
  const topGradient = $derived(base.alpha(opacity).hex())
  const bottomGradient = $derived(
    chroma(topGradient).set('hsl.h', '+90').alpha(opacity).hex(),
  )
  const focusColor = $derived(base.brighten(2).hex())
  const insetShadowColor = $derived(base.brighten(1).alpha(0.3).hex())
</script>

<div class="button-container">
  <button
    type="button"
    {role}
    {disabled}
    {title}
    aria-label={title || undefined}
    data-testid={testId}
    aria-pressed={highlight}
    aria-checked={checked}
    class="outer f-center btn size-{size}"
    class:btn-sm={size === 'sm'}
    class:round
    class:opaque
    class:highlight
    style:--gradient-top={topGradient}
    style:--gradient-bottom={bottomGradient}
    style:--focus-color={focusColor}
    style:--inset-shadow-color={insetShadowColor}
    {onclick}>
    <div class="inner flex gap-2 items-center">
      {#if icon}
        <Symbol name={icon} size="1em" />
      {/if}
      {@render children()}
    </div>
  </button>
</div>
