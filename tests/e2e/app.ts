/**
 * Launch helper for the end-to-end tests: starts the built app with a fresh, throw-away data
 * folder (its own single-instance lock, an output folder inside it, the tour marked as seen) and
 * returns the app, its first window and the folder.
 *
 *   const { app, page } = await launchApp({ args: ['--add=C:/videos/DJI_...MP4'] });
 *   ...
 *   await launched.close();
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
  /** where movies and clips of this run land */
  outputDir: string;
  /** closes the window(s) and removes the data folder */
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** extra command-line arguments, e.g. `--add=<file>` */
  args?: string[];
  env?: Record<string, string>;
  /** settings.json written before the first start (merged with the safe defaults) */
  settings?: Record<string, unknown>;
}

export const MAIN_ENTRY = resolve(__dirname, '../../out/main/index.js');

export async function launchApp(opts: LaunchOptions = {}): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), 'apexcut-e2e-'));
  const outputDir = join(userData, 'out');
  mkdirSync(join(userData, 'data'), { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(userData, 'data', 'settings.json'),
    JSON.stringify({ outputDir, tourSeen: true, theme: 'dark', ...opts.settings }),
  );
  const app = await electron.launch({
    args: [MAIN_ENTRY, ...(opts.args ?? [])],
    env: { ...process.env, APEXCUT_USER_DATA: userData, ...opts.env },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    userData,
    outputDir,
    async close() {
      await app.close().catch(() => undefined);
      rmSync(userData, { recursive: true, force: true });
    },
  };
}

/** the toast (or any status line) that contains `text` */
export function status(page: Page, text: string | RegExp): ReturnType<Page['locator']> {
  return page.locator('[role="status"]', { hasText: text });
}

/**
 * Wait until the editor is calm: the parts are on the timeline, the preview the app starts after a
 * scan is off, the video is paused at 0 and the "Done! Found n fun parts" toast has gone. Every test
 * that looks at the editor (and every screenshot) starts from here.
 */
export async function editorReady(page: Page, timeout = 120_000): Promise<void> {
  await page.locator('[data-part]').first().waitFor({ timeout });
  const preview = page.getByRole('button', { name: 'Preview' });
  if ((await preview.getAttribute('aria-pressed')) === 'true') await preview.click();
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.pause();
    v.currentTime = 0;
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return !!v && v.paused && v.currentTime < 0.2;
  });
  await page
    .locator('[role="status"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
}
