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
  import Outline from './outline.svelte'

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

<Outline frame={$frame$} />
