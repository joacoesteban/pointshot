import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'node:path'
import { match, P } from 'ts-pattern'
import { defineConfig, type Plugin } from 'vite'

const desktop = import.meta.dirname
const root = resolve(desktop, '..')

// Extension modules that talk to the background or the browser's clipboard, and their desktop stand-ins.
// Matched after resolving, so relative imports such as lib's './clipboard' are swapped too.
const SWAPS = new Map([
  [resolve(root, 'messages/index.ts'), resolve(desktop, 'ui/messages.ts')],
  [resolve(root, 'lib/clipboard.ts'), resolve(desktop, 'ui/clipboard.ts')],
])

const swap: Plugin = {
  name: 'pointshot-desktop-swap',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    })
    return match(resolved)
      .with({ id: P.string }, ({ id }) => SWAPS.get(id) ?? resolved)
      .otherwise(() => resolved)
  },
}

export default defineConfig({
  root: resolve(desktop, 'ui'),
  // Tauri's devUrl, a port apart from WXT's dev server.
  server: { port: 5174, strictPort: true },
  clearScreen: false,
  plugins: [
    swap,
    svelte({ configFile: resolve(desktop, 'svelte.config.mjs') }),
  ],
  resolve: {
    alias: [
      { find: /^~\//, replacement: `${root}/` },
      // The extension's copy reads browser.i18n, which the desktop app answers from the same messages files.
      { find: 'wxt/browser', replacement: resolve(desktop, 'ui/browser.ts') },
    ],
  },
  // The extension's Tailwind, daisyUI and rem-to-px pipeline.
  css: { postcss: root },
  build: {
    outDir: resolve(desktop, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(desktop, 'ui/index.html'),
        overlay: resolve(desktop, 'ui/overlay.html'),
      },
    },
  },
})
