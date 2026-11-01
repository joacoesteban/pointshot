import {
  type Observable,
  Subject,
  distinctUntilChanged,
  filter,
  finalize,
  fromEvent,
  ignoreElements,
  map,
  merge,
  scan,
  share,
  shareReplay,
  startWith,
  take,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs'
import { match, P } from 'ts-pattern'

type Point = Readonly<Record<'x' | 'y', number>>

type Aim = {
  readonly element: Element | null
  readonly trail: readonly Element[]
}

type Step =
  | { readonly kind: 'point'; readonly element: Element | null }
  | { readonly kind: 'up' }
  | { readonly kind: 'down' }

const capture = { capture: true } as const

const swallow = (event: Event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
}

const climbable = (element: Element) =>
  match(element.parentElement)
    .with(P.instanceOf(Element), (parent) =>
      match(parent.tagName.toUpperCase())
        .with('BODY', 'HTML', () => null)
        .otherwise(() => parent),
    )
    .otherwise(() => null)

const step = (aim: Aim, next: Step): Aim =>
  match([aim, next] as const)
    .with([P._, { kind: 'point' }], ([, { element }]) => ({
      element,
      trail: [],
    }))
    .with([{ element: P.instanceOf(Element) }, { kind: 'up' }], ([aim]) =>
      match(climbable(aim.element))
        .with(null, () => aim)
        .otherwise((parent) => ({
          element: parent,
          trail: [aim.element, ...aim.trail],
        })),
    )
    .with(
      [{ trail: [P.instanceOf(Element), ...P.array()] }, { kind: 'down' }],
      ([
        {
          trail: [child, ...rest],
        },
      ]) => ({ element: child, trail: rest }),
    )
    .otherwise(([aim]) => aim)

export class ElementPicker {
  private readonly pointer$: Observable<Point>

  constructor(private readonly host: Element) {
    this.pointer$ = fromEvent<PointerEvent>(
      window,
      'pointermove',
      capture,
    ).pipe(
      map(({ clientX: x, clientY: y }) => ({ x, y })),
      shareReplay({ bufferSize: 1, refCount: false }),
    )
    this.pointer$.subscribe()
  }

  private elementAt({ x, y }: Point) {
    const [element = null] = document
      .elementsFromPoint(x, y)
      .filter(
        (element) =>
          (element instanceof HTMLElement || element instanceof SVGElement) &&
          !this.host.contains(element),
      )
    return element
  }

  pick() {
    const ended$ = new Subject<void>()

    const keys$ = fromEvent<KeyboardEvent>(window, 'keydown', capture).pipe(
      filter(({ key }) => ['ArrowUp', 'ArrowDown', 'Escape'].includes(key)),
      tap<KeyboardEvent>(swallow),
      map(({ key }) => key),
      share(),
    )

    // Scrolling moves the page under a still pointer, so the pointed element is resolved again.
    const scrolled$ = fromEvent(window, 'scroll', {
      capture: true,
      passive: true,
    }).pipe(
      withLatestFrom(this.pointer$),
      map(([, point]) => point),
    )

    const target$ = merge(
      merge(this.pointer$, scrolled$).pipe(
        map(
          (point): Step => ({ kind: 'point', element: this.elementAt(point) }),
        ),
      ),
      keys$.pipe(
        map((key) =>
          match(key)
            .with('ArrowUp', (): Step => ({ kind: 'up' }))
            .otherwise((): Step => ({ kind: 'down' })),
        ),
      ),
    ).pipe(
      scan(step, { element: null, trail: [] }),
      map(({ element }) => element),
      startWith(null),
      distinctUntilChanged(),
      takeUntil(ended$),
      shareReplay({ bufferSize: 1, refCount: true }),
    )

    const pressed$ = merge(
      ...['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick'].map(
        (type) => fromEvent<MouseEvent>(window, type, capture),
      ),
    ).pipe(
      filter(({ target }) => !this.isOwn(target)),
      tap<MouseEvent>(swallow),
      ignoreElements(),
    )

    // Subscribers run inside the click dispatch, which keeps the user activation the clipboard asks for.
    const clicked$ = fromEvent<MouseEvent>(window, 'click', capture).pipe(
      filter(({ target }) => !this.isOwn(target)),
      tap<MouseEvent>(swallow),
      withLatestFrom(target$),
      map(([, element]) => element),
      filter((element): element is Element => element !== null),
    )

    const picked$ = merge(pressed$, clicked$).pipe(
      take(1),
      takeUntil(keys$.pipe(filter((key) => key === 'Escape'))),
      finalize(() => {
        ended$.next()
        ended$.complete()
      }),
      share(),
    )

    return { target$, picked$ }
  }

  private isOwn(target: EventTarget | null) {
    return match(target)
      .with(P.instanceOf(Node), (node) => this.host.contains(node))
      .otherwise(() => false)
  }
}
