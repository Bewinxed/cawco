/** Messages sent to a session: recorded, owed, held, answered. */

import type { HubEnvelope } from "@cawco/core/envelopes";
import type { Envelope, SendPayload } from "@cawco/core/protocol";
import type { NeutralUserMessage } from "@cawco/core/session-messages";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { DbCore } from "./core";
import {
  dataMigrations,
  instances,
  sentMessageBodies,
  sentMessages,
} from "./schema";
import type { SendHold } from "./stored-types";
import type { Tx } from "./tx";

/** Ids looked up per statement (bound twice), well under SQLite's variable limit. */
const SENDS_FOR_BATCH = 500;

/** Bodies a start's rewrite reads at a time ({@link SendsDb.migrateSendsOnce}). */
const MIGRATE_BATCH = 500;

/** A send's record with its body, read by key from `sent_message_bodies` ({@link sendColumns}). */
export type SentMessageRow = typeof sentMessages.$inferSelect & {
  body: NeutralUserMessage;
};

/**
 * What the person typed to a session, as the hub recorded it: the send's
 * uuid, the session it went to, when the hub accepted it, and its words
 * (its text blocks joined; pictures left out).
 */
export interface PersonSaid {
  acceptedAt: Date;
  instanceId: string;
  text: string;
  uuid: string;
}

/** A send's words: its text, or its text blocks joined; pictures and other blocks left out. */
const wordsOf = ({ message }: NeutralUserMessage): string =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n\n");

/** A send as it is recorded: its row's columns, its body, and none of the columns its body writes ({@link bodyColumns}). */
export type NewSend = Omit<
  typeof sentMessages.$inferInsert,
  "originKind" | "originName" | "originFrom"
> & { body: NeutralUserMessage };

/** A send's row and its body, joined by its uuid: every read of a whole send. */
const sendColumns = {
  ...getTableColumns(sentMessages),
  body: sentMessageBodies.body,
};

/**
 * The columns of a send's row its body decides, written with the body
 * wherever it is written: who sent it, by the origin's `kind`, `name` and
 * `from`, so a session's sends are found by them with no body read.
 */
const bodyColumns = ({ origin }: NeutralUserMessage) => ({
  originKind: origin?.kind ?? null,
  originName:
    origin && "name" in origin && typeof origin.name === "string"
      ? origin.name
      : null,
  originFrom:
    origin && "from" in origin && typeof origin.from === "string"
      ? origin.from
      : null,
});

/** `body` kept as the send's body, and its row's origin columns written from it. */
export const writeBody = (
  tx: Tx,
  uuid: string,
  body: NeutralUserMessage
): void => {
  tx.insert(sentMessageBodies)
    .values({ uuid, body })
    .onConflictDoUpdate({ target: sentMessageBodies.uuid, set: { body } })
    .run();
  tx.update(sentMessages)
    .set(bodyColumns(body))
    .where(eq(sentMessages.uuid, uuid))
    .run();
};

/**
 * `instances.turn_open_at` of a session from before the hub kept the turn it
 * had open (migration `turn_open_at`): whether that turn ended is its harness's
 * transcript's word, not the hub's.
 */
export const TURN_UNRECORDED = -1;

/**
 * A send its record kept (`sent_messages.envelope`), as the hub hands it to
 * its machine: the column keeps any verb, as it always took one, and one
 * kept under another verb is no send the hub wrote.
 */
export const keptSend = ({
  verb,
  ...kept
}: Envelope<SendPayload>): HubEnvelope<"send"> | undefined =>
  verb === "send" ? { ...kept, verb } : undefined;

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
  /** Keeps a pending send whole, as its machine was handed it. */
  readonly keepEnvelope: (uuid: string, envelope: HubEnvelope<"send">) => void;
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
   * A pending send its process went away without reading, owed again: the
   * hub holds it ({@link sentMessages.owedHeld}) and hands the envelope its
   * record kept ({@link sentMessages.envelope}). False when it is no longer
   * pending or kept none (a record from before envelopes were kept).
   */
  readonly oweAgain: (uuid: string) => boolean;
  /** The sends still owed to their machine ({@link sentMessages.owedHeld}), pending, in the order accepted: a session's, a machine's, or every one. */
  readonly owedSends: (
    of: { instanceId: string } | { machineId: string } | "every"
  ) => SentMessageRow[];
  /**
   * The sessions with a send owed to their machine whose hold is one of
   * `holds`, or none written yet (its keeping never said why): the ids
   * alone, each once, by the pending sends' index, no send read whole.
   */
  readonly owedSessionsHeld: (holds: readonly SendHold[]) => string[];
  /** Every send still pending (accepted, not yet read by its session), each session's oldest first. */
  readonly pendingSends: () => SentMessageRow[];
  /**
   * What the person typed to sessions of `projectId`, oldest first: sends of
   * origin `human` (stamped by the hub where his words come in, never by a
   * session's tools: sends.ts `SessionSend`), pending or read, not replaced
   * by a retry, accepted after `after` and at or before `through`; a slash
   * command (a word to the harness, as {@link personUnanswered} skips it)
   * left out. At most `limit`. Found by each session's origin index
   * (`sent_messages_origin`), the project's sessions first.
   */
  readonly personSaidIn: (
    projectId: string,
    after: Date,
    through: Date,
    limit: number
  ) => PersonSaid[];
  /**
   * One message the person typed, by the send's uuid or the id its harness
   * stored it under (a find hit's record): a send of origin `human`, pending
   * or read, not replaced by a retry, not a slash command. Undefined when
   * the id names nothing he typed (an agent's handoff, a hub notice).
   */
  readonly personSaidOf: (id: string) => PersonSaid | undefined;
  /**
   * The person's last message to the session, when it has no reply after it:
   * `read`, the session has it, or `pending`, it waits to reach it. His last
   * words are his newest send that reached it or waits to (a failed, replaced
   * or cancelled one never did), a turn's, not a note or a slash command,
   * which asks the harness and not the session. Null when none is owed.
   */
  readonly personUnanswered: (id: string) => "read" | "pending" | null;
  readonly recordSend: (send: NewSend) => SentMessageRow;
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
  /**
   * Takes a send out of the hub's keeping ({@link sentMessages.owedHeld}),
   * once: true when this took it, false when another took it first or it
   * was not owed.
   */
  readonly takeOwedSend: (uuid: string) => boolean;
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

  /** Whole sends, each row with its body. */
  const sends = () =>
    db
      .select(sendColumns)
      .from(sentMessages)
      .innerJoin(
        sentMessageBodies,
        eq(sentMessageBodies.uuid, sentMessages.uuid)
      );

  /** One send whole, by its uuid. */
  const sendOf = (uuid: string): SentMessageRow | undefined =>
    sends().where(eq(sentMessages.uuid, uuid)).get();

  /**
   * Whose owed sends {@link SendsDb.owedSends} reads: a session's; a
   * machine's, by its sessions' ids, so SQLite finds each one's pending
   * sends by its index (`sent_messages_state`) (joined to its sessions, it
   * read every send the hub ever kept, at each register: hub-restart-load);
   * or every one, for the look that ends the notices nothing will wake
   * (owed-ends.ts), at the hub's start and each hour after.
   */
  const owedOf = (of: Parameters<SendsDb["owedSends"]>[0]): SQL | undefined => {
    if (of === "every") {
      return;
    }
    return "instanceId" in of
      ? eq(sentMessages.instanceId, of.instanceId)
      : inArray(
          sentMessages.instanceId,
          db
            .select({ id: instances.id })
            .from(instances)
            .where(eq(instances.machineId, of.machineId))
        );
  };

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
        // By key, a batch at a time: the bodies are the hub's largest table
        // (188 MB on 2026-11-19), and one read of them all held them all.
        let after = "";
        for (;;) {
          const batch = tx
            .select()
            .from(sentMessageBodies)
            .where(gt(sentMessageBodies.uuid, after))
            .orderBy(sentMessageBodies.uuid)
            .limit(MIGRATE_BATCH)
            .all();
          for (const send of batch) {
            const body = rewrite(send.body);
            if (body) {
              writeBody(tx, send.uuid, body);
              changed += 1;
            }
          }
          const last = batch.at(-1);
          if (!last || batch.length < MIGRATE_BATCH) {
            break;
          }
          after = last.uuid;
        }
        tx.insert(dataMigrations).values({ name, at: new Date() }).run();
        return changed;
      }),
    recordSend: ({ body, ...send }) =>
      db.transaction((tx) => {
        const row = tx
          .insert(sentMessages)
          .values({ ...send, ...bodyColumns(body) })
          .returning()
          .get();
        tx.insert(sentMessageBodies).values({ uuid: row.uuid, body }).run();
        return { ...row, body };
      }),
    sendRecord: sendOf,
    pendingSends: () =>
      sends()
        .where(eq(sentMessages.state, "pending"))
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    sendsIn: (instanceId, states) =>
      sends()
        .where(
          and(
            eq(sentMessages.instanceId, instanceId),
            inArray(sentMessages.state, states)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    // Each once in JS: a DISTINCT in SQL walked every send's entry in
    // `sent_messages_state` for its order, where the pending sends' own
    // index reads only those.
    owedSessionsHeld: (holds) => [
      ...new Set(
        db
          .select({ instanceId: sentMessages.instanceId })
          .from(sentMessages)
          .where(
            and(
              eq(sentMessages.state, "pending"),
              eq(sentMessages.owedHeld, true),
              or(
                isNull(sentMessages.hold),
                inArray(sentMessages.hold, [...holds])
              )
            )
          )
          .all()
          .map((row) => row.instanceId)
      ),
    ],
    owedSends: (of) =>
      sends()
        .where(
          and(
            owedOf(of),
            eq(sentMessages.state, "pending"),
            eq(sentMessages.owedHeld, true)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    oweAgain: (uuid) =>
      db
        .update(sentMessages)
        .set({ owedHeld: true })
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
      sends()
        .where(
          and(
            eq(sentMessages.state, "pending"),
            isNull(sentMessages.envelope),
            eq(sentMessages.owedHeld, false)
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
          body: sentMessageBodies.body,
          state: sentMessages.state,
        })
        .from(sentMessages)
        .innerJoin(
          sentMessageBodies,
          eq(sentMessageBodies.uuid, sentMessages.uuid)
        )
        .where(
          and(
            eq(sentMessages.instanceId, id),
            inArray(sentMessages.state, ["pending", "read"]),
            eq(sentMessages.mode, "turn"),
            eq(sentMessages.originKind, "human")
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
    personSaidIn: (projectId, after, through, limit) =>
      db
        .select({
          uuid: sentMessages.uuid,
          instanceId: sentMessages.instanceId,
          acceptedAt: sentMessages.acceptedAt,
          body: sentMessageBodies.body,
        })
        .from(instances)
        .innerJoin(sentMessages, eq(sentMessages.instanceId, instances.id))
        .innerJoin(
          sentMessageBodies,
          eq(sentMessageBodies.uuid, sentMessages.uuid)
        )
        .where(
          and(
            eq(instances.projectId, projectId),
            eq(sentMessages.originKind, "human"),
            gt(sentMessages.acceptedAt, after),
            lte(sentMessages.acceptedAt, through),
            inArray(sentMessages.state, ["pending", "read"]),
            isNull(sentMessages.replacedBy)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .limit(limit)
        .all()
        .flatMap(({ body, ...said }) => {
          const text = wordsOf(body).trim();
          return text && !text.startsWith("/") ? [{ ...said, text }] : [];
        }),
    personSaidOf: (id) => {
      const [said] = sends()
        .where(
          and(
            or(eq(sentMessages.uuid, id), eq(sentMessages.harnessId, id)),
            eq(sentMessages.originKind, "human"),
            inArray(sentMessages.state, ["pending", "read"]),
            isNull(sentMessages.replacedBy)
          )
        )
        .limit(1)
        .all();
      const text = said ? wordsOf(said.body).trim() : "";
      return said && text && !text.startsWith("/")
        ? {
            uuid: said.uuid,
            instanceId: said.instanceId,
            acceptedAt: said.acceptedAt,
            text,
          }
        : undefined;
    },
    latestSends: (id) => {
      const [read] = sends()
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
      const [person] = sends()
        .where(
          and(
            eq(sentMessages.instanceId, id),
            eq(sentMessages.originKind, "human")
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
    takeOwedSend: (uuid) =>
      db
        .update(sentMessages)
        .set({ owedHeld: false, hold: null })
        .where(
          and(eq(sentMessages.uuid, uuid), eq(sentMessages.owedHeld, true))
        )
        .returning({ uuid: sentMessages.uuid })
        .all().length === 1,
    updateSend: (uuid, { body, ...change }) =>
      db.transaction((tx) => {
        // A send no longer pending is handed on no more: what it was is its body.
        const set =
          change.state && change.state !== "pending"
            ? { ...change, envelope: null, owedHeld: false, hold: null }
            : change;
        if (Object.keys(set).length > 0) {
          tx.update(sentMessages)
            .set(set)
            .where(eq(sentMessages.uuid, uuid))
            .run();
        }
        if (body) {
          writeBody(tx, uuid, body);
        }
        return sendOf(uuid);
      }),
    sendsFor: (ids) => {
      const rows: SentMessageRow[] = [];
      // A long transcript names more ids than SQLite binds in one statement.
      for (let at = 0; at < ids.length; at += SENDS_FOR_BATCH) {
        const batch = ids.slice(at, at + SENDS_FOR_BATCH);
        rows.push(
          ...sends()
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
