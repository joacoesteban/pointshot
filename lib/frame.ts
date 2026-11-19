import type { SnagMode } from './chord'
import type { Area } from './region'

export type Frame = {
  readonly bounds: Area
  readonly size: Readonly<Record<'width' | 'height', number>>
  readonly radius: string
  readonly label: string
  readonly scope: SnagMode | null
}
