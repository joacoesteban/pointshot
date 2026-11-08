import { combineLatest, fromEvent, map, startWith } from 'rxjs'
import { match } from 'ts-pattern'
import { SettingsStore } from './settings'

const darkScheme = matchMedia('(prefers-color-scheme: dark)')

export function themeController(node: HTMLElement) {
  node.setAttribute('data-snag-theme-root', '')
  node.style.setProperty('display', 'contents')
  node.classList.add(`browser-${import.meta.env.BROWSER}`)

  const subscription = combineLatest([
    fromEvent<MediaQueryListEvent>(darkScheme, 'change').pipe(
      map(({ matches }) => matches),
      startWith(darkScheme.matches),
    ),
    SettingsStore.changes().pipe(map(({ theme }) => theme)),
  ])
    .pipe(
      map(([dark, theme]) =>
        match({ dark, theme })
          .with({ theme: 'light' }, () => 'light')
          .with({ theme: 'dark' }, () => 'dark')
          .with({ dark: true }, () => 'dark')
          .otherwise(() => 'light'),
      ),
    )
    .subscribe((theme) => {
      node.setAttribute('data-theme', theme)
    })

  return {
    destroy: () => {
      subscription.unsubscribe()
    },
  }
}
