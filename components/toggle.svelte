<script lang="ts">
  import Button from './button.svelte'

  type Props = {
    checked: boolean
    title: string
    onclick: (event: MouseEvent) => void
    disabled?: boolean
    size?: string
  }

  const { checked, title, onclick, disabled = false, size = '25px' }: Props =
    $props()
</script>

<div class="toggle-container contents" class:checked style:--circle-size={size}>
  <Button role="switch" {checked} {title} {disabled} {onclick}>
    <div class="circle" class:checked></div>
  </Button>
</div>
