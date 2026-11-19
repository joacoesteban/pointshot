import {
  BehaviorSubject,
  type Observable,
  Subject,
  combineLatest,
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
import { Chord, type Held, type SnagMode, type SnagState } from './chord'
import { Dom } from './dom'
import type { Area } from './region'

type Point = Readonly<Record<'x' | 'y', number>>

export type Aim = {
  readonly element: Element | null
  readonly trail: readonly Element[]
}

export type Pick =
  | { readonly kind: 'element'; readonly element: Element }
  | { readonly kind: 'visible' | 'page' }

export type PickSession = ReturnType<ElementPicker['pick']>

export type Step =
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

const pickOf = (mode: SnagMode, element: Element | null): Pick | null =>
  match({ mode, element })
    .returnType<Pick | null>()
    .with({ mode: 'element', element: P.nonNullable }, ({ element }) => ({
      kind: 'element',
      element,
    }))
    .with({ mode: 'visible' }, () => ({ kind: 'visible' }))
    .with({ mode: 'page' }, () => ({ kind: 'page' }))
    .otherwise(() => null)

const isPick = (pick: Pick | null): pick is Pick => pick !== null

// An element with no area shows nothing, so the walk passes through it to its children.
const visible = (element: Element) => {
  const { width, height } = element.getBoundingClientRect()
  return width > 0 && height > 0
}

// Nothing under display: none renders, nor past an edge with no length that clips, as in a collapsed accordion.
const CLIPPING = ['hidden', 'clip', 'scroll', 'auto']

const hides = (element: Element) => {
  const { width, height } = element.getBoundingClientRect()
  const { display, overflowX, overflowY } = Dom.style(element)
  return (
    display === 'none' ||
    (width === 0 && CLIPPING.includes(overflowX)) ||
    (height === 0 && CLIPPING.includes(overflowY))
  )
}

// The elements as the walk sees them, those with no area replaced by their children.
function* flatten(
  elements: Iterable<Element>,
): Generator<Element, void, undefined> {
  for (const element of elements) {
    if (visible(element)) {
      yield element
    } else if (!hides(element)) {
      yield* flatten(Dom.children(element))
    }
  }
}

const childrenOf = (element: Element) => flatten(Dom.children(element))

const boxOf = (element: Element) => {
  const { left, top, width, height } = Dom.rect(element)
  return [left, top, width, height].map(Math.round).join()
}

// Elements on the same box look alike, as nested containers do, so the walk takes them as one step.
const twin =
  (element: Element) =>
  (other: Element | undefined): other is Element =>
    other !== undefined && boxOf(other) === boxOf(element)

// The page roots are skipped: the top document's lead nowhere, and a frame's lead out to the frame.
const climbable = (element: Element): Element | null =>
  match(Dom.parent(element))
    .with({ tagName: P.union('BODY', 'HTML') }, climbable)
    .otherwise((parent) => parent)

const ancestorsOf = (element: Element): Element[] =>
  match(climbable(element))
    .with(null, () => [])
    .otherwise((parent) => [parent, ...ancestorsOf(parent)])

// The leading items on the element's box.
const runOn = (element: Element, items: readonly Element[]): Element[] =>
  match(items)
    .with([P.when(twin(element)), ...P.array()], ([first, ...rest]) => [
      first,
      ...runOn(element, rest),
    ])
    .otherwise(() => [])

// Above the element, past the ancestors on its box, then up through those on the box it lands on.
const above = (element: Element): Element | undefined => {
  const ancestors = ancestorsOf(element).filter(visible)
  const rest = ancestors.slice(runOn(element, ancestors).length)
  return match(rest)
    .with([P.select(), ...P.array()], (parent) => runOn(parent, rest).at(-1))
    .otherwise(() => undefined)
}

// The element's only child, when it sits on the same box, as in nested containers.
const nestedIn = (element: Element): Element | undefined => {
  const children = childrenOf(element)
  const first = children.next().value ?? undefined
  return match([first, children.next().done] as const)
    .with([P.when(twin(element)), true], ([child]) => child)
    .otherwise(() => undefined)
}

const innermost = (element: Element): Element =>
  match(nestedIn(element))
    .with(P.nonNullable, innermost)
    .otherwise(() => element)

// The first descendant off the element's box, past the wrappers and overlays on it, then in as far as its box goes.
const below = (element: Element): Element | undefined => {
  for (const child of childrenOf(element)) {
    const stop = match(child)
      .with(P.when(twin(element)), below)
      .otherwise(innermost)
    if (stop !== undefined) {
      return stop
    }
  }
  return undefined
}

// The outermost of the wrappers around the element.
const wrapperOf = (element: Element): Element =>
  match(ancestorsOf(element).find(visible))
    .with(
      P.when(
        (parent): parent is Element =>
          parent !== undefined && nestedIn(parent) === element,
      ),
      wrapperOf,
    )
    .otherwise(() => element)

// The top of the parents with no area above the element, whose siblings flatten to the element's.
const exposed = (element: Element): Element =>
  match(Dom.parent(element))
    .with(
      P.when(
        (parent): parent is Element => parent !== null && !visible(parent),
      ),
      exposed,
    )
    .otherwise(() => element)

// Slotted children are missing from the children of the host's shadow root, so they fall back to their own siblings.
const siblingOf = (element: Element, offset: -1 | 1) => {
  const from = wrapperOf(element)
  const flat = [...flatten(Dom.siblings(exposed(from)))]
  const siblings = match(flat.includes(from))
    .with(true, () => flat)
    .otherwise(() => [...flatten(Dom.siblings(from))])
  return siblings[siblings.indexOf(from) + offset]
}

const land = (aim: Aim, element: Element | undefined): Aim =>
  match(element)
    .with(P.when(Dom.isElement), (element) => ({ element, trail: [] }))
    .otherwise(() => aim)

export const step = (aim: Aim, next: Step): Aim =>
  match([aim, next] as const)
    .with([P._, { kind: 'point' }], ([, { element }]) => ({
      element,
      trail: [],
    }))
    .with([{ element: P.when(Dom.isElement) }, { kind: 'up' }], ([aim]) =>
      match(above(aim.element))
        .with(undefined, () => aim)
        .otherwise((parent) => ({
          element: parent,
          trail: [aim.element, ...aim.trail],
        })),
    )
    .with(
      [{ trail: [P.when(Dom.isElement), ...P.array()] }, { kind: 'down' }],
      ([
        {
          trail: [child, ...rest],
        },
      ]) => ({ element: child, trail: rest }),
    )
    .with([{ element: P.when(Dom.isElement) }, { kind: 'down' }], ([aim]) =>
      land(aim, below(aim.element)),
    )
    .with([{ element: P.when(Dom.isElement) }, { kind: 'previous' }], ([aim]) =>
      land(aim, siblingOf(aim.element, -1)),
    )
    .with([{ element: P.when(Dom.isElement) }, { kind: 'next' }], ([aim]) =>
      land(aim, siblingOf(aim.element, 1)),
    )
    .otherwise(([aim]) => aim)

const listen = <E extends Event>(
  views: readonly Window[],
  type: string,
  options: AddEventListenerOptions,
) => merge(...views.map((view) => fromEvent<E>(view, type, options)))

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

  private elementAt(point: Point) {
    return Dom.elementAt(
      document,
      point,
      (element) => !this.host.contains(element),
    )
  }

  pick(start: SnagMode) {
    const ended$ = new Subject<void>()
    const cancelled$ = new Subject<void>()
    const pinned$ = new BehaviorSubject(start)
    const marquee$ = new BehaviorSubject<Area | null>(null)

    // Events inside same-origin frames stay in their window, so the picker listens there too.
    const frames = Dom.frames()
    const views = [window, ...frames.map(({ view }) => view)]

    const keys$ = listen<KeyboardEvent>(views, 'keydown', capture).pipe(
      filter(({ key }) => KEYS.includes(key)),
      tap<KeyboardEvent>(swallow),
      share(),
    )

    const pointer$ = merge(
      this.pointer$,
      ...frames.map(({ view, document }) =>
        fromEvent<PointerEvent>(view, 'pointermove', capture).pipe(
          map(({ clientX, clientY }) => {
            const { x, y } = Dom.offset(document)
            return { x: clientX + x, y: clientY + y }
          }),
        ),
      ),
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }))

    // Scrolling moves the page under a still pointer, so the pointed element is resolved again.
    const scrolled$ = listen(views, 'scroll', {
      capture: true,
      passive: true,
    }).pipe(
      withLatestFrom(pointer$),
      map(([, point]) => point),
    )

    const target$ = merge(
      merge(pointer$, scrolled$).pipe(
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

    // Blur resets the chord: a modifier released in another window never reaches this page.
    const held$: Observable<Held> = merge(
      merge(
        ...['keydown', 'keyup', 'pointermove', 'pointerdown'].map((type) =>
          listen<KeyboardEvent | PointerEvent>(views, type, capture),
        ),
      ).pipe(map(Chord.read)),
      fromEvent(window, 'blur').pipe(map(() => Chord.released)),
    ).pipe(startWith(Chord.released), distinctUntilChanged(Chord.same))

    const state$: Observable<SnagState> = combineLatest([
      held$,
      pinned$,
      marquee$,
    ]).pipe(
      map(([held, pinned, marquee]) => ({
        held,
        marquee,
        mode: Chord.mode({ held, pinned, marquee }),
      })),
      takeUntil(ended$),
      shareReplay({ bufferSize: 1, refCount: true }),
    )

    const pressed$ = merge(
      ...['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick'].map(
        (type) => listen<MouseEvent>(views, type, capture),
      ),
    ).pipe(
      filter(({ target }) => !this.isOwn(target)),
      tap<MouseEvent>(swallow),
      ignoreElements(),
    )

    const dismissed$ = listen<MouseEvent>(views, 'contextmenu', capture).pipe(
      filter(({ target }) => !this.isOwn(target)),
      tap<MouseEvent>(swallow),
    )

    // Subscribers run inside the click or keydown dispatch, which keeps the user activation the clipboard asks for.
    // The trigger's own modifiers decide the mode, so a chord pressed in the same tick as the trigger counts.
    const chosen$ = merge(
      listen<MouseEvent>(views, 'click', capture).pipe(
        filter(({ target }) => !this.isOwn(target)),
        tap<MouseEvent>(swallow),
      ),
      keys$.pipe(filter(({ key }) => key === 'Enter')),
    ).pipe(
      withLatestFrom(target$, pinned$, marquee$),
      map(([event, element, pinned, marquee]) =>
        pickOf(
          Chord.mode({ held: Chord.read(event), pinned, marquee }),
          element,
        ),
      ),
      filter(isPick),
    )

    const picked$ = merge(pressed$, chosen$).pipe(
      take(1),
      takeUntil(
        merge(
          keys$.pipe(filter(({ key }) => key === 'Escape')),
          dismissed$,
          cancelled$,
        ),
      ),
      finalize(() => {
        ended$.next()
        ended$.complete()
      }),
      share(),
    )

    return {
      target$,
      state$,
      picked$,
      pin: (mode: SnagMode) => {
        pinned$.next(mode)
      },
      mark: (marquee: Area | null) => {
        marquee$.next(marquee)
      },
      cancel: () => {
        cancelled$.next()
      },
    }
  }

  private isOwn(target: EventTarget | null) {
    return match(target)
      .with(P.instanceOf(Node), (node) => this.host.contains(node))
      .otherwise(() => false)
  }
}
