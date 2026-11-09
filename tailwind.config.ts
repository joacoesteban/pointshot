import type { Config } from 'tailwindcss'
import daisyui from 'daisyui'
import themes from 'daisyui/src/theming/themes'

export default {
  darkMode: 'media',
  content: [
    './components/**/*.svelte',
    './contents/**/*.svelte',
    './entrypoints/**/*.svelte',
  ],
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        dark: {
          ...themes['dark'],
          '--_blur-bg': 'rgba(20, 20, 20, 0.5)',
          '--_blur-bg-soft': 'rgba(20, 20, 20, 0.25)',
          '--_blur-text-color': 'rgb(255, 255, 255)',
          '--options-blended-text-color': '#aaa',
          '--_field-glow': '#fff3',
        },
      },
      {
        light: {
          ...themes['light'],
          '--_blur-bg': 'rgba(238, 238, 238, 0.5)',
          '--_blur-bg-soft': 'rgba(238, 238, 238, 0.25)',
          '--_blur-text-color': 'rgb(50, 50, 50)',
          '--options-blended-text-color': '#666',
          '--_field-glow': '#fffa',
        },
      },
    ],
    darkTheme: 'dark',
    base: true,
    styled: true,
    utils: true,
    logs: false,
    themeRoot: '[data-snag-theme-root]',
  },
} satisfies Config
