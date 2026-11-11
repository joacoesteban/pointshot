import { ResultAsync } from 'neverthrow'
import { browser } from 'wxt/browser'
import { z } from 'zod'
import { StorageError, toError } from './errors'
import { SettingsStore } from './settings'

const KEY = 'recent-errors'
// Enough to see a pattern without keeping a history of the user's browsing.
const KEEP = 20

const EntriesSchema = z
  .array(z.object({ at: z.number(), name: z.string(), message: z.string() }))
  .catch([])

type Entry = z.infer<typeof EntriesSchema>[number]

const load = () =>
  ResultAsync.fromPromise(
    browser.storage.local.get(KEY),
    toError(StorageError),
  ).map(({ [KEY]: raw }) => EntriesSchema.parse(raw))

export class Diagnostics {
  static record({ name, message }: Error): ResultAsync<void, StorageError> {
    return load().andThen((entries) =>
      ResultAsync.fromPromise(
        browser.storage.local.set({
          [KEY]: [...entries, { at: Date.now(), name, message }].slice(-KEEP),
        }),
        toError(StorageError),
      ),
    )
  }

  // What a bug report needs: the version, the browser, the settings and the recent errors, without page addresses.
  static report(): ResultAsync<string, StorageError> {
    return ResultAsync.combine([load(), SettingsStore.load()]).map(
      ([entries, settings]) =>
        [
          `Pointshot ${browser.runtime.getManifest().version}`,
          navigator.userAgent,
          `Settings: ${JSON.stringify(settings)}`,
          'Recent errors:',
          ...entries.map(
            ({ at, name, message }: Entry) =>
              `${new Date(at).toISOString()} ${name}: ${message}`,
          ),
        ].join('\n'),
    )
  }
}
