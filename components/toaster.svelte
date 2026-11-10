<script lang="ts">
  import { Toaster } from 'svelte-french-toast'
  import { match } from 'ts-pattern'

  type Props = {
    lifted?: boolean
  }

  const { lifted = false }: Props = $props()

  // Clears the snag toast, which sits in the same bottom-centre spot.
  const containerStyle = $derived(
    match(lifted)
      .with(true, () => 'bottom: 128px')
      .with(false, () => 'bottom: 16px')
      .exhaustive(),
  )
</script>

<Toaster
  position="bottom-center"
  containerClassName="snag-toaster"
  {containerStyle}
  toastOptions={{ className: 'bg-blur snag-toast' }} />
