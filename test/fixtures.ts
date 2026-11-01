import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'

export const FIXTURE_URL = 'https://snag.test/boxes.html'
export const INSECURE_FIXTURE_URL = 'http://snag.test/boxes.html'

const extensionPath = path.join(process.cwd(), 'build/chrome-mv3')
const fixture = readFileSync(
  path.join(import.meta.dirname, 'fixtures/boxes.html'),
  'utf8',
)

type ClickEvent = { dispatch: () => void }

export const test = base.extend<{
  context: BrowserContext
  background: Worker
  page: Page
  togglePopup: () => Promise<void>
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      viewport: { width: 1000, height: 700 },
      deviceScaleFactor: 1,
      permissions: ['clipboard-read', 'clipboard-write'],
      // Keeps a classic scrollbar, so the crop is checked against a client width narrower than the captured window.
      ignoreDefaultArgs: ['--hide-scrollbars'],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
    await context.route(/^https?:\/\/snag\.test\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: fixture }),
    )
    await use(context)
    await context.close()
  },
  background: async ({ context }, use) => {
    const [worker = await context.waitForEvent('serviceworker')] =
      context.serviceWorkers()
    await use(worker)
  },
  page: async ({ context }, use) => {
    const [page = await context.newPage()] = context.pages()
    await page.goto(FIXTURE_URL)
    await page.bringToFront()
    await use(page)
  },
  togglePopup: async ({ background }, use) => {
    await use(() =>
      background.evaluate(() => {
        ;(chrome.action.onClicked as unknown as ClickEvent).dispatch()
      }),
    )
  },
})

export const expect = test.expect
