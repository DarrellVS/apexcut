import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './app';
import { gestureVideo } from './fixtures';

/**
 * "Keep the bits I pointed at": the rider holds two fingers up to the camera while riding, and that
 * spot is kept. This drives the real thing on a real recording — the pass over the video, the parts
 * it makes, and how loudly they show on the timeline.
 */
const clip = gestureVideo();
test.skip(!clip, 'no recording with a gesture on this machine (set APEXCUT_E2E_GESTURE)');

let launched: LaunchedApp;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  launched = await launchApp({ args: [`--add=${clip}`] });
  await launched.page
    .locator('aside')
    .first()
    .getByText('Sharpest lean')
    .waitFor({ timeout: 120_000 });
});
test.afterAll(async () => launched?.close());

test('the marks become parts that shout, and switching it off takes them away', async () => {
  test.setTimeout(300_000);
  const { page } = launched;
  const blocks = page.locator('[data-part]');
  const marked = page.locator('[data-part][aria-label^="You marked this"]');
  const flags = page.locator('[data-mark-flag]');
  const before = await blocks.count();

  await page.getByRole('button', { name: /Sporty|Custom|Relaxed|Track/ }).click();
  const box = page.getByRole('checkbox', { name: /Keep the bits I pointed at/ });
  await box.check();
  await expect(page.getByText(/marks? found/)).toBeVisible({ timeout: 240_000 });
  await page.keyboard.press('Escape');

  // every gesture in the recording is a part of its own, with a flag at the moment itself
  await expect(marked).not.toHaveCount(0);
  await expect(flags).toHaveCount(await marked.count());
  await expect(page.locator('footer')).toContainText('your own marks');
  // the part keeps what came before the hand went up
  const label = await marked.first().getAttribute('aria-label');
  expect(label).toMatch(/You marked this, \d+:\d\d to \d+:\d\d/);

  // and they are in the movie without being asked for
  await marked.first().click();
  await expect(page.getByRole('banner')).toContainText('You marked this');
  await expect(page.getByRole('banner')).toContainText('you marked it at');

  await page.getByRole('button', { name: /Sporty|Custom|Relaxed|Track/ }).click();
  await box.uncheck();
  await expect(marked).toHaveCount(0, { timeout: 60_000 });
  await expect(flags).toHaveCount(0);
  await expect.poll(async () => blocks.count()).toBe(before);
  await page.keyboard.press('Escape');
});
