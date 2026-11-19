import { match } from 'ts-pattern'

export const average = (values: number[]): number =>
  match(values)
    .with([], () => 0)
    .otherwise((nonEmpty) => nonEmpty.reduce((sum, value) => sum + value, 0) / nonEmpty.length)

export const portFrom = (value: string | undefined): number =>
  Number.parseInt(value ?? '', 10) || 8080

export const retry = async <T>(task: () => Promise<T>, attempts: number): Promise<T | undefined> => {
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await task()
    } catch {}
  }
}
