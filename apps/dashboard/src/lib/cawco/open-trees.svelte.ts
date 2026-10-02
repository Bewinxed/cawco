/**
 * Which trees the reader has opened, one id at a time (tree.ts `collapse`).
 * Every tree starts folded; opening one is remembered per browser, and every
 * list that nests sessions reads the one answer, so a parent opened under
 * Finished is open under Working and in its project too.
 *
 * The list a turn came from shows it at once; every other list shows it a
 * frame later. Shown in every list in the update the click made, the click
 * rendered the same tree twice and ran past a frame; a frame later, the
 * other list's fold still starts on the same frame as this one's (both land
 * in the batch motion/rows `atTravel` opens, which waits two frames), so
 * the two never part.
 */
import { SvelteSet } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

/** A list that shows trees: the rail's projects, or the home's tabs. */
export type TreeList = "rail" | "home";

const KEY = "cawco-open-trees";

const stored = readJson<unknown>(KEY, []);
const open = new SvelteSet<string>(
  Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === "string")
    : []
);
/** What the other lists show until they catch up. */
const behind = new SvelteSet<string>(open);
/** The list the turns of this frame came from; null once every list shows them. */
let turnedIn = $state<TreeList | null>(null);
let catchingUp = 0;

function catchUp(): void {
  for (const id of [...behind]) {
    if (!open.has(id)) {
      behind.delete(id);
    }
  }
  for (const id of open) {
    behind.add(id);
  }
  turnedIn = null;
}

export const openTrees = {
  has(id: string, list: TreeList): boolean {
    return turnedIn !== null && turnedIn !== list
      ? behind.has(id)
      : open.has(id);
  },
  set(id: string, opened: boolean, list: TreeList): void {
    if (opened === open.has(id)) {
      return;
    }
    if (opened) {
      open.add(id);
    } else {
      open.delete(id);
    }
    writeJson(KEY, [...open]);
    if (typeof requestAnimationFrame === "undefined") {
      catchUp();
      return;
    }
    if (turnedIn !== null && turnedIn !== list) {
      // Two lists turned in one frame: neither is behind the other.
      cancelAnimationFrame(catchingUp);
      catchUp();
      return;
    }
    turnedIn = list;
    cancelAnimationFrame(catchingUp);
    catchingUp = requestAnimationFrame(catchUp);
  },
  toggle(id: string, list: TreeList): void {
    openTrees.set(id, !open.has(id), list);
  },
};
