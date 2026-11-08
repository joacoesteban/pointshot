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
    pressed?: boolean | undefined
    glassy?: boolean
  }

  const {
    name,
    title,
    onclick,
    size = '50px',
    padding = '15%',
    opaque = false,
    disabled = false,
    pressed,
    glassy = false,
  }: Props = $props()
</script>

<Button
  {opaque}
  {disabled}
  {pressed}
  {glassy}
  {title}
  {onclick}
  round
  roundSize={size}
  roundPadding={padding}>
  <Symbol {name} />
</Button>
