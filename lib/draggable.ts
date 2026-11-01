import {
  filter,
  fromEvent,
  map,
  merge,
  pairwise,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs'
import { DisposeBag } from './dispose-bag'

type Vec = Readonly<Record<'x' | 'y', number>>

const FRICTION = 0.85
const MARGIN = 24
const INTERACTIVE = 'button, a, input, textarea, [role="button"]'

const pointOf = ({ clientX: x, clientY: y }: PointerEvent): Vec => ({ x, y })

export function draggable(node: HTMLElement) {
  const { sink, dispose } = new DisposeBag()
  let position: Vec = {
    x: window.innerWidth - node.offsetWidth - MARGIN,
    y: MARGIN,
  }
  let velocity: Vec = { x: 0, y: 0 }
  let frame = 0

  const place = ({ x, y }: Vec) => {
    position = {
      x: Math.min(Math.max(x, 0), window.innerWidth - node.offsetWidth),
      y: Math.min(Math.max(y, 0), window.innerHeight - node.offsetHeight),
    }
    node.style.transform = `translate3d(${String(position.x)}px, ${String(
      position.y,
    )}px, 0)`
  }

  const glide = ({ x, y }: Vec) => {
    if (Math.hypot(x, y) < 0.1) return
    place({ x: position.x + x, y: position.y + y })
    frame = requestAnimationFrame(() => {
      glide({ x: x * FRICTION, y: y * FRICTION })
    })
  }

  fromEvent<PointerEvent>(node, 'pointerdown')
    .pipe(
      filter(
        ({ target, button }) =>
          button === 0 &&
          !(target instanceof Element && target.closest(INTERACTIVE)),
      ),
      tap(() => {
        cancelAnimationFrame(frame)
        node.style.cursor = 'grabbing'
      }),
      switchMap((down) => {
        const grab = {
          x: down.clientX - position.x,
          y: down.clientY - position.y,
        }
        const up$ = fromEvent<PointerEvent>(window, 'pointerup').pipe(
          tap(() => {
            node.style.cursor = ''
            glide(velocity)
          }),
        )
        return fromEvent<PointerEvent>(window, 'pointermove').pipe(
          tap((move) => {
            move.preventDefault()
          }),
          map(pointOf),
          startWith(pointOf(down)),
          pairwise(),
          tap(([last, { x, y }]) => {
            velocity = { x: x - last.x, y: y - last.y }
            place({ x: x - grab.x, y: y - grab.y })
          }),
          takeUntil(up$),
        )
      }),
      sink(),
    )
    .subscribe()

  merge(fromEvent(window, 'resize'), [null])
    .pipe(sink())
    .subscribe(() => {
      place(position)
    })

  return {
    destroy: () => {
      cancelAnimationFrame(frame)
      dispose()
    },
  }
}
