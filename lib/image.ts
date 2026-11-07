import { Result, ResultAsync, err, ok } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { CaptureError, EmptyAreaError, toError } from './errors'

export type Area = Readonly<Record<'left' | 'top' | 'width' | 'height', number>>

const PNG = 'image/png'
const WEBP = 'image/webp'
// Bounding box of a thumbnail, in device pixels: twice the popup card's width keeps it sharp on high-density screens.
const THUMBNAIL_SIZE = 480

const visibleArea = (
  { left, top, right, bottom }: DOMRect,
  viewport: Readonly<Record<'width' | 'height', number>>,
): Result<Area, EmptyAreaError> => {
  const area = {
    left: Math.max(left, 0),
    top: Math.max(top, 0),
    width: Math.min(right, viewport.width) - Math.max(left, 0),
    height: Math.min(bottom, viewport.height) - Math.max(top, 0),
  }
  return match(area)
    .with({ width: P.number.gt(0), height: P.number.gt(0) }, (area) => ok(area))
    .otherwise(() => err(new EmptyAreaError()))
}

export class Img {
  static dataUrlToBlob(dataUrl: string): Blob {
    const [header = '', body = ''] = dataUrl.split(',')
    const type = match(/^data:([^;]+)/.exec(header))
      .with([P._, P.select(P.string)], (mime) => mime)
      .otherwise(() => PNG)
    const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
    return new Blob([bytes], { type })
  }

  static blobToDataUrl(blob: Blob): ResultAsync<string, CaptureError> {
    return ResultAsync.fromPromise(
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          match(reader.result)
            .with(P.string, resolve)
            .otherwise(() => {
              reject(new Error('Blob did not read as a data URL'))
            })
        }
        reader.onerror = () => {
          reject(reader.error ?? new Error('Could not read blob'))
        }
        reader.readAsDataURL(blob)
      }),
      toError(CaptureError),
    )
  }

  static bitmap(blob: Blob): ResultAsync<ImageBitmap, CaptureError> {
    return ResultAsync.fromPromise(
      createImageBitmap(blob),
      toError(CaptureError),
    )
  }

  static thumbnail(png: Blob): ResultAsync<string, CaptureError> {
    return Img.bitmap(png)
      .andThen((bitmap) => {
        const scale = Math.min(
          1,
          THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height),
        )
        const canvas = new OffscreenCanvas(
          Math.max(1, Math.round(bitmap.width * scale)),
          Math.max(1, Math.round(bitmap.height * scale)),
        )
        canvas
          .getContext('2d')
          ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()
        return ResultAsync.fromPromise(
          canvas.convertToBlob({ type: WEBP, quality: 0.85 }),
          toError(CaptureError),
        )
      })
      .andThen((thumbnail) => Img.blobToDataUrl(thumbnail))
  }

  // captureVisibleTab renders the whole window, scrollbars included, at device pixels, so the ratio to innerWidth also absorbs page zoom.
  static crop(
    capture: Blob,
    rect: DOMRect,
    viewport: Readonly<Record<'width' | 'height', number>>,
  ): ResultAsync<{ png: Blob; area: Area }, CaptureError | EmptyAreaError> {
    return visibleArea(rect, viewport)
      .asyncAndThen((area) =>
        Img.bitmap(capture).map((bitmap) => ({ area, bitmap })),
      )
      .andThen(({ area, bitmap }) => {
        const scale = bitmap.width / window.innerWidth
        const [x, y, width, height] = [
          area.left,
          area.top,
          area.width,
          area.height,
        ].map((value) => Math.round(value * scale)) as [
          number,
          number,
          number,
          number,
        ]
        const canvas = new OffscreenCanvas(width, height)
        canvas
          .getContext('2d')
          ?.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
        bitmap.close()
        return ResultAsync.fromPromise(
          canvas.convertToBlob({ type: PNG }),
          toError(CaptureError),
        ).map((png) => ({ png, area }))
      })
  }
}
