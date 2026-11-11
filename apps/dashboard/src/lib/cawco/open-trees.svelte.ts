/**
 * Which sessions the reader has unfolded to show their delegates, one id at
 * a time (tree.ts `collapse`), in each list on its own: the rail's Recent is
 * not the phone home's, nor the rail's Projects. Every tree starts folded; opening one is remembered
 * per browser, per list.
 */
import { SvelteSet } from "svelte/reactivity";
import { z } from "zod";
import { readJson, writeJson } from "./storage";

/** A list that shows trees: the rail's Recent, the phone home's, and the running sessions a project unfolds in the rail's Projects. */
export type TreeList = "rail-recent" | "home-recent" | "rail-projects";

const LISTS: readonly TreeList[] = [
  "rail-recent",
  "home-recent",
  "rail-projects",
];

const keyOf = (list: TreeList): string => `cawco-open-trees:${list}`;

function storedIds(list: TreeList): string[] {
  return readJson(keyOf(list), z.array(z.string()), []);
}

const open = Object.fromEntries(
  LISTS.map((list) => [list, new SvelteSet<string>(storedIds(list))])
) as Record<TreeList, SvelteSet<string>>;

/**
 * Parents whose older rows are out (older.ts, OlderRows), in each list on its
 * own: a session's older delegates. In memory, so a reload shuts them.
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
