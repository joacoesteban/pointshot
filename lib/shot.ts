import { match } from 'ts-pattern'
import { z } from 'zod'

export const ShotSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  url: z.string(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
  thumbnail: z.string(),
})

export type Shot = z.infer<typeof ShotSchema>

export type NewShot = Omit<Shot, 'id'> & { readonly image: string }

export type Saved = {
  readonly shot: Shot
  readonly evicted: readonly string[]
}

export type Reply<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string; readonly kind: string }

// Pages without a host, like file:// ones, are named after their scheme.
export const siteOf = (url: string) =>
  match(new URL(url))
    .with({ hostname: '' }, ({ protocol }) => protocol.replace(/:$/, ''))
    .otherwise(({ hostname }) => hostname)

export type Filter = {
  readonly query: string
  readonly site: string | null
}

export const filterShots = (
  shots: readonly Shot[],
  { query, site }: Filter,
) => {
  const needle = query.trim().toLowerCase()
  return shots.filter(
    ({ url, title }) =>
      match(site)
        .with(null, () => true)
        .otherwise((site) => siteOf(url) === site) &&
      [title, url].some((text) => text.toLowerCase().includes(needle)),
  )
}

export const sitesOf = (shots: readonly Shot[]) =>
  [...new Set(shots.map(({ url }) => siteOf(url)))].sort()

// Deleting more snags than this at once asks first; undo alone is too short a net for a whole library.
export const CONFIRM_DELETE_ABOVE = 5
