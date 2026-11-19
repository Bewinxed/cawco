/**
 * Each machine's catalog of the sessions it keeps (core
 * `NeutralSessionInfo`), as the views thread holds it: listed whole as the
 * machine registers (or on Try again), and kept from then on by what the
 * machine says moved (core `CatalogMovedFrame`): a moved transcript's facts
 * replace its entry, a removed one leaves. Find's stored conversations and
 * Recent's stored list read it (views/find-index.ts, views/stored.ts).
 */

import type { HarnessFailed, HarnessUnanswered } from "@cawco/core/frames";
import { machineLabel } from "@cawco/core/machine-names";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";

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

  /**
   * Lists `machineId`'s stored sessions again. A harness that did not list
   * in time, or whose listing threw, keeps the sessions it listed last, and
   * is said by name ("claude on obelisk didn't answer within 10 s", "…
   * couldn't list its sessions: …"): never read as having none. A listing
   * under way is the one waited on.
   */
  const relist = (machineId: string): Promise<void> => {
    const under = reading.get(machineId);
    if (under !== undefined) {
      return under;
    }
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
      .finally(() => reading.delete(machineId));
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
