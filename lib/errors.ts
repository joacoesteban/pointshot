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
  override readonly name = 'StorageError'
}

export const toError =
  <E extends Error>(Kind: new (message: string) => E) =>
  (cause: unknown) =>
    new Kind(String(cause))
