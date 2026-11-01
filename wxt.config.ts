import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defaultClientConditions } from 'vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  outDir: 'build',
  imports: false,
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    sizes: [128, 64, 48, 32, 16],
  },
  manifest: {
    name: 'Snag: Screenshot Any Element',
    permissions: ['unlimitedStorage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {},
    commands: {
      'toggle-popup': {
        suggested_key: {
          default: 'Alt+S',
        },
        description: 'Toggle the Snag popup on the current page.',
      },
      'pick-element': {
        suggested_key: {
          default: 'Alt+Shift+S',
        },
        description: 'Pick an element to screenshot.',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'snag@joacoesteban.com',
      },
    },
  },
  zip: {
    artifactTemplate: 'snag-{{version}}-{{browser}}-{{manifestVersion}}.zip',
    zipSources: false,
  },
  vite: () => ({
    // Svelte injects component styles at runtime next to the component, which lands them inside the popup's shadow root.
    plugins: [svelte({ emitCss: false })],
    resolve: {
      // vite-plugin-svelte 3 targets Vite 5 and sets `conditions: ['svelte']`, which on Vite 6 replaces the defaults.
      // Without `browser`, `svelte` resolves to its SSR runtime, where onMount is a no-op.
      conditions: [...defaultClientConditions],
    },
    build: {
      // Content scripts resolve asset URLs against the host page, so fonts ship as data URLs.
      assetsInlineLimit: (file: string) => /\.woff2?$/.test(file) || undefined,
    },
  }),
})
