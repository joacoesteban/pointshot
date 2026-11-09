import { z } from 'zod'
import arrow from '~/assets/symbols/arrow.json'
import blur from '~/assets/symbols/blur.json'
import booksVerticalFill from '~/assets/symbols/books.vertical.fill.json'
import cameraViewfinder from '~/assets/symbols/camera.viewfinder.json'
import checkmark from '~/assets/symbols/checkmark.json'
import crop from '~/assets/symbols/crop.json'
import cursorArrowRays from '~/assets/symbols/cursorarrow.rays.json'
import docOnDoc from '~/assets/symbols/doc.on.doc.json'
import expand from '~/assets/symbols/expand.json'
import gear from '~/assets/symbols/gear.json'
import github from '~/assets/symbols/github.json'
import globe from '~/assets/symbols/globe.json'
import keyboard from '~/assets/symbols/keyboard.json'
import page from '~/assets/symbols/page.json'
import pencil from '~/assets/symbols/pencil.json'
import rectangle from '~/assets/symbols/rectangle.json'
import rectangleDashed from '~/assets/symbols/rectangle.dashed.json'
import region from '~/assets/symbols/region.json'
import sliderHorizontal3 from '~/assets/symbols/slider.horizontal.3.json'
import squareAndArrowDown from '~/assets/symbols/square.and.arrow.down.json'
import text from '~/assets/symbols/text.json'
import timer from '~/assets/symbols/timer.json'
import trashFill from '~/assets/symbols/trash.fill.json'
import undo from '~/assets/symbols/undo.json'
import window from '~/assets/symbols/window.json'
import xMark from '~/assets/symbols/xmark.json'

const SymbolSchema = z.object({
  path: z.string(),
  fillRule: z.enum(['evenodd', 'nonzero']).default('evenodd'),
  geometry: z.object({
    width: z.number(),
    height: z.number(),
  }),
})

const toSymbol = (raw: unknown) => {
  const { path, fillRule, geometry } = SymbolSchema.parse(raw)
  const { width, height } = geometry
  const max = Math.max(width, height)
  return {
    path,
    fillRule,
    geometry: { width, height, wRatio: width / max, hRatio: height / max },
  }
}

const raw = {
  arrow,
  blur,
  booksVerticalFill,
  cameraViewfinder,
  checkmark,
  crop,
  cursorArrowRays,
  docOnDoc,
  expand,
  gear,
  github,
  globe,
  keyboard,
  page,
  pencil,
  rectangle,
  rectangleDashed,
  region,
  sliderHorizontal3,
  squareAndArrowDown,
  text,
  timer,
  trashFill,
  undo,
  window,
  xMark,
}

export type SymbolName = keyof typeof raw
export type Symbol = ReturnType<typeof toSymbol>

export const symbols = Object.fromEntries(
  Object.entries(raw).map(([name, symbol]) => [name, toSymbol(symbol)]),
) as Record<SymbolName, Symbol>
