import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Reply } from './shot'

export class ReplyCodec {
  static async encode<T>(result: ResultAsync<T, Error>): Promise<Reply<T>> {
    return result.match(
      (value): Reply<T> => ({ ok: true, value }),
      ({ message }): Reply<T> => ({ ok: false, error: message }),
    )
  }

  static decode<T, E extends Error>(
    reply: Promise<Reply<T>>,
    Kind: new (message: string) => E,
  ): ResultAsync<T, E> {
    return ResultAsync.fromPromise(
      reply,
      (cause) => new Kind(String(cause)),
    ).andThen((reply) =>
      match(reply)
        .with({ ok: true }, ({ value }) => okAsync<T, E>(value))
        .with({ ok: false }, ({ error }) => errAsync<T, E>(new Kind(error)))
        .exhaustive(),
    )
  }
}
