import Dexie, { type EntityTable } from 'dexie'
import { Img } from '~/lib/image'
import type { Shot } from '~/lib/shot'

export type StoredShot = Shot & { readonly image: Blob }

type LegacyShot = Omit<Shot, 'thumbnail'> & { readonly dataUrl: string }

// Version 1 kept only the full image, as a data URL. It stays on as the thumbnail: drawing a smaller one is async, which would end the upgrade transaction.
const fromLegacy = ({ dataUrl, ...shot }: LegacyShot): StoredShot => ({
  ...shot,
  thumbnail: dataUrl,
  image: Img.dataUrlToBlob(dataUrl),
})

export class SnagDB extends Dexie {
  readonly shots: EntityTable<StoredShot, 'id'>

  constructor() {
    super('snag-db')
    this.version(1).stores({
      shots: 'id, createdAt',
    })
    this.version(2).upgrade((tx) =>
      tx
        .table<LegacyShot, string>('shots')
        .toCollection()
        .modify((legacy, ref: { value: unknown }) => {
          ref.value = fromLegacy(legacy)
        }),
    )
    this.shots = this.table('shots')
  }
}
