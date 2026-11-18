import {
  combineLatest,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  startWith,
} from 'rxjs'
import { match } from 'ts-pattern'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const playState$ = combineLatest([
  fromEvent(document, 'visibilitychange').pipe(
    map(() => document.hidden),
    startWith(document.hidden),
  ),
  merge(
    fromEvent(window, 'focus').pipe(map(() => true)),
    fromEvent(window, 'blur').pipe(map(() => false)),
  ).pipe(startWith(document.hasFocus())),
  fromEvent<MediaQueryListEvent>(reducedMotion, 'change').pipe(
    map(({ matches }) => matches),
    startWith(reducedMotion.matches),
  ),
]).pipe(
  map((conditions) =>
    match(conditions)
      .with([false, true, false], () => 'running')
      .otherwise(() => 'paused'),
  ),
  distinctUntilChanged(),
)

// Sets an inherited --animation-play-state; animated descendants opt in with `animation-play-state: var(--animation-play-state, running)`.
export function animationState(node: HTMLElement) {
  const subscription = playState$.subscribe((state) => {
    node.style.setProperty('--animation-play-state', state)
  })

  return {
    destroy: () => {
      subscription.unsubscribe()
    },
  }
}
