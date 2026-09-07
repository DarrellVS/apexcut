/**
 * Deep copy of a JSON-shaped value with every Proxy (Vue reactive state) stripped. The contextBridge
 * refuses proxies ("An object could not be cloned"); three separate features hit that in the field, so
 * the renderer's `api` wrapper applies this to every argument. Only plain objects and arrays are copied
 * (a reactive proxy reports the plain prototype); File, Blob, Date, functions pass through untouched.
 */
export function plain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
