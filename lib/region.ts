import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
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
    readonly inside: readonly Element[]
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

const isPinned = (element: Element) =>
  ['fixed', 'sticky'].includes(getComputedStyle(element).position)

const lineage = (element: Element): Element[] =>
  match(element.parentElement)
    .with(P.instanceOf(Element), (parent) => [element, ...lineage(parent)])
    .otherwise(() => [element])

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

const visibleRect = (element: Element) =>
  new Promise<DOMRectReadOnly>((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        observer.disconnect()
        entries.forEach(({ intersectionRect }) => {
          resolve(intersectionRect)
        })
      },
      { rootMargin: UNBOUNDED },
    )
    observer.observe(element)
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
        const { clientWidth, clientHeight, scrollWidth, scrollHeight } =
          document.documentElement
        const screen = shift(
          { left: 0, top: 0, width: clientWidth, height: clientHeight },
          origin,
        )
        const page = {
          left: 0,
          top: 0,
          width: scrollWidth,
          height: scrollHeight,
        }
        const ancestors = lineage(element)
        const bounds = match(ancestors.find(isPinned))
          .with(P.instanceOf(Element), () => screen)
          .otherwise(() => page)
        const framed = match(framing)
          .with('element', () => shift(visible, origin))
          .with('padded', () => grow(shift(visible, origin), MARGIN))
          .exhaustive()
        const area = intersect(framed, bounds)
        const box = shift(element.getBoundingClientRect(), origin)
        const pinned = [...document.querySelectorAll('*')].filter(
          (other) =>
            !ancestors.includes(other) &&
            !host.contains(other) &&
            isPinned(other),
        )
        const tiles = axis(
          area.top,
          area.height,
          origin.y,
          clientHeight,
        ).flatMap((y) =>
          axis(area.left, area.width, origin.x, clientWidth).map((x) => ({
            x,
            y,
          })),
        )
        return match(area)
          .with({ width: P.number.gt(0), height: P.number.gt(0) }, (area) =>
            okAsync<Plan, EmptyAreaError>({
              area,
              tiles,
              clip: match(framing)
                .with('element', () => {
                  const style = getComputedStyle(element)
                  return {
                    box,
                    radii: CORNERS.map((corner) => radius(style[corner], box)),
                  }
                })
                .with('padded', () => null)
                .exhaustive(),
              pinned: {
                outside: pinned.filter((other) => !element.contains(other)),
                inside: pinned.filter((other) => element.contains(other)),
              },
            }),
          )
          .otherwise(() => errAsync(new EmptyAreaError()))
      },
    )
  }
}
