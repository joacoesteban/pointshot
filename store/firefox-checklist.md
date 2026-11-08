# Firefox checklist

Playwright cannot load extensions into Firefox, so the Firefox build is
checked by hand before a release. `mise run firefox:lint` must report no
errors; its two warnings come from Svelte's template cloning. Then run
`mise run firefox:run` and, on an https page:

1. Click the toolbar icon. The popup opens; clicking again closes it.
2. Press **Snag**, hover an element, use the arrows, click. The toast says
   it was copied, and pasting into an image editor gives the element.
3. Snag an element taller than the window, and one inside a scrolling pane.
   Both come out whole, and the page scrolls back.
4. Snag an area, the visible window and the whole page from the popup.
5. Start the countdown, open a menu on the page, and let it snag.
6. Open a snag, copy it as Markdown and as a page link, edit it with each
   tool, and save it as a new snag.
7. Delete a snag, undo, delete it again and reload: it stays deleted.
8. Open the options from the gear. Set a folder: Firefox asks for the
   downloads permission, and downloads land in that folder.
9. Switch the theme to dark, and Firefox's language to Spanish: the popup
   follows both.
10. Open `about:addons`: the toolbar badge shows `!` after a click there.
