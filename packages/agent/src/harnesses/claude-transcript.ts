/**
 * Direct transcript reader for Claude Code sessions.
 *
 * Replaces the SDK's `getSessionMessages` black box with an in-house reader
 * built on `@whiffle/jsonl-parser`. The hot path — first page, newest records
 * — backward-scans from EOF via `readTranscriptEnd`, reading ~1 MB instead of
 * the full file. The full-read path falls back to `readTranscript` when callers
 * page deeper than the tail window covers.
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

import type { LocatedRecord } from "@whiffle/jsonl-parser";
import { readTranscriptEnd, typeFilter } from "@whiffle/jsonl-parser";
import { cache } from "./transcript-cache.ts";

/** The shape the SDK's `getSessionMessages` returns — kept structurally identical. */
export interface SDKSessionMessage {
  /** The summary a `/compact` wrote (`isCompactSummary` on the record). */
  compactSummary?: true;
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
}

export interface RawRecord {
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
 * Types the SDK includes in its initial pass (before chain walking).
 * The byte prefilter is looser than the final filter so it doesn't miss
 * records needed for chain linking (system compact_boundary, attachments, etc).
 */
export const CHAIN_TYPES = typeFilter(
  "user",
  "assistant",
  "system",
  "progress",
  "attachment"
);

// ---------------------------------------------------------------------------
// Chain-walking helpers — each handles one step of the SDK's TEe/kEe logic
// ---------------------------------------------------------------------------

/** Extract the message id from an assistant record (for orphan splicing). */
function assistantMessageId(r: RawRecord): string | undefined {
  if (r.type !== "assistant") {
    return undefined;
  }
  const msg = r.message as { id?: unknown } | null | undefined;
  return typeof msg?.id === "string" ? msg.id : undefined;
}

/** Whether a user record is a tool_result follow-up (for orphan splicing). */
function isToolResultUser(r: RawRecord): boolean {
  if (r.type !== "user" || !r.parentUuid) {
    return false;
  }
  const msg = r.message as { content?: unknown } | null | undefined;
  const content = msg?.content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "tool_result"
  );
}

/** Build uuid→record map from parsed records, keeping only those with a uuid. */
function buildUuidMap(records: RawRecord[]): Map<string, RawRecord> {
  const m = new Map<string, RawRecord>();
  for (const r of records) {
    if (typeof r.uuid === "string") {
      m.set(r.uuid, r);
    }
  }
  return m;
}

/**
 * Relink parentUuid chains around compact boundaries, exactly as the SDK does.
 * Mutates `byUuid` in place (replaces records with updated copies).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: compact boundary relink must handle both preservedMessages and preservedSegment shapes in one pass
function relinkCompactBoundaries(byUuid: Map<string, RawRecord>): Set<string> {
  const skippedAnchors = new Set<string>();
  for (const r of byUuid.values()) {
    if (r.type !== "system" || r.subtype !== "compact_boundary") {
      continue;
    }
    const preserved = r.compactMetadata?.preservedMessages;
    const segment = r.compactMetadata?.preservedSegment;
    if (preserved) {
      if (preserved.uuids.length === 0) {
        continue; // the SDK skips this globally too — parity, not a window artifact
      }
      if (preserved.uuids.some((u) => !byUuid.has(u))) {
        skippedAnchors.add(preserved.anchorUuid);
        continue;
      }
      let anchor = preserved.anchorUuid;
      for (const u of preserved.uuids) {
        const rec = byUuid.get(u);
        if (rec) {
          byUuid.set(u, { ...rec, parentUuid: anchor });
          anchor = u;
        }
      }
      const [first] = preserved.uuids;
      const last = preserved.uuids.at(-1) ?? first;
      for (const [uuid, rec] of byUuid) {
        if (rec.parentUuid === preserved.anchorUuid && uuid !== first) {
          byUuid.set(uuid, { ...rec, parentUuid: last });
        }
      }
    } else if (segment) {
      const head = byUuid.get(segment.headUuid);
      if (!head) {
        skippedAnchors.add(segment.anchorUuid);
      }
      if (head) {
        byUuid.set(segment.headUuid, {
          ...head,
          parentUuid: segment.anchorUuid,
        });
      }
      for (const [uuid, rec] of byUuid) {
        if (
          rec.parentUuid === segment.anchorUuid &&
          uuid !== segment.headUuid
        ) {
          byUuid.set(uuid, { ...rec, parentUuid: segment.tailUuid });
        }
      }
    }
  }
  return skippedAnchors;
}

/** Build a file-order index map for tiebreaking. */
function buildIndexMap(records: RawRecord[]): Map<string, number> {
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
  leaves: RawRecord[],
  byUuid: Map<string, RawRecord>
): RawRecord[] {
  const tips: RawRecord[] = [];
  for (const leaf of leaves) {
    let node: RawRecord | undefined = leaf;
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
  byUuid: Map<string, RawRecord>,
  records: RawRecord[]
): { chain: RawRecord[]; chainSet: Set<string> } {
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
  const latest = (arr: RawRecord[]) =>
    arr.reduce((a, b) =>
      (indexMap.get(b.uuid) ?? -1) > (indexMap.get(a.uuid) ?? -1) ? b : a
    );
  const best = good.length > 0 ? latest(good) : latest(tips);

  // Walk the chain back from best tip.
  const chain: RawRecord[] = [];
  const chainSet = new Set<string>();
  let node: RawRecord | undefined = byUuid.get(best.uuid);
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
 * Splice orphans into the chain — retried assistant turns and tool_result user
 * records that share the same message.id as a chain assistant but are not
 * themselves on the chain. Mirrors the SDK's `kEe` function.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mirrors the SDK's kEe orphan-splice logic which requires cross-referencing message ids, parent uuids, and chain membership
function spliceOrphans(
  chain: RawRecord[],
  chainSet: Set<string>,
  byUuid: Map<string, RawRecord>
): RawRecord[] {
  const chainAssistants = chain.filter((r) => r.type === "assistant");
  if (chainAssistants.length === 0) {
    return chain;
  }

  // Map message id → LAST chain assistant (the SDK's `o.set(m, f)` loop).
  const msgIdToTarget = new Map<string, RawRecord>();
  for (const a of chainAssistants) {
    const mid = assistantMessageId(a);
    if (mid) {
      msgIdToTarget.set(mid, a);
    }
  }

  // Collect all records by message id, and tool_result users by parentUuid.
  const byMsgId = new Map<string, RawRecord[]>();
  const toolResultByParent = new Map<string, RawRecord[]>();
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
  const spliceMap = new Map<string, RawRecord[]>();
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

    const toolResults: RawRecord[] = [];
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

    const byTs = (x: RawRecord, y: RawRecord) =>
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

  const result: RawRecord[] = [];
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
 */
function walkChainWindowed(
  records: RawRecord[],
  windowed: boolean
): RawRecord[] {
  const byUuid = buildUuidMap(records);
  const skippedAnchors = relinkCompactBoundaries(byUuid);
  const { chain, chainSet } = findActiveChain(byUuid, records);
  if (chain.length === 0) {
    return [];
  }
  let active = chain;
  if (windowed) {
    // Drop everything up to and including the last skipped compact anchor.
    const dropped: RawRecord[] = [];
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
  return spliceOrphans(active, chainSet, byUuid);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function absorbedMessage(r: RawRecord): SDKSessionMessage | null {
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
  return {
    message: { role: "user", content: command.prompt },
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
 * A turn the reader opened: a main-chain `user` line stamped `origin.kind:
 * "human"` that carries words or images rather than tool results. A message
 * sent while a turn ran and not absorbed before it ended is dequeued by the
 * CLI as the next turn and written as exactly this line — with nothing printed
 * on stdout for it either.
 */
export function openedTurn(r: RawRecord): SDKSessionMessage | null {
  const content = (r.message as { content?: unknown } | undefined)?.content;
  if (
    r.type !== "user" ||
    (r.origin as { kind?: unknown } | undefined)?.kind !== "human" ||
    (Array.isArray(content) &&
      content.some((block: { type?: unknown }) => block.type === "tool_result"))
  ) {
    return null;
  }
  return toSDKMessage(r);
}

/** Map a chain-walked record to the SDK's output shape. */
function toSDKMessage(r: RawRecord): SDKSessionMessage | null {
  if (r.type === "attachment") {
    return absorbedMessage(r);
  }
  if (r.type !== "user" && r.type !== "assistant") {
    return null;
  }
  if (r.isMeta || r.isSidechain || r.teamName) {
    return null;
  }
  const msg: SDKSessionMessage = {
    message: r.message ?? null,
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: r.sessionId ?? "",
    timestamp: typeof r.timestamp === "string" ? r.timestamp : "",
    type: r.type as "user" | "assistant",
    uuid: r.uuid,
  };
  if (r.toolUseResult !== undefined) {
    msg.toolUseResult = r.toolUseResult;
  }
  if (r.isCompactSummary === true) {
    msg.compactSummary = true;
  }
  return msg;
}

/** Convert located records to the SDK shape via chain walking. */
function locatedToMessages(
  located: LocatedRecord[],
  windowed = false
): SDKSessionMessage[] {
  const raw = located.map((lr) => lr.record as unknown as RawRecord);
  const chain = walkChainWindowed(raw, windowed);
  const messages: SDKSessionMessage[] = [];
  for (const r of chain) {
    const msg = toSDKMessage(r);
    if (msg) {
      messages.push(msg);
    }
  }
  return messages;
}

/**
 * Read the full transcript, returning every user/assistant record in the
 * active conversation chain (matching the SDK's chain-walking logic).
 *
 * Uses the transcript cache: the first call parses the file; subsequent calls
 * for the same path only parse appended bytes.
 */
export async function readSessionFull(
  path: string
): Promise<SDKSessionMessage[]> {
  const entry = await cache.get(path);
  if (entry.walkedMessages) {
    return entry.walkedMessages as SDKSessionMessage[];
  }
  const messages = locatedToMessages(entry.records);
  entry.walkedMessages = messages;
  return messages;
}

/**
 * Every user/assistant record of the main transcript, in file order — no
 * chain walk, so the history before each compaction and every abandoned
 * branch is there too. For readers that index what a session ever did.
 */
export async function readSessionWhole(
  path: string
): Promise<SDKSessionMessage[]> {
  const entry = await cache.get(path);
  return entry.records.flatMap((located) => {
    const msg = toSDKMessage(located.record as unknown as RawRecord);
    return msg ? [msg] : [];
  });
}

/**
 * Read the newest records from a session transcript, starting from EOF.
 *
 * GUARANTEE: `readSessionEnd(path, N).messages` is always an **exact suffix**
 * of `readSessionFull(path)` — same records, same order, ending at the same
 * final record. Its length is `min(N, full)` except when the byte cap
 * (`readTranscriptEnd`'s 16 MiB `maxBytes`) prevents the window from growing
 * far enough; then it is shorter but still exact, and `complete` is false.
 * Exact, not self-correcting: no later read is needed to repair ordering or
 * membership — a longer read only extends the suffix at the old end.
 *
 * Cache hit path: the whole-file walk over cached records trivially satisfies
 * the guarantee — `slice(-count)` on the full walked chain is an exact suffix
 * by definition.
 *
 * Cache miss path: the windowed chain walk drops the suspect old end (a
 * compact-boundary anchor whose preserved records lie before the window, or a
 * root whose parent does), then the loop below widens the window until N
 * chain messages survive. A fire-and-forget `cache.get(path)` populates the
 * cache so the next caller (typically `streamHistory` phase 2) awaits the
 * same single-flighted populate instead of re-parsing.
 *
 * Proven corpus-wide by `bench/transcript-tail-parity.ts`.
 *
 * Known theoretical gap, never observed in 166 real transcripts: a retried
 * assistant turn whose orphan records sit further from their on-chain anchor
 * than the whole window would be omitted from (not reordered within) the
 * suffix's old end; any full read layered behind the tail supplies it.
 *
 * Returns records in chronological order (oldest first).
 */
export async function readSessionEnd(
  path: string,
  count = 200
): Promise<{ complete: boolean; messages: SDKSessionMessage[] }> {
  // Cache hit: use walked-messages cache, slice to the last `count`.
  const cached = cache.peek(path);
  if (cached) {
    const entry = await cache.get(path);
    if (!entry.walkedMessages) {
      entry.walkedMessages = locatedToMessages(entry.records);
    }
    const messages = entry.walkedMessages as SDKSessionMessage[];
    const sliced = messages.slice(-count);
    return { complete: sliced.length === messages.length, messages: sliced };
  }

  // Cache miss: fast windowed read for first paint.
  let target = count;
  let prevStart = -1;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next, wider one is needed
    const result = await readTranscriptEnd(path, {
      records: target,
      prefilter: CHAIN_TYPES,
    });
    const messages = locatedToMessages(result.records, !result.complete);
    // Stop when: enough chain messages, the whole file is in hand, or the
    // window can no longer grow (maxBytes cap — startOffset stopped moving).
    if (
      messages.length >= count ||
      result.complete ||
      result.startOffset === prevStart
    ) {
      // Fire-and-forget: populate the cache so phase-2 full read is free.
      // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional fire-and-forget
      cache.get(path).catch(() => {});
      return { complete: result.complete, messages };
    }
    prevStart = result.startOffset;
    // The raw-record target is a proxy for window size: asking for at least
    // double what the last window held forces readTranscriptEnd to widen.
    target = Math.max(target * 2, result.records.length * 2);
  }
}
