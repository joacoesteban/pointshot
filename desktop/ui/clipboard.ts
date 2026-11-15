import { invoke } from '@tauri-apps/api/core'
import { ResultAsync } from 'neverthrow'
import { ClipboardError, toError } from '~/lib/errors'

// The extension's Clipboard, through the app: webviews outside a browser do not reliably take images, and need no user gesture here.
export class Clipboard {
  static writeText(text: string): ResultAsync<void, ClipboardError> {
    return ResultAsync.fromPromise(
      invoke('copy_text', { text }),
      toError(ClipboardError),
    ).map(() => undefined)
  }

  static writePng(
    png: ResultAsync<Blob, Error>,
  ): ResultAsync<void, ClipboardError> {
    return png
      .andThen((png) =>
        ResultAsync.fromPromise(png.arrayBuffer(), toError(ClipboardError)),
      )
      .andThen((bytes) =>
        ResultAsync.fromPromise(invoke('copy', bytes), toError(ClipboardError)),
      )
      .mapErr(toError(ClipboardError))
      .map(() => undefined)
  }
}
