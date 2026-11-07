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
import type { Framing } from './region'

type Point = Readonly<Record<'x' | 'y', number>>

type Aim = {
  readonly element: Element | null
  readonly trail: readonly Element[]
}

export type Pick = {
  readonly element: Element
  readonly framing: Framing
}

type Step =
  | { readonly kind: 'point'; readonly element: Element | null }
  | { readonly kind: 'up' | 'down' | 'previous' | 'next' }

const capture = { capture: true } as const

const swallow = (event: Event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
}

const ARROWS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'previous',
  ArrowRight: 'next',
} as const

type Arrow = keyof typeof ARROWS

const KEYS = [...Object.keys(ARROWS), 'Enter', 'Escape']

const isArrow = (key: string): key is Arrow => key in ARROWS

const framingOf = (shiftKey: boolean): Framing =>
  match(shiftKey)
    .with(true, () => 'padded' as const)
    .with(false, () => 'element' as const)
    .exhaustive()

const rendered = (element: Element) => element.getClientRects().length > 0

const siblingOf = (element: Element, offset: -1 | 1) => {
  const siblings = match(element.parentElement)
    .with(P.instanceOf(Element), ({ children }) =>
      [...children].filter(rendered),
    )
    .otherwise(() => [])
  return siblings[siblings.indexOf(element) + offset]
}

const firstChildOf = ({ children }: Element) => [...children].find(rendered)

const climbable = (element: Element) =>
  match(element.parentElement)
    .with(P.instanceOf(Element), (parent) =>
      match(parent.tagName.toUpperCase())
        .with('BODY', 'HTML', () => null)
        .otherwise(() => parent),
    )
    .otherwise(() => null)

const land = (aim: Aim, element: Element | undefined): Aim =>
  match(element)
    .with(P.instanceOf(Element), (element) => ({ element, trail: [] }))
    .otherwise(() => aim)

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
    .with([{ element: P.instanceOf(Element) }, { kind: 'down' }], ([aim]) =>
      land(aim, firstChildOf(aim.element)),
    )
    .with([{ element: P.instanceOf(Element) }, { kind: 'previous' }], ([aim]) =>
      land(aim, siblingOf(aim.element, -1)),
    )
    .with([{ element: P.instanceOf(Element) }, { kind: 'next' }], ([aim]) =>
      land(aim, siblingOf(aim.element, 1)),
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
      filter(({ key }) => KEYS.includes(key)),
      tap<KeyboardEvent>(swallow),
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
        map(({ key }) => key),
        filter(isArrow),
        map((key): Step => ({ kind: ARROWS[key] })),
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

    // Subscribers run inside the click or keydown dispatch, which keeps the user activation the clipboard asks for.
    const chosen$ = merge(
      fromEvent<MouseEvent>(window, 'click', capture).pipe(
        filter(({ target }) => !this.isOwn(target)),
        tap<MouseEvent>(swallow),
      ),
      keys$.pipe(filter(({ key }) => key === 'Enter')),
    ).pipe(
      withLatestFrom(target$),
      map(([{ shiftKey }, element]) => ({
        element,
        framing: framingOf(shiftKey),
      })),
      filter((pick): pick is Pick => pick.element !== null),
    )

    const picked$ = merge(pressed$, chosen$).pipe(
      take(1),
      takeUntil(keys$.pipe(filter(({ key }) => key === 'Escape'))),
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
