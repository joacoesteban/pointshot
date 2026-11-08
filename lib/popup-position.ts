import { ResultAsync } from 'neverthrow'
import { browser } from 'wxt/browser'
import { z } from 'zod'
import { StorageError, toError } from './errors'

const KEY = 'popup-position'

const PositionSchema = z.object({ x: z.number(), y: z.number() }).nullable()

export type Position = NonNullable<z.infer<typeof PositionSchema>>

// Where the popup was left, shared by every site, in viewport pixels from the top left.
export class PopupPosition {
  static load(): ResultAsync<Position | null, StorageError> {
    return ResultAsync.fromPromise(
      browser.storage.local.get(KEY),
      toError(StorageError),
    ).map(({ [KEY]: raw }) => PositionSchema.catch(null).parse(raw))
  }

  static save(position: Position): ResultAsync<void, StorageError> {
    return ResultAsync.fromPromise(
      browser.storage.local.set({ [KEY]: position }),
      toError(StorageError),
    )
  }
}
