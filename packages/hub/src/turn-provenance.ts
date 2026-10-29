/**
 * Every session's turn provenance, kept by the hub (core turn-provenance.ts
 * holds the rule, its state machine and its decision). The hub sees what
 * each session reads: the sends its harness reads (server.ts `takeRead`)
 * and the frames it streams (its web calls, their results, its turn's
 * end), so it keeps each session's {@link Turn}, and tells the session's
 * machine whenever whether the turn is outside changes (agent session.ts
 * `turnProvenance`). Each harness's per-call permission point reads that
 * there, on every call: Claude Code's `PreToolUse`, OpenCode's
 * `permission.asked`, pi's `tool_call`. A project's Caw is judged by the same
 * turn, as any session's.
 *
 * Who a send is from ({@link sendFrom}): its principal's word is the person's
 * own act (core `byPerson`, but GitHub's answer to a post, which carries
 * GitHub's words), or, for a session another session started, its parent's
 * message; CawCo's own word about the session's own work (a compaction, a
 * continuation, a restore, a fork, a wait's end, a pause, a leak, an
 * undelivered send, a fleet rule) moves nothing; anything else is outside.
 *
 * Kept in memory. What a turn read goes with a hub restart, so the rule
 * fails closed (core `restartedTurn`): as each machine first connects to a
 * hub that has just started, every one of its sessions with a turn under
 * way (its row's open turn, db `turnOpenAt`, which outlives the hub) and
 * none this hub has seen is outside until that turn ends. A machine that
 * connects again is told every outside turn of its sessions
 * ({@link connected}). Kept in memory rather than in a table: the open turn
 * is already durable, and it is all a restart needs to know.
 */
import {
  ARTIFACT_ORIGIN,
  COMPACTION_ORIGIN,
  CONTINUATION_ORIGIN,
  type InstanceRow,
  type NeutralMessage,
  type NeutralOrigin,
  PLAN_ORIGIN,
  PRINCIPALS_TURN,
  parseReportMarker,
  restartedTurn,
  type SendFrom,
  type Turn,
  type TurnEvent,
  turnProvenanceWords,
  turnStep,
  UPSTREAM_ORIGIN,
  WORK_ITEM_ORIGIN,
} from "@cawco/core";
import { ASK_ORIGIN } from "@cawco/core/asks";
import { PAUSE_ORIGIN } from "./machine-pause";
import { ROUTINE_ORIGIN } from "./memory";
import { readsWeb, urlsOf, type WebContext } from "./web-reads";

/**
 * What a send the hub woke a project's Caw with was (caw.ts `sourceOf`):
 * your words alone, or outside text: an event, a routine's run, or your
 * words with outside events riding on them.
 */
export type WakeSource = "owner" | "event" | "routine" | "inbox";

/** An outside wake's source, as a card's clause names it. */
const WAKE_WORDS: Record<Exclude<WakeSource, "owner">, string> = {
  event: turnProvenanceWords.event,
  routine: turnProvenanceWords.routine,
  inbox: turnProvenanceWords.inbox,
};

/** The wakes kept for their sends to be read ({@link TurnProvenance.woke}). */
const WAKES_KEPT = 2000;

/** The `system` origins that are the person's own act (core `byPerson`): GitHub's answer to a post is not, as it carries GitHub's words. */
const PERSONS: ReadonlySet<string> = new Set([
  ARTIFACT_ORIGIN,
  ASK_ORIGIN,
  PLAN_ORIGIN,
]);

/**
 * The `system` origins that are CawCo's own word about the session's own
 * work, quoting nothing from outside: a compaction's steps, a continuation,
 * a restore after a restart, a fork's opening, a work item's still-open or
 * wait's end, a machine's pause, a leak, an undelivered send (server.ts
 * `LEAK_ORIGIN`, `UNDELIVERED_ORIGIN`, `FORK_ORIGIN`, its restores).
 */
const CAWCOS: ReadonlySet<string> = new Set([
  COMPACTION_ORIGIN,
  CONTINUATION_ORIGIN,
  WORK_ITEM_ORIGIN,
  PAUSE_ORIGIN,
  "restore",
  "fork",
  "leak",
  "undelivered",
]);

/** A fleet rule's send (rules.ts): the owner's own words, fired by its trigger. */
const RULE_ORIGIN = "rule:";

/** A Caw wake's `system` origin (caw.ts `message`). */
const CAW_ORIGIN = "caw";

/** What a `system` send is, by its origin's name. */
const systemFrom = (name: string | undefined): SendFrom => {
  if (name === undefined) {
    return { kind: "outside", what: turnProvenanceWords.notice };
  }
  if (PERSONS.has(name)) {
    return { kind: "principal" };
  }
  if (CAWCOS.has(name) || name.startsWith(RULE_ORIGIN)) {
    return { kind: "cawco" };
  }
  if (name === UPSTREAM_ORIGIN) {
    return { kind: "outside", what: turnProvenanceWords.upstream };
  }
  if (name.startsWith(ROUTINE_ORIGIN)) {
    return { kind: "outside", what: turnProvenanceWords.routine };
  }
  return {
    kind: "outside",
    what:
      name === CAW_ORIGIN
        ? turnProvenanceWords.event
        : turnProvenanceWords.notice,
  };
};

/**
 * Who a send `row` read is from: its principal (the person, or the parent
 * that started it), CawCo's own word, or outside, named as the card names
 * it. `content` is the send's text: a delegate's report says so in its
 * marker (core `reportMarker`).
 */
const sendFrom = (
  row: Pick<InstanceRow, "parentInstanceId">,
  origin: NeutralOrigin | undefined,
  content: string
): SendFrom => {
  if (origin === undefined) {
    return { kind: "outside", what: turnProvenanceWords.anotherSession };
  }
  if (origin.kind === "human") {
    return { kind: "principal" };
  }
  if (origin.kind === "system") {
    return systemFrom(origin.name);
  }
  if (origin.fromSession && origin.fromSession === row.parentInstanceId) {
    return { kind: "principal" };
  }
  const report = parseReportMarker(content);
  if (report) {
    return { kind: "outside", what: turnProvenanceWords.report(report.name) };
  }
  return {
    kind: "outside",
    what: origin.name
      ? turnProvenanceWords.message(origin.name)
      : turnProvenanceWords.anotherSession,
  };
};

/** What a web call reads, as a card names it: its address, its search, or web content. */
const webWhat = (input: Record<string, unknown>): string => {
  const [url] = urlsOf(input);
  if (url) {
    return url;
  }
  return typeof input.query === "string" && input.query.trim()
    ? turnProvenanceWords.search(input.query.trim())
    : turnProvenanceWords.webContent;
};

/** A send's text, as a transcript holds it. */
const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content
        .map((part) =>
          typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : ""
        )
        .join("\n")
    : "";
};

export interface TurnProvenanceDeps {
  /**
   * Tells a session's machine whether its turn is outside now: the clause
   * why, or null for its principal's (agent session.ts `turnProvenance`).
   */
  readonly tell: (
    session: Pick<InstanceRow, "id" | "machineId">,
    outside: string | null
  ) => void;
  /** What a web read is judged by (web-reads.ts). */
  readonly webContext: () => WebContext;
}

export const createTurnProvenance = ({
  tell,
  webContext,
}: TurnProvenanceDeps) => {
  /** Each session's turn, with the machine it runs on, by session; a session with none is in its principal's. */
  const turns = new Map<string, { machineId: string; turn: Turn }>();
  /** What each send the hub woke a project's Caw with was, by its uuid (caw.ts `wake`). */
  const wakes = new Map<string, WakeSource>();
  /** The machines that have connected since this hub started: a later connect is a machine's, not the hub's, restart. */
  const met = new Set<string>();

  /** `session`'s turn after `event`, its machine told when whether it is outside changed. */
  const move = (
    session: Pick<InstanceRow, "id" | "machineId">,
    event: TurnEvent
  ): void => {
    const before = turns.get(session.id)?.turn ?? PRINCIPALS_TURN;
    const after = turnStep(before, event);
    if (after === PRINCIPALS_TURN) {
      turns.delete(session.id);
    } else {
      turns.set(session.id, { machineId: session.machineId, turn: after });
    }
    if (after.outside !== before.outside) {
      if (after.outside !== null) {
        console.log(
          `[turn-provenance] ${session.id}: outside from here: ${after.outside}`
        );
      }
      tell(session, after.outside);
    }
  };

  /** The calls an assistant message makes that read the web: each one's result makes its turn outside. */
  const calledWeb = (
    row: Pick<InstanceRow, "id" | "machineId">,
    content: readonly { type: string }[]
  ): void => {
    let context: WebContext | undefined;
    for (const block of content) {
      const use = block as {
        id?: string;
        input?: unknown;
        name?: string;
        type: string;
      };
      if (!(use.type === "tool_use" && use.id && use.name)) {
        continue;
      }
      const input = (use.input ?? {}) as Record<string, unknown>;
      context ??= webContext();
      if (readsWeb(use.name, input, context)) {
        move(row, { kind: "web-call", id: use.id, what: webWhat(input) });
      }
    }
  };

  return {
    /** Why `instanceId`'s turn is outside, as a card's clause says it; null while it is its principal's. */
    outside: (instanceId: string): string | null =>
      turns.get(instanceId)?.turn.outside ?? null,

    /** The hub woke a project's Caw with a send (caw.ts `wake`): your words alone, or outside text with them. */
    woke(uuid: string, source: WakeSource): void {
      wakes.set(uuid, source);
      // One never read is let go with the oldest; unread, it says nothing.
      if (wakes.size > WAKES_KEPT) {
        const [oldest] = wakes.keys();
        if (oldest !== undefined) {
          wakes.delete(oldest);
        }
      }
    },

    /** A session's harness read a send (server.ts `takeRead`). */
    read(
      row: Pick<InstanceRow, "id" | "machineId" | "parentInstanceId">,
      uuid: string,
      body:
        { message?: { content?: unknown }; origin?: NeutralOrigin } | undefined
    ): void {
      const woke = wakes.get(uuid);
      wakes.delete(uuid);
      let from = sendFrom(row, body?.origin, textOf(body?.message?.content));
      if (woke === "owner") {
        from = { kind: "principal" };
      } else if (woke) {
        from = { kind: "outside", what: WAKE_WORDS[woke] };
      }
      move(row, { kind: "send", from });
    },

    /** A frame a session's harness streamed: its web calls, their results, its turn's end. */
    frame(
      row: Pick<InstanceRow, "id" | "machineId">,
      neutral: NeutralMessage
    ): void {
      if (neutral.type === "result") {
        move(row, { kind: "ended" });
        return;
      }
      if (neutral.type === "assistant") {
        calledWeb(row, neutral.message.content);
        return;
      }
      if (neutral.type === "user" && Array.isArray(neutral.message.content)) {
        for (const block of neutral.message.content) {
          if (block.type === "tool_result") {
            move(row, { kind: "result", id: block.tool_use_id });
          }
        }
      }
    },

    /** A session's process ended: its turn with it. */
    ended(instanceId: string): void {
      turns.delete(instanceId);
    },

    /**
     * A machine connected (server.ts register), `underWay` its live sessions
     * whose row has a turn open. Its first connect to this hub: each of
     * those this hub has not seen is outside until its turn ends, as what it
     * read went with the restart. Then each of its sessions whose turn is
     * outside is told so, as the machine may have forgotten.
     */
    connected(machineId: string, underWay: readonly string[]): void {
      if (!met.has(machineId)) {
        met.add(machineId);
        for (const id of underWay) {
          if (!turns.has(id)) {
            turns.set(id, { machineId, turn: restartedTurn(true) });
            console.log(
              `[turn-provenance] ${id}: its turn was under way across the hub's restart; outside until it ends`
            );
          }
        }
      }
      for (const [id, held] of turns) {
        if (held.machineId === machineId && held.turn.outside !== null) {
          tell({ id, machineId }, held.turn.outside);
        }
      }
    },
  };
};
