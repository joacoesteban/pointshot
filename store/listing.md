# Store listing

Copy and images for the Chrome Web Store and Firefox Add-ons.

## Images

`mise run store:screenshots` renders the five store screenshots, 1280 × 800,
into `store/screenshots/en-US` and `store/screenshots/es-419`. Upload them in
order. Each one is a headline on white, with one word highlighted and a
hand-drawn arrow or spark, and the first four frame a capture of the
extension on a demo site over shapes in the icon's colours.

| Screenshot   | Shows                | Headline                            |
| ------------ | -------------------- | ----------------------------------- |
| `01-point`   | Pointing at a chart  | Point. Click. Paste.                |
| `02-modes`   | Dragging an area     | Area, window and full page captures |
| `03-editor`  | The editor           | Arrows, boxes, text and blur        |
| `04-library` | The library          | Every screenshot saved              |
| `05-local`   | The icon, on its own | No account, no uploads, no tracking |

It also renders the promo images into `store/promo/en-US` and
`store/promo/es-419`:

- `tile.png`, 440 × 280: the small promo tile, with the icon, the name and
  the first headline.
- `marquee.png`, 1400 × 560: the marquee, the first screenshot's headline and
  capture at the marquee's size.

To change them:

- The headlines are in `store/copy.ts`, with `**bold**` for the heavy words.
- The scenes, which capture each image shows, which word is highlighted and
  where its arrow or spark goes are in `store/screenshots.spec.ts`.
- The frame, the shapes, the highlighter colours, the sketch paths and the
  layouts are in `store/slide.html`, and the demo site is `store/demo.html`.

## English

**Name:** Pointshot: Click-to-Capture Screenshot Tool

**Summary** (132 characters at most): Point. Click. Paste. Screenshot
whatever your mouse touches: tables, forms, charts, even the full page. No
account, no uploads.

**Description:**

Every screenshot tool makes you drag a rectangle and then fix it. Pointshot
doesn't. Point at what you want (a table, a chart, a form, a post) and it
lights up. Click, and it is on your clipboard, cut to its exact edges.

- Point and click to screenshot anything on a page. No cropping afterwards.
- Full page, visible area and drag-an-area screenshots too, with scrolling
  capture for long pages.
- Every screenshot is copied to the clipboard as a PNG, ready to paste.
- Every screenshot is kept in a library: search it, filter by site, open it
  full size, copy it again, or download it as PNG, JPEG or WebP.
- Built-in editor: arrows, boxes, text, blur and crop.

No account, no uploads, no tracking. Pointshot only runs on the tab where you
open it, and your screenshots stay on your computer.

**Permissions:**

- _activeTab_ and _scripting_: run on the current tab when you open
  Pointshot.
- _storage_ and _unlimitedStorage_: keep your screenshots and settings
  locally.
- _downloads_, optional: save into a folder or ask where to save, only if you
  turn that on.

## Español (Argentina)

**Nombre:** Pointshot: capturas de pantalla con un clic

**Resumen:** Apuntá. Clickeá. Pegá. Captura de pantalla de lo que toca tu
mouse: tablas, gráficos, hasta la página completa. Sin cuenta.

**Descripción:**

Todas las herramientas de captura de pantalla te hacen arrastrar un
rectángulo y después corregirlo. Pointshot no. Apuntá a lo que querés (una
tabla, un gráfico, un formulario, un posteo) y se ilumina. Clickeá y ya está
en tu portapapeles, recortado justo en sus bordes.

- Apuntá y clickeá para capturar cualquier cosa de la página. Sin recortar
  después.
- También capturas de página completa, de lo que muestra la ventana o de un
  área que arrastrás, con captura con scroll para páginas largas.
- Cada captura se copia al portapapeles como PNG, lista para pegar.
- Cada captura queda en una biblioteca: buscala, filtrala por sitio, abrila
  en tamaño completo, copiala de nuevo o descargala como PNG, JPEG o WebP.
- Editor incluido: flechas, recuadros, texto, desenfoque y recorte.

Sin cuenta, sin subir nada, sin rastreo. Pointshot solo funciona en la
pestaña donde lo abrís, y tus capturas quedan en tu computadora.

**Permisos:**

- _activeTab_ y _scripting_: funcionar en la pestaña actual cuando abrís
  Pointshot.
- _storage_ y _unlimitedStorage_: guardar tus capturas y configuración en tu
  computadora.
- _downloads_, opcional: guardar en una carpeta o preguntar dónde guardar,
  solo si lo activás.
