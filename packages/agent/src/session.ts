/**
 * Owns every live session on this machine — across every harness — and pumps
 * their neutral frames at the hub. Harness-agnostic: the git worktrees, side
 * quests, busy tracking, bootstrap clone and the routing live here; the actual
 * sessions are {@link HarnessSession}s produced by the adapters in
 * `./harnesses`. Nothing here interprets a harness's own event — frames go out
 * as neutral messages, with the harness's `raw` event riding along.
 */

import { mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  AgentBusyReport,
  ControlPayload,
  Envelope,
  FleetConfig,
  FleetSyncReport,
  FramePayload,
  FrameProvenance,
  FsPayload,
  GitChanges,
  HarnessKind,
  IngestMark,
  NeutralMessage,
  NeutralSessionInfo,
  PermissionResult,
  RepoInfo,
  ReposResult,
  SendPayload,
  SessionPulse,
  SpawnPayload,
  StopPayload,
} from "@cawco/core";
import {
  AGENT_BUSY,
  alreadyIngested,
  CAWCO_SCRATCH_TAG,
  CONTROL_GIT_CHANGES,
  CONTROL_QUERIES,
  CONTROL_RUN_COMMAND,
  CONTROL_SET_PERMISSION_MODE,
  FLEET_STATUS,
  FLEET_SYNC,
  GENERATE_IMAGE,
  INSTALL_SESSION_CREDENTIAL,
  PREVIEW_START,
  PREVIEW_STOP,
  RESOLVE_PERMISSION,
  readIngested,
  repoPath,
  resumeCursor,
  UPDATE_CAWCO,
  withWorktreeLine,
  worstFleetState,
} from "@cawco/core";
import { Effect } from "effect";
import { type Boundary, boundaryFor } from "./boundary";
import { fetchDefaultBranch } from "./clone";
import { harnessMcpUrl } from "./delegation";
import { DEPLOY_BRANCH } from "./deploy";
import { expandHome, runFs } from "./fs";
import type { Harness, HarnessContext, HarnessSession } from "./harness";
import { harnesses, harness as harnessOf } from "./harnesses";
import { generateImage } from "./image-generation";
import { isMachineAgent } from "./machine-agent";
import { prepareFleetMcp } from "./mcp-launcher";
import { startPreview, stopPreview, stopPreviews } from "./preview";
import { parseProcId, SESSION_PROC_KINDS } from "./proc-id";
import { acknowledgeSessionCredential } from "./session-identity";
import { procEpoch } from "./sessiond-client";
import { installTool, probeTools } from "./tools";
import { type UpdateOptions, updateCheckout } from "./update";

/**
 * What {@link SessionSupervisor.reattach} needs of a sessiond-backed adapter, named
 * structurally rather than imported as a class: the supervisor stays
 * harness-agnostic, and an adapter that cannot keep processes simply does not
 * satisfy this shape. Claude and pi share custody; OpenCode owns its server.
 */
interface SessiondAdoption {
  // biome-ignore lint/style/useConsistentMethodSignatures: a property signature changes parameter variance here and would break the claude adapter's implementation
  adopt(
    instanceId: string,
    ctx: HarnessContext,
    options: {
      /** The hub's mark as a seq in this child's ring; absent follows from `head`. */
      afterSeq?: number;
      /** The ring's last seq off the same welcome. */
      head: number;
      sessionId: string | null;
      /** {@link turnRunning}'s answer for this child. */
      turnRunning: boolean;
    }
  ): Promise<HarnessSession>;
  // biome-ignore lint/style/useConsistentMethodSignatures: a property signature changes parameter variance here and would break the claude adapter's implementation
  custodyCandidates(): Promise<{
    /** sessiond's per-boot epoch; with a child's pid, the space its seqs count in (design §7). */
    epoch: string;
    /** `cwd` is what lets a survivor the hub never named be adopted at all. */
    procs: {
      procId: string;
      alive: boolean;
      cwd?: string;
      head: number;
      pid: number;
    }[];
  }>;
  /** Whether the child is mid-turn as its ring stands up to `head`. */
  // biome-ignore lint/style/useConsistentMethodSignatures: a property signature changes parameter variance here and would break the claude adapter's implementation
  turnRunning(instanceId: string, head: number): Promise<boolean>;
}

/** A surviving child one reattach has claimed, and what it decided about it. */
interface Claimed {
  failed?: boolean;
  proc: { head: number; pid: number };
  row: {
    instanceId: string;
    cwd: string;
    sessionId?: string | null;
    sessionCredential?: string;
  };
  /** Whether its turn was running when its ring was read. */
  running: boolean;
  /** Lets go of the claim, for a reattach waiting on this row. */
  settle: () => void;
}

/**
 * The context the supervisor hands an adapter, plus the one thing only an
 * adapter reading a sessiond ring can supply: which line the frame it is about
 * to emit came from (design §7).
 *
 * Declared here rather than on {@link HarnessContext} because it is not part of
 * the harness contract — a ring-reading adapter reaches it as
 * `(ctx as Partial<SessiondAwareContext>).line?.(epoch, seq)`, and every other
 * adapter neither knows nor needs it.
 *
 * The one producer is claude's `adopt`: its `stamp` runs one statement before
 * `custody.ingest`, and `ingest` emits its frame synchronously, so the stamp
 * lands on that frame and no other.
 */
export interface SessiondAwareContext extends HarnessContext {
  // biome-ignore lint/style/useConsistentMethodSignatures: a property signature changes parameter variance here and would break the claude adapter's implementation
  line(srcEpoch: string, srcSeq: number): void;
}

/**
 * The frames an agent has to send. The hub's own registry news is not one.
 *
 * A frame read off a sessiond ring additionally carries the line it came from
 * ({@link FrameProvenance}, design §7) — additively, so the daemon's socket
 * writer and an older hub both pass it through untouched. It is the hub's only
 * way to tell a replayed line it already has from one it does not.
 */
export type FrameSink = (
  frame: Exclude<FramePayload, { kind: "instances" | "instances_delta" }> &
    Partial<FrameProvenance>
) => void;

const warn = (message: string): void => {
  Effect.runFork(Effect.logWarning(message));
};

/** Read-only custody probes can be abandoned; an adoption keeps its claim until it settles. */
const custodyProbe = async <T>(
  read: Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  if (!signal) {
    return await read;
  }
  signal.throwIfAborted();
  const aborted = Promise.withResolvers<never>();
  const cancel = () => aborted.reject(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await Promise.race([read, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
};

const isDirectory = async (path: string): Promise<boolean> => {
  const info = await stat(path).catch(() => null);
  return info?.isDirectory() ?? false;
};

/** The checkout a side quest ran in, kept until the quest is discarded. */
interface Worktree {
  /**
   * The requested cwd and the default branch it was cut from (none for a
   * repository with no remote), until the opening message says whose
   * worktree this is.
   */
  announce?: { cwd: string; base: string | undefined };
  /** Where the session runs: `path`, or the same subdirectory of it. */
  dir: string;
  path: string;
  root: string;
}

/**
 * A side quest's transcript, kept out of the catalogs the rails read. The tag
 * is the whole test there, so the harness that owns the session applies it.
 */
interface Quest {
  dir: string;
  harness: HarnessKind;
  sessionId?: string;
  /** Whether the tag question is closed: applied, or moved by whoever kept it. */
  tagged?: boolean;
}

/** A control reached by name through `control`. */
type ControlMethod = (...args: unknown[]) => unknown;

/** How many repositories the bootstrap picker asks a machine for. */
const REPO_LIST_LIMIT = 100;

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

/** At most one pulse per instance per this long, unless busy/blocked moves. */
const PULSE_THROTTLE_MS = 1000;

/** The one readable field of a tool call, for the rail's glance line. */
const glanceOf = (input: Record<string, unknown> | undefined): string => {
  if (!input) {
    return "";
  }
  if (input.file_path) {
    return String(input.file_path).split("/").slice(-2).join("/");
  }
  if (input.path) {
    return String(input.path).split("/").slice(-2).join("/");
  }
  if (input.command) {
    const cmd = String(input.command);
    return cmd.length > 40 ? `${cmd.slice(0, 40)}...` : cmd;
  }
  if (input.pattern) {
    return `/${input.pattern}/`;
  }
  if (input.glob) {
    return String(input.glob);
  }
  if (input.description) {
    return String(input.description);
  }
  return "";
};

/** Whether the GitHub CLI is here at all — its absence is an answer, not a failure. */
const ghAvailable = async (): Promise<boolean> =>
  (await Bun.$`gh --version`.quiet().nothrow()).exitCode === 0;

/**
 * The repositories `gh` can see from this machine. Whoever is logged in there
 * decides what that is — the private ones included, which is the point of
 * asking the machine rather than GitHub.
 */
/**
 * {@link CONTROL_GIT_CHANGES}: exactly two read-only git commands in `cwd`.
 * `git status` refusing (exit 128: no work tree here) answers `{ repo: false }`.
 */
const gitChanges = async (cwd: string, since: string): Promise<GitChanges> => {
  const dir = expandHome(cwd);
  const status = await Bun.$`git -C ${dir} status --porcelain`
    .quiet()
    .nothrow();
  if (status.exitCode !== 0) {
    return { repo: false };
  }
  const log =
    await Bun.$`git -C ${dir} log --since=${since} --name-status ${"--format=%h %s"}`.quiet();
  return {
    repo: true,
    status: status.stdout.toString(),
    log: log.stdout.toString(),
  };
};

const listRepos = async (): Promise<ReposResult> => {
  if (!(await ghAvailable())) {
    return { error: "gh-missing" };
  }
  const auth = await Bun.$`gh auth status`.quiet().nothrow();
  if (auth.exitCode !== 0) {
    return { error: "gh-unauthenticated" };
  }

  const listed =
    await Bun.$`gh repo list --json nameWithOwner,visibility,updatedAt,description --limit ${REPO_LIST_LIMIT}`
      .quiet()
      .nothrow();
  if (listed.exitCode !== 0) {
    throw new Error(`gh repo list failed: ${tail(listed.stderr.toString())}`);
  }
  return listed.json() as RepoInfo[];
};

/** The same repository, under whichever of its names, is the same repository. */
const repoIdentity = (repo: string): string => repoPath(repo).toLowerCase();

/** What a clone of it is called on disk — git's own default. */
const repoLeaf = (repo: string): string =>
  repoPath(repo).split("/").pop() ?? "";

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_LIKE_RE = /^[^/]+@[^:]+:/;
/** Trailing slashes, but never the one that alone makes the path `/`. */
const TRAILING_SLASHES_RE = /(?!^)\/+$/;

/** A reference git can clone on its own, without `gh` resolving it first. */
const isRepoUrl = (repo: string): boolean =>
  URL_SCHEME_RE.test(repo.trim()) || SCP_LIKE_RE.test(repo.trim());

/** The machine-scoped session-catalog controls, routed to a harness. */
const CATALOG_METHODS = new Set([
  "listSessions",
  "getSessionInfo",
  "getSessionMessages",
  "renameSession",
  "tagSession",
  "deleteSession",
]);

/**
 * The catalog's directory argument, whichever convention carried it: new
 * callers send a plain string, while dashboards and pre-rework callers send
 * the SDK's `{ dir }` options object. A mixed-age fleet speaks both, so both
 * are heard; anything else means no directory was named.
 */
const dirOf = (arg: unknown): string | undefined => {
  if (typeof arg === "string") {
    return arg;
  }
  if (typeof arg === "object" && arg !== null) {
    const { dir } = arg as { dir?: unknown };
    if (typeof dir === "string") {
      return dir;
    }
  }
  return undefined;
};

/**
 * Every stored conversation this machine could pick back up, with the moment
 * each one last changed. The mtime is the whole reason this carries more than
 * ids: the hub's `updatedAt` is the only per-session timestamp anywhere in the
 * fleet, nothing writes it while a session is talking, and so a row that has
 * been asleep since Tuesday can only say when the *bookkeeping* last touched
 * it. The catalog knows when the session itself last moved; sending it is what
 * lets a rail draw ages that differ from each other.
 */
export const resumableSessions = async (): Promise<
  { lastModified: number; sessionId: string }[] | undefined
> => {
  const found: { lastModified: number; sessionId: string }[] = [];
  let sawAny = false;
  for (const adapter of harnesses()) {
    try {
      for (const info of await adapter.listSessions()) {
        found.push({
          sessionId: info.sessionId,
          lastModified: info.lastModified,
        });
      }
      sawAny = true;
    } catch (error) {
      warn(`could not read ${adapter.kind}'s session catalog: ${error}`);
    }
  }
  return sawAny ? found : undefined;
};

/**
 * Owns every live session on this machine and pumps their messages at the hub.
 */
/**
 * What EVERY claimant agrees this machine holds, by hash.
 *
 * Intersected, never unioned: more than one harness converges the fleet's
 * skills, into more than one directory, so a hash one of them holds is not a
 * hash the machine holds. The hub leaves content out on the strength of this,
 * and the cost of being wrong is a harness stranded without files it needs.
 *
 * No claimants agree on nothing, which is the honest answer for a daemon whose
 * harnesses do not report what they hold: it is then sent everything, exactly
 * as it was before any of them could say.
 */
export const agreedHashes = (
  claims: Record<string, string>[]
): Record<string, string> => {
  const [first, ...rest] = claims;
  if (!first) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(first).filter(([name, hash]) =>
      rest.every((claim) => claim[name] === hash)
    )
  );
};

export class SessionSupervisor {
  #custodyState: AgentBusyReport["recovery"] = "recovering";
  #custodyError: string | undefined;
  #custodyEpoch = 0;
  #custodyInstances = new Set<string>();

  constructor() {
    this.#adapter("opencode").setCustodyReadiness?.(() => this.custodyReady);
  }
  readonly #sessions = new Map<string, HarnessSession>();
  /** Reattaches in flight, by instance id: see {@link reattach}. */
  readonly #adopting = new Map<string, Promise<void>>();
  /** Outlives its session: a discard can arrive after the query already ended. */
  readonly #worktrees = new Map<string, Worktree>();
  /** Side quests running here, by instance — for the same reason, same lifetime. */
  readonly #quests = new Map<string, Quest>();
  /** One chain per instance, so envelopes about it are handled in arrival order. */
  readonly #queues = new Map<string, Promise<void>>();
  /** The sessions with a turn in flight — from the `send` that starts one until the turn ends. */
  readonly #busy = new Set<string>();
  readonly #imageRequests = new Map<string, string>();

  /**
   * THE AGENT'S HALF OF THE INGEST LEDGER (design §7).
   *
   * `#line` is the sessiond line the frame now being emitted was derived from,
   * stamped by whoever read it off the ring (the adapter calls `ctx.line(...)`
   * immediately before `ctx.frame(...)`) and consumed by the very next frame.
   * A frame nobody stamped carries no provenance and is forwarded as it always
   * was — opencode and every path that does not read a ring.
   *
   * `#ingested` is the hub's OWN mark for an instance, learned from the
   * register ack. The rule it enforces is one line long and is the whole
   * at-most-once guarantee on this side: forward only a line strictly above
   * the mark the hub itself named, under the epoch the hub named it in.
   */
  readonly #line = new Map<string, FrameProvenance>();
  readonly #ingested = new Map<string, IngestMark>();
  /** Resume coordinates survive inspection even when custody is not adopted. */
  readonly #resumable = new Map<
    string,
    { adapter: Harness; sessionKey: string; cwd: string }
  >();

  /**
   * Per-instance pulse, folded from the frames already passing through (Part 2
   * of per-instance subscription). Only the parts a rail needs without frames:
   * the tool in flight, the parked-permission count, and the running-subagent
   * task ids. `busy` reuses {@link #busy}; the pulse is rebuilt on emit.
   */
  readonly #pulseTool = new Map<
    string,
    { name: string; glance: string; toolId: string }
  >();
  readonly #pulseBlocked = new Map<string, number>();
  readonly #pulseSubagents = new Map<string, Set<string>>();
  /** Last emit per instance — the 1/sec throttle — and its trailing-edge timer. */
  readonly #pulseAt = new Map<string, number>();
  readonly #pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly #daemonFunctions: Record<string, ControlMethod> = {
    [GENERATE_IMAGE]: (_instanceId, cwd, input) =>
      generateImage(cwd as string, input),
    [PREVIEW_START]: (options) =>
      startPreview(options as Parameters<typeof startPreview>[0]),
    [PREVIEW_STOP]: (options) => stopPreview(options as { instanceId: string }),
    [AGENT_BUSY]: () => this.busyNow(),
    [UPDATE_CAWCO]: async (options) =>
      updateCheckout({
        ...(options as Pick<UpdateOptions, "force" | "restartAgent">),
        branch: DEPLOY_BRANCH,
        busy: (await this.busyNow()).busy,
      }),
  };

  /** Register a machine-scoped control method, callable without an instanceId. */
  registerDaemonFunction(name: string, fn: ControlMethod): void {
    this.#daemonFunctions[name] = fn;
  }

  /**
   * Re-pointed at each hub connection. Frames produced while the hub is away are
   * dropped; the hub replays what a session is still blocked on by calling
   * `control reinitialize` after it reconnects.
   */
  sink: FrameSink = () => {
    // replaced once the daemon has a hub connection to sink into
  };
  /** Puts an arbitrary envelope on the daemon's hub socket (hand-offs). */
  emit: (envelope: Envelope) => void = () => {
    // replaced once the daemon has a hub connection to emit onto
  };
  /** Re-probes this machine's harnesses and tools and reports them on a beat, so a changed auth state reaches the fleet. */
  reannounce: () => void = () => {
    // replaced once the daemon has a hub connection to reannounce onto
  };

  /**
   * Every permission ask still waiting for an answer, by requestId — the frame
   * body exactly as it was sunk. The hub parks asks in memory only, so a hub
   * restart forgets the question while this daemon still holds the callback:
   * the session blocks forever on an answer nobody can send. Replayed after
   * every registration (replayOpenAsks); the hub re-parks and re-notifies only
   * what it does not already know.
   */
  readonly #openAsks = new Map<string, Parameters<FrameSink>[0]>();

  /** Re-sinks every unresolved ask — called by the daemon after register. */
  replayOpenAsks(): void {
    for (const body of this.#openAsks.values()) {
      this.sink(body);
    }
  }

  /** Settles once the envelope has been handled, success or failure alike. */
  dispatch(envelope: Envelope): Promise<void> {
    const control =
      envelope.verb === "control"
        ? (envelope.payload as ControlPayload)
        : undefined;
    const imageRequest =
      control?.method === GENERATE_IMAGE ? control.requestId : undefined;
    // A slow image request must not block machine busy probes or other
    // controls. Nor may a command the hub runs (a check, a workflow exec, up
    // to an hour): commands in one directory run one after another, and
    // nothing else waits for them.
    let key = envelope.instanceId ?? "";
    if (imageRequest) {
      key = `image:${imageRequest}`;
    } else if (control?.method === CONTROL_RUN_COMMAND) {
      key = `command:${String(control.args?.[0])}`;
    } else if (control && !envelope.instanceId) {
      // Fleet convergence cannot serialize unrelated machine controls behind
      // its HTTP probes. Mutations of the same kind still retain their order.
      key = `machine:${control.method}`;
    }
    if (imageRequest) {
      this.#imageRequests.set(imageRequest, String(control?.args?.[0]));
    }
    // A question about the session waits for what is already on its way —
    // the spawn that makes the session, a send before it — but nothing waits
    // for its answer: a send behind one sat here until it came back.
    if (control && CONTROL_QUERIES.has(control.method)) {
      // #control sinks its own answer, success or failure.
      return (this.#queues.get(key) ?? Promise.resolve()).then(() =>
        this.#route(envelope)
      );
    }
    const queue = (this.#queues.get(key) ?? Promise.resolve())
      .then(() => this.#route(envelope))
      .catch((error: unknown) => {
        warn(`${envelope.verb} failed: ${error}`);
        // A route failure otherwise reads as delivered silence: spawn answers
        // through #fail and control through its own timeout, but a send or a
        // stop has no ack — without this the reader waits on work that died.
        // A send that could not be handed over is that send's failure, never
        // the session's.
        if (envelope.instanceId && envelope.verb === "send") {
          this.#reject(
            envelope.instanceId,
            (envelope.payload as SendPayload).message.uuid,
            error
          );
        } else if (envelope.instanceId && envelope.verb === "stop") {
          this.sink({
            kind: "error",
            instanceId: envelope.instanceId,
            verb: envelope.verb,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    this.#queues.set(key, queue);
    // biome-ignore lint/complexity/noVoid: fire-and-forget cleanup; dispatch() itself is synchronous and does not wait on the queue draining
    void queue.then(() => {
      if (imageRequest) {
        this.#imageRequests.delete(imageRequest);
      }
      if (this.#queues.get(key) === queue) {
        this.#queues.delete(key);
      }
    });
    return queue;
  }

  /** The sessions running right now — what `register` reconciles the hub against. */
  get instanceIds(): string[] {
    return [...this.#sessions.keys()];
  }

  get custodyReady(): boolean {
    return this.#custodyState === "ready";
  }

  beginCustody(instanceIds: readonly string[]): number {
    this.#custodyState = "recovering";
    this.#custodyError = undefined;
    this.#custodyInstances = new Set(instanceIds);
    this.#custodyEpoch += 1;
    return this.#custodyEpoch;
  }

  completeCustody(epoch: number): void {
    if (epoch === this.#custodyEpoch) {
      this.#custodyState = "ready";
      this.#custodyError = undefined;
      this.#custodyInstances.clear();
    }
  }

  failCustody(epoch: number, problem: unknown): void {
    if (epoch !== this.#custodyEpoch) {
      return;
    }
    this.#custodyState = "failed";
    this.#custodyError =
      problem instanceof Error ? problem.message : String(problem);
    const message = `Machine custody recovery failed: ${this.#custodyError}. Recovery retries while connected; idle-gated operations remain held.`;
    const ids = [...this.#custodyInstances];
    for (const instanceId of ids) {
      this.sink({ kind: "error", instanceId, verb: "register", message });
    }
    if (ids.length === 0) {
      this.sink({ kind: "error", verb: "register", message });
    }
    warn(message);
  }

  /**
   * The sessions mid-turn right now, with undecided custody counted busy. The answer
   * {@link AGENT_BUSY} gives over the wire, and the one the deploy poller
   * reads in-process: it runs in this same daemon, and asking its own
   * supervisor through the hub it is itself connected to would be a round
   * trip to learn a fact already held in memory.
   */
  async busyNow(): Promise<AgentBusyReport> {
    // Recovery must defer retirement, not the machine control reply. A hold
    // can outlast the hub's five-second RPC window; unknown is honestly busy.
    const opencode = (await this.#adapter("opencode").busyInstances?.()) ?? [];
    const ready = this.custodyReady;
    const recovery = ready
      ? []
      : [...this.#custodyInstances, `agent:recovery-${this.#custodyState}`];
    const instances = [
      ...new Set([
        ...[...this.#busy].filter(
          (id) => this.#sessions.get(id)?.harness !== "opencode"
        ),
        ...opencode,
        ...recovery,
        ...this.#imageRequests.values(),
      ]),
    ];
    return {
      busy: instances.length,
      instances,
      ready,
      recovery: this.#custodyState,
      ...(this.#custodyError ? { error: this.#custodyError } : {}),
    };
  }

  /** The pulse as it stands, computed from the parts rather than stored. */
  #buildPulse(instanceId: string): SessionPulse {
    const blocked = (this.#pulseBlocked.get(instanceId) ?? 0) > 0;
    const busy = this.#busy.has(instanceId);
    const running = this.#pulseSubagents.get(instanceId)?.size ?? 0;
    const activity = ((): SessionPulse["activity"] => {
      if (blocked) {
        return "blocked";
      }
      return busy || running > 0 ? "working" : "idle";
    })();
    return {
      instanceId,
      busy,
      activity,
      currentTool: this.#pulseTool.get(instanceId) ?? null,
      runningSubagents: running,
      at: Date.now(),
    };
  }

  /**
   * Whether this daemon speaks for an instance: it carries the session, or a
   * reattach has claimed the child and is deciding or attaching it — a turn
   * that child is running is this daemon's to report from the decision on.
   */
  #speaksFor(instanceId: string): boolean {
    return this.#sessions.has(instanceId) || this.#adopting.has(instanceId);
  }

  /**
   * Pushes the current pulse, throttled to {@link PULSE_THROTTLE_MS} per
   * instance. A busy/blocked transition always goes immediately; everything
   * else waits for the trailing edge of the window.
   */
  #emitPulse(instanceId: string, important: boolean): void {
    if (!this.#speaksFor(instanceId)) {
      return;
    }
    const now = Date.now();
    const last = this.#pulseAt.get(instanceId) ?? 0;
    const sendNow = () => {
      const timer = this.#pulseTimers.get(instanceId);
      if (timer) {
        clearTimeout(timer);
      }
      this.#pulseTimers.delete(instanceId);
      this.#pulseAt.set(instanceId, Date.now());
      this.sink({
        kind: "pulse",
        instanceId,
        pulse: this.#buildPulse(instanceId),
      });
    };
    if (important || now - last >= PULSE_THROTTLE_MS) {
      sendNow();
    } else if (!this.#pulseTimers.has(instanceId)) {
      this.#pulseTimers.set(
        instanceId,
        setTimeout(
          () => {
            this.#pulseTimers.delete(instanceId);
            if (!this.#speaksFor(instanceId)) {
              return;
            }
            this.#pulseAt.set(instanceId, Date.now());
            this.sink({
              kind: "pulse",
              instanceId,
              pulse: this.#buildPulse(instanceId),
            });
          },
          PULSE_THROTTLE_MS - (now - last)
        )
      );
    }
  }

  /**
   * Drops every trace of an instance's pulse — its process is gone. Not its
   * preview: a relaunch comes through here too, and the session it continues
   * still has the preview open. The hub owns that lifetime and ends it on an
   * explicit close or a stop.
   */
  #forgetPulse(instanceId: string): void {
    this.#busy.delete(instanceId);
    this.#line.delete(instanceId);
    // The process this mark counted in is over — a relaunch or a death.
    // Whatever produces frames next is not replaying the hub's own past.
    this.#ingested.delete(instanceId);
    this.#pulseTool.delete(instanceId);
    this.#pulseBlocked.delete(instanceId);
    for (const [requestId, ask] of this.#openAsks) {
      if ("instanceId" in ask && ask.instanceId === instanceId) {
        this.#openAsks.delete(requestId);
      }
    }
    this.#pulseSubagents.delete(instanceId);
    this.#pulseAt.delete(instanceId);
    const timer = this.#pulseTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
    }
    this.#pulseTimers.delete(instanceId);
  }

  /**
   * Folds one neutral frame into the pulse, then emits. Only the main loop's
   * frames move the tool; a subagent's carry `parent_tool_use_id` and belong to
   * the subagent count, not the rail's tool line.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: folds every neutral frame shape (assistant tool_use, user tool_result, …) into the pulse in one pass
  #foldPulse(instanceId: string, message: NeutralMessage): void {
    const main = !(
      "parent_tool_use_id" in message && message.parent_tool_use_id
    );
    if (message.type === "assistant" && main) {
      for (const block of message.message.content) {
        if (block.type !== "tool_use") {
          continue;
        }
        this.#pulseTool.set(instanceId, {
          name: block.name,
          glance: glanceOf(block.input as Record<string, unknown>),
          toolId: block.id,
        });
        this.#emitPulse(instanceId, false);
        return;
      }
      return;
    }
    if (message.type === "user" && main) {
      const { content } = message.message;
      if (!Array.isArray(content)) {
        return;
      }
      for (const block of content) {
        if (block.type !== "tool_result") {
          continue;
        }
        this.#pulseTool.delete(instanceId);
        this.#emitPulse(instanceId, false);
        return;
      }
      return;
    }
    if (message.type === "result") {
      this.#pulseTool.delete(instanceId);
      this.#emitPulse(instanceId, false);
      return;
    }
    if (message.type === "system") {
      const taskId = message.task_id;
      const running = this.#pulseSubagents.get(instanceId);
      if (
        message.subtype === "task_started" ||
        message.subtype === "task_progress"
      ) {
        // `subagent_type` is what separates a real Task/Agent subagent from a
        // plain Bash task — only the former counts in the rail's subagent badge.
        if (message.subagent_type && taskId) {
          if (running) {
            running.add(taskId);
          } else {
            this.#pulseSubagents.set(instanceId, new Set([taskId]));
          }
          this.#emitPulse(instanceId, false);
        }
      } else if (message.subtype === "task_notification") {
        if (taskId && running?.has(taskId)) {
          running.delete(taskId);
          this.#emitPulse(instanceId, false);
        }
      } else if (message.subtype === "task_updated") {
        const status = message.patch?.status;
        const terminal =
          status === "completed" || status === "failed" || status === "killed";
        if (taskId && terminal && running?.has(taskId)) {
          running.delete(taskId);
          this.#emitPulse(instanceId, false);
        }
      }
    }
  }

  /**
   * Let go of every session without ending one.
   *
   * This used to stop them, and stopping is not what a restart wants: `stop()`
   * ends the child's stdin, and a claude that loses stdin exits. The children
   * live in sessiond's cgroup rather than this daemon's precisely so a restart
   * can be free, and a daemon that killed them on the way out spent that for
   * nothing — the deploy path restarts this process on every push to main.
   *
   * So only this daemon's bookkeeping is dropped. The procs stay where they
   * are, and the next daemon adopts them through {@link reattachFrom}, which
   * is the hand-back this detach exists to leave possible.
   *
   * An operator ending a session still goes through `stop`, and sessiond going
   * down still takes its children with it. Neither is a restart.
   */
  detach(): void {
    stopPreviews();
    for (const instanceId of [...this.#sessions.keys()]) {
      this.#sessions.delete(instanceId);
      this.#forgetPulse(instanceId);
    }
  }

  #route(envelope: Envelope): Promise<void> {
    switch (envelope.verb) {
      case "spawn":
        return this.#spawn(envelope.payload as SpawnPayload);
      case "send":
        return this.#send(envelope.payload as SendPayload);
      case "stop":
        return this.#stop(envelope.payload as StopPayload);
      case "control":
        return this.#control(envelope.payload as ControlPayload);
      case "fs":
        return this.#fs(envelope.payload as FsPayload);
      default:
        return Promise.resolve();
    }
  }

  #adapter(kind: HarnessKind | undefined): Harness {
    const adapter = harnessOf(kind ?? "claude");
    if (!adapter) {
      throw new Error(`no harness adapter for ${kind ?? "claude"}`);
    }
    return adapter;
  }

  /**
   * The directory a spawn runs in, made when it may be. Undefined for a probe
   * that has nothing to find; a throw for a spawn that has nowhere to run.
   */
  async #workdir(payload: SpawnPayload): Promise<string | undefined> {
    const { bootstrap, reattachOnly, workspace } = payload;
    const workdir = bootstrap
      ? await this.#clone(bootstrap)
      : expandHome(payload.cwd);
    // A workspace's directory is its clone: one that is gone was removed
    // after its work landed, and an empty folder made in its place would be
    // a session resumed into nothing.
    if (!(bootstrap || reattachOnly || workspace)) {
      await mkdir(workdir, { recursive: true });
    }
    if (await isDirectory(workdir)) {
      return workdir;
    }
    // A probe for a turn a lost handle may still be running finds nothing
    // where there is no directory, and says nothing, as it does when the
    // server holds no such turn: the hub left the row's history alone until
    // something was found, and a probe is not a spawn to fail.
    if (reattachOnly) {
      return undefined;
    }
    throw new Error(`working directory does not exist: ${workdir}`);
  }

  #recoveryUnavailable(payload: SpawnPayload, reason: string): void {
    if (payload.reattachOnly) {
      this.sink({
        kind: "recovery_unavailable",
        instanceId: payload.instanceId,
        reason,
      });
    }
  }

  async #installCredential(
    session: HarnessSession,
    instanceId: string,
    credential: string,
    mode?: "initial"
  ): Promise<void> {
    try {
      await session.control(INSTALL_SESSION_CREDENTIAL, [credential, mode]);
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : String(problem);
      warn(`session ${instanceId} credential installation waits: ${message}`);
      await acknowledgeSessionCredential(credential, message).catch((error) => {
        warn(
          `session ${instanceId} credential failure could not be recorded: ${String(error)}`
        );
      });
    }
  }

  #reuseRecovery(payload: SpawnPayload): boolean {
    const { instanceId, requestId: ack } = payload;
    // Recovery delivery and the register ack may name the same attachment.
    // This is shared by Claude adoption, pi resume and OpenCode reattach.
    if (
      (payload.reattachOnly || payload.resume) &&
      this.#sessions.has(instanceId)
    ) {
      if (ack) {
        this.sink({
          kind: "control_result",
          instanceId,
          requestId: ack,
          ok: true,
        });
      }
      return true;
    }
    return false;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shared spawn transaction rechecks recovery after asynchronous adoption and workdir preparation
  async #spawn(payload: SpawnPayload): Promise<void> {
    const { instanceId, cwd, harness: kind, scratch, requestId: ack } = payload;
    if (payload.reattachOnly || payload.resume) {
      await this.#adopting.get(instanceId);
      if (this.#reuseRecovery(payload)) {
        return;
      }
    }
    const adapter = this.#adapter(kind);
    try {
      let workdir = await this.#workdir(payload);
      if (workdir === undefined) {
        this.#recoveryUnavailable(
          payload,
          "The recovery directory is no longer available."
        );
        return;
      }
      // A relaunch stays in the checkout the side quest has been working in.
      const cut = this.#worktrees.get(instanceId);
      if (cut) {
        workdir = cut.dir;
      } else if (scratch?.worktree) {
        workdir = await this.#addWorktree(
          instanceId,
          expandHome(scratch.baseCwd ?? cwd)
        );
      }

      // Each spawn says for itself whether this is a side quest, so a relaunch
      // of one that has since been kept stops being tagged as scratch.
      if (scratch) {
        this.#quests.set(instanceId, {
          ...this.#quests.get(instanceId),
          dir: workdir,
          harness: adapter.kind,
        });
      } else {
        this.#quests.delete(instanceId);
      }

      // A spawn for an instance already running is a relaunch: replace the
      // process under the same id, settling the old one first.
      const running = this.#sessions.get(instanceId);
      if (running) {
        if (this.#reuseRecovery(payload)) {
          return;
        }
        this.#sessions.delete(instanceId);
        this.#forgetPulse(instanceId);
        await running.stop();
      }

      // A work item's session runs every shell command inside its workspace's
      // boundary, and does not start without one: the refusal is the spawn's.
      const boundary = await boundaryFor(payload.workspace);
      const holder: { session: HarnessSession | null } = { session: null };
      const ctx = this.#context(
        instanceId,
        workdir,
        adapter,
        holder,
        boundary,
        payload.sessionCredential
      );

      if (payload.resume) {
        this.#resumable.set(instanceId, {
          adapter,
          sessionKey: payload.resume.sessionKey,
          cwd: workdir,
        });
      } else {
        this.#resumable.delete(instanceId);
      }
      const session = payload.reattachOnly
        ? await adapter.reattach?.(payload, ctx)
        : await adapter.spawn(payload, ctx);
      if (!session) {
        this.#recoveryUnavailable(
          payload,
          "The harness found no live session to reattach."
        );
        return;
      }
      holder.session = session;
      this.#sessions.set(instanceId, session);
      session.attached?.();
      if (payload.sessionCredential) {
        await this.#installCredential(
          session,
          instanceId,
          payload.sessionCredential,
          payload.reattachOnly ? undefined : "initial"
        );
      }
      // A reattach that met a running turn said so before there was a session
      // to carry the pulse ({@link #emitPulse} drops it): said now.
      if (this.#busy.has(instanceId)) {
        this.#emitPulse(instanceId, true);
      }
      // The session is in place. Worth saying out loud for a relaunch, whose
      // caller has nothing else to wait on.
      if (ack) {
        this.sink({
          kind: "control_result",
          instanceId,
          requestId: ack,
          ok: true,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The journal too: the row's `error` and the control result both leave
      // this process, and a diagnosis on the machine itself was once blind to
      // why a resume died.
      warn(`spawn ${instanceId} failed: ${message}`);
      if (ack) {
        this.sink({
          kind: "control_result",
          instanceId,
          requestId: ack,
          ok: false,
          error: message,
        });
      }
      this.#fail(instanceId, error);
    }
  }

  /**
   * The supervisor's side of one session, built once and shared by both ways a
   * session can arrive: a fresh {@link #spawn}, and a {@link reattach} that
   * attaches to a child which outlived the agent. Shared deliberately —
   * two copies of this wiring is two places for the pulse, the busy set and
   * the frame routing to drift apart.
   */
  #context(
    instanceId: string,
    workdir: string,
    adapter: Harness,
    holder: { session: HarnessSession | null },
    boundary?: Boundary,
    sessionCredential?: string
  ): SessiondAwareContext {
    return {
      instanceId,
      cwd: workdir,
      ...(boundary ? { boundary } : {}),
      ...(sessionCredential ? { sessionCredential } : {}),
      /**
       * The sessiond line the NEXT frame is derived from. Optional on purpose:
       * an adapter that does not read its frames off a ring never calls it,
       * and the supervisor's behaviour is then exactly what it always was.
       */
      line: (srcEpoch: string, srcSeq: number) => {
        this.#line.set(instanceId, { srcEpoch, srcSeq });
      },
      frame: (message) => {
        const src = this.#line.get(instanceId);
        this.#line.delete(instanceId);
        if (message.type === "result") {
          this.#tagQuest(instanceId, adapter);
        }
        // Folded before the forward decision: the pulse is local state being
        // rebuilt from a replay, and a line the hub already has still tells
        // this agent what its own session is doing.
        this.#foldPulse(instanceId, message);
        // AT MOST ONCE. The hub's mark is the hub's word, so a line at or below
        // it has already become a frame there — replaying it would double what
        // a dashboard shows. Above it, or under a different epoch, or with no
        // provenance at all: forwarded.
        if (alreadyIngested(this.#ingested.get(instanceId), src)) {
          return;
        }
        this.sink({
          kind: "frame",
          instanceId,
          harness: adapter.kind,
          message,
          ...(src ?? {}),
        });
      },
      permission: (request) => {
        if (this.#openAsks.has(request.requestId)) {
          return;
        }
        this.#pulseBlocked.set(
          instanceId,
          (this.#pulseBlocked.get(instanceId) ?? 0) + 1
        );
        this.#emitPulse(instanceId, true);
        const body = {
          kind: "permission_request" as const,
          instanceId,
          harness: adapter.kind,
          ...request,
        };
        this.#openAsks.set(request.requestId, body);
        this.sink(body);
      },
      permissionResolved: (requestId) => this.#settleAsk(instanceId, requestId),
      busy: (active) => {
        if (active) {
          this.#busy.add(instanceId);
        } else {
          this.#busy.delete(instanceId);
        }
        this.#emitPulse(instanceId, true);
      },
      session: (sessionId) =>
        this.#noteQuestSession(instanceId, sessionId, adapter.kind),
      failed: (error) => this.#fail(instanceId, error),
      rejected: (uuid, error) => this.#reject(instanceId, uuid, error),
      emit: (envelope) => this.emit(envelope),
      closed: () => {
        // A dead process is never going to answer anything it asked.
        for (const [requestId, body] of this.#openAsks) {
          if ("instanceId" in body && body.instanceId === instanceId) {
            this.#openAsks.delete(requestId);
          }
        }
        if (
          holder.session &&
          this.#sessions.get(instanceId) === holder.session
        ) {
          this.#sessions.delete(instanceId);
          this.#busy.delete(instanceId);
          this.#forgetPulse(instanceId);
        }
      },
    };
  }

  /**
   * What sessiond is still holding that this daemon is not carrying.
   *
   * The hub names the sessions it wants restored, and for a while that was the
   * only list a reattach consulted — so a child sessiond had faithfully kept
   * alive, but whose row the hub had already written off, stayed running with
   * nobody pumping its output and no way back onto the board. The machine's
   * own truth is what sessiond holds, so it is read directly and merged with
   * whatever the hub asked for.
   *
   * `cwd` comes back from the child's own spec. A proc reported without one
   * cannot be adopted — a reattach needs a directory — and is left alone
   * rather than adopted into the wrong place.
   */
  async survivors(
    signal?: AbortSignal
  ): Promise<{ instanceId: string; cwd: string; sessionId: null }[]> {
    const welcomes = await custodyProbe(
      Promise.all(
        SESSION_PROC_KINDS.map(async (kind) => {
          const adapter = this.#adapter(kind) as Harness &
            Partial<SessiondAdoption>;
          return await adapter.custodyCandidates?.();
        })
      ),
      signal
    );
    signal?.throwIfAborted();
    return welcomes
      .flatMap((welcome) => welcome?.procs ?? [])
      .flatMap((proc) => {
        const id = parseProcId(proc.procId);
        return (id.kind === "claude" || id.kind === "pi") &&
          proc.alive &&
          proc.cwd !== undefined &&
          !this.#sessions.has(id.instanceId)
          ? [{ instanceId: id.instanceId, cwd: proc.cwd, sessionId: null }]
          : [];
      });
  }

  /**
   * REATTACH (design §4.1, §7). The agent has restarted; sessiond is still
   * holding the children. Each one the caller names is attached to at once: a
   * full SDK `Query` on the same process, whether it is idle, mid-turn or
   * running background work. No relaunch, so nothing it runs is cut off.
   *
   * The `Query` reads from the hub's own ingest mark (§7's ledger), so what
   * the child wrote while no agent was reading reaches the hub exactly once.
   * No mark, or one from another process, follows from head: the honest-loss
   * rule, which replays nothing rather than double what history shows.
   *
   * Three steps, and only the middle one decides what busy questions hear:
   *  1. CLAIM every row sessiond is holding, without yielding.
   *  2. DECIDE whether each claimed child is mid-turn, all at once, off the
   *     runtime ({@link SessiondAdoption.turnRunning}). Machine readiness stays
   *     held by the custody transaction until every recovery has an outcome,
   *     and a running turn is in `#busy` from then on — attached or not yet.
   *  3. ATTACH them one at a time. On obelisk this took 23 s for 138 rows
   *     (2026-10-01), and a busy answer that waited for it, or read `#busy`
   *     before it reached a working row, read 0 while two sessions worked.
   *
   * Returns the instance ids attached. A row sessiond is not holding is not
   * one of them: no process, nothing to attach to, and the hub's own
   * `sleeping`/`restore` path owns it from there.
   */
  async reattach(
    rows: Claimed["row"][],
    /**
     * The hub's ingest ledger off the register ack. Absent — a hub that has
     * nothing of this machine — means every row follows from head.
     */
    ingested?: Record<string, IngestMark>,
    signal?: AbortSignal,
    failed = new Set<string>()
  ): Promise<string[]> {
    return (
      await Promise.all(
        SESSION_PROC_KINDS.map((kind) =>
          this.#reattachHarness(kind, rows, ingested, signal, failed)
        )
      )
    ).flat();
  }

  async #reattachHarness(
    kind: HarnessKind,
    rows: Claimed["row"][],
    ingested?: Record<string, IngestMark>,
    signal?: AbortSignal,
    failed = new Set<string>()
  ): Promise<string[]> {
    const adapter = this.#adapter(kind);
    const candidate = adapter as Harness & Partial<SessiondAdoption>;
    if (
      typeof candidate.adopt !== "function" ||
      typeof candidate.custodyCandidates !== "function" ||
      typeof candidate.turnRunning !== "function"
    ) {
      return [];
    }
    const claude = candidate as Harness & SessiondAdoption;
    const claimed: Claimed[] = [];
    /** Rows another reattach is attaching right now: theirs to decide. */
    const elsewhere: (typeof rows)[number][] = [];
    const adopted: string[] = [];
    try {
      const welcome = await custodyProbe(claude.custodyCandidates(), signal);
      signal?.throwIfAborted();
      const held = new Map(
        welcome.procs
          .filter((proc) => proc.alive)
          .flatMap((proc) => {
            const id = parseProcId(proc.procId);
            return (id.kind === "claude" || id.kind === "pi") &&
              id.kind === kind
              ? [[id.instanceId, proc] as const]
              : [];
          })
      );

      // 1. CLAIM. ONE QUERY PER CHILD. A hub reconnect while a reattach is
      // still walking its rows starts a second one, and the new ack names the
      // same children the first is adopting. A second adopt put a second
      // `Query` on the child: its subscribe took over the first's listener,
      // so the first `Query` stranded with no stream while both had
      // initialised the CLI. A child already carried is this daemon's
      // already; it counts as adopted, so its spawn is not dispatched either.
      // One being attached by another reattach is that one's to decide and
      // attach, and is waited for after this one's own rows. Nothing in this
      // loop yields, so no other reattach can claim a row between its check
      // and its `#adopting.set`.
      for (const row of rows) {
        const proc = held.get(row.instanceId);
        if (!proc) {
          continue;
        }
        if (this.#adopting.has(row.instanceId)) {
          elsewhere.push(row);
          continue;
        }
        const carried = this.#sessions.get(row.instanceId);
        if (carried) {
          this.#installAdoptedCredential(row, carried);
          adopted.push(row.instanceId);
          continue;
        }
        const claim = Promise.withResolvers<void>();
        this.#adopting.set(row.instanceId, claim.promise);
        claimed.push({ row, proc, running: false, settle: claim.resolve });
      }

      // 2. DECIDE, every claimed row at once.
      await Promise.all(
        claimed.map(async (entry) => {
          try {
            entry.running = await custodyProbe(
              claude.turnRunning(entry.row.instanceId, entry.proc.head),
              signal
            );
          } catch (problem) {
            signal?.throwIfAborted();
            entry.failed = true;
            failed.add(entry.row.instanceId);
            this.#sessionRecoveryFailed(entry.row.instanceId, problem);
          }
          signal?.throwIfAborted();
          if (entry.running) {
            this.#busy.add(entry.row.instanceId);
            // The hub forgot this session's pulse at the register: the rail's
            // Working list hears it from here, not when step 3 reaches it.
            this.#emitPulse(entry.row.instanceId, true);
          }
        })
      );

      // 3. ATTACH, one at a time.
      for (const entry of claimed) {
        signal?.throwIfAborted();
        if (entry.failed) {
          continue;
        }
        try {
          // biome-ignore lint/performance/noAwaitInLoops: rows are attached one at a time: each mutates the shared #ingested map
          await this.#adoptClaimed(claude, welcome.epoch, entry, ingested);
          adopted.push(entry.row.instanceId);
        } catch (problem) {
          failed.add(entry.row.instanceId);
          this.#sessionRecoveryFailed(entry.row.instanceId, problem);
          entry.settle();
        }
      }
    } finally {
      this.#releaseClaims(claimed);
    }
    // Another reattach's rows, once it is done with them. One it failed to
    // attach is tried again here, as a reattach of its own.
    for (const row of elsewhere) {
      signal?.throwIfAborted();
      // biome-ignore lint/performance/noAwaitInLoops: each row waits on whichever reattach holds it
      await custodyProbe(
        this.#adopting.get(row.instanceId) ?? Promise.resolve(),
        signal
      );
      signal?.throwIfAborted();
      if (this.#sessions.has(row.instanceId)) {
        this.#installAdoptedCredential(row, this.#session(row.instanceId));
        adopted.push(row.instanceId);
      } else {
        adopted.push(
          ...(await this.#reattachHarness(
            kind,
            [row],
            ingested,
            signal,
            failed
          ))
        );
      }
    }
    return adopted;
  }

  #sessionRecoveryFailed(instanceId: string, problem: unknown): void {
    const message =
      problem instanceof Error ? problem.message : String(problem);
    this.sink({
      kind: "error",
      instanceId,
      verb: "register",
      message: `Session custody recovery failed: ${message}`,
    });
    this.sink({ kind: "recovery_unavailable", instanceId, reason: message });
  }

  /**
   * Lets go of every claim a reattach took. A row decided but never attached
   * — the reattach failed on the way — is carried by nobody, and is not this
   * daemon's turn to report: the busy pulse it was given goes back while the
   * claim still speaks for it.
   */
  #releaseClaims(claimed: Claimed[]): void {
    for (const { row, settle } of claimed) {
      if (!this.#sessions.has(row.instanceId)) {
        if (this.#busy.delete(row.instanceId)) {
          this.#emitPulse(row.instanceId, true);
        }
        this.#adopting.delete(row.instanceId);
      }
      settle();
    }
  }

  /** {@link reattach}'s step 3 for one claimed, decided row. */
  async #adoptClaimed(
    claude: Harness & SessiondAdoption,
    epoch: string,
    { row, proc, running, settle }: Claimed,
    ingested: Record<string, IngestMark> | undefined
  ): Promise<void> {
    // THE HONEST-LOSS RULE (design §7). A mark in THIS child's sequence space
    // — sessiond's current boot and this process — is a cursor: replay
    // exactly the gap the hub named. Anything else is replayed as NOTHING and
    // followed from head: a mark from a sessiond that has since restarted
    // names lines that no longer exist, and one from an earlier process
    // under the same id names another ring. Disk transcripts cover the
    // middle.
    const mark = ingested?.[row.instanceId];
    const cursor = resumeCursor(procEpoch(epoch, proc.pid), mark);
    if (cursor !== undefined && mark) {
      this.#ingested.set(row.instanceId, mark);
    } else {
      this.#ingested.delete(row.instanceId);
    }
    const holder: { session: HarnessSession | null } = { session: null };
    const ctx = this.#context(
      row.instanceId,
      row.cwd,
      claude,
      holder,
      undefined,
      row.sessionCredential
    );
    const session = await claude.adopt(row.instanceId, ctx, {
      ...(cursor === undefined ? {} : { afterSeq: cursor }),
      head: proc.head,
      sessionId: row.sessionId ?? null,
      turnRunning: running,
    });
    holder.session = session;
    this.#sessions.set(row.instanceId, session);
    this.#installAdoptedCredential(row, session);
    session.attached?.();
    this.#adopting.delete(row.instanceId);
    settle();
  }

  /**
   * The reattach as the register ack hands it over (design §7, step 4): the
   * ack's payload in, the instance ids attached out.
   */
  async reattachFrom(
    ackPayload: unknown,
    rows: Claimed["row"][],
    signal?: AbortSignal
  ): Promise<{ attached: string[]; failed: Set<string> }> {
    const failed = new Set<string>();
    const attached = await this.reattach(
      rows,
      readIngested(ackPayload),
      signal,
      failed
    );
    return { attached, failed };
  }

  #installAdoptedCredential(
    row: Claimed["row"],
    session: HarnessSession
  ): void {
    if (row.sessionCredential) {
      // biome-ignore lint/complexity/noVoid: the handle is installed; waiting for its idle boundary must not block adoption of siblings.
      void this.#installCredential(
        session,
        row.instanceId,
        row.sessionCredential
      );
    }
  }

  /** The harness session a side quest turned out to be writing, from its init frame. */
  #noteQuestSession(
    instanceId: string,
    sessionId: string,
    harness: HarnessKind
  ): void {
    const quest = this.#quests.get(instanceId);
    if (!quest || quest.sessionId === sessionId) {
      return;
    }
    quest.sessionId = sessionId;
    quest.harness = harness;
    quest.tagged = false;
  }

  /**
   * Keeps a side quest out of the catalogs the rails read. Applied at the end of
   * the first turn rather than at init, because until the session has said
   * something there may be no transcript for a tag to live on. Fire-and-forget,
   * tried again next turn if it does not land.
   */
  #tagQuest(instanceId: string, adapter: Harness): void {
    const quest = this.#quests.get(instanceId);
    if (!quest?.sessionId || quest.tagged) {
      return;
    }
    const { sessionId, dir } = quest;
    quest.tagged = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — #tagQuest itself is synchronous and does not wait on the tag landing
    void adapter
      .tagSession(sessionId, CAWCO_SCRATCH_TAG, dir)
      .catch((error: unknown) => {
        quest.tagged = false;
        warn(`could not tag side quest ${sessionId}: ${error}`);
      });
  }

  /** A session whose tag someone has just set by hand is no longer ours to set. */
  #closeTagging(sessionId: unknown): void {
    for (const quest of this.#quests.values()) {
      if (quest.sessionId === sessionId) {
        quest.tagged = true;
      }
    }
  }

  /** A session that never started, or stopped without being asked to. */
  #fail(instanceId: string, error: unknown): void {
    this.sink({
      kind: "error",
      instanceId,
      verb: "spawn",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * One send that did not go: the harness refused it, or there was no
   * session to hand it to. The hub fails that send's record; the session, if
   * there is one, goes on.
   */
  #reject(instanceId: string, uuid: string, error: unknown): void {
    this.sink({
      kind: "rejected",
      instanceId,
      uuid,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // biome-ignore lint/suspicious/useAwait: must stay async to match #route()'s Promise<void>-returning verb handlers
  async #send({
    instanceId,
    message,
    attachments,
    images,
    urgent,
  }: SendPayload): Promise<void> {
    const worktree = this.#worktrees.get(instanceId);
    const { content } = message.message;
    if (worktree?.announce && typeof content === "string") {
      message = {
        ...message,
        message: {
          ...message.message,
          content: withWorktreeLine(
            content,
            worktree.announce.cwd,
            worktree.announce.base
          ),
        },
      };
      worktree.announce = undefined;
    }
    this.#session(instanceId).send(message, { attachments, images, urgent });
  }

  async #stop({ instanceId, discard, requestId }: StopPayload): Promise<void> {
    try {
      const session = this.#sessions.get(instanceId);
      if (session) {
        this.#forgetPulse(instanceId);
        // Carried, and listed on every beat, until the stop is over: a stop
        // waits for the turn it interrupts, and a beat that no longer listed
        // the session meanwhile had the hub settle it as ended — what it was
        // holding failed "ended" before this said "stopped".
        await session.stop();
        this.#sessions.delete(instanceId);
      } else {
        const target = this.#resumable.get(instanceId);
        // A discard of an instance this machine holds nothing for — a spawn
        // that never produced a session — has nothing to stop: the row is
        // thrown away, or it could never leave the board.
        const aborted =
          discard &&
          (!target ||
            (await target.adapter.abortSession?.(
              target.sessionKey,
              target.cwd
            )));
        if (!aborted) {
          throw new Error(
            `Nothing stopped for ${instanceId}: no live session or abortable server turn${discard ? "" : "; held turns require explicit discard"}`
          );
        }
      }
      this.#resumable.delete(instanceId);
      this.sink({ kind: "stopped", instanceId, discard: false });
      if (discard) {
        await this.#removeWorktree(instanceId);
        await this.#removeQuestSession(instanceId);
        this.sink({ kind: "stopped", instanceId, discard: true });
      }
      if (requestId) {
        this.sink({ kind: "control_result", instanceId, requestId, ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestId) {
        this.sink({
          kind: "control_result",
          instanceId,
          requestId,
          ok: false,
          error: message,
        });
      } else {
        this.sink({ kind: "error", instanceId, verb: "stop", message });
      }
    }
  }

  async #clone({
    repo,
    baseDir,
  }: NonNullable<SpawnPayload["bootstrap"]>): Promise<string> {
    const parent = expandHome(baseDir).replace(TRAILING_SLASHES_RE, "");
    const target = `${parent}/${repoLeaf(repo)}`;

    if (await isDirectory(target)) {
      const origin = await Bun.$`git -C ${target} remote get-url origin`
        .quiet()
        .nothrow();
      if (
        origin.exitCode !== 0 ||
        repoIdentity(origin.text()) !== repoIdentity(repo)
      ) {
        throw new Error(
          `bootstrap target exists and is not the requested repo: ${target}`
        );
      }
      return target;
    }

    const gh = await ghAvailable();
    if (!(gh || isRepoUrl(repo))) {
      throw new Error(
        `cloning ${repo} needs the GitHub CLI, and gh is not installed on this machine`
      );
    }

    await Bun.$`mkdir -p ${parent}`.quiet();
    const cloned = gh
      ? await Bun.$`gh repo clone ${repo} ${target} -- --single-branch`
          .quiet()
          .nothrow()
      : await Bun.$`git clone --single-branch ${repo} ${target}`
          .quiet()
          .nothrow();
    if (cloned.exitCode !== 0) {
      throw new Error(
        `could not clone ${repo}: ${tail(cloned.stderr.toString())}`
      );
    }
    return target;
  }

  /**
   * A detached checkout of `baseCwd`'s repo at `~/.worktrees/<repo>-<id8>`,
   * outside the repo so its own `git status` never sees it. A directory with
   * no commit to check out (not a repo, or an empty one) runs as it is.
   */
  async #addWorktree(instanceId: string, baseCwd: string): Promise<string> {
    const repository =
      await Bun.$`git -C ${baseCwd} rev-parse --show-toplevel --show-prefix HEAD`
        .quiet()
        .nothrow();
    if (repository.exitCode !== 0) {
      return baseCwd;
    }

    const [root = "", prefix = ""] = repository.text().split("\n");
    const path = expandHome(
      `~/.worktrees/${basename(root)}-${instanceId.slice(0, 8)}`
    );
    // A relaunch after a daemon restart finds its worktree already there.
    const listed = await Bun.$`git -C ${root} worktree list --porcelain`
      .quiet()
      .text();
    const reused = listed.split("\n").includes(`worktree ${path}`);
    let base: string | undefined;
    if (!reused) {
      // The remote's default branch as the remote has it now, not the local
      // checkout (a shared clone's HEAD is whatever nobody updated) and not a
      // remote-tracking ref nobody fetched. A repository with no remote has
      // nothing to land on, and starts from its own HEAD.
      const hasOrigin =
        (await Bun.$`git -C ${root} remote get-url origin`.quiet().nothrow())
          .exitCode === 0;
      base = hasOrigin ? await fetchDefaultBranch(root) : undefined;
      const commit = base ? `origin/${base}` : "HEAD";
      const added =
        await Bun.$`git -C ${root} worktree add --detach ${path} ${commit}`
          .quiet()
          .nothrow();
      if (added.exitCode !== 0) {
        throw new Error(
          `git worktree add failed: ${added.stderr.toString().trim()}`
        );
      }
    }

    const dir = join(path, prefix);
    this.#worktrees.set(instanceId, {
      path,
      root,
      dir,
      ...(reused ? {} : { announce: { cwd: baseCwd, base } }),
    });
    return dir;
  }

  async #removeWorktree(instanceId: string): Promise<void> {
    const worktree = this.#worktrees.get(instanceId);
    if (!worktree) {
      return;
    }
    this.#worktrees.delete(instanceId);

    const removed =
      await Bun.$`git -C ${worktree.root} worktree remove --force ${worktree.path}`
        .quiet()
        .nothrow();
    if (removed.exitCode !== 0) {
      throw new Error(
        `git worktree remove failed: ${removed.stderr.toString().trim()}`
      );
    }
    await Bun.$`git -C ${worktree.root} worktree prune`.quiet().nothrow();
  }

  /** Discarding a side quest throws its transcript away too. */
  async #removeQuestSession(instanceId: string): Promise<void> {
    const quest = this.#quests.get(instanceId);
    this.#quests.delete(instanceId);
    if (!quest?.sessionId) {
      return;
    }
    await harnessOf(quest.harness)?.deleteSession(quest.sessionId, quest.dir);
  }

  async #fs(payload: FsPayload): Promise<void> {
    const { requestId } = payload;
    try {
      this.sink({
        kind: "control_result",
        requestId,
        ok: true,
        result: await runFs(payload),
      });
    } catch (error) {
      this.sink({
        kind: "control_result",
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #control({
    instanceId,
    harness: kind,
    requestId,
    method,
    args = [],
  }: ControlPayload): Promise<void> {
    try {
      const result = await this.#call(instanceId, kind, method, args);
      this.sink({
        kind: "control_result",
        instanceId,
        requestId,
        ok: true,
        // The mode is acknowledged only after the harness applied it. The hub
        // persists this receipt for both socket controls and REST changes.
        result:
          method === CONTROL_SET_PERMISSION_MODE
            ? { permissionMode: args[0] }
            : result,
      });
    } catch (error) {
      this.sink({
        kind: "control_result",
        instanceId,
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** The stored sessions of every harness, merged and newest-first. */
  async #listSessions(args: unknown[]): Promise<NeutralSessionInfo[]> {
    const options = (args[0] ?? {}) as { limit?: number; dir?: string };
    const all: NeutralSessionInfo[] = [];
    for (const adapter of harnesses()) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each harness's sessions are appended to the shared `all` array in a stable order
        all.push(...(await adapter.listSessions(options.dir)));
      } catch (error) {
        warn(`listSessions on ${adapter.kind} failed: ${error}`);
      }
    }
    all.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
    return options.limit ? all.slice(0, options.limit) : all;
  }

  readonly #mcpLauncherFailures = new Map<string, string>();

  /** Converges the fleet across every harness that has a profile, merged into one report. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges every FleetSyncReport field across harnesses field-by-field, on purpose (see the comments below on why nothing is dropped)
  async #syncFleet(
    incoming: FleetConfig | undefined,
    which: "syncFleet" | "fleetStatus"
  ): Promise<FleetSyncReport> {
    // The daemon's connection names a hub reachable from this machine.
    if (incoming) {
      this.#mcpLauncherFailures.clear();
    }
    const config = incoming && {
      ...incoming,
      mcp: await Promise.all(
        incoming.mcp.map(async (row) => {
          if (!row.enabled) {
            return row;
          }
          const launcher = await prepareFleetMcp(row.name, row.config);
          if ("failure" in launcher) {
            this.#mcpLauncherFailures.set(row.name, launcher.failure);
            return { ...row, enabled: false };
          }
          const local = { ...row, config: launcher.config };
          return local.proxied && "url" in local.config
            ? {
                ...local,
                config: {
                  ...local.config,
                  url: harnessMcpUrl(
                    `/mcp/fleet/${encodeURIComponent(row.name)}`
                  ),
                },
              }
            : local;
        })
      ),
    };
    type State = import("@cawco/core").FleetItemState;
    const mcp: FleetSyncReport["mcp"] = {};
    const mcpByHarness: NonNullable<FleetSyncReport["mcpByHarness"]> = {};
    const mcpFailures = new Map<HarnessKind, string>();
    const marketplaces: FleetSyncReport["marketplaces"] = {};
    const plugins: FleetSyncReport["plugins"] = {};
    const skills: Record<string, State> = {};
    // Merged rather than dropped. This rebuilds the machine's one word from
    // each harness's, and every field it does not name is a field the hub never
    // hears about — which is how the memory documents, the memory hook, the
    // hooks and (once it existed) `have` all went missing between a daemon that
    // reported them and a hub that had nowhere to read them from.
    const memoryDocs: Record<string, State> = {};
    const hooks: Record<string, State> = {};
    // One set per harness that converges the thing, INTERSECTED below — never
    // unioned. Skills are written by more than one harness into more than one
    // directory (claude's `~/.claude/skills`, pi's own), so a hash one of them
    // holds is not a hash the machine holds: leaving those bytes out would
    // strand every harness that still needs them. A harness that converges none
    // reports no set and is not counted, which is why opencode — which reads
    // claude's directory rather than keeping its own — does not veto every
    // skill on the machine.
    const skillClaims: Record<string, string>[] = [];
    const pluginClaims: Record<string, string>[] = [];
    let memory: FleetSyncReport["memory"];
    let memoryHook: FleetSyncReport["memoryHook"];
    // Merged the same way, and it has to be: the toolchain is what attributes a
    // CLI failure to a binary, and a field this rebuild does not name is a field
    // the hub never hears about.
    let toolchain: FleetSyncReport["toolchain"];
    for (const adapter of harnesses()) {
      const apply =
        which === "syncFleet" ? adapter.syncFleet : adapter.fleetStatus;
      if (!apply) {
        continue;
      }
      try {
        const report =
          which === "syncFleet"
            ? // biome-ignore lint/performance/noAwaitInLoops: each harness's report is merged into the shared accumulators before the next runs
              // biome-ignore lint/style/noNonNullAssertion: `apply` was checked truthy above, and it is exactly `adapter.syncFleet` on this branch
              await adapter.syncFleet!(config as FleetConfig)
            : // biome-ignore lint/style/noNonNullAssertion: `apply` was checked truthy above, and it is exactly `adapter.fleetStatus` on this branch
              await adapter.fleetStatus!();
        mcpByHarness[adapter.kind] = report.mcp;
        Object.assign(marketplaces, report.marketplaces);
        Object.assign(plugins, report.plugins);
        Object.assign(skills, report.skills ?? {});
        Object.assign(memoryDocs, report.memoryDocs ?? {});
        Object.assign(hooks, report.hooks ?? {});
        if (report.have?.skills) {
          skillClaims.push(report.have.skills);
        }
        if (report.have?.plugins) {
          pluginClaims.push(report.have.plugins);
        }
        if (report.memory) {
          ({ memory } = report);
        }
        if (report.memoryHook) {
          ({ memoryHook } = report);
        }
        if (report.toolchain) {
          toolchain = { ...toolchain, ...report.toolchain };
        }
      } catch (error) {
        warn(`${which} on ${adapter.kind} failed: ${error}`);
        mcpFailures.set(adapter.kind, String(error));
        mcpByHarness[adapter.kind] = Object.fromEntries(
          (config?.mcp ?? []).map((row) => [
            row.name,
            { state: "failed", detail: `${adapter.kind}: ${String(error)}` },
          ])
        );
      }
    }
    const names = new Set([
      ...this.#mcpLauncherFailures.keys(),
      ...Object.values(mcpByHarness).flatMap((rows) => Object.keys(rows ?? {})),
    ]);
    for (const [kind, detail] of mcpFailures) {
      mcpByHarness[kind] = Object.fromEntries(
        [...names].map((name) => [name, { state: "failed", detail }])
      );
    }
    for (const report of Object.values(mcpByHarness)) {
      for (const [name, detail] of this.#mcpLauncherFailures) {
        report[name] = { state: "failed", detail };
      }
    }
    for (const name of names) {
      const readings = Object.entries(mcpByHarness).flatMap(([kind, rows]) =>
        rows?.[name] ? [{ kind, item: rows[name] }] : []
      );
      const worst = worstFleetState(readings.map((reading) => reading.item));
      mcp[name] = {
        ...worst,
        detail: readings
          .map(
            ({ kind, item }) =>
              `${kind}: ${item.state}${item.detail ? ` — ${item.detail}` : ""}`
          )
          .join("\n"),
      };
    }
    return {
      mcp,
      mcpByHarness,
      marketplaces,
      plugins,
      skills,
      memoryDocs,
      hooks,
      ...(memory ? { memory } : {}),
      ...(memoryHook ? { memoryHook } : {}),
      ...(toolchain ? { toolchain } : {}),
      have: {
        skills: agreedHashes(skillClaims),
        plugins: agreedHashes(pluginClaims),
      },
      at: Date.now(),
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches to whichever catalog/harness/daemon method the control names, each a distinct branch
  async #call(
    instanceId: string | undefined,
    kind: HarnessKind | undefined,
    method: string,
    args: unknown[]
  ): Promise<unknown> {
    if (instanceId === undefined) {
      const daemonFn = this.#daemonFunctions[method];
      if (daemonFn) {
        return await daemonFn(...args);
      }

      if (method === "listRepos") {
        return await listRepos();
      }
      if (method === CONTROL_GIT_CHANGES) {
        return await gitChanges(args[0] as string, args[1] as string);
      }
      if (method === "listTools") {
        return await probeTools();
      }
      if (method === "installTool") {
        return await installTool(
          args[0] as string,
          args[1] as string | undefined
        );
      }

      // Fleet sync applies to every harness that has a machine profile: the hub
      // sends one desired state, and each harness converges the parts it
      // understands onto its own files. Reports merge into one machine word.
      if (method === FLEET_SYNC) {
        // Fleet sync writes machine-wide harness config (claude's, opencode's
        // and pi's); only the machine's own agent may (see machine-agent.ts).
        if (!(await isMachineAgent())) {
          throw new Error(
            "fleet sync skipped: this is not the machine's agent, so machine-wide harness config is left to the agent that is"
          );
        }
        return await this.#syncFleet(args[0] as FleetConfig, "syncFleet");
      }
      if (method === FLEET_STATUS) {
        return await this.#syncFleet(undefined, "fleetStatus");
      }

      if (method === "listSessions") {
        return await this.#listSessions(args);
      }
      if (CATALOG_METHODS.has(method)) {
        const adapter = this.#adapter(kind);
        switch (method) {
          case "getSessionInfo":
            return await adapter.getSessionInfo(
              args[0] as string,
              dirOf(args[1])
            );
          case "getSessionMessages":
            return await adapter.getSessionMessages(
              args[0] as string,
              dirOf(args[1]),
              (args[1] as { tail?: number } | undefined)?.tail,
              (args[1] as { whole?: boolean } | undefined)?.whole
            );
          case "renameSession":
            return await adapter.renameSession(
              args[0] as string,
              args[1] as string,
              dirOf(args[2])
            );
          case "tagSession":
            await adapter.tagSession(
              args[0] as string,
              // biome-ignore lint/suspicious/noUnnecessaryConditions: `args` is `unknown[]` off the wire; the cast tells TS args[1] is a string, but at runtime it can genuinely be absent
              (args[1] as string) ?? null,
              dirOf(args[2])
            );
            this.#closeTagging(args[0]);
            return undefined;
          case "deleteSession":
            return await adapter.deleteSession(
              args[0] as string,
              dirOf(args[1])
            );
          default:
            break;
        }
      }

      // A machine-scoped control only one harness knows: try the named harness,
      // then every harness, until one claims it.
      if (kind) {
        const adapter = this.#adapter(kind);
        if (adapter.machine) {
          const answer = await adapter.machine(method, args);
          if (answer !== undefined) {
            return answer;
          }
        }
      }
      for (const adapter of harnesses()) {
        if (adapter.machine) {
          // biome-ignore lint/performance/noAwaitInLoops: harnesses are tried in order and the loop returns on the first that claims the control
          const answer = await adapter.machine(method, args);
          if (answer !== undefined) {
            return answer;
          }
        }
      }
      throw new Error(`unknown session function: ${method}`);
    }

    if (method === RESOLVE_PERMISSION) {
      this.#session(instanceId).resolvePermission(
        args[0] as string,
        args[1] as PermissionResult
      );
      this.#settleAsk(instanceId, args[0] as string);
      return undefined;
    }
    return await this.#session(instanceId).control(method, args);
  }

  #session(instanceId: string): HarnessSession {
    const session = this.#sessions.get(instanceId);
    if (!session) {
      throw new Error(`no session ${instanceId}`);
    }
    return session;
  }

  #settleAsk(instanceId: string, requestId: string): void {
    const ask = this.#openAsks.get(requestId);
    if (!(ask && "instanceId" in ask) || ask.instanceId !== instanceId) {
      return;
    }
    this.#openAsks.delete(requestId);
    // The hub parks every ask until it hears it is over; an ask the harness
    // settled itself would otherwise stay on every board.
    this.sink({ kind: "permission_settled", instanceId, requestId });
    const left = (this.#pulseBlocked.get(instanceId) ?? 1) - 1;
    if (left === 0) {
      this.#pulseBlocked.delete(instanceId);
    } else {
      this.#pulseBlocked.set(instanceId, left);
    }
    this.#emitPulse(instanceId, true);
  }
}
