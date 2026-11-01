<script lang="ts">
  import { symbols, type SymbolName } from '~/lib/symbols'

  export let size = '100%'
  export let name: SymbolName

  $: ({ path, geometry } = symbols[name])

  const scaled = (ratio: number) => `calc(${size} * ${String(ratio)})`
</script>

<svg
  viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
  xmlns="http://www.w3.org/2000/svg"
  style:margin="auto"
  height={scaled(geometry.hRatio)}
  width={scaled(geometry.wRatio)}
  style:max-width={size}
  style:min-width={size}>
  <path fill="currentColor" d={path} fill-rule="evenodd" clip-rule="evenodd" />
</svg>
