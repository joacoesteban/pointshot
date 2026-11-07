import { BehaviorSubject } from 'rxjs'
import { QuotaError, StorageError } from './errors'
import { ReplyCodec } from './reply'
import type { NewShot, Shot } from './shot'
import { listShots, removeShot, saveShot, shotImageUrl } from '~/messages'

export class ShotLibrary {
  private readonly shots$$ = new BehaviorSubject<Shot[]>([])
  readonly shots$ = this.shots$$.asObservable()

  refresh() {
    return ReplyCodec.decode(listShots(undefined), StorageError).map((shots) =>
      this.publish(shots),
    )
  }

  save(shot: NewShot) {
    return ReplyCodec.decode(saveShot(shot), StorageError, [QuotaError]).map(
      ({ shot, evicted }) => this.publish([shot, ...this.without(evicted)]),
    )
  }

  remove({ id }: Shot) {
    return ReplyCodec.decode(removeShot(id), StorageError).map(() =>
      this.publish(this.without([id])),
    )
  }

  imageUrl({ id }: Shot) {
    return ReplyCodec.decode(shotImageUrl(id), StorageError)
  }

  private without(ids: readonly string[]) {
    return this.shots$$.value.filter(({ id }) => !ids.includes(id))
  }

  private publish(shots: Shot[]) {
    this.shots$$.next(shots)
    return shots
  }
}
