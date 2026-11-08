<script lang="ts">
  import type { SymbolName } from '~/lib/symbols'
  import Button from './button.svelte'
  import Symbol from './symbol.svelte'

  type Props = {
    name: SymbolName
    title: string
    onclick: (event: MouseEvent) => void
    size?: string
    padding?: string
    opaque?: boolean
    disabled?: boolean
    highlight?: boolean | undefined
    glassy?: boolean
    colorSeed?: string | undefined
  }

  const {
    name,
    title,
    onclick,
    size = '50px',
    padding = '15%',
    opaque = false,
    disabled = false,
    highlight,
    glassy = false,
    colorSeed,
  }: Props = $props()
</script>

<Button
  {opaque}
  {disabled}
  {highlight}
  {glassy}
  {colorSeed}
  {title}
  {onclick}
  round
  roundSize={size}
  roundPadding={padding}>
  <Symbol {name} />
</Button>
