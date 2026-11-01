import { fromEvent, map, startWith } from 'rxjs'
import { match } from 'ts-pattern'

const darkScheme = matchMedia('(prefers-color-scheme: dark)')

const themeOf = (dark: boolean) =>
  match(dark)
    .with(true, () => 'dark')
    .with(false, () => 'light')
    .exhaustive()

export function themeController(node: HTMLElement) {
  node.setAttribute('data-snag-theme-root', '')
  node.style.setProperty('display', 'contents')
  node.classList.add(`browser-${import.meta.env.BROWSER}`)

  const subscription = fromEvent<MediaQueryListEvent>(darkScheme, 'change')
    .pipe(
      map(({ matches }) => matches),
      startWith(darkScheme.matches),
      map(themeOf),
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
