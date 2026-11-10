/**
 * THE ONE WRITER of what a session's transcript shows: the hub's blocks as
 * its stream and its pages move them, merged into the rows held by id so a
 * row once shown stays where it is, with this tab's own sends and the
 * failure lines it saw placed among them.
 */

import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { SendRecord } from "@cawco/core/session-messages";
import type {
  TranscriptBlock,
  TranscriptBranch,
  TranscriptEvent,
  TranscriptFacts,
  TranscriptPage,
  TranscriptPageBranch,
  TranscriptTail,
} from "@cawco/core/transcript-types";
import type { SubagentState } from "#lib/utils/flow-types.js";
import { browser } from "$app/env";
import { noteChange } from "../repeated-keys";
import { detailsOf } from "../slash-commands";
import { warmCompactionMark } from "../transcript/compaction-mark";
import { holdsCompaction } from "../transcript/rows";
import type { Message } from "../types";
import { pulseOf } from "./board.svelte";
import { commandRecord, sendFailureNotices } from "./ledger.svelte";
import { equal } from "./same";
import { contextShown, refreshContext } from "./session-detail.svelte";
import { applyPulse, blankSession, type SessionState } from "./sessions.svelte";

/**
 * THE ONE WRITER of what a session shows: the hub's blocks with this tab's
 * failure lines among them, then the sends waiting, then this tab's own sends
 * the hub has not taken.
 *
 * The list itself is kept wherever it changed only past its first row: the
 * transcript reads a kept list that changed as the conversation arriving, and
 * a new one as history.
 *
 * `kept`: how many blocks at the front the caller left as they were last
 * placed, so the list is compared and written from there on. A batch of live
 * changes moves rows at the end, and comparing every row of a long
 * transcript on each one read the whole list through the store, row by row,
 * on every batch a session streamed. With failure lines among the blocks, a
 * block's index is not its place in the list, and every row is compared.
 */
export function place(target: SessionState, kept = 0): void {
  const current = target.messages;
  const from =
    target.notes.length === 0
      ? Math.min(kept, target.blocks.length, current.length)
      : 0;
  const next =
    from === 0
      ? [
          ...withNotes(target.blocks, target.notes),
          ...target.queued,
          ...target.local,
        ]
      : [...target.blocks.slice(from), ...target.queued, ...target.local];
  let same = 0;
  while (
    from + same < current.length &&
    same < next.length &&
    current[from + same] === next[same]
  ) {
    same += 1;
  }
  if (from + same === current.length && same === next.length) {
    return;
  }
  target.rev += 1;
  // A change at the very first row is a different transcript — a read, a
  // page in front, a rewind to nothing — and takes a list of its own.
  if (from + same === 0 && current.length > 0) {
    target.messages = next;
    return;
  }
  current.splice(
    from + same,
    current.length - from - same,
    ...next.slice(same)
  );
}

/**
 * A row on screen, moved to what the hub says it is now: the same object, so
 * the rows built on it stay put and only what changed is written — a tool
 * call taking its result, a send moving from waiting to read. A row this tab
 * drew from its own send keeps the pictures it sent: the hub names the same
 * ones by its media references, and trading one for the other would load
 * them all again. Says whether anything on the row moved.
 */
function adopt(held: Message, fresh: Message): boolean {
  let moved = false;
  if (held.type !== fresh.type) {
    held.type = fresh.type;
    moved = true;
  }
  if (held.content !== fresh.content) {
    held.content = fresh.content;
    moved = true;
  }
  if (held.state !== fresh.state) {
    held.state = fresh.state;
    moved = true;
  }
  if (held.queued !== fresh.queued) {
    held.queued = fresh.queued;
    moved = true;
  }
  if (held.sdkUuid !== fresh.sdkUuid) {
    held.sdkUuid = fresh.sdkUuid;
    moved = true;
  }
  if (held.timestamp !== fresh.timestamp) {
    held.timestamp = fresh.timestamp;
    moved = true;
  }
  if (held.toolCallId !== fresh.toolCallId) {
    held.toolCallId = fresh.toolCallId;
    moved = true;
  }
  const drawn = held.metadata?.images;
  const pictures =
    drawn?.length === fresh.metadata?.images?.length &&
    drawn?.every((image) => image.src?.startsWith("data:"))
      ? { images: drawn }
      : {};
  const metadata = fresh.metadata && { ...fresh.metadata, ...pictures };
  if (!equal(held.metadata, metadata)) {
    held.metadata = metadata;
    moved = true;
  }
  return moved;
}

/** The blocks with this tab's failure lines after the block each followed. */
function withNotes(blocks: Message[], notes: SessionState["notes"]): Message[] {
  if (notes.length === 0) {
    return blocks;
  }
  const after = new Map<string | null, Message[]>();
  for (const { after: anchor, message } of notes) {
    after.set(anchor, [...(after.get(anchor) ?? []), message]);
  }
  const placed = [...(after.get(null) ?? [])];
  for (const block of blocks) {
    placed.push(block, ...(after.get(block.id) ?? []));
  }
  return placed;
}

/** A failure this tab saw, said after whatever is last on screen now. */
export function addNote(target: SessionState, message: Message): void {
  target.notes.push({ after: target.blocks.at(-1)?.id ?? null, message });
  place(target);
}

/** Takes the row `id` names out of `list`, and hands it over. */
function pull(list: Message[], id: string): Message | undefined {
  const at = list.findIndex((message) => message.id === id);
  return at < 0 ? undefined : list.splice(at, 1)[0];
}

/**
 * A block the hub sent, entering `into` as the object this view holds it
 * under. An id names one row, held by one list: a send goes from this tab's
 * own (`local`) to waiting (`queued`) to placed (`blocks`), and the list it
 * was in gives it up in the same step it enters the next, a placed row the
 * hub lists waiting again included. The object on screen takes the hub's
 * word in place, so the row stays where it is drawn.
 * This holds whatever the block is — the hub's row for the send, or the row
 * the harness stored under the send's own id.
 */
export function take(
  target: SessionState,
  block: Message,
  into: "blocks" | "queued" | "removed"
): Message {
  const fresh: Message = block;
  const mine = pull(target.local, block.id);
  if (into === "removed") {
    return (
      pull(target.queued, block.id) ??
      pull(target.blocks, block.id) ??
      mine ??
      fresh
    );
  }
  // Placed, it leaves the sends waiting; waiting again, it leaves the rows
  // placed (the caller puts the whole queue in at once).
  const waiting =
    into === "blocks"
      ? pull(target.queued, block.id)
      : (target.queued.find((message) => message.id === block.id) ??
        pull(target.blocks, block.id));
  // A placed send the hub moves leaves `blocks` and comes back in one batch:
  // the row still on screen is the one it comes back as.
  const held =
    waiting ??
    mine ??
    (block.state
      ? target.messages.find(
          (message) => message.id === block.id && message.state
        )
      : undefined);
  if (!held) {
    return fresh;
  }
  if (adopt(held, fresh)) {
    target.rev += 1;
  }
  return held;
}

/** A hub branch as this view holds it: its blocks, and the text it streams. */
function branchState(
  branch: TranscriptBranch,
  blocks: Message[],
  streaming: string
): SubagentState {
  return { ...branch, messages: blocks, streaming };
}

/** The branch a block names, created on first sight as the hub created it. */
function branchOf(target: SessionState, toolUseId: string): SubagentState {
  if (!target.subagents[toolUseId]) {
    target.rev += 1;
  }
  target.subagents[toolUseId] ??= branchState(
    {
      toolUseId,
      instanceId: target.instanceId,
      subagentType: "subagent",
      status: "starting",
      startedAt: new Date().toISOString(),
    },
    [],
    ""
  );
  return target.subagents[toolUseId];
}

/**
 * The tail's fields the hub moved. Whether a turn is under way is the
 * daemon's now-state (`applyPulse`) once a pulse has come, the socket's or
 * the server load's: the tail's `busy` stands only where none has. The tail
 * and the pulse reach this tab by two roads, the session's stream and the
 * broadcast, and either can be first: a tail saying busy that landed after
 * the turn's end pulse held Stop up over a session at rest, with no pulse
 * left to come and put it down.
 */
function applyTail(target: SessionState, tail: Partial<TranscriptTail>): void {
  if (tail.busy !== undefined && !pulseOf(target.instanceId)) {
    target.busy = tail.busy;
  }
  if (tail.currentTool !== undefined) {
    target.currentTool = tail.currentTool;
  }
  if (tail.openBlock !== undefined) {
    target.openBlock = tail.openBlock;
  }
  if (tail.streaming !== undefined) {
    target.streaming = tail.streaming;
  }
  if (tail.thinkingClosing !== undefined) {
    target.thinkingClosing = tail.thinkingClosing;
  }
  if (tail.thinkingSince !== undefined) {
    target.thinkingSince = tail.thinkingSince;
  }
  if (tail.thinkingStream !== undefined) {
    target.thinkingStream = tail.thinkingStream;
  }
  if (tail.streams) {
    for (const branch of Object.values(target.subagents)) {
      branch.streaming = tail.streams[branch.toolUseId] ?? "";
    }
  }
}

/**
 * What the session has said about itself. `live` is a change as it happened:
 * an `init` then also clears what belonged to the process before it, and a
 * turn ending or a compaction landing asks for a fresh context reading. A
 * page's facts state where things stand and set only what they name.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one assignment per fact the hub can move, each guarded by whether this change named it
function applyFacts(
  target: SessionState,
  facts: Partial<TranscriptFacts>,
  live: boolean
): void {
  if (facts.harness) {
    target.harness = facts.harness as HarnessKind;
  }
  if (facts.sessionId) {
    target.sessionId = facts.sessionId;
  }
  if (facts.model) {
    target.model = facts.model;
  }
  if (facts.permissionMode) {
    target.permissionMode = facts.permissionMode;
  }
  if (facts.commands) {
    const { names, skills, detailed } = facts.commands;
    target.commands = {
      ...target.commands,
      ...(names.length > 0 ? { names } : {}),
      ...(skills.length > 0 ? { skills } : {}),
      ...(detailed ? { detailed: detailsOf(detailed) } : {}),
    };
  }
  if (facts.tooling) {
    target.tooling = facts.tooling;
  }
  if (facts.initialized) {
    target.initialized = true;
  }
  if (facts.lastTurnFailed !== undefined) {
    target.lastTurnFailed = facts.lastTurnFailed;
  }
  if (facts.sdkStatus !== undefined) {
    target.sdkStatus = facts.sdkStatus;
  }
  if (facts.lastCompaction !== undefined) {
    target.lastCompaction = facts.lastCompaction;
  }
  if (!live) {
    return;
  }
  if (facts.inits !== undefined) {
    // A relaunch can change the MCP set; null makes the header ask again.
    target.mcp = null;
    // The process behind a relaunch is up: this is the frame it opens with.
    target.relaunching = false;
    // What is parked stays: an `init` opens every turn, and an ask the hub
    // owns (a question `ask` put) outlives the turn and the process. An ask
    // leaves on the hub's word alone (`permission_settled`, `/api/pending`):
    // the hub settles a dead process's asks itself (hub pending.ts `forget`).
  }
  // The turn or the compaction just changed how full the window is; ask
  // rather than guess, when something in this tab draws it
  // ({@link showContext}). A tab streams every open tab, the peek and every
  // delegate card, and a read for each of their turns' ends was a read
  // nobody saw.
  if (
    (facts.turnsEnded !== undefined || facts.lastCompaction) &&
    target.machineId &&
    contextShown.has(target.instanceId)
  ) {
    detach(
      refreshContext(target.instanceId, target.machineId),
      "refreshContext"
    );
  }
}

/**
 * The hub's record of one send, as it moved. Its row is the hub's to place;
 * this is what the tab's own bookkeeping reads: a send this tab made that
 * failed before the session read it is said where every failure of a send
 * this tab made is said, and the turn it took that send to start never
 * started.
 */
function noteRecord(target: SessionState, record: SendRecord): void {
  const held = target.records[record.uuid];
  target.records[record.uuid] = record;
  if (
    record.state === "failed" &&
    held?.state !== "read" &&
    commandRecord(record.uuid)
  ) {
    // A refusal the hub made is said once, on the send's row, with its way
    // back (transcript/send-recovery.svelte.ts): not over the composer too.
    // A mode ask is one (`modeAsk`, which carries no `refusal`): its row asks
    // for the mode in the dashboard's words, never the hub's.
    if (!(record.refusal || record.modeAsk)) {
      sendFailureNotices[target.instanceId] = record.reason
        ? `Message not sent: ${record.reason}`
        : "Message not sent.";
    }
    target.busy = pulseOf(target.instanceId)?.busy ?? false;
  }
}

/** Whether the main transcript this view holds has a row under `id`. */
function holdsBlock(target: SessionState, id: string): boolean {
  return target.blocks.some((message) => message.id === id);
}

/** A block the hub moved, into the object this view holds it under. */
function updateBlock(target: SessionState, block: TranscriptBlock): void {
  const list = block.parentToolUseId
    ? target.subagents[block.parentToolUseId]?.messages
    : target.blocks;
  const held = list?.findLast((message) => message.id === block.id);
  if (!held) {
    return;
  }
  if (adopt(held, block) && !block.parentToolUseId) {
    target.rev += 1;
  }
}

/**
 * Where a block the hub put in after `after` goes among the rows held: right
 * after that row; at the front when it is the conversation's first row and
 * the view holds the conversation's start. -1: the row before it is one this
 * view has not read yet (older than its first row), and the block comes with
 * that page.
 */
function insertAt(target: SessionState, after: string | null): number {
  if (after === null) {
    return target.cursor === null ? 0 : -1;
  }
  const at = target.blocks.findLastIndex((message) => message.id === after);
  return at < 0 ? -1 : at + 1;
}

/**
 * A block the hub put in, at the end (`block.append`) or after the row it
 * names (`block.insert`), unless this view holds it already: then it takes
 * the hub's word where it stands. Where the main transcript changed from,
 * or Infinity when it did not.
 */
function putBlock(
  target: SessionState,
  event: Extract<TranscriptEvent, { type: "block.append" | "block.insert" }>
): number {
  const { block } = event;
  if (block.parentToolUseId) {
    const branch = branchOf(target, block.parentToolUseId);
    if (!branch.messages.some((one) => one.id === block.id)) {
      branch.messages.push(block);
    }
    return Number.POSITIVE_INFINITY;
  }
  if (holdsBlock(target, block.id)) {
    updateBlock(target, block);
    return Number.POSITIVE_INFINITY;
  }
  const at =
    event.type === "block.append"
      ? target.blocks.length
      : insertAt(target, event.after);
  if (at < 0) {
    return Number.POSITIVE_INFINITY;
  }
  target.blocks.splice(at, 0, take(target, block, "blocks"));
  return at;
}

/**
 * The sends waiting, as the hub lists them now, each taken into `queued`
 * ({@link take}). Where the main transcript changed from: its end, or the
 * first placed row that waits again, which leaves `blocks`.
 */
function putQueue(target: SessionState, blocks: TranscriptBlock[]): number {
  const waiting = new Set(blocks.map((block) => block.id));
  const placed = target.blocks.findIndex((message) => waiting.has(message.id));
  target.queued = blocks.map((block) => take(target, block, "queued"));
  return placed < 0 ? target.blocks.length : placed;
}

/**
 * One batch of the hub's changes to a session's transcript, applied in the
 * order it made them. Each is idempotent by id: a block this view already
 * holds takes the hub's word in place, wherever it stands, and is never held
 * twice. A row moves or goes only by its own `block.remove`.
 *
 * Most batches are the live tail alone (a few words streamed, the tool in
 * flight): those leave the list as it is, and nothing is placed. One that
 * moves rows places the list from the first block it touched (`kept`).
 */
export function applyTranscript(
  target: SessionState,
  events: TranscriptEvent[]
): void {
  noteChange("transcript stream");
  /** The blocks at the front this batch has left as they were placed; none moved yet. */
  let kept = Number.POSITIVE_INFINITY;
  for (const event of events) {
    switch (event.type) {
      case "block.append":
      case "block.insert":
        kept = Math.min(kept, putBlock(target, event));
        break;
      case "block.update":
        updateBlock(target, event.block);
        break;
      case "block.remove": {
        const at = target.blocks.findLastIndex(
          (message) => message.id === event.id
        );
        if (at >= 0) {
          kept = Math.min(kept, at);
          target.blocks.splice(at, 1);
        }
        break;
      }
      case "queue":
        kept = Math.min(kept, putQueue(target, event.blocks));
        break;
      case "branch": {
        const known = target.subagents[event.branch.toolUseId];
        target.subagents[event.branch.toolUseId] = branchState(
          event.branch,
          known?.messages ?? [],
          known?.streaming ?? ""
        );
        target.rev += 1;
        break;
      }
      case "tail":
        applyTail(target, event.tail);
        break;
      case "tail.append":
        if (event.streaming) {
          target.streaming += event.streaming;
        }
        if (event.thinking) {
          target.thinkingStream += event.thinking;
        }
        if (event.branch) {
          branchOf(target, event.branch.toolUseId).streaming +=
            event.branch.text;
        }
        break;
      case "facts":
        applyFacts(target, event.facts, true);
        break;
      case "send":
        noteRecord(target, event.record);
        break;
      default:
        break;
    }
  }
  if (kept !== Number.POSITIVE_INFINITY) {
    place(target, kept);
  }
}

/**
 * A page of a transcript has been read, the first or an older one. One that
 * holds a compaction will draw Caw beside its divider, and his picture takes
 * longer to load than the rows take to be folded and revealed: it starts
 * here, with the data, so it is ready in the frame the list appears. A page
 * with none asks for nothing. The server builds sessions from pages too
 * (`seededSession`) and draws no pictures.
 */
function seesCompaction(page: TranscriptPage): void {
  if (browser && holdsCompaction(page.blocks)) {
    warmCompactionMark();
  }
}

/**
 * A read's rows (`read`, oldest first: the newest page and any pages read
 * before it) MERGED into the rows this view holds, by id. A ROW ONCE SHOWN
 * STAYS WHERE IT IS: a held row the read names takes the hub's word in
 * place, as the same object; a held row the read lacks stays, unless the hub
 * lists it as taken out (`removed`, the newest page's); a row the read holds
 * that is not held goes after the row before it in the read, and a run of
 * them before any held row goes before the first held row the read names
 * (none named: after every held row). The cursor is the read's when the
 * read now opens the list, the held one otherwise.
 */
function mergeRows(
  target: SessionState,
  read: TranscriptBlock[],
  readCursor: string | null,
  removed: readonly string[]
): void {
  const gone = new Set(removed);
  const heldRows = target.blocks.filter((message) => !gone.has(message.id));
  if (heldRows.length === 0) {
    target.blocks = read.map((block) => take(target, block, "blocks"));
    target.cursor = readCursor;
    return;
  }
  const heldIds = new Set(heldRows.map((message) => message.id));
  const readIds = new Set(read.map((block) => block.id));
  const firstMet = heldRows.find((message) => readIds.has(message.id))?.id;
  /** The read's rows not held, by the held row they go after (null: before `firstMet`). */
  const runs = new Map<string | null, TranscriptBlock[]>();
  let anchor: string | null = null;
  for (const block of read) {
    if (heldIds.has(block.id)) {
      anchor = block.id;
      continue;
    }
    const run = runs.get(anchor) ?? [];
    run.push(block);
    runs.set(anchor, run);
  }
  const fresh = new Map(read.map((block) => [block.id, block]));
  const next: Message[] = [];
  const front = (runs.get(null) ?? []).map((block) =>
    take(target, block, "blocks")
  );
  if (firstMet === undefined) {
    next.push(...heldRows, ...front);
  }
  for (const message of firstMet === undefined ? [] : heldRows) {
    if (message.id === firstMet) {
      next.push(...front);
    }
    const word = fresh.get(message.id);
    if (word && adopt(message, word)) {
      target.rev += 1;
    }
    next.push(
      message,
      ...(runs.get(message.id) ?? []).map((block) =>
        take(target, block, "blocks")
      )
    );
  }
  if (next[0] && readIds.has(next[0].id) && next[0].id !== heldRows[0]?.id) {
    target.cursor = readCursor;
  }
  target.blocks = next;
}

/**
 * The newest page of a session's transcript, as what this view shows: the
 * hub's blocks merged into the rows held ({@link mergeRows}), its branches
 * beside those held, and its waiting sends, live tail and facts. What only
 * this tab holds survives it: its own sends the hub has not taken, and the
 * failure lines it saw, each after the row it followed.
 */
export function adoptTranscriptPage(
  target: SessionState,
  page: TranscriptPage
): void {
  const { where } = page;
  // The hub's word on machine and folder fills blanks only: a live row's own
  // values are already in place and are not walked back. The key is the one
  // thing a later resume is sent under, and the hub resolved it.
  target.machineId ||= where.machineId;
  target.cwd ||= where.cwd;
  target.harness = where.harness;
  if (where.sessionKey) {
    target.sessionId = where.sessionKey;
  }
  noteChange("transcript read");
  seesCompaction(page);
  target.continuedTo = page.continuedTo ?? null;
  mergeRows(target, page.blocks, page.cursor, page.removed ?? []);
  target.queued = (page.queued ?? []).map((block) =>
    take(target, block, "queued")
  );
  // A new newest page is a new read: an older page still on its way was
  // asked for under the one before, and so was what was said of one.
  target.reads += 1;
  target.olderFault = null;
  const { tail } = page;
  target.subagents = {
    ...target.subagents,
    ...Object.fromEntries(
      page.branches.map((branch) => [
        branch.toolUseId,
        pageBranch(branch, tail?.streams[branch.toolUseId] ?? ""),
      ])
    ),
  };
  if (tail) {
    applyTail(target, { ...tail, streams: undefined });
  }
  // Whether a turn is under way, and its tool, are the daemon's now-state
  // (`applyPulse`), once the hub has sent one. The page is a read made out
  // of band, and its tail says `busy` and the tool as the frames show them,
  // which trail the pulse at a turn's start: written over it, a working
  // session read quiet until its next pulse (`wqw` on a reload). The tail
  // stands only where no pulse has come, neither the socket's nor the server
  // load's (`applyTail` keeps its `busy` off already; the tool is put back
  // here, and a session built from this page alone takes the pulse's `busy`).
  const pulse = pulseOf(target.instanceId);
  if (pulse) {
    applyPulse(target, pulse);
  }
  if (page.facts) {
    applyFacts(target, page.facts, false);
  }
  place(target);
}

/**
 * A session built from a transcript page alone, outside the store: what the
 * server renders for the pane its navigation loaded, and what that pane shows
 * until the store holds the conversation.
 */
export function seededSession(
  viewId: string,
  page: TranscriptPage
): SessionState {
  const seeded = blankSession(viewId);
  adoptTranscriptPage(seeded, page);
  return seeded;
}

/** A page's branch as this view holds it. */
function pageBranch(
  { blocks, ...branch }: TranscriptPageBranch,
  streaming: string
): SubagentState {
  return branchState(branch, blocks, streaming);
}

/** An older page, in front of what is on screen, with its branches. */
export function prependTranscriptPage(
  target: SessionState,
  page: TranscriptPage
): void {
  noteChange("older page read");
  seesCompaction(page);
  const known = new Set(target.blocks.map((block) => block.id));
  target.blocks = [
    ...page.blocks
      .filter((block) => !known.has(block.id))
      .map((block) => take(target, block, "blocks")),
    ...target.blocks,
  ];
  target.cursor = page.cursor;
  for (const branch of page.branches) {
    target.subagents[branch.toolUseId] ??= pageBranch(branch, "");
  }
  place(target);
}
