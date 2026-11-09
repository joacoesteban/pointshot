import type { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { Region, type Area, type Framing } from './region'
import type { ShotLibrary, Source } from './shot-library'
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

export type { Source }

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

  keep(
    png: ResultAsync<Blob, Error>,
    source: ResultAsync<Source, Error>,
  ): ResultAsync<void, Error> {
    return this.library.keep(png, source)
  }
}
