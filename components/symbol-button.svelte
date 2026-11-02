<script lang="ts">
  import { Id } from '~/lib/id'
  import type { SymbolName } from '~/lib/symbols'
  import Button from './button.svelte'
  import Symbol from './symbol.svelte'

  export let name: SymbolName
  export let size = '50px'
  export let padding = '15%'
  export let opaque = false
  export let disabled = false
  export let glassy = false
  export let colorSeed = Id.random()
  export let title = ''
  export let testId: string | undefined = undefined
</script>

<Button
  {opaque}
  {disabled}
  {glassy}
  {colorSeed}
  {title}
  {testId}
  round={true}
  roundSize={size}
  roundPadding={padding}
  on:click>
  <Symbol {name} />
</Button>
