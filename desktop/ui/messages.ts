import { errAsync } from 'neverthrow'
import { SnagDB } from '~/background/db'
import { ShotStore } from '~/background/shot-store'
import { DownloadError } from '~/lib/errors'
import { ReplyCodec } from '~/lib/reply'
import { SettingsStore } from '~/lib/settings'
import type { NewShot } from '~/lib/shot'
import { ShotRevision } from '~/lib/shot-revision'

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

// ShotActions falls back to a link download, which the webview saves in the downloads folder.
export const downloadFile = () =>
  ReplyCodec.encode(
    errAsync<number, DownloadError>(
      new DownloadError('The desktop app saves to the downloads folder'),
    ),
  )
