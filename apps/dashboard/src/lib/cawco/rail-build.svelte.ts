/**
 * The phone's sidebar, kept in its sheet: built before its first open (Shell
 * `railBuild`), the stage each of its parts opens at and the build its lists
 * take their rows from, and what it reads held while the sheet is closed
 * (`railHeld`), handed down the rail as context.
 */
import { createContext } from "svelte";
import type { IdleBuild } from "#lib/platform/idle-build.svelte.js";

/**
 * Each part's stage, in the order the sheet stands them: its header with
 * the first slice, then Search, Files and Fleet, Recent's rows, the
 * projects', the machines' and the footer, each list a row a slice from its
 * stage on.
 */
export const RAIL_STAGE = {
  places: 1,
  recent: 2,
  projects: 3,
  machines: 4,
  footer: 5,
} as const;

/** The last stage. */
export const RAIL_STAGES = RAIL_STAGE.footer;

/** The kept sheet's rail, as its parts read it. */
export interface KeptRail {
  /** The build its parts and lists are drawn by. */
  readonly build: IdleBuild;
  /** Counts the rail's refreshes while closed (Sidebar): each reads what is held again. */
  readonly fresh: number;
  /** The sheet is closed: nobody sees the rail. */
  readonly held: boolean;
}

const [keptRail, setKeptRail, hasKeptRail] = createContext<KeptRail>();

export { setKeptRail };

/** The kept sheet's rail, where it is; none elsewhere (the wide rail, the home page's Recent). */
export const railKept = (): KeptRail | undefined =>
  hasKeptRail() ? keptRail() : undefined;

/**
 * `read`, derived, held at its last value while the kept sheet is closed,
 * read again at each refresh the rail asks for while closed (`fresh`) and
 * as it opens; elsewhere, derived as it is.
 *
 * A closed sheet's rail is still built, so every list in it was derived
 * again at each change of the board, and each row it touched re-rendered,
 * for a rail nobody sees: one live tick, the board re-adopted with one
 * session's times moved, took 37ms through its flush at 4x CPU in Chromium
 * with the rail kept and 20ms without it (sidebar-lab tick, one tab). Held,
 * the derivation reads only `held` and `fresh` while the sheet is closed, so
 * nothing it read before wakes it, and the rows it handed out are the ones
 * the rail holds. Held from one open to the next, the open took in all
 * that changed between, in the tap: a later open after 20s closed came
 * 622-872ms after the tap at 29 tabs in WebKit, against 250ms 2.5s after
 * (sidebar-lab sheet); so the rail reads it again while closed, in idle
 * time once something it is read from has changed, at most a second
 * apart (Sidebar `refreshHeld`), and an open takes in a second's changes
 * at most. The open reads it once, in the tap's flush, while the sheet's
 * content still stands skipped: rows that came or went meanwhile are simply
 * there or gone (motion/rows `skippedAt`), as they were when each change
 * reached a closed rail.
 */
export function railHeld<T>(read: () => T): () => T {
  const kept = railKept();
  if (!kept) {
    const value = $derived.by(read);
    return () => value;
  }
  let last: { value: T; fresh: number } | null = null;
  const value = $derived.by(() => {
    if (last && kept.held && last.fresh === kept.fresh) {
      return last.value;
    }
    last = { value: read(), fresh: kept.fresh };
    return last.value;
  });
  return () => value;
}
