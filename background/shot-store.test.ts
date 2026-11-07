import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NewShot, Saved } from '~/lib/shot'
import { SnagDB } from './db'
import { ShotStore } from './shot-store'

const shotAt = (createdAt: number): NewShot => ({
  createdAt,
  url: 'https://example.com/',
  title: 'Example',
  width: 10,
  height: 10,
  thumbnail: 'data:image/webp;base64,AAAA',
  image: 'data:image/png;base64,iVBORw0KGgo=',
})

let db: SnagDB
let store: ShotStore

beforeEach(async () => {
  await Dexie.delete('snag-db')
  db = new SnagDB()
  store = new ShotStore(db)
})

afterEach(() => {
  db.close()
})

describe('ShotStore', () => {
  it('returns the saved shot without its image', async () => {
    const { shot, evicted } = (await store.save(shotAt(1)))._unsafeUnwrap()
    expect(shot).toEqual({
      id: shot.id,
      createdAt: 1,
      url: 'https://example.com/',
      title: 'Example',
      width: 10,
      height: 10,
      thumbnail: 'data:image/webp;base64,AAAA',
    })
    expect(shot.id).toHaveLength(36)
    expect(evicted).toEqual([])
  })

  it('keeps the newest 100 shots and evicts the oldest', async () => {
    const results = await Array.from(
      { length: 101 },
      (_, index) => index + 1,
    ).reduce<Promise<Saved[]>>(
      async (saved, createdAt) => [
        ...(await saved),
        (await store.save(shotAt(createdAt)))._unsafeUnwrap(),
      ],
      Promise.resolve([]),
    )
    const [oldest] = results.map(({ shot }) => shot.id)

    expect(results.at(-1)?.evicted).toEqual([oldest])

    const listed = (await store.list())._unsafeUnwrap()
    expect(listed).toHaveLength(100)
    expect(listed.map(({ createdAt }) => createdAt)).toEqual(
      Array.from({ length: 100 }, (_, i) => 101 - i),
    )
  })

  it('drops a removed shot from the list', async () => {
    const { shot } = (await store.save(shotAt(1)))._unsafeUnwrap()
    await store.remove(shot.id)
    expect((await store.list())._unsafeUnwrap()).toEqual([])
  })
})
