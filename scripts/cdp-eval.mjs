#!/usr/bin/env node
/**
 * Evaluate JavaScript inside the running ApexCut renderer via Chrome DevTools Protocol.
 * Start the app with `--remote-debugging-port=9222`, then:
 *   node scripts/cdp-eval.mjs "document.title"
 * Handy for smoke tests where the Electron window cannot be inspected otherwise.
 */
const port = process.env.CDP_PORT ?? '9222';
const expr = process.argv[2] ?? 'document.title';

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!page) {
  console.error(
    'no page target; targets:',
    targets.map((t) => `${t.type} ${t.url}`),
  );
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: expr, awaitPromise: true, returnByValue: true },
  }),
);
const msg = await new Promise((res) => (ws.onmessage = (e) => res(JSON.parse(e.data))));
ws.close();
const r = msg.result?.result;
if (msg.result?.exceptionDetails)
  console.error('exception:', msg.result.exceptionDetails.text, r?.description);
else console.log(JSON.stringify(r?.value ?? r, null, 2));
