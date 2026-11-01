import { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'

// Two frames: the first commits the style change, the second guarantees it was painted before the tab is captured.
const painted = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })

// Hides the UI inside the shadow root: WXT resets the host with `all: initial !important`, which beats inline styles on it.
export class Stage {
  private pending = 0

  constructor(private readonly root: HTMLElement) {}

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
    return ResultAsync.fromSafePromise(painted())
      .andThen(run)
      .map((value) => {
        show()
        return value
      })
      .mapErr((error) => {
        show()
        return error
      })
  }
}
