/**
 * Handing a finished movie to your phone over the local network — no cable, no upload, nothing
 * leaves the house. A small web server is started on this computer, serves exactly one file behind
 * a long random address, and stops on its own after half an hour (or when the app quits, or when
 * the rider says so). Whoever is on the same network and has the address can watch and save it
 * while it runs; nobody else can, and there is no second file to find.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import log from 'electron-log/main';
import type { ShareState } from '@shared/ipc';

/** how long a share stays up before it closes itself */
export const SHARE_MINUTES = 30;

export type { ShareState };

/** the address of this computer on the local network, if it has one */
export function localAddress(): string | null {
  const all = Object.values(networkInterfaces()).flatMap((list) => list ?? []);
  const usable = all.filter((n) => n.family === 'IPv4' && !n.internal && n.address);
  // a home network first (192.168.x, 10.x, 172.16–31.x), anything else after
  const home = usable.find((n) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
  return (home ?? usable[0])?.address ?? null;
}

const html = (name: string, token: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name)}</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#0e0f11; color:#f2f3f5; font:15px/1.5 system-ui, sans-serif;
         display:flex; flex-direction:column; gap:14px; align-items:center; padding:18px }
  video { width:100%; max-width:680px; border-radius:8px; background:#000 }
  a { color:#f2f3f5; background:#26282d; padding:10px 16px; border-radius:8px; text-decoration:none }
  p { color:#a0a4ad; margin:0; text-align:center; max-width:420px }
</style></head>
<body>
  <video src="/${token}/video" controls playsinline preload="metadata"></video>
  <a href="/${token}/video" download="${escapeHtml(name)}">Save to my phone</a>
  <p>Sent straight from the computer ApexCut is running on. This link stops working when you close
  it there.</p>
</body></html>`;

const escapeHtml = (s: string): string =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);

export class ShareService {
  private server: Server | null = null;
  private state: ShareState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private token = '';
  private file = '';

  /** Share one movie; any share already running is replaced. */
  async start(file: string): Promise<ShareState> {
    if (!existsSync(file)) throw new Error(`no file to share: ${file}`);
    const host = localAddress();
    if (!host) {
      throw new Error(
        'This computer is not on a network right now, so there is nothing to share over.',
      );
    }
    this.stop();
    this.token = randomBytes(16).toString('hex');
    this.file = file;
    const token = this.token;
    const name = basename(file);

    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0];
      if (path === `/${token}` || path === `/${token}/`) {
        const body = html(name, token);
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      if (path !== `/${token}/video`) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
        return;
      }
      const size = statSync(this.file).size;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      const head: Record<string, string> = {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
      };
      // phones ask for pieces of the file while they play it
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (!(start <= end && end < size)) {
          res.writeHead(416, { 'content-range': `bytes */${size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...head,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
        });
        if (req.method === 'HEAD') res.end();
        else createReadStream(this.file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...head, 'content-length': String(size) });
      if (req.method === 'HEAD') res.end();
      else createReadStream(this.file).pipe(res);
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('the share could not be started'));
      });
    });
    this.server = server;
    this.state = {
      url: `http://${host}:${port}/${token}`,
      file,
      name,
      until: Date.now() + SHARE_MINUTES * 60_000,
    };
    this.timer = setTimeout(() => this.stop(), SHARE_MINUTES * 60_000);
    log.info(
      `sharing ${name} on the local network until ${new Date(this.state.until).toISOString()}`,
    );
    return this.state;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.server?.close();
    this.server?.closeAllConnections?.();
    this.server = null;
    this.state = null;
    this.token = '';
  }

  current(): ShareState | null {
    if (this.state && Date.now() > this.state.until) this.stop();
    return this.state;
  }
}
