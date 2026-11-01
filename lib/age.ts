import { match, P } from 'ts-pattern'

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export const age = (createdAt: number, now = Date.now()) =>
  match(Math.round((now - createdAt) / 60_000))
    .with(P.number.lt(60), (minutes) => relative.format(-minutes, 'minute'))
    .with(P.number.lt(60 * 24), (minutes) =>
      relative.format(-Math.round(minutes / 60), 'hour'),
    )
    .otherwise((minutes) =>
      relative.format(-Math.round(minutes / (60 * 24)), 'day'),
    )
