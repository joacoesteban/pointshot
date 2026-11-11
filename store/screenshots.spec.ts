import { expect, test } from '../test/fixtures'
import { COPY } from './copy'
import { LOCALES, Studio, type Lang, type Size } from './studio'

// The windows framed inside the screenshots, at their real size.
const SIDE: Size = { width: 680, height: 600 }
const BAND: Size = { width: 1040, height: 540 }
const DESK: Size = { width: 1040, height: 600 }

// Over the chart, between two bars.
const CHART = { x: 300, y: 150 }

for (const lang of Object.keys(LOCALES) as Lang[]) {
  test.describe(lang, () => {
    test.use({ lang, scrollbars: false })

    test('screenshots', async ({
      context,
      page,
      background,
      togglePopup,
      runCommand,
    }) => {
      const copy = COPY[lang]
      const studio = await Studio.open({
        context,
        page,
        background,
        togglePopup,
        runCommand,
        lang,
      })

      await studio.visit('pricing')
      await studio.capture('.plans')

      await studio.visit('reports', SIDE)
      await studio.point('#revenue', CHART)
      const pointing = await studio.shoot('pick-side', SIDE)

      await studio.visit('reports', BAND)
      // Past the navigation, so the toast at the bottom clears the area.
      await page.evaluate(() => {
        scrollTo(0, 64)
      })
      await studio.drag('.row')
      const dragging = await studio.shoot('area-band', BAND)
      await studio.release()

      await studio.visit('reports')
      await studio.capture('#pages')
      await studio.capture('#revenue', CHART)
      await studio.capture('#signups')
      await studio.visit('pricing')
      await studio.capture('#featured')
      await studio.visit('customers')
      await studio.capture('#customers')

      await studio.beside('reports')
      // The revenue card, which three screenshots were taken after.
      await page
        .getByTestId('snag-shot')
        .nth(3)
        .getByRole('button', { name: studio.t('open') })
        .click()
      await page
        .getByTestId('snag-preview')
        .getByRole('button', { name: studio.t('edit') })
        .click()
      const editor = page.getByTestId('snag-editor')
      await page.waitForTimeout(800)
      const box = await editor.locator('canvas').boundingBox()
      if (!box) throw new Error('The editor canvas is not visible')
      const at = (x: number, y: number) =>
        [box.x + box.width * x, box.y + box.height * y] as const
      const draw = async (
        tool: 'toolArrow' | 'toolRectangle' | 'toolBlur',
        from: readonly [number, number],
        to: readonly [number, number],
      ) => {
        await editor.getByRole('button', { name: studio.t(tool) }).click()
        await page.mouse.move(...from)
        await page.mouse.down()
        await page.mouse.move(...to, { steps: 5 })
        await page.mouse.up()
      }
      await draw('toolBlur', at(0.035, 0.17), at(0.3, 0.34))
      await draw('toolRectangle', at(0.315, 0.18), at(0.42, 0.32))
      await draw('toolArrow', at(0.8, 0.29), at(0.68, 0.41))
      await editor.getByRole('button', { name: studio.t('toolText') }).click()
      await page.mouse.click(...at(0.72, 0.18))
      const note = editor.getByRole('textbox', { name: studio.t('toolText') })
      await note.fill(copy.note)
      await note.press('Enter')
      await page.mouse.move(...at(1.2, 1.2))
      await togglePopup()
      await studio.shoot('editor-desk', DESK)
      await editor.getByTestId('snag-save-edit').click()
      await expect(page.getByTestId('snag-shot')).toHaveCount(8)

      await studio.library()
      await studio.shoot('library-side', SIDE)

      await studio.render('01-point', {
        ...copy.point,
        ...pointing,
        layout: 'right',
        theme: 'lagoon',
      })
      await studio.render('02-modes', {
        ...copy.modes,
        ...dragging,
        layout: 'top',
        theme: 'tide',
      })
      await studio.render('03-editor', {
        ...copy.editor,
        shot: 'editor-desk',
        layout: 'bottom',
        theme: 'dusk',
      })
      await studio.render('04-library', {
        ...copy.library,
        shot: 'library-side',
        layout: 'left',
        theme: 'reef',
      })
      await studio.render('05-local', {
        ...copy.local,
        layout: 'center',
        theme: 'deep',
      })
    })
  })
}
