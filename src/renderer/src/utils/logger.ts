/* Renderer logger: prefix + level gate; the only sanctioned console use. */
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];
const min: Level = import.meta.env.DEV ? 'debug' : 'warn';

function emit(level: Level, ...args: unknown[]): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(min)) return;
  console[level](`[apexcut]`, ...args);
}

export const logger = {
  debug: (...a: unknown[]) => emit('debug', ...a),
  info: (...a: unknown[]) => emit('info', ...a),
  warn: (...a: unknown[]) => emit('warn', ...a),
  error: (...a: unknown[]) => emit('error', ...a),
};
