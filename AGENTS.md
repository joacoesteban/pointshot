# Pointshot

Browser extension that screenshots a picked element, copies it to the
clipboard, and keeps it in an in-page popup. Built with WXT (Chrome MV3,
Firefox MV2), Svelte 5, Tailwind 3 with daisyUI, and SCSS.

It was called Snag before its first store release, and the code still says
so: `Snagger`, `SnagToast`, the `snag-*` test ids and command names, the
`snag-db` database, the `snag-ui` shadow host and the `snag.test` fixture
host. The copy says "capture" for the action and "screenshot" for the result.

## Commands

```sh
bun install        # also runs `wxt prepare`, which generates .wxt/tsconfig.json
bun run dev        # Chrome with hot reload
bun run check      # typecheck (svelte-check, warnings fail) + lint
bun run build      # production build in build/chrome-mv3
bun run test:unit  # Vitest over lib/ and background/, with happy-dom and fake-indexeddb
bun run test       # builds build/chrome-mv3-e2e, then runs Playwright on it
bun run bundle:all # zips for Chrome and Firefox in build/

mise run store:screenshots # builds the e2e build, then renders the store images
```

Bun installs packages and runs scripts, while the tools themselves run on Node:
Vitest breaks on Bun's runtime, where `z` imports from zod as undefined. Always
spell out `bun run build` and `bun run test`, because bare `bun build` and
`bun test` start Bun's own bundler and test runner.

The e2e build (`--mode e2e`) differs from production only in asking for
`<all_urls>` and `downloads` up front: tests open the popup by dispatching
`action.onClicked`, which does not grant `activeTab`, and Playwright cannot
grant the optional `downloads` permission. The first run needs
`bunx playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, `bundle:all` and the
tests on every PR to `main`. Once they pass on `main`, it runs
`bun pm version patch` and pushes the commit and tag, unless that commit is
already tagged. A `v*.*.*` tag publishes the zips as a GitHub release.

## Layout

- `entrypoints/background.ts`: service worker. Owns tab capture, storage and
  the keyboard commands, and answers the content script's messages.
- `entrypoints/snag.content.ts`: mounts `contents/app.svelte` into a shadow
  root. It is registered at runtime: the background injects it with
  `scripting.executeScript` the first time a message to the tab finds no
  receiver, so the extension needs only `activeTab`, no host permissions.
- `background/`: Dexie database and `ShotStore`. Runs only in the background.
- `lib/`: content-side logic, one class per file (`Snagger`, `ElementPicker`,
  `ShotLibrary`, `ShotActions`, `ShotViewer`, `Stage`, `Img`, `Clipboard`,
  ...). `ShotLibrary`, `ShotActions` and `ShotViewer` also run in the options
  page, which hosts the full library view.
- `components/`: Svelte components. `contents/app.svelte` is the root.
  The primitives, tokens and options-page layout are a port of
  [Vind](https://github.com/JoacoEsteban/vind), the author's other extension,
  so the two look and behave alike; Vind is the reference when styling, and
  divergences are deliberate. `components/README.md` documents each
  component, the shared style classes, and what was left out of the port.
- `messages/index.ts`: every runtime message, typed through
  `@extend-chrome/messages`.
- `*.test.ts` next to the code in `lib/` and `background/`: Vitest unit tests.
- `test/`: Playwright specs. `fixtures.ts` serves `test/fixtures/boxes.html`
  at `https://snag.test` and `http://snag.test` by routing.
- `store/`: the store listing and its images. `screenshots.spec.ts` is a
  Playwright spec, with its own config, that plays the scenes through
  `Studio` (`studio.ts`) over `demo.html`, a made-up site served at
  `lumen.example` and `app.lumen.example`. Window captures go to
  `build/store/<language>`, and each store image is `slide.html` rendering
  one of them framed under a headline from `copy.ts`, into the tracked
  `store/screenshots/<language>`. The promo tile and marquee are rendered
  the same way into `store/promo/<language>`. `listing.md` lists the images.

## How it fits together

- Messages that can fail reply with `Reply<T>` (`lib/shot.ts`). The
  background encodes a `ResultAsync` with `ReplyCodec.encode`, and the content
  script turns it back into one with `ReplyCodec.decode`, naming the error
  class to rebuild.
- Errors are `Error` subclasses in `lib/errors.ts`. `Failure.explain` in
  `lib/failure.ts` picks the copy by matching them with `P.instanceOf`, so a
  new failure mode gets a new class and a branch there.
- The UI lives in a shadow root. Svelte runs with `emitCss: false` so
  component styles land inside it, and fonts ship as data URLs because content
  scripts resolve asset URLs against the host page.
- A snag is planned by `Region.plan` (the area in document coordinates, the
  window scroll positions to capture it from, the rounded-corner clip, and the
  fixed or sticky elements to hide) and drawn by `Stitcher`, one
  `captureVisibleTab` per tile. The background throttles those calls to
  Chrome's limit of two a second.
- A snag session is one `ElementPicker.pick`, whose `state$` carries the live
  mode. `Chord.mode` derives it from the held modifiers, the mode pinned in the
  toast and any drag in progress, and `SnagToast` renders it.
- `Stage.offstage` hides the UI for the capture. WXT resets the shadow host
  with `all: initial !important`, so it styles the inner container instead.
- `Snagger.snag` must stay synchronous up to the clipboard write: the click
  that picked the element is the user gesture the clipboard needs.
- Shot IDs are minted in the background, because `crypto.randomUUID` is
  missing on insecure pages.
- After every save or removal the background bumps `shotsRevision` in
  `storage.local` (`ShotRevision`), and every `ShotLibrary`, in content
  scripts and the options page alike, refreshes on that change, so open
  surfaces stay in sync without a tab list.
- The background stores each shot's full image as a `Blob` next to a small
  WebP thumbnail. Listings carry only thumbnails; the full image crosses the
  message channel once to be saved and again only to be copied or downloaded
  (`ShotLibrary.imageUrl`). Saves and removals reply with the change, not the
  whole list.
- Shots saved by 1.0.0 were migrated with their full image as the thumbnail.
- The store images are meant to look the same on every run. Buttons and the
  options backdrop take their colours from `Math.random`, so `Studio` seeds it
  (`SEEDS`), in the content script's world through `scripting.executeScript`
  and in the options page through an init script, and before each capture it
  stops the animations that never end at `FROZEN_AT`, shadow roots included.
  Buttons that blur what is behind them still differ by a few levels between
  runs, so a run can leave a few PNGs changed with nothing visible. Playwright
  screenshots have no pointer, so `slide.html` draws one where `Studio` last
  moved it. The demo serves DejaVu Sans for the arrows on the toast's keys,
  which Outfit lacks.

## Conventions

The compiler and linter enforce most of these; `bun run check` must pass.

- TypeScript is `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` and
  `verbatimModuleSyntax` (type-only imports use `import type`). ESLint uses
  `typescript-eslint` `strictTypeChecked`.
- No `any`, no ternaries (use `ts-pattern`), no `try/catch` (use
  `neverthrow`). These are lint errors.
- The same rules apply to `<script>` blocks in `*.svelte` files, through
  `eslint-plugin-svelte`. Components use Svelte 5 runes and callback props.
- WXT auto-imports are off (`imports: false`). Import `defineBackground`,
  `browser` and the rest explicitly from `wxt/...`.
- Import project files through the `~/` alias across folders, and relatively
  within one.
- Group behaviour in classes. Static-only classes are allowed and used as
  namespaces (`ReplyCodec`, `Img`, `Clipboard`).
- Streams use `rxjs`. Tear down subscriptions with `DisposeBag`.
- Data shapes are `zod` schemas with their types inferred (`ShotSchema`), and
  untyped input such as the symbol JSON goes through `parse`.
- Prettier: no semicolons, single quotes, trailing commas, 80 columns.
- Copy lives in `public/_locales/<locale>/messages.json`, English (`en`) and
  Argentinian Spanish (`es_419`, voseo), and is read through `t()` in
  `lib/i18n.ts`, typed by the English keys. Each file names its locale in a
  `locale` message, which dates follow. After adding a key, run
  `bunx wxt prepare` so `t()` accepts it. E2E tests pick the language with
  `test.use({ lang })`.
