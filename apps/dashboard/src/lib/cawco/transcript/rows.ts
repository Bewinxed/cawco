/**
 * The transcript folded into render rows. Consecutive tool calls collapse onto
 * one rail, a Task call becomes the branch it spawned, and the live tail —
 * streaming text, an open thinking block, the tool in flight — rides at the end
 * as rows of its own so it scrolls with the conversation rather than sitting in
 * fixed chrome.
 */

import {
  ASK_USER_QUESTION,
  COMPACT_SUMMARY_KIND,
  type ToolGlance,
} from "@cawco/core";
import type { SubagentState } from "#lib/utils/flow-types.js";
import type { SessionState } from "../client.svelte";
import type { Message } from "../types";
import { parkedAsks } from "./present";

/**
 * `grouped`, on the rows that can carry a speaker line: the speaker's previous
 * turn is the last voice above it, so this one draws no header of its own.
 * Decided once, as the rows are folded (see {@link Voices}).
 */
export type Row =
  /**
   * `streamed`: an answer this view streamed, settled. It keeps the live
   * row's key for as long as the view lives (see `keepLive`), and the live
   * row's component goes on drawing it: the settle is an update of the rows
   * already on screen, not a new row rendering the whole reply again.
   */
  | {
      kind: "single";
      key: string;
      message: Message;
      grouped: boolean;
      streamed?: boolean;
    }
  | { kind: "tools"; key: string; messages: Message[] }
  | { kind: "question"; key: string; message: Message }
  | { kind: "subagent"; key: string; branch: SubagentState; spawn: Message }
  /** A `delegate` / `start_session` call: the fleet session it spawned, as a fold. */
  | { kind: "delegate"; key: string; message: Message }
  /**
   * A workflow run, live, in the place it was started: its `run_workflow`
   * call (`runId` null: the call's result names it), or the first notice of
   * a run supervised here without one (`runId` set). Its receipts fold into
   * it rather than rows of their own.
   */
  | { kind: "run"; key: string; message: Message; runId: string | null }
  | { kind: "stream"; key: string; text: string }
  | { kind: "thinking"; key: string; text: string; live: boolean }
  /**
   * The turn's live tail as ONE place on the ledger: reasoning while the model
   * reasons, the answer once it speaks. Emitted under a single key on purpose
   * — these were two rows, so the reasoning was REMOVED at full height and the
   * answer opened a fresh space below the hole. One row means one container,
   * which can hold its space while its content changes.
   */
  | {
      kind: "live";
      key: string;
      thinking: string | null;
      thinkingLive: boolean;
      indicating: boolean;
      text: string;
      grouped: boolean;
    }
  | { kind: "livetool"; key: string; glance: ToolGlance }
  /**
   * A message sent into a running turn that the session has not read yet. It
   * has not happened in the conversation, so it sits after the live tail at
   * reduced presence; once read it is a `single` row under the same key, in
   * the place it was read.
   */
  | { kind: "queued"; key: string; message: Message; grouped: boolean }
  | { kind: "harness"; key: string; note: HarnessNote }
  /**
   * A compaction: the boundary the harness reported and the summary it wrote,
   * as one divider. `brief` is null until the summary has arrived (live, it
   * comes a moment after the boundary), and the divider opens onto nothing
   * until then. Keyed by the boundary where there is one, so the summary
   * landing is the same row gaining its brief. A compaction this view saw
   * begin is one row from its first moment (see {@link Told}): it stands
   * `compacting` while the harness compacts, before or after its boundary
   * has come, and becomes `done` or `failed` in place.
   */
  | {
      kind: "compaction";
      key: string;
      /** The session it is in: where its open state is kept. */
      session: string;
      brief: string | null;
      preTokens?: number;
      trigger?: "auto" | "manual";
      timestamp?: string;
      /** Every compaction read back from history is `done`. */
      state: "compacting" | "done" | "failed";
      /** Why it failed, in the harness's words, when it said. */
      error?: string;
    };

/**
 * Who has the floor, row by row: a speaker line appears only when the speaker
 * changes. The reader's turns ("You") group with the reader's turns before
 * them, the agent's with the agent's. The agent's run — its tool calls,
 * reasoning, task lines, the cards its calls open — is the agent's and does
 * not end its group, but carries no header either, so the first words the
 * agent says after the reader still get one. A note cawco or the harness put
 * in on someone else's behalf (a peer, rule, report, hand-off, workflow row,
 * a failure card, a command's output, an interruption) is its own voice and
 * ends every group. Rows that paint nothing change nothing.
 */
export interface Voices {
  /** Whether the agent's group has drawn its header yet. */
  headed: boolean;
  speaker: "you" | "agent" | null;
}

const NO_VOICE: Voices = { speaker: null, headed: false };

export type Voice = "you" | "says" | "acts" | "note" | "none";

/** SystemLine's rows that belong to the agent's run rather than interrupt it. */
const RUN_LINES = new Set(["system.task"]);

/**
 * Whose voice one message is, by the rule above. The history reader asks it
 * too, so a chunk never starts in the middle of the reader's run of turns.
 */
export function voiceOfMessage(m: Message): Voice {
  // Harness plumbing in the reader's role is a task note on the rail.
  if (isHarnessNote(m)) {
    return "acts";
  }
  switch (m.type) {
    case "user":
      return "you";
    case "assistant":
      return m.content.trim() ? "says" : "none";
    case "thinking":
      return m.content.trim() ? "acts" : "none";
    case "result.success":
      return "none";
    default:
      return RUN_LINES.has(m.type) ? "acts" : "note";
  }
}

function voiceOf(row: Row): Voice {
  switch (row.kind) {
    case "single":
    case "queued":
      return voiceOfMessage(row.message);
    case "live":
      return row.text ? "says" : "acts";
    case "compaction":
      return "note";
    default:
      // tools, livetool, question, subagent, delegate, thinking, stream, and
      // a harness task note: all of them the agent's run.
      return "acts";
  }
}

/** Advance `v` past `row`; true when `row` continues its speaker's group. */
function voice(v: Voices, row: Row): boolean {
  switch (voiceOf(row)) {
    case "you": {
      const grouped = v.speaker === "you";
      v.speaker = "you";
      v.headed = true;
      return grouped;
    }
    case "says": {
      const grouped = v.speaker === "agent" && v.headed;
      v.speaker = "agent";
      v.headed = true;
      return grouped;
    }
    case "acts":
      if (v.speaker !== "agent") {
        v.speaker = "agent";
        v.headed = false;
      }
      return false;
    case "note":
      v.speaker = null;
      v.headed = false;
      return false;
    default:
      return false;
  }
}

/**
 * The reader's rows whose well carries on into the next row: the next row
 * that paints is the reader's too, grouped under the same header. The well is
 * drawn a row at a time (the list is virtual, so nothing can wrap a run), and
 * this is what tells a row whether its bottom edge is the well's or a
 * hairline to the next message. `gone` rows are leaving and draw no part of
 * any run.
 */
export function wellRuns(
  rows: Row[],
  gone: (key: string) => boolean = () => false
): Set<string> {
  const runs = new Set<string>();
  let above: string | null = null;
  for (const row of rows) {
    const v = voiceOf(row);
    if (v === "none" || gone(row.key)) {
      continue;
    }
    const you = v === "you" && (row.kind === "single" || row.kind === "queued");
    if (you && row.grouped && above !== null) {
      runs.add(above);
    }
    above = you ? row.key : null;
  }
  return runs;
}

/** Where the voices stand after `rows`, from the top of the transcript. */
function voicesAfter(rows: Row[]): Voices {
  const v = { ...NO_VOICE };
  for (const row of rows) {
    voice(v, row);
  }
  return v;
}

/**
 * A harness-injected notification, parsed.
 *
 * Claude Code posts one as a role-`user` message each time a background
 * subagent stops. The operator never typed it, and its `<result>` is a full
 * markdown report — so flattened into a user turn it reads as a wall of literal
 * angle-bracket tags with the markdown dead. It belongs on the rail, folded.
 *
 * The specimen, from a stored transcript (role `user`, content a plain string,
 * no preamble — it opens directly on the tag):
 *
 * ```
 * <task-notification>
 * <task-id>aad4dccf5841ae021</task-id>
 * <tool-use-id>toolu_01FvibmDFmAvhSw643Lwmhiz</tool-use-id>
 * <output-file>/tmp/…/tasks/aad4dccf5841ae021.output</output-file>
 * <status>completed</status>
 * <summary>Agent "Finish opencode question rendering" finished</summary>
 * <note>A task-notification fires each time this agent stops…</note>
 * <result>All seven gates pass. Here is the report.
 *
 * ## A. Verification of your trace
 * …</result>
 * </task-notification>
 * ```
 */
export interface HarnessNote {
  /** The report itself, as markdown. Empty means there is nothing to expand. */
  body: string;
  /** `completed` / `failed` / `stopped`, or '' where the block carried none. */
  status: string;
  /** The `<summary>` line — what the fold says while it is closed. */
  title: string;
}

/** The inner text of the first `<tag>…</tag>`, or undefined. */
const inner = (tag: string, text: string): string | undefined =>
  // RegExp#exec returns RegExpExecArray | null — a tag absent from text hits the null case.
  new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1];

const isReminder = (trimmed: string): boolean =>
  trimmed.startsWith("<system-reminder>") &&
  trimmed.endsWith("</system-reminder>");

/**
 * Whether a message is harness plumbing wearing the operator's role.
 *
 * Classified on the CONTENT, not the type, on purpose: the live path already
 * re-types these to `ui.system_note` before they reach the row grammar and the
 * stored path may hand them over as plain `user`, so the text is the one signal
 * both share. Narrow by design — the other things `ui.system_note` carries (a
 * local command's echo, a denied permission) match none of these triggers and
 * keep the line they already had.
 */
export function isHarnessNote(m: Message): boolean {
  if (m.type !== "user" && m.type !== "ui.system_note") {
    return false;
  }
  const head = m.content.trimStart();
  // TOP-LEVEL only. An `includes` over the first 200 characters would also
  // swallow an operator who merely WRITES the tag ("fix the
  // <task-notification> renderer") and bury their message in a fold. The
  // block either opens the message or it is prose about the block.
  if (head.startsWith("[SYSTEM NOTIFICATION")) {
    return true;
  }
  if (head.startsWith("<task-notification>")) {
    return true;
  }
  return isReminder(m.content.trim());
}

/**
 * The block, read. Never throws and never returns null: a trigger that matches
 * but parses to nothing still becomes a fold carrying its own raw text, because
 * the failure mode this exists to kill is the soup inline — one click away is
 * always better than flattened across the transcript.
 */
export function parseHarnessNote(text: string): HarnessNote {
  const whole = text.trim();
  if (isReminder(whole)) {
    return {
      title: "System reminder",
      status: "",
      body: (inner("system-reminder", whole) ?? "").trim(),
    };
  }
  const title = inner("summary", text)?.trim();
  const body = (inner("result", text) ?? "").trim();
  if (!(title || body)) {
    return { title: "Harness notification", status: "", body: whole };
  }
  return {
    title: title || "Harness notification",
    status: inner("status", text)?.trim() ?? "",
    body,
  };
}

const isToolMsg = (m: Message): boolean =>
  m.type === "tool.use" || m.type === "tool.handoff";

/** A question the agent asked, rendered as its own card rather than a tool row. */
const isQuestionMsg = (m: Message): boolean =>
  isToolMsg(m) && m.metadata?.toolName === ASK_USER_QUESTION;

/**
 * A hand-off that spawned a session of its own. A plain `handoff` addresses a
 * session that already exists and stays a tool row; these two open a fleet
 * instance the card follows.
 */
const isDelegateMsg = (m: Message): boolean =>
  m.type === "tool.handoff" &&
  (m.metadata?.handoffKind === "delegate" ||
    m.metadata?.handoffKind === "start");

/** A `run_workflow` call, whichever harness named the tool (`mcp__cawco__…`, `cawco_…`). */
const RUN_TOOL = /(?:^|_)run_workflow$/;
const isRunMsg = (m: Message): boolean =>
  isToolMsg(m) && RUN_TOOL.test(m.metadata?.toolName ?? "");

/** A run id, as the hub writes one into a call's result and a receipt's body. */
const RUN_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
/** The `runId` key in a call's result, and the quoting up to its value. */
const RUN_ID_KEY = /runId[^0-9a-f]{0,6}/;

/** The run a `run_workflow` call started, once its result has come back. */
export function startedRunOf(m: Message): string | null {
  const result = m.metadata?.toolResult;
  if (result === undefined || result === null) {
    return null;
  }
  // `{"runId":"…"}`, as a string or inside content blocks (quotes escaped).
  const text = typeof result === "string" ? result : JSON.stringify(result);
  const named = RUN_ID_KEY.exec(text);
  return named
    ? (RUN_ID.exec(text.slice(named.index + named[0].length))?.[0] ?? null)
    : null;
}

/** The run a workflow notice is about, when it names one (a note names none). */
const noticeRunOf = (m: Message): string | null =>
  m.type === "user.peer" && m.metadata?.workflowEvent !== undefined
    ? (RUN_ID.exec(m.content)?.[0] ?? null)
    : null;

/**
 * A workflow notice, read against the transcript it is in: folded into its
 * run's block, or — for a run this session supervises but did not start
 * with a call (a run launched from the dashboard) — the block's own place,
 * its first notice (the supervisor brief).
 */
export type Receipt = { fold: true } | { fold: false; anchor: string } | null;

/**
 * How each workflow notice in `messages` is told. A run started here by a
 * `run_workflow` call is told by the call's block, so every notice naming
 * it folds, and so does a note from a workflow one of those calls ran (a
 * note names no run). A run supervised here without a call is told by a
 * block at its first notice, and its later notices fold into that. Read
 * over the whole transcript, so a fold that restarts at a cut still knows
 * every run started before it.
 */
function receiptsOf(messages: Message[]): (m: Message, i: number) => Receipt {
  const byCall = new Set<string>();
  const names = new Set<string>();
  const first = new Map<string, number>();
  messages.forEach((m, i) => {
    const notice = noticeRunOf(m);
    if (notice && !first.has(notice)) {
      first.set(notice, i);
    }
    if (!isRunMsg(m)) {
      return;
    }
    const run = startedRunOf(m);
    if (run) {
      byCall.add(run);
    }
    const input = m.metadata?.toolInput;
    const name =
      input && typeof input === "object" && !Array.isArray(input)
        ? input.name
        : undefined;
    if (typeof name === "string") {
      names.add(name.toLowerCase());
    }
  });
  if (first.size === 0 && names.size === 0) {
    return () => null;
  }
  return (m, i) => {
    if (m.type !== "user.peer" || m.metadata?.workflowEvent === undefined) {
      return null;
    }
    const run = noticeRunOf(m);
    if (!run) {
      return names.has((m.metadata?.peerName ?? "").toLowerCase())
        ? { fold: true }
        : null;
    }
    if (byCall.has(run) || first.get(run) !== i) {
      return { fold: true };
    }
    return { fold: false, anchor: run };
  };
}

/**
 * Whether a read of a transcript holds a compaction: what a divider, and Caw
 * beside its word, will be drawn for. Asked of a page as it arrives, before
 * any of its rows is folded.
 */
export const holdsCompaction = (
  blocks: readonly { type: string; metadata?: { noteKind?: string } }[]
): boolean =>
  blocks.some(
    (block) =>
      block.type === "system.compact_boundary" ||
      (block.type === "ui.system_note" &&
        block.metadata?.noteKind === COMPACT_SUMMARY_KIND)
  );

/** The harness's word that it compacted the conversation. */
const isCompactBoundary = (m: Message | undefined): m is Message =>
  m?.type === "system.compact_boundary";

/** The summary a compaction wrote: its brief. */
const isCompactSummary = (m: Message | undefined): m is Message =>
  m?.type === "ui.system_note" && m.metadata?.noteKind === COMPACT_SUMMARY_KIND;

/**
 * Where the newest compaction in `messages` begins, by the pairing
 * {@link compactionAt} folds: its boundary, or its summary when that was read
 * back without one. -1 when they hold none.
 */
export function newestCompaction(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isCompactBoundary(messages[i])) {
      return i;
    }
    if (isCompactSummary(messages[i])) {
      return isCompactBoundary(messages[i - 1]) ? i - 1 : i;
    }
  }
  return -1;
}

/**
 * The compaction that begins at `messages[i]`, and how many messages it is:
 * a boundary with the summary right after it, a boundary whose summary has
 * not arrived, or a summary read back without its boundary. `null` for any
 * other message.
 */
function compactionAt(
  messages: Message[],
  i: number,
  said: ReadonlyMap<string, string>
): { row: Row; span: number } | null {
  const m = messages[i];
  const boundary = isCompactBoundary(m) ? m : null;
  const summary = boundary ? messages[i + 1] : m;
  const brief = isCompactSummary(summary) ? summary : null;
  const first = boundary ?? brief;
  if (!first) {
    return null;
  }
  const own = `c:${keyOf(first, i)}`;
  return {
    row: {
      kind: "compaction",
      // The row this view drew while it compacted, when it saw it begin.
      key: said.get(own) ?? own,
      state: "done",
      session: first.instanceId,
      // A summary the harness stored with no words in it (a compaction that
      // was cut short) is no brief: the divider has nothing to open.
      brief: brief?.content.trim() ? brief.content : null,
      preTokens: boundary?.metadata?.preTokens,
      trigger: boundary?.metadata?.trigger,
      timestamp: first.timestamp,
    },
    span: boundary && brief ? 2 : 1,
  };
}

/** The branch a tool.use spawned, when it opened one — a real subagent fold. */
const branchOf = (
  m: Message,
  subagents: Record<string, SubagentState>
): SubagentState | null => {
  const id = m.metadata?.toolId;
  return id ? (subagents[id] ?? null) : null;
};

const keyOf = (m: Message, _index: number): string => m.id;

/**
 * Where the messages still waiting on the session begin. The store keeps them
 * at the end of the list until they are read ({@link Message.queued}), so this
 * reads only the last few.
 */
export function queuedFrom(messages: Message[]): number {
  let from = messages.length;
  while (from > 0 && messages[from - 1].queued) {
    from -= 1;
  }
  return from;
}

/** The messages that have happened: everything but what is still waiting. */
const settledOf = (messages: Message[]): Message[] => {
  const from = queuedFrom(messages);
  return from === messages.length ? messages : messages.slice(0, from);
};

/**
 * The messages the transcript draws: the settled ones, less every call whose
 * ask is parked on the composer. The composer, grown into the ask, is that
 * call until it is answered, so the call takes no room here while it waits,
 * and its row arrives as the composer folds back.
 *
 * A question is the composer's from the moment it is asked, not from the
 * moment its ask lands: its call reaches the transcript a frame or two before
 * the ask does, and drawing it there meant a "needs you" card flashed in the
 * transcript and the tail jumped twice as it came and went. So an unanswered
 * question is left out in every mode: no mode answers a question for the
 * reader. Bypass and Full Send included — Full Send answers Claude Code's
 * safety checks, never a question — so its ask always comes to the composer.
 */
const drawnOf = (session: SessionState): Message[] => {
  const settled = settledOf(session.messages);
  const gated = new Set(
    parkedAsks(session.pending).flatMap((ask) =>
      ask.toolUseId ? [ask.toolUseId] : []
    )
  );
  const waiting = (m: Message): boolean =>
    isQuestionMsg(m) && (m.metadata?.toolStatus ?? "pending") === "pending";
  return settled.filter(
    (m) => !((m.toolCallId && gated.has(m.toolCallId)) || waiting(m))
  );
};

/**
 * The row grammar itself: a list of messages folded into rows, with no live tail
 * and no session. The main transcript and a subagent's own mini-transcript both
 * go through this, so a delegate's tool calls and reasoning read exactly like
 * the parent's rather than like a printed log.
 */
export function foldMessages(
  messages: Message[],
  subagents: Record<string, SubagentState>
): Row[] {
  return foldRange(messages, subagents, 0, { ...NO_VOICE }, NO_SAID).rows;
}

/**
 * The row a message makes on its own, when it is one that never joins a run
 * of calls: harness plumbing (never a turn, so it never reaches the `single`
 * row that would give it a Who header and user styling), a subagent's
 * branch, a question, a delegate, a workflow run. `null` for the rest.
 */
function ownRow(
  m: Message,
  i: number,
  subagents: Record<string, SubagentState>,
  receipt: Receipt
): Row | null {
  if (receipt && !receipt.fold) {
    return {
      kind: "run",
      key: `r:${keyOf(m, i)}`,
      message: m,
      runId: receipt.anchor,
    };
  }
  if (isHarnessNote(m)) {
    return {
      kind: "harness",
      key: `hn:${keyOf(m, i)}`,
      note: parseHarnessNote(m.content),
    };
  }
  const branch = isToolMsg(m) ? branchOf(m, subagents) : null;
  if (branch) {
    return { kind: "subagent", key: keyOf(m, i), branch, spawn: m };
  }
  if (isQuestionMsg(m)) {
    return { kind: "question", key: `q:${keyOf(m, i)}`, message: m };
  }
  if (isDelegateMsg(m)) {
    return { kind: "delegate", key: `d:${keyOf(m, i)}`, message: m };
  }
  if (isRunMsg(m)) {
    return { kind: "run", key: `r:${keyOf(m, i)}`, message: m, runId: null };
  }
  return null;
}

/**
 * The grammar over `messages[from..]`. `starts` is the message index each row
 * begins at, kept beside the rows rather than on them: it is what lets a
 * later fold splice on at a row boundary, and no renderer needs it. `voices`
 * is where the speakers stood before `from`, and is advanced past these rows.
 * `said` is the answers this view streamed, by message key, each with the
 * live row's key it keeps.
 */
function foldRange(
  messages: Message[],
  subagents: Record<string, SubagentState>,
  from: number,
  voices: Voices,
  said: ReadonlyMap<string, string>
): { rows: Row[]; starts: number[] } {
  const rows: Row[] = [];
  const starts: number[] = [];
  const receiptAt = receiptsOf(messages);

  let i = from;
  while (i < messages.length) {
    const m = messages[i];
    const receipt = receiptAt(m, i);

    if (receipt?.fold) {
      i += 1;
      continue;
    }
    starts.push(i);

    const compaction = compactionAt(messages, i, said);
    if (compaction) {
      rows.push(compaction.row);
      i += compaction.span;
      continue;
    }

    const own = ownRow(m, i, subagents, receipt);
    if (own) {
      rows.push(own);
      i += 1;
      continue;
    }

    if (isToolMsg(m)) {
      const run: Message[] = [];
      const start = i;
      while (
        i < messages.length &&
        isToolMsg(messages[i]) &&
        !isQuestionMsg(messages[i]) &&
        !isDelegateMsg(messages[i]) &&
        !isRunMsg(messages[i]) &&
        !branchOf(messages[i], subagents)
      ) {
        run.push(messages[i]);
        i += 1;
      }
      rows.push({
        kind: "tools",
        key: `tools:${keyOf(run[0], start)}`,
        messages: run,
      });
      continue;
    }

    const live = said.get(keyOf(m, i));
    rows.push(
      live
        ? {
            kind: "single",
            key: live,
            message: m,
            grouped: false,
            streamed: true,
          }
        : { kind: "single", key: keyOf(m, i), message: m, grouped: false }
    );
    i += 1;
  }

  markVoices(rows, voices);
  return { rows, starts };
}

/** Group a fold's own rows, not yet seen by anyone, in place. */
function markVoices(rows: Row[], voices: Voices): void {
  for (const row of rows) {
    const grouped = voice(voices, row);
    if (row.kind === "single") {
      row.grouped = grouped;
    }
  }
}

/**
 * A subagent's own transcript, for the peek inside its branch card. Nested
 * branches are not resolved — the SDK caps delegation at one level, so a
 * `tool.use` in here is a call the delegate made, never a fold of its own.
 */
export function branchRows(branch: SubagentState): Row[] {
  const rows = foldMessages(branch.messages, {});
  if (branch.streaming) {
    rows.push({ kind: "stream", key: "branch:stream", text: branch.streaming });
  }
  return rows;
}

/**
 * The live row the last fold ended on — what tells the next fold whether its
 * live row is the SAME row, still being written, or a new one.
 */
export interface LiveMemo {
  /** Its answer so far; empty while it reasons or only indicates. */
  answer: string;
  /** Which generation of the tail it is: the `live:<gen>` in its key. */
  gen: number;
  /** Whether the last fold had a live row at all. */
  on: boolean;
  /** Its reasoning so far; empty while it answers or only indicates. */
  reasoning: string;
}

const NO_LIVE: LiveMemo = { gen: 0, on: false, answer: "", reasoning: "" };

const NO_SAID: ReadonlyMap<string, string> = new Map();

/**
 * What the last fold was folded from, so the next one can tell whether it is
 * looking at the same transcript grown at the end or at a different one.
 */
export interface FoldMemo {
  /**
   * The waiting sends drawn above the agent's tail — its live row and the call
   * in flight — or null when this fold had no such tail. See `tailRows`.
   */
  ahead: string[] | null;
  /** How many subagent branches were known: a new one can re-type an old row. */
  branches: number;
  /** How many messages those rows cover, and the first and last of them. */
  count: number;
  first: Message | undefined;
  last: Message | undefined;
  /** The live row this fold ended on. */
  live: LiveMemo;
  /** The settled rows — everything before the live tail — and where each begins. */
  rows: Row[];
  /**
   * The keys this view's own rows gave to what they became: an answer it
   * streamed, by message key, keeps the live row's key; a compaction it saw
   * begin, by its boundary row's own key, keeps the row it stood as.
   */
  said: ReadonlyMap<string, string>;
  starts: number[];
  /** The compactions this view saw begin that are not yet a plain row. */
  told: readonly Told[];
  /** Where the speakers stand after the settled rows. */
  voices: Voices;
  /** The waiting sends this fold drew, by key. */
  waited: string[];
}

/**
 * A COMPACTION HAS ONE ROW, FROM ITS FIRST MOMENT TO ITS LAST.
 *
 * The harnesses report a compaction in two orders. opencode sends its
 * boundary as the compaction begins, Claude Code once it is over (and its
 * word that it succeeded a frame before that). Either way the session says
 * `compacting` for as long as it lasts, and that is when the row begins:
 * under a key of its own, standing at the tail where no boundary tells it
 * yet. The boundary that comes after the message it began after is this
 * compaction's, whenever it comes: its row takes the key the row already
 * has (`said`), so to the list it is the same row throughout, gaining its
 * facts. When the session stops compacting, the session's record of the
 * last compaction says how it went: a record newer than the one it began
 * with that failed is a failure, one that succeeded, or a boundary of its
 * own, is done, and with neither it never happened and its row folds away.
 */
export interface Told {
  /** The drawn message it began after; null before the first. */
  after: string | null;
  /** The drawn message its row stands after while no boundary tells it. */
  anchor: string | null;
  /** `lastCompaction.at` as it began: a record with another is its outcome. */
  at: number | null;
  /** Its boundary row's own key, once that has come. */
  boundary: string | null;
  error?: string;
  /** Its row's key from its first moment. */
  key: string;
  state: "compacting" | "done" | "failed";
}

/** The keys of rows that stood for a compaction before its boundary came. */
const TOLD_KEY = "c:at:";

/** A row that paints nothing: a result, a frame that only carried a call. */
const unpainted = (row: Row): boolean =>
  row.kind === "single" && voiceOfMessage(row.message) === "none";

/** Where the drawn message `id` is, from the end; -1 when it is not. */
function indexOfId(messages: Message[], id: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].id === id) {
      return i;
    }
  }
  return -1;
}

/**
 * The message a compaction beginning now began after: the last one drawn,
 * or, when the last row on screen is a compaction whose brief has not come,
 * the one before that row — a boundary sent as the compaction began, a
 * frame ahead of the word that it is compacting.
 */
function beganAfter(
  messages: Message[],
  rows: Row[],
  starts: number[]
): string | null {
  let r = rows.length - 1;
  while (r >= 0 && unpainted(rows[r])) {
    r -= 1;
  }
  const last = rows[r];
  if (
    last?.kind === "compaction" &&
    last.brief === null &&
    !last.key.startsWith(TOLD_KEY)
  ) {
    return messages[starts[r] - 1]?.id ?? null;
  }
  return messages.at(-1)?.id ?? null;
}

/**
 * The compactions this view has seen begin, after this fold: one begun,
 * its boundary tied to its row, its outcome read. `rows` is patched where a
 * boundary is tied (a copy, never the memo's), and `said` carries the tie
 * to every later fold.
 */
function tell(
  session: SessionState,
  messages: Message[],
  settled: { rows: Row[]; starts: number[] },
  memo: FoldMemo | null,
  said: ReadonlyMap<string, string>
): { rows: Row[]; said: ReadonlyMap<string, string>; told: Told[] } {
  const compacting = session.sdkStatus === "compacting";
  const record = session.lastCompaction;
  const { rows, starts } = settled;
  const told = [...(memo?.told ?? [])];
  if (!(compacting || told.length > 0)) {
    return { rows, said, told };
  }
  if (compacting && !told.some((each) => each.state === "compacting")) {
    const after = beganAfter(messages, rows, starts);
    const taken = new Set([...said.values(), ...told.map((each) => each.key)]);
    let key = `${TOLD_KEY}${after ?? "start"}`;
    for (let n = 2; taken.has(key); n += 1) {
      key = `${TOLD_KEY}${after ?? "start"}:${n}`;
    }
    told.push({
      key,
      after,
      anchor: messages.at(-1)?.id ?? null,
      at: record?.at ?? null,
      boundary: null,
      state: "compacting",
    });
  }
  const tie: Tie = { rows, said, copied: false };
  const seen = told.map((each) => {
    const next = tieBoundary(each, messages, starts, tie);
    return next.state === "compacting" && !compacting
      ? outcome(next, record)
      : next;
  });
  return {
    rows: tie.rows,
    said: tie.said,
    // A compaction done and told by its boundary is a plain row from here.
    told: seen.filter(
      (each): each is Told =>
        each !== null && !(each.state === "done" && each.boundary !== null)
    ),
  };
}

/** The rows and keys a fold's ties write to: copied before the first. */
interface Tie {
  copied: boolean;
  rows: Row[];
  said: ReadonlyMap<string, string>;
}

/**
 * `each` with its boundary tied to it, when this fold holds one: the first
 * compaction row past the message it began after takes its key. Untold
 * still, a compaction that is running rides the tail.
 */
function tieBoundary(
  each: Told,
  messages: Message[],
  starts: number[],
  tie: Tie
): Told {
  if (each.boundary !== null || each.state === "failed") {
    return each;
  }
  const r = boundaryOf(each, messages, tie.rows, starts);
  if (r < 0) {
    const anchor = messages.at(-1)?.id ?? null;
    return each.state === "compacting" && anchor !== each.anchor
      ? { ...each, anchor }
      : each;
  }
  if (!tie.copied) {
    tie.rows = tie.rows.slice();
    tie.said = new Map(tie.said);
    tie.copied = true;
  }
  const own = tie.rows[r].key;
  tie.rows[r] = { ...tie.rows[r], key: each.key } as Row;
  (tie.said as Map<string, string>).set(own, each.key);
  return { ...each, boundary: own };
}

/** Where the boundary `each` is told by stands among `rows`, or -1. */
function boundaryOf(
  each: Told,
  messages: Message[],
  rows: Row[],
  starts: number[]
): number {
  let from = 0;
  if (each.after !== null) {
    const at = indexOfId(messages, each.after);
    // The message it began after is not drawn any more: nothing is known
    // to come after it.
    if (at < 0) {
      return -1;
    }
    from = at + 1;
  }
  return rows.findIndex(
    (row, at) =>
      row.kind === "compaction" &&
      starts[at] >= from &&
      !row.key.startsWith(TOLD_KEY)
  );
}

/**
 * How a compaction that has stopped went, by the session's record of the
 * last one: a newer record that failed, one that succeeded or that its
 * boundary made — or null, with none of them: it was skipped, or stopped,
 * and its row folds away.
 */
function outcome(
  told: Told,
  record: SessionState["lastCompaction"]
): Told | null {
  const newer = (record?.at ?? null) !== told.at;
  if (newer && record?.result === "failed") {
    return { ...told, state: "failed", error: record.error };
  }
  if (told.boundary !== null || (newer && record?.result === "success")) {
    return { ...told, state: "done" };
  }
  return null;
}

/**
 * No working indicator under a compaction that is done and still waiting
 * for its boundary. Claude Code says it succeeded a frame before it sends
 * the boundary, and in that frame the session is busy and no longer
 * compacting: the indicator came in under the row settling above it, and
 * left again as the boundary landed.
 */
function quietWhileSettling(
  content: LiveContent | null,
  told: readonly Told[]
): LiveContent | null {
  const settling = told.some(
    (each) => each.state === "done" && each.boundary === null
  );
  return settling && content?.indicating && !content.text ? null : content;
}

/** Each compaction's drawn row by the row it is drawn from, for as long as it stands so. */
const drawnAs = new WeakMap<object, Row>();

/**
 * The settled rows as drawn: a told compaction's row in the state it is
 * in, and each one no boundary tells yet standing after the message it is
 * anchored to. Rows put in among them regroup the voices after them.
 */
function presentTold(
  rows: Row[],
  starts: number[],
  told: readonly Told[],
  messages: Message[],
  session: string,
  voices: Voices
): { rows: Row[]; voices: Voices } {
  if (told.length === 0) {
    return { rows, voices };
  }
  const byKey = new Map(told.map((each) => [each.key, each]));
  const drawn = rows.map((row) => {
    if (row.kind !== "compaction") {
      return row;
    }
    const each = byKey.get(row.key);
    return each
      ? drawnFrom(row, { ...row, state: each.state, error: each.error })
      : row;
  });
  const untold = told
    .filter((each) => each.boundary === null)
    .map((each) => {
      const at = each.anchor === null ? -1 : indexOfId(messages, each.anchor);
      let place = rows.length;
      if (each.anchor === null) {
        place = 0;
      } else if (at >= 0) {
        place = starts.findLastIndex((start) => start <= at) + 1;
      }
      return { each, place };
    })
    .sort((a, b) => b.place - a.place);
  if (untold.length === 0) {
    return { rows: drawn, voices };
  }
  for (const { each, place } of untold) {
    drawn.splice(
      place,
      0,
      drawnFrom(each, {
        kind: "compaction",
        key: each.key,
        session,
        brief: null,
        state: each.state,
        error: each.error,
      })
    );
  }
  const v = { ...NO_VOICE };
  for (let i = 0; i < drawn.length; i += 1) {
    const row = drawn[i];
    const grouped = voice(v, row);
    if (row.kind === "single" && row.grouped !== grouped) {
      drawn[i] = { ...row, grouped };
    }
  }
  return { rows: drawn, voices: v };
}

/**
 * The row `source` is drawn as, the same object for as long as what it
 * says stays the same: a row whose object changes on every fold draws its
 * component again on every streamed frame.
 */
function drawnFrom(
  source: object,
  row: Extract<Row, { kind: "compaction" }>
): Row {
  const was = drawnAs.get(source);
  if (
    was?.kind === "compaction" &&
    was.key === row.key &&
    was.state === row.state &&
    was.error === row.error
  ) {
    return was;
  }
  drawnAs.set(source, row);
  return row;
}

/**
 * A fold, and what happened to the live row since the last one.
 *
 * `ended` is the one fact the transcript cannot read off the rows: a live
 * row that has just become a settled one. The streamed answer ends as an
 * assistant message under the live row's own key, and the streamed reasoning
 * as a thinking message under a key of its own — but on screen each is the
 * same object, and the transcript must treat it as one: no arrival, no
 * replay, not a pixel moved.
 */
export interface Fold {
  appended: boolean;
  /**
   * The last fold's live row, when this fold ended it: its key, and the
   * settled row that continues it — or null when nothing does, and it leaves.
   * An answer's settled row keeps the live row's key (`keepLive`): `into` is
   * `key` then, and only reasoning settles under a key of its own.
   */
  ended: {
    key: string;
    into: string | null;
    as: "answer" | "reasoning";
  } | null;
  memo: FoldMemo;
  rows: Row[];
}

/**
 * Whether two positions hold the same message: identity, deliberately not
 * the uuid. The store hands back the same proxy for the same entry, and a
 * read that replaced the array with equal entries has replaced the objects
 * the kept rows would point at — a result attached to the new copy of a
 * call would never reach a row still holding the old one.
 */
const sameMessage = (a: Message | undefined, b: Message | undefined): boolean =>
  a !== undefined && a === b;

/**
 * Where a fold may begin: a turn the reader opened, not a delegate's. Tool
 * results never make it here as messages of their own — the hub's builder
 * folds them into the call — so there is no dangling pair for a cut to split.
 * The same test names what the reader sent, for the composer's recall.
 */
export const opensTurn = (m: Message): boolean =>
  m.type === "user" && !m.parentToolUseId && !isHarnessNote(m);

/**
 * Where a fold of `messages` may restart given what `memo` was folded from,
 * or -1 where it has to start over. The transcript must still be the memo's
 * — same first message, same message at the old end, no new branch. The cut
 * is then the last turn opener at or before the old end.
 */
function cutFor(messages: Message[], memo: FoldMemo, branches: number): number {
  if (
    memo.count === 0 ||
    messages.length < memo.count ||
    branches !== memo.branches ||
    !sameMessage(messages[0], memo.first) ||
    !sameMessage(messages[memo.count - 1], memo.last)
  ) {
    return -1;
  }
  let cut = Math.min(memo.count, messages.length - 1);
  while (cut > 0 && !opensTurn(messages[cut])) {
    cut -= 1;
  }
  // No opener anywhere before the end is a transcript of a few lines: folded
  // whole rather than proving the cut is safe.
  return cut > 0 ? cut : -1;
}

/**
 * The rows again, folding only what arrived since `memo`.
 *
 * Coming back to a transcript re-folded every message and re-rendered every
 * row — markdown parsed, code highlighted — for the sake of the handful that
 * arrived while it was away. When the transcript is the one the memo was
 * folded from, merely longer, the fold restarts at the last turn opener
 * before the old end: the rows before it are the same objects, so the keyed
 * each leaves their components alone, and only that turn and the new ones
 * are folded. The live tail is always re-derived from the session.
 *
 * Anything else is a full fold: a read that replaced the array, a rewind
 * that cut it, an older chunk prepended in front, or a subagent branch that
 * has since opened (which turns a call row into a fold). All of those change
 * rows BEFORE the old end, which an append cannot express.
 */
export function buildRowsFrom(
  session: SessionState,
  memo: FoldMemo | null
): Fold {
  const messages = drawnOf(session);
  const branches = Object.keys(session.subagents).length;
  const cut = memo ? cutFor(messages, memo, branches) : -1;
  const appended = memo !== null && cut >= 0;
  const folded =
    memo && appended
      ? foldOnto(messages, session.subagents, memo, cut)
      : foldAll(messages, session.subagents, memo?.said ?? NO_SAID);
  const { starts, voices } = folded;
  const { rows, told, ...toldSaid } = tell(
    session,
    messages,
    folded,
    memo,
    memo?.said ?? NO_SAID
  );

  const prior = memo?.live ?? NO_LIVE;
  const content =
    quietWhileSettling(liveContent(session), told) ??
    answerLanding(prior, rows);
  const same = prior.on && content !== null && continues(prior, content);
  const gen = same ? prior.gen : prior.gen + 1;
  const ended = prior.on && !same ? endOf(prior, rows, memo) : null;
  const said = keepLive(ended, rows, toldSaid.said);
  const drawn = presentTold(
    rows,
    starts,
    told,
    messages,
    session.instanceId,
    voices
  );
  const tool =
    session.currentTool && !called(session, session.currentTool.toolId)
      ? session.currentTool
      : null;
  const from = queuedFrom(session.messages);
  const waited = session.messages
    .slice(from)
    .map((message, i) => keyOf(message, from + i));
  const ahead = aheadOf(memo, waited, content !== null || tool !== null);
  return {
    rows: [
      ...drawn.rows,
      ...tailRows(session, content, tool, gen, new Set(ahead), {
        ...drawn.voices,
      }),
    ],
    memo: {
      rows,
      starts,
      said,
      told,
      count: messages.length,
      first: messages[0],
      last: messages.at(-1),
      branches,
      voices,
      ahead,
      waited,
      live: content
        ? {
            gen,
            on: true,
            answer: content.text,
            reasoning: content.thinking ?? "",
          }
        : { ...NO_LIVE, gen },
    },
    appended,
    ended,
  };
}

/**
 * THE ANSWER SETTLES IN PLACE. A streamed answer that lands as its message
 * keeps the live row's key, and every later fold keys that message the same
 * way (`said`): to the list it is the row that was already there, so its
 * component stays and only what changed — the clock, the last words — is
 * drawn. Under its own key it was a new row: the live row went, and the
 * reply's markdown was rendered again from nothing in the frame it ended
 * (2,600 elements for 1,200 words, a 70–93ms frame). `ended.into` names the
 * row it became, which is now the live row's own key.
 */
function keepLive(
  ended: Fold["ended"],
  rows: Row[],
  said: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  if (!(ended?.as === "answer" && ended.into)) {
    return said;
  }
  const at = rows.findIndex((each) => each.key === ended.into);
  const answer = rows[at];
  if (answer?.kind !== "single") {
    return said;
  }
  rows[at] = { ...answer, key: ended.key, streamed: true };
  const kept = new Map(said).set(ended.into, ended.key);
  ended.into = ended.key;
  return kept;
}

interface Settled {
  rows: Row[];
  starts: number[];
  voices: Voices;
}

/** Every message, folded from the start. */
function foldAll(
  messages: Message[],
  subagents: Record<string, SubagentState>,
  said: ReadonlyMap<string, string>
): Settled {
  const voices = { ...NO_VOICE };
  return { ...foldRange(messages, subagents, 0, voices, said), voices };
}

/** The memo's rows, with only the turn at the cut and what follows it folded again. */
function foldOnto(
  messages: Message[],
  subagents: Record<string, SubagentState>,
  memo: FoldMemo,
  cut: number
): Settled {
  // Nothing new: the settled rows are the last fold's, untouched.
  if (messages.length === memo.count) {
    return memo;
  }
  // The first row at or past the cut: an opener always begins a row, so the
  // rows before it cover exactly the messages before it.
  let keep = memo.starts.length;
  for (let r = memo.starts.length - 1; r >= 0; r -= 1) {
    if (memo.starts[r] < cut) {
      break;
    }
    keep = r;
  }
  // The kept rows are the same objects with the same speakers above them, so
  // their grouping stands; the refolded turn picks up where they leave off.
  const kept = memo.rows.slice(0, keep);
  const voices = voicesAfter(kept);
  const tail = foldRange(messages, subagents, cut, voices, memo.said);
  return {
    rows: kept.concat(tail.rows),
    starts: memo.starts.slice(0, keep).concat(tail.starts),
    voices,
  };
}

/** How the last fold's live row ended: which settled row, if any, it became. */
function endOf(
  prior: LiveMemo,
  rows: Row[],
  memo: FoldMemo | null
): NonNullable<Fold["ended"]> {
  const as = prior.answer ? "answer" : "reasoning";
  return {
    key: liveKey(prior.gen),
    as,
    into: prior.answer || prior.reasoning ? settledInto(rows, memo, as) : null,
  };
}

const liveKey = (gen: number): string => `live:${gen}`;

type LiveContent = Omit<
  Extract<Row, { kind: "live" }>,
  "key" | "kind" | "grouped"
>;

/**
 * Whether the live row now is the one the last fold drew, still being
 * written. It only ever moves forward: the indicator becomes whatever comes
 * next, reasoning grows or gives way to an answer, an answer grows. A
 * reasoning block that is gone — settled into its row, or dropped — or an
 * answer that is not the old one grown, is a new row.
 */
function continues(prior: LiveMemo, now: LiveContent): boolean {
  if (prior.answer) {
    return now.text.startsWith(prior.answer);
  }
  if (prior.reasoning) {
    return now.text !== "" || (now.thinking ?? "").startsWith(prior.reasoning);
  }
  return true;
}

/**
 * The settled row a finished live row became: the newest row of its kind
 * with words in it that the last fold did not have. An answer settles into
 * an assistant message, reasoning into a thinking one; both land in the same
 * frame that clears the live buffer. A frame that carried only a call lands
 * as an assistant message with no words, and is never what the live row
 * said.
 */
function settledInto(
  rows: Row[],
  memo: FoldMemo | null,
  as: "answer" | "reasoning"
): string | null {
  const had = new Set(memo?.rows.map((row) => row.key));
  const type = as === "answer" ? "assistant" : "thinking";
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (had.has(row.key)) {
      return null;
    }
    if (
      row.kind === "single" &&
      row.message.type === type &&
      row.message.content.trim() !== ""
    ) {
      return row.key;
    }
  }
  return null;
}

/**
 * The live answer, held as it was last streamed while its message lands.
 * The hub lands a reply's reasoning and its answer as two blocks of one
 * message, and the reasoning can come a fold ahead of the answer: the live
 * row ended there with no answer to settle into, handed its place to the
 * reasoning row, and the answer opened again from nothing under it, the
 * whole reply folding to a line and growing back at the end of every turn.
 * So while the newest settled row is reasoning whose message has no answer
 * yet, the answer stays live, and the fold its answer lands in settles it
 * (`settledInto`). The next row of the conversation ends the wait whatever
 * comes of it.
 */
function answerLanding(prior: LiveMemo, rows: Row[]): LiveContent | null {
  const last = rows.at(-1);
  if (
    !(
      prior.on &&
      prior.answer &&
      last?.kind === "single" &&
      last.message.type === "thinking" &&
      last.message.sdkUuid
    )
  ) {
    return null;
  }
  const message = last.message.sdkUuid;
  // Its answer landed ahead of it: nothing is waiting.
  if (
    rows.some(
      (row) =>
        row.kind === "single" &&
        row.message.type === "assistant" &&
        row.message.sdkUuid === message
    )
  ) {
    return null;
  }
  return {
    thinking: null,
    thinkingLive: false,
    indicating: false,
    text: prior.answer,
  };
}

/**
 * What the live row shows, or null when there is none.
 *
 * A thinking block is shown the moment it opens, even with no delta text yet
 * — Claude's extended thinking is often REDACTED and streams no deltas at all
 * (see `streamPhase`, @cawco/core), so gating on thinkingStream meant "reasoning, silently,
 * with no indicator". The row itself is the indicator; the text fills in if
 * and when it arrives. A block that has CLOSED keeps its place until its
 * message lands: that message is this row, settled, and the gap between the
 * two was the reasoning blinking out of the tail and back in above it.
 */
function liveContent(session: SessionState): LiveContent | null {
  const reasoning =
    (session.openBlock === "thinking" || session.thinkingClosing) &&
    !session.streaming;
  const last = session.messages[queuedFrom(session.messages) - 1];
  // The agent's own words are the latest thing. Whatever it does next opens
  // a block of its own — reasoning, text, a tool — which this row or a tool
  // row shows the moment it starts; a turn it has finished ends a frame
  // later. A "working" row between the two would only flash: arrive, and
  // fold away before it could be read. A frame with no words in it — a
  // redacted reasoning block, the frame that only carried a call — says
  // nothing: the turn goes on after it, and ending the row there left its
  // place empty until the next block opened a new one.
  const spoke =
    (last?.type === "assistant" || last?.type === "thinking") &&
    last.content.trim() !== "";
  const indicating =
    session.busy &&
    !spoke &&
    // A call whose message is in and has no result yet is already on screen
    // as its own pending line. Its message lands a moment before the session
    // names it the current tool, and the indicator drawn in that moment
    // arrived only to fold away again, leaving its place empty until the
    // call came back.
    !(
      last?.type === "tool.use" &&
      (last.metadata?.toolStatus ?? "pending") === "pending"
    ) &&
    session.pending.length === 0 &&
    session.sdkStatus !== "compacting" &&
    !last?.metadata?.sendFailed &&
    !session.streaming &&
    !session.currentTool &&
    session.openBlock !== "tool" &&
    !session.thinkingClosing;
  if (!(reasoning || session.streaming || indicating)) {
    return null;
  }
  return {
    thinking: reasoning ? session.thinkingStream : null,
    thinkingLive: !session.thinkingClosing,
    indicating,
    text: session.streaming,
  };
}

/**
 * Whether the call `toolId` has its message in the conversation yet. A call in
 * flight is always among the last messages: the scan stops at the reader's
 * last turn, before which no call of this turn can be.
 */
export function called(session: SessionState, toolId: string): boolean {
  const { messages } = session;
  for (let i = queuedFrom(messages) - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.type === "user") {
      return false;
    }
    if ((message.metadata?.toolId ?? message.toolCallId) === toolId) {
      return true;
    }
  }
  return false;
}

/**
 * THE TAIL KEEPS THE ORDER IT WAS DRAWN IN. A send waiting on the session
 * that was already on screen when the agent's own tail began — its live row,
 * a call in flight — stays above that tail; one sent while the tail is up
 * comes in after it. A turn that opens while notes wait is the turn that
 * reads them, so the notes are already in the place they are read at: the
 * turn starting under them moves nothing, and neither does their read.
 * Drawn the other way, the live row came in above the notes, pushed them
 * down a row, and the read put them back.
 *
 * The keys drawn ahead are carried while the agent's tail stays up, less the
 * ones that stopped waiting; with no tail, nothing is ahead of it.
 */
function aheadOf(
  memo: FoldMemo | null,
  waited: string[],
  tail: boolean
): string[] | null {
  if (!tail) {
    return null;
  }
  const before = memo?.ahead ?? memo?.waited ?? [];
  return waited.filter((key) => before.includes(key));
}

/**
 * The rows that ride after the settled transcript, re-derived every time:
 * the sends drawn `ahead` of the agent's tail, the tail, the other sends.
 */
function tailRows(
  session: SessionState,
  content: LiveContent | null,
  tool: SessionState["currentTool"],
  gen: number,
  ahead: Set<string>,
  voices: Voices
): Row[] {
  // What the session has been sent and not read yet, after everything that
  // HAS happened. Keyed by the message itself: once read, the same key is its
  // row in the conversation, where it was read.
  const { messages } = session;
  const receiptAt = receiptsOf(messages);
  const waiting: Row[] = [];
  for (let i = queuedFrom(messages); i < messages.length; i += 1) {
    // A run's receipt waiting to be read is already told by its block.
    if (receiptAt(messages[i], i)?.fold) {
      continue;
    }
    waiting.push({
      kind: "queued",
      key: keyOf(messages[i], i),
      message: messages[i],
      grouped: false,
    });
  }
  const rows: Row[] = waiting.filter((row) => ahead.has(row.key));
  if (content) {
    rows.push({
      kind: "live",
      key: liveKey(gen),
      ...content,
      grouped: false,
    });
  }
  // One row per call in flight, keyed by the call: the next tool is a new
  // row arriving, not this one changing its words. It is the call before its
  // message lands; once the message is in, the call's own line in its run is
  // this row, settled, and drawing both showed the same call twice.
  if (tool) {
    rows.push({
      kind: "livetool",
      key: `tool:${tool.toolId}`,
      glance: tool,
    });
  }
  rows.push(...waiting.filter((row) => !ahead.has(row.key)));
  for (const row of rows) {
    const grouped = voice(voices, row);
    if (row.kind === "live" || row.kind === "queued") {
      row.grouped = grouped;
    }
  }
  return rows;
}
