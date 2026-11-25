/**
 * The shape each skeleton slot was last seen in, so the next request draws
 * its skeleton in that shape and nothing moves when the content lands.
 *
 * After each load the page keeps, per slot (a stable key the screen gives
 * its SkeletonOf), the list's row count and each run of words' line count.
 * Kept as the folder tabs' measured shapes are (fluid-tabs/fold-memory.ts):
 * in localStorage, the source, and as a pref (lib/platform/prefs.ts), the
 * server's copy, an HttpOnly cookie only the server writes and reads. On
 * the next request the server reads it (`readSkeletonShapes`, in a server
 * `load`) and the page hands it to its skeletons (`setSkeletonShapes`). A
 * slot with no shape kept is drawn in the typical shape its screen passes
 * in. Keyed by slot, the most recently landed last, as many as fit a
 * cookie: the oldest go first.
 */

import type { Cookies } from "@sveltejs/kit";
import { createContext } from "svelte";
import {
  keepPrefs,
  newestThatFit,
  prefCookie,
  SKELETON_SHAPES_PREF,
} from "#lib/platform/prefs.js";
import { store, stored } from "#lib/platform/storage.js";
import type { SkeletonShape } from "./bones/draw.js";

export type { SkeletonShape } from "./bones/draw.js";

/** Every remembered slot's shape, by slot key. */
type SkeletonShapes = Record<string, SkeletonShape>;

/** A slot key: letters, digits and `: . / _ -`. */
export const SLOT_KEY = /^[\w:./-]+$/u;

/**
 * Skeletons land together (a screen's every slot as its data comes): their
 * shapes go to the server as one request once they have, not one each.
 */
const SEND_AFTER = 120;

/** A shape as kept: the row count (or none), then each run's line count. */
type Kept = [number | null, ...number[]];

const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

const isKept = (value: unknown): value is Kept =>
  Array.isArray(value) &&
  value.length >= 1 &&
  (value[0] === null || isCount(value[0])) &&
  value.slice(1).every((n) => isCount(n) && n >= 1);

const shapeOf = ([count, ...lines]: Kept): SkeletonShape => ({
  ...(count === null ? {} : { count }),
  ...(lines.length ? { lines } : {}),
});

const keptOf = (shape: SkeletonShape): Kept => [
  shape.count ?? null,
  ...(shape.lines ?? []),
];

const entriesOf = (raw: string | null | undefined): [string, Kept][] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? Object.entries(parsed).filter(
          (entry): entry is [string, Kept] =>
            SLOT_KEY.test(entry[0]) && isKept(entry[1])
        )
      : [];
  } catch {
    return [];
  }
};

/** The remembered shapes, read on the server from the request's pref. */
export function readSkeletonShapes(
  cookies: Pick<Cookies, "get">,
  url: { hostname: string; protocol: string }
): SkeletonShapes {
  return Object.fromEntries(
    entriesOf(cookies.get(prefCookie(SKELETON_SHAPES_PREF, url))).map(
      ([slot, kept]) => [slot, shapeOf(kept)]
    )
  );
}

let sending: ReturnType<typeof setTimeout> | undefined;

/**
 * Keeps the slot's shape once its content has landed (client only); a slot
 * key outside `SLOT_KEY` is a fault in its screen.
 */
export function rememberSkeletonShape(
  slot: string,
  shape: SkeletonShape
): void {
  if (!SLOT_KEY.test(slot)) {
    throw new Error(
      `A skeleton slot key holds only letters, digits and : . / _ - ("${slot}")`
    );
  }
  const kept = new Map(entriesOf(stored("local", SKELETON_SHAPES_PREF)));
  const next = keptOf(shape);
  const was = kept.get(slot);
  if (was?.length === next.length && was.every((n, i) => n === next[i])) {
    return;
  }
  kept.delete(slot);
  kept.set(slot, next);
  const fit = newestThatFit([...kept]);
  store("local", SKELETON_SHAPES_PREF, fit);
  clearTimeout(sending);
  sending = setTimeout(
    () =>
      keepPrefs({
        [SKELETON_SHAPES_PREF]: stored("local", SKELETON_SHAPES_PREF) ?? fit,
      }),
    SEND_AFTER
  );
}

const [getShapes, setShapes, hasShapes] = createContext<() => SkeletonShapes>();

/**
 * Hands the page's remembered shapes to every SkeletonOf under it: a
 * getter, so shapes read again by a later load reach them.
 */
export function setSkeletonShapes(shapes: () => SkeletonShapes): void {
  setShapes(shapes);
}

/** The remembered shapes above this component, read at its start; none where no page set them. */
export function skeletonShapes(): () => SkeletonShapes {
  return hasShapes() ? getShapes() : () => ({});
}
