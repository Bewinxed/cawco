/**
 * What Recent draws of the transcripts the machines store (core
 * `StoredRecent`), as the hub's thread holds it: the views thread keeps the
 * list (views/stored.ts), off this thread, from each machine's catalog
 * (views/catalogs.ts) and the change log, and tells it here whenever it
 * changed; here the sessions wrapping its transcripts that the board no
 * longer lists are laid as the board lays its rows (board.ts `storedRows`).
 *
 * Kept by key, as the board keeps its sessions: a dashboard is sent the
 * list whole once, as its socket opens (dashboard-greeting.ts), and then a
 * `stored` frame of only the rows and transcripts that moved, and none when
 * nothing did. A row is laid again when the views thread says the list
 * changed, and when the board says what a row is laid from moved
 * ({@link rowsMoved}: a write, a row leaving or joining the board, a
 * machine's presence). The layout's server load reads it with the board
 * (`GET /api/stored`), so its rows are in the first paint.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?"
 */

import type { BoardKeyed } from "@cawco/core/frames";
import type {
  InstanceRow,
  StoredRecent,
  StoredTranscript,
} from "@cawco/core/protocol";
import type { StoredHeld } from "./views/stored";

/** What moved of the list, by key: a row by its id, a transcript by `machineId:sessionId`. */
export interface StoredMoved {
  rows: BoardKeyed<InstanceRow>;
  transcripts: BoardKeyed<StoredTranscript>;
}

export interface StoredRecentDeps {
  /** Every dashboard is told what moved; never called with nothing moved. */
  publish: (moved: StoredMoved) => void;
  /** The sessions among these the board does not list, laid as the board lays them (board.ts `storedRows`). */
  rows: (candidates: string[]) => InstanceRow[];
  /** The board takes what the database logged now (board.ts `settle`): what it says moved is heard first. */
  settle: () => void;
}

/** An entry as last told, with its JSON: an entry laid again the same moves nothing. */
interface Told<Entry> {
  entry: Entry;
  words: string;
}

/** A transcript's key: one machine's copy of a harness session. */
const transcriptKey = (one: StoredTranscript): string =>
  `${one.machineId}:${one.info.sessionId}`;

/**
 * One keyed collection as told: `lay` puts `entries` (the keys `within`
 * names, the ones it leaves out gone) and answers what moved.
 */
const keyedTold = <Entry>(key: (entry: Entry) => string) => {
  const told = new Map<string, Told<Entry>>();
  return {
    told,
    lay(
      entries: readonly Entry[],
      within: Iterable<string>
    ): BoardKeyed<Entry> {
      const moved: BoardKeyed<Entry> = { upserts: [], removed: [] };
      const laid = new Set<string>();
      for (const entry of entries) {
        const id = key(entry);
        laid.add(id);
        const words = JSON.stringify(entry);
        if (told.get(id)?.words !== words) {
          told.set(id, { entry, words });
          moved.upserts.push(entry);
        }
      }
      for (const id of within) {
        if (!laid.has(id) && told.delete(id)) {
          moved.removed.push(id);
        }
      }
      return moved;
    },
    values: (): Entry[] => [...told.values()].map((one) => one.entry),
  };
};

const movedAny = ({ rows, transcripts }: StoredMoved): boolean =>
  rows.upserts.length > 0 ||
  rows.removed.length > 0 ||
  transcripts.upserts.length > 0 ||
  transcripts.removed.length > 0;

const none = <Entry>(): BoardKeyed<Entry> => ({ upserts: [], removed: [] });

export function createStoredRecent(deps: StoredRecentDeps) {
  /** The sessions the views thread last named: the rows this list may hold. */
  let candidates = new Set<string>();
  const rows = keyedTold<InstanceRow>((row) => row.id);
  const transcripts = keyedTold<StoredTranscript>(transcriptKey);

  const tell = (moved: StoredMoved): void => {
    if (movedAny(moved)) {
      deps.publish(moved);
    }
  };

  /** The list as it stands now. */
  const now = (): StoredRecent => {
    deps.settle();
    return { rows: rows.values(), transcripts: transcripts.values() };
  };

  return {
    /** The list as it stands now, whole: what the layout's server load reads, and a dashboard is greeted with. */
    now,
    /** The views thread says the list changed: every row laid again, and every dashboard told what moved. */
    told(next: StoredHeld): void {
      deps.settle();
      candidates = new Set(next.candidates);
      tell({
        rows: rows.lay(deps.rows(next.candidates), [...rows.told.keys()]),
        transcripts: transcripts.lay(next.transcripts, [
          ...transcripts.told.keys(),
        ]),
      });
    },
    /**
     * What these sessions are laid from moved, or the sessions of these
     * machines (board.ts `storedOwed`): each of the list's own laid again,
     * every dashboard told what moved.
     */
    rowsMoved(ids: Iterable<string>, machines: ReadonlySet<string>): void {
      const owed = new Set<string>();
      for (const id of ids) {
        if (candidates.has(id)) {
          owed.add(id);
        }
      }
      if (machines.size > 0) {
        for (const { entry } of rows.told.values()) {
          if (machines.has(entry.machineId)) {
            owed.add(entry.id);
          }
        }
      }
      if (owed.size === 0) {
        return;
      }
      tell({
        rows: rows.lay(deps.rows([...owed]), owed),
        transcripts: none(),
      });
    },
  };
}
