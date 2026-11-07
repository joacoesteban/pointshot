import { ResultAsync, errAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { StorageError, toError } from '~/lib/errors'
import { Img } from '~/lib/image'
import type { NewShot, Saved, Shot } from '~/lib/shot'
import type { SnagDB, StoredShot } from './db'

const MAX_SHOTS = 100

const summaryOf = ({
  id,
  createdAt,
  url,
  title,
  width,
  height,
  thumbnail,
}: StoredShot): Shot => ({
  id,
  createdAt,
  url,
  title,
  width,
  height,
  thumbnail,
})

export class ShotStore {
  constructor(private readonly db: SnagDB) {}

  list(): ResultAsync<Shot[], StorageError> {
    return ResultAsync.fromPromise(
      this.newestFirst().toArray(),
      toError(StorageError),
    ).map((shots) => shots.map(summaryOf))
  }

  // crypto.randomUUID is missing on insecure pages, so ids are minted here instead of in the content script.
  save({ image, ...shot }: NewShot): ResultAsync<Saved, StorageError> {
    const stored: StoredShot = {
      ...shot,
      id: crypto.randomUUID(),
      image: Img.dataUrlToBlob(image),
    }
    return ResultAsync.fromPromise(
      this.db.transaction('rw', this.db.shots, async () => {
        await this.db.shots.put(stored)
        const evicted = await this.newestFirst().offset(MAX_SHOTS).primaryKeys()
        await this.db.shots.bulkDelete(evicted)
        return evicted
      }),
      toError(StorageError),
    ).map((evicted) => ({ shot: summaryOf(stored), evicted }))
  }

  imageUrl(id: string): ResultAsync<string, StorageError> {
    return ResultAsync.fromPromise(
      this.db.shots.get(id),
      toError(StorageError),
    ).andThen((shot) =>
      match(shot)
        .with({ image: P.select() }, (image) =>
          Img.blobToDataUrl(image).mapErr(toError(StorageError)),
        )
        .otherwise(() =>
          errAsync(new StorageError('The snag is no longer stored')),
        ),
    )
  }

  remove(id: string): ResultAsync<undefined, StorageError> {
    return ResultAsync.fromPromise(
      this.db.shots.delete(id),
      toError(StorageError),
    ).map(() => undefined)
  }

  private newestFirst() {
    return this.db.shots.orderBy('createdAt').reverse()
  }
}
