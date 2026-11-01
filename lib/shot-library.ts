import { ResultAsync } from 'neverthrow'
import { BehaviorSubject } from 'rxjs'
import { StorageError } from './errors'
import { ReplyCodec } from './reply'
import type { NewShot, Reply, Shot } from './shot'
import { listShots, removeShot, saveShot } from '~/messages'

export class ShotLibrary {
  private readonly shots$$ = new BehaviorSubject<Shot[]>([])
  readonly shots$ = this.shots$$.asObservable()

  refresh() {
    return this.sync(listShots(undefined))
  }

  save(shot: NewShot) {
    return this.sync(saveShot(shot))
  }

  remove({ id }: Shot) {
    return this.sync(removeShot(id))
  }

  private sync(
    reply: Promise<Reply<Shot[]>>,
  ): ResultAsync<Shot[], StorageError> {
    return ReplyCodec.decode(reply, StorageError).map((shots) => {
      this.shots$$.next(shots)
      return shots
    })
  }
}
