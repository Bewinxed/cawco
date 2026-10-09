/**
 * Owns every live session on this machine — across every harness — and pumps
 * their neutral frames at the hub. Harness-agnostic: the git worktrees, side
 * spin-offs, busy tracking, bootstrap clone and the routing live here; the actual
 * sessions are {@link HarnessSession}s produced by the adapters in
 * `./harnesses`. Nothing here interprets a harness's own event — frames go out
 * as neutral messages, with the harness's `raw` event riding along.
 */

import { mkdir, rm, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import type {
  AgentBusyReport,
  CarrySessionOutcome,
  CarrySessionRequest,
  ControlPayload,
  DaemonPermissionRequestFrame,
  Envelope,
  FleetConfig,
  FleetHoldings,
  FleetSyncReport,
  FramePayload,
  FrameProvenance,
  FsPayload,
  GitChanges,
  HarnessKind,
  IngestMark,
  NeutralMessage,
  NeutralResultMessage,
  NeutralSessionInfo,
  PermissionResult,
  RepoInfo,
  ReposResult,
  SendPayload,
  SessionAddress,
  SessionPulse,
  SpawnPayload,
  StopPayload,
} from "@cawco/core";
import {
  ACCOUNT_READ,
  AGENT_BUSY,
  alreadyIngested,
  BOUNDARY_RELAUNCH,
  CAWCO_SCRATCH_TAG,
  CONTROL_CARRY_SESSIONS,
  CONTROL_GIT_CHANGES,
  CONTROL_QUERIES,
  CONTROL_RESTLESS,
  CONTROL_RUN_COMMAND,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SLEEP,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  FLEET_STATUS,
  FLEET_SYNC,
  GENERATE_IMAGE,
  INSTALL_SESSION_CREDENTIAL,
  MESSAGES_READ,
  machineLabel,
  PREVIEW_START,
  PREVIEW_STOP,
  promptCacheUsage,
  RATE_LIMIT_READ,
  READ_FLEET_HOLDINGS,
  REPEATED_FAILURE,
  REPEATED_FAILURE_LIMIT,
  RESOLVE_PERMISSION,
  readIngested,
  repoPath,
  resumeCursor,
  VERIFY_SESSION_CREDENTIAL,
  WITHDRAW_PERMISSION,
  withWorktreeLine,
  worstFleetState,
} from "@cawco/core";
import {
  AGENT_RESTARTING,
  mergeHolds,
  type RestartHold,
} from "@cawco/core/binary-updates";
import { SAFE_GIT, SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import {
  processLimitSentence,
  SESSIOND_PROCESS_LIMIT,
  sessiondEndpoint,
} from "@cawco/core/sessiond";
import { Effect } from "effect";
import { withFiles } from "./attachments";
import { type Boundary, boundaryFor, shellQuote } from "./boundary";
import { carryRefusal, carrySessions } from "./claude-sessions";
import { fetchDefaultBranch, hostGit } from "./clone";
import { harnessMcpUrl } from "./delegation";
import { expandHome, runFs } from "./fs";
import type { Harness, HarnessContext, HarnessSession } from "./harness";
import {
  HarnessRecoveryRefused,
  HeldProcessRefused,
  HubContractRefused,
  type KeeperRefused,
  SessionAddressRefused,
} from "./harness";
import { harnesses, harness as harnessOf } from "./harnesses";
import { hashText, readJson, writeJson } from "./harnesses/fleet-common";
import { generateImage } from "./image-generation";
import { isMachineAgent } from "./machine-agent";
import { prepareFleetMcp } from "./mcp-launcher";
import { startPreview, stopPreview, stopPreviews } from "./preview";
import { parseProcId, SESSION_PROC_KINDS } from "./proc-id";
import { type PromptWriteNotice, withPromptWrites } from "./prompt-writes";
import { rememberCredential } from "./redaction";
import { fenced } from "./restart";
import { endProc, procEpoch, SessiondClient } from "./sessiond-client";
import { installTool, probeTools } from "./tools";
import { runWorkflowCommand } from "./workflow-command";
import { workspaceHolding } from "./workspace-records";

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
      /** The stored mode, known before the attach replays a parked ask. */
      permissionMode?: SpawnPayload["permissionMode"];
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
    processGeneration?: string;
    keepAliveTurn?: string;
    permissionMode?: SpawnPayload["permissionMode"];
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
  frame: (
    | Exclude<
        FramePayload,
        { kind: "instances" | "instances_delta" | "permission_request" }
      >
    | DaemonPermissionRequestFrame
  ) &
    Partial<FrameProvenance> & { processGeneration?: string }
) => boolean;

/**
 * Whether a frame is an account reading: those name the launch that read
 * them, so the hub keeps each for the account that launch runs on and drops
 * one from a process its row has since replaced.
 */
const accountReading = (message: NeutralMessage): boolean =>
  message.type === "system" &&
  (message.subtype === ACCOUNT_READ || message.subtype === RATE_LIMIT_READ);

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

/** The checkout a spin-off ran in, kept until the spin-off is discarded. */
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
 * A spin-off's transcript, kept out of the catalogs the rails read. The tag
 * is the whole test there, so the harness that owns the session applies it.
 */
interface SpinOff {
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

/**
 * How long a session stays at rest before its processes are stopped: no turn
 * running, nothing it asked still open, nothing it runs in the background,
 * nothing it scheduled. Ours: half an hour is past any pause inside a piece of
 * work, and short enough that a day's finished sessions do not add up. A
 * session's harness, its MCP servers and their browsers stayed up for as long
 * as sessiond did; with about a dozen sessions working, 103 harness processes
 * and 136 MCP server sets were alive when the machine ran out of memory
 * (2026-10-04).
 */
export const IDLE_SLEEP_MS = 30 * 60_000;

/** How often the sessions at rest are looked at. Ours: a minute is as fine as half an hour is read. */
const IDLE_SWEEP_MS = 60_000;

/**
 * How long a send that crossed a session's sleep is held for the process the
 * hub's wake starts. Ours: the hub wakes it on hearing of the sleep, one
 * socket round trip later; a minute is past any ordering of the two.
 */
const CROSSED_HOLD_MS = 60_000;

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
 * In a workspace's clone they run inside its boundary, as every git call
 * there does (`safe-git.ts`): its config and hooks are the workspace's to
 * write, and `git status` runs what they name (an fsmonitor, a filter).
 */
const gitChanges = async (cwd: string, since: string): Promise<GitChanges> => {
  const dir = expandHome(cwd);
  const workspace = await workspaceHolding(dir);
  const git = async (args: string) =>
    workspace
      ? await runWorkflowCommand(
          dir,
          `${SAFE_GIT_SHELL}git ${args}`,
          GIT_CHANGES_TIMEOUT_MS,
          workspace
        )
      : await runWorkflowCommand(
          dir,
          `${SAFE_GIT} ${args}`,
          GIT_CHANGES_TIMEOUT_MS
        );
  const status = await git("status --porcelain");
  if (status.exitCode !== 0) {
    return { repo: false };
  }
  const log = await git(
    `log --since=${shellQuote(since)} --name-status ${shellQuote("--format=%h %s")}`
  );
  return {
    repo: true,
    status: status.stdout,
    log: log.stdout,
  };
};

/** How long each of {@link gitChanges}' two git commands may take. */
const GIT_CHANGES_TIMEOUT_MS = 30_000;

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
/** A reason's own full stop, dropped where a sentence carries on after it. */
const FINAL_STOP = /\.$/;
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
      // A partial cross-harness catalog cannot prove that a conversation is gone.
      return undefined;
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
 * harnesses keep no copy: it is then sent everything.
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
  #hubContract = false;
  readonly #hubRefusal =
    "The hub has not restarted onto this build yet. Restart the hub, then retry.";

  setHubContract(supported: boolean): void {
    this.#hubContract = supported;
  }

  declareHubContract(supported: boolean): void {
    this.setHubContract(supported);
    if (!supported) {
      for (const pending of this.#addressWaiting.values()) {
        pending.ack.reject(new HubContractRefused(this.#hubRefusal));
      }
    }
  }

  #stopSequence = 0;

  get stopSequence(): number {
    return this.#stopSequence;
  }

  resetStopSequence(): void {
    this.#stopSequence = 0;
  }

  receivedStop(sequence: number): void {
    this.#stopSequence = Math.max(this.#stopSequence, sequence);
  }
  #custodyState: AgentBusyReport["recovery"] = "recovering";
  #custodyError: string | undefined;
  #custodyEpoch = 0;
  #custodyInstances = new Set<string>();

  constructor() {
    this.#adapter("opencode").setCustodyReadiness?.(() => this.custodyReady);
    setInterval(() => {
      this.#sweepIdle().catch((error: unknown) =>
        warn(`the idle sweep failed: ${error}`)
      );
    }, IDLE_SWEEP_MS).unref();
  }

  async removedSessionCustody(
    rows: { id: string; sessionId: string | null; cwd: string }[],
    claimed: string[]
  ): Promise<{ id: string; present: boolean | null }[]> {
    const adapter = this.#adapter("opencode");
    return await Promise.all(
      rows.map(async (row) => {
        try {
          if (row.sessionId) {
            if (!adapter.sessionPresent) {
              throw new Error("No complete server-session reading available.");
            }
            return {
              id: row.id,
              present: await adapter.sessionPresent(row.sessionId, row.cwd),
            };
          }
          if (!adapter.unclaimedRunners) {
            throw new Error("No complete runner reading available.");
          }
          const reading = await adapter.unclaimedRunners(row.cwd, claimed);
          return { id: row.id, present: reading.count === 0 ? false : null };
        } catch {
          return { id: row.id, present: null };
        }
      })
    );
  }
  readonly #sessions = new Map<string, HarnessSession>();
  /**
   * When each carried session was last seen doing, or holding, anything: the
   * moment its rest is counted from ({@link IDLE_SLEEP_MS}). Moved by every
   * turn starting or ending, every ask parked or settled and every send, and
   * by each sweep that finds the session not at rest.
   */
  readonly #activeAt = new Map<string, number>();
  /**
   * The sessions this daemon put to sleep, each with the sends that reached
   * it after: the hub sent them before it heard, and they go to the process
   * its wake starts ({@link sleep}).
   */
  readonly #asleep = new Map<string, SendPayload[]>();
  readonly #generations = new Map<string, string>();
  readonly #addressWaiting = new Map<
    string,
    {
      sessionId: string;
      generation: string;
      ack: ReturnType<typeof Promise.withResolvers<void>>;
    }
  >();
  readonly #addressAcknowledged = new Map<
    string,
    { sessionId: string; generation: string }
  >();
  readonly #addressCancelled = new Set<string>();
  readonly #failures = new Map<string, string>();
  /** Each spawned session's title, as its spawn named it: what a failure that names the session calls it. */
  readonly #titles = new Map<string, string>();
  /** Spawn failures the sink could not send, until a connection takes them. */
  readonly #unsentFailures = new Map<string, Parameters<FrameSink>[0]>();
  /**
   * Sessions whose process the keeper refused its input ({@link KeeperRefused}),
   * until their next start: every send that reaches one goes back to the hub,
   * held for that start ({@link #holdSend}).
   */
  readonly #keeperRefused = new Map<string, KeeperRefused>();
  /**
   * Each session's sends handed to its harness and not yet read, whole, by
   * uuid: what a refusal of the process's input hands back to the hub.
   */
  readonly #handed = new Map<string, Map<string, SendPayload>>();
  /** Held sends the sink could not send, until a connection takes them. */
  readonly #unsentHeld: Parameters<FrameSink>[0][] = [];
  /** Reattaches in flight, by instance id: see {@link reattach}. */
  readonly #adopting = new Map<string, Promise<void>>();
  /** Outlives its session: a discard can arrive after the query already ended. */
  readonly #worktrees = new Map<string, Worktree>();
  /** Spin-offs running here, by instance — for the same reason, same lifetime. */
  readonly #spinOffs = new Map<string, SpinOff>();
  /** One chain per instance, so envelopes about it are handled in arrival order. */
  readonly #queues = new Map<string, Promise<void>>();
  /** The sessions with a turn in flight — from the `send` that starts one until the turn ends. */
  readonly #busy = new Set<string>();
  /** Attached sessions whose CLI runs a boundary hook that fails open, until the relaunch that replaces it ({@link BOUNDARY_RELAUNCH}). */
  readonly #failOpen = new Set<string>();
  readonly #keepAlive = new Map<string, string>();
  /**
   * Each session's run of identical failed turns since its last send: the
   * failure's words and how many times in a row ({@link #watchFailure}).
   */
  readonly #failureRun = new Map<string, { words: string; count: number }>();
  readonly #cacheCold = new Set<string>();
  readonly #realPromptEpoch = new Map<string, number>();
  #promptEpoch = 0;
  #promptWrites = 0;
  readonly #observePromptWrite = ({
    phase,
    reason,
    at,
  }: PromptWriteNotice): void => {
    this.#promptEpoch += 1;
    this.#promptWrites += phase === "begin" ? 1 : -1;
    for (const [id, session] of this.#sessions) {
      if (session.harness === "claude") {
        this.#cacheCold.add(id);
      }
    }
    this.sink({ kind: "cache_invalidated", reason, at });
  };
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
    // A generation runs in this process, so a restart cuts it: none starts behind a raised fence.
    [GENERATE_IMAGE]: (_instanceId, cwd, input) =>
      fenced()
        ? Promise.reject(new Error(AGENT_RESTARTING))
        : generateImage(cwd as string, input),
    [PREVIEW_START]: (options) =>
      startPreview(options as Parameters<typeof startPreview>[0]),
    [PREVIEW_STOP]: (options) => stopPreview(options as { instanceId: string }),
    [AGENT_BUSY]: () => this.busyNow(),
  };

  /** Register a machine-scoped control method, callable without an instanceId. */
  registerDaemonFunction(name: string, fn: ControlMethod): void {
    this.#daemonFunctions[name] = fn;
  }

  /**
   * Re-pointed at each hub connection; says whether the frame went out. Frames
   * produced while the hub is away are dropped; the hub replays what a session
   * is still blocked on by calling `control reinitialize` after it reconnects,
   * and a spawn's failure is replayed from here ({@link replaySpawnFailures}).
   */
  sink: FrameSink = () => false;
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
   * body exactly as it was sunk. A hub that was away when one was asked never
   * heard it, while this daemon holds the callback: the session would block
   * on an answer nobody can send. Replayed after every registration
   * (replayOpenAsks); the hub re-parks and re-notifies only what it does not
   * already know.
   */
  readonly #openAsks = new Map<string, Parameters<FrameSink>[0]>();
  /**
   * The asks that ended while no hub was listening, by requestId: the hub
   * keeps what it parked across its own restart, so an end it never heard
   * would leave the ask on every screen. Said after the next registration.
   */
  readonly #unheardSettles = new Map<string, Parameters<FrameSink>[0]>();

  /** Re-sinks every unresolved ask, and every ask's end the hub missed — called by the daemon after register. */
  replayOpenAsks(): void {
    for (const [requestId, body] of this.#unheardSettles) {
      if (this.sink(body)) {
        this.#unheardSettles.delete(requestId);
      }
    }
    for (const body of this.#openAsks.values()) {
      this.sink(body);
    }
  }

  /** Settles once the envelope has been handled, success or failure alike. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: address ACK bypasses the queue waiting on that same ACK
  dispatch(envelope: Envelope): Promise<void> {
    const control =
      envelope.verb === "control"
        ? (envelope.payload as ControlPayload)
        : undefined;
    if (control?.method === "acknowledgeSessionAddress") {
      const id = envelope.instanceId ?? control.instanceId ?? "";
      const pending = this.#addressWaiting.get(id);
      if (
        pending &&
        pending.sessionId === control.args?.[0] &&
        pending.generation === control.args?.[1]
      ) {
        if (control.args?.[2] === true) {
          this.#addressAcknowledged.set(id, {
            sessionId: pending.sessionId,
            generation: pending.generation,
          });
          pending.ack.resolve();
        } else {
          this.#addressCancelled.add(id);
          pending.ack.reject(
            new SessionAddressRefused(
              "The session ended before its address was acknowledged."
            )
          );
        }
      }
      return Promise.resolve();
    }
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
    } else if (control?.method === CONTROL_WORKSPACE_CREATE) {
      // A late create must finish before its discard; different workspace ids do not queue together.
      key = `workspace:${String(control.args?.[1])}`;
    } else if (
      control?.method === CONTROL_WORKSPACE_ARCHIVE ||
      control?.method === CONTROL_WORKSPACE_BUNDLE ||
      control?.method === CONTROL_WORKSPACE_AT
    ) {
      key = `workspace:${(control.args?.[0] as { id?: string } | undefined)?.id}`;
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

  get sessionAddresses(): SessionAddress[] {
    const addresses = new Map<string, SessionAddress>();
    for (const [instanceId, session] of this.#sessions) {
      if (session.harness === "opencode" && session.sessionId) {
        addresses.set(instanceId, {
          instanceId,
          sessionId: session.sessionId,
          processGeneration: this.#generations.get(instanceId),
        });
      }
    }
    for (const [instanceId, pending] of this.#addressWaiting) {
      addresses.set(instanceId, {
        instanceId,
        sessionId: pending.sessionId,
        processGeneration: pending.generation,
      });
    }
    for (const address of this.#adapter("opencode").sessionAddresses?.() ??
      []) {
      addresses.set(address.instanceId, {
        ...address,
        processGeneration: this.#generations.get(address.instanceId),
      });
    }
    return [...addresses.values()];
  }

  replaySessionAddresses(): void {
    for (const address of this.sessionAddresses) {
      if (address.processGeneration) {
        this.sink({
          kind: "session_address",
          ...address,
          processGeneration: address.processGeneration,
        });
      }
    }
  }

  /** Custody includes in-flight session operations so a late spawn cannot become ownerless. */
  get custodyInstanceIds(): string[] {
    return [
      ...new Set([
        ...this.#sessions.keys(),
        ...this.#adopting.keys(),
        ...[...this.#queues.keys()].filter((key) => key && !key.includes(":")),
      ]),
    ];
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

  /** Whether custody is ready now: false when the hub refused its contract (reported as a failure) or a newer epoch began. */
  completeCustody(epoch: number): boolean {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: register declarations mutate this connection-local contract before custody completion
    if (!this.#hubContract) {
      this.failCustody(epoch, new HubContractRefused(this.#hubRefusal));
      return false;
    }
    if (epoch !== this.#custodyEpoch) {
      return false;
    }
    this.#custodyState = "ready";
    this.#custodyError = undefined;
    this.#custodyInstances.clear();
    return true;
  }

  /**
   * The hub connection ended. Custody goes back to recovering under a new
   * epoch, naming the sessions held now, until the next connection's register
   * decides it: so the epoch that ended, completed or still recovering, can
   * neither complete nor fail any more. Not a failure: recovering holds every
   * idle-gated operation as failed did, and a recovery on the next connection
   * that does not complete is reported then (`failCustody`).
   */
  loseCustody(): void {
    this.beginCustody([
      ...new Set([...this.#custodyInstances, ...this.custodyInstanceIds]),
    ]);
  }

  /**
   * A recovery that did not complete: the register went unanswered, an
   * attempt failed or ran out of time, or the hub refused the contract. Said
   * to every session it named and in the log, and idle-gated operations stay
   * held. Only for the epoch in progress: one that completed was recovered,
   * and losing the connection after that begins a new one (`loseCustody`).
   *
   * What happens next depends on the cause. An unanswered register is sent
   * again, and a failed attempt is made again, on the same connection
   * (daemon.ts `registrationExpired`, `takeCustody`). A refused contract is
   * not: the hub answers every register with the contract its build has
   * (server.ts `registerAck`), and this agent reads it once per connection,
   * from that connection's first register ack (daemon.ts `beforeAck`), so
   * only a new connection to a hub on a build with the contract changes it.
   */
  failCustody(epoch: number, problem: unknown): void {
    if (epoch !== this.#custodyEpoch || this.#custodyState === "ready") {
      return;
    }
    this.#custodyState = "failed";
    this.#custodyError =
      problem instanceof Error ? problem.message : String(problem);
    const next =
      problem instanceof HubContractRefused
        ? "It's tried again when the hub next restarts and this machine registers"
        : "Recovery retries while connected";
    const message = `Machine custody recovery failed: ${this.#custodyError.replace(FINAL_STOP, "")}. ${next}; idle-gated operations remain held.`;
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
   * The sessions mid-turn right now, with undecided custody counted busy: the
   * answer {@link AGENT_BUSY} gives over the wire, for the hub's keep-alive and
   * for a restart of the session keeper, which kills the turns. An agent
   * restart reads {@link restartHolds} instead: the keeper runs a turn on
   * through one.
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

  /**
   * What an agent restart would cut that only the supervisor can see; what
   * runs elsewhere in this process holds for itself (`restart.ts`). A running
   * turn is not on it, nor an ask waiting for its answer: the keeper holds the
   * child, and the next agent attaches to it and parks the ask again.
   *
   * - custody not decided yet: a restart now starts the takeover over;
   * - a session start, or a reattach, in flight;
   * - an image generation, a workspace being cut and a command the hub asked
   *   for, each of which runs in this process (their queues name them);
   * - each harness's own operations ({@link Harness.restartHolds}).
   */
  restartHolds(): RestartHold[] {
    const queued = (prefix: string): string[] =>
      [...this.#queues.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
    return mergeHolds(
      this.custodyReady
        ? [{ reason: "starting", ids: [...this.#adopting.keys()] }]
        : [
            {
              reason: "custody",
              ids: [...this.#custodyInstances, `machine:${this.#custodyState}`],
            },
          ],
      [
        { reason: "image", ids: [...this.#imageRequests.keys()] },
        { reason: "workspace", ids: queued("workspace:") },
        { reason: "command", ids: queued("command:") },
      ],
      ...harnesses().map((adapter) => adapter.restartHolds?.() ?? [])
    );
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
    if (!this.#speaksFor(instanceId) || this.#keepAlive.has(instanceId)) {
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
   * The carried sessions the hub wants kept awake, as its last heartbeat ack
   * listed them (`HeartbeatAckPayload.keepAwake`): what only the hub knows of
   * and only the session's process can serve, today a keep-alive's pings.
   * Not known until a hub has said, and no session sleeps before then.
   */
  #keptAwake: ReadonlySet<string> | undefined;

  /** The hub's heartbeat ack: the whole list, replacing the last. */
  keepAwake(ids: unknown): void {
    if (Array.isArray(ids)) {
      this.#keptAwake = new Set(
        ids.filter((id): id is string => typeof id === "string")
      );
    }
  }

  /** A carried session did something: its rest is counted from now. */
  #touch(instanceId: string): void {
    if (this.#sessions.has(instanceId)) {
      this.#activeAt.set(instanceId, Date.now());
    }
  }

  /**
   * A session taken over from the agent before this one has been at rest
   * since it last wrote, not since this agent met it, and its harness's own
   * catalog dates that. Counted from the meeting instead, every agent restart
   * (which every deploy is) would start each idle session's half hour again.
   */
  async #dateActivity(
    instanceId: string,
    adapter: Harness,
    session: HarnessSession,
    cwd: string
  ): Promise<void> {
    const met = Date.now();
    this.#activeAt.set(instanceId, met);
    if (!session.sessionId) {
      return;
    }
    const info = await adapter
      .getSessionInfo(session.sessionId, cwd)
      .catch(() => undefined);
    // Unless it has done something since, or is no longer this session.
    if (
      info?.lastModified &&
      this.#sessions.get(instanceId) === session &&
      this.#activeAt.get(instanceId) === met
    ) {
      this.#activeAt.set(instanceId, Math.min(met, info.lastModified));
    }
  }

  /**
   * Why a carried session cannot be put to sleep now, in words; nothing when
   * it is at rest. THE list of what stopping its processes would lose:
   *
   *  - a turn that is running, a send still on its way into one included (a
   *    harness is busy from the moment it is handed a send);
   *  - an ask or a permission it parked: the answer goes to the process that
   *    asked, and no other;
   *  - a subagent, a background command, a monitor or a workflow it started
   *    and that is still running;
   *  - a wake-up it scheduled for itself (a cron, a loop's next tick): the
   *    timer lives in its process;
   *  - a prompt cache the hub's keep-alive is pinging to keep warm: a ping is
   *    a turn of this process, and the hub sends none to a sleeping session
   *    ({@link keepAwake});
   *  - a conversation not stored yet: a session that has never taken a turn
   *    has nothing to wake from.
   *
   * `serverBusy` is opencode's own word on its turns ({@link Harness.busyInstances}),
   * which no local set can stand in for; a sweep reads it once for every
   * session it looks at.
   *
   * `unsure` marks the answers that are not the session doing or holding
   * anything, only this daemon unable to tell yet: its custody still being
   * decided, opencode's server not saying. They keep it up for now and leave
   * its rest counted from where it was.
   */
  async #awake(
    instanceId: string,
    session: HarnessSession,
    serverBusy?: string[],
    /** The hub's keep-alive is left out: {@link CONTROL_RESTLESS} asks for the rest alone. */
    keepAliveAside = false
  ): Promise<{ why: string; unsure?: true } | undefined> {
    if (this.#adopting.has(instanceId)) {
      return { why: "its custody is still being decided", unsure: true };
    }
    for (const ask of this.#openAsks.values()) {
      if ("instanceId" in ask && ask.instanceId === instanceId) {
        return { why: "an ask is waiting for its answer" };
      }
    }
    if (this.#busy.has(instanceId)) {
      return { why: "a turn is running" };
    }
    if ((this.#pulseSubagents.get(instanceId)?.size ?? 0) > 0) {
      return { why: "a subagent is running" };
    }
    if (!session.sessionId) {
      return { why: "it has no conversation to wake from yet" };
    }
    if (!(keepAliveAside || this.#keptAwake)) {
      return {
        why: "the hub has not yet said which sessions it keeps awake",
        unsure: true,
      };
    }
    if (!keepAliveAside && this.#keptAwake?.has(instanceId)) {
      return { why: "the hub is keeping its prompt cache warm" };
    }
    const held = session.holding?.();
    if (held) {
      return { why: held };
    }
    if (session.harness === "opencode") {
      const busy =
        serverBusy ?? (await this.#adapter("opencode").busyInstances?.()) ?? [];
      if (busy.includes(instanceId)) {
        return { why: "the opencode server reports its turn running" };
      }
      // `opencode:…` is the server's activity not known, or an operation of
      // the adapter's own in flight: no word on this session either way.
      if (busy.some((id) => id.startsWith("opencode:"))) {
        return {
          why: "the opencode server cannot say whether a turn is running",
          unsure: true,
        };
      }
    }
    return undefined;
  }

  /**
   * PUTS A SESSION TO SLEEP when it is at rest ({@link #awake}): everything
   * it runs is stopped — the harness, the MCP servers it started and their
   * browsers, through the adapter's own stop — and the hub is told, which
   * files the row `sleeping`. Its conversation stays where its harness stores
   * it, and the hub's wake starts it again from there on its next message.
   *
   * Run on the session's own queue, behind whatever was already on its way to
   * it and ahead of whatever follows, so it is decided against the sends that
   * came before and the ones after find it asleep. A send the hub sent before
   * it heard is held here and handed to the process the hub's wake starts:
   * the hub starts one as soon as it hears, for exactly those.
   */
  async sleep(
    instanceId: string
  ): Promise<{ asleep: boolean; awake?: string }> {
    const session = this.#sessions.get(instanceId);
    if (!session) {
      return { asleep: this.#asleep.has(instanceId) };
    }
    const awake = await this.#awake(instanceId, session);
    if (awake) {
      return { asleep: false, awake: awake.why };
    }
    const processGeneration = this.#generations.get(instanceId);
    // Carried, and listed on every beat, until it has stopped: a beat that no
    // longer listed it first would have the hub settle it as ended, and fail
    // what it was sent.
    await session.stop();
    this.#sessions.delete(instanceId);
    this.#forgetPulse(instanceId);
    const crossed: SendPayload[] = [];
    this.#asleep.set(instanceId, crossed);
    // The hub wakes it for a crossed send the moment it hears. One nothing
    // woke for by then (the hub was away as this was said) did not go.
    setTimeout(() => {
      if (this.#asleep.get(instanceId) !== crossed) {
        return;
      }
      this.#asleep.delete(instanceId);
      for (const held of crossed) {
        this.#reject(
          instanceId,
          held.message.uuid,
          "The session was put to sleep as this was sent, and nothing woke it."
        );
      }
    }, CROSSED_HOLD_MS).unref();
    this.sink({ kind: "asleep", instanceId, processGeneration });
    Effect.runFork(
      Effect.logInfo(
        `put ${instanceId} to sleep: at rest, its ${session.harness} processes are stopped`
      )
    );
    return { asleep: true };
  }

  /**
   * The sessions among `ids` that are not at rest, each with why
   * ({@link CONTROL_RESTLESS}): {@link #awake}'s test with the hub's
   * keep-alive left out, and a session with a spawn or a send still on its
   * way to it counted as not at rest too. One this machine neither carries
   * nor has anything on its way to is at rest. Stops nothing.
   */
  async #restless(ids: string[]): Promise<Record<string, string>> {
    const restless: Record<string, string> = {};
    const serverBusy =
      (await this.#adapter("opencode").busyInstances?.()) ?? [];
    for (const instanceId of ids) {
      if (this.#queues.has(instanceId)) {
        restless[instanceId] = "something sent to it is still on its way";
        continue;
      }
      if (this.#adopting.has(instanceId)) {
        restless[instanceId] = "its custody is still being decided";
        continue;
      }
      const session = this.#sessions.get(instanceId);
      if (!session) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time; only opencode's read is awaited, and it was taken above
      const awake = await this.#awake(instanceId, session, serverBusy, true);
      if (awake) {
        restless[instanceId] = awake.why;
      }
    }
    return restless;
  }

  /**
   * Carries each Claude session's own data into the dir its row is to say
   * ({@link CONTROL_CARRY_SESSIONS}). A session whose process runs is left
   * where it is, `live`, unless the request says `stop` and it is at rest:
   * then its process ends first, the way a relaunch ends it, and the hub
   * starts it again on the account it moved to. A process sessiond still
   * holds that no session here has taken back is live too.
   */
  async carrySessions(
    requests: CarrySessionRequest[]
  ): Promise<Record<string, CarrySessionOutcome>> {
    const outcomes: Record<string, CarrySessionOutcome> = {};
    const adapter = this.#adapter("claude") as Harness &
      Partial<SessiondAdoption>;
    const held = new Set(
      ((await adapter.custodyCandidates?.())?.procs ?? []).flatMap((proc) => {
        const identity = parseProcId(proc.procId);
        return proc.alive && identity.kind === "claude"
          ? [identity.instanceId]
          : [];
      })
    );
    const go: CarrySessionRequest[] = [];
    for (const request of requests) {
      const { instanceId } = request;
      // Refused before anything is done to it: a carry that cannot happen
      // never ends a session's process.
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each checked before its process is touched
      const refused = await carryRefusal(request);
      if (refused) {
        outcomes[instanceId] = { state: "failed", error: refused };
        continue;
      }
      const running = this.#sessions.get(instanceId);
      if (running && request.stop) {
        const awake = await this.#awake(instanceId, running, undefined, true);
        if (awake || this.#queues.has(instanceId)) {
          outcomes[instanceId] = { state: "live" };
          continue;
        }
        this.#sessions.delete(instanceId);
        this.#forgetPulse(instanceId);
        await running.stop();
        go.push(request);
        continue;
      }
      if (
        running ||
        this.#adopting.has(instanceId) ||
        this.#queues.has(instanceId) ||
        held.has(instanceId)
      ) {
        outcomes[instanceId] = { state: "live" };
        continue;
      }
      go.push(request);
    }
    const carried = await carrySessions(go);
    for (const request of go) {
      const result = carried.get(request.sessionId);
      outcomes[request.instanceId] =
        result && "error" in result
          ? { state: "failed", error: result.error }
          : { state: "carried", entries: result?.entries ?? 0 };
    }
    return outcomes;
  }

  /** Every carried session at rest for {@link IDLE_SLEEP_MS} is put to sleep. */
  async #sweepIdle(): Promise<void> {
    const carried = [...this.#sessions];
    if (carried.length === 0) {
      return;
    }
    const serverBusy =
      (await this.#adapter("opencode").busyInstances?.()) ?? [];
    const now = Date.now();
    for (const [instanceId, session] of carried) {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time; only opencode's read is awaited, and it was taken above
      const awake = await this.#awake(instanceId, session, serverBusy);
      if (awake) {
        if (!awake.unsure) {
          this.#touch(instanceId);
        }
        continue;
      }
      if (now - (this.#activeAt.get(instanceId) ?? now) < IDLE_SLEEP_MS) {
        continue;
      }
      const queue = (this.#queues.get(instanceId) ?? Promise.resolve())
        .then(async () => {
          await this.sleep(instanceId);
        })
        .catch((error: unknown) =>
          warn(`putting ${instanceId} to sleep failed: ${error}`)
        );
      this.#queues.set(instanceId, queue);
      // biome-ignore lint/complexity/noVoid: fire-and-forget cleanup, as in dispatch
      void queue.then(() => {
        if (this.#queues.get(instanceId) === queue) {
          this.#queues.delete(instanceId);
        }
      });
    }
  }

  /**
   * Drops every trace of an instance's pulse — its process is gone. Not its
   * preview: a relaunch comes through here too, and the session it continues
   * still has the preview open. The hub owns that lifetime and ends it on an
   * explicit close or a stop.
   */
  #forgetPulse(instanceId: string): void {
    this.#cacheCold.delete(instanceId);
    this.#realPromptEpoch.delete(instanceId);
    this.#keepAlive.delete(instanceId);
    this.#failureRun.delete(instanceId);
    this.#busy.delete(instanceId);
    this.#activeAt.delete(instanceId);
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
        processGeneration: payload.processGeneration,
        reason,
      });
    }
  }

  /**
   * THE CREDENTIAL GATE, for every harness. A session is published only once
   * the hub has acknowledged its own credential, the one its CawCo tools
   * send: a process this agent launched installs the credential the hub
   * minted for this spawn (`launched`), and one it attached to proves the one
   * it already holds. Nothing has been sent to the session yet, so a session
   * that cannot is stopped before its first turn, and the throw is its
   * spawn's failure with the reason.
   */
  async #admit(
    instanceId: string,
    session: HarnessSession,
    launched: { credential: string | undefined } | undefined
  ): Promise<void> {
    try {
      if (!launched) {
        // A harness that can read the credential its held process carries
        // says it, so this agent redacts it too (a pi host's was recorded
        // when this agent installed it).
        const held = (await session.control(VERIFY_SESSION_CREDENTIAL, [])) as
          | { credential?: string }
          | undefined;
        if (held?.credential) {
          rememberCredential(instanceId, held.credential);
        }
      } else if (launched.credential) {
        // Known before the session can print it: nothing it sends carries it.
        rememberCredential(instanceId, launched.credential);
        await session.control(INSTALL_SESSION_CREDENTIAL, [
          launched.credential,
          "initial",
        ]);
      } else {
        throw new Error("The hub sent this spawn no session credential.");
      }
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : String(problem);
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the refusal below is the outcome either way
      await session.stop().catch(() => {});
      throw new HeldProcessRefused(
        launched
          ? `The session's CawCo MCP credential could not be installed, so it was stopped before its first turn: ${message}`
          : `The session's CawCo MCP credential could not be verified after the agent attached to it, so it was stopped: ${message}`,
        { cause: problem }
      );
    }
  }

  /**
   * Whether a spawn for a session this agent already carries is a recovery of
   * that very process, which is kept: recovery delivery and the register ack
   * may name the same attachment (shared by Claude adoption, pi resume and
   * OpenCode reattach). A spawn that says it relaunches (a move to another
   * account) replaces the process instead.
   */
  /** A session saying its CLI runs a boundary hook that fails open ({@link BOUNDARY_RELAUNCH}), kept for the relaunch that replaces it. */
  #noteFailOpen(instanceId: string, message: NeutralMessage): void {
    if (message.type === "system" && message.subtype === BOUNDARY_RELAUNCH) {
      this.#failOpen.add(instanceId);
    }
  }

  #reuseRecovery(payload: SpawnPayload): boolean {
    const { instanceId, requestId: ack } = payload;
    if (
      (payload.reattachOnly || payload.resume) &&
      !payload.resume?.atMessage &&
      !payload.relaunch &&
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

  async #spawn(payload: SpawnPayload): Promise<void> {
    const id = payload.instanceId;
    const prior = this.#adopting.get(id);
    if (prior) {
      await prior;
      if (this.#reuseRecovery(payload)) {
        return;
      }
      return this.#spawn(payload);
    }
    if (this.#reuseRecovery(payload)) {
      return;
    }
    // Claim before the first await: register adoption and direct spawns share it.
    const claim = Promise.withResolvers<void>();
    this.#adopting.set(id, claim.promise);
    try {
      await this.#spawnClaimed(payload, claim.resolve);
    } finally {
      if (this.#adopting.get(id) === claim.promise) {
        this.#adopting.delete(id);
      }
      claim.resolve();
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one claimed spawn owns preparation, address acknowledgement, publication and refusal cleanup
  async #spawnClaimed(
    payload: SpawnPayload,
    settleClaim: () => void
  ): Promise<void> {
    const { instanceId, cwd, harness: kind, scratch, requestId: ack } = payload;
    // A start again: what its last process was refused is over, and the
    // sends kept for it come from the hub behind this spawn.
    this.#keeperRefused.delete(instanceId);
    this.#handed.delete(instanceId);
    if (payload.processGeneration) {
      this.#generations.set(instanceId, payload.processGeneration);
    }
    if (payload.title) {
      this.#titles.set(instanceId, payload.title);
    }
    const adapter = this.#adapter(kind);
    if (payload.resume && !payload.resume.fork) {
      this.#resumable.set(instanceId, {
        adapter,
        sessionKey: payload.resume.sessionKey,
        cwd: expandHome(cwd),
      });
    }
    try {
      if (adapter.kind === "opencode" && !this.#hubContract) {
        throw new HubContractRefused(this.#hubRefusal);
      }
      if (payload.scratchWorktree) {
        this.#worktrees.set(instanceId, payload.scratchWorktree);
      }
      let workdir = await this.#workdir(payload);
      if (workdir === undefined) {
        this.#recoveryUnavailable(
          payload,
          "The recovery directory is no longer available."
        );
        return;
      }
      if (payload.resume && !this.#sessions.has(instanceId)) {
        // A resume can also arrive after a failed custody attachment. Read
        // sessiond and join adoption before allowing the normal absent-process
        // spawn; an attachment failure never authorises replacing a held child.
        const candidate = adapter as Harness & Partial<SessiondAdoption>;
        if (
          candidate.custodyCandidates &&
          candidate.adopt &&
          candidate.turnRunning
        ) {
          const welcome = await candidate.custodyCandidates();
          const proc = welcome.procs.find((held) => {
            const identity = parseProcId(held.procId);
            return (
              held.alive &&
              (identity.kind === "claude" || identity.kind === "pi") &&
              identity.instanceId === instanceId
            );
          });
          if (proc) {
            const row = {
              instanceId,
              cwd: workdir,
              sessionId: payload.resume.sessionKey,
              processGeneration: payload.processGeneration,
              keepAliveTurn: payload.keepAliveTurn,
              permissionMode: payload.permissionMode,
            };
            const running = await candidate.turnRunning(instanceId, proc.head);
            await this.#adoptClaimed(
              candidate as Harness & SessiondAdoption,
              welcome.epoch,
              { row, proc, running, settle: settleClaim },
              Object.fromEntries(this.#ingested)
            );
          }
        }
        if (this.#reuseRecovery(payload)) {
          return;
        }
      }
      // A relaunch stays in the checkout the spin-off has been working in.
      const cut = this.#worktrees.get(instanceId);
      if (cut) {
        workdir = cut.dir;
      } else if (scratch?.worktree) {
        workdir = await this.#addWorktree(
          instanceId,
          expandHome(scratch.baseCwd ?? cwd)
        );
      }

      // Each spawn says for itself whether this is a spin-off, so a relaunch
      // of one that has since been kept stops being tagged as scratch.
      if (scratch) {
        this.#spinOffs.set(instanceId, {
          ...this.#spinOffs.get(instanceId),
          dir: workdir,
          harness: adapter.kind,
        });
      } else {
        this.#spinOffs.delete(instanceId);
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
      if (payload.ingested) {
        this.#ingested.set(instanceId, payload.ingested);
      }
      const holder: { session: HarnessSession | null } = { session: null };
      const ctx = this.#context(
        instanceId,
        workdir,
        adapter,
        holder,
        payload.processGeneration,
        boundary,
        payload.sessionCredential,
        !!payload.reattachOnly
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
      this.#failures.delete(instanceId);
      this.#unsentFailures.delete(instanceId);
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
      await this.#applyStoredPermissionMode(session, payload.permissionMode);
      // A reattach attaches to a process that already holds its credential.
      await this.#admit(
        instanceId,
        session,
        payload.reattachOnly
          ? undefined
          : { credential: payload.sessionCredential }
      );
      // Refused its input while it was starting: it is not a session to
      // hand work to, and the refusal has said so.
      const refused = this.#keeperRefused.get(instanceId);
      if (refused) {
        throw refused;
      }
      this.#sessions.set(instanceId, session);
      if (boundary && this.#failOpen.delete(instanceId)) {
        console.info(
          `boundary: relaunched ${instanceId} onto the fail-closed hook`
        );
      }
      session.attached?.();
      if (payload.reattachOnly) {
        // biome-ignore lint/complexity/noVoid: the catalog read dates a rest already under way; nothing waits on it
        void this.#dateActivity(instanceId, adapter, session, workdir);
      } else {
        this.#activeAt.set(instanceId, Date.now());
      }
      // What reached this session while it slept is its first work awake.
      const crossed = this.#asleep.get(instanceId) ?? [];
      this.#asleep.delete(instanceId);
      for (const held of crossed) {
        // biome-ignore lint/performance/noAwaitInLoops: handed over in the order they were sent
        await this.#send(held);
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
      if (error instanceof HubContractRefused) {
        this.#fail(instanceId, error, payload.processGeneration);
        if (ack) {
          this.sink({
            kind: "control_result",
            instanceId,
            requestId: ack,
            ok: false,
            error: error.message,
          });
        }
        return;
      }
      const cancelled = this.#addressCancelled.delete(instanceId);
      if (cancelled) {
        return;
      }
      if (error instanceof HarnessRecoveryRefused) {
        // Known surviving custody is reported even for inspection-only recovery.
        // It is neither a dead conversation nor permission to replace a runner.
        this.#failures.set(instanceId, error.message);
        warn(`custody ${instanceId} refused: ${error.message}`);
        this.sink({
          kind: "error",
          instanceId,
          processGeneration: payload.processGeneration,
          verb: "register",
          message: error.message,
        });
        if (ack) {
          this.sink({
            kind: "control_result",
            instanceId,
            requestId: ack,
            ok: false,
            error: error.message,
          });
        }
        return;
      }
      // A probe that found nothing to attach says nothing; a held process
      // refused at attach was stopped, and that is its failure.
      if (payload.reattachOnly && !(error instanceof HeldProcessRefused)) {
        return;
      }
      // The keeper refused its process its input: the refusal failed the
      // session and kept its sends ({@link #refusedInput}); its caller hears it.
      const refusal = this.#keeperRefused.get(instanceId);
      if (refusal) {
        if (ack) {
          this.sink({
            kind: "control_result",
            instanceId,
            requestId: ack,
            ok: false,
            error: refusal.message,
          });
        }
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      // The journal too: the row's `error` and the control result both leave
      // this process, and a diagnosis on the machine itself was once blind to
      // why a resume died.
      warn(`spawn ${instanceId} failed: ${message}`);
      // The sends that waited for this process have nowhere to go.
      for (const held of this.#asleep.get(instanceId) ?? []) {
        this.#reject(instanceId, held.message.uuid, error);
      }
      this.#asleep.delete(instanceId);
      if (ack) {
        this.sink({
          kind: "control_result",
          instanceId,
          requestId: ack,
          ok: false,
          error: message,
        });
      }
      this.#fail(instanceId, error, payload.processGeneration);
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
    processGeneration: string | undefined,
    boundary?: Boundary,
    sessionCredential?: string,
    recovery = false
  ): SessiondAwareContext {
    if (!processGeneration) {
      throw new Error("The hub did not supply this process's generation.");
    }
    this.#generations.set(instanceId, processGeneration);
    const launchOf = (message: NeutralMessage) =>
      accountReading(message) ? { processGeneration } : {};
    return {
      recordSessionAddress: (sessionId) => {
        const known = this.#addressAcknowledged.get(instanceId);
        if (
          known?.sessionId === sessionId &&
          known.generation === processGeneration
        ) {
          return Promise.resolve();
        }
        const previous = this.#addressWaiting.get(instanceId);
        if (
          previous?.sessionId === sessionId &&
          previous.generation === processGeneration
        ) {
          return previous.ack.promise;
        }
        const pending = {
          sessionId,
          generation: processGeneration,
          ack: Promise.withResolvers<void>(),
        };
        this.#addressWaiting.set(instanceId, pending);
        this.sink({
          kind: "session_address",
          instanceId,
          sessionId,
          processGeneration,
        });
        return pending.ack.promise.finally(() => {
          if (this.#addressWaiting.get(instanceId) === pending) {
            this.#addressWaiting.delete(instanceId);
          }
        });
      },
      instanceId,
      cwd: workdir,
      ...(boundary ? { boundary } : {}),
      ...(this.#ingested.get(instanceId)
        ? { ingested: this.#ingested.get(instanceId) }
        : {}),
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
        this.#noteFailOpen(instanceId, message);
        this.#noteRead(instanceId, message);
        const ping = this.#keepAlive.get(instanceId);
        if (
          ping &&
          message.type === "system" &&
          message.subtype === MESSAGES_READ &&
          message.read?.some((id) => id !== ping)
        ) {
          this.#keepAlive.delete(instanceId);
        }
        const keepAlive = this.#keepAlive.has(instanceId);
        this.#observeCacheFrame(instanceId, adapter.kind, message, keepAlive);
        if (keepAlive) {
          message.keepAlive = true;
        }
        const src = this.#line.get(instanceId);
        this.#line.delete(instanceId);
        if (message.type === "result" && !keepAlive) {
          this.#tagQuest(instanceId, adapter);
        }
        // Folded before the forward decision: the pulse is local state being
        // rebuilt from a replay, and a line the hub already has still tells
        // this agent what its own session is doing.
        if (!keepAlive) {
          this.#foldPulse(instanceId, message);
        }
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
          ...(keepAlive ? { keepAlive: true } : {}),
          message,
          ...(src ?? {}),
          ...launchOf(message),
        });
        if (message.type === "result") {
          this.#keepAlive.delete(instanceId);
          if (!keepAlive) {
            this.#watchFailure(instanceId, adapter.kind, message, holder);
          }
        }
      },
      permission: (request) => {
        if (this.#openAsks.has(request.requestId)) {
          return;
        }
        this.#touch(instanceId);
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
          processGeneration,
        };
        this.#openAsks.set(request.requestId, body);
        this.sink(body);
      },
      permissionResolved: (requestId, outcome) =>
        this.#settleAsk(instanceId, requestId, outcome),
      busy: (active) => {
        if (active) {
          this.#busy.add(instanceId);
        } else {
          this.#busy.delete(instanceId);
        }
        // A keep-alive ping is the hub's maintenance, not the session doing
        // anything: its rest is still counted from its own last turn.
        if (!this.#keepAlive.has(instanceId)) {
          this.#touch(instanceId);
        }
        this.#emitPulse(instanceId, true);
      },
      session: (sessionId) =>
        this.#noteQuestSession(instanceId, sessionId, adapter.kind),
      failed: (error) =>
        recovery
          ? this.#failures.set(instanceId, String(error))
          : this.#fail(instanceId, error, processGeneration),
      refused: (error) => this.#fail(instanceId, error, processGeneration),
      keeperRefused: (error) =>
        this.#refusedInput(instanceId, error, processGeneration),
      rejected: (uuid, error) => this.#reject(instanceId, uuid, error),
      emit: (envelope) => this.emit(envelope),
      closed: () => {
        // A dead process is never going to answer anything it asked.
        for (const [requestId, body] of this.#openAsks) {
          if (
            "instanceId" in body &&
            body.instanceId === instanceId &&
            body.processGeneration === processGeneration
          ) {
            this.#settleAsk(instanceId, requestId, "cancelled");
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
   * A session that fails the same way {@link REPEATED_FAILURE_LIMIT} times in
   * a row, with no send in between, is looping on its own — opencode
   * compacting, continuing and overflowing again, unattended, until someone
   * noticed. Its turn is stopped and the transcript says why, in the
   * failure's own words; the failures themselves are already rows of their
   * own. Any other ending, and any send, starts the count again.
   */
  #watchFailure(
    instanceId: string,
    harness: HarnessKind,
    result: NeutralResultMessage,
    holder: { session: HarnessSession | null }
  ): void {
    if (!result.is_error) {
      this.#failureRun.delete(instanceId);
      return;
    }
    const words = result.errors?.length
      ? result.errors.join("\n")
      : (result.result ?? result.subtype);
    const prior = this.#failureRun.get(instanceId);
    const count = prior?.words === words ? prior.count + 1 : 1;
    if (count < REPEATED_FAILURE_LIMIT) {
      this.#failureRun.set(instanceId, { words, count });
      return;
    }
    this.#failureRun.delete(instanceId);
    console.warn(
      `[agent] ${instanceId}: stopped after ${count} identical failures: ${words}`
    );
    this.sink({
      kind: "frame",
      instanceId,
      harness,
      message: {
        type: "system",
        subtype: REPEATED_FAILURE,
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...(result.session_id ? { session_id: result.session_id } : {}),
        content: words,
      },
    });
    const { session } = holder;
    session
      ?.interrupt()
      .then(() => session.noteStopped?.(words))
      .catch((error: unknown) => {
        console.warn(
          `[agent] ${instanceId}: stopping its repeated failure failed: ${String(error)}`
        );
      });
  }

  /** A real turn can refresh a cache only after all known prompt writes. */
  #observeCacheFrame(
    instanceId: string,
    harness: HarnessKind,
    message: NeutralMessage,
    keepAlive: boolean
  ): void {
    if (harness !== "claude") {
      return;
    }
    if (
      !keepAlive &&
      message.type === "system" &&
      message.subtype === "init" &&
      !this.#realPromptEpoch.has(instanceId)
    ) {
      this.#realPromptEpoch.set(instanceId, this.#promptEpoch);
    }
    if (message.type !== "result") {
      return;
    }
    const usage = promptCacheUsage(message);
    if (keepAlive) {
      if (!(usage.input > 0 && usage.read >= usage.input * 0.9)) {
        this.#cacheCold.add(instanceId);
      }
      return;
    }
    message.cacheReusable =
      this.#promptWrites === 0 &&
      this.#realPromptEpoch.get(instanceId) === this.#promptEpoch;
    if (
      message.cacheReusable &&
      message.lastRequestAt !== undefined &&
      usage.input > 0
    ) {
      this.#cacheCold.delete(instanceId);
    }
    this.#realPromptEpoch.delete(instanceId);
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one custody transaction claims, decides and adopts sessions, restoring maintenance identity before any pulse
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
        if (row.keepAliveTurn) {
          this.#keepAlive.set(row.instanceId, row.keepAliveTurn);
        }
        if (this.#adopting.has(row.instanceId)) {
          elsewhere.push(row);
          continue;
        }
        // Admitted when this daemon spawned or attached to it.
        if (this.#sessions.has(row.instanceId)) {
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
            this.#sessionRecoveryFailed(
              entry.row.instanceId,
              problem,
              entry.row.processGeneration
            );
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
          // A child refused at attach (its credential, its boundary hook) was
          // stopped: an end, not a recovery the hub retries.
          if (problem instanceof HeldProcessRefused) {
            this.#fail(
              entry.row.instanceId,
              problem,
              entry.row.processGeneration
            );
          } else {
            this.#sessionRecoveryFailed(
              entry.row.instanceId,
              problem,
              entry.row.processGeneration
            );
          }
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

  #sessionRecoveryFailed(
    instanceId: string,
    problem: unknown,
    _processGeneration?: string
  ): void {
    // The hub retries kept custody from fresh readings; failure is not an end decision.
    this.#failures.set(instanceId, String(problem));
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
    if (!(await isDirectory(expandHome(row.cwd)))) {
      this.#recoveryUnavailable(
        { ...row, reattachOnly: true },
        "The recovery directory is no longer available."
      );
      return;
    }
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
      row.processGeneration,
      undefined,
      undefined,
      true
    );
    const session = await claude.adopt(row.instanceId, ctx, {
      ...(cursor === undefined ? {} : { afterSeq: cursor }),
      head: proc.head,
      sessionId: row.sessionId ?? null,
      turnRunning: running,
      permissionMode: row.permissionMode,
    });
    holder.session = session;
    await this.#applyStoredPermissionMode(session, row.permissionMode);
    await this.#admit(row.instanceId, session, undefined);
    this.#sessions.set(row.instanceId, session);
    // biome-ignore lint/complexity/noVoid: the catalog read dates a rest already under way; nothing waits on it
    void this.#dateActivity(row.instanceId, claude, session, row.cwd);
    session.attached?.();
    this.#adopting.delete(row.instanceId);
    settle();
  }

  /** Restore policy before publishing the handle or replaying its permission snapshot. */
  async #applyStoredPermissionMode(
    session: HarnessSession,
    mode: SpawnPayload["permissionMode"]
  ): Promise<void> {
    if (mode !== undefined) {
      await session.control(CONTROL_SET_PERMISSION_MODE, [mode]);
    }
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

  /** The harness session a spin-off turned out to be writing, from its init frame. */
  #noteQuestSession(
    instanceId: string,
    sessionId: string,
    harness: HarnessKind
  ): void {
    const spinOff = this.#spinOffs.get(instanceId);
    if (!spinOff || spinOff.sessionId === sessionId) {
      return;
    }
    spinOff.sessionId = sessionId;
    spinOff.harness = harness;
    spinOff.tagged = false;
  }

  /**
   * Keeps a spin-off out of the catalogs the rails read. Applied at the end of
   * the first turn rather than at init, because until the session has said
   * something there may be no transcript for a tag to live on. Fire-and-forget,
   * tried again next turn if it does not land.
   */
  #tagQuest(instanceId: string, adapter: Harness): void {
    const spinOff = this.#spinOffs.get(instanceId);
    if (!spinOff?.sessionId || spinOff.tagged) {
      return;
    }
    const { sessionId, dir } = spinOff;
    spinOff.tagged = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — #tagQuest itself is synchronous and does not wait on the tag landing
    void adapter
      .tagSession(sessionId, CAWCO_SCRATCH_TAG, dir)
      .catch((error: unknown) => {
        spinOff.tagged = false;
        warn(`could not tag spin-off ${sessionId}: ${error}`);
      });
  }

  /** A session whose tag someone has just set by hand is no longer ours to set. */
  #closeTagging(sessionId: unknown): void {
    for (const spinOff of this.#spinOffs.values()) {
      if (spinOff.sessionId === sessionId) {
        spinOff.tagged = true;
      }
    }
  }

  /**
   * A session that never started, or stopped without being asked to. One the
   * session keeper refused at the machine's process limit is said in the
   * sentence a person reads, naming the machine and the session; the keeper's
   * own words about which limit stay in the agent's log.
   */
  /**
   * The keeper refused this session's process its input. Said here with the
   * session and the keeper's reason; the session fails with it, as a start
   * that failed does, and is no longer one this daemon hands work to. What it
   * was handed and has not read, and what waited for its process, goes back
   * to the hub whole ({@link #holdSend}), as does every send that reaches it
   * until it starts again: the hub keeps them for that start.
   */
  #refusedInput(
    instanceId: string,
    error: KeeperRefused,
    processGeneration?: string
  ): void {
    if (this.#keeperRefused.has(instanceId)) {
      return;
    }
    warn(`${instanceId}: ${error.reason} (${error.procId})`);
    this.#keeperRefused.set(instanceId, error);
    this.#sessions.delete(instanceId);
    this.#busy.delete(instanceId);
    this.#forgetPulse(instanceId);
    for (const payload of this.#handed.get(instanceId)?.values() ?? []) {
      this.#holdSend(payload);
    }
    this.#handed.delete(instanceId);
    for (const payload of this.#asleep.get(instanceId) ?? []) {
      this.#holdSend(payload);
    }
    this.#asleep.delete(instanceId);
    this.#fail(instanceId, error, processGeneration, true);
  }

  /**
   * A send to a session whose process was refused its input: no process
   * will read it until the session starts again, so it goes back to the hub
   * for that start. True when it was held. A keep-alive ping is never held:
   * nothing starts a session to keep its cache warm.
   */
  #heldForRefusal(payload: SendPayload, keepAlive: boolean): boolean {
    const { instanceId } = payload;
    if (
      keepAlive ||
      !this.#keeperRefused.has(instanceId) ||
      this.#sessions.has(instanceId)
    ) {
      return false;
    }
    this.#holdSend(payload);
    return true;
  }

  /** A send handed to its harness, whole as the hub sent it, until the harness reads it. */
  #noteHanded(payload: SendPayload): void {
    const handed = this.#handed.get(payload.instanceId) ?? new Map();
    handed.set(payload.message.uuid, payload);
    this.#handed.set(payload.instanceId, handed);
  }

  /** The sends a harness says it read are no longer any refusal's to hand back. */
  #noteRead(instanceId: string, message: NeutralMessage): void {
    if (message.type !== "system" || message.subtype !== MESSAGES_READ) {
      return;
    }
    for (const uuid of message.read ?? []) {
      this.#handed.get(instanceId)?.delete(uuid);
    }
  }

  /** A send no process took, back to the hub whole: it goes with the session's next start. */
  #holdSend(payload: SendPayload): void {
    const frame = {
      kind: "held_send" as const,
      instanceId: payload.instanceId,
      send: payload,
    };
    console.info(
      `[session] ${payload.instanceId}: send ${payload.message.uuid} kept for its next start`
    );
    if (!this.sink(frame)) {
      this.#unsentHeld.push(frame);
    }
  }

  #fail(
    instanceId: string,
    error: unknown,
    processGeneration?: string,
    /** No process took anything: its sends are kept, not failed ({@link #refusedInput}). */
    keepsSends = false
  ): void {
    // Its process was refused its input, and that said why it failed
    // ({@link #refusedInput}): the harness's stream ending on it is the same
    // failure, and must not fail the sends the refusal kept.
    if (!keepsSends && this.#keeperRefused.has(instanceId)) {
      console.info(
        `[session] ${instanceId}: after its refusal: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    const said = error instanceof Error ? error.message : String(error);
    const title = this.#titles.get(instanceId);
    const message = said.includes(`${SESSIOND_PROCESS_LIMIT}:`)
      ? processLimitSentence(
          machineLabel(hostname()),
          title ? `"${title}"` : "this session"
        )
      : said;
    if (message !== said) {
      warn(`${instanceId}: ${said}`);
    }
    this.#failures.set(instanceId, message);
    const frame = {
      kind: "error" as const,
      instanceId,
      processGeneration,
      verb: "spawn" as const,
      message,
      ...(keepsSends ? { keepsSends: true as const } : {}),
    };
    // The hub fails the row and its work item on this frame alone. One that
    // could not go out now goes out on the next connection.
    if (this.sink(frame)) {
      this.#unsentFailures.delete(instanceId);
    } else {
      this.#unsentFailures.set(instanceId, frame);
    }
  }

  /**
   * The spawn failures no hub has heard, said on a new connection right after
   * its register. The hub ignores one whose process generation it has since
   * replaced.
   */
  replaySpawnFailures(): void {
    for (const [instanceId, frame] of this.#unsentFailures) {
      if (this.sink(frame)) {
        this.#unsentFailures.delete(instanceId);
      }
    }
    // The sends kept for a refused session's next start, behind its failure.
    while (this.#unsentHeld.length && this.sink(this.#unsentHeld[0])) {
      this.#unsentHeld.shift();
    }
  }

  /**
   * One send that did not go: the harness refused it, or there was no
   * session to hand it to. The hub fails that send's record; the session, if
   * there is one, goes on.
   */
  #reject(instanceId: string, uuid: string, error: unknown): void {
    // Its process was refused its input: what it was handed went back to
    // the hub whole ({@link #refusedInput}), and the harness letting go of it
    // as its stream ends is not that send failing.
    if (this.#keeperRefused.has(instanceId)) {
      console.info(
        `[session] ${instanceId}: send ${uuid} kept, not failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    this.#handed.get(instanceId)?.delete(uuid);
    this.sink({
      kind: "rejected",
      instanceId,
      uuid,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  async #send(payload: SendPayload): Promise<void> {
    const { instanceId, images, urgent } = payload;
    const keepAlive =
      payload.message.origin.kind === "system" &&
      payload.message.origin.name === "keepalive";
    if (this.#heldForRefusal(payload, keepAlive)) {
      return;
    }
    // Sent before the hub heard this session was put to sleep: it waits for
    // the process the hub's wake starts ({@link sleep}). A keep-alive ping is
    // not held: nothing wakes a session to keep its cache warm, and it is
    // refused below like any ping to a session that is not there.
    const crossed =
      this.#sessions.has(instanceId) || keepAlive
        ? undefined
        : this.#asleep.get(instanceId);
    if (crossed) {
      crossed.push(payload);
      return;
    }
    // Files go onto this machine before any harness sees the turn, which
    // names each by its path; a file that cannot be fetched fails the send.
    const carried = await withFiles(
      instanceId,
      payload.message,
      payload.attachments
    );
    const attachments = carried.texts;
    let { message } = carried;
    const worktree = this.#worktrees.get(instanceId);
    const { content } = message.message;
    if (!keepAlive && worktree?.announce && typeof content === "string") {
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
    const session = this.#sessions.get(instanceId);
    if (!session) {
      throw new Error(
        this.#failures.get(instanceId) ??
          "This session is not live. Resume it before sending a message."
      );
    }
    if (keepAlive) {
      if (this.#cacheCold.has(instanceId) || this.#promptWrites > 0) {
        throw new Error(
          "Keep-alive refused: the Claude prompt changed; a real turn must refresh its cache."
        );
      }
      if (
        session.harness !== "claude" ||
        this.#busy.has(instanceId) ||
        [...this.#openAsks.values()].some(
          (ask) => "instanceId" in ask && ask.instanceId === instanceId
        )
      ) {
        throw new Error("Keep-alive requires an idle Claude session.");
      }
      this.#keepAlive.set(instanceId, message.uuid);
    } else {
      if (session.harness === "claude" && !this.#busy.has(instanceId)) {
        this.#realPromptEpoch.set(instanceId, this.#promptEpoch);
      }
      this.#touch(instanceId);
      // A send is the reader trying again: whatever failed before it is not
      // the session looping on its own.
      this.#failureRun.delete(instanceId);
      this.#noteHanded(payload);
    }
    session.send(message, { attachments, images, urgent });
  }

  async #endHeld(instanceId: string): Promise<boolean> {
    const client = await SessiondClient.connect(
      process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
    );
    try {
      const children = client.procs.filter((proc) => {
        const id = parseProcId(proc.procId);
        return (
          proc.alive &&
          (id.kind === "claude" || id.kind === "pi") &&
          id.instanceId === instanceId
        );
      });
      await Promise.all(
        children.map(async (child) => {
          await endProc(client, child.procId);
          const deadline = Date.now() + 10_000;
          let alive = true;
          while (alive && Date.now() < deadline) {
            // biome-ignore lint/performance/noAwaitInLoops: confirmation follows sessiond's existing graceful stop and five-second kill grace
            const after = await client.list();
            alive = after.procs.some(
              (proc) => proc.pid === child.pid && proc.alive
            );
            if (alive) {
              await Bun.sleep(100);
            }
          }
          if (alive) {
            throw new Error(
              `sessiond process ${child.pid} for ${instanceId} did not exit after its stop`
            );
          }
        })
      );
      return children.length > 0;
    } finally {
      client.close();
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stop settles carried, sessiond-held and discarded custody with the same receipt
  async #stop({
    instanceId,
    discard,
    requestId,
    processGeneration: namedGeneration,
    harness,
    sessionId,
    cwd,
    claimedSessionIds = [],
    scratchWorktree,
  }: StopPayload): Promise<void> {
    const stopStartedAt = Date.now();
    const processGeneration =
      namedGeneration ?? this.#generations.get(instanceId);
    // A stop is a decision about the session: nothing waits for its wake now.
    const crossed = this.#asleep.get(instanceId) ?? [];
    this.#asleep.delete(instanceId);
    for (const held of crossed) {
      this.#reject(instanceId, held.message.uuid, "The session was stopped.");
    }
    try {
      const session = this.#sessions.get(instanceId);
      const kind = harness ?? session?.harness;
      if (kind === "opencode" && !this.#hubContract) {
        throw new HubContractRefused(this.#hubRefusal);
      }
      let ended: Extract<FramePayload, { kind: "stopped" }>["ended"];
      let sharedConversation = false;
      if (kind === "opencode") {
        const key = sessionId ?? session?.sessionId;
        const directory = cwd ?? this.#resumable.get(instanceId)?.cwd;
        const adapter = this.#adapter("opencode");
        if (!(directory && adapter.endSession)) {
          throw new Error(
            "OpenCode end requires the row's conversation and directory."
          );
        }
        if (key) {
          const shared =
            claimedSessionIds.includes(key) ||
            [...this.#sessions].some(
              ([id, held]) =>
                id !== instanceId &&
                held.harness === "opencode" &&
                held.sessionId === key
            ) ||
            [...this.#resumable].some(
              ([id, held]) =>
                id !== instanceId &&
                held.adapter.kind === "opencode" &&
                held.sessionKey === key
            );
          sharedConversation = shared;
          await adapter.endSession(
            key,
            directory,
            instanceId,
            shared ? [...claimedSessionIds, key] : claimedSessionIds
          );
          ended = {
            harness: "opencode",
            sessionId: key,
            resourcesClosed: true,
            ...(shared ? { reason: "conversation held by another row" } : {}),
          };
        } else {
          if (!adapter.unclaimedRunners) {
            throw new Error(
              "OpenCode cannot supply a complete runner reading."
            );
          }
          const reading = await adapter.unclaimedRunners(
            directory,
            claimedSessionIds
          );
          if (reading.count > 0) {
            const message =
              "End intent is waiting for unclaimed server runners.";
            this.sink({
              kind: "error",
              verb: "stop",
              instanceId,
              processGeneration,
              message,
              endReason: `waiting: ${reading.count} unclaimed runner(s) in ${directory}`,
            });
            if (requestId) {
              this.sink({
                kind: "control_result",
                instanceId,
                requestId,
                ok: false,
                error: message,
              });
            }
            return;
          }
          ended = {
            harness: "opencode",
            resourcesClosed: true,
            reason: `no unclaimed runner in ${directory} at ${new Date(reading.readStartedAt).toISOString()}`,
          };
        }
        this.#sessions.delete(instanceId);
        this.#forgetPulse(instanceId);
      } else if (session) {
        this.#forgetPulse(instanceId);
        // Carried, and listed on every beat, until the stop is over: a stop
        // waits for the turn it interrupts, and a beat that no longer listed
        // the session meanwhile had the hub settle it as ended — what it was
        // holding failed "ended" before this said "stopped".
        await session.stop();
        this.#sessions.delete(instanceId);
      }
      if (kind !== "opencode") {
        await this.#endHeld(instanceId);
        ended = { harness: kind ?? "claude", resourcesClosed: true };
      }
      this.#resumable.delete(instanceId);
      if (discard && !sharedConversation) {
        if (scratchWorktree) {
          this.#worktrees.set(instanceId, scratchWorktree);
        }
        await this.#removeWorktree(instanceId);
        if (!this.#spinOffs.has(instanceId) && sessionId && cwd) {
          this.#spinOffs.set(instanceId, {
            dir: cwd,
            sessionId,
            harness: harness ?? "claude",
          });
        }
        if (!(sessionId && claimedSessionIds.includes(sessionId))) {
          await this.#removeQuestSession(instanceId);
        }
      }
      Effect.runFork(
        Effect.logInfo(
          `[agent] stop session=${instanceId} request=${requestId ?? "none"} outcome=runner-gone elapsedMs=${Date.now() - stopStartedAt}`
        )
      );
      this.sink({
        kind: "stopped",
        instanceId,
        discard: discard === true,
        processGeneration,
        ...(ended ? { ended } : {}),
      });
      if (requestId) {
        this.sink({ kind: "control_result", instanceId, requestId, ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(
        `[agent] stop session=${instanceId} request=${requestId ?? "none"} outcome=failed elapsedMs=${Date.now() - stopStartedAt}`
      );
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
      const origin = await hostGit(target, ["remote", "get-url", "origin"]);
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
      : await hostGit(parent, ["clone", "--single-branch", repo, target]);
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
    const recorded = await readJson<Worktree>(this.#worktreeRecord(instanceId));
    if (recorded) {
      this.#worktrees.set(instanceId, recorded);
      this.#recordWorktree(instanceId, recorded);
      return recorded.dir;
    }
    const repository = await hostGit(baseCwd, [
      "rev-parse",
      "--show-toplevel",
      "--show-prefix",
      "HEAD",
    ]);
    if (repository.exitCode !== 0) {
      return baseCwd;
    }

    const [root = "", prefix = ""] = repository.text().split("\n");
    const path = expandHome(
      `~/.worktrees/${basename(root)}-${instanceId.slice(0, 8)}`
    );
    // A relaunch after a daemon restart finds its worktree already there.
    const listed = (
      await hostGit(root, ["worktree", "list", "--porcelain"])
    ).text();
    const reused = listed.split("\n").includes(`worktree ${path}`);
    if (reused) {
      throw new Error(
        `Refusing to claim an unrecorded existing worktree: ${path}`
      );
    }
    let base: string | undefined;
    if (!reused) {
      // The remote's default branch as the remote has it now, not the local
      // checkout (a shared clone's HEAD is whatever nobody updated) and not a
      // remote-tracking ref nobody fetched. A repository with no remote has
      // nothing to land on, and starts from its own HEAD.
      const hasOrigin =
        (await hostGit(root, ["remote", "get-url", "origin"])).exitCode === 0;
      base = hasOrigin ? await fetchDefaultBranch(root) : undefined;
      const commit = base ? `origin/${base}` : "HEAD";
      const added = await hostGit(root, [
        "worktree",
        "add",
        "--detach",
        path,
        commit,
      ]);
      if (added.exitCode !== 0) {
        throw new Error(
          `git worktree add failed: ${added.stderr.toString().trim()}`
        );
      }
    }

    const dir = join(path, prefix);
    const worktree = {
      path,
      root,
      dir,
      ...(reused ? {} : { announce: { cwd: baseCwd, base } }),
    };
    await mkdir(dirname(this.#worktreeRecord(instanceId)), { recursive: true });
    await writeJson(this.#worktreeRecord(instanceId), worktree);
    this.#worktrees.set(instanceId, worktree);
    this.#recordWorktree(instanceId, worktree);
    return dir;
  }

  #worktreeRecord(instanceId: string): string {
    return join(
      homedir(),
      ".cawco",
      "scratch-worktrees",
      `${hashText(instanceId)}.json`
    );
  }

  #recordWorktree(instanceId: string, worktree: Worktree): void {
    const processGeneration = this.#generations.get(instanceId);
    if (processGeneration) {
      this.sink({
        kind: "scratch_worktree",
        instanceId,
        processGeneration,
        worktree,
      });
    }
  }

  async #removeWorktree(instanceId: string): Promise<void> {
    const worktree =
      this.#worktrees.get(instanceId) ??
      (await readJson<Worktree>(this.#worktreeRecord(instanceId)));
    if (!worktree) {
      return;
    }
    if (!(await isDirectory(worktree.path))) {
      this.#worktrees.delete(instanceId);
      await rm(this.#worktreeRecord(instanceId), { force: true });
      return;
    }

    const removed = await hostGit(worktree.root, [
      "worktree",
      "remove",
      "--force",
      worktree.path,
    ]);
    if (removed.exitCode !== 0) {
      throw new Error(
        `git worktree remove failed: ${removed.stderr.toString().trim()}`
      );
    }
    await hostGit(worktree.root, ["worktree", "prune"]);
    this.#worktrees.delete(instanceId);
    await rm(this.#worktreeRecord(instanceId), { force: true });
  }

  /** Discarding a spin-off throws its transcript away too. */
  async #removeQuestSession(instanceId: string): Promise<void> {
    const spinOff = this.#spinOffs.get(instanceId);
    if (!spinOff?.sessionId) {
      return;
    }
    const adapter = harnessOf(spinOff.harness);
    if (await adapter?.getSessionInfo(spinOff.sessionId, spinOff.dir)) {
      await adapter?.deleteSession(spinOff.sessionId, spinOff.dir);
    }
    this.#spinOffs.delete(instanceId);
  }

  async #fs(payload: FsPayload): Promise<void> {
    const { requestId } = payload;
    try {
      this.sink({
        kind: "control_result",
        requestId,
        ok: true,
        result: await withPromptWrites(this.#observePromptWrite, () =>
          runFs(payload)
        ),
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

  readonly #mcpLauncherStates = new Map<
    string,
    import("@cawco/core").FleetItemState
  >();

  /** Converges the fleet across every harness that has a profile, merged into one report. */
  #syncFleet(
    incoming: FleetConfig | undefined,
    which: "syncFleet" | "fleetStatus"
  ): Promise<FleetSyncReport> {
    return withPromptWrites(this.#observePromptWrite, () =>
      this.#convergeFleet(incoming, which)
    );
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: merges every existing fleet report field across harnesses, preserving per-harness ownership
  async #convergeFleet(
    incoming: FleetConfig | undefined,
    which: "syncFleet" | "fleetStatus"
  ): Promise<FleetSyncReport> {
    // The daemon's connection names a hub reachable from this machine.
    if (incoming) {
      this.#mcpLauncherStates.clear();
    }
    const config = incoming && {
      ...incoming,
      mcp: await Promise.all(
        incoming.mcp.map(async (row) => {
          if (!row.enabled) {
            return row;
          }
          const launcher = await prepareFleetMcp(row.name, row.config);
          if ("failure" in launcher || "unavailable" in launcher) {
            this.#mcpLauncherStates.set(
              row.name,
              "unavailable" in launcher
                ? { state: "pending", detail: launcher.unavailable }
                : { state: "failed", detail: launcher.failure }
            );
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
    const mcpHarnesses = new Set(
      harnesses()
        .filter((adapter) => adapter.capabilities.mcpStatus)
        .map((adapter) => adapter.kind)
    );
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
              await adapter.syncFleet!(
                (adapter.capabilities.mcpStatus
                  ? config
                  : incoming) as FleetConfig
              )
            : // biome-ignore lint/style/noNonNullAssertion: `apply` was checked truthy above, and it is exactly `adapter.fleetStatus` on this branch
              await adapter.fleetStatus!();
        mcpByHarness[adapter.kind] = report.mcp;
        Object.assign(marketplaces, report.marketplaces);
        Object.assign(plugins, report.plugins);
        // A skill lives in more than one harness's directory, so its row is
        // the worst of them: one harness's copy edited or missing is not
        // undone by another's that is fine.
        for (const [name, item] of Object.entries(report.skills ?? {})) {
          skills[name] = skills[name]
            ? worstFleetState([skills[name], item])
            : item;
        }
        Object.assign(memoryDocs, report.memoryDocs ?? {});
        Object.assign(hooks, report.hooks ?? {});
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
      ...this.#mcpLauncherStates.keys(),
      ...Object.values(mcpByHarness).flatMap((rows) => Object.keys(rows ?? {})),
    ]);
    for (const [kind, detail] of mcpFailures) {
      mcpByHarness[kind] = Object.fromEntries(
        [...names].map((name) => [name, { state: "failed", detail }])
      );
    }
    for (const [kind, report] of Object.entries(mcpByHarness)) {
      if (!mcpHarnesses.has(kind as HarnessKind)) {
        continue;
      }
      for (const [name, state] of this.#mcpLauncherStates) {
        report[name] = state;
      }
    }
    for (const name of names) {
      const readings = Object.entries(mcpByHarness).flatMap(([kind, rows]) =>
        rows?.[name] ? [{ kind, item: rows[name] }] : []
      );
      const worst = worstFleetState(
        readings
          .filter((reading) => mcpHarnesses.has(reading.kind as HarnessKind))
          .map((reading) => reading.item)
      );
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
      have: await this.#fleetHoldings(),
      at: Date.now(),
    };
  }

  /**
   * What this machine holds of the fleet's content on its disk now, read from
   * every harness that keeps a copy. One set per harness, INTERSECTED — never
   * unioned. Skills are written by more than one harness into more than one
   * directory (claude's `~/.claude/skills`, pi's own), so a hash one of them
   * holds is not a hash the machine holds: leaving those bytes out would
   * strand every harness that still needs them. A harness that converges none
   * reads no set and is not counted, which is why opencode — which reads
   * claude's directory rather than keeping its own — does not veto every
   * skill on the machine. A harness whose read fails holds nothing, so the
   * hub sends everything rather than trust a copy nobody could read.
   */
  async #fleetHoldings(): Promise<FleetHoldings> {
    const skillClaims: Record<string, string>[] = [];
    const pluginClaims: Record<string, string>[] = [];
    for (const adapter of harnesses()) {
      if (!adapter.fleetHoldings) {
        continue;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one harness's disk read at a time keeps the reads bounded
        const held = await adapter.fleetHoldings();
        if (held.skills) {
          skillClaims.push(held.skills);
        }
        if (held.plugins) {
          pluginClaims.push(held.plugins);
        }
      } catch (error) {
        warn(`reading ${adapter.kind}'s fleet holdings failed: ${error}`);
        return { skills: {}, plugins: {} };
      }
    }
    return {
      skills: agreedHashes(skillClaims),
      plugins: agreedHashes(pluginClaims),
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

      if (method === CONTROL_RESTLESS) {
        return await this.#restless(args[0] as string[]);
      }
      if (method === CONTROL_CARRY_SESSIONS) {
        return await this.carrySessions(args[0] as CarrySessionRequest[]);
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
      if (method === READ_FLEET_HOLDINGS) {
        return await this.#fleetHoldings();
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
    if (method === WITHDRAW_PERMISSION) {
      this.#session(instanceId).withdrawPermission(
        args[0] as string,
        args[1] as string
      );
      this.#settleAsk(instanceId, args[0] as string, "cancelled");
      return undefined;
    }
    if (method === CONTROL_SLEEP) {
      return await this.sleep(instanceId);
    }
    const session = this.#session(instanceId);
    if (method === "withdrawSend" && session.harness !== "claude") {
      return "started";
    }
    return await session.control(method, args);
  }

  #session(instanceId: string): HarnessSession {
    const session = this.#sessions.get(instanceId);
    if (!session) {
      throw new Error(`no session ${instanceId}`);
    }
    return session;
  }

  #settleAsk(
    instanceId: string,
    requestId: string,
    outcome: "answered" | "cancelled" = "answered"
  ): void {
    const ask = this.#openAsks.get(requestId);
    if (!(ask && "instanceId" in ask) || ask.instanceId !== instanceId) {
      return;
    }
    this.#openAsks.delete(requestId);
    // The hub parks every ask until it hears it is over; an ask the harness
    // settled itself would otherwise stay on every board. A hub that is away
    // hears it once it is back (replayOpenAsks).
    const settled = {
      kind: "permission_settled" as const,
      instanceId,
      requestId,
      processGeneration: ask.processGeneration,
      outcome,
    };
    if (!this.sink(settled)) {
      this.#unheardSettles.set(requestId, settled);
    }
    this.#touch(instanceId);
    const left = (this.#pulseBlocked.get(instanceId) ?? 1) - 1;
    if (left === 0) {
      this.#pulseBlocked.delete(instanceId);
    } else {
      this.#pulseBlocked.set(instanceId, left);
    }
    this.#emitPulse(instanceId, true);
  }
}
