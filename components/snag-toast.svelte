<script lang="ts">
  import { backOut, cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import { match, P } from 'ts-pattern'
  import { Chord, type Held, type SnagMode, type SnagState } from '~/lib/chord'
  import { t } from '~/lib/i18n'
  import type { SymbolName } from '~/lib/symbols'
  import Symbol from './symbol.svelte'

  type Props = {
    live: SnagState
    onpin: (mode: SnagMode) => void
    oncancel: () => void
  }

  const { live, onpin, oncancel }: Props = $props()

  type Modifier = keyof Held

  type Entry = {
    readonly mode: SnagMode
    readonly label: string
    readonly hold: readonly Modifier[]
  }

  const ENTRIES: readonly Entry[] = [
    { mode: 'element', label: t('modeElement'), hold: [] },
    { mode: 'area', label: t('modeArea'), hold: ['shift'] },
    { mode: 'visible', label: t('modeVisible'), hold: ['command'] },
    { mode: 'page', label: t('modePage'), hold: ['command', 'shift'] },
  ]

  const ARROWS = ['↑', '↓', '←', '→']

  const GLYPHS: Readonly<Record<Modifier, string>> = {
    shift: '⇧',
    command: Chord.commandGlyph(navigator.userAgent),
  }

  type Status = {
    readonly symbol: SymbolName
    readonly text: string
    readonly size?: string
  }

  const { mode, held, marquee } = $derived(live)

  const index = $derived(ENTRIES.findIndex((entry) => entry.mode === mode))

  const status: Status = $derived(
    match({ mode, marquee })
      .returnType<Status>()
      .with({ marquee: P.nonNullable }, ({ marquee: { width, height } }) => ({
        symbol: 'rectangleDashed',
        text: t('hintRelease'),
        size: `${String(Math.round(width))} × ${String(Math.round(height))}`,
      }))
      .with({ mode: 'element' }, () => ({
        symbol: 'cursorArrowRays',
        text: t('hintElement'),
      }))
      .with({ mode: 'area' }, () => ({
        symbol: 'rectangleDashed',
        text: t('hintArea'),
      }))
      .with({ mode: 'visible' }, () => ({
        symbol: 'window',
        text: t('hintVisible'),
      }))
      .with({ mode: 'page' }, () => ({
        symbol: 'page',
        text: t('hintPage'),
      }))
      .exhaustive(),
  )
</script>

<div class="anchor">
  <div
    class="hud bg-blur"
    data-testid="snag-toast"
    data-mode={mode}
    in:fly={{ y: 28, duration: 320, easing: backOut }}
    out:fly={{ y: 16, duration: 140, easing: cubicOut }}>
    <div
      class="modes"
      role="radiogroup"
      aria-label={t('snagMode')}
      style:--index={String(index)}>
      <span class="thumb"></span>
      {#each ENTRIES as entry (entry.mode)}
        <button
          type="button"
          role="radio"
          class="mode"
          class:active={entry.mode === mode}
          aria-checked={entry.mode === mode}
          data-testid={`snag-mode-${entry.mode}`}
          onclick={() => {
            onpin(entry.mode)
          }}>
          <span class="name">{entry.label}</span>
          {#if entry.hold.length}
            <span class="keys">
              {#each entry.hold as key (key)}
                <kbd class="key" class:down={held[key]}>{GLYPHS[key]}</kbd>
              {/each}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="status">
      <div class="message" aria-live="polite">
        {#key status.text}
          <span
            class="line"
            in:fly={{ y: 8, duration: 200, easing: cubicOut }}
            out:fade={{ duration: 60 }}>
            <span class="glyph"
              ><Symbol name={status.symbol} size="18px" /></span>
            <span class="text">{status.text}</span>
            {#if status.size}
              <span class="size">{status.size}</span>
            {/if}
          </span>
        {/key}
      </div>
      <div class="controls">
        {#if mode === 'element'}
          <span
            class="keys"
            title={t('hintArrows')}
            transition:fade={{ duration: 120 }}>
            {#each ARROWS as arrow (arrow)}
              <kbd class="key">{arrow}</kbd>
            {/each}
          </span>
        {/if}
        <button
          type="button"
          class="key escape"
          title={t('cancel')}
          aria-label={t('cancel')}
          onclick={oncancel}>
          Esc
        </button>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .anchor {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 24px;
    z-index: 9999;
    display: flex;
    justify-content: center;
    padding: 0 16px;
    pointer-events: none;
  }

  .hud {
    --hue: 150;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: max-content;
    max-width: 100%;
    padding: 6px;
    font-size: 14px;
    user-select: none;

    &[data-mode='area'] {
      --hue: 195;
    }
    &[data-mode='visible'] {
      --hue: 260;
    }
    &[data-mode='page'] {
      --hue: 325;
    }
  }

  .modes {
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }

  .thumb {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 25%;
    border-radius: 11px;
    background-color: hsl(var(--hue) 90% 58% / 0.32);
    box-shadow: inset 0 0 0 1px hsl(var(--hue) 90% 70% / 0.65);
    transform: translateX(calc(var(--index) * 100%));
    transition:
      transform 0.28s cubic-bezier(0.3, 1.35, 0.5, 1),
      background-color 0.2s linear,
      box-shadow 0.2s linear;
  }

  .mode {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 12px;
    white-space: nowrap;
    font-weight: 500;
    color: inherit;
    border-radius: 11px;
    opacity: 0.65;
    transition: opacity 0.15s linear;

    &:hover,
    &:focus-visible,
    &.active {
      opacity: 1;
    }
    &.active {
      font-weight: 700;
    }
    &:focus-visible {
      outline: 2px solid hsl(var(--hue) 90% 70%);
      outline-offset: -2px;
    }
  }

  .keys {
    display: inline-flex;
    gap: 3px;
  }

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    color: inherit;
    border-radius: 6px;
    background-color: oklch(var(--bc) / 0.12);
    box-shadow: 0 1.5px 0 oklch(var(--bc) / 0.28);
    transition:
      transform 0.08s linear,
      background-color 0.12s linear,
      box-shadow 0.08s linear,
      color 0.12s linear;

    &.down {
      color: #fff;
      background-color: hsl(var(--hue) 85% 48%);
      box-shadow: 0 0 10px hsl(var(--hue) 90% 60% / 0.7);
      transform: translateY(1.5px);
    }
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 2px 8px 2px 10px;
    min-height: 28px;
  }

  .message {
    position: relative;
    display: grid;
    min-width: 0;
    flex: 1;
  }

  .line {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .glyph {
    display: inline-flex;
    flex: none;
    color: hsl(var(--hue) 90% 62%);
    transition: color 0.2s linear;
  }

  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .size {
    flex: none;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .controls {
    display: flex;
    align-items: center;
    flex: none;
    gap: 10px;
  }

  .escape {
    cursor: pointer;
    &:hover {
      background-color: oklch(var(--bc) / 0.24);
    }
    &:active {
      box-shadow: none;
      transform: translateY(1.5px);
    }
  }

  @media (max-width: 640px) {
    .mode .keys {
      display: none;
    }
    .mode {
      padding: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb,
    .key {
      transition: none;
    }
  }
</style>
