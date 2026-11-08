import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { QuotaError, StorageError } from './errors'
import { ReplyCodec } from './reply'

describe('ReplyCodec', () => {
  it('round-trips a value', async () => {
    const reply = ReplyCodec.encode(okAsync(42))
    expect((await ReplyCodec.decode(reply, StorageError))._unsafeUnwrap()).toBe(
      42,
    )
  })

  it('rebuilds an error as the refinement it was sent as', async () => {
    const reply = ReplyCodec.encode(errAsync(new QuotaError('full')))
    const error = (
      await ReplyCodec.decode(reply, StorageError, [QuotaError])
    )._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(QuotaError)
    expect(error.message).toBe('full')
  })

  it('falls back to the base kind for an unlisted error', async () => {
    const reply = ReplyCodec.encode(errAsync(new Error('boom')))
    const error = (
      await ReplyCodec.decode(reply, StorageError, [QuotaError])
    )._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(StorageError)
    expect(error).not.toBeInstanceOf(QuotaError)
  })
})
