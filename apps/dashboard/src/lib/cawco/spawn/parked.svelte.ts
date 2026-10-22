/**
 * The starts the New Session form has handed the hub, kept by this tab until
 * the reader has seen how each ended (DESIGN.md, The Work Outlives Its Surface
 * Rule). A start belongs to its work, not to the form: ×, Esc or a press
 * outside close the form and the start goes on here, drawn as its own row in
 * the home (StartingRows) with its stage while it runs, then what it came to.
 * One press on the row opens the form on it again, at the same step: the
 * same picks and prompt, and the start as it stands now. Only the form's own
 * Cancel ends one (a continuation's, before its session has started).
 *
 * Each start is kept in the tab's own storage, its prompt and what rode it
 * in the draft store (`new-session:park:<id>`), so a reload keeps it. A start
 * the hub runs as a job (a continuation) is followed again by its id. One this
 * page asks for itself (a spawn) mints its sessions' ids before it asks, so a
 * reload that lands while the hub answers finds them on the board and sends
 * the first prompt that never went; one the board never lists, or one whose
 * answer the reload lost, is said as failed in the error formula (WORDS.md),
 * with Reopen.
 */
import type { ContinuationJob } from "@cawco/core";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { cawco, followContinuations, sendFirstPrompt } from "../client.svelte";
import {
  type ContinueSource,
  continuationRunning,
  continuationStageWords,
  continuing,
  type SessionDraft,
} from "../continue.svelte";
import { type DraftContent, loadDraft, saveDraft } from "../draft-store";
import { readJson, writeJson } from "../storage";
import { ComposerDraft } from "../transcript/composer-draft.svelte";
import { type SpawnPrefill, spawning } from "./new-session.svelte";

/** One session a spawn asks for: its id, minted first, and how far its ask came. */
export interface ParkedAsk {
  /** The spawn went to the hub. */
  asked: boolean;
  instanceId: string;
  machineId: string;
  /** Its first prompt went (or it had none). */
  sent: boolean;
}

export interface ParkedStart {
  /** When its ask left for the hub (ms since the epoch); 0 before it did. */
  askedAt: number;
  /** Its sessions, by machine: a spawn's alone (a fork, a move and a continuation are the hub's to name). */
  asks: ParkedAsk[];
  /** The session it continues: the form opens continuing it. */
  continueFrom?: ContinueSource;
  /** The picks and prompt it was started with: the form opens on them again. */
  draft: SessionDraft;
  /** Why it did not start, in the error formula; "" unless failed. */
  error: string;
  id: string;
  /** The hub's job, for a continuation. */
  job?: string;
  /** What the form was opened with (its machine, folder, project, a fork). */
  prefill?: SpawnPrefill;
  /** What it is doing now, while it runs. */
  stage: string;
  state: "running" | "failed" | "started";
  /** The session it started, to open. */
  target?: string;
  /** The row's name: the prompt's first words, or what it starts. */
  title: string;
}

/** Where the tab keeps its parked starts. */
const KEY = "cawco:parked-starts";

/** The draft store's key for a parked start's prompt. */
export const parkKey = (id: string): string => `new-session:park:${id}`;

/** What a kept start holds in the tab's storage: its prompt's extras live in the draft store. */
const kept = (start: ParkedStart): ParkedStart => {
  const { prefill, ...rest } = $state.snapshot(start) as ParkedStart;
  const plain: ParkedStart = {
    ...rest,
    draft: { ...rest.draft, extras: {} },
  };
  if (prefill) {
    // A refused send picked up rides in the draft, not here.
    const { prompt: _prompt, ...where } = prefill;
    plain.prefill = where;
  }
  return plain;
};

/** The starts this page runs itself: the rest, read back after a reload, are recovered. */
const running = new Set<string>();

export const parked = $state<{ list: ParkedStart[] }>({
  list: readJson<ParkedStart[]>(KEY, [], "session"),
});

// The form was showing a start the tab no longer keeps: it opens on none.
if (spawning.shown && !parked.list.some((one) => one.id === spawning.shown)) {
  spawning.shown = null;
}

$effect.root(() => {
  $effect(() => {
    writeJson(KEY, parked.list.map(kept), "session");
  });
});

/** The parked start `id`, as the store holds it (reactive). */
export function parkedStart(id: string | null): ParkedStart | undefined {
  return id ? parked.list.find((one) => one.id === id) : undefined;
}

/**
 * The form is open, and on the start it shows: that start's row stands
 * aside while it does, so the screen never shows the start twice.
 */
export function shownStart(): string | null {
  const open = spawning.open || continuing.source !== null;
  return open ? spawning.shown : null;
}

/** The row's name for a start: its prompt's first line, or what it starts. */
function titleOf(draft: SessionDraft, continueFrom?: ContinueSource): string {
  const first = draft.prompt.trim().split("\n")[0]?.trim() ?? "";
  if (first) {
    return first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
  }
  return continueFrom ? `Continue ${continueFrom.title}` : "New session";
}

/**
 * Parks a start as it begins, in place of `replacing` (the failed start the
 * form was showing, started again): it runs in this page from here
 * (`running`), and its prompt is kept in the draft store.
 */
export function beginStart(options: {
  content: DraftContent;
  continueFrom?: ContinueSource;
  draft: SessionDraft;
  id: string;
  prefill?: SpawnPrefill;
  replacing: string | null;
  stage: string;
}): ParkedStart {
  const { content, continueFrom, draft, id, prefill, replacing, stage } =
    options;
  if (replacing) {
    dropStart(replacing);
  }
  running.add(id);
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the prompt is kept in the draft store for a reload; refused, it is simply not kept
  void saveDraft(parkKey(id), content).catch(() => undefined);
  parked.list.push({
    id,
    ...(continueFrom ? { continueFrom } : {}),
    ...(prefill ? { prefill } : {}),
    draft,
    title: titleOf(draft, continueFrom),
    state: "running",
    stage,
    error: "",
    asks: [],
    askedAt: 0,
  });
  return parked.list.at(-1) as ParkedStart;
}

/** What `id` is doing now, while it runs. */
export function stageStart(id: string, stage: string): void {
  const start = parkedStart(id);
  if (start?.state === "running") {
    start.stage = stage;
  }
}

/** The sessions a spawn will ask for, minted before it asks. */
export function planAsks(id: string, asks: ParkedAsk[]): void {
  const start = parkedStart(id);
  if (start) {
    start.asks = asks;
  }
}

/**
 * `id`'s ask is on its way to the hub: a session's spawn when `instanceId`
 * names it, else a fork, a move or a continuation, whose answer names it.
 */
export function askedFor(id: string, instanceId?: string): void {
  const start = parkedStart(id);
  if (!start) {
    return;
  }
  start.askedAt ||= Date.now();
  const ask = start.asks.find((one) => one.instanceId === instanceId);
  if (ask) {
    ask.asked = true;
  }
}

/** The hub took a session's spawn, and its first prompt went with it. */
export function sentTo(id: string, instanceId: string): void {
  const ask = parkedStart(id)?.asks.find(
    (one) => one.instanceId === instanceId
  );
  if (ask) {
    ask.sent = true;
  }
}

/** A continuation's job, once the hub has named it: followed from here. */
export function followJob(id: string, job: string): void {
  const start = parkedStart(id);
  if (start) {
    start.job = job;
    start.askedAt ||= Date.now();
    settleJobs(cawco.continuations);
  }
}

/** `id` did not start: why, in the error formula, until the reader acts on it. */
export function failStart(id: string, error: string): void {
  running.delete(id);
  const start = parkedStart(id);
  if (start && start.state !== "started") {
    start.state = "failed";
    start.error = error;
    start.stage = "";
  }
}

/** `id` started `target`: the form opens it, or its row says so until pressed. */
export function startedStart(id: string, target: string): void {
  running.delete(id);
  const start = parkedStart(id);
  if (start) {
    start.state = "started";
    start.target = target;
    start.stage = "";
    start.error = "";
  }
}

/**
 * The reader is done with `id` (opened what it started, dismissed its
 * outcome, cancelled it): it goes, its prompt with it.
 */
export function dropStart(id: string): void {
  running.delete(id);
  const at = parked.list.findIndex((one) => one.id === id);
  if (at !== -1) {
    parked.list.splice(at, 1);
  }
  // biome-ignore lint/complexity/noVoid: fire-and-forget — an empty draft deletes its record
  void saveDraft(parkKey(id), {
    text: "",
    images: [],
    texts: [],
    files: [],
    canvas: null,
  }).catch(() => undefined);
}

/** The picks and prompt the reader left the form on, on a failed start: kept for its Reopen. */
export function keepDraftOf(id: string, draft: SessionDraft): void {
  const start = parkedStart(id);
  if (start && start.state === "failed") {
    start.draft = draft;
  }
}

/**
 * Opens the form on `id` again, hanging from `anchor` (its row): the same
 * step, the same picks and prompt, the start as it stands now.
 */
export function reopenStart(id: string, anchor: HTMLElement | null): void {
  const start = parkedStart(id);
  if (!start) {
    return;
  }
  spawning.shown = id;
  spawning.anchor = anchor;
  spawning.opening += 1;
  if (start.continueFrom) {
    continuing.source = start.continueFrom;
    return;
  }
  spawning.prefill = start.prefill;
  spawning.open = true;
}

/** What a continuation's failure says, in the hub's words. */
const continueFailure = (error: string | undefined): string =>
  error
    ? `Couldn't continue: ${error}`
    : "Couldn't continue. Open it to start it again.";

/** The continuation table has been read since this page loaded. */
let tableRead = false;

/** Every parked continuation, as the hub's table has it now. */
function settleJobs(table: ContinuationJob[]): void {
  for (const start of parked.list) {
    if (!start.job || start.state !== "running") {
      continue;
    }
    const job = table.find((row) => row.id === start.job);
    if (!job) {
      // Gone from a table read since the reload: how it ended is not known.
      if (tableRead && !running.has(start.id)) {
        failStart(
          start.id,
          "The continuation isn't on the hub any more, so how it ended isn't known. Check the session it continued, then continue it again if no new session started."
        );
      }
      continue;
    }
    if (continuationRunning(job.stage)) {
      start.stage = continuationStageWords[job.stage];
    } else if (job.stage === "started") {
      startedStart(start.id, job.targetInstanceId);
    } else if (job.stage === "failed") {
      failStart(start.id, continueFailure(job.error));
    } else if (job.stage === "cancelled") {
      dropStart(start.id);
    }
  }
}

followContinuations((table) => {
  tableRead = true;
  settleJobs(table);
});

/** Nothing was asked of the hub before the reload: nothing started. */
const NOTHING_ASKED =
  "Nothing started: the page reloaded before the session was asked for. Open it and start it again; your prompt and picks are kept.";
/** The ask went, and its answer was the reload's to lose. */
const NOT_KNOWN =
  "Whether it started isn't known: the page reloaded before the hub answered. Check your sessions, then open it and start it again if it isn't there.";
/** The ask went, and the board never listed the session. */
const NOT_LISTED =
  "The session didn't start: the page reloaded before the hub answered, and the board never listed it. Open it and start it again; your prompt and picks are kept.";

/** A first prompt that never went, sent from the prompt the draft store kept. */
async function sendKept(start: ParkedStart, ask: ParkedAsk): Promise<void> {
  const content = await loadDraft(parkKey(start.id)).catch(() => null);
  const draft = new ComposerDraft();
  if (content) {
    draft.fill(content);
  }
  sendFirstPrompt(
    ask.instanceId,
    ask.machineId,
    draft.text || start.draft.prompt,
    draft.extras()
  );
}

/** Ticks while a recovered spawn waits on the board, so its deadline is read again. */
let tick = $state(0);

/**
 * A start this page no longer runs (read back after a reload) and the hub
 * did not run as a job: it is found on the board by the ids it minted, or
 * said as failed once the hub's own answer could have come.
 */
function recover(start: ParkedStart): void {
  if (start.job) {
    return;
  }
  const asked = start.asks.filter((ask) => ask.asked);
  if (asked.length === 0) {
    failStart(start.id, start.askedAt ? NOT_KNOWN : NOTHING_ASKED);
    return;
  }
  if (!cawco.fleetRead) {
    return;
  }
  const listed = asked.filter((ask) =>
    cawco.instanceIndex.byId.has(ask.instanceId)
  );
  for (const ask of listed) {
    if (!ask.sent) {
      ask.sent = true;
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the send says itself in the new session's transcript
      void sendKept(start, ask);
    }
  }
  if (listed.length === asked.length) {
    const [first] = listed;
    if (asked.length === start.asks.length && first) {
      startedStart(start.id, first.instanceId);
    } else if (first) {
      start.target = first.instanceId;
      failStart(
        start.id,
        `${listed.length} of ${start.asks.length} sessions started: the page reloaded before the rest were asked for. Open it and start the rest again.`
      );
    }
    return;
  }
  const deadline = start.askedAt + CONTROL_TIMEOUT_MS;
  if (Date.now() >= deadline) {
    failStart(start.id, NOT_LISTED);
    return;
  }
  setTimeout(
    () => {
      tick += 1;
    },
    deadline - Date.now() + 50
  );
}

$effect.root(() => {
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — a deadline passing reads the board again
    void tick;
    for (const start of parked.list) {
      if (start.state === "running" && !running.has(start.id)) {
        recover(start);
      }
    }
  });
});
