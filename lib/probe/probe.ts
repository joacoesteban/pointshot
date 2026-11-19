export const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

export const portFrom = (value: string | undefined): number =>
  Number.parseInt(value ?? '', 10) || 8080

export const last = <T>(items: T[]): T | undefined => items.at(-1)

export const chunk = <T>(items: T[], size: number): T[][] => {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunk size must be a positive integer, got ${size}`)
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

export const retry = async <T>(task: () => Promise<T>, attempts: number): Promise<T | undefined> => {
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await task()
    } catch {}
  }
  return undefined
}
