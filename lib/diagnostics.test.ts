import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { Diagnostics } from './diagnostics'
import { StorageError } from './errors'

beforeEach(() => {
  fakeBrowser.reset()
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    manifest_version: 3,
    name: 'Snag',
    version: '1.1.0',
  })
})

describe('Diagnostics', () => {
  it('reports the settings and the recent errors', async () => {
    await Diagnostics.record(new StorageError('disk on fire'))
    const report = (await Diagnostics.report())._unsafeUnwrap()
    expect(report).toMatch(/^Snag 1\.1\.0\n/)
    expect(report).toContain('Settings: {"limit":100')
    expect(report).toMatch(/Z StorageError: disk on fire$/)
  })

  it('keeps only the latest twenty errors', async () => {
    for (const index of Array.from({ length: 25 }, (_, index) => index)) {
      await Diagnostics.record(new Error(`error ${String(index)}`))
    }
    const report = (await Diagnostics.report())._unsafeUnwrap()
    expect(report).not.toContain('error 4\n')
    expect(report).toContain('error 5')
    expect(report).toContain('error 24')
  })
})
