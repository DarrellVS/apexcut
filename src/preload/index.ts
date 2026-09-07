import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ApexcutApi, JobState, UpdateStatus } from '@shared/ipc';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: ApexcutApi = {
  projects: {
    list: () => invoke('projects:list'),
    active: () => invoke('projects:active'),
    open: (id) => invoke('projects:open', id),
    create: (name) => invoke('projects:create', name),
    rename: (id, name) => invoke('projects:rename', id, name),
    remove: (id) => invoke('projects:remove', id),
    exportFile: (id) => invoke('projects:exportFile', id),
    importFile: () => invoke('projects:importFile'),
    setPreset: (preset) => invoke('projects:setPreset', preset),
  },
  library: {
    list: () => invoke('library:list'),
    pick: (kind) => invoke('library:pick', kind),
    add: (paths) => invoke('library:add', paths),
    remove: (stem) => invoke('library:remove', stem),
    reorder: (stems) => invoke('library:reorder', stems),
    relink: (kind, stem) => invoke('library:relink', kind, stem),
  },
  files: {
    pathOf: (file) => webUtils.getPathForFile(file),
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
    pickOutputDir: () => invoke('settings:pickOutputDir'),
  },
  shell: {
    openFolder: (path) => invoke('shell:openFolder', path),
  },
  storage: {
    info: () => invoke('storage:info'),
    cleanup: () => invoke('storage:cleanup'),
  },
  updater: {
    status: () => invoke('updater:status'),
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onStatus: (cb) => {
      const handler = (_e: unknown, s: UpdateStatus): void => cb(s);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
  },
  app: {
    version: () => invoke('app:version'),
    report: () => invoke('app:report'),
    log: (level, message) => ipcRenderer.send('app:log', level, message),
    onFatal: (cb) => {
      const handler = (_e: unknown, err: { message: string; stack?: string }): void => cb(err);
      ipcRenderer.on('app:fatal', handler);
      return () => ipcRenderer.removeListener('app:fatal', handler);
    },
  },
};

contextBridge.exposeInMainWorld('apexcut', api);
