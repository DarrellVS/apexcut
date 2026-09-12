import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ApexcutApi, JobState, UpdateStatus, WindowState } from '@shared/ipc';
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
    setPulls: (on) => invoke('projects:setPulls', on),
    addGroups: (groups) => invoke('projects:addGroups', groups),
    archive: (id, archived) => invoke('projects:archive', id, archived),
    setTransition: (transition) => invoke('projects:setTransition', transition),
    setMusic: (music) => invoke('projects:setMusic', music),
    setOverlay: (overlay) => invoke('projects:setOverlay', overlay),
    setGrade: (grade, id) => invoke('projects:setGrade', grade, id),
    setFormat: (format) => invoke('projects:setFormat', format),
    setFramePos: (pos) => invoke('projects:setFramePos', pos),
    rideStats: () => invoke('projects:rideStats'),
  },
  library: {
    list: () => invoke('library:list'),
    pick: (kind) => invoke('library:pick', kind),
    inspect: (paths) => invoke('library:inspect', paths),
    add: (paths) => invoke('library:add', paths),
    remove: (stem) => invoke('library:remove', stem),
    reorder: (stems) => invoke('library:reorder', stems),
    relink: (kind, stem) => invoke('library:relink', kind, stem),
  },
  files: {
    pathOf: (file) => webUtils.getPathForFile(file),
  },
  music: {
    pick: () => invoke('music:pick'),
    add: (paths) => invoke('music:add', paths),
    exists: (path) => invoke('music:exists', path),
  },
  analysis: {
    run: (stems, config) => invoke('analysis:run', stems, config),
    rescore: (stem, config) => invoke('analysis:rescore', stem, config),
    timeline: (stem) => invoke('analysis:timeline', stem),
    saveParts: (stem, parts) => invoke('analysis:saveParts', stem, parts),
    filmstrip: (stem) => invoke('analysis:filmstrip', stem),
    frame: (stem, tS, width) => invoke('analysis:frame', stem, tS, width),
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
  window: {
    setOverlay: (color, symbolColor) => invoke('window:setOverlay', color, symbolColor),
    onState: (cb) => {
      const handler = (_e: unknown, s: WindowState): void => cb(s);
      ipcRenderer.on('window:state', handler);
      return () => ipcRenderer.removeListener('window:state', handler);
    },
    titlebarDoubleClick: () => ipcRenderer.send('window:titlebarDoubleClick'),
  },
  app: {
    version: () => invoke('app:version'),
    report: () => invoke('app:report'),
    log: (level, message) => ipcRenderer.send('app:log', level, message),
    relaunch: () => ipcRenderer.send('app:relaunch'),
    onFatal: (cb) => {
      const handler = (_e: unknown, err: { message: string; stack?: string }): void => cb(err);
      ipcRenderer.on('app:fatal', handler);
      return () => ipcRenderer.removeListener('app:fatal', handler);
    },
    saveImage: (dataUrl, name) => invoke('app:saveImage', dataUrl, name),
  },
};

contextBridge.exposeInMainWorld('apexcut', api);
