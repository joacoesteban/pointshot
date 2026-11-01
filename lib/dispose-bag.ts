import { Subject, takeUntil } from 'rxjs'

export class DisposeBag {
  private readonly destroy$ = new Subject<void>()

  readonly sink = <T>() => takeUntil<T>(this.destroy$)

  readonly dispose = () => {
    this.destroy$.next()
    this.destroy$.complete()
  }
}
