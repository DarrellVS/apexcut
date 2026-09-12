import { expect, test, type Page } from '@playwright/test';
import { editorReady, launchApp, type LaunchedApp } from './app';
import { realDjiVideo } from './fixtures';

/**
 * The visual freeze: pixel comparisons of the screens, panels and popovers that carry the design.
 * Anything whose pixels are not ours — the video frame, the filmstrip, thumbnails — is masked, so a
 * different recording or a decoder that is one frame ahead cannot make a test red. Snapshots live in
 * `tests/e2e/snapshots/` and are made on the machine that runs them (`--update-snapshots` on a first
 * run); they are the reference a refactor must not move.
 */
const SIZE = { width: 1400, height: 900 };

/**
 * Hide what is video rather than interface — the player, the filmstrip behind the parts lane and the
 * thumbnails — without moving a single pixel of the layout (`visibility`, not `display`). Masking
 * them would paint a block over the parts lane and hide the blocks we came to compare. The ruler and
 * the score lane stay: they are drawn from the scan and belong in the freeze.
 */
async function hideMedia(page: Page): Promise<void> {
  await page.addStyleTag({
    content: 'video, canvas.strip, img { visibility: hidden !important; }',
  });
}

test.describe('screens without a video', () => {
  let launched: LaunchedApp;
  test.beforeAll(async () => {
    launched = await launchApp();
    await launched.page.setViewportSize(SIZE);
    await hideMedia(launched.page);
  });
  test.afterAll(async () => launched?.close());

  test('the empty project', async () => {
    const { page } = launched;
    await expect(page.getByRole('heading', { name: 'My rides' })).toBeVisible();
    await expect(page).toHaveScreenshot('empty-project.png');
  });

  test('the projects screen', async () => {
    const { page } = launched;
    await page.getByRole('button', { name: 'All projects' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page).toHaveScreenshot('projects.png');
  });

  test('settings, both themes', async () => {
    const { page } = launched;
    await page.keyboard.press('Control+Comma');
    const dialog = page.getByRole('dialog', { name: /Settings/ });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveScreenshot('settings-appearance-dark.png');
    await dialog.getByRole('button', { name: /^Light/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page).toHaveScreenshot('settings-appearance-light.png');
    await dialog.getByRole('button', { name: /^Dark/ }).click();
    await dialog.getByRole('button', { name: 'Shortcuts', exact: true }).click();
    await expect(page).toHaveScreenshot('settings-shortcuts.png');
    await dialog.getByRole('button', { name: 'Storage', exact: true }).click();
    // the sizes on this page depend on the machine: only the frame is compared
    await expect(dialog.locator('nav')).toHaveScreenshot('settings-nav.png');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('the editor', () => {
  const real = realDjiVideo();
  test.skip(!real, 'no DJI recording on this machine (set APEXCUT_E2E_VIDEO)');
  let launched: LaunchedApp;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    launched = await launchApp({ args: [`--add=${real}`] });
    await launched.page.setViewportSize(SIZE);
    await editorReady(launched.page);
    await hideMedia(launched.page);
  });
  test.afterAll(async () => launched?.close());

  test('the whole window, dark and light', async () => {
    const { page } = launched;
    await expect(page).toHaveScreenshot('editor-dark.png');
    await page.keyboard.press('Control+Comma');
    const dialog = page.getByRole('dialog', { name: /Settings/ });
    await dialog.getByRole('button', { name: /^Light/ }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveScreenshot('editor-light.png');
    await page.keyboard.press('Control+Comma');
    await dialog.getByRole('button', { name: /^Dark/ }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the panels', async () => {
    const { page } = launched;
    await expect(page.locator('aside').first()).toHaveScreenshot('ride-rail.png');
    await expect(page.locator('aside').nth(1)).toHaveScreenshot('movie-panel.png');
    await expect(page.locator('footer')).toHaveScreenshot('timeline.png');
  });

  test('a selected part with its toolbar', async () => {
    const { page } = launched;
    await page.locator('[data-part]').first().click();
    await expect(page.locator('footer')).toHaveScreenshot('timeline-selected.png');
    await page.keyboard.press('Escape');
  });

  test('the popovers', async () => {
    const { page } = launched;
    await page.getByRole('button', { name: 'Sporty' }).click();
    await expect(page.locator('.popover').first()).toHaveScreenshot('picky-popover.png');
    await page.keyboard.press('Escape');
    await page.getByRole('banner').getByRole('button', { name: 'My rides' }).click();
    await expect(page.locator('.popover').first()).toHaveScreenshot('project-menu.png');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More export options' }).click();
    await expect(page.locator('.popover').first()).toHaveScreenshot('make-menu.png');
    await page.keyboard.press('Escape');
  });

  test('the colour section, folded out', async () => {
    const { page } = launched;
    const panel = page.locator('aside').nth(1);
    await page.getByRole('group').filter({ hasText: 'Fine-tune' }).locator('summary').click();
    await expect(panel.locator('section[data-keep-selection]')).toHaveScreenshot('colour.png');
    await page.getByRole('group').filter({ hasText: 'Fine-tune' }).locator('summary').click();
  });
});
