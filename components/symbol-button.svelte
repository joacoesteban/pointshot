<script lang="ts">
  import type { ButtonSize } from '~/lib/button-size'
  import type { SymbolName } from '~/lib/symbols'
  import Button from './button.svelte'
  import Symbol from './symbol.svelte'

  type Props = {
    name: SymbolName
    title: string
    onclick: (event: MouseEvent) => void
    size?: ButtonSize
    opaque?: boolean
    disabled?: boolean
    highlight?: boolean | undefined
    colorSeed?: string
    testId?: string | undefined
  }

  const {
    name,
    title,
    onclick,
    size = 'md',
    opaque = false,
    disabled = false,
    highlight,
    colorSeed,
    testId,
  }: Props = $props()
</script>

<Button
  {size}
  {opaque}
  {disabled}
  {highlight}
  {colorSeed}
  {testId}
  {title}
  {onclick}
  round>
  <Symbol {name} />
</Button>
