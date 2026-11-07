import { siteOf, type Shot } from './shot'

const fileName = ({ url, createdAt }: Shot) =>
  `snag-${siteOf(url)}-${new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')}.png`

export class Download {
  static shot(shot: Shot, imageUrl: string, root: Node) {
    const anchor = document.createElement('a')
    anchor.href = imageUrl
    anchor.download = fileName(shot)
    root.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }
}
