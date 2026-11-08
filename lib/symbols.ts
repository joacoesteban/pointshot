import { z } from 'zod'
import cameraViewfinder from '~/assets/symbols/camera.viewfinder.json'
import docOnDoc from '~/assets/symbols/doc.on.doc.json'
import timer from '~/assets/symbols/timer.json'
import squareAndArrowDown from '~/assets/symbols/square.and.arrow.down.json'
import trashFill from '~/assets/symbols/trash.fill.json'
import xMark from '~/assets/symbols/xmark.json'

const SymbolSchema = z.object({
  path: z.string(),
  geometry: z.object({
    width: z.number(),
    height: z.number(),
  }),
})

const toSymbol = (raw: unknown) => {
  const { path, geometry } = SymbolSchema.parse(raw)
  const { width, height } = geometry
  const max = Math.max(width, height)
  return {
    path,
    geometry: { width, height, wRatio: width / max, hRatio: height / max },
  }
}

const raw = {
  cameraViewfinder,
  docOnDoc,
  squareAndArrowDown,
  timer,
  trashFill,
  xMark,
}

export type SymbolName = keyof typeof raw
export type Symbol = ReturnType<typeof toSymbol>

export const symbols = Object.fromEntries(
  Object.entries(raw).map(([name, symbol]) => [name, toSymbol(symbol)]),
) as Record<SymbolName, Symbol>
