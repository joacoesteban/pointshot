import { match } from 'ts-pattern'
import type { Format } from './settings'
import { siteOf, type Shot } from './shot'

const extensionOf = (format: Format) =>
  match(format)
    .with('png', () => 'png')
    .with('jpeg', () => 'jpg')
    .with('webp', () => 'webp')
    .exhaustive()

export const fileName = ({ url, createdAt }: Shot, format: Format) =>
  `snag-${siteOf(url)}-${new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')}.${extensionOf(format)}`

export class Download {
  static shot(shot: Shot, imageUrl: string, format: Format, root: Node) {
    const anchor = document.createElement('a')
    anchor.href = imageUrl
    anchor.download = fileName(shot, format)
    root.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }
}
