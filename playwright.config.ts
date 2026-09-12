import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built Electron app (`out/main/index.js`) through Playwright's
 * `_electron.launch`. `npm run test:e2e` builds first (pretest:e2e). Every test gets its own data
 * folder (APEXCUT_USER_DATA), so runs never touch the real library and the single-instance lock of a
 * running ApexCut is not in the way. See tests/e2e/app.ts for the launch helper.
 */
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts$/,
  // one Electron window at a time keeps the tests deterministic on a developer machine
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
  outputDir: 'test-results/artifacts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
