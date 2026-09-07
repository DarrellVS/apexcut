#!/usr/bin/env node
/** Evaluate JS inside the running ApexCut MAIN process. Start the app with `--inspect=9229`. */
const port = process.env.INSPECT_PORT ?? '9229';
const expr = process.argv[2] ?? 'process.cwd()';
const [t] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
const msg = await new Promise((res) => (ws.onmessage = (e) => res(JSON.parse(e.data))));
ws.close();
console.log(JSON.stringify(msg.result?.exceptionDetails ?? msg.result?.result?.value, null, 2));
