/**
 * Each machine's catalog of the sessions it keeps (core
 * `NeutralSessionInfo`), as the views thread holds it: listed whole as the
 * machine registers (or on Try again), and kept from then on by what the
 * machine says moved (core `CatalogMovedFrame`): a moved transcript's facts
 * replace its entry, a removed one leaves. Find's stored conversations and
 * Recent's stored list read it (views/find-index.ts, views/stored.ts).
 */

import type { BackoffPolicy } from "@cawco/core/backoff";
import { backoffSchedule } from "@cawco/core/effect/backoff-schedule";
import { makeJoin } from "@cawco/core/effect/join";
import type { HarnessFailed, HarnessUnanswered } from "@cawco/core/frames";
import { machineLabel } from "@cawco/core/machine-names";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import { Effect, type Fiber, Schema } from "effect";
import type { HubLifetimeShape } from "../lifetime";

/**
 * How long after a listing that left a harness out for want of time the
 * machine is listed again (core backoff.ts): 15 s, doubled each time it
 * still does, up to 5 minutes, and given up after eight, about 23 minutes,
 * when the notice's Try again is the person's. The machine's listing goes
 * on past the bound it answered within and fills its index (agent
 * catalog-index.ts), so the next ask is quick. Our call. Seen 2026-11-19:
 * Claude on obelisk, starved at a restart by every dashboard reopening its
 * conversations at once, listed its 4,083 transcripts a moment after its
 * 10 s ran out, and the notice stood until someone pressed Try again.
 */
const ASK_AGAIN: BackoffPolicy = {
  firstMs: 15_000,
  mostMs: 5 * 60_000,
  giveUp: { afterTries: 8 },
};

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
  /** The harnesses every listing of the machine left out: none of their sessions was ever read, so none is kept. */
  neverListed: ReadonlySet<string>;
  sessions: Map<string, NeutralSessionInfo>;
  unanswered: HarnessUnanswered[];
}

/** A machine gave no listing: its words why. */
class ListingFailed extends Schema.TaggedError<ListingFailed>()(
  "ListingFailed",
  { message: Schema.String }
) {}

/** A machine's catalog still holds a harness that did not answer in time. */
class StillShort extends Schema.TaggedError<StillShort>()("StillShort", {}) {}

export interface CatalogsDeps {
  /** A machine's hostname, for the log's words. */
  hostname: (machineId: string) => string;
  /** The views thread's own lifetime (views/worker.ts): listings run on it, and the asks again. */
  lifetime: Pick<HubLifetimeShape, "fork" | "run">;
  /** The machine's listing, asked of it (the hub's main thread holds its socket). */
  listStored: (machineId: string) => Effect.Effect<Listed, Error>;
  /** These sessions of `machineId` moved in its catalog (every one: `all`). */
  moved: (machineId: string, sessionIds: readonly string[] | "all") => void;
}

export const createCatalogs = (deps: CatalogsDeps) => {
  const catalogs = new Map<string, Catalog>();
  /** Each machine's listing under way, to wait on rather than ask twice. */
  const reading = makeJoin<string, void, Error>();
  /** Each machine being listed again ({@link askAgain}), by the fiber that does it. */
  const again = new Map<string, Fiber.Fiber<void>>();
  /** Listings of each machine so far, so an ask again that a listing overtook asks nothing more. */
  const listings = new Map<string, number>();

  /** Whether `machineId`'s catalog holds a harness that did not answer in time. */
  const short = (machineId: string): boolean =>
    (catalogs.get(machineId)?.unanswered.length ?? 0) > 0;

  /**
   * Lists `machineId`'s stored sessions again, as one listing however many
   * ask while it runs. A harness that did not list in time, or whose
   * listing threw, keeps the sessions it listed last, and is said by name
   * ("claude on obelisk didn't answer within 10 s", "… couldn't list its
   * sessions: …"): never read as having none.
   */
  const listing = (machineId: string) =>
    reading.run(
      machineId,
      deps.listStored(machineId).pipe(
        Effect.flatMap((answer) =>
          "error" in answer
            ? Effect.fail(new ListingFailed({ message: answer.error }))
            : Effect.succeed(answer)
        ),
        Effect.flatMap((answer) => {
          const known = catalogs.get(machineId);
          const silent = new Set(
            [...answer.unanswered, ...answer.failed].map((one) => one.harness)
          );
          const kept = [...(known?.sessions.values() ?? [])].filter((info) =>
            silent.has(info.harness)
          );
          const neverListed: ReadonlySet<string> = new Set(
            [...silent].filter(
              (harness) => !known || known.neverListed.has(harness)
            )
          );
          const keptWords = (harness: string) =>
            neverListed.has(harness)
              ? "it hasn't listed them yet, so none are kept"
              : `its stored sessions are kept as last read (${kept.filter((info) => info.harness === harness).length})`;
          const name = machineLabel(deps.hostname(machineId));
          for (const { harness, after } of answer.unanswered) {
            console.info(
              `[find] ${harness} on ${name} didn't answer within ${after / 1000} s; ${keptWords(harness)}`
            );
          }
          for (const { harness, error } of answer.failed) {
            console.info(
              `[find] ${harness} on ${name} couldn't list its sessions: ${error}; ${keptWords(harness)}`
            );
          }
          catalogs.set(machineId, {
            failed: answer.failed,
            neverListed,
            unanswered: answer.unanswered,
            sessions: new Map(
              [...answer.sessions, ...kept].map((info) => [
                info.sessionId,
                info,
              ])
            ),
          });
          deps.moved(machineId, "all");
          return Effect.void;
        }),
        Effect.ensuring(
          Effect.sync(() => {
            listings.set(machineId, (listings.get(machineId) ?? 0) + 1);
          })
        )
      )
    );

  /**
   * While `machineId`'s catalog holds a harness that did not answer in
   * time, it is listed again after a wait, longer each time ({@link
   * ASK_AGAIN}), so a listing starved once is never held as the machine's
   * last word. A catalog whole again ends it, and past the policy's end it
   * waits on the person's Try again or the machine's next register. A
   * listing asked meanwhile stands for the one the wait owed: the count
   * goes on, and no second listing follows it.
   */
  const askAgain = (machineId: string): void => {
    if (!short(machineId)) {
      const asking = again.get(machineId);
      again.delete(machineId);
      asking?.interruptUnsafe();
      return;
    }
    if (again.has(machineId)) {
      return;
    }
    let seen = listings.get(machineId) ?? 0;
    const attempt = Effect.suspend(() => {
      const overtaken = (listings.get(machineId) ?? 0) !== seen;
      return overtaken ? Effect.void : listing(machineId);
    }).pipe(
      // A listing that failed is as short as one a harness was slow for.
      Effect.ignore,
      Effect.flatMap(() => {
        seen = listings.get(machineId) ?? 0;
        return short(machineId) ? Effect.fail(new StillShort()) : Effect.void;
      })
    );
    // The listing that found it short was the first try.
    let first = true;
    const tried = Effect.suspend(() => {
      if (first) {
        first = false;
        return Effect.fail(new StillShort());
      }
      return attempt;
    });
    const asking = deps.lifetime.fork(
      `find: ${machineId}'s stored sessions again`,
      tried.pipe(
        Effect.retryOrElse(backoffSchedule(ASK_AGAIN), (_short, { tries }) =>
          Effect.sync(() => {
            console.info(
              `[find] ${machineLabel(deps.hostname(machineId))}'s listing left a harness out ${tries} times in a row; it is listed again on Try again or its next register`
            );
          })
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (again.get(machineId) === asking) {
              again.delete(machineId);
            }
          })
        )
      )
    );
    if (asking.pollUnsafe() === undefined) {
      again.set(machineId, asking);
    }
  };

  /**
   * Lists `machineId`'s stored sessions again ({@link listing}), and then,
   * however it ended, asks again while a harness is left out ({@link
   * askAgain}). A listing under way is the one waited on.
   */
  const relist = (machineId: string): Promise<void> =>
    deps.lifetime.run(
      listing(machineId).pipe(
        Effect.ensuring(Effect.sync(() => askAgain(machineId)))
      )
    );

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
      again.get(machineId)?.interruptUnsafe();
      again.delete(machineId);
      listings.delete(machineId);
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
    ): Pick<Catalog, "failed" | "neverListed" | "unanswered"> | undefined =>
      catalogs.get(machineId),
  };
};

export type Catalogs = ReturnType<typeof createCatalogs>;
