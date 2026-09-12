import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { editorReady, launchApp, type LaunchedApp } from './app';
import { realDjiVideo } from './fixtures';

/**
 * The Movie panel end to end: the colours (looks, fine-tune, a part with its own), the telemetry
 * overlay, and one real export through ffmpeg — square with plain cuts, which is a stream copy, so
 * the test stays quick while still running the whole export path (job, progress, result, file).
 */
const real = realDjiVideo();
test.skip(!real, 'no DJI recording on this machine (set APEXCUT_E2E_VIDEO)');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFPROBE = (require('ffprobe-static') as { path: string }).path;

let launched: LaunchedApp;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  launched = await launchApp({ args: [`--add=${real}`] });
  await editorReady(launched.page);
});
test.afterAll(async () => launched?.close());

/** the colours the open project is saved with */
function movieGrade(): Promise<Record<string, number> | null> {
  return launched.page.evaluate(async () => {
    const bridge = (window as unknown as { apexcut: unknown }).apexcut as {
      projects: {
        list(): Promise<{ id: string; grade: Record<string, number> | null }[]>;
        active(): Promise<string>;
      };
    };
    const [list, id] = await Promise.all([bridge.projects.list(), bridge.projects.active()]);
    return list.find((p) => p.id === id)?.grade ?? null;
  });
}

test('a look colours the picture and is remembered on the project', async () => {
  const { page } = launched;
  expect(await movieGrade()).toBeNull();
  await page.getByRole('radio', { name: 'Moody' }).click();
  await expect(page.getByRole('radio', { name: 'Moody' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Colours on')).toBeVisible();
  await expect.poll(async () => (await movieGrade())?.saturation).toBeLessThan(0);
  // the live filter is the same maths as the export
  const filter = await page.locator('video').evaluate((v) => getComputedStyle(v).filter);
  expect(filter).toContain('apexcut-grade-live');
});

test('a fine-tune slider makes it “your own mix”, Reset puts it back', async () => {
  const { page } = launched;
  await page.getByRole('group').filter({ hasText: 'Fine-tune' }).locator('summary').click();
  const brightness = page.getByRole('slider', { name: 'Brightness' });
  await brightness.fill('0.4');
  await brightness.dispatchEvent('change');
  await expect(page.getByText('Your own mix')).toBeVisible();
  await expect.poll(async () => (await movieGrade())?.exposure).toBeCloseTo(0.4, 2);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('Colours on')).toBeHidden();
  await expect.poll(movieGrade).toBeNull();
});

test('one part can have its own colours', async () => {
  const { page } = launched;
  await page.locator('[data-part]').first().click();
  const own = page.getByRole('checkbox', { name: /Own colours for this part/ });
  await own.check();
  await expect(page.getByText('Colour · this part')).toBeVisible();
  // the part carries a mark on the timeline and in the rail
  await expect(page.locator('[data-part][aria-pressed="true"] svg').first()).toBeVisible();
  await own.uncheck();
  await expect(page.getByText('Colour · the movie')).toBeVisible();
});

test('the telemetry overlay draws on the picture and is remembered', async () => {
  const { page } = launched;
  const overlay = (): Promise<unknown> =>
    page.evaluate(async () => {
      const bridge = (window as unknown as { apexcut: unknown }).apexcut as {
        projects: {
          list(): Promise<{ id: string; overlay: unknown }[]>;
          active(): Promise<string>;
        };
      };
      const [list, id] = await Promise.all([bridge.projects.list(), bridge.projects.active()]);
      return list.find((p) => p.id === id)?.overlay ?? null;
    });
  await page.getByRole('radio', { name: 'Lean angle' }).click();
  await expect(page.locator('section canvas')).toBeVisible();
  await expect.poll(overlay).toMatchObject({ style: 'minimal' });
  await page.getByLabel('Corner of the overlay').selectOption('top-right');
  await expect.poll(overlay).toMatchObject({ corner: 'top-right' });
  await page.locator('aside').nth(1).getByRole('radio', { name: 'Off' }).click();
  await expect.poll(overlay).toBeNull();
  await expect(page.locator('section canvas')).toHaveCount(0);
});

test('Compare puts the recording next to the colours and drags', async () => {
  const { page } = launched;
  // no colours, nothing to compare
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Punchy' }).click();
  const compare = page.getByRole('button', { name: 'Compare' });
  await expect(compare).toBeVisible();
  await compare.click();
  const plain = page.locator('section video').nth(1);
  await expect(plain).toBeVisible();
  const before = await plain.evaluate((v) => getComputedStyle(v).clipPath);
  // drag the divider to the left: more of the graded picture shows
  const line = page.locator('.cursor-ew-resize').first();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => plain.evaluate((v) => getComputedStyle(v).clipPath)).not.toBe(before);
  await compare.click();
  await expect(page.locator('section video')).toHaveCount(1);
  // back to as recorded
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
});

test('the same loudness for every movie is off unless you ask for it', async () => {
  const { page } = launched;
  const loudness = (): Promise<boolean> =>
    page.evaluate(async () => {
      const bridge = (window as unknown as { apexcut: unknown }).apexcut as {
        projects: {
          list(): Promise<{ id: string; loudness: boolean }[]>;
          active(): Promise<string>;
        };
      };
      const [list, id] = await Promise.all([bridge.projects.list(), bridge.projects.active()]);
      return !!list.find((p) => p.id === id)?.loudness;
    });
  expect(await loudness()).toBe(false);
  const box = page.getByRole('checkbox', { name: /Same loudness/ });
  await box.check();
  await expect.poll(loudness).toBe(true);
  await box.uncheck();
  await expect.poll(loudness).toBe(false);
});

test('“Made for” sets the shape and the sound in one click', async () => {
  const { page } = launched;
  const setup = (): Promise<{ format: string | null; loudness: boolean }> =>
    page.evaluate(async () => {
      const bridge = (window as unknown as { apexcut: unknown }).apexcut as {
        projects: {
          list(): Promise<{ id: string; format: string | null; loudness: boolean }[]>;
          active(): Promise<string>;
        };
      };
      const [list, id] = await Promise.all([bridge.projects.list(), bridge.projects.active()]);
      const p = list.find((x) => x.id === id)!;
      return { format: p.format, loudness: !!p.loudness };
    });
  // folded away until you want it
  const summary = page.getByText('Made for', { exact: false }).first();
  await expect(page.getByRole('button', { name: /Reels, Shorts, TikTok/ })).toBeHidden();
  await summary.click();
  await page.getByRole('button', { name: /Reels, Shorts, TikTok/ }).click();
  await expect.poll(setup).toEqual({ format: '9x16', loudness: true });
  await page.getByRole('button', { name: /YouTube/ }).click();
  await expect.poll(setup).toEqual({ format: '16x9', loudness: true });
  await page.getByRole('button', { name: /Keep it as recorded/ }).click();
  await expect.poll(setup).toEqual({ format: 'original', loudness: false });
  await summary.click();
});

test('making the movie writes a real file', async () => {
  test.setTimeout(300_000);
  const { page, outputDir } = launched;
  const panel = page.locator('aside').nth(1);
  // one starred part, square, plain cuts: the export is a stream copy of a few seconds
  await page.locator('[data-part]').first().click();
  await page.locator('footer').getByRole('button', { name: 'Star', exact: true }).click();
  await panel.getByRole('checkbox', { name: /Starred only/ }).check();
  await page.getByRole('button', { name: 'Square' }).click();
  await page.getByRole('radio', { name: 'Cut', exact: true }).click();
  await page.getByRole('checkbox', { name: /Same loudness/ }).check();
  await page.getByLabel('Name of your movie').fill('e2e-movie');
  await panel.getByRole('button', { name: 'Make my movie' }).click();

  const dialog = page.getByRole('dialog', { name: /Making your movie/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Your movie is ready')).toBeVisible({ timeout: 240_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();

  const movies = join(outputDir, 'movies');
  const files = readdirSync(movies).filter((f) => f.startsWith('e2e-movie') && f.endsWith('.mp4'));
  expect(files).toHaveLength(1);
  const file = join(movies, files[0]);
  expect(existsSync(file)).toBe(true);
  const probe = JSON.parse(
    execFileSync(FFPROBE, [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-print_format',
      'json',
      file,
    ]).toString(),
  ) as { format: { duration: string }; streams: { codec_type: string; width?: number }[] };
  const video = probe.streams.find((s) => s.codec_type === 'video')!;
  // the loudness pass wrote the sound again, so the movie still has audio
  expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  // square keeps the source resolution and is never downscaled
  expect(video.width).toBeGreaterThanOrEqual(720);
  expect(Number(probe.format.duration)).toBeGreaterThan(2);
  // and the panel offers the way on
  await expect(panel.getByRole('button', { name: 'Watch' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open folder' })).toBeVisible();
});
