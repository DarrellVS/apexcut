/**
 * IPC: thin handlers — validate the input, call a service, return. Long work becomes a job
 * (services/jobs.ts) and never blocks a handler. One module per domain; this file wires them and
 * the `apexcut://media` protocol resolvers.
 */
import { basename, join } from 'node:path';
import { allowRoot, registerResolver } from '../services/protocol';
import { paths } from '../services/store';
import { registerAnalysisIpc } from './analysis';
import { registerExportIpc } from './export';
import { registerLibraryIpc } from './library';
import { registerProjectIpc } from './projects';
import { registerSystemIpc } from './system';
import type { Services } from './services';

export { createServices, type Services } from './services';

/** What the renderer may load over `apexcut://media/<kind>/...`, and which folders are servable. */
function registerMedia(s: Services): void {
  // the user's output folder must be servable (movie preview after a restart)
  const out = s.settings.get().outputDir;
  if (out) allowRoot(out);
  registerResolver('proxy', ([stem]) => (stem ? s.library.proxyOf(stem) : null));
  registerResolver('clip', ([stem, ...rest]) => (stem ? join(paths.clipDir(stem), ...rest) : null));
  registerResolver('movie', ([file]) =>
    file ? join(s.settings.outputDir('movies'), basename(file)) : null,
  );
  // songs live wherever the user keeps them: the path travels base64url-encoded, its folder is allowed
  registerResolver('music', ([enc]) =>
    enc ? Buffer.from(enc, 'base64url').toString('utf8') : null,
  );
  for (const t of s.projects.list().flatMap((p) => p.music.tracks)) allowRoot(join(t.path, '..'));
}

export function registerIpc(s: Services): void {
  registerMedia(s);
  registerProjectIpc(s);
  registerLibraryIpc(s);
  registerAnalysisIpc(s);
  registerExportIpc(s);
  registerSystemIpc(s);
}
