import type { AccountMove } from "@cawco/core/accounts";
import {
  ACCOUNT_MOVE,
  CUSTODY_HELD,
  FLEET_WATCH,
  MOVED_HERE,
  PROJECT_NOTE,
} from "@cawco/core/harness";
import { traitsOf } from "@cawco/core/harness/traits";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { InstanceRow } from "@cawco/core/protocol";
import { CONTROL_READ_TRANSCRIPT_WINDOW } from "@cawco/core/session/controls";
import type { SendRecord, SessionMessage } from "@cawco/core/session-messages";
import type {
  TranscriptWhere,
  TranscriptWindow,
  WindowAsk,
} from "@cawco/core/transcript-types";
import type { ClosureContext } from "./closure-context";
import type { HubLineMessage } from "./compaction";
import { contextLine } from "./compaction";
import { freshStartLine, machineLine } from "./cut-turns";
import type { PriorConversation } from "./db/schema";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { externalizeImages } from "./media";
import { HISTORY_WINDOW } from "./sends";
import type { HubLine } from "./transcript";
import type {
  HistoryCursor,
  HistoryFault,
  HistoryRead,
  OlderRead,
} from "./transcripts";
import { unreachable } from "./unreachable";

/**
 * One line the hub writes into a session's transcript at its account's limit
 * (core `ACCOUNT_MOVE`), as its live stream and a later read both carry it.
 */
export const limitLine = (
  row: { sessionId: string | null },
  event: { id: string; at: number; move: AccountMove }
): HubLineMessage => ({
  type: "system",
  subtype: ACCOUNT_MOVE,
  move: event.move,
  uuid: `limit-${event.id}`,
  session_id: row.sessionId ?? "",
  timestamp: new Date(event.at).toISOString(),
});

/**
 * The hub's line that opens a session started where its project was moved
 * to for it (core `MOVED_HERE`): what moved, then what stayed as a sentence.
 */
export const movedHereLine = (
  row: { id: string; sessionId: string | null },
  line: { at: number; moved: string; stayed?: string }
): HubLineMessage => ({
  type: "system",
  subtype: MOVED_HERE,
  uuid: `moved-here-${row.id}`,
  session_id: row.sessionId ?? "",
  content: line.stayed
    ? `${line.moved}\n${line.stayed.charAt(0).toUpperCase()}${line.stayed.slice(1)}.`
    : line.moved,
  timestamp: new Date(line.at).toISOString(),
});

/**
 * The hub's line where a session's process is still held by its harness's
 * server and CawCo did not take it back (core `CUSTODY_HELD`): the same on
 * the live stream and a later transcript read, titled by the reason's first
 * sentence.
 */
export const custodyLine = (
  row: { id: string; sessionId: string | null },
  reason: string
): HubLineMessage => ({
  type: "system",
  subtype: CUSTODY_HELD,
  uuid: `custody-held-${row.id}`,
  session_id: row.sessionId ?? "",
  content: reason,
});

/**
 * What fleet watch did about a session (core `FLEET_WATCH`), as its row keeps
 * it: the same on the live stream and a later transcript read.
 */
export const watchLine = (
  row: { sessionId: string | null },
  line: { at: number; id: string; content: string }
): HubLineMessage => ({
  type: "system",
  subtype: FLEET_WATCH,
  uuid: line.id,
  session_id: row.sessionId ?? "",
  content: line.content,
  timestamp: new Date(line.at).toISOString(),
});

/** A project note as the hub's line in its conversation's transcript (core `PROJECT_NOTE`). */
export const projectNoteLine = (
  row: { sessionId: string | null },
  kept: { at: number; id: string; note: ProjectNote }
): HubLineMessage => ({
  type: "system",
  subtype: PROJECT_NOTE,
  uuid: kept.id,
  session_id: row.sessionId ?? "",
  content: JSON.stringify(kept.note),
  timestamp: new Date(kept.at).toISOString(),
});

/**
 * What a user turn actually says, as a title could use it: the text the reader
 * typed. A user-shaped message is not always a reader — a tool result comes
 * back on the same channel — so a turn carrying no text of its own reads as
 * nothing here rather than as an empty name.
 */
export const userTurnText = (message: unknown): string | undefined => {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const outer = message as {
    type?: unknown;
    message?: { role?: unknown; content?: unknown };
  };
  if (outer.type !== "user") {
    return undefined;
  }
  const content = outer.message?.content;
  const text =
    typeof content === "string"
      ? content
      : // biome-ignore lint/style/noNestedTernary: content is either a block array or absent — two mutually exclusive shapes on the wire, not a simplifiable condition.
        Array.isArray(content)
        ? content
            .filter((block): block is { type: "text"; text: string } => {
              const b = block as { type?: unknown; text?: unknown };
              return b.type === "text" && typeof b.text === "string";
            })
            .map((block) => block.text)
            .join("\n")
        : "";
  return text.trim() ? text : undefined;
};

export type HistoryContext = Pick<
  ClosureContext,
  | "db"
  | "firstTurnOf"
  | "heldSessions"
  | "locateSession"
  | "machineFault"
  | "machinePresence"
  | "nameFromFirstTurn"
  | "readAgent"
  | "registry"
  | "sendLines"
  | "unlocatedWords"
>;

export const createHistory = (ctx: HistoryContext) => {
  /**
   * Forks the hub has started and not yet heard name their own conversation:
   * the conversation each reads its history from until then, and the turn it
   * branched at. A fork's row records no key until its `init` (`peekResume`).
   */
  const forkSeeds = new Map<string, { sessionKey: string; at?: string }>();

  /** A send record list as a map, by uuid. */
  const recordMap = (
    lines: { record: SendRecord }[]
  ): Record<string, SendRecord> =>
    Object.fromEntries(lines.map(({ record }) => [record.uuid, record]));

  /**
   * Where a session's transcript is stored, and where its history ends when
   * it is a fork not yet named. The hub's row is the single authority for a
   * session it holds; an id with no row is a stored key, located. A row that
   * never reported a key (a start refused or failed before its first turn)
   * has nothing stored anywhere, and is read like every other row
   * ({@link readHistory}): what it was sent and the hub's own lines on it are
   * its whole history.
   */
  const historyWhere = async (
    instanceId: string
  ): Promise<
    { where: TranscriptWhere; cut?: string; row?: InstanceRow } | HistoryFault
  > => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      const located = await ctx.locateSession(instanceId);
      switch (located.kind) {
        case "nowhere":
          return { fault: "missing", message: `no session ${instanceId}` };
        // Its machine's last catalog keeps it: the read waits for the machine.
        case "away":
          return {
            fault: "offline",
            machineId: located.machineId,
            message: ctx.machineFault(located.machineId, "offline"),
          };
        case "unanswered":
          return {
            fault: "timeout",
            message: ctx.unlocatedWords(instanceId, located.machines),
          };
        case "found":
          return {
            where: {
              machineId: located.at.machineId,
              sessionKey: located.at.sessionId,
              cwd: located.at.cwd || "",
              harness: located.at.harness,
            },
          };
        default:
          throw unreachable(located);
      }
    }
    const fork = row.sessionId ? undefined : forkSeeds.get(row.id);
    const where = {
      machineId: row.machineId,
      sessionKey: row.sessionId ?? fork?.sessionKey ?? "",
      cwd: row.cwd || "",
      harness: row.harness,
    };
    return { where, cut: fork?.at, row };
  };

  /**
   * A window of the stored conversation under `where`, as its machine
   * answers, or why it could not: the conversation as it was said, every
   * turn across its compactions. A compaction changes what the model reads
   * next, never what the transcript shows; read as the active chain alone, a
   * transcript the hub read again began at the newest compaction, and every
   * turn before it was gone from the list, on every screen and after a
   * reload.
   */
  const storedWindow = async (
    where: TranscriptWhere,
    window: WindowAsk
  ): Promise<TranscriptWindow | Extract<HistoryRead, { fault: string }>> => {
    const { machineId } = where;
    const answer = await ctx.readAgent(
      machineId,
      CONTROL_READ_TRANSCRIPT_WINDOW,
      [where.sessionKey, { dir: where.cwd || undefined, window }],
      READ_TIMEOUT_MS,
      where.harness
    );
    // The history fault's own words for no answer (transcripts.ts): "offline", "timeout".
    switch (answer.kind) {
      case "unanswered":
        return answer.reason === "dead"
          ? {
              fault: "offline",
              machineId,
              message: ctx.machineFault(machineId, "offline"),
            }
          : {
              fault: "timeout",
              message: ctx.machineFault(machineId, "silent"),
            };
      case "answered": {
        if (!answer.value.ok) {
          return {
            fault: "failed",
            message: answer.value.error ?? "the transcript could not be read",
          };
        }
        // A session the machine has never stored answers with nothing: an
        // empty transcript, the same shape a brand new session has.
        const read = answer.value.result as Partial<TranscriptWindow> | null;
        return {
          entries: Array.isArray(read?.entries) ? read.entries : [],
          older: read?.older ?? null,
          newer: read?.newer ?? null,
        };
      }
      default:
        throw unreachable(answer);
    }
  };

  const includesRewindAnchor = (
    where: TranscriptWhere,
    entry: SessionMessage,
    at: string | undefined
  ): boolean =>
    at === undefined ||
    traitsOf(where.harness).rewindAnchor !== "user-turn" ||
    entry.type !== "user";

  /** A history read that took this long or longer says so in the log, part by part. */
  const SLOW_HISTORY_MS = 1000;

  /**
   * A session's newest stored window, from its machine, with the records of
   * the sends it holds — cut after the entry `at` when given (a rewind, a
   * fork from the middle) — and where the window before it is: in its own
   * conversation, or the one it went on from once its own reaches its start.
   */
  const readHistory = async (
    instanceId: string,
    at?: string
  ): Promise<HistoryRead> => {
    const found = await historyWhere(instanceId);
    if ("fault" in found) {
      return found;
    }
    const [held] = ctx.db.getInstancesByIds([instanceId]);
    const prior = held ? ctx.db.priorConversations(held.id) : [];
    const { where } = found;
    const row = "row" in found ? found.row : held;
    const began = Date.now();
    const current = await currentWindow(
      where,
      at,
      "cut" in found ? found.cut : undefined
    );
    if ("fault" in current) {
      return current;
    }
    const read = Date.now();
    const older = olderOf(prior.length, current.older);
    const stored = current.entries;
    // Pictures as references to the media store, before a send's record is
    // filled from one of these entries.
    externalizeImages(stored);
    const records = recordMap(
      ctx.sendLines(row?.id, stored, true, older === null)
    );
    const transcript = withoutPings(stored, records);
    const lines = row ? readRowHistory(row, transcript, older === null) : [];
    const done = Date.now();
    if (done - began >= SLOW_HISTORY_MS) {
      console.info(
        `[transcripts] ${instanceId.slice(0, 8)}'s newest window: ${stored.length} entries read in ${read - began} ms, put together here in ${done - read} ms`
      );
    }
    return { entries: transcript, lines, records, where, older };
  };

  /**
   * The window before one that began at `older` in conversation
   * `conversation` (the session's own is the last, after the
   * {@link PriorConversation}s it went on from): the window before it there,
   * else the newest of the conversation before, else none.
   */
  const olderOf = (
    conversation: number,
    older: string | null
  ): HistoryCursor | null => {
    if (older !== null) {
      return { conversation, before: older };
    }
    return conversation > 0
      ? { conversation: conversation - 1, before: null }
      : null;
  };

  /**
   * The window `cursor` names of a session's stored history, with the
   * records of the sends it holds. A conversation the session went on from
   * ends on the line that stands between it and the next ("Continued on
   * …"); the window that reaches the start of them all begins with where
   * the session's project was moved to its machine.
   */
  const readOlder = async (
    instanceId: string,
    cursor: HistoryCursor
  ): Promise<OlderRead> => {
    const found = await conversationWhere(instanceId, cursor.conversation);
    if ("fault" in found) {
      return found;
    }
    const { conversation, row, where } = found;
    if (!where.sessionKey) {
      return { entries: [], records: {}, older: null };
    }
    const window = await storedWindow(
      where,
      cursor.before === null
        ? { end: "newest", limit: HISTORY_WINDOW }
        : { before: cursor.before, limit: HISTORY_WINDOW }
    );
    if ("fault" in window) {
      return window;
    }
    const { entries } = window;
    // A conversation the session went on from ends on the line between it
    // and the next: its newest window's last.
    const line =
      row && cursor.before === null
        ? betweenLine(row, conversation)
        : undefined;
    if (line) {
      entries.push(line);
    }
    const older = olderOf(cursor.conversation, window.older);
    externalizeImages(entries);
    const records = recordMap(
      ctx.sendLines(row?.id, entries, false, older === null)
    );
    const transcript = withoutPings(entries, records);
    if (row && older === null) {
      placeMovedHere(row, transcript);
      nameFromStart(row, transcript);
    }
    return { entries: transcript, records, older };
  };

  /**
   * Where the session's conversation `index` is stored: one it went on from
   * ({@link PriorConversation}), or its own after them.
   */
  const conversationWhere = async (
    instanceId: string,
    index: number
  ): Promise<
    | {
        conversation: PriorConversation | undefined;
        row: InstanceRow | undefined;
        where: TranscriptWhere;
      }
    | HistoryFault
  > => {
    const found = await historyWhere(instanceId);
    if ("fault" in found) {
      return found;
    }
    const [held] = ctx.db.getInstancesByIds([instanceId]);
    const row = "row" in found ? found.row : held;
    const conversation = row
      ? ctx.db.priorConversations(row.id)[index]
      : undefined;
    return {
      conversation,
      row,
      where: conversation
        ? {
            ...found.where,
            sessionKey: conversation.sessionId,
            harness: conversation.harness,
          }
        : found.where,
    };
  };

  /** The line between a conversation the session went on from and the next ("Continued on …"), if any. */
  const betweenLine = (
    row: InstanceRow,
    conversation: PriorConversation | undefined
  ): SessionMessage | undefined => {
    const event = conversation?.next
      ? ctx.db.atLimit
          .events([row.id])
          .find((one) => one.id === conversation.next)
      : undefined;
    return event ? limitEntry(row, event) : undefined;
  };

  /**
   * A stored transcript without its keep-alive pings: a ping and its answer
   * are hidden together, also after a hub restart (a new main-loop user
   * prompt closes that range; tool results do not), and their records go.
   */
  const withoutPings = (
    entries: SessionMessage[],
    records: Record<string, SendRecord>
  ): SessionMessage[] => {
    let quiet = false;
    const kept = entries.filter((entry) => {
      if (
        entry.type === "user" &&
        !entry.parent_tool_use_id &&
        userTurnText(entry)
      ) {
        quiet = (entry.sends ?? []).some(
          (id) => records[id]?.keepAlive === true
        );
      }
      return !quiet;
    });
    for (const [id, record] of Object.entries(records)) {
      if (record.keepAlive) {
        delete records[id];
      }
    }
    return kept;
  };

  /**
   * The newest window of the conversation a session runs now, as its
   * machine stores it (none yet: nothing), cut after the entry `at` a rewind
   * names, else after a fork's own `cut`.
   */
  const currentWindow = async (
    where: TranscriptWhere,
    at: string | undefined,
    forked: string | undefined
  ): Promise<TranscriptWindow | HistoryFault> => {
    if (!where.sessionKey) {
      return { entries: [], older: null, newer: null };
    }
    const cut = at ?? forked;
    const window = await storedWindow(
      where,
      cut
        ? { through: cut, limit: HISTORY_WINDOW }
        : { end: "newest", limit: HISTORY_WINDOW }
    );
    if ("fault" in window) {
      return window;
    }
    const last = window.entries.at(-1);
    if (cut && last?.uuid === cut && !includesRewindAnchor(where, last, at)) {
      window.entries.pop();
    }
    return window;
  };

  /** One of the hub's lines at an account's limit, as a stored transcript entry holds it. */
  const limitEntry = (
    row: { sessionId: string | null },
    event: { id: string; at: number; move: AccountMove }
  ): SessionMessage => ({
    type: "system",
    uuid: `limit-${event.id}`,
    session_id: row.sessionId ?? "",
    parent_tool_use_id: null,
    parent_agent_id: null,
    message: limitLine(row, event),
    timestamp: new Date(event.at).toISOString(),
  });

  /**
   * A row nobody has named, named from its stored transcript's oldest user
   * turn that says anything: the unambiguous answer to what the session is
   * called (write-once), read once the window that reaches the start is.
   */
  const nameFromStart = (
    row: InstanceRow,
    transcript: SessionMessage[]
  ): void => {
    if (!(row.title || row.derivedTitle)) {
      const first = ctx.firstTurnOf(transcript);
      if (first) {
        ctx.nameFromFirstTurn(row.machineId, row.id, first);
      }
    }
  };

  /**
   * What a stored transcript's newest window says about the row it belongs
   * to: a session the hub holds in custody ends on the notice that says so,
   * and, when the window reaches the start (`start`), its oldest user turn
   * names it ({@link nameFromStart}) and where its project was moved to its
   * machine opens it. Returns the hub's own lines for the builder to place,
   * each after the rows it followed when it was first placed (core
   * `HubLine`, `line_anchors`): the account lines but the one between two of
   * its conversations, which stands between them already ({@link readOlder}),
   * the lines its machine said ({@link noteMachineLine}), fleet watch's
   * (`noteWatch`), its context's (`noteContext`), and where it
   * started again fresh ({@link noteFreshStart}).
   */
  const readRowHistory = (
    row: InstanceRow,
    transcript: SessionMessage[],
    start: boolean
  ): HubLine[] => {
    if (start) {
      nameFromStart(row, transcript);
    }
    const lineAnchors = ctx.db.lineAnchorsOf(row.id);
    const placed = (entry: SessionMessage, at: number): HubLine => ({
      entry,
      at,
      after: lineAnchors.get(entry.uuid) ?? null,
    });
    const between = new Set(
      ctx.db.priorConversations(row.id).map((conversation) => conversation.next)
    );
    const lines = ctx.db.atLimit
      .events([row.id])
      .filter((event) => !between.has(event.id))
      .map((event) => placed(limitEntry(row, event), event.at));
    for (const note of ctx.db.machineLinesOf(row.id)) {
      lines.push(placed(lineEntry(row, machineLine(row, note)), note.at));
    }
    for (const said of ctx.db.watchLinesOf(row.id)) {
      lines.push(placed(lineEntry(row, watchLine(row, said)), said.at));
    }
    for (const said of ctx.db.contextLinesOf(row.id)) {
      lines.push(placed(lineEntry(row, contextLine(row, said)), said.at));
    }
    for (const kept of ctx.db.projectNotes.of(row.id)) {
      lines.push(placed(lineEntry(row, projectNoteLine(row, kept)), kept.at));
    }
    const fresh = ctx.db.freshStartOf(row.id);
    if (fresh !== null) {
      lines.push(placed(lineEntry(row, freshStartLine(row, fresh)), fresh));
    }
    const held = ctx.heldSessions.get(row.id);
    if (
      held &&
      ctx.registry.agent(row.machineId) &&
      (row.status === "sleeping" || row.status === "error")
    ) {
      transcript.push({
        type: "system",
        uuid: `custody-held-${row.id}`,
        session_id: row.sessionId ?? "",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: custodyLine(row, held.reason),
      });
    }
    if (start) {
      placeMovedHere(row, transcript);
    }
    return lines;
  };

  /** One of the hub's lines, `message`, as a stored transcript entry holds it. */
  const lineEntry = (
    row: { sessionId: string | null },
    message: HubLineMessage
  ): SessionMessage => ({
    type: "system",
    uuid: message.uuid,
    session_id: row.sessionId ?? "",
    parent_tool_use_id: null,
    parent_agent_id: null,
    message,
    ...(message.timestamp ? { timestamp: message.timestamp } : {}),
  });

  /** Where the session's project was moved to its machine for it: the transcript's first row. */
  const placeMovedHere = (
    row: InstanceRow,
    transcript: SessionMessage[]
  ): void => {
    const line = ctx.db.movedHereOf(row.id);
    if (!line) {
      return;
    }
    transcript.unshift({
      type: "system",
      uuid: `moved-here-${row.id}`,
      session_id: row.sessionId ?? "",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: movedHereLine(row, line),
      timestamp: new Date(line.at).toISOString(),
    });
  };

  return {
    forkSeeds,
    storedWindow,
    readHistory,
    readOlder,
  };
};
