import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { editorReady, launchApp, type LaunchedApp } from './app';
import { realDjiVideo, stemOf } from './fixtures';

/**
 * Letting the picture vote: the app looks at the recording itself as well as the sensor, which can
 * only add parts. The pass over the proxy is real here — that is the point of the test — so it gets
 * room to run.
 */
const real = realDjiVideo();
test.skip(!real, 'no DJI recording on this machine (set APEXCUT_E2E_VIDEO)');

let launched: LaunchedApp;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  launched = await launchApp({ args: [`--add=${real}`] });
  await editorReady(launched.page);
});
test.afterAll(async () => launched?.close());

test('the picture only ever adds parts, and what it saw is kept for next time', async () => {
  test.setTimeout(300_000);
  const { page, userData } = launched;
  const legend = page.locator('footer b', { hasText: /parts? · movie/ });
  const count = async (): Promise<number> =>
    Number(/^(\d+)/.exec((await legend.innerText()).trim())![1]);
  const before = await count();

  await page.getByRole('button', { name: /Sporty|Custom|Every corner|Only the best/ }).click();
  const box = page.getByRole('checkbox', { name: /Let the picture vote too/ });
  await expect(box).toBeVisible();
  await box.check();
  // the pass over the video runs as a job; the toast at the end says what it changed
  await expect(page.getByText(/The picture votes too/)).toBeVisible({ timeout: 240_000 });
  const after = await count();
  expect(after).toBeGreaterThanOrEqual(before);

  // what it saw is remembered, so switching it off and on again costs nothing
  const seen = join(userData, 'data', 'clips', stemOf(real!), 'picture.json');
  expect(existsSync(seen)).toBe(true);

  await box.uncheck();
  await expect(page.getByText(/Only the motion counts/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(count).toBe(before);
  await page.keyboard.press('Escape');
});
