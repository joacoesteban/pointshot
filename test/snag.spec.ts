import type { Page } from '@playwright/test'
import { expect, FIXTURE_URL, INSECURE_FIXTURE_URL, test } from './fixtures'

type Pixel = readonly [number, number, number]

const clipboardImage = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    if (!item) return null
    const bitmap = await createImageBitmap(await item.getType('image/png'))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const pixel = ([x, y]: readonly [number, number]) =>
      [...context.getImageData(x, y, 1, 1).data.slice(0, 3)] as unknown as Pixel
    return {
      width: bitmap.width,
      height: bitmap.height,
      corners: [pixel([0, 0]), pixel([bitmap.width - 1, bitmap.height - 1])],
    }
  })

const center = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`${selector} is not visible`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const hover = async (page: Page, selector: string) => {
  const { x, y } = await center(page, selector)
  await page.mouse.move(x, y, { steps: 4 })
}

test('picks an element, copies it to the clipboard and stores it', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  const popup = page.getByTestId('snag-popup')
  await expect(popup).toHaveClass(/visible/)
  await expect(popup).toContainText('No snags yet')

  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')

  const highlight = page.getByTestId('snag-highlight')
  await expect(highlight).toContainText('div#target')
  await expect(highlight).toContainText('200 × 120')

  await page.keyboard.press('ArrowUp')
  await expect(highlight).toContainText('div#parent')
  await expect(highlight).toContainText('400 × 300')
  await page.keyboard.press('ArrowDown')
  await expect(highlight).toContainText('div#target')

  await page.mouse.down()
  await page.mouse.up()

  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  await expect(highlight).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(1)
  await expect(page.getByTestId('snag-shot')).toContainText('200 × 120')

  expect(await clipboardImage(page)).toEqual({
    width: 200,
    height: 120,
    corners: [
      [255, 51, 102],
      [255, 51, 102],
    ],
  })

  await page.reload()
  await togglePopup()
  await expect(page.getByTestId('snag-shot')).toHaveCount(1)
})

test('swallows the picking click so the page does not react', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#link')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(page.url()).toBe(FIXTURE_URL)
})

test('escape cancels picking without capturing', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await expect(page.getByTestId('snag-highlight')).toBeVisible()
  await expect(page.getByText('Press ESC to cancel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('snag-highlight')).toBeHidden()
  await expect(page.getByText('Press ESC to cancel')).toBeHidden()
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
})

test('deletes a stored shot', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.mouse.down()
  await page.mouse.up()
  const shot = page.getByTestId('snag-shot')
  await expect(shot).toHaveCount(1)
  await shot.hover()
  await shot.getByRole('button', { name: 'Delete' }).click()
  await expect(shot).toHaveCount(0)
  await expect(page.getByTestId('snag-popup')).toContainText('No snags yet')
})

test('saves the shot on http pages, where the clipboard is unavailable', async ({
  page,
  togglePopup,
}) => {
  await page.goto(INSECURE_FIXTURE_URL)
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.mouse.down()
  await page.mouse.up()
  await expect(
    page.getByText('Saved, but the page blocked the clipboard'),
  ).toBeVisible()
  await expect(page.getByTestId('snag-shot')).toHaveCount(1)
  await expect(page.getByTestId('snag-shot')).toContainText('200 × 120')
})

test('picks SVG elements', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#logo')
  const highlight = page.getByTestId('snag-highlight')
  await expect(highlight).toContainText('rect')
  await page.keyboard.press('ArrowUp')
  await expect(highlight).toContainText('svg#logo')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({ width: 100, height: 80 })
})

test('scrolling retargets the element under the pointer', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  const highlight = page.getByTestId('snag-highlight')
  await expect(highlight).toContainText('div#target')
  await page.mouse.wheel(0, 700)
  await expect(highlight).toContainText('div#below')
})
