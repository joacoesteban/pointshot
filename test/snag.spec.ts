import type { Locator, Page } from '@playwright/test'
import { expect, FIXTURE_URL, INSECURE_FIXTURE_URL, test } from './fixtures'

type Pixel = readonly [number, number, number, number]

const clipboardImage = (
  page: Page,
  points: readonly (readonly [number, number])[] = [],
) =>
  page.evaluate(async (points) => {
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
      at: points.map(pixel),
    }
  }, points)

const center = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`${selector} is not visible`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const hover = async (page: Page, selector: string) => {
  const { x, y } = await center(page, selector)
  await page.mouse.move(x, y, { steps: 4 })
}

// Downloads live in the preview, which opens from the card.
const downloadButton = async (page: Page, shot: Locator) => {
  await shot.hover()
  await shot.getByRole('button', { name: 'Open' }).click()
  return page
    .getByTestId('snag-preview')
    .getByRole('button', { name: 'Download' })
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

test('the ghosted popup cannot be dragged while snagging', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  const popup = page.getByTestId('snag-popup')
  await expect(popup).toHaveClass(/visible/)
  await page.getByTestId('snag-pick').click()
  await expect(popup).toHaveClass(/shrink/)
  const box = await popup.boundingBox()
  const grip = { x: (box?.x ?? 0) + 120, y: (box?.y ?? 0) + 24 }
  const transform = await popup.evaluate(({ style }) => style.transform)
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  await page.mouse.move(grip.x - 150, grip.y + 100, { steps: 6 })
  await page.mouse.up()
  expect(await popup.evaluate(({ style }) => style.transform)).toBe(transform)
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

test('right click cancels picking without capturing', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await expect(page.getByTestId('snag-highlight')).toBeVisible()
  await page.mouse.down({ button: 'right' })
  await page.mouse.up({ button: 'right' })
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
    (await downloadButton(page, shot)).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^snag-snag\.test-.*\.png$/)
  await download.path()
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
    at: [],
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

test('picks inside an open shadow root', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#shadow-host')
  const highlight = page.getByTestId('snag-highlight')
  await expect(highlight).toContainText('div#shadow-inner')
  await expect(highlight).toContainText('200 × 60')
  await page.keyboard.press('ArrowUp')
  await expect(highlight).toContainText('div#shadow-host')
  await page.keyboard.press('ArrowDown')
  await expect(highlight).toContainText('div#shadow-inner')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({
    width: 200,
    height: 60,
    corners: [
      [0, 170, 255, 255],
      [0, 170, 255, 255],
    ],
  })
})

test('picks inside a same-origin frame', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#frame')
  const highlight = page.getByTestId('snag-highlight')
  await expect(highlight).toContainText('div#framed')
  await expect(highlight).toContainText('200 × 150')
  await page.keyboard.press('ArrowUp')
  await expect(highlight).toContainText('iframe#frame')
  await page.keyboard.press('ArrowDown')
  await expect(highlight).toContainText('div#framed')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({
    width: 200,
    height: 150,
    corners: [
      [255, 136, 0, 255],
      [255, 136, 0, 255],
    ],
  })
  await expect(page.getByTestId('snag-shot')).toContainText('200 × 150')
  expect(page.url()).toBe(FIXTURE_URL)
})

test('restores inline overflow longhands after opening a container', async ({
  page,
  togglePopup,
}) => {
  await page.evaluate(() => {
    window.scrollTo(0, 1100)
    const scroller = document.querySelector<HTMLElement>('#scroller')
    scroller?.style.removeProperty('overflow')
    scroller?.style.setProperty('overflow-y', 'auto')
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#scroller')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 10_000,
  })
  expect(await clipboardImage(page)).toMatchObject({ width: 180, height: 600 })
  expect(
    await page.evaluate(
      () => document.querySelector<HTMLElement>('#scroller')?.style.overflowY,
    ),
  ).toBe('auto')
})

test('cuts a framed element to its clipping ancestors', async ({
  page,
  togglePopup,
}) => {
  await page
    .frameLocator('#frame')
    .locator('body')
    .evaluate((body) => {
      const framed = body.querySelector('#framed')
      const clipper = document.createElement('div')
      clipper.style.cssText = 'width: 120px; overflow: hidden'
      framed?.replaceWith(clipper)
      clipper.append(framed ?? '')
    })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  // 60, 80 into the frame, past its 2 px border at 320, 440.
  await page.mouse.move(382, 522, { steps: 4 })
  await expect(page.getByTestId('snag-highlight')).toContainText('div#framed')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  // The 200 px #framed starts 20 px into its 120 px clipper.
  expect(await clipboardImage(page)).toMatchObject({ width: 100, height: 150 })
})

test('snags what the window shows, without the popup', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  // The popup sits over the red half of #tall at 700, 200.
  expect(await clipboardImage(page, [[700, 200]])).toMatchObject({
    width: 980,
    height: 700,
    at: [[255, 0, 0, 255]],
  })
})

test('snags the whole page, with fixed elements once', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.press('ControlOrMeta+Shift+Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 15_000,
  })
  // The fixed #bubble shows where the first tile found it, at 700, 600, and not again a window lower, over the blue half of #tall.
  expect(
    await clipboardImage(page, [
      [725, 625],
      [725, 1325],
    ]),
  ).toMatchObject({
    width: 980,
    height: 2000,
    clear: 0,
    at: [
      [0, 0, 0, 255],
      [0, 0, 255, 255],
    ],
  })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('keeps a fixed element where a clamped last tile overlaps it', async ({
  page,
  togglePopup,
}) => {
  // A page 1000 px tall in a 700 px window: the second tile, planned at 700, can only scroll to 300 and overlaps the first from 300 to 700.
  await page.evaluate(() => {
    document.body.style.height = '1000px'
    document
      .querySelectorAll('body > :not(#bubble):not(script)')
      .forEach((element) => {
        element.remove()
      })
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.press('ControlOrMeta+Shift+Enter')
  await expect(page.getByText('Copied to clipboard')).toBeVisible({
    timeout: 15_000,
  })
  expect(await clipboardImage(page, [[725, 625]])).toMatchObject({
    height: 1000,
    at: [[0, 0, 0, 255]],
  })
})

test('snags an area dragged over the page', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.down('Shift')
  await expect(page.getByText('Drag over the area to snag')).toBeVisible()
  await page.mouse.move(100, 130)
  await page.mouse.down()
  await page.mouse.move(200, 180, { steps: 4 })
  await page.mouse.move(300, 230, { steps: 4 })
  await expect(page.getByTestId('snag-selection')).toContainText('200 × 100')
  await expect(page.getByTestId('snag-toast')).toContainText('Release to snag')
  await expect(page.getByTestId('snag-toast')).toContainText('200 × 100')
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('snag-toast')).toHaveAttribute(
    'data-mode',
    'area',
  )
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  await expect(page.getByTestId('snag-selection')).toBeHidden()
  // From the blue #parent at the top left into the pink #target at the bottom right.
  expect(await clipboardImage(page)).toMatchObject({
    width: 200,
    height: 100,
    corners: [
      [51, 102, 255, 255],
      [255, 51, 102, 255],
    ],
  })
})

test('escape cancels an area selection', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.down('Shift')
  await expect(page.getByTestId('snag-selection')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('snag-selection')).toBeHidden()
  await expect(page.getByText('Drag over the area to snag')).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
})

test('right click cancels an area selection', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.keyboard.down('Shift')
  await expect(page.getByTestId('snag-selection')).toBeVisible()
  await page.mouse.click(300, 300, { button: 'right' })
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('snag-selection')).toBeHidden()
  await expect(page.getByText('Drag over the area to snag')).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
})

test('the snag toast follows the keys held', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  const toast = page.getByTestId('snag-toast')
  const highlight = page.getByTestId('snag-highlight')
  await expect(toast).toHaveAttribute('data-mode', 'element')
  await expect(toast).toContainText('Click or press Enter to snag this element')

  await page.keyboard.down('Shift')
  await expect(toast).toHaveAttribute('data-mode', 'area')
  await expect(page.getByTestId('snag-mode-area')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(toast).toContainText('Drag over the area to snag')
  await expect(page.getByTestId('snag-selection')).toBeVisible()

  await page.keyboard.down('ControlOrMeta')
  await expect(toast).toHaveAttribute('data-mode', 'page')
  await expect(toast).toContainText('snag the full page')
  await expect(page.getByTestId('snag-selection')).toBeHidden()
  await expect(highlight).toContainText('Full page')
  await expect(highlight).toContainText('980 × 2000')

  await page.keyboard.up('Shift')
  await expect(toast).toHaveAttribute('data-mode', 'visible')
  await expect(toast).toContainText('snag the page in view')
  await expect(highlight).toContainText('980 × 700')

  await page.keyboard.up('ControlOrMeta')
  await expect(toast).toHaveAttribute('data-mode', 'element')
  await page.keyboard.press('Escape')
  await expect(toast).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
})

test('choosing a mode in the toast pins it until a chord overrides', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  const toast = page.getByTestId('snag-toast')
  await page.getByTestId('snag-mode-visible').click()
  await expect(toast).toHaveAttribute('data-mode', 'visible')
  await page.keyboard.down('Shift')
  await expect(toast).toHaveAttribute('data-mode', 'area')
  await page.keyboard.up('Shift')
  await expect(toast).toHaveAttribute('data-mode', 'visible')
  await page.mouse.click(100, 400)
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await clipboardImage(page)).toMatchObject({ width: 980, height: 700 })
})

test('the toast cancels with its Esc key', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  const toast = page.getByTestId('snag-toast')
  await toast.getByRole('button', { name: 'Cancel' }).click()
  await expect(toast).toBeHidden()
  await expect(page.getByTestId('snag-popup')).not.toHaveClass(/shrink/)
})

test('a modifier does not snag the element with Enter in area mode', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByTestId('snag-toast')).toBeVisible()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('scales a snag past the size limit down and says so', async ({
  page,
  togglePopup,
}) => {
  test.setTimeout(60_000)
  await page.evaluate(() => {
    document.body.innerHTML =
      '<div id="huge" style="width: 3500px; height: 3500px; background: #3366ff"></div>'
  })
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await page.mouse.move(100, 100, { steps: 2 })
  await expect(page.getByTestId('snag-highlight')).toContainText('div#huge')
  await page.mouse.down()
  await page.mouse.up()
  await expect(
    page.getByText('Copied to clipboard, scaled down to fit'),
  ).toBeVisible({ timeout: 30_000 })
  // 3500 × 3500 is 12.25 megapixels, so the side shrinks by the square root of 12 / 12.25.
  expect(await clipboardImage(page)).toMatchObject({
    width: 3464,
    height: 3464,
  })
})

test('downloads in the format from the settings', async ({
  page,
  background,
  togglePopup,
}) => {
  await background.evaluate(() =>
    chrome.storage.local.set({ settings: { format: 'jpeg', quality: 0.8 } }),
  )
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#pill')
  await page.mouse.down()
  await page.mouse.up()
  const shot = page.getByTestId('snag-shot')
  await expect(shot).toHaveCount(1)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (await downloadButton(page, shot)).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^snag-snag\.test-.*\.jpg$/)
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile(await download.path())
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
})

const snagTarget = async (page: Page, selector: string) => {
  await page.getByTestId('snag-pick').click()
  await hover(page, selector)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByText('Copied to clipboard').first()).toBeVisible()
}

test('undoes a deletion, and keeps one that was not undone', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await snagTarget(page, '#target')
  const shot = page.getByTestId('snag-shot')
  await shot.hover()
  await shot.getByRole('button', { name: 'Delete' }).click()
  await expect(shot).toHaveCount(0)
  await expect(page.getByTestId('snag-undo')).toContainText('Deleted 1 snag')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(shot).toHaveCount(1)
  await expect(page.getByTestId('snag-undo')).toBeHidden()

  await shot.hover()
  await shot.getByRole('button', { name: 'Delete' }).click()
  await expect(shot).toHaveCount(0)
  await page.reload()
  await togglePopup()
  await expect(page.getByTestId('snag-popup')).toContainText('No snags yet')
})

test('searches snags and deletes the ones shown', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await snagTarget(page, '#target')
  await snagTarget(page, '#pill')
  const shots = page.getByTestId('snag-shot')
  await expect(shots).toHaveCount(2)
  const search = page.getByRole('searchbox', { name: 'Search snags' })
  await search.fill('nothing like it')
  await expect(page.getByText('No snags match')).toBeVisible()
  await search.fill('FIXTURE')
  await expect(shots).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete all' }).click()
  await expect(shots).toHaveCount(0)
  await expect(page.getByTestId('snag-undo')).toContainText('Deleted 2 snags')
})

test('stops filtering by a site once its snags are gone', async ({
  context,
  page,
  togglePopup,
}) => {
  const other = 'https://other.test/boxes.html'
  await context.route(other, (route) =>
    route.fulfill({ path: 'test/fixtures/boxes.html' }),
  )
  await togglePopup()
  await snagTarget(page, '#target')
  await page.goto(other)
  await togglePopup()
  await snagTarget(page, '#pill')
  const shots = page.getByTestId('snag-shot')
  await expect(shots).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Site' }).selectOption('other.test')
  await expect(shots).toHaveCount(1)
  await page.getByRole('button', { name: 'Delete 1' }).click()
  await expect(page.getByRole('combobox', { name: 'Site' })).toBeHidden()
  await expect(shots).toHaveCount(1)
  await expect(shots).toContainText('200 × 120')
})

test('keeps keys typed in the search away from the page', async ({
  page,
  togglePopup,
}) => {
  await page.evaluate(() => {
    document.addEventListener('keydown', ({ key }) => {
      document.title = `pressed ${key}`
    })
  })
  await togglePopup()
  await snagTarget(page, '#target')
  await page.getByRole('searchbox', { name: 'Search snags' }).fill('')
  await page.getByRole('searchbox', { name: 'Search snags' }).press('s')
  expect(await page.title()).toBe('Snag fixture')
})

test('opens a snag full size and copies it as text', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await snagTarget(page, '#target')
  const shot = page.getByTestId('snag-shot')
  await shot.hover()
  await shot.getByRole('button', { name: 'Open' }).click()
  const preview = page.getByTestId('snag-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('200 × 120')
  await expect
    .poll(() =>
      preview
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
    )
    .toEqual([200, 120])

  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()
})

test('remembers where the popup was left', async ({
  page,
  background,
  togglePopup,
}) => {
  await togglePopup()
  const popup = page.getByTestId('snag-popup')
  await expect(popup).toHaveClass(/visible/)
  const title = popup.getByRole('heading', { name: 'snag', exact: true })
  const before = await title.boundingBox()
  if (!before) throw new Error('The popup title is not visible')
  await page.mouse.move(before.x + 5, before.y + 5)
  await page.mouse.down()
  await page.mouse.move(before.x - 200, before.y + 150, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(() =>
      background.evaluate(() => chrome.storage.local.get('popup-position')),
    )
    .toHaveProperty('popup-position')
  const moved = await title.boundingBox()

  await page.reload()
  await togglePopup()
  await expect(popup).toHaveClass(/visible/)
  await expect.poll(() => title.boundingBox()).toEqual(moved)
})

test('downloads into a folder through the downloads API', async ({
  page,
  background,
  togglePopup,
}) => {
  // Playwright saves downloads under random names, so the request itself is checked.
  await background.evaluate(() => {
    const download = chrome.downloads.download.bind(chrome.downloads)
    Object.assign(chrome.downloads, {
      download: (options: chrome.downloads.DownloadOptions) => {
        void chrome.storage.local.set({ requested: options.filename })
        return download(options)
      },
    })
    return chrome.storage.local.set({ settings: { folder: 'Snag shots' } })
  })
  await togglePopup()
  await snagTarget(page, '#target')
  const shot = page.getByTestId('snag-shot')
  await (await downloadButton(page, shot)).click()
  await expect
    .poll(() =>
      background.evaluate(() => chrome.storage.local.get('requested')),
    )
    .toMatchObject({
      requested: expect.stringMatching(/^Snag shots\/snag-snag\.test-.*\.png$/),
    })
})

test('annotates and crops a snag into a new one', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.press('ArrowUp')
  await page.mouse.down()
  await page.mouse.up()
  const shots = page.getByTestId('snag-shot')
  await expect(shots).toHaveCount(1)
  await shots.hover()
  await shots.getByRole('button', { name: 'Open' }).click()
  await page
    .getByTestId('snag-preview')
    .getByRole('button', { name: 'Edit' })
    .click()
  const editor = page.getByTestId('snag-editor')
  await expect(editor).toBeVisible()
  const canvas = editor.locator('canvas')
  // The editor scales in, so the canvas is measured once it shows the 400 px snag at full size.
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(400)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The editor canvas is not visible')
  const drag = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(box.x + from[0], box.y + from[1])
    await page.mouse.down()
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 })
    await page.mouse.up()
  }

  await editor.getByRole('button', { name: 'Rectangle' }).click()
  await drag([10, 10], [100, 80])
  await editor.getByRole('button', { name: 'Text' }).click()
  await page.mouse.click(box.x + 150, box.y + 150)
  await editor.getByRole('textbox', { name: 'Text' }).fill('Look')
  await editor.getByRole('textbox', { name: 'Text' }).press('Enter')
  await editor.getByRole('button', { name: 'Undo' }).click()
  await editor.getByRole('button', { name: 'Crop' }).click()
  await drag([5, 5], [205, 155])
  await expect(editor.getByTestId('snag-crop')).toBeVisible()
  await editor.getByRole('button', { name: 'Save as new snag' }).click()

  await expect(page.getByText('Saved and copied to clipboard')).toBeVisible()
  await expect(editor).toBeHidden()
  await expect(shots).toHaveCount(2)
  await expect(shots.first()).toContainText('200 × 150')
  // The rectangle's 3 px stroke runs down x = 10 of the snag, so x = 5 of the crop; the pink #target starts at 100, 90.
  expect(
    await clipboardImage(page, [
      [5, 40],
      [150, 120],
      [30, 40],
    ]),
  ).toMatchObject({
    width: 200,
    height: 150,
    at: [
      [255, 59, 48, 255],
      [255, 51, 102, 255],
      [51, 102, 255, 255],
    ],
  })
})

test('keeps text still being typed when the edit is saved', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.press('ArrowUp')
  await page.mouse.down()
  await page.mouse.up()
  const shots = page.getByTestId('snag-shot')
  await shots.hover()
  await shots.getByRole('button', { name: 'Open' }).click()
  await page
    .getByTestId('snag-preview')
    .getByRole('button', { name: 'Edit' })
    .click()
  const editor = page.getByTestId('snag-editor')
  const canvas = editor.locator('canvas')
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(400)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The editor canvas is not visible')
  await editor.getByRole('button', { name: 'Text' }).click()
  await editor.getByRole('radio', { name: 'Black' }).click()
  await page.mouse.click(box.x + 20, box.y + 20)
  await editor.getByRole('textbox', { name: 'Text' }).fill('Look')
  await editor.getByRole('button', { name: 'Save as new snag' }).click()
  await expect(page.getByText('Saved and copied to clipboard')).toBeVisible()
  // The blue and pink #parent has nothing near black, so near-black pixels are the #1c1c1e text.
  const dark = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const bitmap = await createImageBitmap(
      await (item ?? new ClipboardItem({})).getType('image/png'),
    )
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context?.drawImage(bitmap, 0, 0)
    const data = context?.getImageData(0, 0, bitmap.width, bitmap.height).data
    return Array.from({ length: (data?.length ?? 0) / 4 }, (_, index) =>
      [0, 1, 2].every((channel) => (data?.[index * 4 + channel] ?? 255) < 60),
    ).filter(Boolean).length
  })
  expect(dark).toBeGreaterThan(50)
})

test('blurs an area of a snag into blocks', async ({ page, togglePopup }) => {
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.keyboard.press('ArrowUp')
  await page.mouse.down()
  await page.mouse.up()
  const shots = page.getByTestId('snag-shot')
  await shots.hover()
  await shots.getByRole('button', { name: 'Open' }).click()
  await page
    .getByTestId('snag-preview')
    .getByRole('button', { name: 'Edit' })
    .click()
  const editor = page.getByTestId('snag-editor')
  const canvas = editor.locator('canvas')
  // The editor scales in, so the canvas is measured once it shows the 400 px snag at full size.
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(400)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The editor canvas is not visible')
  await editor.getByRole('button', { name: 'Blur' }).click()
  // Over the left edge of the pink #target, which starts at x = 100 of the snag.
  await page.mouse.move(box.x + 85, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 125, box.y + 140, { steps: 4 })
  await page.mouse.up()
  await editor.getByRole('button', { name: 'Save as new snag' }).click()
  await expect(page.getByText('Saved and copied to clipboard')).toBeVisible()
  // Cells are 10 px, so the cell from x = 95 to 105 mixes five columns of blue with five of pink.
  const image = await clipboardImage(page, [[100, 120]])
  expect(image?.at).toHaveLength(1)
  expect(image?.at).not.toEqual([[51, 102, 255, 255]])
  expect(image?.at).not.toEqual([[255, 51, 102, 255]])
})

const optionsUrl = (background: { url: () => string }) =>
  new URL('/options.html', background.url()).href

test('browses, filters and deletes snags in the options library', async ({
  page,
  context,
  togglePopup,
}) => {
  await togglePopup()
  await snagTarget(page, '#target')
  await snagTarget(page, '#pill')
  await expect(page.getByTestId('snag-shot')).toHaveCount(2)

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Browse all snags' }).click(),
  ])
  await options.waitForLoadState()
  expect(options.url()).toMatch(/options\.html#library$/)
  const shots = options.getByTestId('snag-shot')
  await expect(shots).toHaveCount(2)
  await expect(options.getByText('2 snags')).toBeVisible()
  await expect(
    options.getByRole('button', { name: 'snag.test · 2' }),
  ).toHaveAttribute('aria-pressed', 'false')

  await options.getByRole('button', { name: 'snag.test · 2' }).click()
  await expect(shots).toHaveCount(2)
  await options.getByRole('searchbox', { name: 'Search snags' }).fill('nope')
  await expect(shots).toHaveCount(0)
  await expect(options.getByText('No snags match')).toBeVisible()
  await options.getByRole('searchbox', { name: 'Search snags' }).fill('fixture')
  await expect(shots).toHaveCount(2)

  await shots.first().hover()
  await shots.first().getByRole('button', { name: 'Open' }).click()
  const preview = options.getByTestId('snag-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('120 × 40')
  await options.keyboard.press('ArrowRight')
  await expect(preview).toContainText('200 × 120')
  await options.keyboard.press('ArrowRight')
  await expect(preview).toContainText('200 × 120')
  await options.keyboard.press('ArrowLeft')
  await expect(preview).toContainText('120 × 40')
  await options.keyboard.press('Delete')
  await expect(preview).toBeHidden()
  await expect(shots).toHaveCount(1)
  await options.getByRole('button', { name: 'Undo' }).click()
  await expect(shots).toHaveCount(2)

  await page.bringToFront()
  await snagTarget(page, '#logo')
  await expect(shots).toHaveCount(3)
  await expect(options.getByText('3 snags')).toBeVisible()

  await options.getByRole('button', { name: 'Settings' }).click()
  await expect(options.getByRole('combobox', { name: 'Theme' })).toBeVisible()
  await expect(shots).toHaveCount(0)
})

test('asks before deleting more than five snags at once', async ({
  page,
  togglePopup,
}) => {
  await togglePopup()
  for (const selector of ['#target', '#pill', '#logo', '#below', '#link']) {
    await snagTarget(page, selector)
  }
  await expect(page.getByTestId('snag-shot')).toHaveCount(5)
  await page.getByRole('button', { name: 'Delete all' }).click()
  await expect(page.getByTestId('snag-confirm')).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('snag-shot')).toHaveCount(5)

  await snagTarget(page, '#tall')
  await expect(page.getByTestId('snag-shot')).toHaveCount(6)
  await page.getByRole('button', { name: 'Delete all' }).click()
  const confirm = page.getByTestId('snag-confirm')
  await expect(confirm).toContainText('Delete 6 snags?')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByTestId('snag-shot')).toHaveCount(6)
  await page.getByRole('button', { name: 'Delete all' }).click()
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('snag-shot')).toHaveCount(0)
})

test('changes settings on the options page', async ({
  context,
  background,
}) => {
  const options = await context.newPage()
  await options.goto(optionsUrl(background))
  await expect(options.getByRole('heading', { name: 'snag' })).toBeVisible()
  await expect(
    options.getByText('Toggle the Snag popup on the current page.'),
  ).toBeVisible()

  const keep = options.getByRole('spinbutton', { name: 'Snags to keep' })
  await keep.fill('20')
  await keep.press('Enter')
  await options.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await options.getByRole('combobox', { name: 'Format' }).selectOption('webp')
  await expect(options.getByRole('slider', { name: 'Quality' })).toBeVisible()
  await expect
    .poll(() => background.evaluate(() => chrome.storage.local.get('settings')))
    .toMatchObject({ settings: { limit: 20, theme: 'dark', format: 'webp' } })
  await expect(options.locator('[data-snag-theme-root]')).toHaveAttribute(
    'data-theme',
    'dark',
  )

  await options.getByRole('button', { name: 'Copy diagnostics' }).click()
  await expect(options.getByText('Copied diagnostics')).toBeVisible()
  expect(await options.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^Snag \d+\.\d+\.\d+\n.*\nSettings: \{"limit":20/,
  )
})

test('turns Save As back off when downloads are refused', async ({
  context,
  background,
}) => {
  const options = await context.newPage()
  await options.goto(optionsUrl(background))
  // The end-to-end build holds the permission already, so refusal is simulated.
  await options.evaluate(() => {
    Object.assign(chrome.permissions, { request: () => Promise.resolve(false) })
  })
  const saveAs = options.getByRole('switch', { name: 'Ask where to save' })
  await saveAs.click()
  await expect(
    options.getByText('Snag needs permission to manage downloads for this'),
  ).toBeVisible()
  await expect(saveAs).not.toBeChecked()
  expect(
    await background.evaluate(() => chrome.storage.local.get('settings')),
  ).not.toMatchObject({ settings: { saveAs: true } })
})

test('turns Save As on and off with its switch', async ({
  context,
  background,
}) => {
  const options = await context.newPage()
  await options.goto(optionsUrl(background))
  const saveAs = options.getByRole('switch', { name: 'Ask where to save' })
  await expect(saveAs).not.toBeChecked()
  await saveAs.click()
  await expect(saveAs).toBeChecked()
  await expect
    .poll(() => background.evaluate(() => chrome.storage.local.get('settings')))
    .toMatchObject({ settings: { saveAs: true } })
  await saveAs.click()
  await expect(saveAs).not.toBeChecked()
})

test('keeps failed copies for the diagnostics', async ({
  page,
  background,
  togglePopup,
}) => {
  await page.goto(INSECURE_FIXTURE_URL)
  await togglePopup()
  await page.getByTestId('snag-pick').click()
  await hover(page, '#target')
  await page.mouse.down()
  await page.mouse.up()
  const shot = page.getByTestId('snag-shot')
  await expect(shot).toHaveCount(1)
  const errors = () =>
    background.evaluate(async () => {
      const { 'recent-errors': recent } =
        await chrome.storage.local.get('recent-errors')
      return ([] as unknown[]).concat(recent ?? []).length
    })
  await expect.poll(errors).toBe(1)
  await shot.hover()
  await shot.getByRole('button', { name: 'Copy' }).click()
  await expect(
    page.getByText('The page blocked the clipboard', { exact: true }),
  ).toBeVisible()
  await expect.poll(errors).toBe(2)
})

test('opens the options from the popup', async ({
  page,
  context,
  background,
  togglePopup,
}) => {
  await togglePopup()
  const [options] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Options' }).click(),
  ])
  await expect(options).toHaveURL(optionsUrl(background))
})

test.describe('in Spanish', () => {
  test.use({ lang: 'es-419' })

  test('speaks Argentinian Spanish', async ({ page, togglePopup }) => {
    // Chromium on macOS ignores --lang and keeps the system language, so the extension stays in English there.
    test.skip(process.platform === 'darwin', 'Chromium ignores --lang on macOS')
    await togglePopup()
    const popup = page.getByTestId('snag-popup')
    await expect(popup).toContainText('Todavía no hay capturas')
    await expect(popup).toContainText('Elegí un elemento')
    await page.getByRole('button', { name: 'Capturar', exact: true }).click()
    await expect(page.getByText('Hacé clic o presioná Enter')).toBeVisible()
    await expect(page.getByTestId('snag-toast')).toContainText('Página entera')
    await hover(page, '#target')
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByText('Copiado al portapapeles')).toBeVisible()
    await expect(page.getByTestId('snag-shot')).toContainText('este minuto')
  })
})
