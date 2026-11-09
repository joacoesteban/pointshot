// @vitest-environment happy-dom
import { firstValueFrom } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reply, Shot } from './shot'
import { ShotLibrary } from './shot-library'

const { listShots, removeShots, saveShot } = vi.hoisted(() => ({
  listShots: vi.fn(),
  removeShots: vi.fn(),
  saveShot: vi.fn(),
}))

vi.mock('~/messages', () => ({
  listShots,
  removeShots,
  saveShot,
  shotImageUrl: vi.fn(),
}))

const shot: Shot = {
  id: 'a',
  createdAt: 1,
  url: 'https://example.com/',
  title: 'Example',
  width: 1,
  height: 1,
  thumbnail: '',
}

const ids = async (library: ShotLibrary) =>
  (await firstValueFrom(library.shots$)).map(({ id }) => id)

beforeEach(() => {
  listShots.mockResolvedValue({ ok: true, value: [shot] })
})

describe('ShotLibrary', () => {
  it('lists a saved shot once when a refresh listed it before the save replied', async () => {
    const saved: Shot = { ...shot, id: 'b', createdAt: 2 }
    const reply =
      Promise.withResolvers<Reply<{ shot: Shot; evicted: string[] }>>()
    saveShot.mockReturnValue(reply.promise)
    const library = new ShotLibrary()
    await library.refresh()

    const saving = library.save({ ...saved, image: '' })
    listShots.mockResolvedValue({ ok: true, value: [saved, shot] })
    await library.refresh()
    reply.resolve({ ok: true, value: { shot: saved, evicted: [] } })
    await saving
    expect(await ids(library)).toEqual(['b', 'a'])
  })

  it('cannot undo a removal already sent to the background', async () => {
    const reply = Promise.withResolvers<Reply<undefined>>()
    removeShots.mockReturnValue(reply.promise)
    const library = new ShotLibrary()
    await library.refresh()

    library.remove([shot])
    library.flush()
    library.undo()
    expect(await ids(library)).toEqual([])

    reply.resolve({ ok: true, value: undefined })
    await vi.waitFor(() => {
      expect(removeShots).toHaveBeenCalledWith(['a'])
    })
    expect(await ids(library)).toEqual([])
  })

  it('shows the shots again when their removal fails', async () => {
    removeShots.mockResolvedValue({ ok: false, error: 'boom', kind: 'Error' })
    const library = new ShotLibrary()
    await library.refresh()

    library.remove([shot])
    library.flush()
    await vi.waitFor(async () => {
      expect(await ids(library)).toEqual(['a'])
    })
  })
})
