import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const desktop = import.meta.dirname
const root = resolve(desktop, '..')

export default defineConfig({
  root: resolve(desktop, 'ui'),
  // Tauri's devUrl, a port apart from WXT's dev server.
  server: { port: 5174, strictPort: true },
  clearScreen: false,
  plugins: [svelte({ configFile: resolve(desktop, 'svelte.config.mjs') })],
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
