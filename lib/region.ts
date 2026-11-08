import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { Dom } from './dom'
import { EmptyAreaError } from './errors'

export type Area = Readonly<Record<'left' | 'top' | 'width' | 'height', number>>

export type Point = Readonly<Record<'x' | 'y', number>>

export type Framing = 'element' | 'padded'

export type Plan = {
  readonly area: Area
  readonly tiles: readonly Point[]
  readonly clip: { readonly box: Area; readonly radii: DOMPointInit[] } | null
  readonly pinned: {
    readonly outside: readonly Element[]
    readonly fixed: readonly Element[]
    readonly sticky: readonly Element[]
  }
}

// CSS pixels of page kept around the element in a padded snag.
const MARGIN = 24
// Lifts the viewport out of the intersection, so only the element's clipping ancestors cut its rect.
const UNBOUNDED = '1000000px'

const CORNERS = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const

export const scrolled = (): Point => ({ x: window.scrollX, y: window.scrollY })

export const shift = (
  { left, top, width, height }: Area,
  { x, y }: Point,
): Area => ({
  left: left + x,
  top: top + y,
  width,
  height,
})

export const grow = ({ left, top, width, height }: Area, by: number): Area => ({
  left: left - by,
  top: top - by,
  width: width + 2 * by,
  height: height + 2 * by,
})

export const intersect = (a: Area, b: Area): Area => {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  return {
    left,
    top,
    width: Math.min(a.left + a.width, b.left + b.width) - left,
    height: Math.min(a.top + a.height, b.top + b.height) - top,
  }
}

export const steps = (start: number, length: number, span: number) =>
  Array.from(
    { length: Math.max(1, Math.ceil(length / span)) },
    (_, index) => start + index * span,
  )

// An axis already in view keeps its scroll, so a visible element, or one inside a fixed or sticky ancestor, is captured without moving the page.
export const axis = (
  start: number,
  length: number,
  offset: number,
  span: number,
) =>
  match({ start, end: start + length })
    .with(
      { start: P.number.gte(offset), end: P.number.lte(offset + span) },
      () => [offset],
    )
    .otherwise(() => steps(start, length, span))

const positionOf = (element: Element) => Dom.style(element).position

const isPinned = (element: Element) =>
  ['fixed', 'sticky'].includes(positionOf(element))

export const radius = (
  value: string,
  { width, height }: Area,
): DOMPointInit => {
  const [x = '0', y = x] = value.split(' ')
  const length = (token: string, whole: number) =>
    match(token)
      .with(
        P.string.endsWith('%'),
        (token) => (parseFloat(token) / 100) * whole,
      )
      .otherwise((token) => parseFloat(token))
  return { x: length(x, width), y: length(y, height) }
}

// Relative to the root document's viewport, cut by the element's clipping ancestors.
const observedRect = (element: Element, root: Document | null = null) =>
  new Promise<Area>((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        observer.disconnect()
        entries.forEach(({ intersectionRect }) => {
          resolve(intersectionRect)
        })
      },
      { root, rootMargin: UNBOUNDED },
    )
    observer.observe(element)
  })

// An element in a frame is observed in its own document, then cut to what each enclosing frame shows.
const visibleRect = (element: Element) =>
  match(Dom.documents(element.ownerDocument))
    .with([P._], () => observedRect(element))
    .otherwise((documents) =>
      observedRect(element, element.ownerDocument).then((rect) =>
        documents
          .map((document) => Dom.viewport(document))
          .reduce(intersect, shift(rect, Dom.offset(element.ownerDocument))),
      ),
    )

const NOTHING_PINNED: Plan['pinned'] = { outside: [], fixed: [], sticky: [] }

const client = () => {
  const { clientWidth, clientHeight } = document.documentElement
  return { width: clientWidth, height: clientHeight }
}

const screenAt = (origin: Point): Area =>
  shift({ left: 0, top: 0, ...client() }, origin)

const wholePage = (): Area => {
  const { scrollWidth, scrollHeight } = document.documentElement
  return { left: 0, top: 0, width: scrollWidth, height: scrollHeight }
}

const tilesOver = (area: Area, origin: Point) => {
  const { width, height } = client()
  return axis(area.top, area.height, origin.y, height).flatMap((y) =>
    axis(area.left, area.width, origin.x, width).map((x) => ({ x, y })),
  )
}

const pinnedOf = (host: Element, except: readonly Element[]) =>
  [...document.querySelectorAll('*')].filter(
    (other) =>
      !except.includes(other) && !host.contains(other) && isPinned(other),
  )

const checked = (plan: Plan) =>
  match(plan)
    .with({ area: { width: P.number.gt(0), height: P.number.gt(0) } }, (plan) =>
      okAsync<Plan, EmptyAreaError>(plan),
    )
    .otherwise(() => errAsync(new EmptyAreaError()))

// The rectangle two corners span, whichever way the drag went.
export const span = (a: Point, b: Point): Area => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

export class Region {
  static plan(
    element: Element,
    framing: Framing,
    host: Element,
  ): ResultAsync<Plan, EmptyAreaError> {
    return ResultAsync.fromSafePromise(visibleRect(element)).andThen(
      (visible) => {
        const origin = scrolled()
        const ancestors = [element, ...Dom.ancestors(element)]
        const bounds = match(ancestors.find(isPinned))
          .with(P.nonNullable, () => screenAt(origin))
          .otherwise(wholePage)
        const framed = match(framing)
          .with('element', () => shift(visible, origin))
          .with('padded', () => grow(shift(visible, origin), MARGIN))
          .exhaustive()
        const area = intersect(framed, bounds)
        const box = shift(Dom.rect(element), origin)
        const pinned = pinnedOf(host, ancestors)
        return checked({
          area,
          tiles: tilesOver(area, origin),
          clip: match(framing)
            .with('element', () => {
              const style = Dom.style(element)
              return {
                box,
                radii: CORNERS.map((corner) => radius(style[corner], box)),
              }
            })
            .with('padded', () => null)
            .exhaustive(),
          pinned: {
            outside: pinned.filter((other) => !element.contains(other)),
            fixed: pinned.filter(
              (other) =>
                element.contains(other) && positionOf(other) === 'fixed',
            ),
            sticky: pinned.filter(
              (other) =>
                element.contains(other) && positionOf(other) === 'sticky',
            ),
          },
        })
      },
    )
  }

  // What the window shows, fixed elements included.
  static visible(): ResultAsync<Plan, EmptyAreaError> {
    const origin = scrolled()
    return checked({
      area: screenAt(origin),
      tiles: [origin],
      clip: null,
      pinned: NOTHING_PINNED,
    })
  }

  // A rectangle of the window, in viewport coordinates.
  static selection(rect: Area): ResultAsync<Plan, EmptyAreaError> {
    const origin = scrolled()
    return checked({
      area: intersect(shift(rect, origin), screenAt(origin)),
      tiles: [origin],
      clip: null,
      pinned: NOTHING_PINNED,
    })
  }

  // The whole document. Fixed elements show once, where the first tile finds them, and sticky ones stay in place.
  static page(host: Element): ResultAsync<Plan, EmptyAreaError> {
    const area = wholePage()
    const pinned = pinnedOf(host, [])
    return checked({
      area,
      tiles: tilesOver(area, scrolled()),
      clip: null,
      pinned: {
        outside: [],
        fixed: pinned.filter((other) => positionOf(other) === 'fixed'),
        sticky: pinned.filter((other) => positionOf(other) === 'sticky'),
      },
    })
  }
}
