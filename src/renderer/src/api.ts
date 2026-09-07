/**
 * The typed bridge to the main process, with every argument copied to plain data first. Vue reactive
 * proxies (store state, computed results holding store arrays) cannot cross the contextBridge; use
 * `api` instead of `window.apexcut` everywhere in the renderer (a lint rule enforces this).
 */
import type { ApexcutApi } from '@shared/ipc';
import { plain } from '@shared/plain';

type Fn = (...args: unknown[]) => unknown;

function wrapNamespace<T extends object>(ns: T): T {
  return Object.fromEntries(
    Object.entries(ns).map(([k, v]) => [
      k,
      typeof v === 'function' ? (...args: unknown[]) => (v as Fn)(...args.map(plain)) : v,
    ]),
  ) as T;
}

// eslint-disable-next-line no-restricted-properties -- the one place the raw bridge is read
const raw: ApexcutApi = window.apexcut;
export const api: ApexcutApi = Object.fromEntries(
  Object.entries(raw).map(([k, ns]) => [k, wrapNamespace(ns as object)]),
) as unknown as ApexcutApi;
