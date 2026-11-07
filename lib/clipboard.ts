import { ResultAsync } from 'neverthrow'
import { ClipboardError, toError } from './errors'

// The clipboard API only exists in secure contexts, so on plain http pages this throws synchronously.
const write = ResultAsync.fromThrowable(
  (png: Promise<Blob>) =>
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]),
  toError(ClipboardError),
)

export class Clipboard {
  // Must be called synchronously inside a user gesture; the image itself may resolve later.
  static writePng(
    png: ResultAsync<Blob, Error>,
  ): ResultAsync<void, ClipboardError> {
    return write(
      new Promise<Blob>((resolve, reject) => {
        void png.match(resolve, reject)
      }),
    )
  }
}
