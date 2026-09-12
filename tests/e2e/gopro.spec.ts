import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, type LaunchedApp } from './app';
import { goproVideo, stemOf } from './fixtures';

/**
 * A GoPro recording, end to end: the app reads its `gpmd` track, works the attitude out of the
 * accelerometer and gyroscope (a GoPro before the Hero8 stores none of its own), scores it and puts
 * it on the timeline like any other video. GoPro's own sample is a walk through a car park, so it
 * has numbers but nothing worth keeping — which is exactly the quiet case worth testing.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFPROBE = (require('ffprobe-static') as { path: string }).path;
const gopro = goproVideo();
test.skip(!gopro, 'no GoPro recording on this machine (set APEXCUT_E2E_GOPRO)');

let launched: LaunchedApp;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  launched = await launchApp({ args: [`--add=${gopro}`] });
  const { page } = launched;
  await expect(page.locator(`[data-clip="${stemOf(gopro!)}"]`)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('aside').first()).toContainText('Sharpest lean', { timeout: 120_000 });
});
test.afterAll(async () => launched?.close());

test('the scan finds the camera’s motion data and shows what it made of it', async () => {
  const { page } = launched;
  const rail = page.locator('aside').first();
  // the ride numbers come straight from the fused attitude
  await expect(rail).toContainText(/Sharpest lean · \d+:\d\d\s*\d+°/);
  await expect(rail).toContainText('Hardest braking');
  // the timeline is drawn (ruler, score lane, filmstrip) and the movie line is there
  await expect(page.locator('footer canvas').first()).toBeVisible();
  await expect(page.locator('footer b', { hasText: /parts? · movie/ })).toBeVisible();
});

test('a vertical movie of a GoPro part really exports', async () => {
  test.setTimeout(300_000);
  const { page, outputDir } = launched;
  const panel = page.locator('aside').nth(1);
  await page
    .locator('footer canvas')
    .first()
    .click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('n');
  await expect(page.locator('[data-part]')).toHaveCount(1);
  await page.getByRole('button', { name: /Vertical 9:16/ }).click();
  await page.getByRole('radio', { name: 'Cut', exact: true }).click();
  await page.getByLabel('Name of your movie').fill('e2e-gopro');
  await panel.getByRole('button', { name: 'Make my movie' }).click();
  const dialog = page.getByRole('dialog', { name: /Making your movie/ });
  await expect(dialog.getByText('Your movie is ready')).toBeVisible({ timeout: 240_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  const movies = join(outputDir, 'movies');
  const file = readdirSync(movies).find((f) => f.startsWith('e2e-gopro'));
  expect(file).toBeTruthy();
  const probe = JSON.parse(
    execFileSync(FFPROBE, [
      '-v',
      'error',
      '-show_streams',
      '-print_format',
      'json',
      join(movies, file!),
    ]).toString(),
  ) as { streams: { codec_type: string; width?: number; height?: number }[] };
  const video = probe.streams.find((s) => s.codec_type === 'video')!;
  // the 16:9 recording is cropped to a tall strip of itself, never scaled up
  expect(video.height).toBe(480);
  expect(video.width).toBe(270);
  await page.getByRole('button', { name: 'Square' }).click();
  await page.keyboard.press('Control+z');
});

test('a part can be made by hand on a GoPro video, and it plays', async () => {
  const { page } = launched;
  const blocks = page.locator('[data-part]');
  const before = await blocks.count();
  await page
    .locator('footer canvas')
    .first()
    .click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('n');
  await expect(blocks).toHaveCount(before + 1);
  await blocks.first().click();
  await expect(blocks.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('footer b', { hasText: /parts? · movie/ })).not.toContainText(
    '0 parts',
  );
  await page.keyboard.press('Control+z');
  await expect(blocks).toHaveCount(before);
});
