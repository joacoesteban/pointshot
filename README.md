# Snag

Screenshot any element on a page. Pick it with the mouse, and the image is in
your clipboard. Every snag is also kept in the popup, so you can copy,
download, or delete it later.

## Use

| Action                    | How                                                 |
| ------------------------- | --------------------------------------------------- |
| Open the popup            | Click the toolbar icon, or press `Alt+S`            |
| Pick an element           | Press **Snag** in the popup, or press `Alt+Shift+S` |
| Select the parent / child | `↑` / `↓` while picking                             |
| Cancel                    | `Esc`                                               |

The popup keeps the 100 most recent snags.

## Limits

- Snag captures the visible part of the element. Parts outside the viewport
  are cut off.
- Browsers expose the clipboard only on `https` pages. On plain `http` pages
  the snag is saved in the popup but not copied.

## Develop

```sh
pnpm install
pnpm dev          # Chrome with hot reload
pnpm check        # typecheck + lint
pnpm build        # production build in build/chrome-mv3
pnpm test         # end-to-end tests against the production build
pnpm bundle:all   # zips for Chrome and Firefox
```

## Install a release

1. Download `snag-<version>-chrome-mv3.zip` from the releases page and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
