import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'bench.spec.ts',
  timeout: 600_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results/perf',
})
