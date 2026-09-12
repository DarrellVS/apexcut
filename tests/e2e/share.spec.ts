import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './app';

/**
 * Handing a movie to a phone: the app serves one file on the local network behind a long random
 * address. The phone is a plain HTTP request here — the page, the video with its byte ranges, a
 * wrong address, and everything gone again once sharing stops.
 */
let launched: LaunchedApp;
test.beforeAll(async () => {
  launched = await launchApp();
});
test.afterAll(async () => launched?.close());

/** make a file in the app's own movies folder, the only place a share may serve from */
async function fakeMovie(name: string, body: string): Promise<string> {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(launched.outputDir, 'movies');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
}

const share = (file: string): Promise<{ url: string; name: string; until: number }> =>
  launched.page.evaluate(
    (f) =>
      (
        window as unknown as {
          apexcut: {
            share: { start(file: string): Promise<{ url: string; name: string; until: number }> };
          };
        }
      ).apexcut.share.start(f),
    file,
  );
const stopSharing = (): Promise<void> =>
  launched.page.evaluate(() =>
    (window as unknown as { apexcut: { share: { stop(): Promise<void> } } }).apexcut.share.stop(),
  );

test('the movie is served on the local network, in pieces when asked', async () => {
  const body = 'a'.repeat(5000);
  const file = await fakeMovie('shared-movie.mp4', body);
  const state = await share(file);
  expect(state.url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/[0-9a-f]{32}$/);
  expect(state.name).toBe('shared-movie.mp4');
  expect(state.until).toBeGreaterThan(Date.now());

  // the page a phone opens
  const page = await fetch(state.url);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('<video');

  // the movie itself, whole and in pieces
  const whole = await fetch(`${state.url}/video`);
  expect(whole.status).toBe(200);
  expect(whole.headers.get('accept-ranges')).toBe('bytes');
  expect(await whole.text()).toHaveLength(body.length);
  const part = await fetch(`${state.url}/video`, { headers: { range: 'bytes=10-19' } });
  expect(part.status).toBe(206);
  expect(part.headers.get('content-range')).toBe(`bytes 10-19/${body.length}`);
  expect(await part.text()).toHaveLength(10);

  // nothing else is served, however close the address
  expect((await fetch(`${state.url}x`)).status).toBe(404);
  expect((await fetch(`${state.url}/../secrets`)).status).toBe(404);
});

test('only what ApexCut made can be shared', async () => {
  await expect(share('C:/Windows/System32/drivers/etc/hosts')).rejects.toThrow(
    /only movies ApexCut made/,
  );
});

test('stopping takes it off the network', async () => {
  const file = await fakeMovie('second-movie.mp4', 'bbbb');
  const state = await share(file);
  expect((await fetch(state.url)).status).toBe(200);
  await stopSharing();
  await expect(fetch(state.url)).rejects.toThrow();
});
