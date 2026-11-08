<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    title: string
    help?: string
    as?: 'label' | 'div' | 'li'
    children: Snippet
  }

  const { title, help, as = 'label', children }: Props = $props()
</script>

<svelte:element this={as} class="row">
  <span class="text blend">
    <b>{title}</b>
    {#if help}
      <small>{help}</small>
    {/if}
  </span>
  {@render children()}
</svelte:element>

<style lang="scss">
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 10px 0;
  }
  .text {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
  }
  small {
    font-size: 0.9em;
    font-weight: 500;
  }
</style>
