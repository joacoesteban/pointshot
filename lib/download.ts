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
  `pointshot-${siteOf(url)}-${new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')}.${extensionOf(format)}`

// A folder inside the browser's download folder: no empty, relative or reserved parts.
export const pathOf = (folder: string, name: string) =>
  [
    ...folder
      .split(/[\\/]+/)
      .map((part) => part.trim().replace(/[<>:"|?*]/g, '_'))
      .filter((part) => !['', '.', '..'].includes(part)),
    name,
  ].join('/')

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
