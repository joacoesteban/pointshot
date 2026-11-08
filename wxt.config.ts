import { svelte } from '@sveltejs/vite-plugin-svelte'
import { match } from 'ts-pattern'
import { defineConfig } from 'wxt'

export default defineConfig({
  outDir: 'build',
  imports: false,
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    sizes: [128, 64, 48, 32, 16],
  },
  manifest: ({ mode }) => ({
    name: 'Snag: Screenshot Any Element',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting'],
    // Playwright cannot click the toolbar, which is what grants activeTab, so the end-to-end build asks for every host up front.
    host_permissions: match(mode)
      .with('e2e', () => ['<all_urls>'])
      .otherwise(() => undefined),
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
      'snag-selection': {
        description: 'Drag over an area to screenshot.',
      },
      'snag-visible': {
        description: 'Screenshot what the window shows.',
      },
      'snag-page': {
        description: 'Screenshot the whole page.',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'snag@joacoesteban.com',
      },
    },
  }),
  zip: {
    artifactTemplate: 'snag-{{version}}-{{browser}}-{{manifestVersion}}.zip',
    zipSources: false,
  },
  vite: () => ({
    // Svelte injects component styles at runtime next to the component, which lands them inside the popup's shadow root.
    plugins: [svelte({ emitCss: false })],
    build: {
      // Content scripts resolve asset URLs against the host page, so fonts ship as data URLs.
      assetsInlineLimit: (file: string) => /\.woff2?$/.test(file) || undefined,
    },
  }),
})
