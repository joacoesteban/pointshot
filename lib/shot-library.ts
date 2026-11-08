import { okAsync } from 'neverthrow'
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  map,
  race,
  switchMap,
  take,
  timer,
} from 'rxjs'
import { match } from 'ts-pattern'
import { QuotaError, StorageError } from './errors'
import { ReplyCodec } from './reply'
import type { NewShot, Shot } from './shot'
import { listShots, removeShots, saveShot, shotImageUrl } from '~/messages'

// How long removed shots wait, hidden, for an undo before they are deleted.
const UNDO_WINDOW = 5_000

export class ShotLibrary {
  private readonly shots$$ = new BehaviorSubject<Shot[]>([])
  private readonly removed$$ = new BehaviorSubject<readonly Shot[]>([])
  // Removals sent to the background, past undoing but hidden until it replies.
  private readonly committing$$ = new BehaviorSubject<readonly string[]>([])
  private readonly flush$ = new Subject<void>()
  private readonly failures$$ = new Subject<StorageError>()

  readonly shots$ = combineLatest([
    this.shots$$,
    this.removed$$,
    this.committing$$,
  ]).pipe(
    map(([shots, removed, committing]) => {
      const ids = [...removed.map(({ id }) => id), ...committing]
      return shots.filter(({ id }) => !ids.includes(id))
    }),
  )
  readonly removed$ = this.removed$$.asObservable()
  readonly failures$ = this.failures$$.asObservable()

  constructor() {
    this.removed$$
      .pipe(
        switchMap(() => race(timer(UNDO_WINDOW), this.flush$).pipe(take(1))),
      )
      .subscribe(() => {
        void this.commit()
      })
  }

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

  // Hides the shots at once and deletes them once the undo window closes without an undo.
  remove(shots: readonly Shot[]) {
    this.removed$$.next([...this.removed$$.value, ...shots])
  }

  undo() {
    this.removed$$.next([])
  }

  // Deletes the removed shots now, before the page goes away.
  flush() {
    this.flush$.next()
  }

  imageUrl({ id }: Shot) {
    return ReplyCodec.decode(shotImageUrl(id), StorageError)
  }

  private commit() {
    const ids = this.removed$$.value.map(({ id }) => id)
    return match(ids)
      .with([], () => okAsync<Shot[], StorageError>(this.shots$$.value))
      .otherwise((ids) => {
        this.committing$$.next([...this.committing$$.value, ...ids])
        this.removed$$.next(
          this.removed$$.value.filter(({ id }) => !ids.includes(id)),
        )
        return ReplyCodec.decode(removeShots(ids), StorageError)
          .map(() => this.publish(this.without(ids)))
          .orTee((error) => {
            this.failures$$.next(error)
          })
          .andTee(() => {
            this.settle(ids)
          })
          .orTee(() => {
            this.settle(ids)
          })
      })
  }

  // A failed removal shows its shots again, since they are still stored.
  private settle(ids: readonly string[]) {
    this.committing$$.next(
      this.committing$$.value.filter((id) => !ids.includes(id)),
    )
  }

  private without(ids: readonly string[]) {
    return this.shots$$.value.filter(({ id }) => !ids.includes(id))
  }

  private publish(shots: Shot[]) {
    this.shots$$.next(shots)
    return shots
  }
}
