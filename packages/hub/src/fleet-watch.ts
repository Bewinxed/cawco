/**
 * Fleet watch (Projects spec §5.3, D5, P5): replaces the LLM supervisor, the
 * per-session autopilot and the assistant panel. The invariant: a looping
 * session raises exactly one triage run and one nudge, and an idle fleet
 * spends nothing. No model or Jev call happens without a code signal.
 *
 * - **Detectors** read each session's stream as it arrives, in code, no
 *   model ({@link FLEET_WATCH_LIMITS}): the same tool error three times in
 *   its recent turns; finished turns in a row that changed no file; the same
 *   tool call three times in a row; and, from its process and turn state
 *   rather than its transcript, a turn running with nothing streamed for ten
 *   minutes while its process lives and nothing is asked of you. One open
 *   signal per session per kind. A file change closes every transcript
 *   signal; a different call closes `repeat`; a turn that ends cleanly
 *   closes `error`; any output or the turn's end closes `stall`.
 * - **Episodes.** A session's first open signal starts an episode; it ends
 *   when every signal is closed (the session made progress). Each episode
 *   gets at most one triage, and one Jev question per signal kind.
 * - **The gate.** Jev on (it has a route, jev.ts `jevAccess`: a TypeSafe
 *   key the hub holds, else OpenRouter): the first signal of each
 *   kind asks Jev one yes/no question about the fresh transcript slice since
 *   the last question; only a yes starts triage. A no is noted, and asked
 *   again only when a new kind opens. Jev failing says so in the session's
 *   transcript and hands the question to no session (§2). Jev off: triage
 *   starts when a second, different kind is open.
 * - **Triage** is a fresh session in the `overseer` role (roles.ts), briefed
 *   with the signals, the slice, the session's work and its lead. It decides
 *   once with `triage_decide` (nudge the lead, interrupt, stop, tell you, or
 *   leave it), then the hub ends it. It never reaches the watched session's
 *   model: a session never judges itself, its lead does. Its lead is its
 *   parent session, or the project's Caw when its parent is Caw or it has
 *   none in the project; outside any project with no parent, you.
 * - **Caw off.** With the project's lead off nothing wakes a model: the
 *   detectors run, Jev and triage do not, and a second open kind becomes a
 *   needs-you notice.
 * - **Visible.** Each decision is a line in the watched session's transcript
 *   and in its lead's (core `FLEET_WATCH`); a nudge is the lead's line itself.
 *
 * Carried from the supervisor (2fd0db71, ebf65cdb): frames are never
 * blocked (detectors are synchronous and cheap, no db read on a stream
 * delta, every model call off the frame path) and nothing here throws into
 * it; at most {@link TRIAGE_MAX_RUNNING} triage runs at once, the rest
 * queued (its two-call semaphore, so a fleet of looping sessions is not a
 * fleet of triage sessions); one Jev question in flight per session; a
 * decision that lands after the session moved on is recorded and not acted
 * on (its stale-verdict skip); and nothing here answers a permission.
 */
import {
  decisionWords,
  type Envelope,
  FLEET_WATCH_LIMITS,
  type FleetWatchNotice,
  type FleetWatchSignal,
  fleetWatchNudge,
  type InstanceRow,
  type NeutralMessage,
  type SendPayload,
  type SpawnPayload,
  signalLine,
  TRIAGE_DECISIONS,
  type TriageDecision,
} from "@cawco/core";
import { Gone, readWithin } from "@cawco/core/bounded";
import { z } from "zod";
import { tool } from "./admin-tools";
import { CAW_HARNESSES, type CawEvent } from "./caw";
import type { DbShape } from "./db";
import { askJev, type JevAccess, jevAccess, jevUnanswered } from "./jev";
import type { HubLifetimeShape } from "./lifetime";
import { MEANING_THRESHOLD } from "./meaning";

/** Triage runs at once, fleet-wide; the rest wait their turn. */
const TRIAGE_MAX_RUNNING = 2;
/** A triage run that has not ended its turn by then is ended and its slot freed. */
const TRIAGE_DEADLINE_MS = 10 * 60_000;
/** How often running turns are looked at for a stall. */
const STALL_SWEEP_MS = 60_000;
/** Jev answers inside a minute or the question is over. */
const JEV_TIMEOUT_MS = 60_000;
/** The slice Jev and triage read, as meaning.ts bounds its text: the tail. */
const SLICE_LIMIT = 60_000;
/** What one call or error adds to the slice, at most. */
const ENTRY_LIMIT = 400;
/** What one message adds to the slice, at most. */
const SAID_LIMIT = 1600;
/** An error's normalised text, compared at this length. */
const ERROR_KEY_LIMIT = 300;
/** A task's brief, as triage reads it. */
const BRIEF_LIMIT = 4000;
/** The origin of what fleet watch sends: never a person's word. */
const ORIGIN = { kind: "system", name: "fleet-watch" } as const;

/** Tools that change files, by harness name, lowercased: Claude's, OpenCode's, pi's. */
const FILE_TOOLS: ReadonlySet<string> = new Set([
  "edit",
  "write",
  "multiedit",
  "notebookedit",
  "patch",
  "apply_patch",
]);

const DIGITS = /\d+/g;
const HEX = /\b[0-9a-f]{8,}\b/g;
const SPACE = /\s+/g;

/** An error's words with what changes between runs (numbers, ids, spacing) folded. */
const errorKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(HEX, "#")
    .replace(DIGITS, "#")
    .replace(SPACE, " ")
    .trim()
    .slice(0, ERROR_KEY_LIMIT);

/** A JSON value with its keys in order, so one call written twice reads the same. */
const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return value === undefined ? "" : JSON.stringify(value);
};

/** A call's identity: its name and its input, the model's own `description` left out. */
const callKey = (name: string, input: Record<string, unknown>): string => {
  const { description: _said, ...rest } = input;
  return `${name} ${stable(rest).replace(SPACE, " ")}`;
};

/** A tool result's words, whatever shape the harness gave them. */
const resultText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : ""
      )
      .join("\n");
  }
  return content === undefined ? "" : JSON.stringify(content);
};

const clip = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

/** Who a watched session's lead is. */
type Lead =
  | { kind: "session"; id: string; name: string }
  | { kind: "caw"; projectId: string; leadId: string | null; name: "Caw" }
  | { kind: "you"; name: "you" };

interface Episode {
  /** Kinds Jev was asked about in this episode, or noted after its no. */
  asked: Set<FleetWatchSignal>;
  id: string;
  jevInFlight: boolean;
  /** Triage started, or a notice raised: this episode gets nothing more. */
  settled: boolean;
}

interface Watch {
  /** Its turn runs now, as its last pulse said. */
  busy: boolean;
  changedThisTurn: boolean;
  episode?: Episode;
  /** Normalised tool errors with the turn each came in. */
  errors: { key: string; turn: number }[];
  errorThisTurn: boolean;
  /** The last tool call and how many times in a row it was made. */
  last?: { count: number; key: string };
  /** ms epoch of the last frame the session streamed. */
  lastOutputAt: number;
  /** Open signals, by kind, with their line. */
  open: Map<FleetWatchSignal, string>;
  /** Finished turns in a row that changed no file. */
  quietTurns: number;
  /** What it did since Jev or triage last looked, oldest first. */
  slice: string[];
  sliceLength: number;
  /** Finished turns, counted here. */
  turn: number;
}

interface Triage {
  decided?: TriageDecision;
  /** Its turn ended: the run answered, decided or not. */
  ended: () => void;
  episode: string;
  /** Its session is gone (forgotten, or never started): it will not answer. */
  gone: () => void;
  id: string;
  lead: Lead;
  lines: string[];
  watched: string;
}

/** A watched session waiting for a triage slot, with what Jev read when it said yes. */
interface Queued {
  episode: string;
  seen: string;
  watched: string;
}

export interface FleetWatchDeps {
  /** Whether the session has an ask parked on you now. */
  asking: (instanceId: string) => boolean;
  db: Pick<
    DbShape,
    | "dropWatchNotice"
    | "fleetWatchOn"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "listedInstancesByIds"
    | "project"
    | "putWatchNotice"
    | "watchNotices"
    | "workItem"
  >;
  /** Ends a session (a triage run that decided, or ran out of time). */
  end: (instanceId: string) => void;
  /** Cuts a session's turn; it keeps its state. */
  interrupt: (instanceId: string) => void;
  lifetime: HubLifetimeShape;
  /** Writes a fleet-watch line into a session's transcript: kept, and drawn. */
  line: (instanceId: string, content: string) => void;
  /** A session as the rail names it. */
  name: (row: InstanceRow) => string;
  /** Every open notice, to every dashboard. */
  notices: (all: FleetWatchNotice[]) => void;
  /** Whether a machine is connected. */
  online: (machineId: string) => boolean;
  /** A notice to the person's phone. */
  push: (notice: FleetWatchNotice) => void;
  /** Delivers one message to a session through the hub's one send path. */
  send: (envelope: Envelope<SendPayload>) => void;
  /** Starts a session, resolved once its machine has it. */
  spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /** Stops a session's process. */
  stop: (instanceId: string) => void;
  /** Wakes a project's Caw with an event (caw.ts `wake`); false when he is off. */
  wakeCaw: (projectId: string, event: CawEvent) => Promise<boolean>;
}

export const createFleetWatch = (deps: FleetWatchDeps) => {
  const { db } = deps;
  /** The fleet's switch, read once and kept in step by {@link switched}. */
  let on = db.fleetWatchOn();
  const watches = new Map<string, Watch>();
  /** Sessions fleet watch never reads (its own triage runs, workflow steps), decided once. */
  const ignored = new Set<string>();
  /** Triage runs by their own session id. */
  const running = new Map<string, Triage>();
  const queue: Queued[] = [];

  const rowOf = (id: string): InstanceRow | undefined =>
    db.listedInstancesByIds([id])[0] as InstanceRow | undefined;

  const log = (row: InstanceRow | undefined, id: string, words: string) =>
    console.log(`[fleet-watch] ${row ? deps.name(row) : id}: ${words}`);

  /** The watch of a session fleet watch reads, made on its first frame; undefined for one it never reads. */
  const watchOf = (id: string): Watch | undefined => {
    const found = watches.get(id);
    if (found || ignored.has(id)) {
      return found;
    }
    const row = rowOf(id);
    if (!row) {
      return;
    }
    // Its own triage runs, and a workflow step (its run supervises it).
    if (row.role === "overseer" || row.workflowStepId) {
      ignored.add(id);
      return;
    }
    const made: Watch = {
      busy: false,
      changedThisTurn: false,
      errors: [],
      errorThisTurn: false,
      lastOutputAt: Date.now(),
      open: new Map(),
      quietTurns: 0,
      slice: [],
      sliceLength: 0,
      turn: 0,
    };
    watches.set(id, made);
    return made;
  };

  const note = (watch: Watch, entry: string): void => {
    watch.slice.push(entry);
    watch.sliceLength += entry.length + 1;
    while (watch.sliceLength > SLICE_LIMIT && watch.slice.length > 1) {
      watch.sliceLength -= (watch.slice.shift() ?? "").length + 1;
    }
  };

  /** What it did since the last look, and the slate wiped for the next. */
  const takeSlice = (watch: Watch): string => {
    const text = watch.slice.join("\n").slice(-SLICE_LIMIT);
    watch.slice = [];
    watch.sliceLength = 0;
    return text;
  };

  const lines = (watch: Watch): string[] => [...watch.open.values()];

  /** What the open signals say, as one line. */
  const together = (watch: Watch): string => lines(watch).join(" · ");

  // --- notices ---------------------------------------------------------------

  const publishNotices = () => deps.notices(db.watchNotices());

  const raiseNotice = (row: InstanceRow, title: string, body: string) => {
    const notice: FleetWatchNotice = {
      id: crypto.randomUUID(),
      instanceId: row.id,
      machineId: row.machineId,
      projectId: row.projectId ?? null,
      title,
      body,
      at: Date.now(),
    };
    db.putWatchNotice(notice);
    publishNotices();
    deps.push(notice);
    log(row, row.id, `told you: ${title}`);
  };

  const dropNotice = (instanceId: string) => {
    if (db.dropWatchNotice(instanceId)) {
      publishNotices();
    }
  };

  // --- leads -------------------------------------------------------------------

  /** Its parent, else the project's Caw when the parent is Caw or it has none in the project, else you. */
  const leadOf = (row: InstanceRow): Lead => {
    // Caw himself: a session never judges itself, so his lead is you.
    if (row.role === "lead") {
      return { kind: "you", name: "you" };
    }
    const project = row.projectId ? db.project(row.projectId) : undefined;
    const caw: Lead | undefined = project
      ? {
          kind: "caw",
          projectId: project.id,
          leadId: project.leadInstanceId,
          name: "Caw",
        }
      : undefined;
    const parent = row.parentInstanceId
      ? rowOf(row.parentInstanceId)
      : undefined;
    if (parent && parent.status !== "discarded") {
      if (parent.role === "lead" && caw) {
        return caw;
      }
      return { kind: "session", id: parent.id, name: deps.name(parent) };
    }
    return caw ?? { kind: "you", name: "you" };
  };

  /** The lead's session, for its line: its parent, or Caw's session. */
  const leadSession = (lead: Lead): string | null => {
    if (lead.kind === "session") {
      return lead.id;
    }
    return lead.kind === "caw" ? lead.leadId : null;
  };

  // --- signals and episodes ----------------------------------------------------

  const openSignal = (
    id: string,
    watch: Watch,
    kind: FleetWatchSignal,
    line: string
  ) => {
    if (watch.open.has(kind)) {
      return;
    }
    watch.open.set(kind, line);
    watch.episode ??= {
      id: crypto.randomUUID(),
      asked: new Set(),
      jevInFlight: false,
      settled: false,
    };
    const row = rowOf(id);
    log(row, id, `signal: ${line}`);
    if (row) {
      consider(row, watch);
    }
  };

  const closeSignals = (
    id: string,
    watch: Watch,
    kinds: readonly FleetWatchSignal[]
  ) => {
    let closed = false;
    for (const kind of kinds) {
      closed = watch.open.delete(kind) || closed;
    }
    if (closed && watch.open.size === 0 && watch.episode) {
      // Progress: the episode is over, and a notice about it with it.
      watch.episode = undefined;
      dropNotice(id);
      log(rowOf(id), id, "moved on");
    }
  };

  /** The next step for an episode, by the project's Caw, Jev and how many kinds are open. */
  const consider = (row: InstanceRow, watch: Watch): void => {
    const { episode } = watch;
    if (!episode || episode.settled || episode.jevInFlight) {
      return;
    }
    const project = row.projectId ? db.project(row.projectId) : undefined;
    if (project && !project.caw) {
      if (watch.open.size >= 2) {
        episode.settled = true;
        const title = together(watch);
        deps.line(row.id, `${title} · ${decisionWords("tell")}`);
        raiseNotice(
          row,
          title,
          `Caw is off in ${project.name}, so fleet watch woke no model. Look at the session, or turn Caw on so triage decides next time.`
        );
      }
      return;
    }
    const access = jevAccess(db);
    if (!access) {
      if (watch.open.size >= 2) {
        startTriage(row, watch, episode, takeSlice(watch));
      }
      return;
    }
    if ([...watch.open.keys()].some((kind) => !episode.asked.has(kind))) {
      askGate(row, watch, episode, access);
    }
  };

  /** One yes/no question to Jev over the fresh slice; only a yes starts triage. */
  const askGate = (
    row: InstanceRow,
    watch: Watch,
    episode: Episode,
    access: JevAccess
  ): void => {
    for (const kind of watch.open.keys()) {
      episode.asked.add(kind);
    }
    episode.jevInFlight = true;
    const signals = together(watch);
    const seen = takeSlice(watch);
    log(row, row.id, `asked Jev about: ${signals}`);
    askJev(
      access,
      {
        signals,
        session_work: workOf(row),
        transcript_slice: seen || "(nothing since the last look)",
      },
      {
        stuck: {
          type: "noul",
          instructions:
            "Is the session in `transcript_slice` stuck, looping or off-task against `session_work`, rather than making progress on it? `signals` is what code noticed.",
        },
      },
      { timeoutMs: JEV_TIMEOUT_MS }
    )
      .then((asking) => {
        episode.jevInFlight = false;
        switch (asking.kind) {
          case "answered":
            break;
          case "unanswered": {
            const words = jevUnanswered(asking.after);
            log(row, row.id, words);
            // Not answered is not a no: it says so, and starts no triage (§2).
            deps.line(row.id, `${signals} · ${words}, so no triage ran`);
            return;
          }
          default: {
            const unhandled: never = asking;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
        const result = asking.value;
        const { noul } = result.answers.stuck;
        const yes = noul >= MEANING_THRESHOLD;
        log(
          row,
          row.id,
          `Jev answered ${yes ? "yes" : "no"} (noul ${noul}, $${result.usage.costUsd})`
        );
        if (watch.episode !== episode || episode.settled) {
          return;
        }
        if (yes) {
          startTriage(row, watch, episode, seen);
          return;
        }
        // A no is noted; a kind that opened meanwhile is asked about now.
        consider(row, watch);
      })
      .catch((error: unknown) => {
        episode.jevInFlight = false;
        const words = error instanceof Error ? error.message : String(error);
        log(row, row.id, `Jev failed: ${words}`);
        // Jev failing says so, and hands the question to no session (§2).
        deps.line(
          row.id,
          `${signals} · Jev couldn't answer, so no triage ran\n${words}`
        );
      });
  };

  /** The session's work as triage and Jev read it: its task and brief, else its title. */
  const workOf = (row: InstanceRow): string => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    if (item) {
      const task = item.taskId ? `Task ${item.taskId}: ` : "";
      return `${task}${item.title}\n\n${clip(item.brief, BRIEF_LIMIT)}`;
    }
    return `A session ${row.parentInstanceId ? "another session started" : "the person started"}, titled “${deps.name(row)}”; no task or brief.`;
  };

  // --- triage ------------------------------------------------------------------

  const startTriage = (
    row: InstanceRow,
    watch: Watch,
    episode: Episode,
    seen: string
  ) => {
    episode.settled = true;
    queue.push({ watched: row.id, episode: episode.id, seen });
    log(row, row.id, `triage queued: ${together(watch)}`);
    drain();
  };

  const drain = (): void => {
    while (running.size < TRIAGE_MAX_RUNNING && queue.length > 0) {
      const next = queue.shift();
      const watch = next ? watches.get(next.watched) : undefined;
      const row = next ? rowOf(next.watched) : undefined;
      // It moved on while it waited, or is gone: nothing to triage.
      if (next && watch && row && watch.episode?.id === next.episode) {
        launch(row, watch, next);
      }
    }
  };

  /** The harness triage runs on: the project's Caw's, else the session's own when Caw can run there, else Claude Code. */
  const harnessFor = (
    row: InstanceRow
  ): { harness: SpawnPayload["harness"]; model: string | null } => {
    const project = row.projectId ? db.project(row.projectId) : undefined;
    if (project) {
      return { harness: project.cawHarness, model: project.cawModel };
    }
    const own = row.harness ?? "";
    return {
      harness: (CAW_HARNESSES as readonly string[]).includes(own)
        ? (own as SpawnPayload["harness"])
        : "claude",
      model: null,
    };
  };

  const launch = (row: InstanceRow, watch: Watch, queued: Queued) => {
    const id = crypto.randomUUID();
    const lead = leadOf(row);
    const seen = [queued.seen, takeSlice(watch)]
      .filter(Boolean)
      .join("\n")
      .slice(-SLICE_LIMIT);
    const triage: Triage = {
      id,
      watched: row.id,
      episode: queued.episode,
      lead,
      lines: lines(watch),
      ended: () => undefined,
      gone: () => undefined,
    };
    running.set(id, triage);
    // The run's answer is the end of its turn, within the deadline.
    readWithin(
      TRIAGE_DEADLINE_MS,
      (signal) =>
        new Promise<void>((resolve, reject) => {
          triage.ended = resolve;
          triage.gone = () => reject(new Gone(`triage ${id}`));
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
      { signal: deps.lifetime.signal }
    ).then(
      (outcome) => {
        if (running.get(id) !== triage) {
          return;
        }
        switch (outcome.kind) {
          case "answered":
            finish(triage, "its turn ended first");
            return;
          case "unanswered":
            if (outcome.reason === "dead") {
              release(triage);
              return;
            }
            log(row, row.id, "triage ran out of time");
            finish(
              triage,
              `it did not end its turn within ${Math.round(outcome.after / 60_000)} min`
            );
            return;
          default: {
            const unhandled: never = outcome;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      },
      () => {
        // The hub closed: nothing it would decide runs.
      }
    );
    const { harness, model } = harnessFor(row);
    const brief = briefOf(row, triage, seen);
    log(row, row.id, `triage started (${id}) on ${harness}`);
    deps
      .spawn(row.machineId, {
        instanceId: id,
        cwd: row.cwd,
        harness,
        ...(model ? { model } : {}),
        ...(row.projectId ? { projectId: row.projectId } : {}),
        title: `Triage · ${deps.name(row)}`,
        role: "overseer",
        requestId: crypto.randomUUID(),
      })
      .then(() => {
        deps.send({
          verb: "send",
          machineId: row.machineId,
          instanceId: id,
          payload: {
            instanceId: id,
            message: {
              type: "user",
              uuid: crypto.randomUUID(),
              message: { role: "user", content: brief },
              parent_tool_use_id: null,
              origin: ORIGIN,
            },
          },
        });
      })
      .catch((error: unknown) => {
        const words = error instanceof Error ? error.message : String(error);
        log(row, row.id, `triage could not start: ${words}`);
        deps.line(
          row.id,
          `${triage.lines.join(" · ")} · triage couldn't start\n${words}`
        );
        triage.gone();
      });
  };

  const briefOf = (row: InstanceRow, triage: Triage, seen: string): string => {
    const { lead } = triage;
    let leadWords = "the person (it has no lead session)";
    if (lead.kind === "caw") {
      leadWords = "Caw, the project's lead";
    } else if (lead.kind === "session") {
      leadWords = `${lead.name}, the session that started it`;
    }
    return [
      "You are fleet watch's triage in CawCo. Code noticed signals on one session. Decide once what happens with triage_decide, then end your turn. You never message the session you are looking at; its lead steers it.",
      `Session: ${deps.name(row)} (${row.id}), ${row.harness ?? "unknown harness"}${row.model ? ` ${row.model}` : ""}, in ${row.cwd}.`,
      `Its work:\n${workOf(row)}`,
      `Its lead: ${leadWords}.`,
      `Signals:\n${triage.lines.map((line) => `- ${line}`).join("\n")}`,
      `What it did since fleet watch last looked, oldest first:\n${seen || "(nothing recorded)"}`,
      "Decisions: nudge (its lead reads your `words` and steers it), interrupt (cut its turn now), stop (stop its process), tell (the person reads your `words` and decides), leave (it is making progress; nothing is sent). Give a one-line `reason` with each.",
    ].join("\n\n");
  };

  const release = (triage: Triage) => {
    running.delete(triage.id);
    drain();
  };

  /** A triage run is over: its session ends, and an undecided one says so in the watched transcript. */
  const finish = (triage: Triage, undecided: string) => {
    if (!triage.decided) {
      deps.line(
        triage.watched,
        `${triage.lines.join(" · ")} · triage didn't decide\nIts turn ended without a decision: ${undecided}.`
      );
    }
    deps.end(triage.id);
    release(triage);
  };

  /** The nudge, to the lead: a session's message, or Caw's wake. */
  const nudge = (row: InstanceRow, lead: Lead, line: string, words: string) => {
    const name = deps.name(row);
    const body = `${words}\n\n(Session ${row.id}. Fleet watch never tells a session about itself: steer it yourself, with handoff, interrupt_delegate or stop_delegate.)`;
    const content = fleetWatchNudge(`${name}: ${line}`, body);
    const target = lead.kind === "session" ? rowOf(lead.id) : undefined;
    if (target) {
      deps.send({
        verb: "send",
        machineId: target.machineId,
        instanceId: target.id,
        payload: {
          instanceId: target.id,
          message: {
            type: "user",
            uuid: crypto.randomUUID(),
            message: { role: "user", content },
            parent_tool_use_id: null,
            origin: ORIGIN,
          },
        },
      });
      return;
    }
    if (lead.kind !== "caw") {
      raiseNotice(row, line, words);
      return;
    }
    deps
      .wakeCaw(lead.projectId, {
        by: "event",
        text: content,
        note: {
          title: `Fleet watch · ${name}`,
          body: words,
          event: { kind: "fleet", instanceId: row.id, name },
        },
      })
      .then((woken) => {
        if (!woken) {
          raiseNotice(row, line, words);
        }
      })
      .catch((error: unknown) => {
        log(
          row,
          row.id,
          `Caw was not woken: ${error instanceof Error ? error.message : String(error)}`
        );
        raiseNotice(row, line, words);
      });
  };

  /** Carries out a decision; answers what the triage reads back. */
  const decide = (
    triage: Triage,
    decision: TriageDecision,
    words: string,
    reason: string
  ): string => {
    const row = rowOf(triage.watched);
    const watch = watches.get(triage.watched);
    triage.decided = decision;
    const signals = triage.lines.join(" · ");
    log(row, triage.watched, `triage decided ${decision}: ${reason}`);
    if (!(row && watch?.episode?.id === triage.episode)) {
      deps.line(
        triage.watched,
        `${signals} · it moved on before triage decided\nTriage said ${decision}: ${reason}`
      );
      return "The session moved on before you decided, so nothing was done. End your turn.";
    }
    const { lead } = triage;
    // With no lead session, a nudge is the person's to read.
    const done =
      decision === "nudge" && lead.kind === "you" ? "tell" : decision;
    const line = `${signals} · ${decisionWords(done, lead.name)}`;
    deps.line(row.id, `${line}\n${reason}`);
    if (done === "nudge") {
      nudge(row, lead, line, words);
    } else if (done === "interrupt") {
      deps.interrupt(row.id);
    } else if (done === "stop") {
      deps.stop(row.id);
    } else if (done === "tell") {
      raiseNotice(row, signals, words || reason);
    }
    // The lead's own line, where the nudge itself is not it.
    const leadId = leadSession(lead);
    if (done !== "nudge" && leadId && leadId !== row.id) {
      deps.line(leadId, `${deps.name(row)}: ${line}\n${reason}`);
    }
    return `Done: ${decisionWords(done, lead.name)}. End your turn now.`;
  };

  // --- the stream ----------------------------------------------------------------

  const observeCalls = (
    id: string,
    watch: Watch,
    message: NeutralMessage & { type: "assistant" }
  ) => {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text.trim()) {
        note(watch, clip(block.text.trim(), SAID_LIMIT));
      }
      if (block.type !== "tool_use") {
        continue;
      }
      note(watch, clip(`→ ${block.name} ${stable(block.input)}`, ENTRY_LIMIT));
      if (FILE_TOOLS.has(block.name.toLowerCase())) {
        watch.changedThisTurn = true;
        watch.quietTurns = 0;
        closeSignals(id, watch, ["error", "repeat", "quiet"]);
      }
      const key = callKey(block.name, block.input);
      if (watch.last?.key === key) {
        watch.last.count += 1;
      } else {
        watch.last = { key, count: 1 };
        closeSignals(id, watch, ["repeat"]);
      }
      if (watch.last.count >= FLEET_WATCH_LIMITS.sameCall) {
        openSignal(id, watch, "repeat", signalLine("repeat", block.name));
      }
    }
  };

  const observeErrors = (
    id: string,
    watch: Watch,
    message: NeutralMessage & { type: "user" }
  ) => {
    const { content } = message.message;
    if (typeof content === "string") {
      return;
    }
    for (const block of content) {
      if (block.type !== "tool_result" || !block.is_error) {
        continue;
      }
      const text = resultText(block.content).trim();
      note(watch, clip(`✗ ${text}`, ENTRY_LIMIT));
      watch.errorThisTurn = true;
      const key = errorKey(text);
      const since = watch.turn - FLEET_WATCH_LIMITS.errorTurns;
      watch.errors = [
        ...watch.errors.filter((each) => each.turn > since),
        { key, turn: watch.turn },
      ];
      const same = watch.errors.filter((each) => each.key === key).length;
      if (same >= FLEET_WATCH_LIMITS.sameError) {
        openSignal(
          id,
          watch,
          "error",
          signalLine("error", clip(text.split("\n")[0] ?? text, 60))
        );
      }
    }
  };

  const observe = (id: string, message: NeutralMessage) => {
    // Every frame is output: a stream delta costs a map read and no more.
    const known = watches.get(id);
    if (known) {
      known.lastOutputAt = Date.now();
      if (known.open.has("stall")) {
        closeSignals(id, known, ["stall"]);
      }
    }
    if (
      !on ||
      (message.type !== "assistant" && message.type !== "user") ||
      message.parent_tool_use_id
    ) {
      return;
    }
    // A subagent's frames (above) are its parent's tool call, not the session's own steps.
    const watch = known ?? watchOf(id);
    if (!watch) {
      return;
    }
    if (message.type === "assistant") {
      observeCalls(id, watch, message);
    } else {
      observeErrors(id, watch, message);
    }
  };

  const endTurn = (id: string, result: NeutralMessage & { type: "result" }) => {
    const triage = running.get(id);
    if (triage) {
      triage.ended();
      return;
    }
    const watch = on ? watchOf(id) : undefined;
    if (!watch) {
      return;
    }
    const changed = watch.changedThisTurn;
    const errored = watch.errorThisTurn;
    watch.changedThisTurn = false;
    watch.errorThisTurn = false;
    closeSignals(id, watch, ["stall"]);
    // An interrupted turn is a person's or a lead's hand, not the session's work.
    if (result.subtype === "aborted") {
      return;
    }
    watch.turn += 1;
    if (!(result.is_error || errored)) {
      closeSignals(id, watch, ["error"]);
    }
    if (changed) {
      return;
    }
    watch.quietTurns += 1;
    if (watch.quietTurns >= FLEET_WATCH_LIMITS.quietTurns) {
      openSignal(id, watch, "quiet", signalLine("quiet"));
    }
  };

  /** A session's pulse: the stall clock starts with its turn. */
  const pulse = (id: string, busy: boolean) => {
    const watch = on ? watchOf(id) : undefined;
    if (!watch) {
      return;
    }
    if (busy && !watch.busy) {
      watch.lastOutputAt = Date.now();
    }
    watch.busy = busy;
  };

  /** Running turns with nothing streamed for the limit, their process alive and nothing asked of you. */
  const sweep = () => {
    if (!on) {
      return;
    }
    const now = Date.now();
    const limit = FLEET_WATCH_LIMITS.stallMinutes * 60_000;
    for (const [id, watch] of watches) {
      if (
        !watch.busy ||
        watch.open.has("stall") ||
        now - watch.lastOutputAt < limit ||
        deps.asking(id)
      ) {
        continue;
      }
      const row = rowOf(id);
      if (row?.status === "running" && deps.online(row.machineId)) {
        openSignal(id, watch, "stall", signalLine("stall"));
      }
    }
  };
  deps.lifetime.every(STALL_SWEEP_MS, sweep);

  /** Runs one of the frame-path entries, throwing nothing into it. */
  const guarded = (id: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      console.error(
        `[fleet-watch] ${id}: ${error instanceof Error ? error.message : error}`
      );
    }
  };

  return {
    observe: (id: string, message: NeutralMessage): void =>
      guarded(id, () => observe(id, message)),
    endTurn: (id: string, result: NeutralMessage & { type: "result" }): void =>
      guarded(id, () => endTurn(id, result)),
    pulse: (id: string, busy: boolean): void =>
      guarded(id, () => pulse(id, busy)),

    /** You sent to the session: its notice is yours now, and goes. */
    humanSend(id: string): void {
      dropNotice(id);
    },

    /**
     * A session that never runs again (stopped, ended, deleted; never a
     * launch or a restart, which is the same session going on): what was
     * read of it goes, and a triage run that was it frees its slot. Its
     * notice stays until you look at it.
     */
    forget(id: string): void {
      watches.delete(id);
      ignored.delete(id);
      running.get(id)?.gone();
    },

    /** The open notices, for a dashboard's first frame. */
    notices: (): FleetWatchNotice[] => db.watchNotices(),

    /** The fleet's switch moved: off forgets every open signal, so nothing carries over. */
    switched(next: boolean): void {
      on = next;
      if (!next) {
        watches.clear();
        queue.length = 0;
      }
    },

    /** `triage_decide`, which only a triage run may call. */
    tools(actor: InstanceRow | undefined) {
      return [
        tool(
          "triage_decide",
          "Decide once what happens to the session you were briefed on. nudge: its lead reads `words`. interrupt: cut its turn. stop: stop its process. tell: the person reads `words`. leave: nothing. Then end your turn.",
          {
            decision: z.enum(TRIAGE_DECISIONS),
            words: z
              .string()
              .optional()
              .describe(
                "For nudge and tell: what the lead or the person reads."
              ),
            reason: z.string().trim().min(1).describe("One line: why."),
          },
          ({ decision, words, reason }) => {
            const triage = actor ? running.get(actor.id) : undefined;
            if (!triage) {
              throw new Error(
                "Only a fleet-watch triage run decides, and this session is not one."
              );
            }
            if (triage.decided) {
              throw new Error(
                `You already decided (${triage.decided}). End your turn.`
              );
            }
            const said = words?.trim() ?? "";
            if ((decision === "nudge" || decision === "tell") && !said) {
              throw new Error(
                `A ${decision} needs \`words\`: what the ${decision === "nudge" ? "lead" : "person"} reads.`
              );
            }
            return Promise.resolve({
              content: [
                {
                  type: "text" as const,
                  text: decide(triage, decision, said, reason),
                },
              ],
            });
          }
        ),
      ];
    },
  };
};

export type FleetWatch = ReturnType<typeof createFleetWatch>;
