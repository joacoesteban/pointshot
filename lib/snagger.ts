import { ResultAsync } from 'neverthrow'
import { Clipboard } from './clipboard'
import { Img } from './image'
import { Region, type Framing } from './region'
import type { ShotLibrary } from './shot-library'
import type { Stitcher } from './stitcher'

export class Snagger {
  constructor(
    private readonly stitcher: Stitcher,
    private readonly library: ShotLibrary,
    private readonly host: Element,
  ) {}

  private capture(element: Element, framing: Framing) {
    return Region.plan(element, framing, this.host).andThen((plan) =>
      this.stitcher.shoot(plan).map((png) => ({ png, area: plan.area })),
    )
  }

  // Runs synchronously up to the clipboard write so the click that picked the element still counts as the user gesture.
  snag(element: Element, framing: Framing) {
    const captured = this.capture(element, framing)
    const copied = Clipboard.writePng(captured.map(({ png }) => png))
    const saved = captured.andThen(({ png, area }) =>
      ResultAsync.combine([Img.blobToDataUrl(png), Img.thumbnail(png)]).andThen(
        ([image, thumbnail]) =>
          this.library.save({
            createdAt: Date.now(),
            url: location.href,
            title: document.title,
            width: Math.round(area.width),
            height: Math.round(area.height),
            thumbnail,
            image,
          }),
      ),
    )
    return ResultAsync.combine([saved, copied])
  }
}
