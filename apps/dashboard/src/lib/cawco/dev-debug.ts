/**
 * `__cawcoDebug`, the dev server's handle on the client's stores: asserted
 * from the console while developing, and written by the /motion benches to
 * stand their own data in. Each store adds its part as it loads.
 *
 * Every call sits inside `if (import.meta.env.DEV)`, so any other build
 * folds it away with what it would have exposed: a shipped dashboard has no
 * such global, and no way for a page to stage anything.
 */
export function devDebug(parts: Partial<CawcoDebug>): void {
  if (typeof window !== "undefined") {
    window.__cawcoDebug = Object.assign(window.__cawcoDebug ?? {}, parts);
  }
}

/** One more `entry` on the `name` list, for a probe to count. */
export function devNote(name: string, entry: unknown): void {
  if (typeof window !== "undefined") {
    const debug = window.__cawcoDebug ?? {};
    window.__cawcoDebug = debug;
    const list = debug[name];
    if (Array.isArray(list)) {
      list.push(entry);
    } else {
      debug[name] = [entry];
    }
  }
}
