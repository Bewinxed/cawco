/**
 * Direct transcript reader for Claude Code sessions.
 *
 * Reads a transcript without holding it. Each line is kept as a
 * {@link ChainNode} in a per-file line index ({@link LineIndexes}): what the
 * chain walk reads, and where the record lies in the file. The walk runs
 * over the nodes; only the records a read returns are read back, by their
 * byte ranges. The newest window, the hot path, reads backward from the end
 * ({@link ReverseReader}) and never builds the index.
 *
 * Output shape mirrors the SDK's `SessionMessage` exactly: the six fields the
 * `toEntry` mapper reads (`type`, `uuid`, `session_id`, `message`,
 * `parent_tool_use_id`, `parent_agent_id`) plus `timestamp` (which the SDK
 * passes through but does not declare). Subagent records are never returned
 * (the SDK reads only the main transcript file).
 *
 * Unlike the SDK, this reader preserves `toolUseResult` sidecars on each
 * record — the SDK drops them, forcing `readQuestionSidecars` to re-read the
 * raw file. Here we surface them via `toolUseResult` so the caller can fold
 * `AskUserQuestion` answers without a second pass.
 */

import {
  type HarnessNote,
  interruptLine,
  type NeutralSystemMessage,
  transcriptUserText,
  type WindowAsk,
} from "@cawco/core";
import type { LocatedRecord } from "@cawco/jsonl-parser";
import { ReverseReader, readSpans, typeFilter } from "@cawco/jsonl-parser";
import {
  type LineIndex,
  LineIndexes,
  unlessGone,
  windowCuts,
  windowRange,
} from "./transcript-index.ts";

/** The shape the SDK's `getSessionMessages` returns — kept structurally identical. */
export interface SDKSessionMessage {
  /** The summary a `/compact` wrote (`isCompactSummary` on the record). */
  compactSummary?: true;
  /**
   * An assistant record the CLI wrote in place of the model's answer: its
   * `error` (`authentication_failed`, …), as the live frame carries it.
   */
  error?: string;
  /**
   * How many queued prompts the CLI joined into this user record
   * ({@link joinedCounts}); absent for a record that is one.
   */
  joined?: number;
  message: unknown;
  parent_agent_id: string | null;
  parent_tool_use_id: string | null;
  session_id: string;
  /**
   * The CLI's command id for a message the reader sent mid-turn — present only
   * on the user record read off its `queued_command` attachment
   * ({@link absorbedMessage}).
   */
  sourceUuid?: string;
  timestamp: string;
  /**
   * Raw structured output sidecar — present on `user` records that carry a
   * `tool_result`. The SDK drops this; we preserve it so `AskUserQuestion`
   * answers survive a transcript reload without re-reading the file.
   */
  toolUseResult?: unknown;
  type: "user" | "assistant" | "system";
  uuid: string;
}

// ---------------------------------------------------------------------------
// Record types for chain walking
// ---------------------------------------------------------------------------

interface CompactMetadata {
  preservedMessages?: {
    anchorUuid: string;
    uuids: string[];
  };
  preservedSegment?: {
    anchorUuid: string;
    headUuid: string;
    tailUuid: string;
  };
  /** How full the context was when the compaction ran, in tokens. */
  preTokens?: number;
  trigger?: "manual" | "auto";
}

interface RawRecord {
  compactMetadata?: CompactMetadata;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: unknown;
  parentUuid?: string | null;
  sessionId?: string;
  subtype?: string;
  teamName?: string;
  timestamp?: string;
  toolUseResult?: unknown;
  type: string;
  uuid: string;
  [key: string]: unknown;
}

/**
 * One line of a transcript as the line index keeps it: the fields the chain
 * walk reads, where the record lies in its file, and what the message it
 * makes is, for cutting a conversation into windows ({@link saidPlan}).
 * Built from the whole record once, as the line is scanned
 * ({@link nodeOf}); the record itself is read again only when a read
 * returns it.
 */
interface ChainNode {
  byteLength: number;
  compactMetadata?: CompactMetadata;
  /**
   * The ids its message names that another message may name too: the tool
   * calls it makes or answers, the task its notification ends (`task:<id>`).
   * A window never starts between two messages that name the same id.
   */
  ids?: string[];
  isMeta?: boolean;
  isSidechain?: boolean;
  logicalParentUuid?: string;
  /** An assistant record's `message.id`: records of one message share it. */
  messageId?: string;
  offset: number;
  /** Its message opens a turn: a window may start here. */
  opens?: true;
  operation?: string;
  parentUuid?: string | null;
  /** What its message is, when it makes one ({@link toSDKMessage}): `hook` for a hook's failure. */
  shows?: "user" | "assistant" | "system" | "hook";
  /** The command id its message carries ({@link SDKSessionMessage.sourceUuid}). */
  sourceUuid?: string;
  subtype?: string;
  teamName?: string;
  timestamp?: string;
  /** A user record carrying a tool result. */
  toolResult?: true;
  type: string;
  uuid: string;
}

/**
 * Types the SDK includes in its initial pass (before chain walking).
 * The byte prefilter is looser than the final filter so it doesn't miss
 * records needed for chain linking (system compact_boundary, attachments, etc).
 * `queue-operation` lines are on no chain; they say how many queued prompts a
 * user record joins ({@link joinedCounts}).
 */
const CHAIN_TYPES = typeFilter(
  "user",
  "assistant",
  "system",
  "progress",
  "attachment",
  "queue-operation"
);

// ---------------------------------------------------------------------------
// Chain-walking helpers — each handles one step of the SDK's TEe/kEe logic
// ---------------------------------------------------------------------------

/** Extract the message id from an assistant record (for orphan splicing). */
function assistantMessageId(r: ChainNode): string | undefined {
  return r.type === "assistant" ? r.messageId : undefined;
}

/** Whether a user record is a tool_result follow-up (for orphan splicing). */
function isToolResultUser(r: ChainNode): boolean {
  return r.type === "user" && !!r.parentUuid && r.toolResult === true;
}

/** Build uuid→record map from parsed records, keeping only those with a uuid. */
function buildUuidMap(records: ChainNode[]): Map<string, ChainNode> {
  const m = new Map<string, ChainNode>();
  for (const r of records) {
    if (typeof r.uuid === "string") {
      m.set(r.uuid, r);
    }
  }
  return m;
}

/**
 * `byUuid`'s records by parent, kept in step as records are moved: who has a
 * parent is one lookup, not a pass over every record (a pass per compaction
 * held the loop 620 ms on a real 413 MB transcript of 50 compactions).
 */
class Relinker {
  readonly byUuid: Map<string, ChainNode>;
  readonly #children = new Map<string, Set<string>>();

  constructor(byUuid: Map<string, ChainNode>) {
    this.byUuid = byUuid;
    for (const [uuid, r] of byUuid) {
      this.#link(uuid, r.parentUuid);
    }
  }

  /** The uuids whose parent is `parent` now. */
  childrenOf(parent: string): string[] {
    return [...(this.#children.get(parent) ?? [])];
  }

  /** `uuid`'s record, given `parent` as its parent (a copy: the original is the file's). */
  move(uuid: string, parent: string | null | undefined): void {
    const rec = this.byUuid.get(uuid);
    if (!rec) {
      return;
    }
    if (rec.parentUuid) {
      this.#children.get(rec.parentUuid)?.delete(uuid);
    }
    this.byUuid.set(uuid, { ...rec, parentUuid: parent });
    this.#link(uuid, parent);
  }

  #link(uuid: string, parent: string | null | undefined): void {
    if (!parent) {
      return;
    }
    let children = this.#children.get(parent);
    if (!children) {
      children = new Set();
      this.#children.set(parent, children);
    }
    children.add(uuid);
  }
}

/**
 * Relink parentUuid chains around compact boundaries, exactly as the SDK does.
 * Mutates `byUuid` in place (replaces records with updated copies).
 */
function relinkCompactBoundaries(byUuid: Map<string, ChainNode>): Set<string> {
  const skippedAnchors = new Set<string>();
  const boundaries = [...byUuid.values()].filter(isCompactBoundary);
  if (boundaries.length === 0) {
    return skippedAnchors;
  }
  const links = new Relinker(byUuid);
  for (const r of boundaries) {
    const preserved = r.compactMetadata?.preservedMessages;
    const segment = r.compactMetadata?.preservedSegment;
    const skipped = preserved
      ? relinkPreserved(links, preserved)
      : segment && relinkSegment(links, segment);
    if (skipped) {
      skippedAnchors.add(skipped);
    }
  }
  return skippedAnchors;
}

/** A boundary's preserved messages put after its anchor; the anchor's, when they are not all here. */
function relinkPreserved(
  links: Relinker,
  preserved: NonNullable<CompactMetadata["preservedMessages"]>
): string | undefined {
  if (preserved.uuids.length === 0) {
    return; // the SDK skips this globally too — parity, not a window artifact
  }
  if (preserved.uuids.some((u) => !links.byUuid.has(u))) {
    return preserved.anchorUuid;
  }
  let anchor = preserved.anchorUuid;
  for (const u of preserved.uuids) {
    links.move(u, anchor);
    anchor = u;
  }
  const [first] = preserved.uuids;
  const last = preserved.uuids.at(-1) ?? first;
  for (const uuid of links.childrenOf(preserved.anchorUuid)) {
    if (uuid !== first) {
      links.move(uuid, last);
    }
  }
}

/** A boundary's preserved segment put after its anchor; the anchor's, when its head is not here. */
function relinkSegment(
  links: Relinker,
  segment: NonNullable<CompactMetadata["preservedSegment"]>
): string | undefined {
  const here = links.byUuid.has(segment.headUuid);
  if (here) {
    links.move(segment.headUuid, segment.anchorUuid);
  }
  for (const uuid of links.childrenOf(segment.anchorUuid)) {
    if (uuid !== segment.headUuid) {
      links.move(uuid, segment.tailUuid);
    }
  }
  return here ? undefined : segment.anchorUuid;
}

/** Build a file-order index map for tiebreaking. */
function buildIndexMap(records: ChainNode[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].uuid) {
      m.set(records[i].uuid, i);
    }
  }
  return m;
}

/** From each leaf, find its first user/assistant ancestor. */
function findTips(
  leaves: ChainNode[],
  byUuid: Map<string, ChainNode>
): ChainNode[] {
  const tips: ChainNode[] = [];
  for (const leaf of leaves) {
    let node: ChainNode | undefined = leaf;
    const visited = new Set<string>();
    while (node) {
      if (visited.has(node.uuid)) {
        break;
      }
      visited.add(node.uuid);
      if (node.type === "user" || node.type === "assistant") {
        tips.push(node);
        break;
      }
      node = node.parentUuid ? byUuid.get(node.parentUuid) : undefined;
    }
  }
  return tips;
}

/**
 * Find the active conversation chain from leaves back to root. Returns the
 * chain in chronological order (oldest first), without orphan splicing.
 */
function findActiveChain(
  byUuid: Map<string, ChainNode>,
  records: ChainNode[]
): { chain: ChainNode[]; chainSet: Set<string> } {
  const indexMap = buildIndexMap(records);

  // Leaves: records whose uuid isn't any other record's parentUuid.
  const parentIds = new Set<string>();
  for (const r of byUuid.values()) {
    if (r.parentUuid) {
      parentIds.add(r.parentUuid);
    }
  }
  const leaves = [...byUuid.values()].filter((r) => !parentIds.has(r.uuid));

  const tips = findTips(leaves, byUuid);
  if (tips.length === 0) {
    return { chain: [], chainSet: new Set() };
  }

  // Pick the best tip: prefer non-sidechain/non-meta/non-team, then latest.
  const good = tips.filter((r) => !(r.isSidechain || r.teamName || r.isMeta));
  const latest = (arr: ChainNode[]) =>
    arr.reduce((a, b) =>
      (indexMap.get(b.uuid) ?? -1) > (indexMap.get(a.uuid) ?? -1) ? b : a
    );
  const best = good.length > 0 ? latest(good) : latest(tips);

  // Walk the chain back from best tip.
  const chain: ChainNode[] = [];
  const chainSet = new Set<string>();
  let node: ChainNode | undefined = byUuid.get(best.uuid);
  while (node) {
    if (chainSet.has(node.uuid)) {
      break;
    }
    chainSet.add(node.uuid);
    chain.push(node);
    node = node.parentUuid ? byUuid.get(node.parentUuid) : undefined;
  }
  chain.reverse();
  return { chain, chainSet };
}

/**
 * Each record by uuid as the file first wrote it. Claude Code writes an
 * earlier compaction's block again when a later `/compact` runs in the same
 * process (anthropics/claude-code#92089): the boundary, its summary and the
 * records it kept, under their old uuids, the kept ones now hung from the
 * summary. A later copy is not where a record was said, and its links lead
 * the boundary's logical parent back to the boundary itself (1,274 records
 * written twice in a real 413 MB session, whose walk stopped there 9,666
 * entries back of 47,076).
 */
function firstWrites(records: readonly ChainNode[]): Map<string, ChainNode> {
  const m = new Map<string, ChainNode>();
  for (const r of records) {
    if (typeof r.uuid === "string" && !m.has(r.uuid)) {
      m.set(r.uuid, r);
    }
  }
  return m;
}

/** Whether `r` is the line Claude Code starts a compacted conversation on. */
const isCompactBoundary = (r: { type: string; subtype?: unknown }): boolean =>
  r.type === "system" && r.subtype === "compact_boundary";

/**
 * The conversation as it was said, from the active chain: before it, each
 * stretch a compaction set aside. Claude Code starts a compacted
 * conversation on a `compact_boundary` whose `parentUuid` is null, its
 * `logicalParentUuid` the last record before the compaction, so the active
 * chain (what the model reads now) begins at the newest boundary. Walked on
 * from that boundary by the stored links (`original`, as the file wrote
 * them, before {@link relinkCompactBoundaries} moved the preserved records
 * after the summary), across every older boundary the same way, the turns
 * the compactions set aside come before it, in the order they were said.
 * The walk follows one record's parent at a time, so a branch the
 * conversation left (a retry, an edit, a rewind) is never on it. A
 * preserved record stands once, where it was said, and not again after the
 * summary: `original` holds each record as the file first wrote it
 * ({@link firstWrites}). A boundary whose logical parent the file never
 * wrote goes on from the row above it.
 */
function withSetAside(
  chain: ChainNode[],
  original: Map<string, ChainNode>,
  records: readonly ChainNode[]
): ChainNode[] {
  const [head] = chain;
  const before: ChainNode[] = [];
  const seen = new Set<string>();
  const onFrom = (r: ChainNode): ChainNode | undefined => {
    if (r.parentUuid) {
      return original.get(r.parentUuid);
    }
    const logical = r.logicalParentUuid;
    if (!(isCompactBoundary(r) && typeof logical === "string")) {
      return;
    }
    return original.get(logical) ?? rowAbove(r);
  };
  // Claude Code names a logical parent it never wrote now and then
  // (anthropics/claude-code#46603, #49996): the boundary then goes on from
  // the nearest row above it in the file, the first persisted record before
  // it (#55818 reads it so; so it is in all six such boundaries of a real
  // 413 MB session).
  let firstAt: Map<string, number> | undefined;
  const rowAbove = (boundary: ChainNode): ChainNode | undefined => {
    if (!firstAt) {
      firstAt = new Map();
      for (const [i, r] of records.entries()) {
        if (!firstAt.has(r.uuid)) {
          firstAt.set(r.uuid, i);
        }
      }
    }
    for (let i = (firstAt.get(boundary.uuid) ?? 0) - 1; i >= 0; i -= 1) {
      const above = records[i];
      if (typeof above?.uuid === "string" && above.uuid) {
        return original.get(above.uuid);
      }
    }
  };
  for (
    let node = head && isCompactBoundary(head) ? onFrom(head) : undefined;
    node && !seen.has(node.uuid);
    node = onFrom(node)
  ) {
    seen.add(node.uuid);
    before.push(node);
  }
  if (before.length === 0) {
    return chain;
  }
  before.reverse();
  return [...before, ...chain.filter((r) => !seen.has(r.uuid))];
}

/**
 * Splice orphans into the chain — retried assistant turns and tool_result user
 * records that share the same message.id as a chain assistant but are not
 * themselves on the chain. Mirrors the SDK's `kEe` function.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mirrors the SDK's kEe orphan-splice logic which requires cross-referencing message ids, parent uuids, and chain membership
function spliceOrphans(
  chain: ChainNode[],
  chainSet: Set<string>,
  byUuid: Map<string, ChainNode>
): ChainNode[] {
  const chainAssistants = chain.filter((r) => r.type === "assistant");
  if (chainAssistants.length === 0) {
    return chain;
  }

  // Map message id → LAST chain assistant (the SDK's `o.set(m, f)` loop).
  const msgIdToTarget = new Map<string, ChainNode>();
  for (const a of chainAssistants) {
    const mid = assistantMessageId(a);
    if (mid) {
      msgIdToTarget.set(mid, a);
    }
  }

  // Collect all records by message id, and tool_result users by parentUuid.
  const byMsgId = new Map<string, ChainNode[]>();
  const toolResultByParent = new Map<string, ChainNode[]>();
  for (const r of byUuid.values()) {
    const mid = assistantMessageId(r);
    if (mid) {
      let arr = byMsgId.get(mid);
      if (!arr) {
        arr = [];
        byMsgId.set(mid, arr);
      }
      arr.push(r);
    } else if (isToolResultUser(r)) {
      const pu = r.parentUuid ?? "";
      let arr = toolResultByParent.get(pu);
      if (!arr) {
        arr = [];
        toolResultByParent.set(pu, arr);
      }
      arr.push(r);
    }
  }

  // For each unique message id, collect orphans and attach to the LAST chain
  // assistant with that id — matching the SDK's kEe.
  const seenMids = new Set<string>();
  const spliceMap = new Map<string, ChainNode[]>();
  let spliceTotal = 0;
  for (const a of chainAssistants) {
    const mid = assistantMessageId(a);
    if (!mid || seenMids.has(mid)) {
      continue;
    }
    seenMids.add(mid);

    const target = msgIdToTarget.get(mid) ?? a;
    const siblings = byMsgId.get(mid) ?? [a];
    const sameMsg = siblings.filter((r) => !chainSet.has(r.uuid));

    const toolResults: ChainNode[] = [];
    for (const r of siblings) {
      const trs = toolResultByParent.get(r.uuid);
      if (trs) {
        for (const tr of trs) {
          if (!chainSet.has(tr.uuid)) {
            toolResults.push(tr);
          }
        }
      }
    }

    if (sameMsg.length === 0 && toolResults.length === 0) {
      continue;
    }

    const byTs = (x: ChainNode, y: ChainNode) =>
      (x.timestamp ?? "").localeCompare(y.timestamp ?? "");
    sameMsg.sort(byTs);
    toolResults.sort(byTs);
    const toSplice = [...sameMsg, ...toolResults];
    for (const r of toSplice) {
      chainSet.add(r.uuid);
    }
    spliceTotal += toSplice.length;

    const existing = spliceMap.get(target.uuid);
    if (existing) {
      existing.push(...toSplice);
    } else {
      spliceMap.set(target.uuid, toSplice);
    }
  }

  if (spliceTotal === 0) {
    return chain;
  }

  const result: ChainNode[] = [];
  for (const r of chain) {
    result.push(r);
    const extra = spliceMap.get(r.uuid);
    if (extra) {
      result.push(...extra);
    }
  }
  return result;
}

/**
 * Walk the parentUuid chain from the most recent leaf back to the root,
 * exactly as the SDK's `TEe` + `kEe` functions do. This selects the "active
 * conversation" and excludes abandoned forks, sidechains, and records
 * outside the chain.
 *
 * When `windowed` is true (the
 * parsed records are a suffix of the file, not the whole of it), the oldest
 * region of the walked chain can be wrong in exactly one known way: a
 * compact-boundary relink that could not be applied because its preserved
 * records lie before the window. In that case the walk reaches the compact
 * anchor (the "session continued" summary record) but not the preserved
 * segment the global walk splices between the anchor and the post-compact
 * records. The suspect records are dropped so the result is always an exact
 * suffix of the global walk; the caller widens the window if it now has too
 * few records.
 *
 * `said`: the conversation as it was said ({@link withSetAside}), what a
 * transcript shows, rather than what the model reads now. Never windowed:
 * a window cannot hold what the compactions set aside.
 */
function walkChainWindowed(
  records: ChainNode[],
  windowed: boolean,
  said = false
): ChainNode[] {
  const steps = walkSteps(records, windowed, said);
  for (;;) {
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
  }
}

/** The loop's turn between two steps of a long walk. */
const loopTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * {@link walkChainWindowed} over a whole file's index, giving the loop a turn
 * between its steps: each is a pass over every node (tens of milliseconds
 * on a transcript of 100,000 lines), the walk whole more than 100.
 */
async function walkChainYielding(
  records: ChainNode[],
  said: boolean
): Promise<ChainNode[]> {
  const steps = walkSteps(records, false, said);
  for (;;) {
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
    await loopTurn();
  }
}

/** The walk, a step at a time: it yields between its passes over the records. */
function* walkSteps(
  records: ChainNode[],
  windowed: boolean,
  said: boolean
): Generator<void, ChainNode[]> {
  const byUuid = buildUuidMap(records);
  const original = said ? firstWrites(records) : byUuid;
  yield;
  const skippedAnchors = relinkCompactBoundaries(byUuid);
  yield;
  const found = findActiveChain(byUuid, records);
  if (found.chain.length === 0) {
    return [];
  }
  yield;
  const { chainSet } = found;
  let active = said
    ? withSetAside(found.chain, original, records)
    : found.chain;
  for (const r of active) {
    chainSet.add(r.uuid);
  }
  if (windowed) {
    // Drop everything up to and including the last skipped compact anchor.
    const dropped: ChainNode[] = [];
    let cut = -1;
    for (let i = 0; i < active.length; i += 1) {
      if (skippedAnchors.has(active[i].uuid)) {
        cut = i;
      }
    }
    if (cut >= 0) {
      dropped.push(...active.slice(0, cut + 1));
      active = active.slice(cut + 1);
    } else {
      // The chain root's parent is outside the window: the root COULD be a
      // compact anchor whose boundary record (and metadata) we cannot see.
      // Indistinguishable from an ordinary mid-conversation cut, so the one
      // record is dropped either way — the widening loop refills it.
      const [root] = active;
      if (root?.parentUuid && !byUuid.has(root.parentUuid)) {
        dropped.push(root);
        active = active.slice(1);
      }
    }
    // A dropped record must vanish entirely: leaving it in `byUuid` lets
    // spliceOrphans re-adopt it as a same-message.id orphan of a surviving
    // chain assistant and splice it back — out of order.
    for (const r of dropped) {
      chainSet.delete(r.uuid);
      byUuid.delete(r.uuid);
    }
    if (active.length === 0) {
      return [];
    }
  }
  yield;
  return spliceOrphans(active, chainSet, byUuid);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** How the block the CLI hands the model for a finished background task opens. */
const TASK_NOTIFICATION = "<task-notification>";

const isTaskNotification = (prompt: unknown): prompt is string =>
  typeof prompt === "string" &&
  prompt.trimStart().startsWith(TASK_NOTIFICATION);

/** The text of a notification's `<tag>…</tag>`, trimmed; undefined when absent. */
const notificationField = (text: string, tag: string): string | undefined =>
  // RegExp#exec returns null for a tag the block does not carry.
  new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "u").exec(text)?.[1]?.trim();

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** How Claude Code opens the line it puts before a notice of its own. */
const SYSTEM_NOTIFICATION = "[SYSTEM NOTIFICATION";
const REMINDER_OPEN = "<system-reminder>";
const REMINDER_CLOSE = "</system-reminder>";

/**
 * A notice Claude Code put in the user's role, typed ({@link HarnessNote}):
 * a `<task-notification>` block or a `[SYSTEM NOTIFICATION …]` line (its
 * `<summary>` the title, `<status>`, its `<result>` the body; one that
 * carries neither is its whole text under "Harness notification"), or a
 * message that is one whole `<system-reminder>` block. Read here, where
 * Claude Code's own markup is the harness's to read, for the live stream
 * (claude.ts `toNeutral`) and a stored read alike, so the hub and every
 * client get the note typed and never read its markup. Anchored at the
 * message's start: a person who types the tag mid-sentence keeps their own
 * voice. Undefined for anything else.
 */
const harnessNoteOf = (text: string): HarnessNote | undefined => {
  const whole = text.trim();
  if (whole.startsWith(REMINDER_OPEN) && whole.endsWith(REMINDER_CLOSE)) {
    return {
      kind: "system-reminder",
      title: "System reminder",
      status: "",
      body: (notificationField(whole, "system-reminder") ?? "").trim(),
    };
  }
  if (!(whole.startsWith(SYSTEM_NOTIFICATION) || isTaskNotification(whole))) {
    return;
  }
  const title = notificationField(whole, "summary")?.replace(
    /&(?:amp|lt|gt|quot|apos);/gu,
    (entity) => XML_ENTITIES[entity]
  );
  const body = notificationField(whole, "result") ?? "";
  const toolUseId = notificationField(whole, "tool-use-id");
  return {
    kind: "task-notification",
    title: title || "Harness notification",
    status: title || body ? (notificationField(whole, "status") ?? "") : "",
    body: title || body ? body : whole,
    ...(toolUseId ? { toolUseId } : {}),
  };
};

/**
 * A user message's own content with its notice typed beside it
 * ({@link harnessNoteOf}), or as it is when it is not one.
 */
export const withHarnessNote = <M extends { content?: unknown }>(
  message: M
): M => {
  const text =
    typeof message.content === "string"
      ? message.content
      : transcriptUserText(message);
  const note = text ? harnessNoteOf(text) : undefined;
  return note ? { ...message, harnessNote: note } : message;
};

/**
 * A stored task notification as the frame the live stream carried for it.
 *
 * Claude Code reports a finished background task twice: a `task_notification`
 * system frame on stdout, which is the row a live session draws, and the
 * `<task-notification>` block it hands the model, which is the only one it
 * writes to the transcript — a user record when it opens a turn, a
 * `queued_command` fold when it lands mid-turn. Read back as that frame, a
 * reload draws the row the live stream drew. The block escapes its summary as
 * XML where the frame carries it plain, so it is unescaped to match.
 */
function taskNotification(
  r: RawRecord,
  block: string,
  timestamp: string
): SDKSessionMessage {
  const toolUseId = notificationField(block, "tool-use-id");
  const result = notificationField(block, "result");
  const frame: NeutralSystemMessage = {
    type: "system",
    subtype: "task_notification",
    uuid: r.uuid,
    session_id: r.sessionId ?? "",
    task_id: notificationField(block, "task-id"),
    status: notificationField(block, "status"),
    summary: notificationField(block, "summary")?.replace(
      /&(?:amp|lt|gt|quot|apos);/gu,
      (entity) => XML_ENTITIES[entity]
    ),
    ...(toolUseId ? { tool_use_id: toolUseId } : {}),
    ...(result ? { result } : {}),
  };
  return {
    message: frame,
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp,
    type: "system",
    uuid: r.uuid,
  };
}

interface QueuedCommand {
  isMeta?: unknown;
  prompt?: unknown;
  source_uuid?: unknown;
  timestamp?: unknown;
  type?: unknown;
}

/**
 * A message that arrived while a turn was running, where the model read it.
 *
 * Claude Code does not write a user record for it. It holds the message in its
 * own queue and, at the next tool boundary, folds it into the running turn as a
 * `queued_command` attachment on the conversation chain, right after the tool
 * result it arrived beside — then writes `queue-operation` `remove` with reason
 * `absorbed_mid_turn`. Nothing is printed on stdout for it, so this line is
 * the only record that the message was read at all. Every one becomes a user
 * record, whoever sent it: the reader's own words, a delegate's report, a
 * rule, a hand-off, a background task's notification — the CLI drops the
 * origin of all but the reader's, and a reader of the transcript tells them
 * apart by their marker line, as it does for any user record. Only a meta
 * command (`isMeta`, never shown) is not one. The prompt is a string, or
 * content blocks when images rode with it; any other shape is not one.
 */
function absorbedMessage(r: RawRecord): SDKSessionMessage | null {
  if (r.type !== "attachment" || r.isSidechain) {
    return null;
  }
  const command = r.attachment as QueuedCommand | undefined;
  if (
    command?.type !== "queued_command" ||
    command.isMeta === true ||
    typeof command.timestamp !== "string" ||
    !(typeof command.prompt === "string" || Array.isArray(command.prompt))
  ) {
    return null;
  }
  if (isTaskNotification(command.prompt)) {
    return taskNotification(r, command.prompt, command.timestamp);
  }
  return {
    message: withHarnessNote({ role: "user", content: command.prompt }),
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp: command.timestamp,
    type: "user",
    uuid: r.uuid,
    ...(typeof command.source_uuid === "string"
      ? { sourceUuid: command.source_uuid }
      : {}),
  };
}

/**
 * The id a failed session-start hook goes by, live and read back alike: the
 * prompt its run took up first, and its place among that run's failures. The
 * CLI stores the failures as attachments of their own, right ahead of that
 * prompt's record, and says nothing on its live stream that names them — so
 * the prompt they precede is what both sides can name them by.
 */
export const hookFailureId = (prompt: string, index: number): string =>
  `${prompt}:hook:${index}`;

interface StoredHookError {
  command?: unknown;
  exitCode?: unknown;
  hookEvent?: unknown;
  hookName?: unknown;
  stderr?: unknown;
  stdout?: unknown;
  type?: unknown;
}

/**
 * What the CLI wraps a failed hook's stderr in when it stores it (measured,
 * 2.1.280): exit 2 as `[<command>]: <stderr>`, any other failure as
 * `Failed with non-blocking status code: <stderr>`, and no stderr at all as
 * that line with `No stderr output`. The live frame carries the stderr bare.
 */
const NON_BLOCKING = "Failed with non-blocking status code: ";
const NO_STDERR = "No stderr output";

const bareStderr = (hook: StoredHookError): string => {
  const stored = typeof hook.stderr === "string" ? hook.stderr : "";
  const command = typeof hook.command === "string" ? `[${hook.command}]: ` : "";
  if (command && stored.startsWith(command)) {
    return stored.slice(command.length);
  }
  if (stored.startsWith(NON_BLOCKING)) {
    const said = stored.slice(NON_BLOCKING.length);
    return said === NO_STDERR ? "" : said;
  }
  return stored;
};

/**
 * A session-start hook that failed, read back as the frame the live stream
 * carried for it (`hook_response`, claude.ts), under a place-holding id until
 * {@link keyHookFailures} names it by the prompt it precedes.
 */
function hookFailure(r: RawRecord): SDKSessionMessage | null {
  const hook = r.attachment as StoredHookError | undefined;
  if (
    !(
      hook?.type === "hook_non_blocking_error" ||
      hook?.type === "hook_blocking_error"
    ) ||
    hook.hookEvent !== "SessionStart"
  ) {
    return null;
  }
  const frame: NeutralSystemMessage = {
    type: "system",
    subtype: "hook_response",
    uuid: r.uuid,
    session_id: r.sessionId ?? "",
    hook_name: typeof hook.hookName === "string" ? hook.hookName : undefined,
    exit_code: typeof hook.exitCode === "number" ? hook.exitCode : undefined,
    stdout: typeof hook.stdout === "string" ? hook.stdout : "",
    stderr: bareStderr(hook),
  };
  return {
    message: frame,
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp: typeof r.timestamp === "string" ? r.timestamp : "",
    type: "system",
    uuid: r.uuid,
  };
}

/**
 * Names each read-back hook failure by the prompt record that follows it —
 * the prompt its run took up first — and its place among that run's
 * failures ({@link hookFailureId}).
 */
function keyHookFailures(messages: SDKSessionMessage[]): SDKSessionMessage[] {
  let run: SDKSessionMessage[] = [];
  for (const msg of messages) {
    const frame = msg.message as { subtype?: unknown } | null;
    if (msg.type === "system" && frame?.subtype === "hook_response") {
      run.push(msg);
      continue;
    }
    if (msg.type === "user" && run.length > 0) {
      for (const [index, failure] of run.entries()) {
        failure.uuid = hookFailureId(msg.sourceUuid ?? msg.uuid, index);
        (failure.message as NeutralSystemMessage).uuid = failure.uuid;
      }
      run = [];
    }
  }
  return messages;
}

/**
 * A stored compaction boundary as the frame the live stream carried for it
 * (`compact_boundary`, with what triggered it and how full the context was).
 * The CLI writes it as the record its summary hangs from — the root of the
 * chain a read walks back to — so a read that starts at a compaction starts
 * here, and its divider says what the live one said.
 */
function compactBoundary(r: RawRecord): SDKSessionMessage | null {
  if (r.subtype !== "compact_boundary" || r.isSidechain) {
    return null;
  }
  const frame: NeutralSystemMessage = {
    type: "system",
    subtype: "compact_boundary",
    uuid: r.uuid,
    session_id: r.sessionId ?? "",
    compact_metadata: {
      trigger: r.compactMetadata?.trigger,
      pre_tokens: r.compactMetadata?.preTokens,
    },
  };
  return {
    message: frame,
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp: typeof r.timestamp === "string" ? r.timestamp : "",
    type: "system",
    uuid: r.uuid,
  };
}

/** Map a chain-walked record to the SDK's output shape. */
function toSDKMessage(r: RawRecord): SDKSessionMessage | null {
  if (r.type === "attachment") {
    return absorbedMessage(r) ?? hookFailure(r);
  }
  if (r.type === "system") {
    return compactBoundary(r);
  }
  if (r.type !== "user" && r.type !== "assistant") {
    return null;
  }
  if (r.isMeta || r.isSidechain || r.teamName) {
    return null;
  }
  const timestamp = typeof r.timestamp === "string" ? r.timestamp : "";
  const content = (r.message as { content?: unknown } | null | undefined)
    ?.content;
  if (r.type === "user" && isTaskNotification(content)) {
    return taskNotification(r, content, timestamp);
  }
  const msg: SDKSessionMessage = {
    message:
      r.type === "user" && r.message && typeof r.message === "object"
        ? withHarnessNote(r.message as { content?: unknown })
        : (r.message ?? null),
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp,
    type: r.type as "user" | "assistant",
    uuid: r.uuid,
  };
  if (r.toolUseResult !== undefined) {
    msg.toolUseResult = r.toolUseResult;
  }
  if (r.isCompactSummary === true) {
    msg.compactSummary = true;
  }
  if (r.type === "assistant" && typeof r.error === "string") {
    msg.error = r.error;
  }
  return msg;
}

/**
 * The user records that join several queued prompts, by uuid, and how many.
 *
 * The CLI takes up everything queued behind a turn at once, as the next turn:
 * one `queue-operation` `dequeue` line per prompt, then ONE user record under
 * the last prompt's uuid, their words joined by newlines. Measured on CLI
 * 2.1.280, and held for every one of 43 such records across this machine's
 * transcripts: the record's content is exactly the dequeued prompts joined by
 * `\n`, in queue order. The dequeue lines sit right before the record, so a
 * window that holds the record holds them.
 */
function joinedCounts(raw: readonly ChainNode[]): Map<string, number> {
  const joined = new Map<string, number>();
  let dequeued = 0;
  for (const r of raw) {
    if (r.type === "queue-operation" && r.operation === "dequeue") {
      dequeued += 1;
      continue;
    }
    if (r.type === "user" && dequeued > 1) {
      joined.set(r.uuid, dequeued);
    }
    dequeued = 0;
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Line index
// ---------------------------------------------------------------------------

/**
 * The tool calls a message makes, answers, or the task its notification
 * ends, and the row a reader's message draws ({@link ChainNode.ids}): a send
 * the CLI absorbed mid-turn names its row by the send (`sourceUuid`), and the
 * same send handed again after a restart is a user record of that uuid, the
 * one row both draw (core `TranscriptBuilder`: the first wins).
 */
function namedIds(msg: SDKSessionMessage): string[] {
  const ids: string[] = [];
  const frame = msg.message as {
    content?: unknown;
    status?: unknown;
    subtype?: unknown;
    task_id?: unknown;
    tool_use_id?: unknown;
  } | null;
  if (msg.type === "system") {
    if (frame?.subtype === "task_notification") {
      if (typeof frame.tool_use_id === "string") {
        ids.push(frame.tool_use_id);
      }
      if (frame.status && typeof frame.task_id === "string") {
        ids.push(`task:${frame.task_id}`);
      }
    }
    return ids;
  }
  const content = frame?.content;
  if (!Array.isArray(content)) {
    return ids;
  }
  for (const block of content as {
    id?: unknown;
    tool_use_id?: unknown;
    type?: unknown;
  }[]) {
    if (
      msg.type === "assistant" &&
      block.type === "tool_use" &&
      typeof block.id === "string"
    ) {
      ids.push(block.id);
    } else if (
      block.type === "tool_result" &&
      typeof block.tool_use_id === "string"
    ) {
      ids.push(block.tool_use_id);
    }
  }
  return ids;
}

/**
 * Whether a message opens a turn a window may start at: the reader's words,
 * or anyone's sent in their place — the user record the hub resets a
 * keep-alive's quiet at — never a compaction's summary or the CLI's line
 * for a turn it was stopped in.
 */
function opensTurn(msg: SDKSessionMessage): boolean {
  if (msg.type !== "user" || msg.compactSummary || msg.parent_tool_use_id) {
    return false;
  }
  const text = transcriptUserText(msg.message);
  return !!text?.trim() && !interruptLine(text);
}

/** The fields of a record the chain walk reads ({@link ChainNode}). */
function chainFields(r: RawRecord): Partial<ChainNode> {
  const fields: Partial<ChainNode> = {};
  if (r.parentUuid !== undefined) {
    fields.parentUuid = r.parentUuid;
  }
  for (const key of [
    "logicalParentUuid",
    "subtype",
    "timestamp",
    "operation",
    "teamName",
  ] as const) {
    const value = r[key];
    if (typeof value === "string" && value) {
      fields[key] = value;
    }
  }
  if (r.compactMetadata) {
    fields.compactMetadata = r.compactMetadata;
  }
  if (r.isSidechain) {
    fields.isSidechain = true;
  }
  if (r.isMeta) {
    fields.isMeta = true;
  }
  const message = r.message as
    { content?: unknown; id?: unknown } | null | undefined;
  if (r.type === "assistant" && typeof message?.id === "string") {
    fields.messageId = message.id;
  }
  if (
    r.type === "user" &&
    Array.isArray(message?.content) &&
    message.content.some(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "tool_result"
    )
  ) {
    fields.toolResult = true;
  }
  return fields;
}

/** What the message a record makes is, for cutting windows ({@link ChainNode.shows}). */
function messageFacts(r: RawRecord): Partial<ChainNode> {
  const msg = toSDKMessage(r);
  if (!msg) {
    return {};
  }
  const frame = msg.message as { subtype?: unknown } | null;
  const ids = namedIds(msg);
  const opens = opensTurn(msg);
  if (opens) {
    ids.push(msg.sourceUuid ?? msg.uuid);
  }
  return {
    shows:
      msg.type === "system" && frame?.subtype === "hook_response"
        ? "hook"
        : msg.type,
    ...(opens ? { opens: true as const } : {}),
    ...(msg.sourceUuid ? { sourceUuid: msg.sourceUuid } : {}),
    ...(ids.length > 0 ? { ids } : {}),
  };
}

/** One scanned line as the index keeps it ({@link ChainNode}). */
function nodeOf(located: LocatedRecord): ChainNode {
  const r = located.record as unknown as RawRecord;
  return {
    type: r.type,
    uuid: r.uuid,
    offset: located.offset,
    byteLength: located.byteLength,
    ...chainFields(r),
    ...messageFacts(r),
  };
}

/** Every transcript's line index, as reads ask for them. */
const indexes = new LineIndexes<ChainNode>(CHAIN_TYPES, nodeOf);

/** The line indexes' memory: the daemon sizes it from machine config. */
export const transcriptIndexes = indexes;

/**
 * The conversation as it was said, laid out for windows: its messages'
 * nodes in order, each one's place by uuid, and where a window may start.
 *
 * A window may start at a message that opens a turn ({@link ChainNode.opens}),
 * unless a hook's failure stands right before it (that failure is named by
 * the message after it, `keyHookFailures`) or an id named before it is named
 * again at or after it ({@link ChainNode.ids}: a call and its answer, a
 * background task and its notification). So whatever folds one message into
 * another (a result into its call, a notification into its subagent) folds
 * within one window, and windows built one at a time from the newest back
 * give the rows a whole read gives, in its order.
 */
interface SaidPlan {
  at: Map<string, number>;
  /** The positions a window may start at, rising; 0 is always one. */
  cuts: number[];
  joined: Map<string, number>;
  nodes: ChainNode[];
}

async function saidPlan(all: readonly ChainNode[]): Promise<SaidPlan> {
  const nodes = (await walkChainYielding([...all], true)).filter(
    (node) => node.shows !== undefined
  );
  await loopTurn();
  return {
    at: new Map(nodes.map((node, i) => [node.uuid, i])),
    cuts: windowCuts(
      nodes,
      (i) => !!nodes[i]?.opens && nodes[i - 1]?.shows !== "hook"
    ),
    joined: joinedCounts(all),
    nodes,
  };
}

/** A memo on an index, rebuilt once the file changes under it; one that failed is built again by the next read. */
const memo = <T>(
  index: LineIndex<ChainNode>,
  key: string,
  build: () => Promise<T>
): Promise<T> => {
  const held = index.memo.get(key) as Promise<T> | undefined;
  if (held) {
    return held;
  }
  const built = build();
  index.memo.set(key, built);
  built.catch(() => index.memo.delete(key));
  return built;
};

/**
 * The messages of `records` in order, joined counts put on and hook failures
 * named, and the first `count` records' alone: a hook failure is named by
 * the user message after it, so a caller reads on past the records it wants
 * until that message.
 */
function messagesOf(
  records: readonly (RawRecord | undefined)[],
  joined: Map<string, number>,
  count = records.length
): SDKSessionMessage[] {
  const made: { at: number; msg: SDKSessionMessage }[] = [];
  records.forEach((r, at) => {
    const msg = r ? toSDKMessage(r) : null;
    if (r && msg) {
      const times = joined.get(r.uuid);
      made.push({ at, msg: times ? { ...msg, joined: times } : msg });
    }
  });
  keyHookFailures(made.map(({ msg }) => msg));
  return made.flatMap(({ at, msg }) => (at < count ? [msg] : []));
}

/**
 * The messages of `nodes[from..to)` (a said plan's or a chain's), read back
 * by their byte ranges. A range that ends on hook failures nothing has named
 * yet reads on to the user message that names them.
 */
async function messagesAt(
  path: string,
  nodes: readonly ChainNode[],
  joined: Map<string, number>,
  from: number,
  to: number
): Promise<SDKSessionMessage[]> {
  let end = to;
  for (let i = to - 1; i >= from; i -= 1) {
    if (nodes[i].shows === "user") {
      break;
    }
    if (nodes[i].shows === "hook") {
      while (end < nodes.length && nodes[end].shows !== "user") {
        end += 1;
      }
      end = Math.min(end + 1, nodes.length);
      break;
    }
  }
  const records = (await readSpans(path, nodes.slice(from, end))) as (
    RawRecord | undefined
  )[];
  return messagesOf(records, joined, to - from);
}
// ---------------------------------------------------------------------------
// Public API
//
// A transcript deleted while it is read (its session deleted, its workspace
// retired) reads as one never found, as the harness reads a session with no
// transcript: no messages ({@link unlessGone}).
// ---------------------------------------------------------------------------

/**
 * The active conversation chain, whole (matching the SDK's chain walk), read
 * through the line index: for readers that need all of it (a summariser's
 * answer, a continuation).
 */
export function readSessionChain(path: string): Promise<SDKSessionMessage[]> {
  return unlessGone(async () => {
    const index = await indexes.get(path);
    const nodes = await memo(index, "chain", async () =>
      (await walkChainYielding([...index.nodes], false)).filter(
        (node) => node.shows !== undefined
      )
    );
    const joined = await memo(index, "joined", () =>
      Promise.resolve(joinedCounts(index.nodes))
    );
    return messagesAt(path, nodes, joined, 0, nodes.length);
  }, []);
}

/**
 * Every user/assistant record of the main transcript, in file order — no
 * chain walk, so the history before each compaction and every abandoned
 * branch is there too. For readers that index what a session ever did.
 */
export function readSessionWhole(path: string): Promise<SDKSessionMessage[]> {
  return unlessGone(async () => {
    const index = await indexes.get(path);
    const shown = index.nodes.filter((node) => node.shows !== undefined);
    const records = (await readSpans(path, shown)) as (RawRecord | undefined)[];
    return records.flatMap((r) => {
      const msg = r ? toSDKMessage(r) : null;
      return msg ? [msg] : [];
    });
  }, []);
}

/** How far back the newest window reads before it takes the line index instead. Ours: 32 MiB. */
const NEWEST_MAX_BYTES = 32 * 1024 * 1024;

/** A window of the conversation as it was said: its messages, and the cursors either side of it. */
export interface SaidWindow {
  messages: SDKSessionMessage[];
  newer: string | null;
  older: string | null;
}

/**
 * A window of the conversation as it was said ({@link withSetAside}): every
 * turn across its compactions, a compaction's boundary between them.
 *
 * The newest window is read backward from the end ({@link newestWindow}); any
 * other through the line index, which a file's first such read builds. A
 * window starts where {@link SaidPlan} lets one, at or before `limit`
 * messages back; `older` names its first message (null at the start), and
 * `newer` the message after its last (null at the end).
 */
export function readSaidWindow(
  path: string,
  ask: WindowAsk
): Promise<SaidWindow> {
  return unlessGone(
    async () => {
      if ("end" in ask) {
        const fast = await newestWindow(path, ask.limit);
        if (fast) {
          return fast;
        }
      }
      const index = await indexes.get(path);
      const plan = await memo(index, "said", () => saidPlan(index.nodes));
      const { at, cuts, joined, nodes } = plan;
      const { from, to } = windowRange(
        cuts,
        nodes.length,
        (id) => at.get(id),
        ask
      );
      return {
        messages: await messagesAt(path, nodes, joined, from, to),
        older: from > 0 ? nodes[from].uuid : null,
        newer: "start" in ask && to < nodes.length ? nodes[to].uuid : null,
      };
    },
    { messages: [], older: null, newer: null }
  );
}

/**
 * The newest window read backward from the end, without the line index: the
 * chain walked over what was read ({@link walkChainWindowed}, an exact
 * suffix of the whole walk), cut where a window may start
 * ({@link SaidPlan}) by what the read alone can tell. Undefined when the read
 * cannot answer exactly within {@link NEWEST_MAX_BYTES}: a compaction's
 * boundary in what was read (the conversation as it was said differs from
 * the chain there), or no place to cut.
 */
async function newestWindow(
  path: string,
  limit: number
): Promise<SaidWindow | undefined> {
  const reader = new ReverseReader(path, {
    prefilter: CHAIN_TYPES,
    maxBytes: NEWEST_MAX_BYTES,
  });
  let target = limit * 2;
  for (;;) {
    await reader.more(target - reader.records.length);
    const raw = reader.records.map(nodeOf);
    if (raw.some(isCompactBoundary)) {
      return;
    }
    const nodes = walkChainWindowed(raw, !reader.complete).filter(
      (node) => node.shows !== undefined
    );
    const from = localCut(nodes, limit);
    if (from !== undefined || reader.complete) {
      const start = from ?? 0;
      const byUuid = new Map(
        reader.records.map((located) => [
          (located.record as unknown as RawRecord).uuid,
          located.record as unknown as RawRecord,
        ])
      );
      return {
        messages: messagesOf(
          nodes.slice(start).map((node) => byUuid.get(node.uuid)),
          joinedCounts(raw)
        ),
        older:
          start > 0 || !reader.complete ? (nodes[start]?.uuid ?? null) : null,
        newer: null,
      };
    }
    if (reader.spent) {
      return;
    }
    target = Math.max(target * 2, reader.records.length * 2);
  }
}

/**
 * Where the newest window of `nodes` (a suffix of the conversation, its
 * start unseen) may start, `limit` messages back or more: a place
 * {@link SaidPlan} would cut that the suffix alone can vouch for. An id
 * answered in it whose call is not in it was opened before it, so nothing
 * up to that answer may start a window. Undefined when no place is.
 */
function localCut(
  nodes: readonly ChainNode[],
  limit: number
): number | undefined {
  const blocked = new Int32Array(nodes.length + 1);
  const seen = new Map<
    string,
    { first: number; last: number; opened: boolean }
  >();
  nodes.forEach((node, i) => {
    for (const id of node.ids ?? []) {
      const known = seen.get(id);
      if (known) {
        known.last = i;
      } else {
        seen.set(id, { first: i, last: i, opened: opensId(node, id) });
      }
    }
  });
  for (const { first, last, opened } of seen.values()) {
    const from = opened ? first + 1 : 0;
    if (from <= last) {
      blocked[from] += 1;
      blocked[last + 1] -= 1;
    }
  }
  let [open = 0] = blocked;
  let found: number | undefined;
  for (let i = 1; i < nodes.length && i <= nodes.length - limit; i += 1) {
    open += blocked[i];
    if (open === 0 && nodes[i].opens && nodes[i - 1].shows !== "hook") {
      found = i;
    }
  }
  return found;
}

/**
 * Whether `node` opens `id` rather than answering it: a tool call it makes, a
 * task it ends, the row its message draws. A row's first mention may stand
 * before what a suffix read holds (a send absorbed long before it was handed
 * again); the older window that holds it moves the row there (core
 * `TranscriptBuilder.prepend`).
 */
const opensId = (node: ChainNode, id: string): boolean =>
  node.shows === "assistant" ||
  id.startsWith("task:") ||
  id === (node.sourceUuid ?? node.uuid);

/**
 * Read the newest records from a session transcript, starting from EOF.
 *
 * GUARANTEE: `readSessionEnd(path, N).messages` is always an **exact suffix**
 * of {@link readSessionChain} — same records, same order, ending at the same
 * final record. Its length is `min(N, full)` except when the byte cap
 * prevents the window from growing far enough; then it is shorter but still
 * exact, and `complete` is false. Exact, not self-correcting: no later read
 * is needed to repair ordering or membership — a longer read only extends the
 * suffix at the old end.
 *
 * The windowed chain walk drops the suspect old end (a compact-boundary
 * anchor whose preserved records lie before the window, or a root whose
 * parent does), then the loop below reads further back until N chain
 * messages survive. Each step reads only the bytes before the last
 * ({@link ReverseReader}); nothing is parsed twice and no index is built.
 *
 * Known theoretical gap, never observed in 166 real transcripts: a retried
 * assistant turn whose orphan records sit further from their on-chain anchor
 * than the whole window would be omitted from (not reordered within) the
 * suffix's old end.
 *
 * Returns records in chronological order (oldest first).
 */
export function readSessionEnd(
  path: string,
  count = 200
): Promise<{ complete: boolean; messages: SDKSessionMessage[] }> {
  return unlessGone(() => sessionEnd(path, count), {
    complete: true,
    messages: [],
  });
}

async function sessionEnd(
  path: string,
  count: number
): Promise<{ complete: boolean; messages: SDKSessionMessage[] }> {
  const reader = new ReverseReader(path, { prefilter: CHAIN_TYPES });
  let target = count;
  for (;;) {
    await reader.more(target - reader.records.length);
    const raw = reader.records.map(nodeOf);
    const nodes = walkChainWindowed(raw, !reader.complete);
    const byUuid = new Map(
      reader.records.map((located) => [
        (located.record as unknown as RawRecord).uuid,
        located.record as unknown as RawRecord,
      ])
    );
    const messages = messagesOf(
      nodes.map((node) => byUuid.get(node.uuid)),
      joinedCounts(raw)
    );
    if (messages.length >= count || reader.complete || reader.spent) {
      return { complete: reader.complete, messages: messages.slice(-count) };
    }
    // Asking for at least double what the last window held widens it.
    target = Math.max(target * 2, reader.records.length * 2);
  }
}

export async function readSessionContext(path: string) {
  let count = 8;
  let previous = -1;
  for (;;) {
    const { messages, complete } = await readSessionEnd(path, count);
    for (const entry of messages.reverse()) {
      if (entry.type !== "assistant" || entry.error || entry.compactSummary) {
        continue;
      }
      const { usage } = entry.message as {
        usage?: {
          input_tokens: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      if (usage && typeof usage.input_tokens === "number") {
        return {
          tokens:
            usage.input_tokens +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0),
          readAt: Date.now(),
        };
      }
    }
    if (complete || messages.length === previous) {
      return {
        reason: complete
          ? "no assistant usage"
          : "transcript tail byte limit reached",
      };
    }
    previous = messages.length;
    count *= 2;
  }
}
