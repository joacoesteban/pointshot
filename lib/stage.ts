import { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'

// Hides the UI inside the shadow root: WXT resets the host with `all: initial !important`, which beats inline styles on it.
export class Stage {
  private pending = 0

  constructor(private readonly root: HTMLElement) {}

  // Two frames: the first commits the style change, the second guarantees it was painted before the tab is captured.
  static painted() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })
  }

  offstage<T, E>(run: () => ResultAsync<T, E>): ResultAsync<T, E> {
    this.pending += 1
    this.root.style.setProperty('opacity', '0', 'important')
    const show = () => {
      this.pending -= 1
      match(this.pending)
        .with(0, () => {
          this.root.style.removeProperty('opacity')
        })
        .otherwise(() => undefined)
    }
    return ResultAsync.fromSafePromise(Stage.painted())
      .andThen(run)
      .andTee(show)
      .orTee(show)
  }
}
