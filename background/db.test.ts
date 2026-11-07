import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { SnagDB } from './db'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(async () => {
  await Dexie.delete('snag-db')
})

describe('SnagDB', () => {
  it('migrates legacy dataUrl rows to a thumbnail and an image blob', async () => {
    const legacy = new Dexie('snag-db')
    legacy.version(1).stores({ shots: 'id, createdAt' })
    await legacy.table('shots').put({
      id: 'a',
      createdAt: 1,
      url: 'https://example.com/',
      title: 'Example',
      width: 10,
      height: 10,
      dataUrl: PNG,
    })
    legacy.close()

    const db = new SnagDB()
    const row = await db.shots.get('a')
    db.close()

    expect(row).toMatchObject({
      id: 'a',
      createdAt: 1,
      url: 'https://example.com/',
      title: 'Example',
      width: 10,
      height: 10,
      thumbnail: PNG,
    })
    expect(row).not.toHaveProperty('dataUrl')
    expect(row?.image).toBeInstanceOf(Blob)
    expect(row?.image.type).toBe('image/png')
    expect(
      Array.from(new Uint8Array((await row?.image.arrayBuffer()) ?? [])),
    ).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
