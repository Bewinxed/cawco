/**
 * `__cawcoDebug`, the dev server's handle on the client's stores: asserted
 * from the console while developing, and written by the /motion benches to
 * stand their own data in. Each store adds its part as it loads.
 *
 * Every call sits inside `if (import.meta.env.DEV)`, so any other build
 * folds it away with what it would have exposed: a shipped dashboard has no
 * such global, and no way for a page to stage anything.
 */
declare global {
  var __cawcoDebug: Record<string, unknown> | undefined;
}

export function devDebug(parts: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    globalThis.__cawcoDebug = Object.assign(
      globalThis.__cawcoDebug ?? {},
      parts
    );
  }
}

/** One more `entry` on the `name` list, for a probe to count. */
export function devNote(name: string, entry: unknown): void {
  if (typeof window !== "undefined") {
    const debug = globalThis.__cawcoDebug ?? {};
    globalThis.__cawcoDebug = debug;
    const list = debug[name];
    if (Array.isArray(list)) {
      list.push(entry);
    } else {
      debug[name] = [entry];
    }
  }
}
