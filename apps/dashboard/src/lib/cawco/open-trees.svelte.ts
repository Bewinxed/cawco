/**
 * Which sessions the reader has unfolded to show their delegates, one id at
 * a time (tree.ts `collapse`), in each list on its own: the rail's Recent is
 * not the phone home's, nor the rail's Projects. Every tree starts folded; opening one is remembered
 * per browser, per list.
 */
import { SvelteSet } from "svelte/reactivity";
import { z } from "zod";
import { parseJson, stored, writeJson } from "../platform/storage";
import { drawnFrom } from "./kept.svelte";

/** A list that shows trees: the rail's Recent, the phone home's, and the running sessions a project unfolds in the rail's Projects. */
export type TreeList = "rail-recent" | "home-recent" | "rail-projects";

const keyOf = (list: TreeList): string => `cawco-open-trees:${list}`;

const idsOf = (raw: string | null): string[] =>
  parseJson(raw, z.array(z.string()), []);

/** The trees opened in `list`, as this browser last kept them. */
const keptOpen = (list: TreeList): SvelteSet<string> =>
  new SvelteSet(idsOf(stored("local", keyOf(list))));

const open: Record<TreeList, SvelteSet<string>> = {
  "rail-recent": keptOpen("rail-recent"),
  "home-recent": keptOpen("home-recent"),
  "rail-projects": keptOpen("rail-projects"),
};

/**
 * Parents whose older rows are out (older.ts, OlderRows), in each list on its
 * own: a session's older delegates. In memory, so a reload shuts them.
 */
export const olderOpen: Record<TreeList, SvelteSet<string>> = {
  "rail-recent": new SvelteSet(),
  "home-recent": new SvelteSet(),
  "rail-projects": new SvelteSet(),
};

export const openTrees = {
  has(id: string, list: TreeList): boolean {
    // The server's copy while the first paint holds (kept.svelte.ts).
    return drawnFrom<ReadonlySet<string>>(
      keyOf(list),
      open[list],
      (raw) => new Set(idsOf(raw))
    ).has(id);
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
