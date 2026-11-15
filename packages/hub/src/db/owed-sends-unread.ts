/**
 * Before migration 0421's SQL runs, the hub's log names every send whose
 * owed envelope (`sent_messages.owed`, the send as its machine is to be
 * handed it once the hub's hold ends, as JSON) 0421 does not fold into the
 * send's kept envelope (`sent_messages.envelope`) as it stands: one that
 * differs from the kept envelope, and one that does not read whole as the
 * hub read it, with why.
 *
 * 0421 replaces the owed envelope with a flag (`owed_held`): the hub holds
 * the send, and hands `envelope` when the hold ends. The hub handed the
 * owed envelope (sends.ts `handOwed`), so where both are there the owed one
 * is kept as `envelope`. They differ only for a send its machine handed
 * back (sends.ts `holdBack`: what the machine was handed, the hub's
 * reminder and the person's presence in it); the kept one moves, as stored,
 * to `owed_unread`. An owed envelope that does not read stays owed with no
 * envelope, kept as stored in `owed_unread`, and is never handed on: the
 * hub's reader threw on its row, so it was never handed before either.
 *
 * The predicates below are 0421's own: its SQL was written from them, over
 * the columns as they stand before it. {@link ENVELOPE} is the owed
 * envelope's shape as the hub read it then (stored/columns.json at 0420,
 * core `Envelope<SendPayload>`), frozen here, so a later change to it
 * changes nothing 0421 does. {@link owedSendsKept} reads every send with
 * them, for the count taken on a copy before 0421 runs (scripts/owed-sends.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  ANY,
  anyOf,
  FLAG,
  kinded,
  listOf,
  literal,
  NUMBER,
  object,
  oneOf,
  readsWhole,
  recordOf,
  TEXT,
  TEXT_OR_NULL,
  TRUE,
} from "./json-reads";
import { shown } from "./lifted-reading";

/** An object with any keys (`z.record(z.string(), z.unknown())`). */
const OBJECT = recordOf();

/** One of an ask's questions (core `AskQuestion`). */
const QUESTION = object({
  header: TEXT,
  multiSelect: FLAG,
  options: listOf(object({ label: TEXT, description: TEXT })),
  question: TEXT,
});

/** What an ask was answered with, on its tool result (core `QuestionResult`). */
const QUESTION_RESULT = anyOf(
  object(
    {
      answers: recordOf(anyOf(TEXT, listOf(TEXT))),
      outcome: literal("answered"),
      questions: listOf(QUESTION),
    },
    {
      annotations: recordOf(object({}, { notes: TEXT, preview: TEXT })),
      response: TEXT,
    }
  ),
  object({ outcome: literal("dismissed"), questions: listOf(QUESTION) })
);

/** One part of a message's content (core `ContentBlock`). */
const PART = anyOf(
  object({ type: literal("text"), text: TEXT }),
  object({ type: literal("thinking"), thinking: TEXT }, { signature: TEXT }),
  object({ type: literal("redacted_thinking") }),
  object({ type: literal("tool_use"), id: TEXT, name: TEXT, input: OBJECT }),
  object(
    { type: literal("tool_result"), tool_use_id: TEXT, content: ANY },
    {
      is_error: FLAG,
      structuredContent: OBJECT,
      questionResult: QUESTION_RESULT,
    }
  ),
  object({
    type: literal("image"),
    source: anyOf(
      object({ type: literal("base64"), media_type: TEXT, data: TEXT }),
      object({ type: literal("url"), media_type: TEXT, url: TEXT })
    ),
  })
);

/** The message itself (core `NeutralUserMessage`'s `message`). */
const MESSAGE = object(
  { role: literal("user"), content: anyOf(TEXT, listOf(PART)) },
  {
    harnessNote: object(
      {
        body: TEXT,
        kind: oneOf("task-notification", "system-reminder"),
        status: TEXT,
        title: TEXT,
      },
      { toolUseId: TEXT }
    ),
  }
);

/** Who sent it (core `NeutralOrigin`). */
const ORIGIN = anyOf(
  kinded("human"),
  kinded("peer", {}, { from: TEXT, name: TEXT, fromSession: TEXT, body: TEXT }),
  kinded(
    "system",
    {},
    { line: TEXT, live: oneOf("running", "ended"), name: TEXT }
  )
);

/** The send as its session reads it (core `SentMessage`). */
const SENT = object(
  { message: MESSAGE, origin: ORIGIN, type: literal("user"), uuid: TEXT },
  {
    compactSummary: TRUE,
    keepAlive: TRUE,
    parent_tool_use_id: TEXT_OR_NULL,
    raw: ANY,
    reminder: TEXT,
    replaces: TEXT,
    session_id: TEXT,
    shouldQuery: FLAG,
    timestamp: TEXT,
  }
);

/** A file or text the send carries (core `SendAttachment`). */
const ATTACHMENT = anyOf(
  object({ content: TEXT, kind: literal("text"), name: TEXT }),
  object({
    kind: literal("file"),
    mediaType: TEXT,
    name: TEXT,
    ref: TEXT,
    size: NUMBER,
  })
);

/** A send as its machine is handed it (core `Envelope<SendPayload>`), as `sent_messages.owed` held it at 0420. */
const ENVELOPE = object(
  {
    machineId: TEXT,
    payload: object(
      { instanceId: TEXT, message: SENT },
      {
        attachments: listOf(ATTACHMENT),
        delivery: TEXT,
        from: TEXT,
        images: listOf(object({ mediaType: TEXT, data: TEXT })),
        provenance: object({}, { clientId: TEXT, presenceId: TEXT }),
      }
    ),
    verb: oneOf(
      "register",
      "heartbeat",
      "spawn",
      "send",
      "stop",
      "control",
      "frames",
      "fs",
      "usage",
      "launch",
      "admission"
    ),
  },
  { instanceId: TEXT, requestId: TEXT }
);

/** The owed envelope reads whole: JSON that is a send's envelope as the hub read it. 0 when it is not JSON. */
const OWED_READS = readsWhole("owed", ENVELOPE);

/** The owed and the kept envelope are one JSON value, each read minified (`json`); 0 when either is not JSON. */
const OWED_SAME =
  "CASE WHEN json_valid(owed) THEN CASE WHEN json_valid(envelope) THEN json(owed) = json(envelope) ELSE 0 END ELSE 0 END";

/** What 0421 makes of a send's owed envelope. */
export type OwedReading =
  /** Owed, and its kept envelope is the same: the flag set, nothing else moves. */
  | { kind: "same" }
  /** Owed with no kept envelope: the owed one is kept as its envelope. */
  | { kind: "alone" }
  /** Owed, and its kept envelope differs: the owed one is kept, the other moves to `owed_unread`. */
  | { kind: "different" }
  /** The owed envelope does not read: still owed, no envelope, never handed on; the owed value kept in `owed_unread`. */
  | { kind: "unread"; why: string };

/** One owed send as 0421 reads it: its key, both envelopes as stored, and what 0421 makes of it. */
export interface KeptOwed {
  envelope: string | null;
  /** `session/uuid`. */
  key: string;
  owed: string;
  reading: OwedReading;
}

interface Row {
  envelope: string | null;
  json: number;
  key: string;
  owed: string;
  reads: number;
  same: number;
}

const readingOf = (row: Row): OwedReading => {
  if (!row.reads) {
    return {
      kind: "unread",
      why:
        row.json === 0
          ? "it is not JSON"
          : "it is not a send's envelope as the hub read it (core Envelope<SendPayload>)",
    };
  }
  if (row.envelope === null) {
    return { kind: "alone" };
  }
  return row.same ? { kind: "same" } : { kind: "different" };
};

/** Every owed send as 0421 reads it, by `session/uuid`. Run on a database 0421 has not run on. */
export const owedSendsKept = (client: Database): KeptOwed[] =>
  client
    .query<Row, []>(
      `SELECT instance_id || '/' || uuid AS key, CAST(owed AS TEXT) AS owed, CAST(envelope AS TEXT) AS envelope, CASE WHEN json_valid(owed) THEN 1 ELSE 0 END AS json, ${OWED_READS} AS reads, ${OWED_SAME} AS same FROM sent_messages WHERE owed IS NOT NULL ORDER BY instance_id, accepted_at`
    )
    .all()
    .map((row) => ({
      key: row.key,
      owed: row.owed,
      envelope: row.envelope,
      reading: readingOf(row),
    }));

/** The sends that kept an envelope and owe none: 0421 leaves each as it is. */
export const envelopeAloneCount = (client: Database): number =>
  client
    .query<{ found: number }, []>(
      "SELECT count(*) AS found FROM sent_messages WHERE owed IS NULL AND envelope IS NOT NULL"
    )
    .get()?.found ?? 0;

/** Logs every owed send 0421 does not fold as it stands, one line each. Run only in a start that applies 0421 (db/migrate.ts). */
export const logOwedSendsUnread = (client: Database): void => {
  for (const row of owedSendsKept(client)) {
    if (row.reading.kind === "different") {
      console.info(
        `[migrations] 0421: send ${row.key}: its owed envelope and the envelope it kept differ; the owed one, which the hub hands, is kept as its envelope, and the one it kept, ${shown(row.envelope ?? "")}, is kept as stored in owed_unread`
      );
    }
    if (row.reading.kind === "unread") {
      const dropped =
        row.envelope !== null && row.envelope !== row.owed
          ? `; the envelope it kept, ${shown(row.envelope)}, is not handed either and goes`
          : "";
      console.info(
        `[migrations] 0421: send ${row.key}: its owed envelope ${shown(row.owed)} does not read: ${row.reading.why}; it stays owed with no envelope, kept as stored in owed_unread, and is never handed on${dropped}`
      );
    }
  }
};
