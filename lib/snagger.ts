import { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { Clipboard } from './clipboard'
import { Img } from './image'
import { Region, type Area, type Framing } from './region'
import type { ShotLibrary } from './shot-library'
import type { Stitcher } from './stitcher'
import { Unclip } from './unclip'

export type Target =
  | {
      readonly kind: 'element'
      readonly element: Element
      readonly framing: Framing
    }
  | { readonly kind: 'visible' }
  | { readonly kind: 'page' }
  | { readonly kind: 'selection'; readonly rect: Area }

export class Snagger {
  constructor(
    private readonly stitcher: Stitcher,
    private readonly library: ShotLibrary,
    private readonly host: Element,
  ) {}

  private plan(target: Target) {
    return match(target)
      .with({ kind: 'element' }, ({ element, framing }) =>
        Region.plan(element, framing, this.host),
      )
      .with({ kind: 'visible' }, () => Region.visible())
      .with({ kind: 'page' }, () => Region.page(this.host))
      .with({ kind: 'selection' }, ({ rect }) => Region.selection(rect))
      .exhaustive()
  }

  private capture(target: Target, density: number) {
    const close = match(target)
      .with({ kind: 'element' }, ({ element }) => Unclip.open(element))
      .otherwise(() => () => undefined)
    return this.plan(target)
      .andThen((plan) =>
        this.stitcher
          .shoot(plan, density)
          .map((shot) => ({ ...shot, area: plan.area })),
      )
      .andTee(close)
      .orTee(close)
  }

  // Runs synchronously up to the clipboard write so the click that picked the element still counts as the user gesture.
  // Resolves to whether the snag had to be scaled down to fit.
  snag(target: Target, density: number) {
    const captured = this.capture(target, density)
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
      .andThen(() => captured)
      .map(({ downscaled }) => downscaled)
  }
}
