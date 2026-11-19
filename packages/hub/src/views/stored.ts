/**
 * Recent's stored list (core `StoredRecent`) as the views thread keeps it:
 * each machine's transcripts in a project's folder there (core `projectAt`),
 * the sessions of the hub that wrap them, and the ones a person started that
 * no session wraps. Kept by key: a moved transcript is placed again alone
 * (views/catalogs.ts), a session's row is read again when the change log
 * names it, a project's places place every transcript again. What it says
 * goes to the hub's thread when it changed (hub stored-recent.ts), which
 * lays the wrapping sessions the board no longer lists as the board does.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?"
 */
import { projectAt } from "@cawco/core/project-membership";
import { personsOwn, type StoredTranscript } from "@cawco/core/protocol";
import { CAWCO_SCRATCH_TAG } from "@cawco/core/scratch-tag";
import { withAncestors } from "../board-ancestors";
import { isHubParent } from "../work-item-state";
import type { Catalogs } from "./catalogs";
import { sessionKey } from "./find-index";
import type { ViewProject, ViewsDb, WrapRow } from "./read";

/** What the stored list says, before the hub's thread lays its rows. */
export interface StoredHeld {
  /**
   * The sessions wrapping a listed transcript, and the sessions they nest
   * under, whose chain tops at a person's own session: the board's own
   * rows are left out of them on the hub's thread, which knows them.
   */
  candidates: string[];
  transcripts: StoredTranscript[];
}

export interface StoredDeps {
  catalogs: Catalogs;
  db: ViewsDb;
  projects: () => Iterable<ViewProject>;
  /** The list changed: told to the hub's thread. */
  told: (held: StoredHeld) => void;
}

/** How long after a move the list is said again: a burst is one. Our call, as before. */
const SETTLE_MS = 300;

export const createStoredList = (deps: StoredDeps) => {
  const { catalogs, db } = deps;
  /** Each machine's transcript in a project's folder, by `machineId:sessionId`. */
  const placed = new Map<string, StoredTranscript>();
  /** How many placed transcripts carry each harness session id. */
  const placedSessions = new Map<string, number>();
  /** The kept sessions wrapping each placed harness session id, by id. */
  const wraps = new Map<string, Map<string, WrapRow>>();
  /** The harness session id each wrapping session in {@link wraps} is held under. */
  const wrapOf = new Map<string, string>();
  /** Each kept session read as an ancestor, or null when the hub keeps none by that id. */
  const ancestors = new Map<string, WrapRow | null>();
  let said = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unplace = (key: string): void => {
    const was = placed.get(key);
    if (!was) {
      return;
    }
    placed.delete(key);
    const { sessionId } = was.info;
    const left = (placedSessions.get(sessionId) ?? 1) - 1;
    if (left > 0) {
      placedSessions.set(sessionId, left);
    } else {
      placedSessions.delete(sessionId);
      for (const id of wraps.get(sessionId)?.keys() ?? []) {
        wrapOf.delete(id);
      }
      wraps.delete(sessionId);
    }
  };

  /** One machine's transcript placed again: in the project whose place holds it, or in none. */
  const place = (
    machineId: string,
    sessionId: string,
    projects: ViewProject[],
    fresh: Set<string>
  ): void => {
    const key = sessionKey(machineId, sessionId);
    unplace(key);
    const info = catalogs.session(machineId, sessionId);
    if (!info || info.tag === CAWCO_SCRATCH_TAG) {
      return;
    }
    const project = projectAt(projects, { machineId, cwd: info.cwd ?? "" });
    if (!project) {
      return;
    }
    placed.set(key, { machineId, projectId: project.id, info });
    const count = placedSessions.get(sessionId) ?? 0;
    placedSessions.set(sessionId, count + 1);
    if (count === 0) {
      fresh.add(sessionId);
    }
  };

  /** The wrapping sessions of these newly placed harness session ids, read by key. */
  const readWraps = (sessionIds: Set<string>): void => {
    if (sessionIds.size === 0) {
      return;
    }
    for (const sessionId of sessionIds) {
      wraps.set(sessionId, new Map());
    }
    for (const row of db.wrapping([...sessionIds])) {
      const byId = row.sessionId ? wraps.get(row.sessionId) : undefined;
      if (row.sessionId && byId) {
        byId.set(row.id, row);
        wrapOf.set(row.id, row.sessionId);
      }
    }
  };

  /** Ancestors by id, the ones not read yet read by key. */
  const ancestorsOf = (ids: string[]): ReadonlyMap<string, WrapRow> => {
    const unread = ids.filter((id) => !ancestors.has(id));
    if (unread.length > 0) {
      const read = new Map(db.wrapRows(unread).map((row) => [row.id, row]));
      for (const id of unread) {
        ancestors.set(id, read.get(id) ?? null);
      }
    }
    const out = new Map<string, WrapRow>();
    for (const id of ids) {
      const row = ancestors.get(id);
      if (row) {
        out.set(id, row);
      }
    }
    return out;
  };

  /** The list as it stands. */
  const held = (): StoredHeld => {
    const wrapping = [...wraps.values()].flatMap((byId) => [...byId.values()]);
    const wrapped = new Set(wrapping.map((row) => row.sessionId));
    const nested = new Map(
      withAncestors(wrapping, ancestorsOf, isHubParent).map(
        (row) => [row.id, row] as const
      )
    );
    /** The session at the top of a row's chain. */
    const topOf = (row: WrapRow): WrapRow => {
      const seen = new Set<string>();
      let at = row;
      while (at.parentInstanceId && !seen.has(at.id)) {
        seen.add(at.id);
        const parent = nested.get(at.parentInstanceId);
        if (!parent) {
          break;
        }
        at = parent;
      }
      return at;
    };
    return {
      candidates: [...nested.values()]
        .filter((row) => personsOwn(topOf(row)))
        .map((row) => row.id),
      transcripts: [...placed.values()].filter(
        (one) =>
          one.info.startedBy === "person" && !wrapped.has(one.info.sessionId)
      ),
    };
  };

  /** Said again a beat after a move, when it changed. */
  const moved = (): void => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      const now = held();
      const words = JSON.stringify(now);
      if (words !== said) {
        said = words;
        deps.told(now);
      }
    }, SETTLE_MS);
  };

  return {
    /** The list as it stands: what the hub's thread lays when it has no word yet. */
    held,
    /** A machine's catalog moved: these transcripts placed again (all: every one of it). */
    catalogMoved(
      machineId: string,
      sessionIds: readonly string[] | "all"
    ): void {
      const projects = [...deps.projects()];
      const fresh = new Set<string>();
      if (sessionIds === "all") {
        const prefix = `${machineId}:`;
        for (const key of [...placed.keys()]) {
          if (key.startsWith(prefix)) {
            unplace(key);
          }
        }
        for (const info of catalogs.sessions(machineId)) {
          place(machineId, info.sessionId, projects, fresh);
        }
      } else {
        for (const sessionId of sessionIds) {
          place(machineId, sessionId, projects, fresh);
        }
      }
      readWraps(fresh);
      moved();
    },
    /** These sessions' rows moved: their wrapping and their place as an ancestor read again by key. */
    sessionsMoved(ids: string[]): void {
      const rows = new Map(db.wrapRows(ids).map((row) => [row.id, row]));
      let touched = false;
      for (const id of ids) {
        if (ancestors.delete(id)) {
          touched = true;
        }
        const was = wrapOf.get(id);
        if (was !== undefined) {
          wraps.get(was)?.delete(id);
          wrapOf.delete(id);
          touched = true;
        }
        const row = rows.get(id);
        const byId =
          row?.sessionId && row.kind !== "summariser"
            ? wraps.get(row.sessionId)
            : undefined;
        if (row?.sessionId && byId) {
          byId.set(id, row);
          wrapOf.set(id, row.sessionId);
          touched = true;
        }
      }
      if (touched) {
        moved();
      }
    },
    /** A project's places moved: every transcript placed again. */
    projectsMoved(): void {
      const machines = new Set(
        [...placed.values()].map((one) => one.machineId)
      );
      for (const machineId of catalogs.machines()) {
        machines.add(machineId);
      }
      for (const machineId of machines) {
        this.catalogMoved(machineId, "all");
      }
    },
  };
};
