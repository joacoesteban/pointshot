#!/usr/bin/env bun
//MISE description="Render the options backdrop's soft and sharp mosaic tiles from the icon into assets/"
import { fileURLToPath } from 'node:url'
import { ResultAsync } from 'neverthrow'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TILE_CSS_PX = 200

// radius: the CSS blur() radius the tile stands in for, a Gaussian standard deviation in CSS px, the same measure as sharp's sigma.
// scale: device pixels per CSS px. The soft tile has no detail a 2x bitmap would keep.
const LAYERS = [
  { name: 'soft', radius: 23, scale: 1 },
  { name: 'sharp', radius: 3, scale: 2 },
] as const

type Layer = (typeof LAYERS)[number]

const bake = async ({ name, radius, scale }: Layer) => {
  const width = TILE_CSS_PX * scale
  const tile = await sharp(`${ROOT}assets/icon.png`)
    .resize({ width })
    .png()
    .toBuffer()
  const { height } = await sharp(tile).metadata()

  // Blurring a 3×3 grid and keeping the centre makes the blur wrap across the tile's edges, as the repeating background does.
  const grid = await sharp({
    create: {
      width: width * 3,
      height: height * 3,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      [0, 1, 2].flatMap((x) =>
        [0, 1, 2].map((y) => ({
          input: tile,
          left: x * width,
          top: y * height,
        })),
      ),
    )
    .png()
    .toBuffer()

  // sharp runs composite after blur within one pipeline, so each step gets its own pass.
  const blurred = await sharp(grid)
    .blur(radius * scale)
    .png()
    .toBuffer()

  return sharp(blurred)
    .extract({ left: width, top: height, width, height })
    .png({ compressionLevel: 9 })
    .toFile(`${ROOT}assets/mosaic-${name}.png`)
}

void ResultAsync.fromPromise(Promise.all(LAYERS.map(bake)), (cause) =>
  String(cause),
).match(
  (written) => {
    console.log(
      written
        .map(
          ({ width, height, size }) =>
            `${String(width)}×${String(height)}, ${String(size)} bytes`,
        )
        .join('\n'),
    )
  },
  (reason) => {
    console.error(reason)
    process.exit(1)
  },
)
