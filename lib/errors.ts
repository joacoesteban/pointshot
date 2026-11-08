export class CaptureError extends Error {
  override readonly name = 'CaptureError'
}

export class EmptyAreaError extends Error {
  override readonly name = 'EmptyAreaError'

  constructor() {
    super('The element has no visible area')
  }
}

export class ClipboardError extends Error {
  override readonly name = 'ClipboardError'
}

export class StorageError extends Error {
  override readonly name: 'StorageError' | 'QuotaError' = 'StorageError'
}

export class QuotaError extends StorageError {
  override readonly name = 'QuotaError'
}

export type ErrorKind<E extends Error> = new (
  message: string,
  options?: ErrorOptions,
) => E

export const toError =
  <E extends Error>(Kind: ErrorKind<E>) =>
  (cause: unknown) =>
    new Kind(String(cause), { cause })
