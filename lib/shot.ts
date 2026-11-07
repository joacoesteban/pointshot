import { match } from 'ts-pattern'
import { z } from 'zod'

export const ShotSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  url: z.string(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
  dataUrl: z.string(),
})

export type Shot = z.infer<typeof ShotSchema>

export type NewShot = Omit<Shot, 'id'>

export type Reply<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

// Pages without a host, like file:// ones, are named after their scheme.
export const siteOf = (url: string) =>
  match(new URL(url))
    .with({ hostname: '' }, ({ protocol }) => protocol.replace(/:$/, ''))
    .otherwise(({ hostname }) => hostname)
