import { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { Clipboard } from './clipboard'
import { Img } from './image'
import { Region, type Area, type Framing } from './region'
import type { Shot } from './shot'
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

export type Source = Pick<Shot, 'url' | 'title' | 'width' | 'height'>

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
    return this.keep(
      captured.map(({ png }) => png),
      captured.map(({ area }) => ({
        url: location.href,
        title: document.title,
        width: Math.round(area.width),
        height: Math.round(area.height),
      })),
    )
      .andThen(() => captured)
      .map(({ downscaled }) => downscaled)
  }

  // Copies an image and saves it as a new shot. Like snag, it must be called inside the user gesture.
  keep(
    png: ResultAsync<Blob, Error>,
    source: ResultAsync<Source, Error>,
  ): ResultAsync<void, Error> {
    const copied = Clipboard.writePng(png)
    const saved = ResultAsync.combine([png, source]).andThen(([png, source]) =>
      ResultAsync.combine([Img.blobToDataUrl(png), Img.thumbnail(png)]).andThen(
        ([image, thumbnail]) =>
          this.library.save({
            ...source,
            createdAt: Date.now(),
            thumbnail,
            image,
          }),
      ),
    )
    return ResultAsync.combine([saved, copied]).map(() => undefined)
  }
}
