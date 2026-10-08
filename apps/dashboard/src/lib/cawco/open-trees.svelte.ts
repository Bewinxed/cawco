/**
 * Which trees the reader has opened, one id at a time (tree.ts `collapse`),
 * in each list on its own: a parent opened in its project stays folded under
 * Working and Finished, and the rail's Working is not the home's. Every tree
 * starts folded; opening one is remembered per browser, per list.
 */
import { SvelteSet } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

/**
 * A list that shows trees: the rail's projects, the rail's Working and
 * Finished tabs, and the home's Working, Finished and Recent.
 */
export type TreeList =
  | "projects"
  | "rail-working"
  | "rail-finished"
  | "home-working"
  | "home-finished"
  | "home-recent";

const LISTS: readonly TreeList[] = [
  "projects",
  "rail-working",
  "rail-finished",
  "home-working",
  "home-finished",
  "home-recent",
];

const keyOf = (list: TreeList): string => `cawco-open-trees:${list}`;

function storedIds(list: TreeList): string[] {
  const stored = readJson<unknown>(keyOf(list), []);
  return Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === "string")
    : [];
}

const open = Object.fromEntries(
  LISTS.map((list) => [list, new SvelteSet<string>(storedIds(list))])
) as Record<TreeList, SvelteSet<string>>;

/**
 * Parents whose older rows are out (older.ts, OlderRows), in each list on its
 * own: a project's older sessions, a session's older delegates. In memory, so
 * a reload shuts them.
 */
export const olderOpen = Object.fromEntries(
  LISTS.map((list) => [list, new SvelteSet<string>()])
) as Record<TreeList, SvelteSet<string>>;

export const openTrees = {
  has(id: string, list: TreeList): boolean {
    return open[list].has(id);
  },
  set(id: string, opened: boolean, list: TreeList): void {
    const ids = open[list];
    if (opened === ids.has(id)) {
      return;
    }
    if (opened) {
      ids.add(id);
    } else {
      ids.delete(id);
    }
    writeJson(keyOf(list), [...ids]);
  },
  toggle(id: string, list: TreeList): void {
    openTrees.set(id, !open[list].has(id), list);
  },
};
