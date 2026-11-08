import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { CaptureError, toError } from './errors'
import { Img } from './image'
import { InlineStyle } from './inline-style'
import {
  intersect,
  scrolled,
  shift,
  type Area,
  type Plan,
  type Point,
} from './region'
import { ReplyCodec } from './reply'
import { Stage } from './stage'
import { captureVisibleTab } from '~/messages'

// Even an incompressible PNG, 4 bytes a pixel and a third larger as a data URL, then fits Chrome's 64 MiB message limit.
const MAX_PIXELS = 12_000_000
// Chrome fails to allocate canvases with a longer side.
const MAX_SIDE = 16_384

const HIDDEN = { visibility: 'hidden' }
// Laid out as relative with no offsets, a sticky element stays where it sits before sticking, so every tile shows it in place.
// Sticky always makes a stacking context and relative does not, so isolation keeps negative z-index children painting above it.
const UNSTUCK = {
  isolation: 'isolate',
  position: 'relative',
  top: 'auto',
  right: 'auto',
  bottom: 'auto',
  left: 'auto',
}

const overlaps = (a: Area, b: Area) => {
  const { width, height } = intersect(a, b)
  return width > 0 && height > 0
}

const scrollTo = ({ x, y }: Point) => {
  window.scrollTo({ left: x, top: y, behavior: 'instant' })
}

// Rounds edges rather than sizes, so neighbouring tiles meet without a seam.
const pixels = (
  { left, top, width, height }: Area,
  { x, y }: Point,
  scale: number,
) => {
  const [x0, y0, x1, y1] = [
    left - x,
    top - y,
    left + width - x,
    top + height - y,
  ].map((edge) => Math.round(edge * scale)) as [number, number, number, number]
  return [x0, y0, x1 - x0, y1 - y0] as const
}

const captureTab = () =>
  ReplyCodec.decode(captureVisibleTab(undefined), CaptureError).andThen(
    (dataUrl) => Img.bitmap(Img.dataUrlToBlob(dataUrl)),
  )

export class Stitcher {
  constructor(private readonly stage: Stage) {}

  // Density is image pixels per CSS pixel. Snags past the size limits come out at a lower one.
  shoot(
    plan: Plan,
    density: number,
  ): ResultAsync<{ png: Blob; downscaled: boolean }, CaptureError> {
    const { width, height } = plan.area
    const scale = Math.min(
      density,
      Math.sqrt(MAX_PIXELS / (width * height)),
      MAX_SIDE / Math.max(width, height),
    )
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    )
    return match(canvas.getContext('2d'))
      .with(P.nonNullable, (context) =>
        this.stage
          .offstage(() => this.draw(context, plan, scale))
          .map((png) => ({ png, downscaled: scale < density })),
      )
      .otherwise(() =>
        errAsync(new CaptureError('Could not allocate a canvas for the snag')),
      )
  }

  private draw(
    context: OffscreenCanvasRenderingContext2D,
    { area, tiles, clip, pinned }: Plan,
    scale: number,
  ) {
    const origin = scrolled()
    const corner = { x: area.left, y: area.top }
    const reveal = InlineStyle.override(pinned.outside, HIDDEN)
    const restick = InlineStyle.override(pinned.sticky, UNSTUCK)
    const restore = () => {
      reveal()
      restick()
      scrollTo(origin)
    }
    context.imageSmoothingQuality = 'high'
    return tiles
      .reduce<ResultAsync<readonly Element[], CaptureError>>(
        (drawn, tile) =>
          drawn.andThen((captured) => {
            scrollTo(tile)
            // Fixed parts of the element belong where a tile first captured them, not repeated on later tiles.
            const show = InlineStyle.override(captured, HIDDEN)
            return ResultAsync.fromSafePromise(Stage.painted())
              .andThen(captureTab)
              .andTee(show)
              .orTee(show)
              .map((bitmap) => {
                const at = scrolled()
                const { clientWidth, clientHeight } = document.documentElement
                const part = intersect(area, {
                  left: at.x,
                  top: at.y,
                  width: clientWidth,
                  height: clientHeight,
                })
                // captureVisibleTab renders the whole window, scrollbars included, at device pixels, so the ratio to innerWidth also absorbs page zoom.
                const source = bitmap.width / window.innerWidth
                match(part)
                  .with(
                    { width: P.number.gt(0), height: P.number.gt(0) },
                    (part) => {
                      context.drawImage(
                        bitmap,
                        ...pixels(part, at, source),
                        ...pixels(part, corner, scale),
                      )
                    },
                  )
                  .otherwise(() => undefined)
                bitmap.close()
                return [
                  ...captured,
                  ...pinned.fixed.filter(
                    (element) =>
                      !captured.includes(element) &&
                      overlaps(
                        shift(element.getBoundingClientRect(), at),
                        part,
                      ),
                  ),
                ]
              })
          }),
        okAsync([]),
      )
      .andTee(restore)
      .orTee(restore)
      .andThen(() => {
        match(clip)
          .with(P.nonNullable, ({ box, radii }) => {
            context.globalCompositeOperation = 'destination-in'
            context.beginPath()
            context.roundRect(
              ...pixels(box, corner, scale),
              radii.map(({ x = 0, y = 0 }) => ({ x: x * scale, y: y * scale })),
            )
            context.fill()
          })
          .otherwise(() => undefined)
        return ResultAsync.fromPromise(
          context.canvas.convertToBlob({ type: 'image/png' }),
          toError(CaptureError),
        )
      })
  }
}
