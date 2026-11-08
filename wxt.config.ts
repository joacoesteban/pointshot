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
    name: '__MSG_name__',
    description: '__MSG_description__',
    default_locale: 'en',
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab',
      'scripting',
      // Playwright cannot grant optional permissions, so the end-to-end build asks for downloads up front.
      ...match(mode)
        .with('e2e', () => ['downloads'])
        .otherwise(() => []),
    ],
    optional_permissions: ['downloads'],
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
        description: '__MSG_commandToggle__',
      },
      'pick-element': {
        suggested_key: {
          default: 'Alt+Shift+S',
        },
        description: '__MSG_commandPick__',
      },
      'snag-selection': {
        description: '__MSG_commandSelection__',
      },
      'snag-visible': {
        description: '__MSG_commandVisible__',
      },
      'snag-page': {
        description: '__MSG_commandPage__',
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
