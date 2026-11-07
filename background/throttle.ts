export class Throttle {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly interval: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    this.queue = run
      .catch(() => undefined)
      .then(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, this.interval)
          }),
      )
    return run
  }
}
