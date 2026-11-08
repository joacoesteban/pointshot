import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
})
