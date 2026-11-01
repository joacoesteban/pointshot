import { ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { StorageError, toError } from '~/lib/errors'
import type { NewShot, Shot } from '~/lib/shot'
import type { SnagDB } from './db'

const MAX_SHOTS = 50
// Every listing crosses the runtime message channel as data URLs, and Chrome caps a message at 64 MiB.
const MAX_LISTING_CHARS = 48 * 1024 * 1024

const staleIds = (newestFirst: readonly Shot[]) =>
  newestFirst.reduce<{ total: number; stale: string[] }>(
    ({ total, stale }, { id, dataUrl }, index) =>
      match({ index, total: total + dataUrl.length })
        .with(
          { index: P.number.gte(MAX_SHOTS) },
          { index: P.number.gt(0), total: P.number.gt(MAX_LISTING_CHARS) },
          () => ({ total, stale: [...stale, id] }),
        )
        .otherwise(({ total }) => ({ total, stale })),
    { total: 0, stale: [] },
  ).stale

export class ShotStore {
  constructor(private readonly db: SnagDB) {}

  list(): ResultAsync<Shot[], StorageError> {
    return ResultAsync.fromPromise(
      this.db.shots.orderBy('createdAt').reverse().toArray(),
      toError(StorageError),
    )
  }

  // crypto.randomUUID is missing on insecure pages, so ids are minted here instead of in the content script.
  save(shot: NewShot): ResultAsync<Shot[], StorageError> {
    return ResultAsync.fromPromise(
      this.db.transaction('rw', this.db.shots, async () => {
        await this.db.shots.put({ ...shot, id: crypto.randomUUID() })
        const shots = await this.db.shots
          .orderBy('createdAt')
          .reverse()
          .toArray()
        await this.db.shots.bulkDelete(staleIds(shots))
      }),
      toError(StorageError),
    ).andThen(() => this.list())
  }

  remove(id: string): ResultAsync<Shot[], StorageError> {
    return ResultAsync.fromPromise(
      this.db.shots.delete(id),
      toError(StorageError),
    ).andThen(() => this.list())
  }
}
