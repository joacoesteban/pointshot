import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test } from '../test/fixtures'

const DEMO = 'https://demo.snag.test/'
const demo = readFileSync(path.join(import.meta.dirname, 'demo.html'), 'utf8')

// Chrome Web Store screenshots are 1280 × 800.
const SIZE = { width: 1280, height: 800 }

// Points near the top left of each element, clear of Snag's toasts, whose clicks the picker leaves alone.
const snag = async (page: Page, selector: string) => {
  await page.getByTestId('snag-pick').click()
  await page.locator(selector).hover({ position: { x: 24, y: 24 } })
  await page.mouse.down()
  await page.mouse.up()
  await page.getByTestId('snag-shot').first().waitFor()
}

for (const lang of ['en-US', 'es-419']) {
  test.describe(lang, () => {
    test.use({ lang })

    test('screenshots', async ({ context, page, togglePopup }) => {
      const out = `build/store/${lang}`
      await context.route(DEMO, (route) =>
        route.fulfill({ contentType: 'text/html', body: demo }),
      )
      await page.setViewportSize(SIZE)
      await page.goto(DEMO)
      await togglePopup()
      await snag(page, '.plans')
      await snag(page, 'nav')
      await snag(page, '#featured')
      // Toasts last a few seconds; the screenshots show the page without them.
      await page.waitForTimeout(4000)
      await page.getByTestId('snag-pick').click()
      await page.locator('#featured h2').hover()
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${out}/1-pick.png` })
      await page.keyboard.press('Escape')

      const shot = page.getByTestId('snag-shot').first()
      await shot.hover()
      await shot.getByRole('button', { name: /^(Open|Abrir)$/ }).click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${out}/2-preview.png` })

      await page
        .getByTestId('snag-preview')
        .getByRole('button', { name: /^(Edit|Editar)$/ })
        .click()
      const editor = page.getByTestId('snag-editor')
      await page.waitForTimeout(800)
      const box = await editor.locator('canvas').boundingBox()
      if (!box) throw new Error('The editor canvas is not visible')
      await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.8)
      await page.mouse.down()
      await page.mouse.move(
        box.x + box.width * 0.4,
        box.y + box.height * 0.45,
        {
          steps: 5,
        },
      )
      await page.mouse.up()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${out}/3-edit.png` })
    })
  })
}
