<script lang="ts">
  import { filter, fromEvent } from 'rxjs'
  import { match, P } from 'ts-pattern'
  import { age } from '~/lib/age'
  import { paint } from '~/lib/paint'
  import { siteOf, textOf, type Shot, type ShotText } from '~/lib/shot'
  import { transitionIn, transitionOut } from '~/lib/transitions'
  import SymbolButton from './symbol-button.svelte'

  type Props = {
    shot: Shot
    image: string | null
    onclose: () => void
    oncopy: (shot: Shot) => void
    oncopytext: (text: string, label: string) => void
    ondownload: (shot: Shot) => void
    onremove: (shot: Shot) => void
    onedit: (shot: Shot, image: string) => void
  }

  const {
    shot,
    image,
    onclose,
    oncopy,
    oncopytext,
    ondownload,
    onremove,
    onedit,
  }: Props = $props()

  const { url, title, width, height, createdAt } = $derived(shot)

  const texts: readonly { text: ShotText; label: string }[] = [
    { text: 'markdown', label: 'Markdown' },
    { text: 'dataUrl', label: 'Data URL' },
    { text: 'link', label: 'Page link' },
  ]

  $effect(() => {
    const subscription = fromEvent<KeyboardEvent>(window, 'keydown', {
      capture: true,
    })
      .pipe(filter(({ key }) => key === 'Escape'))
      .subscribe((event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        onclose()
      })
    return () => {
      subscription.unsubscribe()
    }
  })
</script>

<div
  class="backdrop"
  data-testid="snag-preview"
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
        <h2 class="font-bold text-lg leading-tight truncate m-0">
          {title || siteOf(url)}
        </h2>
        <p class="text-xs opacity-60 truncate m-0">
          <a href={url} target="_blank" rel="noreferrer" class="underline"
            >{siteOf(url)}</a>
          · {width} × {height} · {age(createdAt)}
        </p>
      </div>
      <SymbolButton
        name="xMark"
        title="Close"
        opaque
        size="36px"
        padding="30%"
        onclick={onclose} />
    </header>

    <div class="image">
      {#if image}
        <canvas use:paint={{ dataUrl: image, maxWidth: Infinity }}></canvas>
      {:else}
        <span class="loading loading-spinner"></span>
      {/if}
    </div>

    <footer class="flex flex-wrap items-center justify-between gap-3 mt-3">
      <div class="flex items-center gap-2">
        <SymbolButton
          name="docOnDoc"
          title="Copy"
          size="38px"
          padding="28%"
          glassy
          onclick={() => {
            oncopy(shot)
          }} />
        <SymbolButton
          name="squareAndArrowDown"
          title="Download"
          size="38px"
          padding="28%"
          glassy
          onclick={() => {
            ondownload(shot)
          }} />
        <SymbolButton
          name="pencil"
          title="Edit"
          size="38px"
          padding="28%"
          glassy
          disabled={image === null}
          onclick={() => {
            match(image)
              .with(P.string, (image) => {
                onedit(shot, image)
              })
              .otherwise(() => undefined)
          }} />
        <SymbolButton
          name="trashFill"
          title="Delete"
          size="38px"
          padding="28%"
          glassy
          onclick={() => {
            onremove(shot)
          }} />
      </div>
      <div class="flex items-center gap-1 text-xs">
        <span class="opacity-60 mr-1">Copy as</span>
        {#each texts as { text, label } (text)}
          <button
            type="button"
            class="chip"
            disabled={image === null}
            onclick={() => {
              oncopytext(textOf(text, shot, image ?? ''), label)
            }}>{label}</button>
        {/each}
      </div>
    </footer>
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
  .image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    overflow: auto;
    border-radius: 10px;
    background-image: repeating-conic-gradient(#8881 0 25%, transparent 0 50%);
    background-size: 16px 16px;
    canvas {
      max-width: 100%;
      max-height: calc(100vh - 220px);
      object-fit: contain;
    }
  }
</style>
