import { SvelteSet } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

/**
 * The parked questions the reader has minimized on this device: the card
 * folded to its one-line bar over the composer so the transcript can be read
 * behind it. Minimizing settles nothing; the ask stays parked on the hub
 * exactly as it was, and the bar brings the card back.
 *
 * Kept per tab in sessionStorage, by request id: it survives a reload and a
 * scroll, and is never told to another device, whose reader has not put the
 * question down.
 */
const KEY = "cawco:minimized-asks";

const minimized = new SvelteSet<string>(readJson<string[]>(KEY, [], "session"));

export const minimizedAsks = {
  has: (requestId: string): boolean => minimized.has(requestId),
  set(requestId: string, on: boolean): void {
    if (on) {
      minimized.add(requestId);
    } else {
      minimized.delete(requestId);
    }
    writeJson(KEY, [...minimized], "session");
  },
};
