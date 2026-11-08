import { firstValueFrom, take, toArray } from 'rxjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_SETTINGS, SettingsStore } from './settings'

beforeEach(() => {
  fakeBrowser.reset()
})

describe('SettingsStore', () => {
  it('loads the defaults when nothing is stored', async () => {
    expect((await SettingsStore.load())._unsafeUnwrap()).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  it('merges an update into the stored settings', async () => {
    await SettingsStore.update({ limit: 20 })
    expect((await SettingsStore.load())._unsafeUnwrap()).toMatchObject({
      limit: 20,
    })
  })

  it('falls back to the default for a field that does not parse', async () => {
    await fakeBrowser.storage.local.set({ settings: { limit: 'many' } })
    expect((await SettingsStore.load())._unsafeUnwrap()).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  it('emits the stored settings, then every change', async () => {
    const settings$ = SettingsStore.changes()
    const emitted = firstValueFrom(settings$.pipe(take(2), toArray()))
    await firstValueFrom(settings$)
    await SettingsStore.update({ limit: 50 })
    expect((await emitted).map(({ limit }) => limit)).toEqual([100, 50])
  })
})
