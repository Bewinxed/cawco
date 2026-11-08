/**
 * What Recent draws of the transcripts the machines store (core
 * `StoredRecent`), kept by the hub so no page asks a machine for its
 * catalog: each machine's catalog as find keeps it (find.ts, read off the
 * agent's index of its transcripts, agent catalog-index.ts), the ones in a
 * project's folder there (core `projectAt`), and the hub's word on them: the
 * sessions wrapping them that the board no longer lists (`behind`), and the
 * ones a person started that no session wraps.
 *
 * A machine's catalog is read as it registers, and again when it says a
 * transcript moved (core `CatalogMovedFrame`) that may change the list: one
 * it has not listed yet, or one no session of the hub wraps. The list is
 * worked out again a beat after anything that can move it (a catalog read,
 * a board publish, a project's places) and told to every dashboard whole
 * (`stored` frame) only when it changed. The layout's server load reads it
 * with the board (`GET /api/stored`), so its rows are in the first paint.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?"
 */

import { type MemberProject, projectAt } from "@cawco/core/project-membership";
import type {
  InstanceRow,
  StoredRecent,
  StoredTranscript,
} from "@cawco/core/protocol";
import { CAWCO_SCRATCH_TAG } from "@cawco/core/scratch-tag";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";

export interface StoredRecentDeps {
  /** Runs `run` once after `ms`, on the hub's lifetime. */
  after: (ms: number, run: () => void) => void;
  /** The sessions the hub holds behind these harness keys (server.ts `storedSessions`). */
  behind: (keys: string[]) => { rows: InstanceRow[]; unwrapped: string[] };
  /** One machine's catalog as last read (find.ts). */
  catalogOf: (machineId: string) => readonly NeutralSessionInfo[];
  /** Every machine's id. */
  machines: () => readonly string[];
  /** Every live project, with its places. */
  projects: () => readonly MemberProject[];
  /** Every dashboard is told the list, whole. */
  publish: (stored: StoredRecent) => void;
  /** Reads one machine's catalog again (find.ts). */
  relist: (machineId: string) => Promise<void>;
  /** Whether a session of the hub wraps this harness key. */
  wrapped: (sessionId: string) => boolean;
}

/** How long after a move the list is worked out again: a burst is one. */
const SETTLE_MS = 300;

export function createStoredRecent(deps: StoredRecentDeps) {
  let told = "";
  let settling = false;

  /** The list as it stands now. */
  const now = (): StoredRecent => {
    const projects = deps.projects();
    const inProjects: StoredTranscript[] = [];
    for (const machineId of deps.machines()) {
      for (const info of deps.catalogOf(machineId)) {
        if (info.tag === CAWCO_SCRATCH_TAG) {
          continue;
        }
        const project = projectAt(projects, { machineId, cwd: info.cwd ?? "" });
        if (project) {
          inProjects.push({ machineId, projectId: project.id, info });
        }
      }
    }
    const keys = [...new Set(inProjects.map((one) => one.info.sessionId))];
    const { rows, unwrapped } = deps.behind(keys);
    const alone = new Set(unwrapped);
    return {
      rows,
      transcripts: inProjects.filter(
        (one) =>
          one.info.startedBy === "person" && alone.has(one.info.sessionId)
      ),
    };
  };

  return {
    /** The list as it stands now: what the layout's server load reads. */
    now,
    /**
     * Something that can move the list moved (a catalog read, a board
     * publish, a project's places): it is worked out again a beat from now,
     * and told if it changed.
     */
    moved(): void {
      if (settling) {
        return;
      }
      settling = true;
      deps.after(SETTLE_MS, () => {
        settling = false;
        const stored = now();
        const text = JSON.stringify(stored);
        if (text !== told) {
          told = text;
          deps.publish(stored);
        }
      });
    },
    /**
     * The machine says these transcripts moved: its catalog is read again
     * when one may change the list (one not in its catalog yet, or one no
     * session of the hub wraps).
     */
    heard(machineId: string, sessions: readonly string[]): Promise<void> {
      const held = new Set(
        deps.catalogOf(machineId).map((info) => info.sessionId)
      );
      return sessions.some((id) => !(held.has(id) && deps.wrapped(id)))
        ? deps.relist(machineId)
        : Promise.resolve();
    },
  };
}
