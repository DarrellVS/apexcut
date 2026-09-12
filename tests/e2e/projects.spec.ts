import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './app';

/**
 * Projects screen and settings: the paths a first-time user takes before any video exists.
 */
let launched: LaunchedApp;
test.beforeAll(async () => {
  launched = await launchApp();
});
test.afterAll(async () => launched?.close());

test('All projects → New project → the empty project of that name', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  // the default project is there and marked open
  await expect(page.getByText('My rides', { exact: true })).toBeVisible();
  await expect(page.getByText('Open', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  const input = page.getByLabel('New project name');
  await expect(input).toBeFocused();
  await input.fill('Eifel Sunday');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Eifel Sunday' })).toBeVisible();
  // the title bar names the project; the two ways to add videos are the only actions
  await expect(page.getByRole('banner').getByText('/ Eifel Sunday')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose videos…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Whole memory card…' })).toBeVisible();
});

test('a duplicate name gets a number; search appears with more than three projects', async () => {
  const { page } = launched;
  await page.getByRole('button', { name: 'All projects' }).click();
  for (const name of ['Eifel Sunday', 'Alps']) {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('New project name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: /Eifel Sunday|Alps/ })).toBeVisible();
    await page.getByRole('button', { name: 'All projects' }).click();
  }
  await expect(page.getByText('Eifel Sunday 2', { exact: true })).toBeVisible();
  const search = page.getByLabel('Search projects');
  await expect(search).toBeVisible();
  await search.fill('alps');
  await expect(page.getByText('Alps', { exact: true })).toBeVisible();
  await expect(page.getByText('My rides', { exact: true })).toBeHidden();
  await search.fill('zzz');
  await expect(page.getByText('No project matches “zzz”.')).toBeVisible();
  await search.fill('');
});

test('settings open with Ctrl+, and close with Escape; the theme switches', async () => {
  const { page } = launched;
  await page.keyboard.press('Control+Comma');
  const dialog = page.getByRole('dialog', { name: /Settings/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Light/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await dialog.getByRole('button', { name: /^Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // every section renders
  for (const label of [
    'Output folder',
    'Storage',
    'Quick tour',
    'Shortcuts',
    'Updates & about',
    'Timeline',
    'How parts are picked',
  ]) {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(dialog.getByRole('heading', { name: label, level: 2 })).toBeVisible();
  }
  // the shortcut list includes the fine seek and Home/End
  await dialog.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await expect(dialog.getByText('1 second back / forward')).toBeVisible();
  await expect(dialog.getByText('Start / end of the video')).toBeVisible();
  // stale words are gone
  await dialog.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(dialog.getByText(/Movie tab/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the projects screen offers Import project… and the cards have a menu', async () => {
  const { page } = launched;
  // the brand button in the title bar leads to the projects screen from anywhere
  await page.getByRole('button', { name: 'ApexCut' }).click();
  await expect(page.getByRole('button', { name: 'Import project…' })).toBeVisible();
  const card = page.getByRole('article').filter({ hasText: 'Alps' });
  await card.hover();
  await card.getByRole('button', { name: /More options for Alps/ }).click();
  await expect(card.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
  await card.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByText(/Archived · 1/)).toBeVisible();
});
