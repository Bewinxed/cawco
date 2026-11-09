/** Messages sent to a session: recorded, owed, held, answered. */

import type { Envelope, SendPayload } from "@cawco/core/protocol";
import type { NeutralUserMessage } from "@cawco/core/session-messages";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { DbCore } from "./core";
import { dataMigrations, instances, sentMessages } from "./schema";
import type { SendHold } from "./stored-types";

/** Ids looked up per statement (bound twice), well under SQLite's variable limit. */
const SENDS_FOR_BATCH = 500;

export type SentMessageRow = typeof sentMessages.$inferSelect;

/**
 * `instances.turn_open_at` of a session from before the hub kept the turn it
 * had open (migration `turn_open_at`): whether that turn ended is its harness's
 * transcript's word, not the hub's.
 */
export const TURN_UNRECORDED = -1;

export interface SendsDb {
  /** The session's turn ended. */
  readonly closeTurn: (id: string) => void;
  /** When a session last started again fresh; null when it never did. */
  readonly freshStartOf: (id: string) => number | null;
  /**
   * The cut turn `from` was handed back at `at`, which is now the session's
   * open turn. False when the row no longer holds `from`: another hand-back
   * or a turn took its place.
   */
  readonly handBackTurn: (id: string, from: number, at: number) => boolean;
  /**
   * A pending send no process took, owed again whole (`envelope`) until the
   * session's next start; false when it is no longer pending.
   */
  readonly holdSend: (uuid: string, envelope: Envelope<SendPayload>) => boolean;
  /** Keeps a pending send whole, as its machine was handed it. */
  readonly keepEnvelope: (
    uuid: string,
    envelope: Envelope<SendPayload>
  ) => void;
  /**
   * What `id` was last sent, for `list_sessions` (session-facts.ts): the
   * newest turn it read, and the person's newest message to it in any state
   * (when the person last interacted with it). Null for none.
   */
  readonly latestSends: (id: string) => {
    person: SentMessageRow | null;
    read: SentMessageRow | null;
  };
  /** Keys a send to the id its harness stores it under. */
  readonly linkSend: (uuid: string, harnessId: string) => void;
  /**
   * Runs the one-time migration `name` over every stored send, in one
   * transaction, unless it has run (`data_migrations`): `rewrite` answers a
   * send's message as it is to be kept, or null to leave it as it is. How
   * many sends it changed; null when it had run already.
   */
  readonly migrateSendsOnce: (
    name: string,
    rewrite: (body: NeutralUserMessage) => NeutralUserMessage | null
  ) => number | null;
  /**
   * The session replied at `at`: every send it has read so far has its
   * answer ({@link personUnanswered}). Sends it has not read stay owed.
   */
  readonly noteAnswered: (id: string, at: Date) => void;
  /** Records that a session started again fresh, now. */
  readonly noteFreshStart: (id: string, at: number) => void;
  /**
   * The session's turn ended at `at`, on the hub's clock (`turnEndedAt`). A
   * `silent` turn (it ended on no_reply_needed, saying nothing) leaves
   * nothing unseen: when the owner had seen it through its last end, they
   * have seen it through this one (`seenAt`), so no screen lists it as news.
   * One whose last end is still unseen stays news, as it was. `wakesItself`:
   * the turn ended with work of its own that will start it again (core
   * `waitsOnItself`).
   */
  readonly noteTurnEnded: (
    id: string,
    at: Date,
    silent: boolean,
    wakesItself: boolean
  ) => void;
  /**
   * The session's turn is under way, heard at `at`: kept when no turn of
   * this launch is ({@link instances.turnOpenAt}). Returns whether it moved.
   */
  readonly openTurn: (id: string, at: number) => boolean;
  /**
   * A pending send its process went away without reading, owed again from
   * the envelope its record kept ({@link sentMessages.envelope}). False when
   * it is no longer pending or kept none (a record from before envelopes
   * were kept).
   */
  readonly oweAgain: (uuid: string) => boolean;
  /** The sends still owed to their machine ({@link sentMessages.owed}), pending, in the order accepted: a session's, or a machine's. */
  readonly owedSends: (
    of: { instanceId: string } | { machineId: string }
  ) => SentMessageRow[];
  /**
   * The sessions with a send owed to their machine whose hold is one of
   * `holds`, or none written yet (its keeping never said why): the ids
   * alone, by the pending sends' index, no send read whole.
   */
  readonly owedSessionsHeld: (holds: readonly SendHold[]) => string[];
  /** Every send still pending (accepted, not yet read by its session), each session's oldest first. */
  readonly pendingSends: () => SentMessageRow[];
  /**
   * The person's last message to the session, when it has no reply after it:
   * `read`, the session has it, or `pending`, it waits to reach it. His last
   * words are his newest send that reached it or waits to (a failed, replaced
   * or cancelled one never did), a turn's, not a note or a slash command,
   * which asks the harness and not the session. Null when none is owed.
   */
  readonly personUnanswered: (id: string) => "read" | "pending" | null;
  readonly recordSend: (
    send: typeof sentMessages.$inferInsert
  ) => SentMessageRow;
  /** One send's record, by its uuid. */
  readonly sendRecord: (uuid: string) => SentMessageRow | undefined;
  /**
   * The sends among these ids, matched by the send's uuid or by the id its
   * harness stored it under.
   */
  readonly sendsFor: (ids: string[]) => SentMessageRow[];
  /** A session's sends in these states, oldest accepted first. */
  readonly sendsIn: (
    instanceId: string,
    states: SentMessageRow["state"][]
  ) => SentMessageRow[];
  /** Takes a send's owed envelope, once: the envelope, or undefined when another took it first. */
  readonly takeOwedSend: (uuid: string) => Envelope<SendPayload> | undefined;
  /**
   * Pending sends handed to a machine before the hub kept each whole
   * ({@link sentMessages.envelope}): none once {@link keepEnvelope} has
   * given each its own, which a hub start does once.
   */
  readonly unkeptSends: () => SentMessageRow[];
  /** One change to a send's record — the hub's only kind of write to one. */
  readonly updateSend: (
    uuid: string,
    change: Partial<
      Pick<
        SentMessageRow,
        | "state"
        | "reason"
        | "refusal"
        | "anchor"
        | "replacedBy"
        | "body"
        | "harnessId"
        | "held"
        | "acceptedAt"
        | "delivery"
        | "envelope"
        | "hold"
        | "instanceId"
        | "readAt"
      >
    >
  ) => SentMessageRow | undefined;
}

export const sendsDb = (core: DbCore): SendsDb => {
  const { db } = core;

  return {
    migrateSendsOnce: (name, rewrite) =>
      db.transaction((tx) => {
        if (
          tx
            .select()
            .from(dataMigrations)
            .where(eq(dataMigrations.name, name))
            .get()
        ) {
          return null;
        }
        let changed = 0;
        for (const send of tx
          .select({ uuid: sentMessages.uuid, body: sentMessages.body })
          .from(sentMessages)
          .all()) {
          const body = send.body ? rewrite(send.body) : null;
          if (body) {
            tx.update(sentMessages)
              .set({ body })
              .where(eq(sentMessages.uuid, send.uuid))
              .run();
            changed += 1;
          }
        }
        tx.insert(dataMigrations).values({ name, at: new Date() }).run();
        return changed;
      }),
    recordSend: (send) =>
      db.insert(sentMessages).values(send).returning().get(),
    sendRecord: (uuid) =>
      db.select().from(sentMessages).where(eq(sentMessages.uuid, uuid)).get(),
    pendingSends: () =>
      db
        .select()
        .from(sentMessages)
        .where(eq(sentMessages.state, "pending"))
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    sendsIn: (instanceId, states) =>
      db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.instanceId, instanceId),
            inArray(sentMessages.state, states)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    owedSessionsHeld: (holds) =>
      db
        .selectDistinct({ instanceId: sentMessages.instanceId })
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.state, "pending"),
            isNotNull(sentMessages.owed),
            or(
              isNull(sentMessages.hold),
              inArray(sentMessages.hold, [...holds])
            )
          )
        )
        .all()
        .map((row) => row.instanceId),
    // By the sessions' ids, so SQLite finds each one's pending sends by its
    // index (`sent_messages_state`): joined to its sessions, it read every
    // send the hub ever kept, at each register (hub-restart-load).
    owedSends: (of) =>
      db
        .select()
        .from(sentMessages)
        .where(
          and(
            "instanceId" in of
              ? eq(sentMessages.instanceId, of.instanceId)
              : inArray(
                  sentMessages.instanceId,
                  db
                    .select({ id: instances.id })
                    .from(instances)
                    .where(eq(instances.machineId, of.machineId))
                ),
            eq(sentMessages.state, "pending"),
            isNotNull(sentMessages.owed)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    holdSend: (uuid, envelope) =>
      db
        .update(sentMessages)
        .set({ owed: envelope })
        .where(
          and(eq(sentMessages.uuid, uuid), eq(sentMessages.state, "pending"))
        )
        .returning({ uuid: sentMessages.uuid })
        .all().length === 1,
    oweAgain: (uuid) =>
      db
        .update(sentMessages)
        .set({ owed: sql`${sentMessages.envelope}` })
        .where(
          and(
            eq(sentMessages.uuid, uuid),
            eq(sentMessages.state, "pending"),
            isNotNull(sentMessages.envelope)
          )
        )
        .returning({ uuid: sentMessages.uuid })
        .all().length === 1,
    unkeptSends: () =>
      db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.state, "pending"),
            isNull(sentMessages.envelope),
            isNull(sentMessages.owed),
            isNotNull(sentMessages.body)
          )
        )
        .all(),
    keepEnvelope: (uuid, envelope) => {
      db.update(sentMessages)
        .set({ envelope })
        .where(
          and(eq(sentMessages.uuid, uuid), eq(sentMessages.state, "pending"))
        )
        .run();
    },
    noteFreshStart: (id, at) => {
      db.update(instances)
        .set({ freshStartAt: at })
        .where(eq(instances.id, id))
        .run();
    },
    openTurn: (id, at) =>
      db
        .update(instances)
        .set({ turnOpenAt: at })
        .where(
          and(
            eq(instances.id, id),
            or(
              isNull(instances.turnOpenAt),
              sql`${instances.turnOpenAt} < coalesce(${instances.spawnedAt}, 0)`
            )
          )
        )
        .returning({ id: instances.id })
        .all().length === 1,
    closeTurn: (id) => {
      db.update(instances)
        .set({ turnOpenAt: null })
        .where(and(eq(instances.id, id), isNotNull(instances.turnOpenAt)))
        .run();
    },
    // `updatedAt` deliberately untouched: a turn's end is not the session moving.
    noteTurnEnded: (id, at, silent, wakesItself) => {
      const [was] = silent
        ? db
            .select({
              seenAt: instances.seenAt,
              turnEndedAt: instances.turnEndedAt,
            })
            .from(instances)
            .where(eq(instances.id, id))
            .all()
        : [];
      const seenThrough =
        was !== undefined &&
        (was.turnEndedAt === null ||
          (was.seenAt !== null &&
            was.seenAt.getTime() >= was.turnEndedAt.getTime())) &&
        !(was.seenAt && was.seenAt.getTime() >= at.getTime());
      db.update(instances)
        .set({
          turnEndedAt: at,
          wakesItself,
          ...(seenThrough ? { seenAt: at } : {}),
        })
        .where(eq(instances.id, id))
        .run();
    },
    noteAnswered: (id, at) => {
      db.update(sentMessages)
        .set({ answeredAt: at })
        .where(
          and(
            eq(sentMessages.instanceId, id),
            eq(sentMessages.state, "read"),
            isNull(sentMessages.answeredAt)
          )
        )
        .run();
    },
    personUnanswered: (id) => {
      const [last] = db
        .select({
          answeredAt: sentMessages.answeredAt,
          body: sentMessages.body,
          state: sentMessages.state,
        })
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.instanceId, id),
            inArray(sentMessages.state, ["pending", "read"]),
            eq(sentMessages.mode, "turn"),
            sql`json_extract(${sentMessages.body}, '$.origin.kind') = 'human'`
          )
        )
        .orderBy(desc(sentMessages.acceptedAt))
        .limit(1)
        .all();
      if (last?.answeredAt !== null) {
        return null;
      }
      const words = last.body.message.content;
      if (typeof words === "string" && words.startsWith("/")) {
        return null;
      }
      return last.state === "read" ? "read" : "pending";
    },
    latestSends: (id) => {
      const [read] = db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.instanceId, id),
            eq(sentMessages.mode, "turn"),
            isNotNull(sentMessages.readAt)
          )
        )
        .orderBy(desc(sentMessages.readAt))
        .limit(1)
        .all();
      const [person] = db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.instanceId, id),
            sql`json_extract(${sentMessages.body}, '$.origin.kind') = 'human'`
          )
        )
        .orderBy(desc(sentMessages.acceptedAt))
        .limit(1)
        .all();
      return { read: read ?? null, person: person ?? null };
    },
    handBackTurn: (id, from, at) =>
      db
        .update(instances)
        .set({ turnOpenAt: at })
        .where(and(eq(instances.id, id), eq(instances.turnOpenAt, from)))
        .returning({ id: instances.id })
        .all().length === 1,
    freshStartOf: (id) =>
      db
        .select({ at: instances.freshStartAt })
        .from(instances)
        .where(eq(instances.id, id))
        .get()?.at ?? null,
    takeOwedSend: (uuid) => {
      const owed = db
        .select({ owed: sentMessages.owed })
        .from(sentMessages)
        .where(eq(sentMessages.uuid, uuid))
        .get()?.owed;
      if (!owed) {
        return;
      }
      const taken = db
        .update(sentMessages)
        .set({ owed: null, hold: null })
        .where(and(eq(sentMessages.uuid, uuid), isNotNull(sentMessages.owed)))
        .returning({ uuid: sentMessages.uuid })
        .all();
      return taken.length > 0 ? owed : undefined;
    },
    updateSend: (uuid, change) =>
      db
        .update(sentMessages)
        // A send no longer pending is handed on no more: what it was is its body.
        .set(
          change.state && change.state !== "pending"
            ? { ...change, envelope: null, owed: null, hold: null }
            : change
        )
        .where(eq(sentMessages.uuid, uuid))
        .returning()
        .get(),
    sendsFor: (ids) => {
      const rows: SentMessageRow[] = [];
      // A long transcript names more ids than SQLite binds in one statement.
      for (let at = 0; at < ids.length; at += SENDS_FOR_BATCH) {
        const batch = ids.slice(at, at + SENDS_FOR_BATCH);
        rows.push(
          ...db
            .select()
            .from(sentMessages)
            .where(
              or(
                inArray(sentMessages.uuid, batch),
                inArray(sentMessages.harnessId, batch)
              )
            )
            .all()
        );
      }
      return rows;
    },
    linkSend: (uuid, harnessId) => {
      db.update(sentMessages)
        .set({ harnessId })
        .where(eq(sentMessages.uuid, uuid))
        .run();
    },
  };
};
