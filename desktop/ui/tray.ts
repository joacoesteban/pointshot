import { defaultWindowIcon } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ResultAsync, okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { t } from '~/lib/i18n'
import { say } from './browser'
import { COMMANDS, Shortcut } from './shortcut'

const ID = 'pointshot'

export const showLibrary = () => {
  location.hash = 'library'
  const window = getCurrentWindow()
  void Promise.all([window.unminimize(), window.show(), window.setFocus()])
}

// Each of the extension's commands, with its shortcut where one is set; showing the library comes after the captures.
const menu = () => {
  const shortcuts = Shortcut.all()
  return Menu.new({
    items: [
      ...COMMANDS.flatMap(({ action, description }) => {
        const item = {
          id: action,
          text: match(action)
            .with('library', () => t('libraryTitle'))
            .otherwise(() => t(description)),
          ...match(shortcuts[action])
            .with('', () => ({}))
            .otherwise((accelerator) => ({ accelerator })),
          action: () => {
            match(action)
              .with('library', showLibrary)
              .otherwise((mode) => {
                void invoke('capture', { mode })
              })
          },
        }
        return match(action)
          .with('library', () => [{ item: 'Separator' as const }, item])
          .otherwise(() => [item])
      }),
      { item: 'Separator' as const },
      {
        id: 'quit',
        text: say('quit'),
        action: () => {
          void invoke('quit')
        },
      },
    ],
  })
}

const make = () =>
  ResultAsync.fromPromise(
    Promise.all([TrayIcon.getById(ID), menu(), defaultWindowIcon()]).then(
      ([existing, menu, icon]) =>
        match(existing)
          .with(P.nonNullable, (existing) =>
            existing.setMenu(menu).then(() => existing),
          )
          .otherwise(() =>
            TrayIcon.new({
              id: ID,
              menu,
              tooltip: 'Pointshot',
              showMenuOnLeftClick: true,
              ...match(icon)
                .with(P.nonNullable, (icon) => ({ icon }))
                .otherwise(() => ({})),
            }),
          ),
    ),
    String,
  )

// The tray, the menu bar on macOS, starts a capture or brings back the library, which closing only hides.
// A reload of the window, or a new shortcut, finds the tray made before, so it only takes the new menu.
// Linux has one only with an appindicator library installed.
export const tray = () =>
  ResultAsync.fromPromise(invoke<boolean>('tray_supported'), String).andThen(
    (supported) =>
      match(supported)
        .with(true, make)
        .with(false, () => okAsync(null))
        .exhaustive(),
  )
