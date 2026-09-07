/**
 * "Report a problem": one zip with the logs, the projects file, settings and app/encoder info,
 * written to the user's Documents folder so they can send it along with a bug report.
 */
import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import log from 'electron-log/main';
import type { JobState } from '@shared/ipc';
import { encoders } from './media';
import { ensureDir, paths } from './store';
import { writeZip, type ZipEntry } from './zip';

/** What goes into the zip — listed in the UI so the user knows what they are sending. */
export const REPORT_CONTENTS = [
  'main.log (what the app did, including ffmpeg output)',
  'projects.json and settings.json (names, video paths, your settings — no picks)',
  'info.json (app version, Windows version, encoder)',
] as const;

export async function createReport(jobs: JobState[]): Promise<string> {
  const entries: ZipEntry[] = [];
  const add = (name: string, file: string): void => {
    if (existsSync(file)) entries.push({ name, data: readFileSync(file) });
  };
  add('main.log', join(app.getPath('logs'), 'main.log'));
  add('projects.json', paths.projectsFile);
  add('settings.json', paths.settingsFile);
  const info = {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: `${process.platform} ${process.getSystemVersion()}`,
    arch: process.arch,
    dataRoot: paths.root,
    encoders: await encoders().catch((e: Error) => ({ error: e.message })),
    jobs: jobs.slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  entries.push({ name: 'info.json', data: JSON.stringify(info, null, 2) });
  const dir = ensureDir(join(homedir(), 'Documents'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const file = join(dir, `ApexCut-report-${stamp}.zip`);
  writeZip(file, entries);
  log.info('report written:', file);
  return file;
}
