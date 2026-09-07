import { contextBridge, ipcRenderer } from 'electron';
import type { ApexcutApi, JobState } from '@shared/ipc';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: ApexcutApi = {
  library: {
    list: () => invoke('library:list'),
    pick: (kind) => invoke('library:pick', kind),
    add: (paths) => invoke('library:add', paths),
    remove: (stem) => invoke('library:remove', stem),
  },
  analysis: {
    run: (stems, config) => invoke('analysis:run', stems, config),
    rescore: (stem, config) => invoke('analysis:rescore', stem, config),
    timeline: (stem) => invoke('analysis:timeline', stem),
    saveParts: (stem, parts) => invoke('analysis:saveParts', stem, parts),
    filmstrip: (stem) => invoke('analysis:filmstrip', stem),
  },
  exporter: {
    start: (req) => invoke('export:start', req),
    cancel: (jobId) => invoke('export:cancel', jobId),
    edl: (stem) => invoke('export:edl', stem),
  },
  jobs: {
    list: () => invoke('jobs:list'),
    onUpdate: (cb) => {
      const handler = (_e: unknown, job: JobState): void => cb(job);
      ipcRenderer.on('jobs:update', handler);
      return () => ipcRenderer.removeListener('jobs:update', handler);
    },
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    encoders: () => invoke('settings:encoders'),
  },
  shell: {
    openFolder: (path) => invoke('shell:openFolder', path),
  },
  app: {
    version: () => invoke('app:version'),
  },
};

contextBridge.exposeInMainWorld('apexcut', api);
