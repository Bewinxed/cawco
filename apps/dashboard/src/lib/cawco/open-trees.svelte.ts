/**
 * Which trees the reader has opened, one id at a time (tree.ts `collapse`),
 * in each list on its own: a parent opened in its project stays folded under
 * Working and Finished, and the rail's Working is not the home's. Every tree
 * starts folded; opening one is remembered per browser, per list.
 */
import { SvelteSet } from "svelte/reactivity";
import { z } from "zod";
import { readJson, writeJson } from "#lib/platform/storage.js";

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

const keyOf = (list: TreeList): string => `cawco-open-trees:${list}`;

function storedIds(list: TreeList): string[] {
  return readJson(keyOf(list), z.array(z.string()), []);
}

const open: Record<TreeList, SvelteSet<string>> = {
  projects: new SvelteSet(storedIds("projects")),
  "rail-working": new SvelteSet(storedIds("rail-working")),
  "rail-finished": new SvelteSet(storedIds("rail-finished")),
  "home-working": new SvelteSet(storedIds("home-working")),
  "home-finished": new SvelteSet(storedIds("home-finished")),
  "home-recent": new SvelteSet(storedIds("home-recent")),
};

/**
 * Parents whose older rows are out (older.ts, OlderRows), in each list on its
 * own: a project's older sessions, a session's older delegates. In memory, so
 * a reload shuts them.
 */
export const olderOpen: Record<TreeList, SvelteSet<string>> = {
  projects: new SvelteSet(),
  "rail-working": new SvelteSet(),
  "rail-finished": new SvelteSet(),
  "home-working": new SvelteSet(),
  "home-finished": new SvelteSet(),
  "home-recent": new SvelteSet(),
};

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
