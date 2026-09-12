/**
 * The services the IPC modules work on. One instance each, created once at start-up; every handler
 * is thin — validate, call a service, return.
 */
import { app } from 'electron';
import { Analysis } from '../services/analysis';
import { Jobs } from '../services/jobs';
import { Library } from '../services/library';
import { Projects } from '../services/projects';
import { ShareService } from '../services/share';
import { Storage } from '../services/storage';
import { Updater } from '../services/updater';
import { SettingsStore } from '../services/store';

export interface Services {
  library: Library;
  projects: Projects;
  analysis: Analysis;
  jobs: Jobs;
  settings: SettingsStore;
  updater: Updater;
  storage: Storage;
  share: ShareService;
}

export function createServices(): Services {
  const library = new Library();
  const projects = new Projects(library);
  const jobs = new Jobs();
  return {
    library,
    projects,
    analysis: new Analysis(library, (stem) => projects.selectionFile(stem)),
    jobs,
    settings: new SettingsStore(),
    updater: new Updater(app.isPackaged),
    storage: new Storage(projects, jobs),
    share: new ShareService(),
  };
}
