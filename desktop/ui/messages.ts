import { invoke } from '@tauri-apps/api/core'
import { ResultAsync } from 'neverthrow'
import { SnagDB } from '~/background/db'
import { ShotStore } from '~/background/shot-store'
import { DownloadError, toError } from '~/lib/errors'
import { ReplyCodec } from '~/lib/reply'
import { SettingsStore } from '~/lib/settings'
import type { NewShot } from '~/lib/shot'
import { ShotRevision } from '~/lib/shot-revision'
import type { FileDownload } from '~/messages'

// The extension's library messages, answered in the window itself: the webview keeps the same Dexie database the background does.
const store = new ShotStore(new SnagDB())

export const listShots = () => ReplyCodec.encode(store.list())

export const saveShot = (shot: NewShot) =>
  ReplyCodec.encode(
    SettingsStore.load()
      .andThen(({ limit }) => store.save(shot, limit))
      .andThen(ShotRevision.announced),
  )

export const removeShots = (ids: readonly string[]) =>
  ReplyCodec.encode(store.remove(ids).andThen(ShotRevision.announced))

export const shotImageUrl = (id: string) =>
  ReplyCodec.encode(store.imageUrl(id))

// ShotActions sends only downloads with a folder or Save As here, and leaves the rest to a link, which the webview saves in the downloads folder.
export const downloadFile = (file: FileDownload) =>
  ReplyCodec.encode(
    ResultAsync.fromPromise(
      invoke<number>('download', { ...file }),
      toError(DownloadError),
    ),
  )
