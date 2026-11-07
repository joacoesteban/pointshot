import { ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { CaptureError, toError } from './errors'

const PNG = 'image/png'
const WEBP = 'image/webp'
// Bounding box of a thumbnail, in device pixels: twice the popup card's width keeps it sharp on high-density screens.
const THUMBNAIL_SIZE = 480

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
}
