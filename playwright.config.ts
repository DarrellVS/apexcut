import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built Electron app (`out/main/index.js`) through Playwright's
 * `_electron.launch`. `npm run test:e2e` builds first (pretest:e2e). Every test gets its own data
 * folder (APEXCUT_USER_DATA), so runs never touch the real library and the single-instance lock of a
 * running ApexCut is not in the way. See tests/e2e/app.ts for the launch helper.
 *
 * **These tests never run in CI.** They start a real Electron window, decode video and call ffmpeg;
 * on a hosted runner that is slow, flaky and expensive. They are the mandatory local gate before a
 * release instead (`npm run check:pre-release`, which `npm run build:win` depends on). The guard
 * below fails the run rather than quietly burning CI minutes; a human who really means it can set
 * APEXCUT_ALLOW_CI_E2E=1.
 */
if (process.env.CI && !process.env.APEXCUT_ALLOW_CI_E2E) {
  throw new Error(
    'End-to-end tests do not run in CI (see playwright.config.ts). Run them locally: npm run test:e2e',
  );
}

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts$/,
  // one Electron window at a time keeps the tests deterministic on a developer machine
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // screenshots are the visual freeze: a video frame or a font hint may differ by a pixel
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', scale: 'css' },
  },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
  outputDir: 'test-results/artifacts',
  snapshotPathTemplate: 'tests/e2e/snapshots/{testFileName}/{arg}{ext}',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
