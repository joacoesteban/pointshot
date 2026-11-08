import { ResultAsync } from 'neverthrow'
import { ClipboardError, toError } from './errors'

// The clipboard API only exists in secure contexts, so on plain http pages this throws synchronously.
const write = ResultAsync.fromThrowable(
  (png: Promise<Blob>) =>
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]),
  toError(ClipboardError),
)

const writeText = ResultAsync.fromThrowable(
  (text: string) => navigator.clipboard.writeText(text),
  toError(ClipboardError),
)

export class Clipboard {
  static writeText(text: string): ResultAsync<void, ClipboardError> {
    return writeText(text)
  }

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
