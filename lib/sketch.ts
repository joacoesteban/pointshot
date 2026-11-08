import chroma from 'chroma-js'
import { ResultAsync, errAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { CaptureError, toError } from './errors'
import { span, type Area, type Point } from './region'

export type Tool = 'arrow' | 'rectangle' | 'text' | 'blur' | 'crop'

// Coordinates and sizes are in image pixels.
export type Mark =
  | {
      readonly kind: 'arrow'
      readonly from: Point
      readonly to: Point
      readonly color: string
      readonly width: number
    }
  | {
      readonly kind: 'rectangle'
      readonly area: Area
      readonly color: string
      readonly width: number
    }
  | {
      readonly kind: 'text'
      readonly at: Point
      readonly text: string
      readonly color: string
      readonly size: number
    }
  | { readonly kind: 'blur'; readonly area: Area; readonly cell: number }

export type Sketch = {
  readonly marks: readonly Mark[]
  readonly crop: Area | null
}

export const EMPTY_SKETCH: Sketch = { marks: [], crop: null }

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// The head's length is this many stroke widths, and its sides open this far from the shaft.
const HEAD_LENGTH = 4.5
const HEAD_ANGLE = Math.PI / 7

export const arrowHead = (
  { x: x0, y: y0 }: Point,
  { x, y }: Point,
  width: number,
): readonly [Point, Point, Point] => {
  const angle = Math.atan2(y - y0, x - x0)
  const length = width * HEAD_LENGTH
  const side = (turn: number) => ({
    x: x - length * Math.cos(angle + turn),
    y: y - length * Math.sin(angle + turn),
  })
  return [{ x, y }, side(HEAD_ANGLE), side(-HEAD_ANGLE)]
}

// The area a drag drew, clamped to the image.
export const dragged = (
  from: Point,
  to: Point,
  { width, height }: { readonly width: number; readonly height: number },
): Area => {
  const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(Math.max(x, 0), width),
    y: Math.min(Math.max(y, 0), height),
  })
  return span(clamp(from), clamp(to))
}

const pixelate = (
  context: Context,
  { left, top, width, height }: Area,
  cell: number,
) => {
  const [x, y, w, h] = [left, top, width, height].map(Math.round) as [
    number,
    number,
    number,
    number,
  ]
  const small = new OffscreenCanvas(
    Math.max(1, Math.ceil(w / cell)),
    Math.max(1, Math.ceil(h / cell)),
  )
  const shrunk = small.getContext('2d')
  match(shrunk)
    .with(P.nonNullable, (shrunk) => {
      shrunk.drawImage(
        context.canvas,
        x,
        y,
        w,
        h,
        0,
        0,
        small.width,
        small.height,
      )
      context.save()
      context.imageSmoothingEnabled = false
      context.drawImage(small, 0, 0, small.width, small.height, x, y, w, h)
      context.restore()
    })
    .otherwise(() => undefined)
}

const haloOf = (color: string) =>
  match(chroma(color).luminance())
    .with(P.number.gt(0.5), () => '#000000aa')
    .otherwise(() => '#ffffffcc')

const draw = (context: Context, mark: Mark) => {
  match(mark)
    .with({ kind: 'arrow' }, ({ from, to, color, width }) => {
      const [tip, left, right] = arrowHead(from, to, width)
      context.strokeStyle = color
      context.fillStyle = color
      context.lineWidth = width
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo((left.x + right.x) / 2, (left.y + right.y) / 2)
      context.stroke()
      context.beginPath()
      context.moveTo(tip.x, tip.y)
      context.lineTo(left.x, left.y)
      context.lineTo(right.x, right.y)
      context.closePath()
      context.fill()
    })
    .with({ kind: 'rectangle' }, ({ area, color, width }) => {
      context.strokeStyle = color
      context.lineWidth = width
      context.lineJoin = 'round'
      context.strokeRect(area.left, area.top, area.width, area.height)
    })
    .with({ kind: 'text' }, ({ at, text, color, size }) => {
      context.font = `600 ${String(size)}px Outfit, sans-serif`
      context.textBaseline = 'top'
      context.lineJoin = 'round'
      // A halo of the opposite lightness keeps the text readable on any background.
      context.lineWidth = size / 6
      context.strokeStyle = haloOf(color)
      context.strokeText(text, at.x, at.y)
      context.fillStyle = color
      context.fillText(text, at.x, at.y)
    })
    .with({ kind: 'blur' }, ({ area, cell }) => {
      pixelate(context, area, cell)
    })
    .exhaustive()
}

export class SketchRenderer {
  // Draws the image with its marks, uncropped, onto a canvas of the image's size.
  static render(context: Context, image: ImageBitmap, { marks }: Sketch) {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    context.drawImage(image, 0, 0)
    marks.forEach((mark) => {
      draw(context, mark)
    })
  }

  static export(
    image: ImageBitmap,
    sketch: Sketch,
  ): ResultAsync<Blob, CaptureError> {
    const full = new OffscreenCanvas(image.width, image.height)
    const { left, top, width, height } = sketch.crop ?? {
      left: 0,
      top: 0,
      width: image.width,
      height: image.height,
    }
    const out = new OffscreenCanvas(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
    )
    return match({ full: full.getContext('2d'), out: out.getContext('2d') })
      .with(
        { full: P.nonNullable, out: P.nonNullable },
        ({ full, out: cropped }) => {
          SketchRenderer.render(full, image, sketch)
          cropped.drawImage(
            full.canvas,
            left,
            top,
            width,
            height,
            0,
            0,
            out.width,
            out.height,
          )
          return ResultAsync.fromPromise(
            out.convertToBlob({ type: 'image/png' }),
            toError(CaptureError),
          )
        },
      )
      .otherwise(() =>
        errAsync(new CaptureError('Could not allocate a canvas for the edit')),
      )
  }
}
