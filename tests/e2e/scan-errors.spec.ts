import { expect, test } from '@playwright/test';
import { launchApp, status, type LaunchedApp } from './app';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corruptMp4, plainMp4, realDjiVideo, stemOf } from './fixtures';

/**
 * Edge cases of the scan: a video without DJI motion data and a file that is not a video at all.
 * The app must say so in plain words, mark the rows, keep the other videos, and offer a way on.
 */
test.describe('unreadable videos', () => {
  let launched: LaunchedApp;
  const plain = plainMp4();
  const corrupt = corruptMp4();

  test.beforeAll(async () => {
    launched = await launchApp({ args: [`--add=${plain}`, `--add=${corrupt}`] });
  });
  test.afterAll(async () => launched?.close());

  test('both rows say "scan failed" with the reason as tooltip; no error card', async () => {
    const { page } = launched;
    const plainRow = page.locator(`[data-clip="${stemOf(plain)}"]`);
    const corruptRow = page.locator(`[data-clip="${stemOf(corrupt)}"]`);
    await expect(plainRow.getByText('scan failed')).toBeVisible({ timeout: 45_000 });
    await expect(corruptRow.getByText('scan failed')).toBeVisible();
    await expect(plainRow.getByText('scan failed')).toHaveAttribute(
      'title',
      /This video has no motion data|could not be read as a video/,
    );
    await expect(corruptRow.getByText('scan failed')).toHaveAttribute(
      'title',
      /could not be read as a video|no motion data/,
    );
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('the stage explains and offers Scan again for the picked video', async () => {
    const { page } = launched;
    const notice = page.locator('[data-stage-notice]');
    await expect(notice).toContainText('No scanned video yet');
    await page.locator(`[data-clip="${stemOf(plain)}"]`).click();
    await expect(notice).toContainText(/no motion data|could not be read/);
    await expect(notice.getByRole('button', { name: 'Scan again' })).toBeVisible();
    // the primary action stays disabled: there is nothing to make yet
    await expect(page.getByRole('button', { name: 'Make my movie' }).first()).toBeDisabled();
  });
});

test.describe('one bad video among good ones', () => {
  const real = realDjiVideo();
  test.skip(!real, 'no DJI recording on this machine (set APEXCUT_E2E_VIDEO)');
  let launched: LaunchedApp;
  const plain = plainMp4('other_camera');

  test.beforeAll(async () => {
    launched = await launchApp({ args: [`--add=${plain}`, `--add=${real}`] });
  });
  test.afterAll(async () => launched?.close());

  test('the good video is scanned and opened, the bad one is marked, one toast sums it up', async () => {
    const { page } = launched;
    await expect(status(page, /could not be scanned/)).toBeVisible({ timeout: 90_000 });
    const good = page.locator(`[data-clip="${stemOf(real!)}"]`);
    const bad = page.locator(`[data-clip="${stemOf(plain)}"]`);
    await expect(bad.getByText('scan failed')).toBeVisible();
    await expect(good.getByText('scan failed')).toHaveCount(0);
    // the editor shows the good one: a real video on the stage, no notice
    await expect(page.locator('[data-stage-notice]')).toHaveCount(0);
    await expect(page.locator('video')).toHaveAttribute('src', /apexcut:\/\/media\/proxy/);
  });

  test('clicking the failed row clears the stage instead of keeping the other video', async () => {
    const { page } = launched;
    await page.locator(`[data-clip="${stemOf(plain)}"]`).click();
    await expect(page.locator('[data-stage-notice]')).toContainText(/no motion data/);
    await expect(page.locator('video')).not.toHaveAttribute('src', /.+/);
    // and back
    await page.locator(`[data-clip="${stemOf(real!)}"]`).click();
    await expect(page.locator('[data-stage-notice]')).toHaveCount(0);
    await expect(page.locator('video')).toHaveAttribute('src', /apexcut:\/\/media\/proxy/);
  });
});

test.describe('a whole memory card', () => {
  // the camera writes to DCIM/100MEDIA: picking the card root must still find the videos
  const card = mkdtempSync(join(tmpdir(), 'apexcut-card-'));
  const media = join(card, 'DCIM', '100MEDIA');
  mkdirSync(media, { recursive: true });
  mkdirSync(join(card, 'MISC'), { recursive: true });
  copyFileSync(plainMp4(), join(media, 'DJI_20260912120000_0001_D.MP4'));
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    launched = await launchApp({ args: [`--add=${card}`] });
  });
  test.afterAll(async () => launched?.close());

  test('the video two folders deep is found and listed', async () => {
    const { page } = launched;
    await expect(page.locator('[data-clip="DJI_20260912120000_0001_D"]')).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText('1 video', { exact: true })).toBeVisible();
  });
});
