import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { launchApp, status, type LaunchedApp } from './app';
import { bigDjiVideos, realDjiVideo, stemOf } from './fixtures';

/**
 * The editor with a real (small) DJI recording: scan → parts on the timeline → keyboard, panels,
 * the movie name. Skipped when no recording is available on this machine.
 */
test.describe('editor with a scanned video', () => {
  const real = realDjiVideo();
  test.skip(!real, 'no DJI recording on this machine (set APEXCUT_E2E_VIDEO)');
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    launched = await launchApp({ args: [`--add=${real}`] });
    const { page } = launched;
    // the scan takes the screen and can be stopped; then the editor opens with parts
    await expect(page.locator('[data-part]').first()).toBeVisible({ timeout: 90_000 });
  });
  test.afterAll(async () => launched?.close());

  test('the ride rail lists the video with its parts; the title bar sums the movie up', async () => {
    const { page } = launched;
    const row = page.locator(`[data-clip="${stemOf(real!)}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByText(/\d+ · \d+ sec|\d+ · \d+:\d\d min/)).toBeVisible();
    await expect(
      page.getByText(/\d+ parts? · \d+ sec|\d+ parts? · \d+:\d\d min/).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make my movie' }).first()).toBeEnabled();
    // the project menu in the title bar: rename, ride card (enabled now), export
    await page.getByRole('banner').getByRole('button', { name: 'My rides' }).click();
    await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make ride card' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Export project…' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Rename' })).toBeHidden();
  });

  test('Space on a focused block toggles the part without starting playback', async () => {
    const { page } = launched;
    const block = page.locator('[data-part]').first();
    await block.focus();
    const before = (await block.getAttribute('aria-label')) ?? '';
    await page.keyboard.press('Space');
    await expect(block).toHaveAttribute('aria-label', /left out/);
    const paused = await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused);
    expect(paused).toBe(true);
    await page.keyboard.press('Space');
    await expect(block).toHaveAttribute('aria-label', before);
    // Delete on the block removes it once, one undo brings it back
    const n = await page.locator('[data-part]').count();
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-part]')).toHaveCount(n - 1);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-part]')).toHaveCount(n);
    // three edits (two toggles, one delete undone) — the toggles are still there to undo
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  test('Shift+arrows seek by one second, Home goes to the start', async () => {
    const { page } = launched;
    await page.locator('.strip').click({ position: { x: 5, y: 5 }, force: true });
    const time = (): Promise<number> =>
      page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.keyboard.press('Home');
    await expect.poll(time).toBeLessThan(0.2);
    await page.keyboard.press('ArrowRight');
    await expect.poll(time).toBeGreaterThan(4.5);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(time).toBeGreaterThan(5.5);
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(time).toBeLessThan(5.5);
  });

  test('a side panel cannot squash the stage; double-click resets it', async () => {
    const { page } = launched;
    const splitter = page.locator('.splitter').first();
    const box = (await splitter.boundingBox())!;
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 900, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const widths = await page.evaluate(() => ({
      win: window.innerWidth,
      ride: document.querySelector('aside')!.getBoundingClientRect().width,
      movie: document.querySelectorAll('aside')[1].getBoundingClientRect().width,
      stage: document.querySelector('section.relative.grid')!.getBoundingClientRect().width,
    }));
    expect(widths.stage).toBeGreaterThanOrEqual(400);
    expect(widths.ride).toBeLessThanOrEqual(520);
    // a 1 px hairline: skip the hit-target check
    await splitter.dblclick({ force: true });
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('aside')!.getBoundingClientRect().width),
      )
      .toBe(300);
  });

  test('an empty movie name falls back to "my-ride" instead of an error card', async () => {
    const { page } = launched;
    const name = page.getByLabel('Name of your movie');
    await name.fill('');
    await page.locator('aside').nth(1).getByRole('button', { name: 'Make my movie' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(name).toHaveValue('my-ride');
    const overlay = page.getByRole('dialog', { name: /Making your movie/ });
    await expect(overlay).toBeVisible();
    // stop it: Esc asks first, then Stop
    await page.keyboard.press('Escape');
    const stop = overlay.getByRole('button', { name: 'Stop', exact: true });
    if (await stop.isVisible()) {
      await stop.click();
      await expect(overlay.getByText('Export stopped')).toBeVisible({ timeout: 20_000 });
    } else {
      // it was already done: the result card shows
      await expect(overlay.getByText(/Your movie is ready/)).toBeVisible({ timeout: 60_000 });
    }
    // the card stays until it is dismissed; the next test needs the panel back
    await overlay
      .getByRole('button', { name: /^(Close|Done)$/ })
      .last()
      .click();
    await expect(overlay).toBeHidden();
  });

  test('the format and the crop belong to the project, not to the app', async () => {
    const { page } = launched;
    const activeFormat = (): Promise<{ format: string | null; framePos: number | null }> =>
      page.evaluate(async () => {
        const bridge = (window as unknown as { apexcut: Record<string, never> })
          .apexcut as unknown as {
          projects: {
            list(): Promise<{ id: string; format: string | null; framePos: number | null }[]>;
            active(): Promise<string>;
          };
        };
        const [list, id] = await Promise.all([bridge.projects.list(), bridge.projects.active()]);
        const p = list.find((x) => x.id === id)!;
        return { format: p.format, framePos: p.framePos };
      });

    await page.getByRole('button', { name: 'Vertical 9:16' }).click();
    await expect.poll(async () => (await activeFormat()).format).toBe('9x16');
    // the crop frame is on the video and dragging it writes once, to the project
    const frame = page.locator('.cursor-ew-resize').first();
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await activeFormat()).framePos ?? 0.5).toBeLessThan(0.5);

    await page.getByRole('button', { name: 'Widescreen 16:9' }).click();
    await expect.poll(async () => (await activeFormat()).format).toBe('16x9');
  });

  test('“Make ride card” shows the picture it made', async () => {
    const { page } = launched;
    await page.getByRole('banner').getByRole('button', { name: 'My rides' }).click();
    await page.getByRole('button', { name: 'Make ride card' }).click();
    const sheet = page.getByRole('dialog', { name: 'Your ride card' });
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(sheet.getByRole('img', { name: 'Ride card' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Open folder' })).toBeVisible();
    await expect(sheet.getByText(/ride card\.png/i)).toBeVisible();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
  });

  test('the scoring knobs read as plain words with the technical name behind them', async () => {
    const { page } = launched;
    await page.keyboard.press('Control+Comma');
    const dialog = page.getByRole('dialog', { name: /Settings/ });
    await dialog.getByRole('button', { name: 'How parts are picked', exact: true }).click();
    await expect(dialog.getByText('What makes a moment fun')).toBeVisible();
    await expect(dialog.getByText('Fun enough from')).toBeVisible();
    await expect(dialog.getByText(/percentile of the score/)).toBeVisible();
    await expect(dialog.getByText('Open a scanned video first.')).toHaveCount(0);
    // a change is applied only on demand
    const apply = dialog.getByRole('button', { name: 'Try it on this video' });
    await expect(apply).toBeDisabled();
    await dialog.getByLabel('Shortest part').first().fill('6');
    await page.keyboard.press('Tab'); // the number field writes on change
    await expect(apply).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('a long scan can be stopped', () => {
  // several large recordings keep the scan busy long enough to press Stop
  const big = bigDjiVideos();
  test.skip(!big.length, 'set APEXCUT_E2E_BIG_VIDEO to one or more large DJI recordings (;)');
  let launched: LaunchedApp;
  test.beforeAll(async () => {
    launched = await launchApp({ args: big.map((f) => `--add=${f}`) });
  });
  test.afterAll(async () => launched?.close());

  test('Stop scanning ends the job and the row stays "not scanned"', async () => {
    const { page } = launched;
    await expect(page.getByRole('heading', { name: 'Scanning your ride' })).toBeVisible();
    // the list above the button grows while videos tick off: skip the stability wait
    await page.getByRole('button', { name: 'Stop scanning' }).click({ force: true });
    await expect(status(page, /Scan stopped/)).toBeVisible({ timeout: 60_000 });
    // at least the last video never got its scan
    await expect(
      page.locator(`[data-clip="${stemOf(big[big.length - 1])}"]`).getByText('not scanned'),
    ).toBeVisible();
    // back in the editor (not the scan screen), whatever got scanned before Stop
    await expect(page.getByRole('heading', { name: 'Scanning your ride' })).toHaveCount(0);
    expect(existsSync(launched.outputDir)).toBe(true);
  });
});
