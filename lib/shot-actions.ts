import { okAsync, type ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import { Clipboard } from './clipboard'
import { Download, fileName, pathOf } from './download'
import { DownloadError } from './errors'
import { Img } from './image'
import { ReplyCodec } from './reply'
import type { Settings } from './settings'
import type { Shot } from './shot'
import type { ShotLibrary } from './shot-library'
import { downloadFile } from '~/messages'

// What a stored shot can be done with, from the popup or the options page. Each call must start inside a user gesture.
export class ShotActions {
  constructor(
    private readonly library: ShotLibrary,
    private readonly root: Node,
  ) {}

  copy(shot: Shot): ResultAsync<void, Error> {
    return Clipboard.writePng(
      this.library.imageUrl(shot).map((url) => Img.dataUrlToBlob(url)),
    )
  }

  // Save as and folders go through the downloads API, which falls back to a plain download when its permission was not granted.
  download(
    shot: Shot,
    { format, quality, saveAs, folder }: Settings,
  ): ResultAsync<void, Error> {
    const viaAnchor = (url: string) => {
      Download.shot(shot, url, format, this.root)
      return okAsync(undefined)
    }
    return this.library
      .imageUrl(shot)
      .andThen((imageUrl) => Img.encode(imageUrl, format, quality))
      .andThen((url) =>
        match({ saveAs, folder })
          .with({ saveAs: false, folder: '' }, () => viaAnchor(url))
          .otherwise(() =>
            ReplyCodec.decode(
              downloadFile({
                url,
                filename: pathOf(folder, fileName(shot, format)),
                saveAs,
              }),
              DownloadError,
            )
              .map(() => undefined)
              .orElse(() => viaAnchor(url)),
          ),
      )
  }
}
