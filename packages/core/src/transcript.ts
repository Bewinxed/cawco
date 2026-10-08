/**
 * THE TRANSCRIPT BUILDER: one session's frames, folded into blocks once.
 *
 * The hub keeps one of these per session and feeds it every frame as it
 * arrives, whether or not anyone is watching; a client fetches a page of what
 * it holds and follows the events each frame produces. Nothing downstream
 * derives anything: the rules live in `transcript-rules.ts`, moved from the
 * dashboard, and this file is the state they fold into.
 *
 * What it keeps is what a dashboard tab used to: the harness's own rows with a
 * placeholder where each send was read or stored, the hub's record of every
 * send, and each subagent's branch. What it serves is those rows with every
 * send drawn in its place (`placeSends`), the sends still waiting, the live
 * tail, and the facts the session has stated.
 */
import type { NeutralMessage, SendRecord, SessionMessage } from "./harness";
import {
  applyBranchEvent,
  applyToolResult,
  type BranchEvent,
  type BranchState,
  branchFor,
  compactSummaryRow,
  type FrameMapping,
  mapFrame,
  newer,
  placeSends,
  sendRef,
  sentRow,
  spawnsSubagent,
  storedAt,
  suppressesTaskLine,
  type ToolResult,
  turnStart,
} from "./transcript-rules";
import type {
  TranscriptBlock,
  TranscriptBranch,
  TranscriptEvent,
  TranscriptFacts,
  TranscriptPage,
  TranscriptPageBranch,
  TranscriptTail,
} from "./transcript-types";

/** How long after an interrupt the error closing the turn is its receipt, not a failure. */
const INTERRUPT_WINDOW_MS = 15_000;

/** A newest page's size when none is asked for, in main-transcript blocks. */
export const TRANSCRIPT_PAGE = 60;

const blankTail = (): TranscriptTail => ({
  busy: false,
  currentTool: null,
  openBlock: null,
  streams: {},
  streaming: "",
  thinkingClosing: false,
  thinkingSince: null,
  thinkingStream: "",
});

const blankFacts = (): TranscriptFacts => ({
  commands: { names: [], skills: [], detailed: null },
  harness: null,
  inits: 0,
  initialized: false,
  lastCompaction: null,
  lastTurnFailed: false,
  model: null,
  permissionMode: null,
  sdkStatus: null,
  sessionId: null,
  tooling: null,
  totalCost: null,
  turnsEnded: 0,
});

/** FNV-1a over a frame's JSON: the id of a block whose frame carries no uuid. */
const frameHash = (frame: unknown): string => {
  const text = JSON.stringify(frame);
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a is defined on bits
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: the unsigned 32-bit value
  return (hash >>> 0).toString(36);
};

/**
 * A block onto a branch's transcript unless one with its id is already there:
 * an id names one block. Whether it was added.
 */
const holdOnce = (sink: TranscriptBlock[], block: TranscriptBlock): boolean => {
  if (sink.some((held) => held.id === block.id)) {
    return false;
  }
  sink.push(block);
  return true;
};

/** A frame's branch events in order: the subagents its calls start, then the branch it moved. */
const branchEvents = (mapping: FrameMapping): BranchEvent[] =>
  mapping.branch ? [...mapping.spawns, mapping.branch] : mapping.spawns;

/** A branch's state without its blocks: what an event carries. */
const branchState = ({ blocks: _, ...state }: BranchState): TranscriptBranch =>
  state;

/** The longest run of `seq` that only ever rises, as a set of its values. */
function risingRun(seq: number[]): Set<number> {
  const tails: number[] = [];
  const tailAt: number[] = [];
  const parent = new Array<number>(seq.length).fill(-1);
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      // biome-ignore lint/suspicious/noBitwiseOperators: integer midpoint
      const mid = (lo + hi) >> 1;
      if (tails[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    tails[lo] = value;
    tailAt[lo] = i;
    parent[i] = lo > 0 ? tailAt[lo - 1] : -1;
  });
  const kept = new Set<number>();
  for (let i = tailAt[tails.length - 1] ?? -1; i >= 0; i = parent[i]) {
    kept.add(seq[i]);
  }
  return kept;
}

export class TranscriptBuilder {
  readonly instanceId: string;
  /** The harness's rows, with a placeholder where each send was read or stored. */
  private rows: TranscriptBlock[] = [];
  private rowIds = new Set<string>();
  /** The hub's record of every send this transcript knows of, by uuid. */
  private records: Record<string, SendRecord> = {};
  private branches = new Map<string, BranchState>();
  /** What is served: the rows with every send in its place. */
  private placed: TranscriptBlock[] = [];
  private queued: TranscriptBlock[] = [];
  /** The uuids a history read carried: a frame replayed behind it is not news. */
  private seeded = new Set<string>();
  private tail = blankTail();
  private facts = blankFacts();
  /** When an interrupt was last carried to this session, epoch ms. */
  private interruptedAt = Number.NEGATIVE_INFINITY;
  /** Started again in place for a mode it could not switch into; ends at the next init. */
  private relaunching: boolean;
  private readonly now: () => number;

  /* The change being built: emitted together at the end of one apply. */
  private events: TranscriptEvent[] = [];
  private tailPatch: Partial<TranscriptTail> = {};
  private factsPatch: Partial<TranscriptFacts> = {};
  private movedBranches = new Set<string>();

  constructor(instanceId: string, now: () => number = Date.now) {
    this.instanceId = instanceId;
    this.now = now;
    this.relaunching = false;
  }

  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  /** Whether a history read carried this uuid. */
  seen(uuid: string | undefined): boolean {
    return uuid !== undefined && this.seeded.has(uuid);
  }

  /** How many main-transcript blocks are served. */
  get size(): number {
    return this.placed.length;
  }

  /* ---------------------------------------------------------- history — */

  /**
   * A stored transcript read from its machine, with the records of the sends
   * it holds: everything this builder had is replaced by it. The live tail is
   * dropped — what the partials painted is in the read now — and the facts a
   * read can state are taken from it.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass folding every stored transcript entry kind, as the live path folds frames
  seed(entries: SessionMessage[], records: Record<string, SendRecord>): void {
    const rows: TranscriptBlock[] = [];
    const rowIds = new Set<string>();
    const branches = new Map<string, BranchState>();
    const now = this.stamp();
    /** When each branch's own frames were stored: its first and its latest. */
    const heard = new Map<string, { first: string; last: string }>();
    const hear = (toolUseId: string, at: string): void => {
      const known = heard.get(toolUseId);
      if (!known) {
        heard.set(toolUseId, { first: at, last: at });
        return;
      }
      if (at < known.first) {
        known.first = at;
      }
      if (at > known.last) {
        known.last = at;
      }
    };
    // An id names one block: an entry the harness stored twice is drawn once.
    const put = (sink: TranscriptBlock[], block: TranscriptBlock): void => {
      if (sink !== rows) {
        holdOnce(sink, block);
        return;
      }
      if (!rowIds.has(block.id)) {
        rowIds.add(block.id);
        rows.push(block);
      }
    };
    for (const entry of entries) {
      // The one honest clock a replayed turn has. A branch is dated by its
      // entries too: started at its first, last heard at its latest, done at
      // the result that ends it. The read's own time stands in only for an
      // entry stored without one.
      const recorded = storedAt(entry);
      const at = recorded ?? now;
      // Sends, stored: each one's place, where its record draws it — the same
      // rows, under the same ids, the live stream drew, several where the
      // harness joined them into one entry.
      if (entry.sends) {
        for (const send of entry.sends) {
          put(rows, sendRef(this.instanceId, send, entry.uuid));
        }
        continue;
      }
      // A compaction's summary is the harness's note, whichever role its
      // harness stored it in: never the reader's turn or the agent's answer.
      if (entry.compactSummary) {
        put(
          rows,
          compactSummaryRow(entry, {
            id: entry.uuid,
            instanceId: this.instanceId,
            ...(recorded ? { timestamp: recorded } : {}),
            sdkUuid: entry.uuid,
          })
        );
        continue;
      }
      // A user turn the hub has no record of — typed into the harness itself,
      // or from before the hub kept records — is the harness's own row.
      const opening = turnStart(entry);
      if (opening) {
        put(
          rows,
          sentRow(opening.text, entry.message, {
            id: entry.sourceUuid ?? entry.uuid,
            instanceId: this.instanceId,
            ...(recorded ? { timestamp: recorded } : {}),
            sdkUuid: entry.uuid,
          })
        );
        continue;
      }
      // A `system` entry holds the frame the live stream carried for the same
      // record, so it is drawn by that frame's own mapping.
      const mapping = mapFrame(
        this.instanceId,
        (entry.type === "system" ? entry.message : entry) as NeutralMessage,
        () => entry.uuid
      );
      for (const event of branchEvents(mapping)) {
        applyBranchEvent(branches, this.instanceId, event, at);
      }
      // A task event the subagent itself reported is one of its own frames.
      if (entry.type === "system" && mapping.branch?.toolUseId) {
        hear(mapping.branch.toolUseId, at);
      }
      // The entry's own recorded time, not the frame's.
      for (const block of mapping.blocks) {
        block.timestamp = recorded;
      }
      const owner = mapping.agentId
        ? branchFor(branches, this.instanceId, mapping.agentId, at)
        : undefined;
      if (owner) {
        hear(owner.toolUseId, at);
      }
      const sink = owner ? owner.blocks : rows;
      // A real subagent's "task done" line yields to its branch card.
      for (const block of mapping.blocks) {
        if (
          !suppressesTaskLine(branches, sink, block, mapping.branch?.toolUseId)
        ) {
          put(sink, block);
        }
      }
      for (const result of mapping.toolResults) {
        if (result.launch && spawnsSubagent(sink, result.toolId)) {
          applyBranchEvent(
            branches,
            this.instanceId,
            { toolUseId: result.toolId, status: "running" },
            at
          );
          continue;
        }
        applyToolResult(sink, result);
        // The Task call's own tool_result is the authoritative end of its branch.
        const branch = branches.get(result.toolId);
        if (!branch) {
          continue;
        }
        branch.status = result.isError ? "error" : "complete";
        branch.completedAt ??= at;
        if (result.isError) {
          branch.error ??= result.result;
        } else {
          branch.result ??= result.result;
        }
      }
    }
    // Nothing further will arrive for what was stored; anything still open
    // ended with it rather than being live. A branch whose own frames were
    // stored ran from the first of them to the last: the call that started it
    // and the result that answered it are the parent's, and one result entry
    // can answer several calls at once, long after some of them finished. A
    // branch stored without frames of its own keeps the call and the result.
    for (const branch of branches.values()) {
      if (branch.status !== "error" && branch.status !== "complete") {
        branch.status = "complete";
      }
      const own = heard.get(branch.toolUseId);
      if (own) {
        branch.startedAt = own.first;
        branch.lastEventAt = own.last;
        branch.completedAt = own.last;
      } else {
        branch.completedAt ??= branch.lastEventAt ?? branch.startedAt;
      }
    }

    this.rows = rows;
    this.rowIds = rowIds;
    this.records = { ...records };
    this.branches = branches;
    this.seeded = new Set(entries.map((entry) => entry.uuid));
    ({ blocks: this.placed, queued: this.queued } = placeSends(
      this.rows,
      this.records
    ));
    // The `/` menu from the newest `init` read back: the live handler is
    // otherwise the only thing that sets it.
    const init = rows.findLast((row) => row.type === "system.init");
    this.facts = {
      ...this.facts,
      commands: {
        ...this.facts.commands,
        names: init?.metadata?.slashCommands ?? this.facts.commands.names,
        skills: init?.metadata?.skills ?? this.facts.commands.skills,
      },
      initialized: this.facts.initialized || entries.length > 0,
    };
    this.tail = { ...blankTail(), busy: this.tail.busy };
  }

  /* ------------------------------------------------------------- live — */

  /** An interrupt was carried to this session: the error closing its turn is the stop. */
  noteInterrupt(at: number = this.now()): void {
    this.interruptedAt = at;
  }

  /** The session is being started again in place; ends at its next `init`. */
  noteRelaunch(): void {
    this.relaunching = true;
  }

  /** One live frame, folded in. Returns the changes it made, in order. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one state machine over everything a frame can move, as the dashboard's frame handler was
  applyFrame(frame: NeutralMessage, harness?: string): TranscriptEvent[] {
    if (harness && harness !== this.facts.harness) {
      this.setFacts({ harness });
    }
    const now = this.now();
    const mapping = mapFrame(this.instanceId, frame, () => frameHash(frame));
    for (const event of branchEvents(mapping)) {
      const moved = applyBranchEvent(
        this.branches,
        this.instanceId,
        event,
        this.stamp()
      );
      if (moved) {
        this.movedBranches.add(moved.toolUseId);
      }
    }
    // Cost rides every result frame, cumulative across the run.
    if (mapping.cost !== undefined) {
      this.setFacts({ totalCost: mapping.cost });
    }
    // A subagent's turns belong to its branch, not to the main transcript.
    const branch = mapping.agentId ? this.branchOf(mapping.agentId) : undefined;
    const sink = branch ? branch.blocks : this.rows;

    // The turn's own thinking message is about to land: the measured start of
    // that block becomes its duration. One thinking message consumes it; more
    // than one in a frame shares no honest split.
    if (
      frame.type === "assistant" &&
      !mapping.agentId &&
      this.tail.thinkingSince !== null
    ) {
      const settled = mapping.blocks.filter(
        (block) => block.type === "thinking"
      );
      if (settled.length === 1 && settled[0].metadata) {
        settled[0].metadata.thinkingDurationMs = now - this.tail.thinkingSince;
      }
    }

    for (const block of mapping.blocks) {
      if (block.type === "system.init") {
        this.init(block);
        continue;
      }
      // A compaction just landed: the dock needs the fact and the size.
      if (block.type === "system.compact_boundary") {
        this.setFacts({
          lastCompaction: {
            at: now,
            preTokens: block.metadata?.preTokens ?? 0,
            trigger: block.metadata?.trigger === "manual" ? "manual" : "auto",
            // Read back from a harness that stores it: how it ended.
            ...(block.metadata?.compactResult
              ? {
                  result: block.metadata.compactResult,
                  error: block.metadata.compactError,
                }
              : {}),
          },
        });
      }
      // An id the SDK took but could not honour: what answers instead.
      if (block.type === "system.model_fallback") {
        this.setFacts({ model: block.metadata?.model ?? this.facts.model });
      }
      // The settle that precedes a relaunch ends the old turn with an error
      // result the reader asked for — a quiet note, not a red card.
      if (this.relaunching && block.type === "result.error") {
        this.append(branch, {
          ...block,
          type: "system.status",
          content: "Turn stopped to change the permission mode.",
          metadata: {},
        });
        continue;
      }
      // A real subagent's `task_notification` names a branch that already
      // exists — its completion is the branch card.
      if (
        suppressesTaskLine(
          this.branches,
          sink,
          block,
          mapping.branch?.toolUseId
        )
      ) {
        continue;
      }
      // The harness said the turn was cut short — its interrupt line, just
      // drawn — and the error result closing that turn is the line's receipt.
      if (
        block.type === "result.error" &&
        !mapping.agentId &&
        this.rows.at(-1)?.type === "ui.interrupted"
      ) {
        continue;
      }
      // A `result.error` in the shadow of an interrupt is the receipt of a
      // deliberate stop, not a failure: the quiet one-word line.
      if (
        block.type === "result.error" &&
        now - this.interruptedAt <= INTERRUPT_WINDOW_MS
      ) {
        block.type = "ui.interrupted";
        block.metadata = { ...block.metadata, noteTitle: "Interrupted" };
      }
      this.append(branch, block);
    }
    for (const result of mapping.toolResults) {
      this.foldResult(branch, result);
    }

    // The whole `/` menu again, pushed when what is on disk changed.
    if (mapping.commands) {
      const { commands } = mapping;
      this.setFacts({
        commands: {
          names: commands.map((command) => command.name),
          detailed: commands,
          skills: commands.some((command) => command.kind)
            ? commands
                .filter((command) => command.kind === "skill")
                .map((command) => command.name)
            : this.facts.commands.skills,
        },
      });
    }
    // `undefined` is "this frame said nothing about it"; `null` is the session
    // saying it stopped.
    if (mapping.status !== undefined) {
      this.setFacts({ sdkStatus: mapping.status });
    }
    if (mapping.compaction) {
      this.setFacts({
        lastCompaction: {
          at: now,
          preTokens: this.facts.lastCompaction?.preTokens ?? 0,
          trigger: this.facts.lastCompaction?.trigger ?? "auto",
          result: mapping.compaction.result,
          error: mapping.compaction.error,
        },
      });
    }

    if (mapping.currentTool && !mapping.agentId) {
      this.setTail({ currentTool: mapping.currentTool });
    }
    // What the partials say the model is writing right now.
    if (mapping.blockStart) {
      this.setTail({ openBlock: mapping.blockStart });
      // A fresh block of reasoning, not a continuation of the last one.
      if (mapping.blockStart === "thinking") {
        this.setTail({
          thinkingStream: "",
          thinkingClosing: false,
          thinkingSince: now,
        });
      }
    }
    if (mapping.thinkingDelta) {
      this.tail.thinkingStream += mapping.thinkingDelta;
      this.events.push({
        type: "tail.append",
        thinking: mapping.thinkingDelta,
      });
    }
    if (mapping.thinkingClosing) {
      this.setTail({ thinkingClosing: true });
    }
    if (mapping.blockStop) {
      this.setTail({ openBlock: null });
    }
    // The glance is empty until the full frame lands, so it never overwrites
    // one that already has the arguments in it.
    if (mapping.toolStarting && !this.tail.currentTool) {
      this.setTail({ currentTool: mapping.toolStarting });
    }
    // The turn's own messages are in the transcript, which is where the
    // reasoning is read from now.
    if (frame.type === "assistant" && !mapping.agentId) {
      this.clearTurnPhase();
    }
    const answered = this.tail.currentTool?.toolId;
    if (mapping.toolResults.some((result) => result.toolId === answered)) {
      this.setTail({ currentTool: null });
    }
    // A subagent's deltas feed its branch's buffer, not the main loop's.
    if (mapping.agentId) {
      const held = this.tail.streams[mapping.agentId] ?? "";
      if (mapping.delta) {
        this.tail.streams = {
          ...this.tail.streams,
          [mapping.agentId]: held + mapping.delta,
        };
        this.events.push({
          type: "tail.append",
          branch: { toolUseId: mapping.agentId, text: mapping.delta },
        });
      }
      if (mapping.clearsStream && this.tail.streams[mapping.agentId]) {
        const { [mapping.agentId]: _, ...rest } = this.tail.streams;
        this.setTail({ streams: rest });
      }
    } else {
      if (mapping.delta) {
        this.tail.streaming += mapping.delta;
        this.events.push({ type: "tail.append", streaming: mapping.delta });
      }
      if (mapping.clearsStream && this.tail.streaming) {
        this.setTail({ streaming: "" });
      }
    }
    if (mapping.failedTurn !== undefined) {
      this.setFacts({ lastTurnFailed: mapping.failedTurn });
    }
    if (mapping.endsTurn) {
      this.setTail({ busy: false, currentTool: null });
      this.setFacts({
        sdkStatus: null,
        turnsEnded: this.facts.turnsEnded + 1,
      });
      this.clearTurnPhase();
    } else if (
      mapping.delta ||
      mapping.currentTool ||
      // A turn that opens on a long reasoning block sends neither text nor a
      // tool call for minutes; the block itself is the evidence.
      mapping.blockStart ||
      mapping.thinkingDelta ||
      mapping.blocks.some(
        (block) => block.type === "assistant" || block.type === "thinking"
      )
    ) {
      // Frames are the evidence it is working, whoever sent the turn.
      this.setTail({ busy: true });
    }
    return this.flush();
  }

  /**
   * The hub's word on one send. Read, it takes its place where the word
   * arrives — after everything said so far, before whatever the model says
   * about it — unless a history read already found where it was stored. An
   * older word than the one in hand changes nothing.
   */
  applyRecord(record: SendRecord): TranscriptEvent[] {
    if (!newer(this.records[record.uuid], record)) {
      return [];
    }
    this.records = { ...this.records, [record.uuid]: record };
    this.events.push({ type: "send", record });
    if (record.state === "read" && !this.rowIds.has(record.uuid)) {
      this.rows.push(sendRef(this.instanceId, record.uuid));
      this.rowIds.add(record.uuid);
    }
    this.replace();
    return this.flush();
  }

  /** Ends the live tail without a frame: the process behind it is gone. */
  endTurn(): TranscriptEvent[] {
    this.setTail({ busy: false, currentTool: null });
    this.clearTurnPhase();
    return this.flush();
  }

  /* ---------------------------------------------------------- reading — */

  /**
   * A page of the main transcript, newest first: the `limit` blocks before
   * `before` (the newest when absent), widened back — by up to `limit` more —
   * to where a turn opens, so a page reads from the start of a turn and a run
   * of the reader's own turns is never split across two. With no turn opening
   * that near (one long agent turn), the page starts where the limit puts
   * it: tool results are folded into their calls, so no cut splits a pair.
   * The newest page carries the sends waiting, the tail and the facts too.
   * Undefined when `before` names no block this transcript holds.
   */
  page(
    limit: number,
    before?: string
  ): Omit<TranscriptPage, "where" | "seq"> | undefined {
    const end =
      before === undefined ? this.placed.length : this.indexOf(before);
    if (end < 0) {
      return undefined;
    }
    const start = this.pageStart(end, Math.max(1, limit));
    const blocks = this.placed.slice(start, end);
    const branches: TranscriptPageBranch[] = [];
    const listed = new Set<string>();
    for (const block of blocks) {
      const toolId = block.metadata?.toolId;
      const branch = toolId ? this.branches.get(toolId) : undefined;
      if (branch && !listed.has(branch.toolUseId)) {
        listed.add(branch.toolUseId);
        branches.push(branch);
      }
    }
    if (before === undefined) {
      // A branch no call on any page names still belongs to the session.
      const called = new Set(
        this.placed.flatMap((block) =>
          block.metadata?.toolId ? [block.metadata.toolId] : []
        )
      );
      for (const branch of this.branches.values()) {
        if (!(called.has(branch.toolUseId) || listed.has(branch.toolUseId))) {
          branches.push(branch);
        }
      }
      return {
        blocks,
        branches,
        cursor: start > 0 ? this.placed[start].id : null,
        queued: this.queued,
        tail: this.tail,
        facts: this.facts,
      };
    }
    return {
      blocks,
      branches,
      cursor: start > 0 ? this.placed[start].id : null,
    };
  }

  /** Every main-transcript block and branch: the whole transcript at once. */
  whole(): { blocks: TranscriptBlock[]; branches: TranscriptPageBranch[] } {
    return { blocks: this.placed, branches: [...this.branches.values()] };
  }

  /* --------------------------------------------------------- internals — */

  private indexOf(id: string): number {
    for (let i = this.placed.length - 1; i >= 0; i -= 1) {
      if (this.placed[i].id === id) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Where a page of `span` blocks ending before `end` begins: the nearest turn
   * opening at or before `end - span`, looking back at most `span` further,
   * or `end - span` itself when there is none that near.
   */
  private pageStart(end: number, span: number): number {
    const start = Math.max(0, end - span);
    for (let at = start; at >= Math.max(0, start - span); at -= 1) {
      if (at === 0 || this.opensPage(at)) {
        return at;
      }
    }
    return start;
  }

  /**
   * Whether a page may begin at `index`: a block that opens a turn — the
   * reader's words, or another session's, a rule's, a delegate's — and, when
   * it is the reader's, one whose nearest row before it that says anything
   * is not also theirs.
   */
  private opensPage(index: number): boolean {
    const block = this.placed[index];
    if (
      block.parentToolUseId ||
      !(block.type === "user" || block.type.startsWith("user."))
    ) {
      return false;
    }
    if (block.type !== "user") {
      return true;
    }
    for (let i = index - 1; i >= 0; i -= 1) {
      const prior = this.placed[i];
      const silent =
        (prior.type === "assistant" || prior.type === "thinking") &&
        !prior.content.trim();
      if (!(silent || prior.type === "result.success")) {
        return prior.type !== "user";
      }
    }
    return true;
  }

  private branchOf(toolUseId: string): BranchState {
    const known = this.branches.has(toolUseId);
    const branch = branchFor(
      this.branches,
      this.instanceId,
      toolUseId,
      this.stamp()
    );
    if (!known) {
      this.movedBranches.add(toolUseId);
    }
    return branch;
  }

  /** The newest `init`: the session's own word on itself, never a row. */
  private init(block: TranscriptBlock): void {
    const meta = block.metadata;
    this.relaunching = false;
    this.setFacts({
      sessionId: meta?.sessionId ?? this.facts.sessionId,
      // Re-emitted every turn and the session's own word on both settings.
      model: meta?.model ?? this.facts.model,
      permissionMode: meta?.permissionMode ?? this.facts.permissionMode,
      commands: {
        ...this.facts.commands,
        names: meta?.slashCommands ?? this.facts.commands.names,
        skills: meta?.skills ?? this.facts.commands.skills,
      },
      tooling: meta?.tooling ?? this.facts.tooling,
      initialized: true,
      inits: this.facts.inits + 1,
    });
  }

  /** A block onto the end of its transcript: a branch's, or the main one. */
  private append(
    branch: BranchState | undefined,
    block: TranscriptBlock
  ): void {
    if (branch) {
      if (holdOnce(branch.blocks, block)) {
        this.events.push({ type: "block.append", block });
      }
      return;
    }
    // A row already there — a frame replayed behind a history read — is not
    // said twice.
    if (this.rowIds.has(block.id)) {
      return;
    }
    this.rows.push(block);
    this.rowIds.add(block.id);
    if (this.floats()) {
      this.replace();
    } else {
      this.placed.push(block);
      this.events.push({ type: "block.append", block });
    }
  }

  /**
   * A tool result into the call it answers, as a new block under the same id:
   * a block once served is never changed in place.
   */
  private foldResult(
    branch: BranchState | undefined,
    result: ToolResult
  ): void {
    const sink = branch ? branch.blocks : this.rows;
    if (result.launch && spawnsSubagent(sink, result.toolId)) {
      const started = applyBranchEvent(
        this.branches,
        this.instanceId,
        { toolUseId: result.toolId, status: "running" },
        this.stamp()
      );
      if (started) {
        this.movedBranches.add(started.toolUseId);
      }
      return;
    }
    const at = sink.findLastIndex(
      (block) =>
        (block.type === "tool.use" || block.type === "tool.handoff") &&
        block.metadata?.toolId === result.toolId
    );
    if (at >= 0) {
      const held = sink[at];
      const next = { ...held };
      applyToolResult([next], result);
      sink[at] = next;
      if (!branch) {
        const shown = this.placed.lastIndexOf(held);
        if (shown >= 0) {
          this.placed[shown] = next;
        }
      }
      this.events.push({ type: "block.update", block: next });
    }
    // The Task call's own result is the authoritative end of its branch, and
    // carries its full report.
    const spawned = this.branches.get(result.toolId);
    if (!spawned) {
      return;
    }
    spawned.status = result.isError ? "error" : "complete";
    spawned.completedAt ??= this.stamp();
    if (result.isError) {
      spawned.error = result.result;
    } else {
      spawned.result = result.result;
    }
    this.movedBranches.add(spawned.toolUseId);
  }

  /** Whether a failed send that was never stored is placed by what is around it. */
  private floats(): boolean {
    for (const record of Object.values(this.records)) {
      if (record.state === "failed" && !this.rowIds.has(record.uuid)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Every send in its place again, and the difference from what was served
   * as events: the rows kept in order stay, the rest leave and come back
   * after the block before them.
   */
  private replace(): void {
    const { blocks: next, queued } = placeSends(this.rows, this.records);
    const before = this.placed;
    const position = new Map(next.map((block, i) => [block.id, i]));
    const order = before.flatMap((block) => {
      const at = position.get(block.id);
      return at === undefined ? [] : [at];
    });
    const kept = risingRun(order);
    const keptIds = new Set([...kept].map((i) => next[i].id));
    for (const block of before) {
      if (!keptIds.has(block.id)) {
        this.events.push({ type: "block.remove", id: block.id });
      }
    }
    const held = new Map(before.map((block) => [block.id, block]));
    next.forEach((block, i) => {
      if (!keptIds.has(block.id)) {
        this.events.push({
          type: "block.insert",
          block,
          after: i > 0 ? next[i - 1].id : null,
        });
        return;
      }
      const was = held.get(block.id);
      if (was !== block && JSON.stringify(was) !== JSON.stringify(block)) {
        this.events.push({ type: "block.update", block });
      }
    });
    this.placed = next;
    const queue = JSON.stringify(queued);
    if (queue !== JSON.stringify(this.queued)) {
      this.events.push({ type: "queue", blocks: queued });
    }
    this.queued = queued;
  }

  private clearTurnPhase(): void {
    this.setTail({
      openBlock: null,
      thinkingStream: "",
      thinkingClosing: false,
      thinkingSince: null,
    });
  }

  private setTail(patch: Partial<TranscriptTail>): void {
    for (const [key, value] of Object.entries(patch) as [
      keyof TranscriptTail,
      unknown,
    ][]) {
      if (this.tail[key] !== value) {
        (this.tail as unknown as Record<string, unknown>)[key] = value;
        (this.tailPatch as Record<string, unknown>)[key] = value;
      }
    }
  }

  private setFacts(patch: Partial<TranscriptFacts>): void {
    for (const [key, value] of Object.entries(patch) as [
      keyof TranscriptFacts,
      unknown,
    ][]) {
      if (JSON.stringify(this.facts[key]) !== JSON.stringify(value)) {
        (this.facts as unknown as Record<string, unknown>)[key] = value;
        (this.factsPatch as Record<string, unknown>)[key] = value;
      }
    }
  }

  /** The change built since the last flush, in order, and a clean slate. */
  private flush(): TranscriptEvent[] {
    const { events } = this;
    for (const toolUseId of this.movedBranches) {
      const branch = this.branches.get(toolUseId);
      if (branch) {
        events.push({ type: "branch", branch: { ...branchState(branch) } });
      }
    }
    if (Object.keys(this.tailPatch).length > 0) {
      events.push({ type: "tail", tail: this.tailPatch });
    }
    if (Object.keys(this.factsPatch).length > 0) {
      events.push({ type: "facts", facts: this.factsPatch });
    }
    this.events = [];
    this.tailPatch = {};
    this.factsPatch = {};
    this.movedBranches = new Set();
    return events;
  }
}
