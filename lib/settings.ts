import { ResultAsync } from 'neverthrow'
import {
  type Observable,
  concat,
  defer,
  filter,
  fromEventPattern,
  map,
  shareReplay,
} from 'rxjs'
import { match, P } from 'ts-pattern'
import { browser, type Browser } from 'wxt/browser'
import { z } from 'zod'
import { StorageError, toError } from './errors'

const KEY = 'settings'

const Shape = z.object({
  limit: z.number().int().min(10).max(1000).catch(100),
  delay: z.number().int().min(1).max(10).catch(3),
})

export const DEFAULT_SETTINGS = Shape.parse({})

// A field that fails to parse falls back to its default, so stored settings from an older or newer version never break loading.
export const SettingsSchema = Shape.catch(DEFAULT_SETTINGS)

export type Settings = z.infer<typeof SettingsSchema>

type Change = {
  readonly changes: Record<string, Browser.storage.StorageChange>
  readonly area: string
}

const store = browser.storage.local

export class SettingsStore {
  static load(): ResultAsync<Settings, StorageError> {
    return ResultAsync.fromPromise(store.get(KEY), toError(StorageError)).map(
      ({ [KEY]: raw }) => SettingsSchema.parse(raw),
    )
  }

  static update(patch: Partial<Settings>): ResultAsync<Settings, StorageError> {
    return SettingsStore.load().andThen((settings) => {
      const next = SettingsSchema.parse({ ...settings, ...patch })
      return ResultAsync.fromPromise(
        store.set({ [KEY]: next }),
        toError(StorageError),
      ).map(() => next)
    })
  }

  static changes(): Observable<Settings> {
    const changed$ = fromEventPattern<Change>(
      (handler) => {
        browser.storage.onChanged.addListener(handler)
      },
      (handler) => {
        browser.storage.onChanged.removeListener(handler)
      },
      (changes: Change['changes'], area: string) => ({ changes, area }),
    ).pipe(
      map((change) =>
        match(change)
          .with(
            { area: 'local', changes: { [KEY]: { newValue: P.select() } } },
            (raw) => SettingsSchema.parse(raw),
          )
          .otherwise(() => undefined),
      ),
      filter((settings) => settings !== undefined),
    )
    return concat(
      defer(() => SettingsStore.load().unwrapOr(DEFAULT_SETTINGS)),
      changed$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }))
  }
}
