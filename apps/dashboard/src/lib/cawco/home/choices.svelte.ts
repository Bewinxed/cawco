/**
 * The owner's open design choice, as a temporary switch.
 *
 * Read from `?choice=` in development only, e.g.
 * `/session?choice=ipad:a`. Every choice not named takes
 * its recommended variant, which is also what a production build always
 * runs. The pick is kept for the browser tab (sessionStorage), because the
 * workspace writes conversation URLs without a query string.
 *
 * Each variant is read in exactly one place in the app, so the losers are
 * deleted by deleting their branch once the owner picks:
 * - `ipad`     layout-policy.svelte.ts and SessionSurface (deck or grid)
 */

import { store, stored } from "#lib/platform/storage.js";
import { browser, dev } from "$app/env";

export interface Choices {
  /**
   * Wide layouts: (a) one transcript, the others as tabs; (b) up to two
   * panes side by side on a tablet in landscape, one in portrait, free
   * splits on a desktop; (c) free splits everywhere.
   */
  ipad: "a" | "b" | "c";
}

const RECOMMENDED: Choices = { ipad: "b" };
const KEY = "cawco-choice";
const OPTIONS: { [K in keyof Choices]: readonly Choices[K][] } = {
  ipad: ["a", "b", "c"],
};

function parse(raw: string | null): Partial<Choices> {
  const picked: Partial<Choices> = {};
  for (const part of (raw ?? "").split(",")) {
    const [name, value] = part.split(":");
    if (name === "ipad") {
      picked.ipad = OPTIONS.ipad.find((one) => one === value) ?? picked.ipad;
    }
  }
  return picked;
}

function read(): Choices {
  if (!(browser && dev)) {
    return RECOMMENDED;
  }
  const fromUrl = new URL(location.href).searchParams.get("choice");
  if (fromUrl !== null) {
    store("session", KEY, fromUrl);
  }
  return { ...RECOMMENDED, ...parse(fromUrl ?? stored("session", KEY)) };
}

export const choices: Choices = read();
