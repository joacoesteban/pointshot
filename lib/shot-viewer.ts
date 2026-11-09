import { okAsync, type ResultAsync } from 'neverthrow'
import { BehaviorSubject } from 'rxjs'
import toast from 'svelte-french-toast'
import { match, P } from 'ts-pattern'
import { ClipboardError } from './errors'
import { Failure } from './failure'
import { t } from './i18n'
import type { Settings } from './settings'
import type { Shot } from './shot'
import type { ShotActions } from './shot-actions'
import type { ShotLibrary } from './shot-library'

export type Size = { readonly width: number; readonly height: number }
export type Previewing = { readonly shot: Shot; readonly image: string | null }
export type Editing = { readonly shot: Shot; readonly image: string }

// The preview and editor state behind a shot grid, shared by the popup and the options library.
export class ShotViewer {
  private readonly previewing$$ = new BehaviorSubject<Previewing | null>(null)
  private readonly editing$$ = new BehaviorSubject<Editing | null>(null)
  readonly previewing$ = this.previewing$$.asObservable()
  readonly editing$ = this.editing$$.asObservable()

  constructor(
    private readonly library: ShotLibrary,
    private readonly actions: ShotActions,
    private readonly settings: () => Settings,
    private readonly onremove: (shots: readonly Shot[]) => void,
  ) {}

  open(shot: Shot) {
    this.previewing$$.next({ shot, image: null })
    void this.library.imageUrl(shot).match(
      (image) => {
        match(this.previewing$$.value)
          .with({ shot: { id: shot.id } }, () => {
            this.previewing$$.next({ shot, image })
          })
          .otherwise(() => undefined)
      },
      (error) => {
        this.previewing$$.next(null)
        Failure.report(error, t('couldNotOpen'))
      },
    )
  }

  closePreview() {
    this.previewing$$.next(null)
  }

  edit(shot: Shot, image: string) {
    this.previewing$$.next(null)
    this.editing$$.next({ shot, image })
  }

  closeEditor() {
    this.editing$$.next(null)
  }

  // Closes the preview of a shot that is going away.
  forget(shots: readonly Shot[]) {
    const ids = shots.map(({ id }) => id)
    match(this.previewing$$.value)
      .with({ shot: { id: P.when((id) => ids.includes(id)) } }, () => {
        this.previewing$$.next(null)
      })
      .otherwise(() => undefined)
  }

  remove(shot: Shot) {
    this.onremove([shot])
    this.forget([shot])
  }

  copy(shot: Shot) {
    void this.actions.copy(shot).match(
      () => toast.success(t('copied')),
      (error) => {
        Failure.report(
          error,
          match(error)
            .with(P.instanceOf(ClipboardError), () => t('clipboardBlocked'))
            .otherwise(Failure.explain),
        )
      },
    )
  }

  download(shot: Shot) {
    void this.actions.download(shot, this.settings()).mapErr(Failure.report)
  }

  // Called inside the click on Save, so the image still reaches the clipboard.
  saveEdit(png: ResultAsync<Blob, Error>, size: Size) {
    const source = match(this.editing$$.value)
      .with(P.nonNullable, ({ shot: { url, title } }) => ({ url, title }))
      .otherwise(() => ({ url: location.href, title: document.title }))
    this.editing$$.next(null)
    void this.library
      .keep(png, okAsync({ ...source, ...size }))
      .match(() => toast.success(t('savedAndCopied')), Failure.report)
  }
}
