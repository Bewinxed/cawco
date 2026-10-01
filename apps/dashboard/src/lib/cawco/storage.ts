/**
 * The one way to reach localStorage. Reads are forgiving (nothing stored yet,
 * or stored badly, is the same as nothing stored) and writes swallow quota
 * errors, so a browser that refuses to store just asks again next time.
 */
export function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser that refuses to store just asks again next time.
  }
}
