import { siteOf, type Shot } from './shot'

const fileName = ({ url, createdAt }: Shot) =>
  `snag-${siteOf(url)}-${new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')}.png`

export class Download {
  static shot(shot: Shot, root: Node) {
    const { dataUrl } = shot
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = fileName(shot)
    root.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }
}
