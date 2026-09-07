import type { ApexcutApi } from '@shared/ipc';

declare global {
  interface Window {
    apexcut: ApexcutApi;
  }
}
