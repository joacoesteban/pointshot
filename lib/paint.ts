import { Img } from './image'

// Thumbnails are drawn on a canvas instead of an <img>, because the page's CSP governs img-src inside the shadow root.
const THUMBNAIL_WIDTH = 480

export function paint(canvas: HTMLCanvasElement, dataUrl: string) {
  const draw = (dataUrl: string) =>
    Img.bitmap(Img.dataUrlToBlob(dataUrl)).map((bitmap) => {
      const scale = Math.min(1, THUMBNAIL_WIDTH / bitmap.width)
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas
        .getContext('2d')
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
    })
  void draw(dataUrl)
  return {
    update: (next: string) => {
      void draw(next)
    },
  }
}
