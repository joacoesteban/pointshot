import { ResultAsync } from 'neverthrow'
import { Clipboard } from './clipboard'
import { CaptureError } from './errors'
import { Img } from './image'
import { ReplyCodec } from './reply'
import type { ShotLibrary } from './shot-library'
import type { Stage } from './stage'
import { captureVisibleTab } from '~/messages'

const viewport = () => ({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
})

export class Snagger {
  constructor(
    private readonly stage: Stage,
    private readonly library: ShotLibrary,
  ) {}

  private capture(element: Element) {
    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    })
    const rect = element.getBoundingClientRect()
    const size = viewport()
    return this.stage
      .offstage(() =>
        ReplyCodec.decode(captureVisibleTab(undefined), CaptureError),
      )
      .andThen((dataUrl) => Img.crop(Img.dataUrlToBlob(dataUrl), rect, size))
  }

  // Runs synchronously up to the clipboard write so the click that picked the element still counts as the user gesture.
  snag(element: Element) {
    const captured = this.capture(element)
    const png = new Promise<Blob>((resolve, reject) => {
      void captured.match(({ png }) => {
        resolve(png)
      }, reject)
    })
    const copied = Clipboard.writePng(png)
    const saved = captured.andThen(({ png, area }) =>
      Img.blobToDataUrl(png).andThen((dataUrl) =>
        this.library.save({
          createdAt: Date.now(),
          url: location.href,
          title: document.title,
          width: Math.round(area.width),
          height: Math.round(area.height),
          dataUrl,
        }),
      ),
    )
    return ResultAsync.combine([saved, copied])
  }
}
