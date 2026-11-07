# Snag

Browser extension that screenshots a picked element, copies it to the
clipboard, and keeps it in an in-page popup. Built with WXT (Chrome MV3,
Firefox MV2), Svelte 4, Tailwind 3 with daisyUI, and SCSS.

## Commands

```sh
pnpm install      # also runs `wxt prepare`, which generates .wxt/tsconfig.json
pnpm dev          # Chrome with hot reload
pnpm check        # typecheck (svelte-check, warnings fail) + lint
pnpm build        # production build in build/chrome-mv3
pnpm test         # Playwright end-to-end, against build/chrome-mv3
pnpm bundle:all   # zips for Chrome and Firefox in build/
```

`pnpm test` loads the built extension, so run `pnpm build` first after any
change. The first run needs `pnpm exec playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, `bundle:all` and the
tests on every PR to `main`. A `v*.*.*` tag publishes the zips as a GitHub
release.

## Layout

- `entrypoints/background.ts`: service worker. Owns tab capture, storage and
  the keyboard commands, and answers the content script's messages.
- `entrypoints/snag.content.ts`: mounts `contents/app.svelte` into a shadow
  root on every page.
- `background/`: Dexie database and `ShotStore`. Runs only in the background.
- `lib/`: content-side logic, one class per file (`Snagger`, `ElementPicker`,
  `ShotLibrary`, `Stage`, `Img`, `Clipboard`, ...).
- `components/`: Svelte components. `contents/app.svelte` is the root.
- `messages/index.ts`: every runtime message, typed through
  `@extend-chrome/messages`.
- `test/`: Playwright specs. `fixtures.ts` serves `test/fixtures/boxes.html`
  at `https://snag.test` and `http://snag.test` by routing.

## How it fits together

- Messages that can fail reply with `Reply<T>` (`lib/shot.ts`). The
  background encodes a `ResultAsync` with `ReplyCodec.encode`, and the content
  script turns it back into one with `ReplyCodec.decode`, naming the error
  class to rebuild.
- Errors are `Error` subclasses in `lib/errors.ts`. The UI picks its copy by
  matching them with `P.instanceOf` in `contents/app.svelte`, so a new failure
  mode gets a new class there.
- The UI lives in a shadow root. Svelte runs with `emitCss: false` so
  component styles land inside it, and fonts ship as data URLs because content
  scripts resolve asset URLs against the host page.
- `Stage.offstage` hides the UI for the capture. WXT resets the shadow host
  with `all: initial !important`, so it styles the inner container instead.
- `Snagger.snag` must stay synchronous up to the clipboard write: the click
  that picked the element is the user gesture the clipboard needs.
- Shot IDs are minted in the background, because `crypto.randomUUID` is
  missing on insecure pages.
- The store keeps 50 shots and at most 48 MiB of data URLs, since every
  listing crosses a message channel capped at 64 MiB.

## Conventions

The compiler and linter enforce most of these; `pnpm check` must pass.

- TypeScript is `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` and
  `verbatimModuleSyntax` (type-only imports use `import type`). ESLint uses
  `typescript-eslint` `strictTypeChecked`.
- No `any`, no ternaries (use `ts-pattern`), no `try/catch` (use
  `neverthrow`). These are lint errors.
- ESLint skips `*.svelte` files. Hold the `<script>` blocks to the same rules
  by hand.
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
