import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test'
import { match } from 'ts-pattern'
import { z } from 'zod'
import type { MessageKey } from '../lib/i18n'
import { expect } from '../test/fixtures'

const ROOT = path.join(import.meta.dirname, '..')
const FONT = path.join(
  ROOT,
  'assets/fonts/outfit/outfit-latin-wght-normal.woff2',
)
// Outfit has no arrows for the Shift and arrow keys and not every machine has a font with ⇧, so the demo brings one.
const KEYS = path.join(
  ROOT,
  'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf',
)

// The demo answers on two hosts, so the library has more than one site to filter by.
const VIEWS = {
  reports: 'https://app.lumen.example/reports',
  customers: 'https://app.lumen.example/customers',
  pricing: 'https://lumen.example/pricing',
} as const

// Buttons and the options backdrop take their colours from Math.random. These seeds were picked by eye.
const SEEDS = { buttons: 5, backdrop: 101 }
// Animations that never end are stopped this many milliseconds in. It was picked by eye too, for the backdrop, which goes through every hue in 10 s.
const FROZEN_AT = 1200

const MessagesSchema = z.record(z.string(), z.object({ message: z.string() }))

export const LOCALES = { 'en-US': 'en', es: 'es' } as const

export type Lang = keyof typeof LOCALES
export type View = keyof typeof VIEWS
export type Size = { readonly width: number; readonly height: number }
export type Point = { readonly x: number; readonly y: number }

// What store/slide.html reads from its query string. `shot` names a window capture, and `cursor` is drawn over it.
export type Slide = Partial<
  Record<
    | 'layout'
    | 'title'
    | 'body'
    | 'shot'
    | 'cursor'
    | 'camera'
    | 'mark'
    | 'arrow'
    | 'spark',
    string
  >
>

type Stage = {
  readonly context: BrowserContext
  readonly page: Page
  readonly background: Worker
  readonly togglePopup: () => Promise<void>
  readonly runCommand: (command: string) => Promise<void>
  readonly lang: Lang
}

// Drives the extension over the demo site, keeps window captures in build/store and composes the final images from them.
export class Studio {
  static readonly ORIGIN = 'https://studio.test'
  // Chrome Web Store screenshots are 1280 × 800.
  static readonly SIZE: Size = { width: 1280, height: 800 }
  // The store's small promo tile and marquee.
  static readonly TILE: Size = { width: 440, height: 280 }
  static readonly MARQUEE: Size = { width: 1400, height: 560 }

  private cursor: Point = { x: 0, y: 0 }

  private constructor(
    private readonly stage: Stage,
    private readonly messages: z.infer<typeof MessagesSchema>,
  ) {}

  static async open(stage: Stage): Promise<Studio> {
    const { context, lang } = stage
    await context.route(/^https:\/\/(app\.)?lumen\.example\//, (route) =>
      match(new URL(route.request().url()))
        .with({ pathname: '/outfit.woff2' }, () =>
          route.fulfill({ path: FONT }),
        )
        .with({ pathname: '/keys.ttf' }, () => route.fulfill({ path: KEYS }))
        .otherwise(() =>
          route.fulfill({ path: path.join(ROOT, 'store/demo.html') }),
        ),
    )
    await context.route(`${Studio.ORIGIN}/**`, (route) =>
      match(new URL(route.request().url()))
        .with({ pathname: '/' }, () =>
          route.fulfill({ path: path.join(ROOT, 'store/slide.html') }),
        )
        .with({ pathname: '/outfit.woff2' }, () =>
          route.fulfill({ path: FONT }),
        )
        .with({ pathname: '/icon.png' }, () =>
          route.fulfill({ path: path.join(ROOT, 'assets/icon.png') }),
        )
        .with({ pathname: '/camera.json' }, () =>
          route.fulfill({
            path: path.join(ROOT, 'assets/symbols/camera.viewfinder.json'),
          }),
        )
        .otherwise(({ pathname }) =>
          route.fulfill({
            path: path.join(ROOT, 'build/store', lang, pathname),
          }),
        ),
    )
    return new Studio(
      stage,
      MessagesSchema.parse(
        JSON.parse(
          readFileSync(
            path.join(ROOT, 'public/_locales', LOCALES[lang], 'messages.json'),
            'utf8',
          ),
        ),
      ),
    )
  }

  private get page(): Page {
    return this.stage.page
  }

  t(key: MessageKey): string {
    const message = this.messages[key]
    if (!message) throw new Error(`No ${key} message`)
    return message.message
  }

  async visit(view: View, size: Size = Studio.SIZE) {
    await this.load(VIEWS[view], size)
  }

  // Opens the popup over the view, which keeps its content clear of it.
  async beside(view: View) {
    await this.load(`${VIEWS[view]}?popup`, Studio.SIZE)
    await this.stage.togglePopup()
    await this.page.getByTestId('snag-shot').first().waitFor()
  }

  async library() {
    await this.page.addInitScript((seed) => {
      let state = seed
      Math.random = () => {
        state = (state * 1664525 + 1013904223) % 2 ** 32
        return state / 2 ** 32
      }
    }, SEEDS.backdrop)
    await this.page.goto(
      new URL('/options.html#library', this.stage.background.url()).href,
    )
    await this.page.mouse.up()
    await this.move({ x: 0, y: 0 })
  }

  // Moves the pointer over the target, at an offset from its top left corner or else its centre.
  private async hover(target: Locator, at?: Point) {
    const box = await target.boundingBox()
    if (!box) throw new Error('The target is not visible')
    const { x, y } = at ?? { x: box.width / 2, y: box.height / 2 }
    await this.move({ x: box.x + x, y: box.y + y })
    return box
  }

  // Starts picking, points inside the element and widens the selection until it is the element itself.
  async point(selector: string, at?: Point) {
    await this.stage.runCommand('pick-element')
    await this.page.getByTestId('snag-toast').waitFor()
    const { width, height } = await this.hover(this.page.locator(selector), at)
    await this.widen({ width, height })
  }

  // Starts an area capture and drags it around the element, from its bottom left, leaving the button held.
  async drag(selector: string, margin = 12) {
    const box = await this.page.locator(selector).boundingBox()
    if (!box) throw new Error(`${selector} is not visible`)
    await this.stage.runCommand('snag-selection')
    await this.page.getByTestId('snag-toast').waitFor()
    await this.move({ x: box.x - margin, y: box.y + box.height + margin })
    await this.page.mouse.down()
    await this.move({ x: box.x + box.width + margin, y: box.y - margin })
  }

  private click() {
    return this.stored(async () => {
      await this.page.mouse.down()
      await this.page.mouse.up()
    })
  }

  release() {
    return this.stored(() => this.page.mouse.up())
  }

  async capture(selector: string, at?: Point) {
    await this.point(selector, at)
    await this.click()
  }

  // Runs what ends a capture, and waits for the background to store the screenshot.
  private async stored(act: () => Promise<void>) {
    const before = await this.revision()
    await act()
    await expect.poll(() => this.revision()).not.toBe(before)
  }

  // A point at the given fractions of the target's box, in the window's coordinates, for a slide to hang a mark on.
  async spot(target: Locator, x: number, y: number) {
    const box = await target.boundingBox()
    if (!box) throw new Error('The target is not visible')
    return `${String(box.x + box.width * x)},${String(box.y + box.height * y)}`
  }

  // Saves the window as it is, after its transitions, and returns what a slide needs to show it with the cursor.
  async shoot(shot: string, size: Size = Studio.SIZE) {
    const { lang } = this.stage
    const { x, y } = this.cursor
    await this.page.setViewportSize(size)
    await this.page.waitForTimeout(800)
    await this.freeze()
    await this.page.screenshot({ path: `build/store/${lang}/${shot}.png` })
    return { shot, cursor: `${String(x)},${String(y)}` }
  }

  async render(
    set: 'screenshots' | 'promo',
    name: string,
    slide: Slide,
    size: Size = Studio.SIZE,
  ) {
    const { context, lang } = this.stage
    const page = await context.newPage()
    await page.setViewportSize(size)
    await page.goto(
      `${Studio.ORIGIN}/?${new URLSearchParams(slide).toString()}`,
    )
    await page.locator('body[data-ready]').waitFor({ state: 'attached' })
    await page.screenshot({
      path: path.join(ROOT, 'store', set, lang, `${name}.png`),
    })
    await page.close()
  }

  private async load(url: string, size: Size) {
    await this.page.setViewportSize(size)
    await this.page.goto(url)
    // A drag left held ends here, on a page where no capture is waiting for it.
    await this.page.mouse.up()
    // The content script is injected into this same world later, by the first message to the tab.
    await this.stage.background.evaluate(async (seed) => {
      const [tab] = await chrome.tabs.query({
        url: 'https://*.lumen.example/*',
      })
      if (tab?.id === undefined) throw new Error('The demo is not open')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (seed: number) => {
          let state = seed
          Math.random = () => {
            state = (state * 1664525 + 1013904223) % 2 ** 32
            return state / 2 ** 32
          }
        },
        args: [seed],
      })
    }, SEEDS.buttons)
  }

  // The highlight pulses and the backdrop drifts for ever, so a capture would catch a different frame on every run.
  // Pointshot's UI is in a shadow root, which the document's animations leave out.
  private async freeze() {
    await this.page.evaluate((at) => {
      const shadows = [...document.querySelectorAll('*')]
        .map(({ shadowRoot }) => shadowRoot)
        .filter((root) => root !== null)
      ;[document, ...shadows]
        .flatMap((root) => root.getAnimations())
        .filter(
          ({ effect }) => effect?.getComputedTiming().endTime === Infinity,
        )
        .forEach((animation) => {
          animation.pause()
          animation.currentTime = at
        })
    }, FROZEN_AT)
  }

  private async move(point: Point) {
    this.cursor = point
    await this.page.mouse.move(point.x, point.y, { steps: 4 })
  }

  private async widen({ width, height }: Size, tries = 8): Promise<void> {
    const highlight = this.page.getByTestId('snag-highlight')
    await highlight.waitFor()
    // The highlight scales in, so its size is read from its style and not from its box.
    const size = await highlight.evaluate(({ style }) => ({
      width: parseFloat(style.width),
      height: parseFloat(style.height),
    }))
    if (Math.abs(size.width - width) < 2 && Math.abs(size.height - height) < 2)
      return
    if (tries === 0) throw new Error('The selection never reached the element')
    await this.page.keyboard.press('ArrowUp')
    await this.page.waitForTimeout(100)
    await this.widen({ width, height }, tries - 1)
  }

  private revision() {
    return this.stage.background.evaluate(async () => {
      const { shotsRevision } = await chrome.storage.local.get('shotsRevision')
      return String(shotsRevision)
    })
  }
}
