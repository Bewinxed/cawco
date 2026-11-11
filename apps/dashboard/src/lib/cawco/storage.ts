import type { z } from "zod";
import { asPref, KEPT, keepPrefs } from "./prefs";
/**
 * The one way to reach the browser's storage, `localStorage` (`"local"`) and
 * `sessionStorage` (`"session"`); lint refuses both globals everywhere else
 * in the dashboard (biome.jsonc `noRestrictedGlobals`).
 *
 * The browser may hand back no storage at all: there is none on the server,
 * WebKit's `sessionStorage` and `localStorage` are null for a window it no
 * longer displays in its frame (LocalDOMWindow.cpp: `if
 * (!isCurrentlyDisplayedInFrame()) return nullptr;`), and reading either
 * throws a SecurityError where storage is blocked. Then a read finds nothing
 * and a write keeps nothing: what wanted remembering is simply not
 * remembered. A write the browser refuses (its quota) keeps nothing either.
 * The area is asked for at every read and write, since a window can lose it.
 */
export type Area = "local" | "session";

function areaOf(area: Area): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return (
      (area === "local" ? window.localStorage : window.sessionStorage) ?? null
    );
  } catch {
    return null;
  }
}

/** What `key` holds, or null: nothing stored, or no storage. */
export function stored(area: Area, key: string): string | null {
  try {
    return areaOf(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Keeps `value` under `key`, where the browser keeps anything. */
export function store(area: Area, key: string, value: string): void {
  try {
    areaOf(area)?.setItem(key, value);
  } catch {
    // Refused (its quota): nothing is kept.
  }
}

/** Forgets `key`. */
export function unstore(area: Area, key: string): void {
  try {
    areaOf(area)?.removeItem(key);
  } catch {
    // No storage to forget it from.
  }
}

/**
 * `key`'s value parsed as JSON and checked against `schema`, in localStorage
 * unless `area` says otherwise: `fallback` when nothing is stored, it was
 * stored badly, or it is a shape this build no longer reads (a tab kept it
 * before an update).
 */
export function readJson<S extends z.ZodType>(
  key: string,
  schema: S,
  fallback: z.output<S>,
  area: Area = "local"
): z.output<S> {
  return parseJson(stored(area, key), schema, fallback);
}

/** `raw` parsed as JSON and checked against `schema`: `fallback` for none, bad JSON, or another shape. */
export function parseJson<S extends z.ZodType>(
  raw: string | null,
  schema: S,
  fallback: z.output<S>
): z.output<S> {
  if (raw === null) {
    return fallback;
  }
  try {
    const read = schema.safeParse(JSON.parse(raw));
    return read.success ? read.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Keeps `value` under `key` as JSON. A key the server draws from (prefs.ts
 * `KEPT`) sends its copy to the server with it.
 */
export function writeJson(
  key: string,
  value: unknown,
  area: Area = "local"
): void {
  const raw = JSON.stringify(value);
  store(area, key, raw);
  const pref = area === "local" ? KEPT[key] : undefined;
  if (pref) {
    keepPrefs({ [pref]: asPref(raw) });
  }
}
