<script lang="ts">
  import { filter, fromEvent } from 'rxjs'
  import type { Snippet } from 'svelte'
  import { t } from '~/lib/i18n'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    title: string
    testId: string
    onclose: () => void
    // Escape falls back to onclose. The editor uses it to drop a text entry first.
    onescape?: () => void
    subtitle?: Snippet
    footer?: Snippet
    children: Snippet
  }

  const { title, testId, onclose, onescape, subtitle, footer, children }: Props =
    $props()

  $effect(() => {
    const subscription = fromEvent<KeyboardEvent>(window, 'keydown', {
      capture: true,
    })
      .pipe(filter(({ key }) => key === 'Escape'))
      .subscribe((event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        ;(onescape ?? onclose)()
      })
    return () => {
      subscription.unsubscribe()
    }
  })
</script>

<div
  class="backdrop"
  data-testid={testId}
  role="presentation"
  in:transitionIn
  out:transitionOut>
  <button
    type="button"
    class="scrim"
    tabindex="-1"
    aria-hidden="true"
    onclick={onclose}></button>
  <div class="panel bg-blur" role="dialog" aria-label={title}>
    <header class="flex items-start justify-between gap-4 mb-3">
      <div class="min-w-0">
        <h2 class="font-bold text-lg leading-tight truncate m-0">{title}</h2>
        {#if subtitle}
          <p class="text-xs opacity-60 truncate m-0">{@render subtitle()}</p>
        {/if}
      </div>
      <SymbolButton
        name="xMark"
        title={t('close')}
        size="sm"
        opaque
        onclick={onclose} />
    </header>
    {@render children()}
    {#if footer}
      <footer class="flex flex-wrap items-center justify-between gap-3 mt-3">
        {@render footer()}
      </footer>
    {/if}
  </div>
</div>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: #0006;
    cursor: default;
  }
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    max-width: min(1100px, 100%);
    max-height: 100%;
    min-width: min(420px, 100%);
    padding: 1em;
  }
</style>
