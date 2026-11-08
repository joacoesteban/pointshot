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
  import { Dom } from '~/lib/dom'
  import { transitionIn, transitionOut } from '~/lib/transitions'

  type Props = {
    target$: Observable<Element | null>
  }

  const { target$ }: Props = $props()

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

  const frame$ = $derived(
    combineLatest([target$, reflow$]).pipe(
      map(([target]) =>
        match(target)
          .with(P.when(Dom.isElement), (target) => ({
            bounds: Dom.rect(target),
            radius: Dom.style(target).borderRadius,
            label: label(target),
          }))
          .otherwise(() => null),
      ),
    ),
  )
</script>

{#if $frame$}
  <div
    class="fixed pointer-events-none highlight"
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
        {Math.round($frame$.bounds.width)} × {Math.round($frame$.bounds.height)}
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
