import { fromEvent, map, startWith } from 'rxjs'
import { match, P } from 'ts-pattern'

const darkScheme = matchMedia('(prefers-color-scheme: dark)')

// WebView2 is Chromium, while macOS and Linux render with WebKit, which takes Safari's blur.
const engine = match(navigator.userAgent)
  .with(P.string.includes('Chrome'), () => 'browser-chrome')
  .otherwise(() => 'browser-safari')

// The extension's theme root, following the system's scheme instead of a setting.
export function theme(node: HTMLElement) {
  node.setAttribute('data-snag-theme-root', '')
  node.style.setProperty('display', 'contents')
  node.classList.add(engine)

  const subscription = fromEvent<MediaQueryListEvent>(darkScheme, 'change')
    .pipe(
      map(({ matches }) => matches),
      startWith(darkScheme.matches),
    )
    .subscribe((dark) => {
      node.setAttribute(
        'data-theme',
        match(dark)
          .with(true, () => 'dark')
          .otherwise(() => 'light'),
      )
    })

  return {
    destroy: () => {
      subscription.unsubscribe()
    },
  }
}
