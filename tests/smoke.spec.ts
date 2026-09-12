import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './e2e/app';

/**
 * Smoke: the built app starts with a fresh data folder, shows its window, renders the empty
 * project without renderer errors, and the main process stays alive.
 */
let launched: LaunchedApp;
const rendererErrors: string[] = [];

test.beforeAll(async () => {
  launched = await launchApp();
  launched.page.on('pageerror', (e) => rendererErrors.push(e.message));
  launched.page.on('console', (m) => {
    if (m.type() === 'error') rendererErrors.push(m.text());
  });
});
test.afterAll(async () => launched?.close());

test('opens one window titled ApexCut', async () => {
  const { app, page } = launched;
  expect(app.windows()).toHaveLength(1);
  await expect(page).toHaveTitle(/ApexCut/);
  const visible = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { visible: w.isVisible(), size: w.getSize() };
  });
  expect(visible.visible).toBe(true);
  expect(visible.size[0]).toBeGreaterThanOrEqual(1100);
});

test('shows the title bar and the empty project', async () => {
  const { page } = launched;
  await expect(page.getByRole('heading', { name: 'My rides' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose videos…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Whole memory card…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All projects' })).toBeVisible();
});

test('the bridge is exposed and the data folder is the test folder', async () => {
  const { app, userData } = launched;
  const dataPath = await app.evaluate(({ app: a }) => a.getPath('userData'));
  expect(dataPath.toLowerCase()).toBe(userData.toLowerCase());
  const bridged = await launched.page.evaluate(
    () => typeof (window as unknown as { apexcut?: unknown }).apexcut === 'object',
  );
  expect(bridged).toBe(true);
});

test('no renderer errors during startup', async () => {
  await launched.page.waitForTimeout(1500);
  expect(rendererErrors).toEqual([]);
});
