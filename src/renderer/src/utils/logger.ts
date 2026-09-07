/* Renderer logger: prefix + level gate; the only sanctioned console use. Warnings and errors are
 * also forwarded to the main process so they end up in main.log (and in a problem report). */
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];
const min: Level = import.meta.env.DEV ? 'debug' : 'warn';

const describe = (a: unknown): string =>
  a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a);

function emit(level: Level, ...args: unknown[]): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(min)) return;
  console[level](`[apexcut]`, ...args);
  if (level === 'warn' || level === 'error') {
    try {
      window.apexcut?.app.log(level, args.map(describe).join(' '));
    } catch {
      /* preload not available (unit tests) */
    }
  }
}

export const logger = {
  debug: (...a: unknown[]) => emit('debug', ...a),
  info: (...a: unknown[]) => emit('info', ...a),
  warn: (...a: unknown[]) => emit('warn', ...a),
  error: (...a: unknown[]) => emit('error', ...a),
};
