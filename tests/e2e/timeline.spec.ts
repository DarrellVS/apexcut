import { expect, test, type Page } from '@playwright/test';
import { editorReady, launchApp, type LaunchedApp } from './app';
import { realDjiVideo, stemOf } from './fixtures';

/**
 * Everything you do to a part: select it, leave it out, star it, join it with the next one, drag an
 * edge, delete it, and the zoom of the lane. The legend line under the timeline is the shortest
 * proof that a change landed in the movie, so most assertions read it.
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

/** "12 parts · movie 4:31 min" → { parts: 12, movie: "4:31 min" } */
async function legend(page: Page): Promise<{ parts: number; movie: string }> {
  const text = (await page.locator('footer b', { hasText: /parts? · movie/ }).innerText()).trim();
  const m = /^(\d+) parts? · movie (.+)$/.exec(text)!;
  return { parts: Number(m[1]), movie: m[2] };
}

test('a block selects, shows its toolbar and its story in the title bar', async () => {
  const { page } = launched;
  const block = page.locator('[data-part]').first();
  await block.click();
  await expect(block).toHaveAttribute('aria-pressed', 'true');
  // the chip toolbar sits in the timeline; "Play" also exists on the stage transport
  const toolbar = page.locator('footer');
  for (const name of ['Play', 'Leave out', 'Star', 'Delete']) {
    await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // the title bar centre reads the selected part
  await expect(page.getByRole('banner')).toContainText(/Corners|Braking|Joined|Added by you/);
});

test('leaving a part out shortens the movie, putting it back restores it', async () => {
  const { page } = launched;
  const before = await legend(page);
  await page.locator('[data-part]').first().click();
  await page.getByRole('button', { name: 'Leave out', exact: true }).click();
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts - 1);
  await page.getByRole('button', { name: 'Put back in', exact: true }).click();
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts);
  await expect.poll(async () => (await legend(page)).movie).toBe(before.movie);
});

test('starring a part marks it and offers “starred only” in the movie panel', async () => {
  const { page } = launched;
  const block = page.locator('[data-part]').first();
  await block.click();
  await page.getByRole('button', { name: 'Star', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Starred only/ })).toBeVisible();
  await page.getByRole('button', { name: 'Unstar', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Starred only/ })).toBeHidden();
});

test('join with next makes one part of two, undo brings both back', async () => {
  const { page } = launched;
  const before = await legend(page);
  await page.locator('[data-part]').first().click();
  await page.getByRole('button', { name: 'Join with next' }).click();
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts - 1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts);
});

test('dragging the right edge makes the part longer', async () => {
  const { page } = launched;
  const block = page.locator('[data-part]').first();
  await block.click();
  const before = (await block.boundingBox())!;
  // the last 10 px of the block are the edge grip
  await page.mouse.move(before.x + before.width - 4, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width + 60, before.y + before.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await block.boundingBox())!.width).toBeGreaterThan(before.width);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => Math.round((await block.boundingBox())!.width))
    .toBe(Math.round(before.width));
});

test('the zoom slider narrows the lane and Fit brings the whole ride back', async () => {
  const { page } = launched;
  const zoom = page.locator('footer input[type="range"][aria-label="Zoom"]');
  const ruler = page.locator('footer canvas').first();
  const wide = (await page.locator('[data-part]').first().boundingBox())!.width;
  await zoom.fill('0.8');
  await expect
    .poll(async () => (await page.locator('[data-part]').first().boundingBox())!.width)
    .toBeGreaterThan(wide);
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect
    .poll(async () => Math.round((await page.locator('[data-part]').first().boundingBox())!.width))
    .toBe(Math.round(wide));
  await expect(ruler).toBeVisible();
});

test('a part in the ride rail selects the same part on the timeline', async () => {
  const { page } = launched;
  const row = page.locator(`[data-clip="${stemOf(real!)}"]`);
  await row.getByRole('button', { name: /Unfold parts|Fold parts/ }).click();
  const partRow = page.locator('aside [data-keep-selection]').first();
  await partRow.click();
  await expect(page.locator('[data-part][aria-pressed="true"]')).toHaveCount(1);
  // and its checkbox leaves the part out of the movie
  const before = await legend(page);
  await partRow.getByRole('checkbox').uncheck();
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts - 1);
  await partRow.getByRole('checkbox').check();
  await expect.poll(async () => (await legend(page)).parts).toBe(before.parts);
});

test('delete removes a part and undo brings it back', async () => {
  const { page } = launched;
  const blocks = page.locator('[data-part]');
  const before = await blocks.count();
  await blocks.first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(blocks).toHaveCount(before - 1);
  await page.keyboard.press('Control+z');
  await expect(blocks).toHaveCount(before);
});

test('the movie lane shows every part back to back and plays the one you click', async () => {
  const { page } = launched;
  await page.getByRole('radio', { name: 'The movie' }).click();
  const blocks = page.locator('[data-movie-part]');
  await expect.poll(async () => blocks.count()).toBe((await legend(page)).parts);
  // the lane runs in movie time, so the blocks sit left to right without a gap
  const boxes = await blocks.evaluateAll((els) =>
    els.map((e) => ({
      left: (e as HTMLElement).offsetLeft,
      width: (e as HTMLElement).offsetWidth,
    })),
  );
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i].left - (boxes[i - 1].left + boxes[i - 1].width))).toBeLessThan(2);
  }
  // the score lane and its zoom belong to the video, not to the movie
  await expect(page.locator('footer')).toContainText('Drag a part to move it in the movie');
  await expect(page.locator('footer input[aria-label="Zoom"]')).toBeHidden();
  // clicking a block opens that part: the title bar reads it, and the parts lane has it selected
  await blocks.nth(1).click();
  await expect(page.getByRole('banner')).toContainText(/Corners|Braking|Joined|Added by you/);
  await expect(page.locator('[data-movie-part][aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'This video' }).click();
});

test('dragging a part in the movie lane changes the order the movie plays in', async () => {
  const { page } = launched;
  await page.getByRole('radio', { name: 'The movie' }).click();
  const blocks = page.locator('[data-movie-part]');
  const keys = async (): Promise<string[]> =>
    blocks.evaluateAll((els) => els.map((e) => e.getAttribute('data-movie-part')!));
  const before = await keys();
  test.skip(before.length < 3, 'needs three parts to reorder');
  // the third part moves in front of the first
  await blocks.nth(2).dragTo(blocks.nth(0), { targetPosition: { x: 4, y: 8 } });
  await expect.poll(keys).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
  await expect(page.locator('footer')).toContainText('Your own order');
  // the movie is the same length, only the order changed
  await expect.poll(async () => (await legend(page)).parts).toBe(before.length);
  await page.locator('footer').getByRole('button', { name: 'Reset' }).click();
  await expect.poll(keys).toEqual(before);
  await expect(page.locator('footer')).not.toContainText('Your own order');
  await page.getByRole('radio', { name: 'This video' }).click();
});
