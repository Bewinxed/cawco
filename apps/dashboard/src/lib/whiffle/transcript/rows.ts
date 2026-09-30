/**
 * The transcript folded into render rows. Consecutive tool calls collapse onto
 * one rail, a Task call becomes the branch it spawned, and the live tail —
 * streaming text, an open thinking block, the tool in flight — rides at the end
 * as rows of its own so it scrolls with the conversation rather than sitting in
 * fixed chrome.
 */

import { ASK_USER_QUESTION } from "@whiffle/core";
import type { SubagentState } from "$lib/utils/flow-types";
import type { SessionState } from "../client.svelte";
import { parkedAsks, type ToolGlance } from "../frames";
import type { Message } from "../types";

/**
 * `grouped`, on the rows that can carry a speaker line: the speaker's previous
 * turn is the last voice above it, so this one draws no header of its own.
 * Decided once, as the rows are folded (see {@link Voices}).
 */
export type Row =
  | { kind: "single"; key: string; message: Message; grouped: boolean }
  | { kind: "tools"; key: string; messages: Message[] }
  | { kind: "question"; key: string; message: Message }
  | { kind: "subagent"; key: string; branch: SubagentState; spawn: Message }
  /** A `delegate` / `start_session` call: the fleet session it spawned, as a fold. */
  | { kind: "delegate"; key: string; message: Message }
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
  | { kind: "harness"; key: string; note: HarnessNote };

/**
 * Who has the floor, row by row: a speaker line appears only when the speaker
 * changes. The reader's turns ("You") group with the reader's turns before
 * them, the agent's with the agent's. The agent's run — its tool calls,
 * reasoning, task lines, the cards its calls open — is the agent's and does
 * not end its group, but carries no header either, so the first words the
 * agent says after the reader still get one. A note whiffle or the harness put
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
  /** The `<task-id>` this notification echoes, when it named one. */
  taskId?: string;
  /** The `<summary>` line — what the fold says while it is closed. */
  title: string;
}

/** The inner text of the first `<tag>…</tag>`, or undefined. */
const inner = (tag: string, text: string): string | undefined =>
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp#exec returns RegExpExecArray | null — a tag absent from text hits the null case, which the optional chain is here for.
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
  // TOP-LEVEL only. `frames.ts` tests `includes` over the first 200 characters,
  // which also swallows an operator who merely WRITES the tag ("fix the
  // <task-notification> renderer") and buries their message in a fold. The
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
  const taskId = inner("task-id", text)?.trim();
  return {
    title: title || "Harness notification",
    status: inner("status", text)?.trim() ?? "",
    body,
    ...(taskId ? { taskId } : {}),
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

/** The branch a tool.use spawned, when it opened one — a real subagent fold. */
const branchOf = (
  m: Message,
  subagents: Record<string, SubagentState>
): SubagentState | null => {
  const id = m.metadata?.toolId;
  return id ? (subagents[id] ?? null) : null;
};

const keyOf = (m: Message, index: number): string =>
  m.id ?? m.sdkUuid ?? `${m.type}:${index}`;

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
 * ask is parked on the composer. The card is that call until it is answered,
 * so the call takes no room here while it waits, and its row arrives as the
 * card settles into it.
 */
const drawnOf = (session: SessionState): Message[] => {
  const settled = settledOf(session.messages);
  const gated = new Set(
    parkedAsks(session.pending).flatMap((ask) =>
      ask.toolUseId ? [ask.toolUseId] : []
    )
  );
  return gated.size === 0
    ? settled
    : settled.filter((m) => !(m.toolCallId && gated.has(m.toolCallId)));
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
  return foldRange(messages, subagents, 0, notedTasks(messages), {
    ...NO_VOICE,
  }).rows;
}

/**
 * The task ids the harness has posted a full note about.
 *
 * One completion, one row. The SDK's `task_notification` frame (the "task
 * done" line) and the harness's XML note are two wire forms of the SAME
 * event; when the richer note is present its bare line yields to it, keyed by
 * the task id both sides carry. A plain task with no note — a background
 * Bash — keeps its line, which is the only place it reports.
 */
function notedTasks(messages: Message[]): Set<string> {
  const noted = new Set<string>();
  for (const m of messages) {
    const tid = notedTask(m);
    if (tid) {
      noted.add(tid);
    }
  }
  return noted;
}

/**
 * Whether `messages[index]` is a "task done" line another row already tells:
 * a harness note about the same task, or an earlier line for it. A reload's
 * history carries the stored notification as that line, and the live stream
 * can replay the frame it came from on top: one completion, one row. Read
 * over the whole array, so a fold that restarts at a cut still sees it.
 */
function repeatsTask(
  messages: Message[],
  index: number,
  noted: Set<string>
): boolean {
  const m = messages[index];
  const taskId = m.type === "system.task" ? m.metadata?.taskId : undefined;
  if (!taskId) {
    return false;
  }
  return (
    noted.has(taskId) ||
    messages
      .slice(0, index)
      .some((e) => e.type === "system.task" && e.metadata?.taskId === taskId)
  );
}

/** The task id a harness note reports on, when the message is one and names one. */
const notedTask = (m: Message): string | undefined =>
  isHarnessNote(m) ? parseHarnessNote(m.content).taskId : undefined;

/**
 * The grammar over `messages[from..]`. `starts` is the message index each row
 * begins at, kept beside the rows rather than on them: it is what lets a
 * later fold splice on at a row boundary, and no renderer needs it. `voices`
 * is where the speakers stood before `from`, and is advanced past these rows.
 */
function foldRange(
  messages: Message[],
  subagents: Record<string, SubagentState>,
  from: number,
  noted: Set<string>,
  voices: Voices
): { rows: Row[]; starts: number[] } {
  const rows: Row[] = [];
  const starts: number[] = [];

  let i = from;
  while (i < messages.length) {
    const m = messages[i];

    if (repeatsTask(messages, i, noted)) {
      i += 1;
      continue;
    }
    starts.push(i);

    // Before anything else: harness plumbing is never a turn, so it never
    // reaches the `single` row that would give it a Who header and user styling.
    if (isHarnessNote(m)) {
      rows.push({
        kind: "harness",
        key: `hn:${keyOf(m, i)}`,
        note: parseHarnessNote(m.content),
      });
      i += 1;
      continue;
    }

    const branch = isToolMsg(m) ? branchOf(m, subagents) : null;
    if (branch) {
      rows.push({ kind: "subagent", key: keyOf(m, i), branch, spawn: m });
      i += 1;
      continue;
    }

    if (isQuestionMsg(m)) {
      rows.push({ kind: "question", key: `q:${keyOf(m, i)}`, message: m });
      i += 1;
      continue;
    }

    if (isDelegateMsg(m)) {
      rows.push({ kind: "delegate", key: `d:${keyOf(m, i)}`, message: m });
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

    rows.push({ kind: "single", key: keyOf(m, i), message: m, grouped: false });
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
  noted: Set<string>;
  /** The settled rows — everything before the live tail — and where each begins. */
  rows: Row[];
  starts: number[];
  /** Where the speakers stand after the settled rows. */
  voices: Voices;
  /** The waiting sends this fold drew, by key. */
  waited: string[];
}

/**
 * A fold, and what happened to the live row since the last one.
 *
 * `settled` is the one fact the transcript cannot read off the rows: a live
 * row that has just become a settled one. The streamed answer ends as an
 * assistant message and the streamed reasoning as a thinking message, each
 * under a key of its own — but on screen it is the same object, and the
 * transcript must treat it as one: no arrival, no replay, not a pixel moved.
 */
export interface Fold {
  appended: boolean;
  /**
   * The last fold's live row, when this fold ended it: its key, and the
   * settled row that continues it — or null when nothing does, and it leaves.
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
 * The message-side reading of the chunker's cut rule (`streamHistory`,
 * client.svelte.ts): a turn opens on the reader's own message, not a
 * delegate's, and a fold may begin there. Tool results never make it here as
 * messages of their own — `mapTranscript` attaches them to the call — so
 * there is no dangling pair for a cut to split.
 */
const opensTurn = (m: Message): boolean =>
  m.type === "user" && !m.parentToolUseId && !isHarnessNote(m);

/**
 * Where a fold of `messages` may restart given what `memo` was folded from,
 * or -1 where it has to start over. The transcript must still be the memo's
 * — same first message, same message at the old end, no new branch — with
 * nothing new that reaches back: a note about a task whose bare line is
 * already folded would have to unfold it. The cut is then the last turn
 * opener at or before the old end.
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
  for (let i = memo.count; i < messages.length; i += 1) {
    if (notedTask(messages[i])) {
      return -1;
    }
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
 * that cut it, an older chunk prepended in front, a subagent branch that
 * has since opened (which turns a call row into a fold), or a harness note
 * about a task whose line is already on the rail. All of those change rows
 * BEFORE the old end, which an append cannot express.
 */
export function buildRowsFrom(
  session: SessionState,
  memo: FoldMemo | null
): Fold {
  const messages = drawnOf(session);
  const branches = Object.keys(session.subagents).length;
  const cut = memo ? cutFor(messages, memo, branches) : -1;
  const appended = memo !== null && cut >= 0;
  const { rows, starts, noted, voices } =
    memo && appended
      ? foldOnto(messages, session.subagents, memo, cut)
      : foldAll(messages, session.subagents);

  const prior = memo?.live ?? NO_LIVE;
  const content = liveContent(session);
  const same = prior.on && content !== null && continues(prior, content);
  const gen = same ? prior.gen : prior.gen + 1;
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
      ...rows,
      ...tailRows(session, content, tool, gen, new Set(ahead), {
        ...voices,
      }),
    ],
    memo: {
      rows,
      starts,
      count: messages.length,
      first: messages[0],
      last: messages.at(-1),
      branches,
      noted,
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
    ended: prior.on && !same ? endOf(prior, rows, memo) : null,
  };
}

interface Settled {
  noted: Set<string>;
  rows: Row[];
  starts: number[];
  voices: Voices;
}

/** Every message, folded from the start. */
function foldAll(
  messages: Message[],
  subagents: Record<string, SubagentState>
): Settled {
  const noted = notedTasks(messages);
  const voices = { ...NO_VOICE };
  return {
    ...foldRange(messages, subagents, 0, noted, voices),
    noted,
    voices,
  };
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
  const tail = foldRange(messages, subagents, cut, memo.noted, voices);
  return {
    rows: kept.concat(tail.rows),
    starts: memo.starts.slice(0, keep).concat(tail.starts),
    noted: memo.noted,
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
 * that the last fold did not have. An answer settles into an assistant
 * message, reasoning into a thinking one; both land in the same frame that
 * clears the live buffer.
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
    if (row.kind === "single" && row.message.type === type) {
      return row.key;
    }
  }
  return null;
}

/**
 * What the live row shows, or null when there is none.
 *
 * A thinking block is shown the moment it opens, even with no delta text yet
 * — Claude's extended thinking is often REDACTED and streams no deltas at all
 * (see frames.ts), so gating on thinkingStream meant "reasoning, silently,
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
  const waiting: Row[] = [];
  for (let i = queuedFrom(messages); i < messages.length; i += 1) {
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
