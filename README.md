# Snag

Screenshot any element on a page. Pick it with the mouse, and the image is in
your clipboard. Every snag is also kept in the popup, so you can copy,
download, or delete it later.

## Use

| Action                             | How                                                 |
| ---------------------------------- | --------------------------------------------------- |
| Open the popup                     | Click the toolbar icon, or press `Alt+S`            |
| Pick an element                    | Press **Snag** in the popup, or press `Alt+Shift+S` |
| Select the parent / child          | `↑` / `↓` while picking                             |
| Select the previous / next sibling | `←` / `→` while picking                             |
| Snag the selected element          | Click, or press `Enter`                             |
| Snag it with a margin of page      | Hold `Shift` while snagging                         |
| Cancel                             | `Esc`                                               |

Elements taller or wider than the window are captured whole: Snag scrolls the
page, captures it piece by piece and stitches the pieces together. Fixed and
sticky elements that would repeat or cover the element are hidden meanwhile.
Rounded corners come out transparent.

The popup keeps the 100 most recent snags.

## Limits

- Parts of the element hidden inside a scrolling container are cut off, and
  an element inside a fixed or sticky container is captured as far as it is
  visible.
- Snags larger than 12 megapixels are scaled down to fit.
- Chrome allows two captures a second, so a long element takes a moment.
- Browsers expose the clipboard only on `https` pages. On plain `http` pages
  the snag is saved in the popup but not copied.

## Develop

```sh
pnpm install
pnpm dev          # Chrome with hot reload
pnpm check        # typecheck + lint
pnpm build        # production build in build/chrome-mv3
pnpm test:unit    # unit tests
pnpm test         # end-to-end tests against an e2e build in build/chrome-mv3-e2e
pnpm bundle:all   # zips for Chrome and Firefox
```

## Install a release

1. Download `snag-<version>-chrome-mv3.zip` from the releases page and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
