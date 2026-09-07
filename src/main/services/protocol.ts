/**
 * `apexcut://` scheme for the renderer's <video>/<img>: proxies, filmstrips, thumbnails and exported
 * movies, streamed from disk with HTTP Range support so seeking works. Only whitelisted roots are served.
 */
import { protocol, net } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { paths } from './store';

export const SCHEME = 'apexcut';

/** Resolvers map a URL kind to an absolute file; registered by the services that own the files. */
type Resolver = (segments: string[]) => string | null;
const resolvers = new Map<string, Resolver>();

export function registerResolver(kind: string, fn: Resolver): void {
  resolvers.set(kind, fn);
}

export function mediaUrl(kind: string, ...segments: string[]): string {
  return `${SCHEME}://media/${kind}/${segments.map(encodeURIComponent).join('/')}`;
}

/** Call before app ready. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ]);
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.lrf': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** Allowed roots: the app's own data folder and the user's output folder(s) registered at runtime. */
const allowedRoots = new Set<string>();
export function allowRoot(dir: string): void {
  allowedRoots.add(resolve(dir).toLowerCase() + sep);
}

function isAllowed(file: string, explicitlyAllowed: boolean): boolean {
  if (explicitlyAllowed) return true;
  const f = resolve(file).toLowerCase();
  return [...allowedRoots].some((root) => f.startsWith(root));
}

/** Call after app ready. */
export function installProtocol(): void {
  allowRoot(paths.root);
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const [, kind, ...segs] = url.pathname.split('/').map(decodeURIComponent);
    const resolver = resolvers.get(kind ?? '');
    const file = resolver?.(segs) ?? null;
    // resolvers return exact files the app owns (e.g. the user's LRF); anything else must sit under an allowed root
    if (!file || !existsSync(file) || !isAllowed(file, kind === 'proxy' || kind === 'movie')) {
      return new Response('not found', { status: 404 });
    }
    return serveFile(file, request.headers.get('range'));
  });
}

function serveFile(file: string, range: string | null): Response {
  const size = statSync(file).size;
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  let start = 0;
  let end = size - 1;
  let status = 200;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    start = m[1] ? Number(m[1]) : 0;
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}

/** Fetch helper for main-side sanity checks (unused in production paths, handy in tests). */
export async function head(url: string): Promise<number> {
  const r = await net.fetch(url, { method: 'HEAD' });
  return r.status;
}

export { join as pathJoin };
