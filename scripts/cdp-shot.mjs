#!/usr/bin/env node
/**
 * Screenshot the running ApexCut renderer via Chrome DevTools Protocol (no screen capture needed).
 *   node scripts/cdp-shot.mjs out.png
 * CDP_PORT selects the debugging port (default 9222).
 */
import { writeFileSync } from 'node:fs';

const port = process.env.CDP_PORT ?? '9222';
const out = process.argv[2] ?? 'shot.png';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!page) {
  console.error('no page target');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
const msg = await new Promise((res) => (ws.onmessage = (e) => res(JSON.parse(e.data))));
ws.close();
writeFileSync(out, Buffer.from(msg.result.data, 'base64'));
console.log(out);
