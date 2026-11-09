import { ResultAsync } from 'neverthrow'
import { filter, fromEventPattern, map, type Observable } from 'rxjs'
import { match, P } from 'ts-pattern'
import { browser, type Browser } from 'wxt/browser'
import { StorageError, toError } from './errors'

const KEY = 'shotsRevision'

type Change = {
  readonly changes: Record<string, Browser.storage.StorageChange>
  readonly area: string
}

// The background bumps a counter in storage after every save or removal, and every open library refreshes on it.
// Storage events reach content scripts and extension pages alike, which a runtime message would not without a tab list.
export class ShotRevision {
  static bump(): ResultAsync<void, StorageError> {
    return ResultAsync.fromPromise(
      browser.storage.local.set({ [KEY]: Date.now() }),
      toError(StorageError),
    ).map(() => undefined)
  }

  static changes(): Observable<void> {
    return fromEventPattern<Change>(
      (handler) => {
        browser.storage.onChanged.addListener(handler)
      },
      (handler) => {
        browser.storage.onChanged.removeListener(handler)
      },
      (changes: Change['changes'], area: string) => ({ changes, area }),
    ).pipe(
      filter((change) =>
        match(change)
          .with(
            { area: 'local', changes: { [KEY]: P.nonNullable } },
            () => true,
          )
          .otherwise(() => false),
      ),
      map(() => undefined),
    )
  }
}
