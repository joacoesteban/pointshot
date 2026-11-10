<script lang="ts">
  import {
    combineLatest,
    fromEvent,
    map,
    merge,
    startWith,
    type Observable,
  } from 'rxjs'
  import { match, P } from 'ts-pattern'
  import type { SnagMode } from '~/lib/chord'
  import { Dom } from '~/lib/dom'
  import { t } from '~/lib/i18n'
  import { Region } from '~/lib/region'
  import { transitionIn, transitionOut } from '~/lib/transitions'

  type Props = {
    target$: Observable<Element | null>
    mode: SnagMode
  }

  const { target$, mode }: Props = $props()

  const reflow$ = merge(
    fromEvent(window, 'scroll', { capture: true, passive: true }),
    fromEvent(window, 'resize'),
  ).pipe(startWith(null))

  const label = ({ tagName, id, classList }: Element) =>
    [
      tagName.toLowerCase(),
      match(id)
        .with('', () => '')
        .otherwise((id) => `#${id}`),
      [...classList]
        .slice(0, 2)
        .map((name) => `.${name}`)
        .join(''),
    ].join('')

  const frameFor =
    (mode: SnagMode) =>
    ([target]: readonly [Element | null, unknown]) =>
      match({ mode, target })
        .with(
          { mode: 'element', target: P.when(Dom.isElement) },
          ({ target }) => {
            const bounds = Dom.rect(target)
            return {
              bounds,
              size: bounds,
              radius: Dom.style(target).borderRadius,
              label: label(target),
              scope: null,
            }
          },
        )
        .with({ mode: 'visible' }, ({ mode }) => {
          const bounds = Region.screen()
          return {
            bounds,
            size: bounds,
            radius: '0',
            label: t('modeVisible'),
            scope: mode,
          }
        })
        .with({ mode: 'page' }, ({ mode }) => ({
          bounds: Region.screen(),
          size: Region.whole(),
          radius: '0',
          label: t('modePage'),
          scope: mode,
        }))
        .otherwise(() => null)

  const frame$ = $derived(
    combineLatest([target$, reflow$]).pipe(map(frameFor(mode))),
  )
</script>

{#if $frame$}
  <div
    class="fixed pointer-events-none highlight"
    class:scope={$frame$.scope !== null}
    class:continues={$frame$.scope === 'page'}
    data-testid="snag-highlight"
    in:transitionIn
    out:transitionOut
    style:top={`${String($frame$.bounds.top)}px`}
    style:left={`${String($frame$.bounds.left)}px`}
    style:width={`${String($frame$.bounds.width)}px`}
    style:height={`${String($frame$.bounds.height)}px`}
    style:border-radius={$frame$.radius}>
    <span class="tag bg-blur bg-blur:soft bg-blur:round">
      <b>{$frame$.label}</b>
      <span class="opacity-60">
        {Math.round($frame$.size.width)} × {Math.round($frame$.size.height)}
      </span>
    </span>
  </div>
{/if}

<style lang="scss">
  .highlight {
    $base-hue: 130;
    $ping-color: hsla($base-hue + 30 100% 95%);
    $background-color: hsla($base-hue 100% 50% / 0.2);
    $border-color: hsla($base-hue + 15 100% 80%);
    $glow-color: hsla($base-hue + 30 100% 60% / 0.2);

    transition: 0.2s var(--bezier);
    transition-property: top, left, width, height;

    background-color: $background-color;
    border: 2px solid $border-color;
    box-shadow: 0 0 30px 5px $glow-color;

    @keyframes ping {
      75%,
      100% {
        opacity: 0;
      }
    }

    &::before {
      pointer-events: none;
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background-color: $ping-color;
      animation: ping 2s linear infinite;
    }

    &.scope {
      background-color: hsla($base-hue 100% 50% / 0.05);
      box-shadow: inset 0 0 40px 2px $glow-color;
      &::before {
        display: none;
      }
      .tag {
        top: 12px;
        left: 12px;
        bottom: auto;
      }
    }
    &.continues {
      border-bottom-color: transparent;
      mask-image: linear-gradient(#000 70%, #0003);
    }
  }
  .tag {
    position: absolute;
    left: -2px;
    bottom: calc(100% + 8px);
    display: flex;
    gap: 0.5em;
    padding: 0.25em 0.8em;
    font-size: 12px;
    white-space: nowrap;
    max-width: 60vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
