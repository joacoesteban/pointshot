import { getMessage } from '@extend-chrome/messages'
import type { NewShot, Reply, Shot } from '~/lib/shot'

export const [togglePopup, togglePopupStream] =
  getMessage<undefined>('toggle-popup')

export const [pickElement, pickElementStream] =
  getMessage<undefined>('pick-element')

export const [captureVisibleTab, captureVisibleTabStream] = getMessage<
  undefined,
  Reply<string>
>('capture-visible-tab', { async: true })

export const [listShots, listShotsStream] = getMessage<
  undefined,
  Reply<Shot[]>
>('list-shots', { async: true })

export const [saveShot, saveShotStream] = getMessage<NewShot, Reply<Shot[]>>(
  'save-shot',
  { async: true },
)

export const [removeShot, removeShotStream] = getMessage<string, Reply<Shot[]>>(
  'remove-shot',
  { async: true },
)
