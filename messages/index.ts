import { getMessage } from '@extend-chrome/messages'
import type { NewShot, Reply, Saved, Shot } from '~/lib/shot'

export const [togglePopup, togglePopupStream] =
  getMessage<undefined>('toggle-popup')

export const [pickElement, pickElementStream] =
  getMessage<undefined>('pick-element')

export type Mode = 'selection' | 'visible' | 'page'

export const [captureMode, captureModeStream] = getMessage<Mode>('capture')

export const [captureVisibleTab, captureVisibleTabStream] = getMessage<
  undefined,
  Reply<string>
>('capture-visible-tab', { async: true })

export const [listShots, listShotsStream] = getMessage<
  undefined,
  Reply<Shot[]>
>('list-shots', { async: true })

export const [saveShot, saveShotStream] = getMessage<NewShot, Reply<Saved>>(
  'save-shot',
  { async: true },
)

export const [removeShot, removeShotStream] = getMessage<
  string,
  Reply<undefined>
>('remove-shot', { async: true })

export const [shotImageUrl, shotImageUrlStream] = getMessage<
  string,
  Reply<string>
>('shot-image-url', { async: true })
