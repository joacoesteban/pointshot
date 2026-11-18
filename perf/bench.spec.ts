import {
  execFile as execFileCallback,
  spawn,
  type ChildProcess,
} from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { ResultAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'

type CDPSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>
type ClickEvent = { dispatch: () => void }
type CommandEvent = { dispatch: (command: string) => void }
type Row = Record<string, number>
type Metrics = ReadonlyMap<string, number>
type Probe = { readonly page: Page; readonly cdp: CDPSession }
type Motion = 'scroll' | 'pointer'
type GpuReading = {
  readonly util: number
  readonly clock: number
  readonly fullClock: number
}

const EXTENSION =
  process.env['PERF_EXTENSION'] ??
  path.join(import.meta.dirname, '../build/chrome-mv3-e2e')
const HEAVY_URL = 'https://perf.test/'
const SCENARIO_MS = 5_000
const SHOTS = 6
const LIBRARY_SHOTS = 100
// 2.4 px per ms is a fast scroll, 2400 px a second.
const SCROLL_PX_PER_MS = 2.4
const SMI = 'nvidia-smi'
const SMI_MAX_CLOCK = [
  '--query-gpu=clocks.max.gr',
  '--format=csv,noheader,nounits',
]
const SMI_SAMPLE = [
  '--query-gpu=utilization.gpu,clocks.gr',
  '--format=csv,noheader,nounits',
  '-lms',
  '100',
]
const SOFTWARE_RENDERER = /SwiftShader|llvmpipe/

const GPU_ARGS = match(process.platform)
  .with('linux', () => [
    '--use-gl=angle',
    '--use-angle=gl-egl',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ])
  .with('darwin', () => [
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ])
  .otherwise(() => ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'])

const card = (i: number) =>
  `<div class="card" style="--h:${String((i * 37) % 360)}"><b>Card ${String(
    i,
  )}</b><p>Lorem ipsum dolor sit amet ${String(i)}</p></div>`

const HEAVY_PAGE = `<!doctype html><html><head><style>
body{font-family:sans-serif;margin:0}
.card{display:inline-block;width:180px;height:120px;margin:8px;border-radius:12px;
background:linear-gradient(135deg,hsl(var(--h) 70% 60%),hsl(calc(var(--h) + 60) 70% 40%));
box-shadow:0 4px 12px #0003;color:white;padding:8px;vertical-align:top}
</style></head><body>
${Array.from({ length: 2500 }, (_, i) => card(i)).join('')}
</body></html>`

const rendererName = (): string => {
  const gl = document.createElement('canvas').getContext('webgl')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  if (!gl || !info) return 'unknown'
  return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
}

type FrameRun = { readonly durationMs: number; readonly pxPerMs: number }

const sampleFrames = ({ durationMs, pxPerMs }: FrameRun): Promise<number[]> =>
  new Promise((resolve) => {
    const intervals: number[] = []
    const start = performance.now()
    let last = start
    const end = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1,
    )
    // Bounces between the top and the bottom, so a short page keeps moving for the whole sample.
    const tick = (now: number) => {
      intervals.push(now - last)
      last = now
      window.scrollTo(
        0,
        end - Math.abs((((now - start) * pxPerMs) % (2 * end)) - end),
      )
      if (now - start < durationMs) requestAnimationFrame(tick)
      else resolve(intervals.slice(5))
    }
    requestAnimationFrame(tick)
  })

// Seeds the library through the options page, which shares the background's origin and so its snag-db.
const seedShots = async (count: number): Promise<number> => {
  const now = Date.now()
  const paint = (width: number, height: number, hue: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    const fill = ctx.createLinearGradient(0, 0, width, height)
    fill.addColorStop(0, `hsl(${String(hue)} 70% 60%)`)
    fill.addColorStop(1, `hsl(${String((hue + 60) % 360)} 70% 40%)`)
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, width, height)
    return canvas
  }
  const records = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const hue = (i * 37) % 360
      const image = await fetch(
        paint(1280, 800, hue).toDataURL('image/png'),
      ).then((response) => response.blob())
      return {
        id: `bench-${String(i)}`,
        createdAt: now - i * 60_000,
        url: `https://h${String(i % 3)}.perf.test/page/${String(i)}`,
        title: `Bench shot ${String(i)}`,
        width: 1280,
        height: 800,
        thumbnail: paint(320, 200, hue).toDataURL('image/webp', 0.8),
        image,
      }
    }),
  )
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('snag-db')
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB open failed'))
    }
  })
  const tx = db.transaction('shots', 'readwrite')
  const shots = tx.objectStore('shots')
  shots.clear()
  records.forEach((record) => shots.put(record))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB write failed'))
    }
    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB write aborted'))
    }
  })
  db.close()
  return records.length
}

const readMaxClock = (): Promise<number | null> =>
  ResultAsync.fromPromise(
    promisify(execFileCallback)(SMI, SMI_MAX_CLOCK),
    () => null,
  )
    .map(({ stdout }) =>
      match(Number.parseFloat(stdout))
        .with(P.when(Number.isFinite), (clock) => clock)
        .otherwise(() => null),
    )
    .unwrapOr(null)

const parseSample = (line: string) =>
  match(line.split(',').map((field) => Number.parseFloat(field)))
    .with(
      [P.when(Number.isFinite), P.when(Number.isFinite)],
      ([util, clock]) => ({
        util,
        clock,
      }),
    )
    .otherwise(() => null)

class GpuSampler {
  private readonly samples: { util: number; clock: number }[] = []
  private pending = ''

  private constructor(
    private readonly smi: ChildProcess,
    private readonly maxClock: number,
  ) {
    smi.stdout?.on('data', (chunk: Buffer) => {
      const lines = (this.pending + chunk.toString()).split('\n')
      this.pending = lines.pop() ?? ''
      lines.forEach((line) => {
        const sample = parseSample(line)
        if (sample) this.samples.push(sample)
      })
    })
  }

  static start(maxClock: number): GpuSampler {
    return new GpuSampler(spawn(SMI, SMI_SAMPLE), maxClock)
  }

  stop(): GpuReading | null {
    this.smi.kill()
    return match(this.samples)
      .with([], () => null)
      .otherwise((samples) => {
        const util = mean(samples.map((sample) => sample.util))
        const clock = mean(samples.map((sample) => sample.clock))
        const fullClock = mean(
          samples.map(({ util, clock }) => (util * clock) / this.maxClock),
        )
        return { util, clock, fullClock }
      })
  }
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const round = (value: number) => Math.round(value * 10) / 10

const metricsOf = async (cdp: CDPSession): Promise<Metrics> => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return new Map(metrics.map(({ name, value }) => [name, value]))
}

const frameRow = (intervals: readonly number[]): Row => {
  const sorted = [...intervals].sort((a, b) => a - b)
  return {
    'frame avg ms': round(mean(intervals)),
    'frame p95 ms': round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    'frames over 50 ms': intervals.filter((ms) => ms > 50).length,
  }
}

const metricRow = (before: Metrics, after: Metrics): Row => {
  const delta = (name: string) =>
    (after.get(name) ?? 0) - (before.get(name) ?? 0)
  return {
    'task ms': round(delta('TaskDuration') * 1000),
    'script ms': round(delta('ScriptDuration') * 1000),
    'layout ms': round(delta('LayoutDuration') * 1000),
    'style ms': round(delta('RecalcStyleDuration') * 1000),
    layouts: delta('LayoutCount'),
    'style recalcs': delta('RecalcStyleCount'),
  }
}

const gpuRow = (reading: GpuReading | null): Row =>
  match(reading)
    .with(P.nullish, () => ({}))
    .otherwise(({ util, clock, fullClock }) => ({
      'GPU util %': round(util),
      'GPU clock MHz': round(clock),
      'GPU at full clock %': round(fullClock),
    }))

const moveMouse = async (page: Page, durationMs: number) => {
  const end = Date.now() + durationMs
  for (let i = 0; Date.now() < end; i++) {
    await page.mouse.move(100 + ((i * 13) % 1000), 100 + ((i * 7) % 600))
  }
}

const measure = async (
  { page, cdp }: Probe,
  motion: Motion,
  maxClock: number | null,
): Promise<Row> => {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(300)
  const sampler = match(maxClock)
    .with(P.number, (clock) => GpuSampler.start(clock))
    .otherwise(() => null)
  const before = await metricsOf(cdp)
  const pxPerMs = match(motion)
    .with('scroll', () => SCROLL_PX_PER_MS)
    .otherwise(() => 0)
  const pointer = match(motion)
    .with('pointer', () => moveMouse(page, SCENARIO_MS))
    .otherwise(() => Promise.resolve())
  const [intervals] = await Promise.all([
    page.evaluate(sampleFrames, { durationMs: SCENARIO_MS, pxPerMs }),
    pointer,
  ])
  const after = await metricsOf(cdp)
  const reading = sampler?.stop() ?? null
  return {
    ...frameRow(intervals),
    ...metricRow(before, after),
    ...gpuRow(reading),
  }
}

test('benchmark', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    args: [
      ...GPU_ARGS,
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
    ],
  })
  await context.route(/^https?:\/\/perf\.test\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: HEAVY_PAGE }),
  )
  const [worker = await context.waitForEvent('serviceworker')] =
    context.serviceWorkers()
  const [page = await context.newPage()] = context.pages()
  await page.goto(HEAVY_URL)
  await page.bringToFront()

  const renderer = await page.evaluate(rendererName)
  console.log(`WebGL renderer: ${renderer}`)
  match(renderer)
    .with(P.string.regex(SOFTWARE_RENDERER), (name) => {
      console.log(
        `WARNING: ${name} is software rendering, so the GPU numbers are not meaningful`,
      )
    })
    .otherwise(() => undefined)

  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const maxClock = await readMaxClock()
  const probe = { page, cdp }

  const togglePopup = () =>
    worker.evaluate(() => {
      ;(chrome.action.onClicked as unknown as ClickEvent).dispatch()
    })
  const runCommand = (command: string) =>
    worker.evaluate((command) => {
      ;(chrome.commands.onCommand as unknown as CommandEvent).dispatch(command)
    }, command)

  const table: Record<string, Row> = {}

  table['page only'] = await measure(probe, 'scroll', maxClock)

  await togglePopup()
  await page.getByTestId('snag-popup').waitFor()
  await page.waitForTimeout(500)
  await togglePopup()
  await page.waitForTimeout(500)
  const toasts = page.locator('.snag-toast')
  // One at a time: a capture's toast comes after its clipboard write, so waiting for each to come and go keeps every toast out of the samples.
  for (let shot = 0; shot < SHOTS; shot++) {
    await runCommand('snag-visible')
    await expect(toasts).toHaveCount(1, { timeout: 15_000 })
    await expect(toasts).toHaveCount(0, { timeout: 15_000 })
  }
  table['popup closed'] = await measure(probe, 'scroll', maxClock)

  await togglePopup()
  await page.getByTestId('snag-shot').first().waitFor()
  table['popup open'] = await measure(probe, 'scroll', maxClock)

  await togglePopup()
  await page.waitForTimeout(500)
  await runCommand('pick-element')
  await page.getByTestId('snag-toast').waitFor()
  table['picker'] = await measure(probe, 'pointer', maxClock)
  await page.keyboard.press('Escape')

  const extensionId = new URL(worker.url()).host
  const library = await context.newPage()
  await library.goto(`chrome-extension://${extensionId}/options.html#library`)
  const seeded = await library.evaluate(seedShots, LIBRARY_SHOTS)
  await library.reload()
  await library.getByTestId('snag-shot').first().waitFor()
  await library.waitForTimeout(500)
  const cards = await library.getByTestId('snag-shot').count()
  console.log(
    `library: seeded ${String(seeded)} shots, ${String(cards)} cards rendered`,
  )
  const libraryCdp = await context.newCDPSession(library)
  await libraryCdp.send('Performance.enable')
  table['library'] = await measure(
    { page: library, cdp: libraryCdp },
    'scroll',
    maxClock,
  )

  console.table(table)
  await context.close()
})
