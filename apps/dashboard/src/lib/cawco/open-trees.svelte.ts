/**
 * Which trees the reader has opened, one id at a time (tree.ts `collapse`).
 * Every tree starts folded; opening one is remembered per browser, and every
 * list that nests sessions reads the one answer, so a parent opened under
 * Finished is open under Working and in its project too.
 */
import { SvelteSet } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

const KEY = "cawco-open-trees";

const stored = readJson<unknown>(KEY, []);
const open = new SvelteSet<string>(
  Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === "string")
    : []
);

export const openTrees = {
  has(id: string): boolean {
    return open.has(id);
  },
  set(id: string, opened: boolean): void {
    if (opened === open.has(id)) {
      return;
    }
    if (opened) {
      open.add(id);
    } else {
      open.delete(id);
    }
    writeJson(KEY, [...open]);
  },
  toggle(id: string): void {
    openTrees.set(id, !open.has(id));
  },
};
