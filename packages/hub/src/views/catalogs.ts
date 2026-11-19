/**
 * Each machine's catalog of the sessions it keeps (core
 * `NeutralSessionInfo`), as the views thread holds it: listed whole as the
 * machine registers (or on Try again), and kept from then on by what the
 * machine says moved (core `CatalogMovedFrame`): a moved transcript's facts
 * replace its entry, a removed one leaves. Find's stored conversations and
 * Recent's stored list read it (views/find-index.ts, views/stored.ts).
 */

import { detach } from "@cawco/core/detach";
import type { HarnessFailed, HarnessUnanswered } from "@cawco/core/frames";
import { machineLabel } from "@cawco/core/machine-names";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";

/**
 * How long after a listing that left a harness out for want of time the
 * machine is listed again, doubled each time it still does, up to
 * {@link ASK_AGAIN_MAX_MS}. The machine's listing goes on past the bound it
 * answered within and fills its index (agent catalog-index.ts), so the next
 * ask is quick. Our call. Seen 2026-11-19: Claude on obelisk, starved at a
 * restart by every dashboard reopening its conversations at once, listed
 * its 4,083 transcripts a moment after its 10 s ran out, and the notice
 * stood until someone pressed Try again.
 */
const ASK_AGAIN_FIRST_MS = 15_000;
const ASK_AGAIN_MAX_MS = 5 * 60_000;

/** A machine's listing as the machine answered it, or why it gave none. */
export type Listed =
  | {
      failed: HarnessFailed[];
      sessions: NeutralSessionInfo[];
      unanswered: HarnessUnanswered[];
    }
  | { error: string };

/** One machine's catalog: its sessions by harness session id, and the harnesses its last listing left out. */
interface Catalog {
  failed: HarnessFailed[];
  sessions: Map<string, NeutralSessionInfo>;
  unanswered: HarnessUnanswered[];
}

export interface CatalogsDeps {
  /** A machine's hostname, for the log's words. */
  hostname: (machineId: string) => string;
  /** The machine's listing, asked of it (the hub's main thread holds its socket). */
  listStored: (machineId: string) => Promise<Listed>;
  /** These sessions of `machineId` moved in its catalog (every one: `all`). */
  moved: (machineId: string, sessionIds: readonly string[] | "all") => void;
}

export const createCatalogs = (deps: CatalogsDeps) => {
  const catalogs = new Map<string, Catalog>();
  /** Each machine's listing under way, to wait on rather than ask twice. */
  const reading = new Map<string, Promise<void>>();
  /** Each machine to be listed again, by its timer, with the wait after that one. */
  const again = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; waitMs: number }
  >();

  /**
   * After each listing of `machineId`, however it ended: while its catalog
   * holds a harness that did not answer in time, it is listed again after
   * a wait, longer each time, so a listing starved once is never held as
   * the machine's last word; a catalog whole again stops it.
   */
  const askAgain = (machineId: string): void => {
    const catalog = catalogs.get(machineId);
    if (!catalog || catalog.unanswered.length === 0) {
      again.delete(machineId);
      return;
    }
    const waitMs = again.get(machineId)?.waitMs ?? ASK_AGAIN_FIRST_MS;
    const timer = setTimeout(() => {
      detach(relist(machineId), `find: ${machineId}'s stored sessions again`);
    }, waitMs);
    again.set(machineId, {
      timer,
      waitMs: Math.min(waitMs * 2, ASK_AGAIN_MAX_MS),
    });
  };

  /**
   * Lists `machineId`'s stored sessions again. A harness that did not list
   * in time, or whose listing threw, keeps the sessions it listed last, and
   * is said by name ("claude on obelisk didn't answer within 10 s", "…
   * couldn't list its sessions: …"): never read as having none, and one
   * that did not answer in time is asked again ({@link askAgain}). A
   * listing under way is the one waited on.
   */
  const relist = (machineId: string): Promise<void> => {
    const under = reading.get(machineId);
    if (under !== undefined) {
      return under;
    }
    // This listing stands for the one a timer owed.
    clearTimeout(again.get(machineId)?.timer);
    const read = deps
      .listStored(machineId)
      .then((answer) => {
        if ("error" in answer) {
          throw new Error(answer.error);
        }
        const known = catalogs.get(machineId);
        const silent = new Set(
          [...answer.unanswered, ...answer.failed].map((one) => one.harness)
        );
        const kept = [...(known?.sessions.values() ?? [])].filter((info) =>
          silent.has(info.harness)
        );
        const keptOf = (harness: string) =>
          kept.filter((info) => info.harness === harness).length;
        const name = machineLabel(deps.hostname(machineId));
        for (const { harness, after } of answer.unanswered) {
          console.info(
            `[find] ${harness} on ${name} didn't answer within ${after / 1000} s; its stored sessions are kept as last read (${keptOf(harness)})`
          );
        }
        for (const { harness, error } of answer.failed) {
          console.info(
            `[find] ${harness} on ${name} couldn't list its sessions: ${error}; its stored sessions are kept as last read (${keptOf(harness)})`
          );
        }
        catalogs.set(machineId, {
          failed: answer.failed,
          unanswered: answer.unanswered,
          sessions: new Map(
            [...answer.sessions, ...kept].map((info) => [info.sessionId, info])
          ),
        });
        deps.moved(machineId, "all");
      })
      .finally(() => {
        reading.delete(machineId);
        askAgain(machineId);
      });
    reading.set(machineId, read);
    return read;
  };

  return {
    relist,
    /**
     * The machine said these transcripts moved, each as it reads now, and
     * these left: kept in its catalog by key. A machine never listed yet is
     * listed whole instead.
     */
    moved(
      machineId: string,
      infos: readonly NeutralSessionInfo[],
      removed: readonly string[]
    ): Promise<void> {
      const catalog = catalogs.get(machineId);
      if (!catalog) {
        return relist(machineId);
      }
      for (const info of infos) {
        catalog.sessions.set(info.sessionId, info);
      }
      for (const sessionId of removed) {
        catalog.sessions.delete(sessionId);
      }
      deps.moved(machineId, [
        ...infos.map((info) => info.sessionId),
        ...removed,
      ]);
      return Promise.resolve();
    },
    /** A machine the hub no longer knows: its catalog let go, and every session of it with it. */
    forget(machineId: string): void {
      clearTimeout(again.get(machineId)?.timer);
      again.delete(machineId);
      if (catalogs.delete(machineId)) {
        deps.moved(machineId, "all");
      }
    },
    /** Whether `machineId`'s catalog was ever read. */
    known: (machineId: string): boolean => catalogs.has(machineId),
    /** Every machine whose catalog was read. */
    machines: (): string[] => [...catalogs.keys()],
    /** One machine's sessions as last read; none before its first read. */
    sessions: (machineId: string): Iterable<NeutralSessionInfo> =>
      catalogs.get(machineId)?.sessions.values() ?? [],
    /** One session of a machine's catalog, by its harness session id. */
    session: (
      machineId: string,
      sessionId: string
    ): NeutralSessionInfo | undefined =>
      catalogs.get(machineId)?.sessions.get(sessionId),
    /** The harnesses `machineId`'s last listing left out, as it said them. */
    leftOut: (
      machineId: string
    ): Pick<Catalog, "failed" | "unanswered"> | undefined =>
      catalogs.get(machineId),
  };
};

export type Catalogs = ReturnType<typeof createCatalogs>;
