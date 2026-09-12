/**
 * What happens once, at start-up, before anyone touches the window: the command-line ways of
 * getting videos in, and the small repairs an older data folder may need.
 *
 *   ApexCut --add=<file-or-folder>            add videos and scan them (also handy for tests)
 *   ApexCut --import-legacy=<out folder>      take over the Python prototype's library and picks
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import type { Part } from '@core/types';
import { ThumbnailAction } from './actions/thumbs';
import type { Services } from './ipc';
import { paths, readJson } from './services/store';

/** videos named on the command line, plus everything a legacy import folder points at */
function videosFromArgv(s: Services, argv: string[]): string[] {
  const adds = argv.filter((a) => a.startsWith('--add=')).map((a) => a.slice(6));
  for (const dir of argv.filter((a) => a.startsWith('--import-legacy=')).map((a) => a.slice(16))) {
    const lib = readJson<Record<string, { mp4?: string | null; lrf?: string | null }>>(
      join(dir, 'library.json'),
      {},
    );
    for (const [stem, rec] of Object.entries(lib)) {
      adds.push(...[rec.mp4, rec.lrf].filter((p): p is string => !!p));
      const sel = readJson<{ segments?: Part[] } | null>(join(dir, stem, 'selection.json'), null);
      if (sel?.segments) {
        // an imported selection is frozen: the next scan keeps it exactly as it was
        s.analysis.importSelection(stem, sel.segments);
        log.info(`legacy import: ${stem} — ${sel.segments.length} parts`);
      }
    }
  }
  return adds;
}

/** Add those videos to the open project and scan the ones that have never been scanned. */
function addAndScan(s: Services, paths_: string[]): void {
  if (!paths_.length) return;
  const added = s.projects.addClips(s.library.add(paths_));
  log.info('startup add:', added);
  const todo = s.projects
    .clipInfos()
    .filter((c) => !c.analyzed)
    .map((c) => c.stem);
  if (!todo.length) return;
  s.jobs.start('analyze', `Scanning ${todo.length} videos`, async (ctx) => {
    for (let i = 0; i < todo.length; i++) {
      await s.analysis.analyze(todo[i], undefined, ctx, i / todo.length, 1 / todo.length);
    }
    return { kind: 'analyze', stems: todo };
  });
}

/** Card thumbnails for clips analysed before thumbnails existed (e.g. a legacy import). */
function backfillThumbnails(s: Services): void {
  for (const c of s.library.records()) {
    const meta = s.analysis.meta(c.stem);
    if (meta && !existsSync(join(paths.clipDir(c.stem), 'thumb.jpg'))) {
      new ThumbnailAction()
        .execute(c.stem, s.library.proxyOf(c.stem), meta.durationS * 0.1, 160, 'thumb.jpg')
        .catch((e) => log.warn('thumbnail backfill:', e));
    }
  }
}

export function runStartupTasks(s: Services, argv: string[] = process.argv): void {
  addAndScan(s, videosFromArgv(s, argv));
  backfillThumbnails(s);
  // check for a new version a few seconds after start; the renderer shows a banner when it is ready
  setTimeout(() => s.updater.check().catch((e) => log.warn('updater:', e)), 4000);
}
