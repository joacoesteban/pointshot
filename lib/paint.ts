import { Img } from './image'

// Images are drawn on a canvas instead of an <img>, because the page's CSP governs img-src inside the shadow root.
export type Painting = {
  readonly dataUrl: string
  readonly maxWidth: number
}

export function paint(canvas: HTMLCanvasElement, painting: Painting) {
  const draw = ({ dataUrl, maxWidth }: Painting) =>
    Img.bitmap(Img.dataUrlToBlob(dataUrl)).map((bitmap) => {
      const scale = Math.min(1, maxWidth / bitmap.width)
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas
        .getContext('2d')
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
    })
  void draw(painting)
  return {
    update: (next: Painting) => {
      void draw(next)
    },
  }
}
