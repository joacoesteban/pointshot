import type { Page } from '@playwright/test'
import { expect, FIXTURE_URL, INSECURE_FIXTURE_URL, test } from './fixtures'

type Pixel = readonly [number, number, number, number]

const clipboardImage = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    if (!item?.types.includes('image/png')) return null
    const bitmap = await createImageBitmap(await item.getType('image/png'))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const pixel = ([x, y]: readonly [number, number]) =>
      [...context.getImageData(x, y, 1, 1).data] as unknown as Pixel
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    const pixels = Array.from({ length: data.length / 4 }, (_, index) =>
      data.subarray(index * 4, index * 4 + 4),
    )
    return {
      width: bitmap.width,
      height: bitmap.height,
      corners: [pixel([0, 0]), pixel([bitmap.width - 1, bitmap.height - 1])],
      black: pixels.filter(
        ([r, g, b, a]) => r === 0 && g === 0 && b === 0 && a === 255,
      ).length,
      clear: pixels.filter(([, , , a]) => a === 0).length,
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

test('injects the UI on first use, once', async ({ page, togglePopup }) => {
  const ui = page.locator('snag-ui')
  await expect(ui).toHaveCount(0)
  await togglePopup()
  await expect(page.getByTestId('snag-popup')).toHaveClass(/visible/)
  await togglePopup()
  await expect(page.getByTestId('snag-popup')).not.toHaveClass(/visible/)
  await expect(ui).toHaveCount(1)
})

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

  expect(await clipboardImage(page)).toMatchObject({
    width: 200,
    height: 120,
    corners: [
      [255, 51, 102, 255],
      [255, 51, 102, 255],
    ],
  })

  await page.reload()
  await togglePopup()
  await expect(page.getByTestId('snag-shot')).toHaveCount(1)
})

test('walks siblings and children and snags with Enter', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  const highlight = page.getByTestId('snag-highlight')
  await page.keyboard.press('ArrowUp')
  await expect(highlight).toContainText('div#parent')
  await page.keyboard.press('ArrowRight')
  await expect(highlight).toContainText('svg#logo')
  await page.keyboard.press('ArrowLeft')
  await expect(highlight).toContainText('div#parent')
  await page.keyboard.press('ArrowDown')
  await expect(highlight).toContainText('div#target')

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({ width: 400, height: 300 })
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
  await expect(page.getByText('Click or press Enter to snag')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('snag-highlight')).toBeHidden()
  await expect(page.getByText('Click or press Enter to snag')).toBeHidden()
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

test('copies and downloads a stored shot at full size', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('snag-highlight')).toContainText('div#parent')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  await page.evaluate(() => navigator.clipboard.writeText(''))

  const shot = page.getByTestId('snag-shot')
  await shot.hover()
  await shot.getByRole('button', { name: 'Copy' }).click()
  await expect
    .poll(() => clipboardImage(page))
    .toMatchObject({ width: 400, height: 300 })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    shot.getByRole('button', { name: 'Download' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^snag-snag\.test-.*\.png$/)
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

test('stitches an element taller than the viewport and restores the scroll', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#tall')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 10_000,
  })
  // The black #sticky child, 300 × 40, straddles the first tile's bottom edge 700 px down: exactly one whole copy of it, less its 300 × 10 green child with z-index -1, means it was captured in place across both tiles and kept its stacking context. The fixed black #bubble sits over the element too, so extra black pixels mean it was not hidden. A clear pixel is a seam between tiles.
  expect(await clipboardImage(page)).toEqual({
    width: 300,
    height: 1500,
    corners: [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ],
    black: 300 * 30,
    clear: 0,
  })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('#bubble')).toBeVisible()
})

test('clips rounded corners to transparency', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#pill')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({
    width: 120,
    height: 40,
    corners: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  })
})

test('keeps a margin of page around the element with Shift', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  // 24 px on each side of the 200 × 120 target, all of it inside the blue parent.
  expect(await clipboardImage(page)).toMatchObject({
    width: 248,
    height: 168,
    corners: [
      [51, 102, 255, 255],
      [51, 102, 255, 255],
    ],
  })
})

test('flags the toolbar on pages that refuse content scripts', async ({
  page,
  background,
  togglePopup,
}) => {
  await page.goto('chrome://version')
  await togglePopup()
  const badge = () =>
    background.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      const tabId = tab?.id ?? -1
      return {
        text: await chrome.action.getBadgeText({ tabId }),
        title: await chrome.action.getTitle({ tabId }),
      }
    })
  await expect
    .poll(badge)
    .toEqual({ text: '!', title: 'Snag cannot run on this page' })

  await page.goto(FIXTURE_URL)
  await togglePopup()
  await expect(page.getByTestId('snag-popup')).toHaveClass(/visible/)
  await expect.poll(badge).toMatchObject({ text: '' })
})

test('captures an element cut off by a scrolling container whole', async ({
  page,
  togglePopup,
}) => {
  await page.evaluate(() => {
    window.scrollTo(0, 1100)
    document.querySelector('#scroller')?.scrollTo(0, 200)
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#list')
  await expect(page.getByTestId('snag-highlight')).toContainText('div#list')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 10_000,
  })
  expect(await clipboardImage(page)).toMatchObject({
    width: 180,
    height: 600,
    corners: [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ],
    clear: 0,
  })
  expect(
    await page.evaluate(() => ({
      window: window.scrollY,
      scroller: document.querySelector('#scroller')?.scrollTop,
      height: document.querySelector('#scroller')?.getBoundingClientRect()
        .height,
    })),
  ).toEqual({ window: 1100, scroller: 200, height: 150 })
})

test('captures the whole content of a picked scrolling container', async ({
  page,
  togglePopup,
}) => {
  await page.evaluate(() => {
    window.scrollTo(0, 1100)
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#scroller')
  await expect(page.getByTestId('snag-highlight')).toContainText('div#list')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('snag-highlight')).toContainText('div#scroller')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 10_000,
  })
  expect(await clipboardImage(page)).toMatchObject({ width: 200, height: 600 })
})

test('captures a scrolling pane of an app shell that hides the page overflow', async ({
  page,
  togglePopup,
}) => {
  await page.evaluate(() => {
    document.body.style.cssText = 'margin: 0; height: 100vh; overflow: hidden'
    document.body.innerHTML = `
      <div id="shell" style="height: 100vh; display: flex; flex-direction: column; overflow: hidden">
        <header style="height: 50px; flex: none; background: #000000"></header>
        <main id="pane" style="flex: 1; min-height: 0; overflow: auto">
          <div style="height: 2000px; background: linear-gradient(#ff0000 0 50%, #0000ff 50% 100%)"></div>
        </main>
      </div>`
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#pane')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('snag-highlight')).toContainText('main#pane')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 15_000,
  })
  expect(await clipboardImage(page)).toMatchObject({
    height: 2000,
    corners: [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ],
    clear: 0,
  })
  expect(
    await page.evaluate(() => ({
      body: getComputedStyle(document.body).overflow,
      pane: document.querySelector('#pane')?.getBoundingClientRect().height,
    })),
  ).toEqual({ body: 'hidden', pane: 650 })
})
