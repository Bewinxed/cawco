/**
 * Owns every live session on this machine — across every harness — and pumps
 * their neutral frames at the hub. Harness-agnostic: the git worktrees, side
 * spin-offs, busy tracking, bootstrap clone and the routing live here; the actual
 * sessions are {@link HarnessSession}s produced by the adapters in
 * `./harnesses`. Nothing here interprets a harness's own event — frames go out
 * as neutral messages, with the harness's `raw` event riding along.
 */

import { mkdir } from "node:fs/promises";
import { hostname } from "node:os";
import { ARTIFACT_PICTURE } from "@cawco/core/artifact-picture";
import { RESOLVE_PERMISSION, WITHDRAW_PERMISSION } from "@cawco/core/ask-tools";
import type { AskAnswer } from "@cawco/core/asks";
import {
  AGENT_RESTARTING,
  mergeHolds,
  type RestartHold,
  waitingWords,
} from "@cawco/core/binary-updates";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { CANVAS_SCREEN_CLOSE, CANVAS_SCREEN_OPEN } from "@cawco/core/canvas";
import type { CutCommand } from "@cawco/core/commands/controls";
import { CONTROL_RUN_COMMAND } from "@cawco/core/commands/controls";
import {
  CONTROL_READ_CONTINUATION,
  type ContinuationReadOptions,
  readContinuation,
} from "@cawco/core/continuation-read";
import { SHELL_TOOLS } from "@cawco/core/delegate-types";
import { detach } from "@cawco/core/detach";
import type { FleetDelta } from "@cawco/core/fleet";
import { FLEET_DELTA, FLEET_STATUS } from "@cawco/core/fleet";
import type {
  AsleepFrame,
  ControlResultFrame,
  FramePayload,
  HarnessFailed,
  HarnessUnanswered,
} from "@cawco/core/frames";
import type { AgentBusyReport, AgentNotice } from "@cawco/core/harness";
import {
  ACCOUNT_READ,
  BOUNDARY_RELAUNCH,
  CLI_OUTDATED,
  COMPACT_RELAUNCH,
  CONTAINERS_ENDED,
  CONTAINERS_UNTRACKED,
  CONTROL_FORGET_CREDENTIALS,
  LEAK_ENDED,
  LEAK_FOUND,
  type LeakFound,
  LIMIT_REACHED,
  type LimitHolder,
  RATE_LIMIT_READ,
  ROOM_HELD,
  SESSION_DIR_READ,
} from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import {
  harnessesWith,
  type KeeperHarnessKind,
  traitsOf,
} from "@cawco/core/harness/traits";
import { GENERATE_IMAGE } from "@cawco/core/image-generation";
import { withWorktreeLine } from "@cawco/core/injected";
import { inFlight } from "@cawco/core/loop-watch";
import { machineLabel } from "@cawco/core/machine-names";
import { sessionScratchDir } from "@cawco/core/paths/workspace";
import {
  PREVIEW_FOLDERS,
  PREVIEW_START,
  PREVIEW_STOP,
  PREVIEW_WEIGHT,
  PreviewStartDown,
} from "@cawco/core/preview/protocol";
import type {
  ControlPayload,
  Envelope,
  FsPayload,
  IngestMark,
  LaunchGrant,
  SendPayload,
  SessionAddress,
  SpawnPayload,
  StopPayload,
} from "@cawco/core/protocol";
import { AGENT_BUSY, isGitUrl, repoPath } from "@cawco/core/protocol";
import { lastErrorKindOf } from "@cawco/core/relaunch";
import { SAFE_GIT, SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type {
  CarrySessionRequest,
  GitChanges,
  WorkInFlight,
} from "@cawco/core/session/controls";
import {
  CONTROL_ABANDON,
  CONTROL_CARRY_SESSIONS,
  CONTROL_GIT_CHANGES,
  CONTROL_INTERRUPT,
  CONTROL_LIST_SESSIONS,
  CONTROL_QUERIES,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_READ_TRANSCRIPT_WINDOW,
  CONTROL_RESTLESS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SLEEP,
  CONTROL_SPIN_OFF_HELD,
  CONTROL_WORK_IN_FLIGHT,
  unknownControlWords,
} from "@cawco/core/session/controls";
import { hostEnvironment } from "@cawco/core/session-env";
import type {
  NeutralMessage,
  NeutralResultMessage,
  NeutralSessionInfo,
  PermissionResult,
} from "@cawco/core/session-messages";
import {
  cacheHit,
  MESSAGES_HELD,
  MESSAGES_READ,
  MESSAGES_STORED,
  promptCacheUsage,
  REPEATED_FAILURE,
  REPEATED_FAILURE_LIMIT,
} from "@cawco/core/session-messages";
import {
  SESSIOND_PROCESS_LIMIT,
  type SessiondLimit,
} from "@cawco/core/sessiond";
import { shellQuote } from "@cawco/core/shell-quote";
import { isDamagedRecord } from "@cawco/core/state-file";
import type { FrameProvenance } from "@cawco/core/stream";
import {
  alreadyIngested,
  readDelivered,
  readIngested,
  resumeCursor,
} from "@cawco/core/stream";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";
import {
  CONTROL_BEGIN_TOOL_SIGNIN,
  CONTROL_COMPLETE_TOOL_SIGNIN,
} from "@cawco/core/tools";
import type { WindowAsk } from "@cawco/core/transcript-types";
import { unhandled } from "@cawco/core/unhandled";
import { harnessWords } from "@cawco/core/words/harness";
import {
  limitSentence,
  roomHeldSentence,
} from "@cawco/core/words/harness-lines";
import { processLimitSentence } from "@cawco/core/words/sessiond";
import { turnWords } from "@cawco/core/words/turns";
import { workWords } from "@cawco/core/words/work";
import {
  CONTROL_WORKSPACE_WORK_END,
  type WorkspaceRef,
} from "@cawco/core/workspace/controls";
import { Effect } from "effect";
import type { AgentPorts } from "./agent-ports";
import { drawArtifact } from "./artifact-picture";
import { withFiles } from "./attachments";
import { boundaryFor } from "./boundary/control";
import { hookArmed } from "./boundary/ensure";
import { sandboxOf } from "./boundary/sandboxes";
import type { Boundary } from "./boundary/state";
import { endSessionWork } from "./boundary/work";
import {
  type BrowserDoor,
  browserDoor,
  closeBrowserDoor,
  forgetBrowserDoor,
} from "./browser/door";
import {
  closeCanvasScreen,
  closeCanvasScreens,
  openCanvasScreen,
} from "./canvas-screen";
import {
  type ControlLane,
  type ControlMethod,
  imageLane,
  type MachineControl,
} from "./control-lanes";
import { reportDamaged } from "./damaged-records";
import { forgetFirstSession } from "./first-session";
import { FleetConverger } from "./fleet-converger";
import type { FrameSink } from "./frame-sink";
import { runFs } from "./fs";
import { hostGit } from "./git/run";
import type {
  Harness,
  HarnessContext,
  HarnessSession,
  KeeperHarness,
  ServerHarness,
  SessionCarry,
  TranscriptSpan,
} from "./harness";
import {
  HarnessRecoveryRefused,
  HeldProcessRefused,
  isKeeperHarness,
  isServerHarness,
  ReattachFailed,
  SessionAddressRefused,
} from "./harness";
import { harnesses, harness as harnessOf } from "./harnesses";
import {
  installCredential,
  installOf,
  verifyHeldCredential,
} from "./harnesses/credential-controls";
import { hostScratchReady } from "./host-scratch";
import { folderTurn, runHubCommand } from "./hub-command";
import { generateImage } from "./image-generation";
import { isDirectory } from "./is-directory";
import { KeeperPool, type KeeperReading, withKeepers } from "./keepers";
import { watchLeaks } from "./leak-watch";
import { createLeftRunning } from "./left-running";
import { LiveSessions } from "./live-sessions";
import { measureMemoryRoom } from "./machine-room";
import { mcpGateOf, mcpHost } from "./mcp-host";
import { retireInstalls } from "./mcp-install";
import { onFleetMcpMoved } from "./mcp-status";
import { gaugeGroup, gaugeTables } from "./memory";
import { noticeMessage } from "./notices";
import { Outbox } from "./outbox";
import {
  foldersThere,
  previewWeight,
  startPreview,
  stopPreview,
  stopPreviews,
} from "./preview";
import { parseProcId, sessionOfProc } from "./proc-id";
import { forgetRevoked, rememberCredential } from "./redaction";
import { removeTree } from "./remove-tree";
import { arrive, keepAnswer } from "./request-record";
import { fenced } from "./restart";
import {
  beginEnding,
  containersEndedWords,
  containersUntrackedWords,
  endSessionContainers,
  finishEnding,
  openContainerDoors,
  sessionsOwedEnding,
} from "./session-containers";
import { errorText, warn } from "./session-log";
import {
  endProc,
  type KeeperRefused,
  keeperLimits,
  procEpoch,
} from "./sessiond-client";
import { SpinOffs } from "./spin-offs";
import { carryStages } from "./stage";
import { StreamsSoFar } from "./stream-so-far";
import { forgetTaken, hasTaken, noteTaken } from "./taken-sends";
import { beginToolSignin, completeToolSignin } from "./tool-signin";
import { installTool, probeTools } from "./tools";
import { cloneHolding, workspaceHolding } from "./workspace-records";

/** Every harness whose sessions live in a server that outlives the agent. */
const serverAdapters = (): ServerHarness[] =>
  harnesses().filter(isServerHarness);

/** The sessions those servers say are running: their own word on their turns ({@link ServerCustody.busyInstances}). */
const serverBusyInstances = async (): Promise<string[]> =>
  (
    await Promise.all(
      serverAdapters().map((adapter) => adapter.custody.busyInstances())
    )
  ).flat();

/** The controls that change a session's setting: each names it as its one argument. */
const SETTING_CONTROLS: ReadonlySet<string> = new Set([
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SET_EFFORT,
]);

/**
 * A surviving child one reattach has claimed, and what it decided about it.
 * `spec` is the spawn the hub sent for its session (server.ts `restore`),
 * whole: an attach runs under every option its launch ran under, from that
 * one source ({@link SessionSupervisor.#sessionContext}, the adapter's
 * `adopt`).
 */
interface Claimed {
  proc: { epoch: string; head: number; pid: number };
  /** Whether its turn was running when its ring was read. */
  running: boolean;
  /** Lets go of the claim, for a reattach waiting on this row. */
  settle: () => void;
  spec: SpawnPayload;
}

/**
 * Whether a frame is an account reading: those name the launch that read
 * them, so the hub keeps each for the account that launch runs on and drops
 * one from a process its row has since replaced.
 */
/**
 * A main-thread message's shell calls, kept in `running` by tool use until
 * their results; answers whether one started.
 */
const shellCallsOf = (
  message: NeutralMessage,
  running: Map<string, string>
): boolean => {
  if (
    (message.type !== "assistant" && message.type !== "user") ||
    message.parent_tool_use_id ||
    !Array.isArray(message.message.content)
  ) {
    return false;
  }
  let started = false;
  for (const block of message.message.content) {
    const command =
      block.type === "tool_use" && SHELL_TOOLS.has(block.name)
        ? (block.input as { command?: unknown } | undefined)?.command
        : undefined;
    if (block.type === "tool_use" && typeof command === "string") {
      running.set(block.id, command);
      started = true;
    } else if (block.type === "tool_result") {
      running.delete(block.tool_use_id);
    }
  }
  return started;
};

/**
 * A frame that speaks for the session's account, which the hub takes only
 * from the launch it names (its `processGeneration`): a read of the account
 * (its catalog, its limits, its session's dir), or Claude Code's error in
 * the model's place, which the hub reads for a refusal of the account (hub
 * ask-routing.ts `settleRefusal`, which settles nothing for a frame naming no
 * launch). Without the error here, no refusal was ever settled: on
 * 2026-11-04 an account Anthropic refused (`oauth_org_not_allowed`) stayed
 * signed in, sessions were carried onto it, and a delegate's item failed.
 */
const speaksForAccount = (message: NeutralMessage): boolean =>
  (message.type === "system" &&
    (message.subtype === ACCOUNT_READ ||
      message.subtype === RATE_LIMIT_READ ||
      message.subtype === SESSION_DIR_READ)) ||
  (message.type === "assistant" &&
    !message.parent_tool_use_id &&
    message.error !== undefined);

/** How often a start waiting for memory measures the room again. Ours: the readings span 10 s, and a start held a few seconds past the room's return costs nothing. */
const ROOM_POLL_MS = 3000;

/**
 * What the runtime itself holds in `session`'s process that a stop would
 * lose ({@link HarnessSession.holding}); for a move's stop, then the work it
 * holds for later (`later`, {@link HarnessSession.heldForLater}), last, so
 * `later` means nothing else keeps it and a move may end it.
 */
const heldBy = (
  session: HarnessSession,
  forMove: boolean
): { why: string; later?: true } | undefined => {
  const held = session.holding?.(forMove);
  if (held) {
    return { why: held };
  }
  const later = forMove ? (session.heldForLater?.() ?? []) : [];
  return later.length > 0
    ? { why: waitingWords(later), later: true }
    : undefined;
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

/**
 * How long one harness's session catalog may take within a machine's
 * listing: under the dashboard's 15s wait for the whole answer
 * (`CONTROL_TIMEOUT_MS`), so the harnesses that answered still reach it.
 */
const HARNESS_LISTING_MS = 10_000;

/** How often a start that waits for a turn's end looks at it ({@link SessionSupervisor.#turnEnded}). */
const TURN_END_LOOK_MS = 250;

/**
 * A listed session with its first prompt as a title
 * ({@link NeutralSessionInfo.firstTitle}), derived once here so no reader
 * parses the prompt.
 */
const titled = (info: NeutralSessionInfo): NeutralSessionInfo => {
  const firstTitle = info.firstPrompt
    ? deriveTitleFromFirstMessage(info.firstPrompt)
    : "";
  return firstTitle ? { ...info, firstTitle } : info;
};

/** A call for a session this agent runs no process for: a control refusal of kind `not-running`. */
class NotRunning extends Error {
  constructor(instanceId: string) {
    super(`no session ${instanceId}`);
    this.name = "NotRunning";
  }
}

/** How many requests the hub let go before they began here are kept, to refuse each as it begins. */
const LET_GO_KEPT = 256;

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

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
const IDLE_SLEEP_MS = 30 * 60_000;

/** How often the sessions at rest are looked at. Ours: a minute is as fine as half an hour is read. */
const IDLE_SWEEP_MS = 60_000;

/**
 * {@link CONTROL_GIT_CHANGES}: exactly two read-only git commands in `cwd`.
 * `git status` refusing (exit 128: no work tree here) answers `{ repo: false }`.
 * In a workspace's clone they run inside its boundary, as every git call
 * there does (`safe-git.ts`): its config and hooks are the workspace's to
 * write, and `git status` runs what they name (an fsmonitor, a filter). A
 * place is a person's own folder, whose protected config its boundary
 * cannot write (core workspace-policy.ts): there they run on the host.
 */
const gitChanges = async (dir: string, since: string): Promise<GitChanges> => {
  const workspace = await cloneHolding(dir);
  const git = async (args: string) =>
    workspace
      ? await runHubCommand(
          dir,
          `${SAFE_GIT_SHELL}git ${args}`,
          GIT_CHANGES_TIMEOUT_MS,
          workspace
        )
      : await runHubCommand(dir, `${SAFE_GIT} ${args}`, GIT_CHANGES_TIMEOUT_MS);
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

/** A `<scheme>://` git URL's host and path, past any login and port. */
const SCHEME_URL_PARTS =
  /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]*)(?::\d*)?(\/.*)?$/iu;
/** An scp-like git URL's host and path, past any login. */
const SCP_URL_PARTS = /^(?:[^@/:]*@)?([^/:]+):\/?(.*)$/u;
const TRAILING_SLASHES = /\/+$/u;
const DOT_GIT = /\.git$/u;
const LEADING_SLASHES = /^\/+/u;

/**
 * A git URL as `host/path`, lowercased, without its login, port, `.git` or
 * trailing slash: the same repository, under whichever of its URLs
 * (`https://`, `ssh://`, scp-like), is the same repository, and the same
 * path on another host is another.
 */
const repoIdentity = (url: string): string => {
  const bare = url.trim().replace(TRAILING_SLASHES, "").replace(DOT_GIT, "");
  const parts = bare.match(SCHEME_URL_PARTS) ?? bare.match(SCP_URL_PARTS);
  const [host = "", path = ""] = parts ? [parts[1], parts[2]] : ["", bare];
  return `${host}/${path.replace(LEADING_SLASHES, "")}`.toLowerCase();
};

/** What a clone of it is called on disk — git's own default. */
const repoLeaf = (repo: string): string =>
  repoPath(repo).split("/").pop() ?? "";

/** A reason's own full stop, dropped where a sentence carries on after it. */
const FINAL_STOP = /\.$/u;

/** The machine-scoped session-catalog controls, routed to a harness. */
const CATALOG_METHODS = new Set([
  "listSessions",
  "getSessionInfo",
  "getSessionMessages",
  CONTROL_READ_TRANSCRIPT_WINDOW,
  CONTROL_READ_CONTINUATION,
  "renameSession",
  "tagSession",
  "deleteSession",
]);

/**
 * The catalog controls that only read a stored conversation. Each waits for
 * a change of the same conversation already on its way (a rename, a tag, a
 * delete) and for nothing else: never for another read, of it or of any
 * other session, so a read of a transcript of hundreds of megabytes holds up
 * no other reader ({@link SessionSupervisor.dispatch}).
 */
const CATALOG_READS = new Set([
  "listSessions",
  "getSessionInfo",
  "getSessionMessages",
  CONTROL_READ_TRANSCRIPT_WINDOW,
  CONTROL_READ_CONTINUATION,
  CONTROL_READ_SESSION_CONTEXT,
]);

/** Stored transcripts read at once ({@link SessionSupervisor.#transcriptRead}). Ours: the hub's settle reads ask four of a machine at once (server.ts `SETTLE_READS_PER_MACHINE`); a page's and Find's reads take the rest. */
const TRANSCRIPT_READS_AT_ONCE = 8;

/** A catalog read that took this long or longer says so in the log, with what it read. */
const CATALOG_SLOW_MS = 1000;

/** A catalog read that was slow, said in the log with what it read; nothing for a quick one. */
const catalogRead = (at: number, what: string): void => {
  const took = Date.now() - at;
  if (took >= CATALOG_SLOW_MS) {
    console.info(`[catalog] ${what}, read in ${took} ms`);
  }
};

/**
 * The short ids a continuation read counts the hand-offs of as the
 * session's asks (core `ContinuationReadOptions.askers`): a delegate's
 * parent; none when its options name none.
 */
const askersOf = (arg: unknown): string[] => {
  const askers =
    typeof arg === "object" && arg !== null
      ? (arg as ContinuationReadOptions).askers
      : undefined;
  return Array.isArray(askers)
    ? askers.filter((one): one is string => typeof one === "string")
    : [];
};

/** The lane a catalog control takes: its conversation's, by its session key; the whole catalog's for a listing. */
const catalogLane = (method: string, args: unknown[] | undefined): string =>
  method === "listSessions" ? "catalog:list" : `catalog:${String(args?.[0])}`;

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
 *
 * `from` picks the catalogs: `disk`, the ones read from files, which the
 * register carries; `server`, the ones read from a harness's servers'
 * databases ({@link Harness.catalogFromServer}), read after the register
 * because that read can be slow. The hub judges no row by a server's catalog
 * (OpenCode's rows resume whatever it lists), so the register's is complete
 * without it.
 */
export const resumableSessions = async (
  from: "disk" | "server"
): Promise<{ lastModified: number; sessionId: string }[] | undefined> => {
  const found: { lastModified: number; sessionId: string }[] = [];
  let sawAny = false;
  for (const adapter of harnesses().filter(
    (one) => (one.catalogFromServer === true) === (from === "server")
  )) {
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
/** What the supervisor sends through, or hands to the work it starts: a command's queue, a preview's stage and browser. */
type SupervisorPorts = Pick<
  AgentPorts,
  | "borrowAsk"
  | "browsers"
  | "commandQueue"
  | "emit"
  | "machineId"
  | "stage"
  | "stageClone"
>;

export class SessionSupervisor {
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
  /** The sessions whose custody is not decided yet, each let go as its own harness settles it. */
  #custodyInstances = new Set<string>();
  /**
   * The harness each undecided session's custody waits on, from the register
   * ack on ({@link custodyUnits}). Undefined before it: until the hub has
   * answered, no harness's custody is known.
   */
  #custodyHarnesses: Map<string, HarnessKind> | undefined;

  readonly #ports: SupervisorPorts;

  constructor(ports: SupervisorPorts) {
    this.#ports = ports;
    gaugeTables("supervisor", {
      asleep: this.#asleep,
      handed: this.#handed,
      queues: this.#queues,
      resumable: this.#resumable,
      ingested: this.#ingested,
      openAsks: this.#openAsks,
      unheardSettles: this.#unheardSettles,
      titles: this.#titles,
      failures: this.#failures,
      generations: this.#generations,
      placed: this.#placed,
    });
    // Each live session's own tables, summed by name across sessions.
    gaugeGroup("session", () => {
      const totals: Record<string, number> = {};
      for (const session of this.#live.sessions.values()) {
        for (const [name, size] of Object.entries(session.tables?.() ?? {})) {
          totals[name] = (totals[name] ?? 0) + size;
        }
      }
      return totals;
    });
    for (const adapter of serverAdapters()) {
      adapter.custody.setCustodyReadiness(() =>
        this.harnessCustodyReady(adapter.kind)
      );
    }
    onFleetMcpMoved(() => this.#fleet.reportFleet());
    keeperLimits.on("limit", (message) => this.#limitReached(message));
    watchLeaks({
      targetOf: (procId, pid) => this.#touched(procId, pid),
      sandboxOf,
      tell: (instanceIds, id, content, found) =>
        this.#leakFound(instanceIds, id, content, found),
      ended: (instanceIds, id) => this.#leakEnded(instanceIds, id),
    });
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
    const server = serverAdapters()[0]?.custody;
    return await Promise.all(
      rows.map(async (row) => {
        try {
          if (row.sessionId) {
            if (!server) {
              throw new Error("No complete server-session reading available.");
            }
            return {
              id: row.id,
              present: await server.sessionPresent(row.sessionId, row.cwd),
            };
          }
          if (!server) {
            throw new Error("No complete runner reading available.");
          }
          const reading = await server.unclaimedRunners(row.cwd, claimed);
          return { id: row.id, present: reading.count === 0 ? false : null };
        } catch {
          return { id: row.id, present: null };
        }
      })
    );
  }
  /** The sessions this agent carries now, and their pulse (live-sessions.ts). */
  readonly #live = new LiveSessions({
    adopting: (instanceId) => this.#adopting.has(instanceId),
    sink: (frame) => this.sink(frame),
    forget: (instanceId) => this.#forgetProcess(instanceId),
  });
  /**
   * The carry of sessions between account directories
   * ({@link Harness.carrier}): its requests name Claude sessions (core
   * `RegisterAckPayload.sessions`, {@link CONTROL_CARRY_SESSIONS}), so it is
   * the Claude adapter's.
   */
  readonly #carrier = harnessOf("claude")?.carrier?.({
    adopting: (instanceId) => this.#adopting.has(instanceId),
    awakeForMove: (instanceId, session) =>
      this.#awakeForMove(instanceId, session),
    drop: (instanceId, how) => this.#live.drop(instanceId, how),
    endWork: (instanceId, why) => this.#endWork(instanceId, why),
    queued: (instanceId) => this.#queues.has(instanceId),
    running: (instanceId) => this.#live.sessions.get(instanceId),
  });

  /** The carry of sessions between account directories ({@link CONTROL_CARRY_SESSIONS}). */
  get carrier(): SessionCarry {
    if (!this.#carrier) {
      throw new Error("no harness adapter carries sessions between accounts");
    }
    return this.#carrier;
  }
  /** The sessions this daemon put to sleep, until their next start ({@link sleep}). */
  readonly #asleep = new Set<string>();
  /** Each session's shell calls running now, by tool use: their commands, off its own frames ({@link #noteShell}). */
  readonly #shells = new Map<string, Map<string, string>>();
  /** Each session's command trees, recorded as they start, ended when its harness process dies (left-running.ts). */
  readonly #leftRunning = createLeftRunning();
  readonly #generations = new Map<string, string>();
  /**
   * Each session's harness, and the pid and workspace of the boundary its
   * commands run in when it has one, as its last start or attach set them:
   * how a keeper child's limit finds the sessions it touched
   * ({@link #limitReached}), and which boundaries a carried session holds
   * ({@link boundedWorkspaces}).
   */
  readonly #placed = new Map<
    string,
    { harness: HarnessKind; boundaryPid?: number; workspace?: string }
  >();

  /**
   * The workspaces whose boundary a carried session's commands run in, of
   * every harness: each holds its boundary up while it is carried, asleep it
   * holds nothing (boundary/looks.ts `watchQuietBoundaries`). A CLI adopted from
   * the agent before is held there by its process (boundary/holding.ts `attachedIn`).
   */
  boundedWorkspaces(): string[] {
    return [...this.#live.sessions.keys()].flatMap((instanceId) => {
      const workspace = this.#placed.get(instanceId)?.workspace;
      return workspace ? [workspace] : [];
    });
  }
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
   * until their next start: the failure that refusal is says why, so the
   * harness letting go of what it was handed fails nothing ({@link #reject}).
   */
  readonly #keeperRefused = new Map<string, KeeperRefused>();
  /**
   * Each session's sends handed to its process and not yet read, whole, by
   * uuid: what goes back to the hub when that process goes away
   * ({@link #handBack}). `storedAs` is the id the harness said it keeps the
   * send under ({@link MESSAGES_STORED}), which its read may name instead.
   */
  readonly #handed = new Map<
    string,
    Map<string, { payload: SendPayload; storedAs?: string }>
  >();
  /**
   * What the hub is told of a process going away and the sends it handed
   * back, in order, while no connection takes it: said on the next one.
   */
  readonly #unsentGone: Parameters<FrameSink>[0][] = [];
  /** Reattaches in flight, by instance id: see {@link reattach}. */
  readonly #adopting = new Map<string, Promise<void>>();
  /**
   * Each held child taken into custody and not yet attached, or a reattach
   * start in flight, by instance id: what a stop for it cuts short
   * ({@link dispatch}), so the stop behind it in the session's queue ends the
   * child rather than wait on an answer it may never give.
   */
  readonly #attaching = new Map<string, AbortController>();
  /**
   * Each start waiting for the machine's memory ({@link #roomForStart}), by
   * instance id: a stop for it ends the wait ({@link dispatch}).
   */
  readonly #roomWaits = new Map<string, AbortController>();
  /**
   * Each start that replaces a process still in its turn, waiting for that
   * turn to end ({@link #turnEnded}), by instance id. While it waits, a
   * control for the session (an answer to its ask, the person's interrupt)
   * goes to the running process at once rather than queue behind it, and a
   * stop ends the wait: the start is dropped ({@link dispatch}).
   */
  readonly #relaunchWaits = new Map<string, AbortController>();
  /** The keepers a start's room is read under: the current one names where its children start ({@link #roomForStart}). */
  readonly #keepers = new KeeperPool();
  /** The machine's fleet convergence, which reads the live sessions only to tell one to heal (fleet-converger.ts). */
  readonly #fleet = new FleetConverger({
    sessions: this.#live.sessions,
    cwdOf: (instanceId) => this.#resumable.get(instanceId)?.cwd,
    emit: (envelope) => this.emit(envelope),
  });

  /** The machine's fleet convergence (fleet-converger.ts): the daemon's register reads what it holds, a workspace's cut places its rows. */
  get fleet(): FleetConverger {
    return this.#fleet;
  }
  /**
   * The held children taken into custody whose turn is not decided yet: busy
   * until it is, as unknown is ({@link busyNow}).
   */
  readonly #turnPending = new Set<string>();
  /** The spin-offs running here, their worktrees and their transcripts (spin-offs.ts). */
  readonly #spinOffs = new SpinOffs({
    sink: (frame) => this.sink(frame),
    transcriptDeleted: (sessionId) => this.#transcriptDeleted(sessionId),
  });
  /** One chain per instance, so envelopes about it are handled in arrival order. */
  readonly #queues = new Map<string, Promise<void>>();

  /** Transcript reads running now ({@link TRANSCRIPT_READS_AT_ONCE} at most), and those waiting their turn. */
  #transcriptReading = 0;
  readonly #transcriptTurns: (() => void)[] = [];

  /**
   * One stored transcript's read, {@link TRANSCRIPT_READS_AT_ONCE} at a
   * time. Each read's parse is a few milliseconds of the loop, and reads
   * that finish together run back to back before any timer: 128 at once
   * held the agent's loop a second (agent-loop probe, 2026-10-24). One long
   * read takes one turn, so it holds up no more than that.
   */
  async #transcriptRead<T>(read: () => Promise<T>): Promise<T> {
    if (this.#transcriptReading >= TRANSCRIPT_READS_AT_ONCE) {
      await new Promise<void>((resolve) => this.#transcriptTurns.push(resolve));
    } else {
      this.#transcriptReading += 1;
    }
    try {
      return await read();
    } finally {
      const next = this.#transcriptTurns.shift();
      if (next) {
        next();
      } else {
        this.#transcriptReading -= 1;
      }
    }
  }
  /** Attached sessions whose CLI runs a boundary hook that fails open, until the relaunch that replaces it ({@link BOUNDARY_RELAUNCH}). */
  readonly #failOpen = new Set<string>();
  /** Claude processes that ran a manual `/compact`, until the relaunch that replaces them ({@link COMPACT_RELAUNCH}). */
  readonly #compactedHere = new WeakSet<HarnessSession>();
  /**
   * Each session's run of identical failed turns since its last send: the
   * failure's words and how many times in a row ({@link #watchFailure}).
   */
  readonly #failureRun = new Map<string, { words: string; count: number }>();
  /**
   * Claude sessions whose last keep-alive read under 90% of its prompt from
   * the cache: measured, never predicted from a file written. No further
   * keep-alive goes to one until a real turn's result shows its cache again.
   */
  readonly #cacheCold = new Set<string>();
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
   * EVERY MACHINE-SCOPED CONTROL, DECLARED ONCE WITH ITS LANE: what it runs,
   * and the queue it waits in ({@link dispatch}); one that names no lane
   * waits behind its own kind (`machine:<method>`). The supervisor declares
   * its own here, the daemon the rest as it starts ({@link declareControl},
   * {@link declareRead}). A session's own controls go to its process
   * ({@link #call}), and the session catalog's to the harness it names.
   */
  readonly #controls: Record<string, MachineControl> = {
    // A generation runs in this process, so a restart cuts it: none starts behind a raised fence.
    // A slow image request must not block machine busy probes or other
    // controls.
    [GENERATE_IMAGE]: {
      lane: imageLane,
      call: (_instanceId, cwd, input, bound, project) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : generateImage(this.#ports, cwd as string, input, bound, project),
    },
    [PREVIEW_START]: {
      call: (options) =>
        startPreview(
          options as Parameters<typeof startPreview>[0],
          this.#ports
        ),
    },
    [PREVIEW_STOP]: {
      call: (options) =>
        stopPreview(options as Parameters<typeof stopPreview>[0]),
    },
    [PREVIEW_WEIGHT]: { call: (dir, path) => previewWeight(dir, path) },
    // A read of folders, as a machine registers: nothing starts (preview.ts `foldersThere`).
    [PREVIEW_FOLDERS]: { call: (dirs) => foldersThere(dirs) },
    // A canvas no person's screen shows, drawn by this machine's Chromium (canvas-screen.ts).
    [CANVAS_SCREEN_OPEN]: {
      call: (options) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : openCanvasScreen(options as Parameters<typeof openCanvasScreen>[0]),
    },
    [CANVAS_SCREEN_CLOSE]: {
      call: (options) =>
        closeCanvasScreen(options as Parameters<typeof closeCanvasScreen>[0]),
    },
    // A preview or a page drawn as the panel draws it, for artifact_read's png (artifact-picture.ts).
    [ARTIFACT_PICTURE]: {
      call: (options) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : drawArtifact(options as Parameters<typeof drawArtifact>[0]),
    },
    [AGENT_BUSY]: { call: () => this.busyNow() },
    [CONTROL_ABANDON]: {
      call: (requestId) => this.#abandon(String(requestId)),
    },
    [CONTROL_RESTLESS]: { call: (ids) => this.#restless(ids as string[]) },
    // The hub revoked these credentials: they grant nothing now.
    [CONTROL_FORGET_CREDENTIALS]: {
      call: (ids) => ({ forgotten: forgetRevoked(ids as string[]) }),
    },
    // Each carry in a lane of its own: one session's carry never waits on
    // another's. A second carry of a conversation one is still carrying is
    // refused with that reason (claude-carry.ts `carrySessions`).
    [CONTROL_CARRY_SESSIONS]: {
      lane: (control) => `carry:${control.requestId}`,
      call: (requests) =>
        this.carrier.carrySessions(requests as CarrySessionRequest[]),
    },
    [CONTROL_SPIN_OFF_HELD]: {
      call: (instanceId) => this.#spinOffs.spinOffHeld(String(instanceId)),
    },
    [CONTROL_GIT_CHANGES]: {
      call: (dir, since) => gitChanges(dir as string, since as string),
    },
    listTools: { call: () => probeTools() },
    [CONTROL_BEGIN_TOOL_SIGNIN]: {
      call: (tool) => beginToolSignin(String(tool)),
    },
    [CONTROL_COMPLETE_TOOL_SIGNIN]: {
      call: (tool, code) =>
        completeToolSignin(String(tool), String(code ?? "")),
    },
    installTool: { call: (...args) => this.#installTool(args) },
    // A delta, held as it arrived and kept on disk (#holdDelta): answered
    // at once with the generation kept (ACK; READY for a welcome), its
    // policy and items applied after (#writePolicy, #convergeSoon), each
    // said as it moves. Only the machine's agent holds the hub's link, and
    // so only it is sent one.
    // Deltas in a lane of their own, in the order they came: an answer
    // (ACK means kept on disk) never waits behind the machine's other
    // controls, as a just-started agent's welcome waited 14 to 51 s
    // behind its start-up work (2026-10-25 17:39-17:43).
    [FLEET_DELTA]: {
      lane: () => "fleet",
      call: (delta) => this.#fleet.answerDelta(delta as FleetDelta),
    },
    [FLEET_STATUS]: { call: () => this.#fleet.status() },
  };

  /**
   * Declares machine-scoped control `name` ({@link #controls}), callable
   * without an instanceId, waiting in `lane` when it names one.
   */
  declareControl(name: string, call: ControlMethod, lane?: ControlLane): void {
    this.#controls[name] = { call, ...(lane ? { lane } : {}) };
  }

  /**
   * Declares a machine-scoped read the hub may stop waiting for
   * ({@link CONTROL_ABANDON}): it runs in a lane of its own and is handed a
   * signal that aborts when the hub says it let its request go. A read
   * the hub may let go runs beside every other: one search never waits on
   * another, nor the hub's word that it let one go on it.
   */
  declareRead(
    name: string,
    read: (signal: AbortSignal, ...args: unknown[]) => unknown
  ): void {
    this.#controls[name] = {
      lane: (control) => `read:${control.requestId}`,
      read,
    };
  }

  /** Each abandonable read running, by the hub's request id. */
  readonly #reads = new Map<string, AbortController>();
  /** Requests the hub let go before they began here, oldest first: each refused as it begins. */
  readonly #letGo = new Set<string>();

  /** `read`, stopped when the hub lets `requestId` go. */
  async #abandonableRead(
    read: (signal: AbortSignal, ...args: unknown[]) => unknown,
    requestId: string | undefined,
    args: unknown[]
  ): Promise<unknown> {
    if (requestId && this.#letGo.delete(requestId)) {
      throw new Error("the hub let this read go before it began");
    }
    const stop = new AbortController();
    if (requestId) {
      this.#reads.set(requestId, stop);
    }
    try {
      return await read(stop.signal, ...args);
    } finally {
      if (requestId) {
        this.#reads.delete(requestId);
      }
    }
  }

  /** The hub let read `requestId` go: stopped where it runs, or refused when it begins. */
  #abandon(requestId: string): { stopped: boolean } {
    const read = this.#reads.get(requestId);
    if (read) {
      read.abort(new Error("the hub stopped waiting for it"));
      return { stopped: true };
    }
    this.#letGo.add(requestId);
    if (this.#letGo.size > LET_GO_KEPT) {
      const oldest = this.#letGo.values().next().value;
      if (oldest !== undefined) {
        this.#letGo.delete(oldest);
      }
    }
    return { stopped: false };
  }

  /** What a deleted transcript's words are forgotten by: the transcript index (daemon.ts). */
  #transcriptDeleted: (sessionId: string) => Promise<void> = () =>
    Promise.resolve();

  /** Tells the transcript index each transcript this machine deletes, so a purge leaves no words behind. */
  onTranscriptDeleted(forget: (sessionId: string) => Promise<void>): void {
    this.#transcriptDeleted = forget;
  }

  /**
   * Re-pointed at each hub connection; says whether the frame went out. Frames
   * produced while the hub is away are dropped; the hub replays what a session
   * is still blocked on by calling `control reinitialize` after it reconnects,
   * and a spawn's failure is replayed from here ({@link replaySpawnFailures}).
   * Every request's answer is kept as it goes, sent or not (request-record.ts),
   * for the hub that sends the request again once it is back.
   */
  get sink(): FrameSink {
    return this.#answering;
  }
  set sink(to: FrameSink) {
    this.#sinkTo = to;
  }
  #sinkTo: FrameSink = () => false;
  readonly #answering: FrameSink = (frame) => {
    if (frame.kind === "control_result") {
      keepAnswer(frame as ControlResultFrame);
    }
    return this.#sinkTo(frame);
  };
  /** Puts an arbitrary envelope on the daemon's hub socket (hand-offs). */
  emit = (envelope: Envelope): void => this.#ports.emit(envelope);
  /**
   * Asks the hub what a launch starting now runs on ({@link LaunchGrant}),
   * through whichever connection is up; the daemon's to fill in. Settles,
   * granted or refused, within the custody bound.
   */
  launchGrant: (payload: SpawnPayload) => Promise<LaunchGrant> = () =>
    Promise.resolve({
      refusal: "This machine's agent has no hub to ask for the launch.",
    });
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

  /** The reply each session is writing, whole so far ({@link StreamsSoFar}). */
  readonly #streams = new StreamsSoFar();

  /**
   * Every frame a session writes, kept until the hub says it took it
   * ({@link Outbox}). Handed to whatever socket {@link sink} is now.
   */
  readonly #outbox = new Outbox(
    (frame) => this.sink(frame),
    (line) => console.info(`[agent] ${line}`)
  );

  /**
   * A register was acknowledged — called by the daemon from its ack, ahead
   * of anything that ack sets off. What each session is owed goes again
   * ({@link Outbox.linkUp}), then each session's reply so far: what streamed
   * while no hub listened was dropped, and a hub that started since would
   * draw a running reply from its middle.
   */
  linkUp(ack: unknown): void {
    this.#outbox.linkUp(
      {
        delivered: readDelivered(ack),
        hubEpoch: (ack as { hubEpoch?: string } | undefined)?.hubEpoch,
      },
      () => {
        for (const frame of this.#streams.frames()) {
          this.sink({ kind: "frame", ...frame });
        }
      }
    );
  }

  /** The hub socket is gone: frames wait in the outbox for the next register. */
  linkDown(): void {
    this.#outbox.linkDown();
  }

  /** A heartbeat's ack: what the hub took of each session, which the outbox lets go. */
  acknowledged(ack: unknown): void {
    this.#outbox.acknowledged(readDelivered(ack));
  }

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
    // A request the hub sent again, under the id it went under before
    // (request-record.ts): never run twice.
    const requestId = (envelope.payload as { requestId?: unknown } | undefined)
      ?.requestId;
    if (
      typeof requestId === "string" &&
      (envelope.verb === "control" ||
        envelope.verb === "spawn" ||
        envelope.verb === "fs")
    ) {
      const seen = arrive(requestId);
      if (seen !== "run") {
        if (seen !== "running") {
          this.sink(seen);
        }
        return Promise.resolve();
      }
    }
    if (control?.method === FLEET_DELTA && control.requestId) {
      this.#fleet.takeDelta(control.requestId, control.args?.[0] as FleetDelta);
    }
    const imageRequest =
      control?.method === GENERATE_IMAGE ? control.requestId : undefined;
    let key = envelope.instanceId ?? "";
    // A slow image request must not block machine busy probes or other
    // controls. Nor may a command the hub runs (a check, a landing gate step, up
    // to an hour): commands in one directory run one after another, and
    // nothing else waits for them. Each control's lane is declared with it
    // ({@link #controls}).
    const lane = control && this.#controls[control.method]?.lane?.(control);
    if (lane !== undefined) {
      key = lane;
    } else if (
      control &&
      !envelope.instanceId &&
      (CATALOG_METHODS.has(control.method) || CATALOG_READS.has(control.method))
    ) {
      // A stored conversation's own lane: its changes keep their order, and
      // one session's catalog never waits on another's.
      key = catalogLane(control.method, control.args);
    } else if (control && !envelope.instanceId) {
      // Fleet convergence cannot serialize unrelated machine controls behind
      // its HTTP probes. Mutations of the same kind still retain their order.
      key = `machine:${control.method}`;
    }
    if (imageRequest) {
      this.#imageRequests.set(imageRequest, String(control?.args?.[0]));
    }
    // A stop for a session being attached does not wait on its child's
    // answer: the attach lets go, and the stop behind it ends the child.
    if (envelope.verb === "stop") {
      const stopping =
        envelope.instanceId ?? (envelope.payload as StopPayload).instanceId;
      this.#attaching
        .get(stopping)
        ?.abort(new Error("The session was stopped before it was attached."));
      this.#roomWaits
        .get(stopping)
        ?.abort(
          new Error(
            "The session was stopped while it waited for its machine's memory."
          )
        );
      this.#relaunchWaits
        .get(stopping)
        ?.abort(
          new Error(
            "The session was stopped while its start again waited for its turn to end, so it was not started again."
          )
        );
    }
    // The session's turn runs on while a start that replaces it waits for
    // the turn's end ({@link #turnEnded}): what the turn needs from here (an
    // answer to its ask, the person's interrupt) reaches it now.
    if (
      control &&
      key === envelope.instanceId &&
      this.#relaunchWaits.has(key)
    ) {
      return this.#route(envelope).catch((error: unknown) => {
        warn(`${envelope.verb} failed: ${error}`);
      });
    }
    // A question about the session waits for what is already on its way —
    // the spawn that makes the session, a send before it — but nothing waits
    // for its answer: a send behind one sat here until it came back.
    if (
      control &&
      (CONTROL_QUERIES.has(control.method) ||
        (!envelope.instanceId && CATALOG_READS.has(control.method)))
    ) {
      // #control sinks its own answer, success or failure.
      const behind = this.#queues.get(key) ?? Promise.resolve();
      const transcript =
        control.method === "getSessionMessages" ||
        control.method === CONTROL_READ_TRANSCRIPT_WINDOW;
      return inFlight(
        transcript ? "transcript reads" : `${control.method} reads`,
        transcript
          ? behind.then(() => this.#transcriptRead(() => this.#route(envelope)))
          : behind.then(() => this.#route(envelope))
      );
    }
    // A command behind another in its folder says so as it queues (folderTurn).
    const folder =
      control?.method === CONTROL_RUN_COMMAND
        ? folderTurn(control.args, this.#queues.has(key), this.#ports)
        : undefined;
    const routed = (this.#queues.get(key) ?? Promise.resolve()).then(() => {
      folder?.start();
      return this.#route(envelope);
    });
    const queue = (
      envelope.verb === "spawn"
        ? inFlight(
            (envelope.payload as SpawnPayload).reattachOnly
              ? "reattaches"
              : "starts",
            routed
          )
        : routed
    )
      .finally(() => folder?.end())
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
    if (imageRequest) {
      detach(
        queue.then(() => this.#imageRequests.delete(imageRequest)),
        "then"
      );
    }
    return this.#hold(key, queue);
  }

  /** The sessions running right now — what `register` reconciles the hub against. */
  get instanceIds(): string[] {
    return [...this.#live.sessions.keys()];
  }

  get sessionAddresses(): SessionAddress[] {
    const addresses = new Map<string, SessionAddress>();
    for (const [instanceId, session] of this.#live.sessions) {
      if (traitsOf(session.harness).custody === "server" && session.sessionId) {
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
    for (const address of serverAdapters().flatMap((adapter) =>
      adapter.custody.sessionAddresses()
    )) {
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
        ...this.#live.sessions.keys(),
        ...this.#adopting.keys(),
        ...[...this.#queues.keys()].filter((key) => key && !key.includes(":")),
      ]),
    ];
  }

  get custodyReady(): boolean {
    return this.#custodyState === "ready";
  }

  /**
   * Whether `harness`'s custody is decided: the machine's is, or the register
   * ack has named what each harness takes back and none of it is this
   * harness's still. What waits on one harness's sessions (OpenCode's ending
   * and runner readings) waits on that harness alone, never on another's
   * reattach.
   */
  harnessCustodyReady(harness: HarnessKind): boolean {
    if (this.custodyReady) {
      return true;
    }
    const undecided = this.#custodyHarnesses;
    return (
      this.#custodyState === "recovering" &&
      undecided !== undefined &&
      ![...undecided.values()].includes(harness)
    );
  }

  beginCustody(instanceIds: readonly string[]): number {
    this.#custodyState = "recovering";
    this.#custodyError = undefined;
    this.#custodyInstances = new Set(instanceIds);
    this.#custodyHarnesses = undefined;
    this.#custodyEpoch += 1;
    return this.#custodyEpoch;
  }

  /**
   * What the register ack hands this epoch to take back: each session the
   * hub named, by the harness that reattaches it. From here a harness's
   * custody is decided once none of its sessions is left.
   */
  custodyUnits(epoch: number, units: ReadonlyMap<string, HarnessKind>): void {
    if (epoch !== this.#custodyEpoch) {
      return;
    }
    this.#custodyHarnesses = new Map(units);
    this.#custodyInstances = new Set(units.keys());
  }

  /** One session's custody decided (attached, refused, absent or settled unattached): it is no longer waited on. */
  custodySettled(epoch: number, instanceId: string): void {
    if (epoch !== this.#custodyEpoch) {
      return;
    }
    this.#custodyInstances.delete(instanceId);
    this.#custodyHarnesses?.delete(instanceId);
  }

  /** Whether custody is ready now: false when a newer epoch began. */
  completeCustody(epoch: number): boolean {
    if (epoch !== this.#custodyEpoch) {
      return false;
    }
    this.#custodyState = "ready";
    this.#custodyError = undefined;
    this.#custodyInstances.clear();
    this.#custodyHarnesses = new Map();
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
   * A recovery that could not be decided: the register went unanswered. Said
   * to every session it named and in the log, and idle-gated operations stay
   * held; the register is sent again on the same connection (daemon.ts
   * `registrationExpired`). Only for the epoch in progress: one that
   * completed was recovered, and losing the connection after that begins a
   * new one (`loseCustody`). A harness whose reattach fails or runs out of
   * time is not this: it settles its own sessions and custody goes on
   * (daemon.ts `takeCustody`).
   */
  failCustody(epoch: number, problem: unknown): void {
    if (epoch !== this.#custodyEpoch || this.#custodyState === "ready") {
      return;
    }
    this.#custodyState = "failed";
    this.#custodyError =
      problem instanceof Error ? problem.message : String(problem);
    const message = `Machine custody recovery failed: ${this.#custodyError.replace(FINAL_STOP, "")}. The register is sent again while connected; idle-gated operations remain held.`;
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
   * The sessions mid-turn right now, every harness's: a turn this agent
   * started and has not seen end, a held child's turn not decided yet, and
   * OpenCode's own word on its turns ({@link Harness.busyInstances}). What
   * {@link busyNow} reports, and what the agent's hold on idle sleep counts
   * (awake.ts).
   */
  async turnsRunning(): Promise<string[]> {
    const serverBusy = await serverBusyInstances();
    return [
      ...new Set([
        ...this.#live
          .turnsRunning()
          .filter(
            (id) =>
              traitsOf(this.#live.sessions.get(id)?.harness).custody !==
              "server"
          ),
        ...this.#turnPending,
        ...serverBusy,
      ]),
    ];
  }

  /**
   * The sessions mid-turn right now ({@link turnsRunning}), with undecided
   * custody counted busy: the answer {@link AGENT_BUSY} gives over the wire, for the hub's keep-alive and
   * for a restart of the session keeper, which kills the turns. An agent
   * restart reads {@link restartHolds} instead: the keeper runs a turn on
   * through one.
   */
  async busyNow(): Promise<AgentBusyReport> {
    // Recovery must defer retirement, not the machine control reply. A hold
    // can outlast the hub's five-second RPC window; unknown is honestly busy.
    const ready = this.custodyReady;
    const recovery = ready
      ? []
      : [...this.#custodyInstances, `agent:recovery-${this.#custodyState}`];
    const instances = [
      ...new Set([
        ...(await this.turnsRunning()),
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
        ? [
            {
              reason: "starting",
              ids: [
                ...new Set([
                  ...this.#adopting.keys(),
                  ...this.#attaching.keys(),
                ]),
              ],
            },
          ]
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
    this.#live.activeAt(instanceId, met);
    if (!session.sessionId) {
      return;
    }
    const info = await adapter
      .getSessionInfo(session.sessionId, cwd)
      .catch(() => undefined);
    // Unless it has done something since, or is no longer this session.
    if (
      info?.lastModified &&
      this.#live.sessions.get(instanceId) === session &&
      this.#live.lastActive(instanceId) === met
    ) {
      this.#live.activeAt(instanceId, Math.min(met, info.lastModified));
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
    {
      serverBusy,
      keepAliveAside = false,
      forMove = false,
    }: {
      serverBusy?: string[];
      /** The hub's keep-alive is left out: {@link CONTROL_RESTLESS} asks for the rest alone. */
      keepAliveAside?: boolean;
      /** A move's stop: what its resume on the new account brings back is not counted ({@link HarnessSession.holding}). */
      forMove?: boolean;
    } = {}
  ): Promise<{ why: string; unsure?: true; later?: true } | undefined> {
    if (this.#adopting.has(instanceId)) {
      return { why: "its custody is still being decided", unsure: true };
    }
    for (const ask of this.#openAsks.values()) {
      if ("instanceId" in ask && ask.instanceId === instanceId) {
        return { why: "an ask is waiting for its answer" };
      }
    }
    if (this.#live.turnRunning(instanceId)) {
      return { why: "a turn is running" };
    }
    if (this.#live.subagentsRunning(instanceId) > 0) {
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
    const held = heldBy(session, forMove);
    if (held) {
      return held;
    }
    if (traitsOf(session.harness).custody === "server") {
      const busy = serverBusy ?? (await serverBusyInstances());
      if (busy.includes(instanceId)) {
        return {
          why: `the ${session.harness} server reports its turn running`,
        };
      }
      // `<harness>:…` is its server's activity not known, or an operation of
      // the adapter's own in flight: no word on this session either way.
      if (busy.some((id) => id.startsWith(`${session.harness}:`))) {
        return {
          why: `the ${session.harness} server cannot say whether a turn is running`,
          unsure: true,
        };
      }
    }
    return undefined;
  }

  /**
   * Why a carried session's process cannot be ended for a move now
   * ({@link #awake}): the hub's keep-alive left out, and what its resume on
   * the new account brings back not counted.
   */
  #awakeForMove(
    instanceId: string,
    session: HarnessSession
  ): Promise<{ why: string; unsure?: true; later?: true } | undefined> {
    return this.#awake(instanceId, session, {
      keepAliveAside: true,
      forMove: true,
    });
  }

  /**
   * Whether `instanceId`'s process holds a turn now: one running (a send on
   * its way into it included, as a harness is busy from the moment it is
   * handed one) or an ask it parked, whose answer goes to this process alone.
   */
  #inTurn(instanceId: string): boolean {
    if (this.#live.turnRunning(instanceId)) {
      return true;
    }
    for (const ask of this.#openAsks.values()) {
      if ("instanceId" in ask && ask.instanceId === instanceId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Waits for `running`'s turn to end before a start that replaces its
   * process ({@link #spawnClaimed}): a relaunch for a mode, an account move
   * or a hook never cuts a turn, whatever it was running. Nothing is sent to
   * the process meanwhile (what is sent waits behind the start, for the
   * process it starts), but what the turn needs from here reaches it
   * ({@link #relaunchWaits}). Answers `stopped`, in words, when a stop ended
   * the wait; nothing once the turn has ended or the process is gone.
   */
  async #turnEnded(
    instanceId: string,
    running: HarnessSession
  ): Promise<{ stopped?: string }> {
    if (!this.#inTurn(instanceId)) {
      return {};
    }
    const wait = new AbortController();
    this.#relaunchWaits.set(instanceId, wait);
    const since = Date.now();
    console.info(turnWords.relaunchWaits(instanceId));
    try {
      while (
        this.#live.sessions.get(instanceId) === running &&
        this.#inTurn(instanceId)
      ) {
        if (wait.signal.aborted) {
          return { stopped: String((wait.signal.reason as Error).message) };
        }
        await Bun.sleep(TURN_END_LOOK_MS);
      }
      if (wait.signal.aborted) {
        return { stopped: String((wait.signal.reason as Error).message) };
      }
      console.info(
        turnWords.turnEnded(instanceId, Math.round((Date.now() - since) / 1000))
      );
      return {};
    } finally {
      if (this.#relaunchWaits.get(instanceId) === wait) {
        this.#relaunchWaits.delete(instanceId);
      }
    }
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
   * it heard finds no process and goes back to the hub ({@link #send}), which
   * owes it to the process its wake starts.
   *
   * `retire`: its process runs an old version ({@link #retire}), so the
   * hub's keep-alive is left out, as {@link CONTROL_RESTLESS} leaves it: a
   * ping is no work of the session's, and the cache it keeps warm is the old
   * binary's.
   */
  async sleep(
    instanceId: string,
    retire = false
  ): Promise<{ asleep: boolean; awake?: string }> {
    const session = this.#live.sessions.get(instanceId);
    if (!session) {
      return { asleep: this.#asleep.has(instanceId) };
    }
    const awake = await this.#awake(instanceId, session, {
      keepAliveAside: retire,
    });
    if (awake) {
      return { asleep: false, awake: awake.why };
    }
    const processGeneration = this.#generations.get(instanceId);
    // Carried, and listed on every beat, until it has stopped: a beat that no
    // longer listed it first would have the hub settle it as ended.
    this.#live.stopsHere(session);
    await session.stop();
    // Asleep only once no keeper holds its process, as a stop says `stopped`
    // only then ({@link #stop}). `session.stop()` closes the CLI's stdin and
    // its `Query`, and the SDK's own SIGTERM and SIGKILL for a child still
    // there come on unref'd timers 2 s and 7 s on, in this process: an agent
    // restarted inside them left a CLI the hub had filed asleep, which no
    // custody names again, running in its workspace's clone; the hub then
    // closed that workspace under it (obelisk, 2026-10-18).
    const left = await endHeld(instanceId).then(
      () => undefined,
      (error: unknown) =>
        error instanceof Error ? error : new Error(String(error))
    );
    this.#live.drop(instanceId, { why: "slept" });
    if (left) {
      // Still running past its kill: not asleep, and the hub hears why.
      this.#fail(instanceId, left, processGeneration);
      return { asleep: false, awake: left.message };
    }
    this.#asleep.add(instanceId);
    this.#gone(instanceId, processGeneration);
    Effect.runFork(
      Effect.logInfo(
        `put ${instanceId} to sleep: at rest, its ${session.harness} processes are stopped${retire ? ", for they ran an old version and its next start runs this machine's" : ""}`
      )
    );
    return { asleep: true };
  }

  /** The {@link CLI_OUTDATED} lines said, by their uuid: each once. */
  readonly #outdatedSaid = new Set<string>();

  /** Holds `queue` as `key`'s queue until it settles, unless a later one took its place by then. */
  #hold(key: string, queue: Promise<void>): Promise<void> {
    this.#queues.set(key, queue);
    detach(
      queue.then(() => {
        if (this.#queues.get(key) === queue) {
          this.#queues.delete(key);
        }
      }),
      "then"
    );
    return queue;
  }

  /**
   * RETIRES A PROCESS ON AN OLD VERSION ({@link HarnessSession.outdated}):
   * put to sleep the moment it is at rest ({@link sleep} with `retire`),
   * never mid-turn, whatever its idle time; its next message wakes it on the
   * machine's version. Not at rest, it is tried again on the next sweep, and
   * its row is told once ({@link CLI_OUTDATED}). On the session's own queue,
   * as the idle sleep is.
   */
  #retire(
    instanceId: string,
    session: HarnessSession,
    outdated: { uuid: string; words: string }
  ): void {
    const queue = (this.#queues.get(instanceId) ?? Promise.resolve())
      .then(async () => {
        const slept = await this.sleep(instanceId, true);
        // Asleep now, or no longer carried here: nothing runs the old one.
        if (!slept.awake || this.#outdatedSaid.has(outdated.uuid)) {
          return;
        }
        this.#outdatedSaid.add(outdated.uuid);
        Effect.runFork(
          Effect.logInfo(
            `${instanceId}: ${outdated.words} Not yet: ${slept.awake}.`
          )
        );
        this.#sayToSession(
          instanceId,
          {
            subtype: CLI_OUTDATED,
            uuid: outdated.uuid,
            session_id: session.sessionId ?? "",
            content: outdated.words,
          },
          session.harness
        );
      })
      .catch((error: unknown) =>
        warn(
          `putting ${instanceId} to sleep for its old version failed: ${error}`
        )
      );
    this.#hold(instanceId, queue);
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
    const serverBusy = await serverBusyInstances();
    for (const instanceId of ids) {
      if (this.#queues.has(instanceId)) {
        restless[instanceId] = "something sent to it is still on its way";
        continue;
      }
      if (this.#adopting.has(instanceId)) {
        restless[instanceId] = "its custody is still being decided";
        continue;
      }
      const session = this.#live.sessions.get(instanceId);
      if (!session) {
        continue;
      }
      const awake = await this.#awake(instanceId, session, {
        serverBusy,
        keepAliveAside: true,
      });
      if (awake) {
        restless[instanceId] = awake.why;
      }
    }
    return restless;
  }

  /**
   * Every carried session at rest for {@link IDLE_SLEEP_MS} is put to sleep,
   * and every one whose process runs an old version as soon as it is at rest
   * ({@link #retire}).
   */
  async #sweepIdle(): Promise<void> {
    const carried = [...this.#live.sessions];
    if (carried.length === 0) {
      return;
    }
    const serverBusy = await serverBusyInstances();
    const now = Date.now();
    for (const [instanceId, session] of carried) {
      const outdated = await session.outdated?.();
      if (outdated) {
        this.#retire(instanceId, session, outdated);
        continue;
      }
      const awake = await this.#awake(instanceId, session, { serverBusy });
      if (awake) {
        if (!awake.unsure) {
          this.#live.touch(instanceId);
        }
        continue;
      }
      if (now - (this.#live.lastActive(instanceId) ?? now) < IDLE_SLEEP_MS) {
        continue;
      }
      const queue = (this.#queues.get(instanceId) ?? Promise.resolve())
        .then(async () => {
          await this.sleep(instanceId);
        })
        .catch((error: unknown) =>
          warn(`putting ${instanceId} to sleep failed: ${error}`)
        );
      this.#hold(instanceId, queue);
    }
  }

  /**
   * What the supervisor itself holds of a process that is gone, dropped with
   * it ({@link LiveSessions.drop}). Not its preview: a relaunch comes
   * through here too, and the session it continues still has the preview
   * open. The hub owns that lifetime and ends it on an explicit close or a
   * stop.
   */
  #forgetProcess(instanceId: string): void {
    this.#cacheCold.delete(instanceId);
    this.#failureRun.delete(instanceId);
    this.#line.delete(instanceId);
    this.#streams.forget(instanceId);
    // The process this mark counted in is over — a relaunch or a death.
    // Whatever produces frames next is not replaying the hub's own past.
    this.#ingested.delete(instanceId);
    for (const [requestId, ask] of this.#openAsks) {
      if ("instanceId" in ask && ask.instanceId === instanceId) {
        this.#openAsks.delete(requestId);
      }
    }
    // A fleet MCP install no row names any more may have waited on this
    // session's process alone (mcp-install.ts).
    retireInstalls(() => this.instanceIds).catch((error: unknown) =>
      warn(`retiring old fleet MCP installs failed: ${errorText(error)}`)
    );
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
   * are, and the next daemon adopts them through {@link takeHeld}, which
   * is the hand-back this detach exists to leave possible.
   *
   * An operator ending a session still goes through `stop`, and sessiond going
   * down still takes its children with it. Neither is a restart.
   */
  detach(): void {
    stopPreviews();
    closeCanvasScreens();
    // A stage speaks to this daemon alone (its stdout): each that answers is
    // written down and ended, and the next daemon starts it again at its port.
    carryStages();
    for (const instanceId of [...this.#live.sessions.keys()]) {
      this.#live.drop(instanceId, { why: "detached" });
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
      case "admission":
      case "frames":
      case "heartbeat":
      case "launch":
      case "register":
      case "usage":
        break;
    }
    return Promise.resolve();
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
   * A launch waits here while its machine's room on memory fails (agent
   * machine-room.ts `measureMemoryRoom`: Linux's memory available and the
   * room under the memory limit above the cgroup the current keeper starts
   * its children in, as its welcome names it; the Mac's pressure level),
   * measured again every {@link ROOM_POLL_MS}. Never refused: the session's
   * transcript says once why it waits, in the machine's readings
   * ({@link ROOM_HELD}), and the hub waits on its start as long as that line
   * stands. A stop ends the wait ({@link dispatch}). A keeper that cannot be
   * reached fails the start, as its spawn would.
   */
  async #roomForStart(instanceId: string, harness: HarnessKind): Promise<void> {
    const measure = async () =>
      measureMemoryRoom(
        process.platform === "linux"
          ? (await this.#keepers.current()).cgroup
          : undefined
      );
    let room = await measure();
    if (room.ok) {
      return;
    }
    const stop = new AbortController();
    this.#roomWaits.set(instanceId, stop);
    const began = Date.now();
    console.info(`[session] ${instanceId}: start waits: ${room.words}`);
    this.sink({
      kind: "frame",
      instanceId,
      harness,
      message: noticeMessage({
        subtype: ROOM_HELD,
        uuid: `room-${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        content: roomHeldSentence(room.words),
      }),
    });
    try {
      while (!room.ok) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, ROOM_POLL_MS);
          stop.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(stop.signal.reason);
            },
            { once: true }
          );
        });
        room = await measure();
      }
      console.info(
        `[session] ${instanceId}: starts after ${Math.round((Date.now() - began) / 1000)} s waiting for memory`
      );
    } finally {
      if (this.#roomWaits.get(instanceId) === stop) {
        this.#roomWaits.delete(instanceId);
      }
    }
  }

  /**
   * What a launch runs on, asked of the hub as its process is about to start
   * ({@link launchGrant}): its credential, minted now, and its account. A
   * launch held on its way (custody, an update, its queue) so never runs on
   * a credential the hub has since replaced. A refusal is the start's
   * failure, in the hub's sentence, and the throw says it once.
   */
  async #granted(
    payload: SpawnPayload
  ): Promise<Exclude<LaunchGrant, { refusal: string }>> {
    const grant = await this.launchGrant(payload);
    if ("refusal" in grant) {
      throw new Error(grant.refusal);
    }
    // Known before the process can print it: nothing it sends carries it.
    rememberCredential(payload.instanceId, grant.sessionCredential);
    return grant;
  }

  /**
   * WHAT AN ATTACHED CHILD MUST ANSWER GOES AHEAD OF WHAT IS SENT TO IT, NOT
   * AHEAD OF ITS ATTACH. The child is published the moment its `Query` is on
   * it: a live process, this session's, running, its turn under way. Its
   * stored mode and its credential are then asked of it, from the job that
   * attached it at the head of its session's queue, so every send behind
   * that job reaches the child only once it is in its mode and its
   * credential is proved. The child answers when it can: Claude Code reads
   * its input while a tool runs, but answers its control requests one at a
   * time, behind the `initialize` every attach sends first, which waits on
   * the session's start and its command listing (CLI 2.1.296, `YL`); a
   * child that answered nothing for minutes (c56c678f on a Mac at load
   * 150-650, 2026-10-13) once left its session unattached and unowned.
   *
   * A harness that can read the credential its held process carries says
   * it, so this agent redacts it too (a pi host's was recorded when this
   * agent installed it). A child refused here (no credential) is stopped,
   * and that is its failure. One whose process ended meanwhile was said by
   * its closing; a stop cut it short and says itself.
   */
  async #settleAttached(
    instanceId: string,
    session: HarnessSession,
    adapter: Harness,
    mode: SpawnPayload["permissionMode"],
    processGeneration: string | undefined,
    stopped: AbortSignal | undefined
  ): Promise<void> {
    try {
      let refused = false;
      await this.#answers(
        session,
        (async () => {
          await applyStoredPermissionMode(session, mode);
          const held = await verifyHeldCredential(session);
          if (held.credential) {
            rememberCredential(instanceId, held.credential);
          }
          ({ refused } = held);
        })(),
        stopped
      );
      // Refused by the hub: the harness stopped it and said why.
      if (refused) {
        return;
      }
      console.info(
        `[custody] ${instanceId}: answered after its attach: ${mode === undefined ? "no stored mode" : `in its stored mode (${mode})`}, its credential proved`
      );
      this.#fleet.healFleetMcp([{ instanceId, mcp: true, settings: true }]);
    } catch (problem) {
      if (stopped?.aborted || this.#live.sessions.get(instanceId) !== session) {
        return;
      }
      // Its process ending refuses what it was asked: its closing says so.
      const alive = isKeeperHarness(adapter)
        ? await adapter.custody
            .candidates()
            .then(({ procs }) =>
              procs.some(
                (held) =>
                  held.alive &&
                  sessionOfProc(held.procId)?.instanceId === instanceId
              )
            )
            .catch(() => undefined)
        : undefined;
      if (alive === false || this.#live.sessions.get(instanceId) !== session) {
        return;
      }
      this.#live.drop(instanceId, { why: "unverified", ended: session });
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the refusal below is the outcome either way
      await session.stop().catch(() => {});
      this.#fail(
        instanceId,
        new HeldProcessRefused(
          `The session's CawCo MCP credential could not be verified after the agent attached to it, so it was stopped: ${errorText(problem)}`,
          { cause: problem }
        ),
        processGeneration
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

  /** A Claude process's manual `/compact` boundary: that process is replaced at rest ({@link COMPACT_RELAUNCH}). */
  #noteCompact(
    kind: HarnessKind,
    session: HarnessSession | null,
    message: NeutralMessage
  ): void {
    if (
      harnessOf(kind)?.relaunchesOnManualCompact &&
      session &&
      message.type === "system" &&
      message.subtype === "compact_boundary" &&
      message.compact_metadata?.trigger === "manual"
    ) {
      this.#compactedHere.add(session);
    }
  }

  /**
   * At a turn's end of a Claude process that ran a manual `/compact`: asks
   * the hub to relaunch it onto its conversation ({@link COMPACT_RELAUNCH})
   * when it is at rest by the test a move's stop takes (claude-carry.ts `#stopForCarry`:
   * no turn, no ask, no send on its way, nothing its resume would not bring
   * back). Not at rest, it is asked again at its next turn's end.
   */
  async #askCompactRelaunch(
    instanceId: string,
    session: HarnessSession | null
  ): Promise<void> {
    if (
      !(session && this.#compactedHere.has(session)) ||
      this.#live.sessions.get(instanceId) !== session
    ) {
      return;
    }
    const awake = await this.#awakeForMove(instanceId, session);
    if (awake || this.#queues.has(instanceId)) {
      console.info(
        `[compact] ${instanceId}: its process ran a manual /compact; it is replaced at a later turn's end, not now: ${awake?.why ?? "something sent to it is still on its way"}`
      );
      return;
    }
    console.info(
      `[compact] ${instanceId}: its process ran a manual /compact and is at rest; the hub is asked to relaunch it`
    );
    this.#outbox.frame({
      kind: "frame",
      instanceId,
      harness: session.harness,
      message: { type: "system", subtype: COMPACT_RELAUNCH },
    });
  }

  #reuseRecovery(payload: SpawnPayload): boolean {
    const { instanceId, requestId: ack } = payload;
    if (
      (payload.reattachOnly || payload.resume) &&
      !payload.resume?.atMessage &&
      !payload.relaunch &&
      this.#live.sessions.has(instanceId)
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

  /**
   * A spawn runs once its session's earlier start or attach has ended, never
   * beside it: that would put a second process, or a second `Query` on the
   * child being attached, beside one that may yet finish. The earlier one is
   * ahead of it in the session's queue ({@link dispatch},
   * {@link #holdChild}) and ends as its child answers, ends or is stopped, so
   * this one then meets the truth: the session carried (a recovery of it is
   * taken as done), or not, and it runs.
   */
  async #spawn(payload: SpawnPayload): Promise<void> {
    const id = payload.instanceId;
    const prior = this.#adopting.get(id);
    if (prior) {
      await prior;
      return this.#spawn(payload);
    }
    if (this.#reuseRecovery(payload)) {
      return;
    }
    // Claim before the first await: register adoption and direct spawns share it.
    const claim = Promise.withResolvers<void>();
    this.#adopting.set(id, claim.promise);
    // A start that attaches to a held child is cut short by a stop, as a
    // custody attach is.
    // A custody attach queued behind it keeps the one it holds.
    const attach =
      (payload.reattachOnly || payload.resume) && !this.#attaching.has(id)
        ? new AbortController()
        : undefined;
    if (attach) {
      this.#attaching.set(id, attach);
    }
    try {
      await this.#spawnClaimed(payload, claim.resolve, attach?.signal);
    } finally {
      if (attach && this.#attaching.get(id) === attach) {
        this.#attaching.delete(id);
      }
      if (this.#adopting.get(id) === claim.promise) {
        this.#adopting.delete(id);
      }
      claim.resolve();
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one claimed spawn owns preparation, address acknowledgement, publication and refusal cleanup
  async #spawnClaimed(
    payload: SpawnPayload,
    settleClaim: () => void,
    stopped?: AbortSignal
  ): Promise<void> {
    const { instanceId, cwd, harness: kind, scratch, requestId: ack } = payload;
    // A start again: what its last process was refused is over, and the
    // sends kept for it come from the hub behind this spawn.
    this.#keeperRefused.delete(instanceId);
    if (payload.processGeneration) {
      this.#generations.set(instanceId, payload.processGeneration);
    }
    if (payload.title) {
      this.#titles.set(instanceId, payload.title);
    }
    if (!kind) {
      throw new Error(
        "A start names the harness it runs on; this one named none."
      );
    }
    const adapter = adapterFor(kind);
    if (payload.resume && !payload.resume.fork) {
      this.#resumable.set(instanceId, {
        adapter,
        sessionKey: payload.resume.sessionKey,
        cwd,
      });
    }
    try {
      if (payload.scratchWorktree) {
        this.#spinOffs.worktreeRecorded(instanceId, payload.scratchWorktree);
      }
      let workdir = await workdirFor(payload);
      if (workdir === undefined) {
        this.#recoveryUnavailable(
          payload,
          "The recovery directory is no longer available."
        );
        return;
      }
      if (payload.resume && !this.#live.sessions.has(instanceId)) {
        // A resume can also arrive after a failed custody attachment. Read
        // sessiond and join adoption before allowing the normal absent-process
        // spawn; an attachment failure never authorises replacing a held child.
        if (isKeeperHarness(adapter)) {
          const welcome = await adapter.custody.candidates();
          const proc = welcome.procs.find(
            (held) =>
              held.alive &&
              sessionOfProc(held.procId)?.instanceId === instanceId
          );
          if (proc) {
            const running = await adapter.custody.turnRunning(
              instanceId,
              proc.head
            );
            await this.#adoptClaimed(
              adapter,
              {
                spec: { ...payload, cwd: workdir },
                proc,
                running,
                settle: settleClaim,
              },
              Object.fromEntries(this.#ingested),
              stopped
            );
          }
        }
        if (this.#reuseRecovery(payload)) {
          return;
        }
      }
      // A relaunch stays in the checkout the spin-off has been working in.
      const cut = this.#spinOffs.worktree(instanceId);
      if (cut) {
        workdir = cut.dir;
      } else if (scratch?.worktree) {
        workdir = await this.#spinOffs.addWorktree(
          instanceId,
          scratch.baseCwd ?? cwd,
          this.#generations.get(instanceId)
        );
      }

      this.#spinOffs.spawned(instanceId, {
        dir: workdir,
        harness: adapter.kind,
        scratch: !!scratch,
      });

      // A spawn for an instance already running is a relaunch: replace the
      // process under the same id, settling the old one first, once its turn
      // has ended. A process is never ended mid-turn for a start again (a
      // mode, an account move, a hook), whoever asked for it.
      let running = this.#live.sessions.get(instanceId);
      if (running) {
        if (this.#reuseRecovery(payload)) {
          return;
        }
        const ended = await this.#turnEnded(instanceId, running);
        if (ended.stopped) {
          console.info(`[session] ${instanceId}: ${ended.stopped}`);
          if (ack) {
            this.sink({
              kind: "control_result",
              instanceId,
              requestId: ack,
              ok: false,
              error: ended.stopped,
            });
          }
          return;
        }
        running = this.#live.sessions.get(instanceId);
      }
      if (running) {
        // Ended by this daemon: its end is no failure ({@link LiveSessions.stopsHere}).
        this.#live.drop(instanceId, { why: "relaunched", ended: running });
        await running.stop();
      }
      // What the process this replaces was handed and never read goes back to
      // the hub, which hands it to this one behind its start.
      this.#handBack(instanceId);

      if (payload.ingested) {
        this.#ingested.set(instanceId, payload.ingested);
      }
      // A launch waits for the machine's memory before anything of it
      // starts, its grant included; a reattach starts nothing.
      if (!payload.reattachOnly) {
        await this.#roomForStart(instanceId, kind);
      }
      // A launch runs on what the hub grants it now, as its process starts,
      // and on nothing it was sent ({@link #granted}). A reattach launches
      // nothing: its process holds its credential, and runs where it runs.
      const grant = payload.reattachOnly
        ? undefined
        : await this.#granted(payload);
      // Its scoped memory documents are the grant's alone, whatever the
      // spawn carried.
      const spec: SpawnPayload = grant
        ? {
            ...payload,
            accountDir: grant.accountDir,
            homeLoginMove: grant.homeLoginMove,
            instructions: grant.instructions,
          }
        : payload;
      // A work item's session runs every shell command inside its workspace's
      // boundary, and does not start without one: the refusal is the spawn's.
      // A spawn that names no workspace but runs anywhere inside a
      // workspace's clone runs inside that clone's; one in a project conversation's
      // place (a person's own folder) runs on the host, as only the conversation's
      // own spawns name that place. A Claude session's account goes with
      // it: the boundary reads that account's user layer by the paths the
      // session is given.
      const place = spec.workspace ?? (await cloneHolding(workdir));
      // A launch in a workspace keeps the tool results its harness saves in
      // a folder of its own, which its boundary reads (`Harness.spill`); a
      // reattach launches nothing, and its folder is read already.
      const spill =
        place && !spec.reattachOnly
          ? await adapter.spill?.(spec, workdir, place.id)
          : undefined;
      const holder: { session: HarnessSession | null } = { session: null };
      const { boundary, ctx } = await this.#sessionContext(
        spec,
        workdir,
        adapter,
        holder,
        place,
        !!spec.reattachOnly,
        spill?.dir,
        grant?.sessionCredential
      );

      if (spec.resume) {
        this.#resumable.set(instanceId, {
          adapter,
          sessionKey: spec.resume.sessionKey,
          cwd: workdir,
        });
      } else {
        this.#resumable.delete(instanceId);
      }
      this.#failures.delete(instanceId);
      this.#unsentFailures.delete(instanceId);
      const session = spec.reattachOnly
        ? await adapter.reattach?.(spec, ctx)
        : await adapter.spawn(spill?.spec ?? spec, ctx);
      if (!session) {
        this.#recoveryUnavailable(
          spec,
          "The harness found no live session to reattach."
        );
        return;
      }
      holder.session = session;
      // A launch is in its mode and holds its credential before it is
      // published; a reattach is published at once, and its held child
      // answers behind that ({@link #settleAttached}).
      if (grant) {
        await applyStoredPermissionMode(session, spec.permissionMode);
        await admit(session, { credential: grant.sessionCredential });
      }
      // Refused its input while it was starting: it is not a session to
      // hand work to, and the refusal has said so.
      const refused = this.#keeperRefused.get(instanceId);
      if (refused) {
        throw refused;
      }
      this.#live.carry(instanceId, session);
      if (boundary && this.#failOpen.delete(instanceId)) {
        console.info(
          `boundary: relaunched ${instanceId} onto the fail-closed hook`
        );
      }
      session.attached?.();
      if (payload.reattachOnly) {
        detach(
          this.#dateActivity(instanceId, adapter, session, workdir),
          "dateActivity"
        );
      } else {
        this.#live.activeAt(instanceId, Date.now());
      }
      this.#asleep.delete(instanceId);
      // A reattach that met a running turn said so before there was a session
      // to carry the pulse ({@link LiveSessions.emitPulse} drops it): said now.
      if (this.#live.turnRunning(instanceId)) {
        this.#live.emitPulse(instanceId, true);
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
      if (spec.reattachOnly) {
        this.#adopting.delete(instanceId);
        settleClaim();
        await this.#settleAttached(
          instanceId,
          session,
          adapter,
          spec.permissionMode,
          spec.processGeneration,
          stopped
        );
      }
    } catch (error) {
      // A stop cut the attach short: the stop behind it ends the child and
      // says so.
      if (stopped?.aborted) {
        console.info(
          `[session] ${instanceId}: its attach let go for a stop: ${error instanceof Error ? error.message : String(error)}`
        );
        if (ack) {
          this.sink({
            kind: "control_result",
            instanceId,
            requestId: ack,
            ok: false,
            error: "The session was stopped before it was attached.",
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
      // A held session its harness could not take back (its server refused
      // it, or stayed out of reach past its budget) is settled as
      // unavailable: the hub owes its sends at once, and its next start is a
      // start of its own. A start that ends so falls through and fails once,
      // below.
      if (error instanceof ReattachFailed && payload.reattachOnly === true) {
        this.#failures.set(instanceId, error.message);
        warn(`custody ${instanceId} settled unattached: ${error.message}`);
        this.#recoveryUnavailable(payload, error.message);
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
      // A probe that found nothing to attach says nothing to the hub, but
      // why it found nothing goes in the journal; a held process refused at
      // attach was stopped, and that is its failure.
      if (payload.reattachOnly && !(error instanceof HeldProcessRefused)) {
        warn(
          `reattach ${instanceId} found nothing: ${error instanceof Error ? error.message : String(error)}`
        );
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
   * Where a session runs, read from its spawn, and the context it runs with:
   * its workspace's boundary (a work item's, a project conversation's place, or the
   * workspace clone its folder is in) and its browser's door. One reading
   * for a launch and for a child taken back after an agent restart
   * ({@link #adoptClaimed}), so a session taken back is bounded as it was
   * launched. `recovery`: a child taken back, not a launch. `spill` is a
   * launch's own folder (`Harness.spill`); a launch passes the credential
   * its grant gave, and an attach none (its process proves its own).
   */
  async #sessionContext(
    spec: SpawnPayload,
    workdir: string,
    adapter: Harness,
    holder: { session: HarnessSession | null },
    place: WorkspaceRef | undefined,
    recovery: boolean,
    spill?: string,
    sessionCredential?: string
  ): Promise<{ boundary: Boundary | undefined; ctx: HarnessContext }> {
    // A work item's spawn names its workspace and its project, the
    // workspace's: its boundary reads that project's folder.
    const boundary = await boundaryFor(
      place,
      traitsOf(spec.harness).accountDir
        ? (spec.accountDir?.accountId ?? spec.homeLoginMove?.accountId)
        : undefined,
      spec.workspace ? spec.projectId : undefined,
      spill
    );
    // Its doors to the machine's container runtimes (session-containers.ts),
    // so what its work starts stops with it. A workspace's boundary reaches
    // no runtime at all: a bounded session gets none. Doors that did not
    // open leave the session without them, and it is told so.
    let shut: string | undefined;
    const doors = boundary
      ? undefined
      : await openContainerDoors(spec.instanceId).catch((error: unknown) => {
          shut = errorText(error);
          warn(
            `${spec.instanceId}: its doors to the container runtimes did not open, so containers it starts are not stopped with it: ${shut}`
          );
          return { env: {}, untracked: [] };
        });
    const containerEnv = doors?.env;
    // A host-scope delegate's own scratch dir, its commands' `TMPDIR`
    // (host-scratch.ts): made on each spawn, after a settle removed it too.
    const hostTmp =
      !boundary && spec.hostScratch
        ? await hostScratchReady(spec.hostScratch)
        : undefined;
    // A runtime it reaches with no door: it is told once, as it launches.
    const untracked = containersUntrackedWords(doors?.untracked ?? [], shut);
    if (untracked && !recovery) {
      this.#sayToSession(
        spec.instanceId,
        {
          subtype: CONTAINERS_UNTRACKED,
          uuid: `containers-untracked-${spec.instanceId}`,
          content: untracked,
        },
        adapter.kind
      );
    }
    const ctx = this.#context(
      spec.instanceId,
      workdir,
      adapter,
      holder,
      spec.processGeneration,
      boundary && place ? { boundary, workspace: place.id } : undefined,
      sessionCredential,
      recovery,
      // Its browser tool's door (browser/door.ts): its workspace's, else
      // its own. A fenced session takes no fleet server, so has none.
      spec.fence
        ? undefined
        : () =>
            place
              ? browserDoor(this.#ports, place.id)
              : browserDoor(this.#ports, spec.instanceId, spec.projectId),
      containerEnv,
      hostTmp
    );
    return { boundary, ctx };
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
    bounded?: { boundary: Boundary; workspace: string },
    sessionCredential?: string,
    recovery = false,
    browser?: () => Promise<BrowserDoor>,
    containerEnv?: Readonly<Record<string, string>>,
    hostTmp?: string
  ): HarnessContext {
    const boundary = bounded?.boundary;
    if (!processGeneration) {
      throw new Error("The hub did not supply this process's generation.");
    }
    // A workspace session reaches its fleet servers through its workspace's
    // gate (mcp-gate.ts), held while this process runs: the gate's own
    // processes end with the last one that holds it.
    const gateMember = `${instanceId}:${processGeneration}`;
    if (bounded) {
      mcpHost.joinGate(bounded.workspace, gateMember);
    }
    this.#generations.set(instanceId, processGeneration);
    this.#placed.set(instanceId, {
      harness: adapter.kind,
      ...(boundary && bounded
        ? { boundaryPid: boundary.pid, workspace: bounded.workspace }
        : {}),
    });
    const launchOf = (message: NeutralMessage) =>
      speaksForAccount(message) ? { processGeneration } : {};
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
      ...(bounded ? bounded : {}),
      ...(this.#ingested.get(instanceId)
        ? { ingested: this.#ingested.get(instanceId) }
        : {}),
      ...(sessionCredential ? { sessionCredential } : {}),
      ...(browser ? { browserDoor: browser } : {}),
      ...(containerEnv ? { containerEnv } : {}),
      ...(hostTmp ? { hostTmp } : {}),
      ...(bounded ? { mcpGate: mcpGateOf(bounded.workspace) } : {}),
      /**
       * The sessiond line the NEXT frame is derived from. Optional on purpose:
       * an adapter that does not read its frames off a ring never calls it,
       * and the supervisor's behaviour is then exactly what it always was.
       */
      line: (srcEpoch: string, srcSeq: number) => {
        this.#line.set(instanceId, { srcEpoch, srcSeq });
      },
      frame: (message) => {
        this.#noteShell(instanceId, holder, message);
        this.#noteFailOpen(instanceId, message);
        this.#noteCompact(adapter.kind, holder.session, message);
        this.#noteRead(instanceId, message);
        const ping = this.#live.keepAlivePing(instanceId);
        if (
          ping &&
          message.type === "system" &&
          message.subtype === MESSAGES_READ &&
          message.read?.some((id) => id !== ping)
        ) {
          this.#live.keepAliveEnded(instanceId);
        }
        const keepAlive = this.#live.keepAlivePing(instanceId) !== undefined;
        this.#observeCacheFrame(instanceId, adapter.kind, message, keepAlive);
        if (keepAlive) {
          message.keepAlive = true;
        }
        const src = this.#line.get(instanceId);
        this.#line.delete(instanceId);
        if (message.type === "result" && !keepAlive) {
          this.#spinOffs.tagQuest(instanceId, adapter);
        }
        // Folded before the forward decision: the pulse is local state being
        // rebuilt from a replay, and a line the hub already has still tells
        // this agent what its own session is doing.
        if (!keepAlive) {
          this.#live.foldPulse(instanceId, adapter, message);
          this.#streams.note(instanceId, adapter.kind, message);
        }
        // AT MOST ONCE. The hub's mark is the hub's word, so a line at or below
        // it has already become a frame there — replaying it would double what
        // a dashboard shows. Above it, or under a different epoch, or with no
        // provenance at all: forwarded.
        if (alreadyIngested(this.#ingested.get(instanceId), src)) {
          return;
        }
        // Through the outbox: kept until the hub says it took it, and sent
        // again if the link drops first (outbox.ts).
        this.#outbox.frame({
          kind: "frame",
          instanceId,
          harness: adapter.kind,
          ...(keepAlive ? { keepAlive: true } : {}),
          message,
          ...(src ?? {}),
          ...launchOf(message),
        });
        if (message.type === "result") {
          this.#live.keepAliveEnded(instanceId);
          if (!keepAlive) {
            this.#watchFailure(instanceId, adapter.kind, message, holder);
            this.#askCompactRelaunch(instanceId, holder.session).catch(
              (error: unknown) =>
                warn(
                  `asking ${instanceId}'s relaunch after its /compact failed: ${error}`
                )
            );
          }
        }
      },
      permission: (request) => {
        if (this.#openAsks.has(request.requestId)) {
          return;
        }
        this.#live.permissionParked(instanceId);
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
      permissionResolved: (requestId, outcome, answer) =>
        this.#settleAsk(instanceId, requestId, outcome, false, answer),
      busy: (active) => {
        if (active) {
          this.#live.turnStarted(instanceId);
        } else {
          this.#live.turnEnded(instanceId);
        }
        // A keep-alive ping is the hub's maintenance, not the session doing
        // anything: its rest is still counted from its own last turn.
        if (this.#live.keepAlivePing(instanceId) === undefined) {
          this.#live.touch(instanceId);
        }
        this.#live.emitPulse(instanceId, true);
      },
      session: (sessionId) =>
        this.#spinOffs.noteQuestSession(instanceId, sessionId, adapter.kind),
      failed: (error) => {
        // A process this daemon ended (a sleep, a stop, a relaunch, a move)
        // ends as that stop says, whatever its harness made of it.
        if (holder.session && this.#live.stoppedHere(holder.session)) {
          this.#endedHere(instanceId, error);
          return;
        }
        if (recovery) {
          this.#failures.set(instanceId, String(error));
          return;
        }
        // Its process may still run: its harness's stream failed, not the
        // CLI. Ended here, as a stop ends it, before the hub hears the
        // failure: a failed row holds no workspace (workspaces.ts `holdsOf`),
        // and a CLI left running in one was closed under ({@link #endFailed}).
        if (holder.session) {
          this.#live.stopsHere(holder.session);
        }
        this.#endFailed(instanceId, error, processGeneration);
      },
      died: (signal, error, cut) => {
        const { session } = holder;
        if (session && this.#live.stoppedHere(session)) {
          this.#endedHere(instanceId, error);
          return;
        }
        // The process this runs now, killed by nothing of this daemon's: the
        // hub starts it again with its turn. One killed before it was this
        // daemon's to run died as a failure does.
        if (
          recovery ||
          !session ||
          this.#live.sessions.get(instanceId) !== session
        ) {
          if (recovery) {
            this.#failures.set(instanceId, String(error));
          } else {
            this.#fail(instanceId, error, processGeneration);
          }
          return;
        }
        this.#live.drop(instanceId, { why: "died" });
        this.#gone(instanceId, processGeneration, {
          signal,
          error: `its process was ended by ${signal} from outside CawCo`,
          // The commands it cut, with what they printed when its harness
          // kept that (Claude Code), else as its tool calls named them: the
          // hub says each one interrupted in the turn it hands back.
          ...(() => {
            const tracked = this.#cutShells(instanceId);
            const said = cut?.length ? cut : tracked;
            return said.length > 0 ? { cut: said } : {};
          })(),
        });
      },
      // Refused for good (its boundary hook, its credential): no longer one
      // this daemon carries, from now, not once its `Query` has closed. A
      // beat that still listed it read it running again over its failure.
      refused: (error) => {
        const { session } = holder;
        if (session && this.#live.sessions.get(instanceId) === session) {
          this.#live.drop(instanceId, { why: "refused", ended: session });
        }
        this.#fail(instanceId, error, processGeneration);
      },
      keeperRefused: (error) =>
        this.#refusedInput(instanceId, error, processGeneration),
      rejected: (uuid, error) => this.#reject(instanceId, uuid, error),
      emit: (envelope) => this.emit(envelope),
      closed: () => {
        // A session outside any workspace browsed through a door of its own:
        // its pages close with its process, as its browser tool's Chromium did.
        if (bounded) {
          mcpHost.leaveGate(bounded.workspace, gateMember);
        } else {
          closeBrowserDoor(instanceId);
        }
        // A dead process is never going to answer anything it asked.
        for (const [requestId, body] of this.#openAsks) {
          if (
            "instanceId" in body &&
            body.instanceId === instanceId &&
            body.processGeneration === processGeneration
          ) {
            this.#settleAsk(instanceId, requestId, "cancelled", true);
          }
        }
        if (
          holder.session &&
          this.#live.sessions.get(instanceId) === holder.session
        ) {
          this.#live.drop(instanceId, { why: "closed" });
          // Its process went away of its own accord: a failure has said so
          // (`#fail`), and anything else is the session at rest, its next
          // message waking it ({@link #gone}). One this daemon is stopping
          // (a sleep, a stop) is said by the one stopping it.
          if (this.#live.stoppedHere(holder.session)) {
            return;
          }
          if (this.#failures.has(instanceId)) {
            this.#handBack(instanceId);
          } else {
            this.#gone(instanceId, processGeneration);
          }
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

  /**
   * A session's cache state as its requests measured it: a keep-alive that
   * read under 90% of its prompt from the cache leaves it cold (a changed
   * prefix: 2026-10-04 a ping re-read 26,234 tokens and rewrote 40,941); a
   * real turn's result, whose requests wrote whatever they missed, leaves it
   * warm.
   */
  #observeCacheFrame(
    instanceId: string,
    harness: HarnessKind,
    message: NeutralMessage,
    keepAlive: boolean
  ): void {
    if (
      traitsOf(harness).promptCacheMaxMs === null ||
      message.type !== "result"
    ) {
      return;
    }
    const usage = promptCacheUsage(message);
    if (keepAlive) {
      if (!cacheHit(usage)) {
        this.#cacheCold.add(instanceId);
      }
      return;
    }
    if (message.lastRequestAt !== undefined && usage.input > 0) {
      this.#cacheCold.delete(instanceId);
    }
  }

  /**
   * A HELD CHILD IS THIS AGENT'S FROM THE MOMENT IT IS TAKEN, AND STAYS SO
   * UNTIL IT IS ATTACHED OR ENDS. Its attach (deciding its turn, putting a
   * `Query` on it, its credential and mode) is the first thing in its
   * session's queue ({@link dispatch}), so everything sent to the session
   * meanwhile waits behind it, in order, and nothing of any other session
   * does. It waits as long as the child takes to answer: a child mid-tool on
   * a loaded machine, or stopped by a signal, is still the session's process.
   * Its turn counts as busy until it is decided ({@link #turnPending}), and
   * the hub reads it held and in flight (`pending`), so it attaches nothing
   * beside it. It ends when the child answers (attached), ends (let go: the
   * session is at rest, its next message starting it), or is stopped (the
   * stop behind it ends the child).
   *
   * The custody bound once ended it instead: four Claude children on a Mac
   * at load 150-650 did not answer within 90 s of an agent restart, were "let
   * go undecided" while their claims stayed held, and every send to them
   * came back unread for 40 minutes (2026-10-13).
   */
  #holdChild(
    adapter: KeeperHarness,
    spec: SpawnPayload,
    proc: Claimed["proc"],
    ingested: Record<string, IngestMark>
  ): void {
    const { instanceId } = spec;
    const stop = new AbortController();
    this.#attaching.set(instanceId, stop);
    this.#turnPending.add(instanceId);
    const job = (this.#queues.get(instanceId) ?? Promise.resolve())
      .then(() => this.#attachHeld(adapter, spec, proc, ingested, stop.signal))
      .catch((problem: unknown) => {
        warn(`custody ${instanceId}: its attach failed: ${errorText(problem)}`);
      })
      .finally(() => {
        this.#turnPending.delete(instanceId);
        if (this.#attaching.get(instanceId) === stop) {
          this.#attaching.delete(instanceId);
        }
      });
    this.#hold(instanceId, job);
  }

  /** {@link #holdChild}'s attach, run from the session's queue. */
  async #attachHeld(
    adapter: KeeperHarness,
    spec: SpawnPayload,
    proc: Claimed["proc"],
    ingested: Record<string, IngestMark>,
    stopped: AbortSignal
  ): Promise<void> {
    const { instanceId } = spec;
    // Started or attached by what ran ahead of it in the queue.
    if (this.#live.sessions.has(instanceId)) {
      return;
    }
    const claim = Promise.withResolvers<void>();
    this.#adopting.set(instanceId, claim.promise);
    try {
      const running = await custodyProbe(
        adapter.custody.turnRunning(instanceId, proc.head),
        stopped
      );
      this.#turnPending.delete(instanceId);
      if (running) {
        this.#live.turnStarted(instanceId);
        // The hub forgot this session's pulse at the register: the rail's
        // Working list hears it from here, not once it is attached.
        this.#live.emitPulse(instanceId, true);
      }
      await this.#adoptClaimed(
        adapter,
        { spec, proc, running, settle: claim.resolve },
        ingested,
        stopped
      );
    } catch (problem) {
      if (
        !this.#live.sessions.has(instanceId) &&
        this.#live.turnEnded(instanceId)
      ) {
        this.#live.emitPulse(instanceId, true);
      }
      await this.#heldNotAttached(adapter, spec, proc, problem, stopped);
    } finally {
      if (this.#adopting.get(instanceId) === claim.promise) {
        this.#adopting.delete(instanceId);
      }
      claim.resolve();
    }
  }

  /**
   * A held child whose attach ended without attaching it, settled to what is
   * true of it: stopped (the stop behind it says so), ended (the session is
   * at rest, its next message starting it), refused at attach (it was
   * stopped: that is its failure), or alive and not attached (the hub
   * attaches it again from its own reading).
   */
  async #heldNotAttached(
    adapter: KeeperHarness,
    spec: SpawnPayload,
    proc: Claimed["proc"],
    problem: unknown,
    stopped: AbortSignal
  ): Promise<void> {
    const { instanceId, processGeneration } = spec;
    if (stopped.aborted) {
      console.info(
        `[custody] ${instanceId}: its attach let go for a stop: ${errorText(problem)}`
      );
      return;
    }
    const alive = await adapter.custody.candidates().then(
      ({ procs }) =>
        procs.some(
          (held) =>
            held.alive &&
            held.pid === proc.pid &&
            sessionOfProc(held.procId)?.instanceId === instanceId
        ),
      () => undefined
    );
    if (alive === false) {
      warn(
        `custody ${instanceId}: its process ${proc.pid} ended before it was attached; let go (${errorText(problem)})`
      );
      this.#gone(instanceId, processGeneration);
      return;
    }
    // A child refused at attach (its credential, its boundary hook) was
    // stopped: an end, not a recovery the hub retries.
    if (problem instanceof HeldProcessRefused) {
      this.#fail(instanceId, problem, processGeneration);
      return;
    }
    warn(`custody ${instanceId}: held, not attached: ${errorText(problem)}`);
    this.#sessionRecoveryFailed(instanceId, problem, processGeneration);
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
   * What an attached child must answer before what is sent to it goes to
   * it, waited for until it is answered or the child ends (its `Query` then
   * refuses every request it left open). `stopped` cuts it short: the
   * `Query` lets go of the child, its closing says nothing (the stop does),
   * and the stop behind it ends the child.
   */
  async #answers(
    session: HarnessSession,
    answered: Promise<void>,
    stopped: AbortSignal | undefined
  ): Promise<void> {
    try {
      await custodyProbe(answered, stopped);
    } catch (problem) {
      if (stopped?.aborted) {
        this.#live.stopsHere(session);
        // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the stop behind it ends the child either way
        await session.dispose().catch(() => {});
      }
      throw problem;
    }
  }

  /** {@link #attachHeld}'s attach of one held child, its turn decided. */
  async #adoptClaimed(
    adapter: KeeperHarness,
    { spec, proc, running, settle }: Claimed,
    ingested: Record<string, IngestMark>,
    stopped?: AbortSignal
  ): Promise<void> {
    if (!(await isDirectory(spec.cwd))) {
      this.#recoveryUnavailable(
        { ...spec, harness: adapter.kind, reattachOnly: true },
        "The recovery directory is no longer available."
      );
      return;
    }
    // THE HONEST-LOSS RULE (design §7). A mark in THIS child's sequence space
    // — its keeper's current boot and this process — is a cursor: replay
    // exactly the gap the hub named. Anything else is replayed as NOTHING and
    // followed from head: a mark from a keeper that has since restarted
    // names lines that no longer exist, and one from an earlier process
    // under the same id names another ring. Disk transcripts cover the
    // middle.
    const mark = ingested[spec.instanceId];
    const cursor = resumeCursor(procEpoch(proc.epoch, proc.pid), mark);
    if (cursor !== undefined && mark) {
      this.#ingested.set(spec.instanceId, mark);
    } else {
      this.#ingested.delete(spec.instanceId);
    }
    // A held CLI in a workspace is attached only once that workspace's hook
    // is in this build's form, which the agent writes as it starts; others'
    // are not waited for.
    const workspace = await workspaceHolding(spec.cwd);
    if (workspace) {
      await custodyProbe(hookArmed(workspace.id), stopped);
    }
    const holder: { session: HarnessSession | null } = { session: null };
    // Placed and bounded as its launch was, from the same spawn.
    const { ctx } = await this.#sessionContext(
      spec,
      spec.cwd,
      adapter,
      holder,
      spec.workspace ?? (await cloneHolding(spec.cwd)),
      true
    );
    // Read off its keeper, never asked of the child: this ends.
    const session = await adapter.custody.adopt(spec, ctx, {
      ...(cursor === undefined ? {} : { afterSeq: cursor }),
      head: proc.head,
      turnRunning: running,
    });
    holder.session = session;
    // Attached: the live child is this session's process from here, running.
    this.#live.carry(spec.instanceId, session);
    detach(
      this.#dateActivity(spec.instanceId, adapter, session, spec.cwd),
      "dateActivity"
    );
    session.attached?.();
    if (this.#live.turnRunning(spec.instanceId)) {
      this.#live.emitPulse(spec.instanceId, true);
    }
    this.#adopting.delete(spec.instanceId);
    settle();
    console.info(turnWords.attached(spec.instanceId));
    // Asked of the child, which answers when it can, ahead of what is sent
    // to it ({@link #settleAttached}).
    await this.#settleAttached(
      spec.instanceId,
      session,
      adapter,
      spec.permissionMode,
      spec.processGeneration,
      stopped
    );
  }

  /**
   * REATTACH (design §4.1, §7), one harness's sessions, as the register ack
   * hands them over (step 4). The agent has restarted; sessiond is still
   * holding the children. Each one the caller names is attached to at once: a
   * full SDK `Query` on the same process, whether it is idle, mid-turn or
   * running background work. No relaunch, so nothing it runs is cut off.
   *
   * The `Query` reads from the hub's own ingest mark (§7's ledger, off the
   * ack), so what the child wrote while no agent was reading reaches the hub
   * exactly once. No mark, or one from another process, follows from head:
   * the honest-loss rule, which replays nothing rather than double what
   * history shows.
   *
   * Three steps, and only the middle one decides what busy questions hear:
   *  1. CLAIM every row sessiond is holding, without yielding.
   *  2. DECIDE whether each claimed child is mid-turn, all at once, off the
   *     runtime ({@link KeeperCustody.turnRunning}). A running turn is in
   *     `#busy` from then on — attached or not yet.
   *  3. ATTACH them one at a time. On obelisk this took 23 s for 138 rows
   *     (2026-10-01), and a busy answer that waited for it, or read `#busy`
   *     before it reached a working row, read 0 while two sessions worked.
   *
   * Which keeper holds each row is the handover's to decide (core
   * handover.ts, the daemon's `takeCustody`), from each keeper's own word
   * read through {@link custodyReader}; this takes one held child the moment
   * that is decided ({@link takeHeld}). What waits on one session waits for
   * that alone, never for the rows after it or another harness.
   */
  custodyReader(kind: KeeperHarnessKind):
    | {
        keepers: () => Promise<string[]>;
        read: (keeper: string) => Promise<KeeperReading>;
      }
    | undefined {
    const adoption = adoptionOf(kind);
    return adoption
      ? {
          keepers: () => adoption.custody.keepers(),
          read: (keeper) => adoption.custody.reading(keeper),
        }
      : undefined;
  }

  /**
   * ONE OWNER PER CHILD, ONE QUERY ON IT. One held child taken into custody,
   * the moment the handover decides which keeper holds it: already carried
   * here (`attached`), or held from now on and attached as it answers
   * (`held`, {@link #holdChild}). A hub reconnect while a child is still
   * being attached hands it over again; a second adopt put a second `Query`
   * on the child, whose subscribe took over the first's listener while both
   * had initialised the CLI. A child already carried, being attached, or
   * being started is this daemon's already. Nothing here yields, so no other
   * reattach takes a row between its check and its hold.
   */
  takeHeld(
    kind: KeeperHarnessKind,
    ackPayload: unknown,
    spec: SpawnPayload,
    proc: Claimed["proc"]
  ): "attached" | "held" {
    const adoption = adoptionOf(kind);
    if (!adoption) {
      throw new Error(`${kind} keeps no children on sessiond to take back`);
    }
    if (spec.keepAliveTurn) {
      this.#live.keepAliveStarted(spec.instanceId, spec.keepAliveTurn);
    }
    if (this.#live.sessions.has(spec.instanceId)) {
      return "attached";
    }
    if (!(
      this.#adopting.has(spec.instanceId) ||
      this.#attaching.has(spec.instanceId)
    )) {
      this.#holdChild(adoption, spec, proc, readIngested(ackPayload));
    }
    return "held";
  }

  /**
   * A session that never started, or stopped without being asked to. One the
   * session keeper refused at the machine's process limit is said in the
   * sentence a person reads, naming the machine and the session; the keeper's
   * own words about which limit stay in the agent's log.
   */
  /**
   * A KEEPER'S CHILD REACHED ITS LIMIT, AND THE SESSIONS IT TOUCHED ARE TOLD.
   * The child is a session's own process (its procId names the session), a
   * workspace's boundary (every session whose commands run in it, by its
   * pid), or OpenCode's server (every session it holds). Each gets the line in
   * its transcript ({@link LIMIT_REACHED}), which the hub keeps on its row; a
   * child no session runs in (a judge) is said in this agent's log alone.
   */
  #limitReached(message: SessiondLimit): void {
    const { holder, instanceIds } = this.#touched(message.procId, message.pid);
    const content = limitSentence(holder, message.limit, message.max);
    warn(
      `${message.procId}: ${content} (${message.group}, ${message.limit} ${message.count}; told ${instanceIds.length ? instanceIds.join(", ") : "no session"})`
    );
    // In order with what else is owed the hub, and on the next connection
    // when this one is down ({@link #sayGone}).
    for (const instanceId of instanceIds) {
      this.#sayToSession(
        instanceId,
        {
          subtype: LIMIT_REACHED,
          uuid: `limit-${message.group}-${message.limit}-${message.count}`,
          content,
        },
        this.#placed.get(instanceId)?.harness ??
          sessionOfProc(message.procId)?.kind
      );
    }
  }

  /**
   * The sessions keeper child `procId` (its process `pid`) runs: a session's
   * own process its own (its procId names it), a workspace's boundary every
   * session whose commands run in it (by its pid), OpenCode's server every
   * session it holds; a judge none. With what the child is to them, and the
   * workspace a boundary is.
   */
  #touched(
    procId: string,
    pid: number
  ): { holder: LimitHolder; instanceIds: string[]; workspace?: string } {
    const proc = parseProcId(procId);
    if ("instanceId" in proc) {
      return { holder: "session", instanceIds: [proc.instanceId] };
    }
    switch (proc.kind) {
      case "boundary": {
        const placed = [...this.#placed].filter(
          ([, one]) => one.boundaryPid === pid
        );
        const workspace = placed.find(([, one]) => one.workspace)?.[1]
          .workspace;
        return {
          holder: "workspace",
          instanceIds: placed.map(([instanceId]) => instanceId),
          ...(workspace ? { workspace } : {}),
        };
      }
      case "opencode-server":
        return {
          holder: "opencode-server",
          instanceIds: serverAdapters().flatMap((adapter) =>
            adapter.custody.sessionsOn(procId)
          ),
        };
      case "judge":
        return { holder: "session", instanceIds: [] };
    }
  }

  /**
   * SOMETHING A SESSION STARTED LEAKS, AND THE SESSIONS IT TOUCHED ARE TOLD
   * (leak-watch.ts): each gets the agent's frame ({@link LEAK_FOUND}), which
   * the hub sends it as its own word. In order with what else is owed the
   * hub, and on the next connection when this one is down.
   */
  #leakFound(
    instanceIds: string[],
    id: string,
    content: string,
    found: LeakFound
  ): void {
    for (const instanceId of instanceIds) {
      this.#sayToSession(
        instanceId,
        { subtype: LEAK_FOUND, uuid: id, content, leak: found },
        this.#placed.get(instanceId)?.harness
      );
    }
  }

  /**
   * A leak told before has ended (leak-watch.ts): each session it was told
   * to gets the agent's frame ({@link LEAK_ENDED}), by the leak's id, and the
   * hub marks the notice it sent ended. Owed as {@link #leakFound}'s are.
   */
  #leakEnded(instanceIds: string[], id: string): void {
    for (const instanceId of instanceIds) {
      this.#sayToSession(
        instanceId,
        { subtype: LEAK_ENDED, uuid: id },
        this.#placed.get(instanceId)?.harness
      );
    }
  }

  /**
   * Session `instanceId`'s ending, as {@link beginEnding} wrote it down,
   * done (session-containers.ts `finishEnding`): the pods and containers it
   * named stopped, and removed unless named, and the hub told what was done
   * ({@link CONTAINERS_ENDED}), which tells the session that delegated it,
   * else the session. One that fails stays written down for the next
   * agent's start, and is said.
   */
  #endContainers(instanceId: string, harness: HarnessKind | undefined): void {
    finishEnding(instanceId)
      .then((ended) => {
        const content = containersEndedWords(ended);
        if (!content) {
          return;
        }
        console.info(`[containers] ${instanceId}: ${content}`);
        this.#sayToSession(
          instanceId,
          {
            subtype: CONTAINERS_ENDED,
            uuid: `containers-ended-${instanceId}-${Date.now()}`,
            content,
          },
          harness
        );
      })
      .catch((error: unknown) =>
        warn(
          `${instanceId}: it ended, but the containers it started could not be read, so they were not stopped: ${errorText(error)}`
        )
      );
  }

  /**
   * As the hub welcomes this agent: the containers owed an ending
   * ({@link sessionsOwedEnding}) ended. Of a session whose ending an earlier
   * agent wrote down and did not finish, as its stop would have; of one the
   * hub no longer has on this machine (`instances`), only said in the log,
   * as nobody is there to tell. A welcome naming no list is a wire error:
   * nothing is ended.
   */
  sweepContainers(welcome: unknown): void {
    const named = (welcome as { instances?: unknown } | undefined)?.instances;
    if (!(
      Array.isArray(named) && named.every((id) => typeof id === "string")
    )) {
      return;
    }
    sessionsOwedEnding(named)
      .then(async ({ gone, unfinished }) => {
        for (const instanceId of unfinished) {
          this.#endContainers(
            instanceId,
            this.#placed.get(instanceId)?.harness
          );
        }
        await Promise.all(
          gone.map(async (instanceId) => {
            const content = containersEndedWords(
              await endSessionContainers(instanceId)
            );
            console.info(
              `[containers] ${instanceId}, a session this hub no longer has: ${content ?? "nothing was there"}`
            );
          })
        );
      })
      .catch((error: unknown) =>
        warn(
          `the containers of ended sessions could not be read as the hub welcomed this agent: ${errorText(error)}`
        )
      );
  }

  /**
   * The keeper refused this session's process its input. Said here with the
   * session and the keeper's reason; the session fails with it, as a start
   * that failed does, and is no longer one this daemon hands work to. What it
   * was handed and has not read goes back to the hub whole, as every failed
   * process's does ({@link #fail}).
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
    this.#live.drop(instanceId, { why: "input-refused" });
    // The keeper refused its input, not its life: the process may run on,
    // driven by nothing. It alone is ended, by its pid ({@link
    // KeeperRefused.pid}), before the hub hears the failure. A refusal that
    // names no pid came from a keeper that could not list its child, and
    // ends nothing: the id alone may name the session's next process.
    if (error.pid === undefined) {
      this.#fail(instanceId, error, processGeneration);
      return;
    }
    this.#endFailed(instanceId, error, processGeneration, error.pid);
  }

  /**
   * A FAILED SESSION LEAVES NO PROCESS RUNNING. Its keeper's child (only the
   * one of `pid`, when given) is ended and waited out ({@link endHeld}),
   * then the hub hears the failure ({@link #fail}). The hub files the row
   * failed and holds its workspace no longer (workspaces.ts `holdsOf`), and
   * nothing ends a CLI left running there: no custody names a failed session
   * again. One that outlives its kill is said beside the failure.
   */
  #endFailed(
    instanceId: string,
    error: unknown,
    processGeneration: string | undefined,
    pid?: number
  ): void {
    endHeld(instanceId, pid)
      .catch((problem: unknown) =>
        warn(
          `${instanceId}: its process could not be ended after its failure: ${errorText(problem)}`
        )
      )
      .finally(() => this.#fail(instanceId, error, processGeneration));
  }

  /** A send handed to its harness, whole as the hub sent it, until the harness reads it. */
  #noteHanded(payload: SendPayload): void {
    const handed = this.#handed.get(payload.instanceId) ?? new Map();
    handed.set(payload.message.uuid, { payload });
    this.#handed.set(payload.instanceId, handed);
  }

  /**
   * The sends a harness says it read are taken ({@link noteTaken}), kept
   * before the frame that says so goes on to the hub, and no longer any
   * hand-back's ({@link #handBack}). A read names each send by its uuid, or
   * by the id the harness said it stores it under (opencode's message id,
   * said in {@link MESSAGES_STORED} as the send is admitted), as the hub's
   * own read of the same frame does.
   */
  #noteRead(instanceId: string, message: NeutralMessage): void {
    if (
      message.type !== "system" ||
      (message.subtype !== MESSAGES_STORED && message.subtype !== MESSAGES_READ)
    ) {
      return;
    }
    const handed = this.#handed.get(instanceId) ?? new Map();
    for (const [uuid, storedAs] of Object.entries(message.storedAs ?? {})) {
      const send = handed.get(uuid);
      if (send) {
        send.storedAs = storedAs;
      }
    }
    if (message.subtype !== MESSAGES_READ) {
      return;
    }
    const taken: string[] = [];
    for (const id of message.read ?? []) {
      const uuids = handed.has(id)
        ? [id]
        : [...handed]
            .filter(([, send]) => send.storedAs === id)
            .map(([uuid]) => uuid);
      for (const uuid of uuids) {
        handed.delete(uuid);
      }
      taken.push(...(uuids.length > 0 ? uuids : [id]));
    }
    try {
      noteTaken(instanceId, taken);
    } catch (error) {
      // Its sends are refused while the record is damaged ({@link #send}).
      warn(
        `${instanceId}: the sends it read could not be kept as taken: ${errorText(error)}`
      );
      if (isDamagedRecord(error)) {
        reportDamaged(error).catch(() => undefined);
      }
    }
  }

  /**
   * A send its session has had already, handed over again (a hub that never
   * heard the read, or owed it again on a read it could not make): no turn
   * starts on it. Taken ({@link hasTaken}): the hub hears it was read, and
   * reads it so with no turn to follow. Still held by the process it was
   * handed to ({@link #handed}): the hub hears that process holds it, and it
   * goes back under this hand-off if the process goes before reading it.
   * True when it was settled so. With the record damaged the send is
   * refused, with the file and why: whether its session had it is not known.
   */
  #handedBefore(payload: SendPayload): boolean {
    const { instanceId, message } = payload;
    let taken: boolean;
    try {
      taken = hasTaken(instanceId, message.uuid);
    } catch (error) {
      if (!isDamagedRecord(error)) {
        throw error;
      }
      reportDamaged(error).catch(() => undefined);
      this.sink({
        kind: "rejected",
        instanceId,
        uuid: message.uuid,
        error: error.message,
      });
      return true;
    }
    if (taken) {
      console.info(
        `[session] ${instanceId}: send ${message.uuid} handed over again, taken already: no turn`
      );
      this.#sayGone({ kind: "taken_send", instanceId, uuid: message.uuid });
      return true;
    }
    const held = this.#handed.get(instanceId)?.get(message.uuid);
    const session = this.#live.sessions.get(instanceId);
    if (!(held && session)) {
      return false;
    }
    console.info(
      `[session] ${instanceId}: send ${message.uuid} handed over again, its process holds it: no turn`
    );
    held.payload = payload;
    this.#outbox.frame({
      kind: "frame",
      instanceId,
      harness: session.harness,
      message: { type: "system", subtype: MESSAGES_HELD, held: [message.uuid] },
    });
    return true;
  }

  /**
   * A send no process took, back to the hub whole under the hand-off it came
   * with: the hub owes it to the session's next process.
   */
  #holdSend(payload: SendPayload): void {
    console.info(
      `[session] ${payload.instanceId}: send ${payload.message.uuid} handed back: no process took it`
    );
    this.#sayGone({
      kind: "held_send",
      instanceId: payload.instanceId,
      send: payload,
    });
  }

  /**
   * A send that finds no process for its session (asleep, exited, failed,
   * never started here) goes back to the hub ({@link #holdSend}), which owes
   * it to the session's next process. A keep-alive ping is refused instead:
   * nothing starts a session to keep its cache warm. True when it was settled
   * so.
   */
  #noProcessFor(payload: SendPayload, keepAlive: boolean): boolean {
    const { instanceId } = payload;
    if (this.#live.sessions.has(instanceId)) {
      return false;
    }
    if (keepAlive) {
      this.sink({
        kind: "rejected",
        instanceId,
        uuid: payload.message.uuid,
        error: "This session is not live, and a keep-alive ping wakes nothing.",
      });
      return true;
    }
    this.#holdSend(payload);
    return true;
  }

  /**
   * What the session's process was handed and never read, back to the hub
   * whole, once that process is gone ({@link #holdSend}).
   */
  #handBack(instanceId: string): void {
    for (const { payload } of this.#handed.get(instanceId)?.values() ?? []) {
      this.#holdSend(payload);
    }
    this.#handed.delete(instanceId);
  }

  /**
   * The session's process went away and nothing failed: the hub files it
   * asleep, its next message waking it, and is handed back what that process
   * never read, which wakes it now. `died`: a signal killed it, and the hub
   * starts it again with the turn it cut.
   */
  /**
   * The session's shell calls, off its own frames: each one running is kept
   * by its tool use ({@link #shells}) until its result, and the tree its
   * command runs in is recorded under its harness process
   * (left-running.ts). An OpenCode turn its server's stop cut carries the
   * commands it was running (`cut`), and is that process gone.
   */
  #noteShell(
    instanceId: string,
    holder: { session: HarnessSession | null },
    message: NeutralMessage
  ): void {
    const running = this.#shells.get(instanceId) ?? new Map<string, string>();
    this.#shells.set(instanceId, running);
    if (message.type === "result") {
      if (message.serverStopped) {
        if (running.size > 0) {
          message.cut = [...running.values()].map((command) => ({
            command,
            output: "",
            unkept: true,
          }));
        }
        this.#leftGone(instanceId);
      }
      running.clear();
      this.#leftRunning.commandsEnded(instanceId);
      return;
    }
    if (shellCallsOf(message, running)) {
      this.#recordShell(instanceId, holder);
    } else if (running.size === 0) {
      this.#leftRunning.commandsEnded(instanceId);
    }
  }

  /** The tree a session's command runs in, recorded under its harness process (left-running.ts). */
  #recordShell(
    instanceId: string,
    holder: { session: HarnessSession | null }
  ): void {
    holder.session
      ?.processId?.()
      .then((pid) => {
        if (pid !== undefined) {
          this.#leftRunning.commandStarted(instanceId, pid);
        }
      })
      .catch((error: unknown) =>
        warn(
          `${instanceId}: its harness process could not be read for its command: ${errorText(error)}`
        )
      );
  }

  /**
   * The shell commands session `instanceId` was running when its process
   * died, off its own tool calls ({@link #shells}): what its harness keeps no
   * output of says so (core `CutCommand` with no `output`).
   */
  #cutShells(instanceId: string): CutCommand[] {
    const running = this.#shells.get(instanceId);
    this.#shells.delete(instanceId);
    return [...(running?.values() ?? [])].map((command) => ({
      command,
      output: "",
      unkept: true as const,
    }));
  }

  /** The session's harness process went: what its commands left running ends (left-running.ts). */
  #leftGone(instanceId: string): void {
    this.#leftRunning
      .processGone(instanceId)
      .catch((error: unknown) =>
        warn(
          `${instanceId}: what its dead harness process left running could not be read, so it was not ended: ${errorText(error)}`
        )
      );
  }

  #gone(
    instanceId: string,
    processGeneration: string | undefined,
    died?: NonNullable<AsleepFrame["died"]>
  ): void {
    this.#leftGone(instanceId);
    this.#sayGone({
      kind: "asleep",
      instanceId,
      processGeneration,
      ...(died ? { died } : {}),
    });
    this.#handBack(instanceId);
  }

  /**
   * CawCo's own word to session `instanceId`'s transcript ({@link AgentNotice}),
   * in order with what else is owed the hub ({@link #sayGone}). Its frame
   * names `harness`, the session's as its caller knows it. A notice of the
   * machine's about a session this agent knows no harness of (a keeper's
   * limit, a leak, the containers of a session the hub welcomed this agent
   * with) still names one, as every frame does: `claude`, which the hub's
   * reading of a notice by its subtype never looks at.
   */
  #sayToSession(
    instanceId: string,
    notice: AgentNotice,
    harness: HarnessKind | undefined
  ): void {
    this.#sayGone({
      kind: "frame",
      instanceId,
      harness: harness ?? "claude",
      message: noticeMessage(notice),
    });
  }

  /** One word of a process gone or a send handed back or taken already, in order, now or on the next connection. */
  #sayGone(frame: Parameters<FrameSink>[0]): void {
    if (this.#unsentGone.length > 0 || !this.sink(frame)) {
      this.#unsentGone.push(frame);
    }
  }

  /**
   * A process this daemon ended itself ({@link LiveSessions.stopsHere}) has gone: whoever
   * ended it says so (the hub for a stop or a move, a sleep for itself), so
   * its harness's word on the way out is only logged, never a failure.
   */
  #endedHere(instanceId: string, error: unknown): void {
    this.#leftGone(instanceId);
    console.info(
      `[session] ${instanceId}: its process ended as this agent stopped it (${error instanceof Error ? error.message : String(error)}); not a failure`
    );
  }

  #fail(instanceId: string, error: unknown, processGeneration?: string): void {
    this.#leftGone(instanceId);
    // Its process was refused its input, and that said why it failed
    // ({@link #refusedInput}): the harness's stream ending on it is the same
    // failure, said once.
    const refusal = this.#keeperRefused.get(instanceId);
    if (refusal && error !== refusal) {
      console.info(
        `[session] ${instanceId}: after its refusal: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    // A record it needed is damaged: the machine's list says so on its next
    // beat, with the file, beside this session's own failure.
    if (isDamagedRecord(error)) {
      reportDamaged(error).catch(() => undefined);
    }
    // An Error with no message still names its kind: String() gives "TypeError".
    const said = (error instanceof Error && error.message) || String(error);
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
    const lastErrorKind = lastErrorKindOf(error);
    const frame = {
      kind: "error" as const,
      instanceId,
      processGeneration,
      verb: "spawn" as const,
      message,
      ...(lastErrorKind ? { lastErrorKind } : {}),
    };
    // The hub fails the row and its work item on this frame alone. One that
    // could not go out now goes out on the next connection.
    if (this.sink(frame)) {
      this.#unsentFailures.delete(instanceId);
    } else {
      this.#unsentFailures.set(instanceId, frame);
    }
    // Behind the failure, so the hub has filed it failed when they arrive:
    // what the failed process never read waits for the session's next start.
    this.#handBack(instanceId);
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
    // The processes gone and sends handed back meanwhile, behind the failures.
    while (this.#unsentGone.length && this.sink(this.#unsentGone[0])) {
      this.#unsentGone.shift();
    }
  }

  /**
   * One send its harness refused. A live process refusing it fails it, and
   * the session goes on. A process gone (exited, failed, refused by the
   * keeper) letting go of what it was handed is no refusal: that send goes
   * back to the hub for the session's next process, or already has.
   */
  #reject(instanceId: string, uuid: string, error: unknown): void {
    const said = error instanceof Error ? error.message : String(error);
    if (
      !this.#live.sessions.has(instanceId) ||
      this.#keeperRefused.has(instanceId)
    ) {
      const handed = this.#handed.get(instanceId)?.get(uuid)?.payload;
      this.#handed.get(instanceId)?.delete(uuid);
      console.info(
        `[session] ${instanceId}: send ${uuid} let go by a process that is gone, not failed: ${said}`
      );
      if (handed) {
        this.#holdSend(handed);
      }
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
    const { instanceId, images } = payload;
    const keepAlive =
      payload.message.origin.kind === "system" &&
      payload.message.origin.name === "keepalive";
    // Ahead of everything: a send its session took already wakes nothing.
    if (this.#handedBefore(payload) || this.#noProcessFor(payload, keepAlive)) {
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
    const worktree = this.#spinOffs.worktree(instanceId);
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
    // Its process may have gone while the files were fetched.
    if (this.#noProcessFor(payload, keepAlive)) {
      return;
    }
    const session = this.#live.sessions.get(instanceId);
    if (!session) {
      return;
    }
    if (keepAlive) {
      if (this.#cacheCold.has(instanceId)) {
        throw new Error(
          "Keep-alive refused: the last keep-alive missed the prompt cache; a real turn must refresh it."
        );
      }
      if (traitsOf(session.harness).promptCacheMaxMs === null) {
        throw new Error(
          `${harnessWords.keepAliveIsFor(
            harnessesWith((traits) => traits.promptCacheMaxMs !== null)
          )}.`
        );
      }
      if (
        this.#live.turnRunning(instanceId) ||
        [...this.#openAsks.values()].some(
          (ask) => "instanceId" in ask && ask.instanceId === instanceId
        )
      ) {
        throw new Error(harnessWords.keepAliveNotIdle(session.harness));
      }
      this.#live.keepAliveStarted(instanceId, message.uuid);
    } else {
      this.#live.touch(instanceId);
      // A send is the reader trying again: whatever failed before it is not
      // the session looping on its own.
      this.#failureRun.delete(instanceId);
      this.#noteHanded(payload);
    }
    session.send(message, { attachments, images });
  }

  /**
   * Ends everything session `instanceId` left running in a workspace
   * (boundary/work.ts {@link endSessionWork}): an interrupt or a stop of it, a
   * move that ends its background tasks with its process
   * (claude-carry.ts `#stopForCarry`), or the settle of a workspace whose items have
   * all ended ({@link endFinishedWork}), leaves nothing of its running, on
   * every harness. Its workspace is `named` when the hub names it, else the one
   * its last start or attach here ran it in, else the one whose clone holds
   * its directory (`cwd` as its stop names it, or as it was started here).
   * Said in the log; a reading that fails is said, and the interrupt or stop
   * goes on.
   */
  async #endWork(
    instanceId: string,
    why: "interrupted" | "stopped" | "finished" | "moved",
    cwd?: string,
    named?: string
  ): Promise<void> {
    try {
      const dir = cwd ?? this.#resumable.get(instanceId)?.cwd;
      const workspace =
        named ??
        this.#placed.get(instanceId)?.workspace ??
        (dir ? (await cloneHolding(dir))?.id : undefined);
      // Stopped before its first launch: the session id its workspace's cut
      // minted for it goes with it, never another's (first-session.ts).
      if (why === "stopped" && workspace) {
        await forgetFirstSession(workspace, instanceId);
      }
      const { ended, left } = await endSessionWork(instanceId, workspace);
      if (ended.length > 0) {
        console.info(
          `[agent] ${workWords.workEnded(instanceId, why, ended, left)}`
        );
      }
    } catch (error) {
      warn(
        `${instanceId}: ${why}, but what it left running in its workspace could not be read, so it was not ended: ${errorText(error)}`
      );
    }
  }

  /**
   * What the sessions `instanceIds` of workspace `workspace`'s ended items
   * left running there ends ({@link #endWork}, `finished`), the hub's word as
   * it settles the workspace (core {@link CONTROL_WORKSPACE_WORK_END}). Each
   * runs in its session's lane, so a send or control the hub sent that
   * session before it is handled first, and one after it waits for it.
   */
  endFinishedWork(
    workspace: string,
    instanceIds: readonly string[]
  ): Promise<void> {
    return Promise.all(
      instanceIds.map((instanceId) => {
        const run = (this.#queues.get(instanceId) ?? Promise.resolve()).then(
          () => this.#endWork(instanceId, "finished", undefined, workspace)
        );
        this.#hold(instanceId, run);
        return run;
      })
    ).then(() => undefined);
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
    forget,
  }: StopPayload): Promise<void> {
    const stopStartedAt = Date.now();
    const processGeneration =
      namedGeneration ?? this.#generations.get(instanceId);
    // A stop is a decision about the session: the hub fails what it was sent
    // and never read as it hears this said `stopped`.
    this.#asleep.delete(instanceId);
    try {
      const session = this.#live.sessions.get(instanceId);
      if (session) {
        this.#live.stopsHere(session);
      }
      if (!harness) {
        throw new Error(
          "A stop names its session's harness; this one named none."
        );
      }
      const kind = harness;
      let ended: Extract<FramePayload, { kind: "stopped" }>["ended"];
      let sharedConversation = false;
      const custody = harnessOf(kind)?.custody;
      if (custody?.kind === "server") {
        const stopped = await custody.stop({
          claimed: claimedSessionIds,
          directory: cwd ?? this.#resumable.get(instanceId)?.cwd,
          forget: forget === true,
          instanceId,
          key: sessionId ?? session?.sessionId,
          sharedElsewhere: (key) =>
            [...this.#live.sessions].some(
              ([id, held]) =>
                id !== instanceId &&
                held.harness === kind &&
                held.sessionId === key
            ) ||
            [...this.#resumable].some(
              ([id, held]) =>
                id !== instanceId &&
                held.adapter.kind === kind &&
                held.sessionKey === key
            ),
        });
        if (stopped.waiting) {
          this.sink({
            kind: "error",
            verb: "stop",
            instanceId,
            processGeneration,
            message: stopped.waiting.message,
            endReason: stopped.waiting.endReason,
          });
          if (requestId) {
            this.sink({
              kind: "control_result",
              instanceId,
              requestId,
              ok: false,
              error: stopped.waiting.message,
            });
          }
          return;
        }
        ({ ended, sharedConversation } = stopped);
        this.#live.drop(instanceId, { why: "stopped" });
      } else if (session) {
        // Carried, and listed on every beat, until the stop is over: a stop
        // waits for the turn it interrupts, and a beat that no longer listed
        // the session meanwhile had the hub settle it as ended — what it was
        // holding failed "ended" before this said "stopped".
        await this.#live.drop(instanceId, {
          why: "stopping",
          listedWhile: () => session.stop(),
        });
      }
      if (custody?.kind !== "server") {
        await endHeld(instanceId);
        ended = { harness: kind, resourcesClosed: true };
      }
      // Its process is gone, and sessiond swept what it started on the host;
      // what its commands left inside its workspace's boundary goes too.
      await this.#endWork(instanceId, "stopped", cwd);
      // And every pod and container its work started (session-containers.ts),
      // their ids written down first so an agent that stops midway ends
      // those, and only those, as it starts again. The stop is not held for
      // their stop timeouts, nor failed when they cannot be read.
      await beginEnding(instanceId).then(
        () => this.#endContainers(instanceId, kind),
        (error: unknown) =>
          warn(
            `${instanceId}: it ended, but the containers it started could not be read, so they were not stopped: ${errorText(error)}`
          )
      );
      this.#resumable.delete(instanceId);
      this.#handed.delete(instanceId);
      forgetTaken(instanceId);
      if (discard && !sharedConversation) {
        await this.#spinOffs.discard(instanceId, {
          worktree: scratchWorktree,
          transcript:
            sessionId && cwd ? { dir: cwd, sessionId, harness } : undefined,
          keepTranscript: !!sessionId && claimedSessionIds.includes(sessionId),
        });
      }
      // The hub forgets the session once this stop is confirmed: nothing
      // can reattach it, so its own browser door goes now.
      if (forget) {
        await forgetBrowserDoor(instanceId);
        // And its own inputs folder, a session with no work item's
        // (inputs.ts `inputsHome`): nothing hands it files again.
        await removeTree(sessionScratchDir(instanceId));
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
      const message = error instanceof Error ? error.message : String(error);
      this.sink({
        kind: "control_result",
        requestId,
        ok: false,
        // Kept as said beside the refusal: the shipped app reads its
        // `ENOENT:` prefix.
        error: message,
        refusal: {
          kind:
            (error as NodeJS.ErrnoException).code === "ENOENT"
              ? "missing"
              : "unknown",
          message,
        },
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
    // A delta's policy, written as it arrived: its answer waits on it, and
    // one that could not write it is refused in those words (NACK).
    const held = this.#fleet.denialsFor(requestId);
    const denials = method === FLEET_DELTA ? held : undefined;
    try {
      if (method === CONTROL_LIST_SESSIONS) {
        const { sessions, unanswered, failed } = await listSessions(args);
        this.sink({
          kind: "control_result",
          instanceId,
          requestId,
          ok: true,
          result: sessions,
          ...(unanswered.length > 0 ? { unanswered } : {}),
          ...(failed.length > 0 ? { failed } : {}),
        });
        return;
      }
      // A setting's control names the setting. One with none is refused
      // before the harness hears it: Claude's would set nothing and clear
      // its session's own record of its mode (claude.ts
      // `SessionMode.choose`), Full Send with it, while the hub's row kept
      // the old mode (restart-rules on the host, 2026-10-23).
      if (
        SETTING_CONTROLS.has(method) &&
        !(typeof args[0] === "string" && args[0])
      ) {
        throw new Error(`${method} names no setting`);
      }
      await denials;
      // An interrupted session is idle: nothing it started in its workspace
      // runs on, to end later and wake it, whether or not its process was
      // there to hear the interrupt.
      const result = await this.#call(
        instanceId,
        kind,
        method,
        args,
        requestId
      ).finally(() =>
        method === CONTROL_INTERRUPT && instanceId
          ? this.#endWork(instanceId, "interrupted")
          : undefined
      );
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
      const message = error instanceof Error ? error.message : String(error);
      this.sink({
        kind: "control_result",
        instanceId,
        requestId,
        ok: false,
        error: message,
        refusal:
          error instanceof NotRunning
            ? { kind: "not-running", message }
            : {
                kind: "unknown",
                message,
                ...(error instanceof PreviewStartDown
                  ? { down: error.down }
                  : {}),
              },
      });
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches to whichever catalog/harness/daemon method the control names, each a distinct branch
  async #call(
    instanceId: string | undefined,
    kind: HarnessKind | undefined,
    method: string,
    args: unknown[],
    requestId?: string
  ): Promise<unknown> {
    if (instanceId === undefined) {
      const declared = this.#controls[method];
      if (declared) {
        return "read" in declared
          ? await this.#abandonableRead(declared.read, requestId, args)
          : await declared.call(...args);
      }

      if (CATALOG_METHODS.has(method)) {
        if (!kind) {
          throw new Error(
            `${method} names no harness: a session key is one harness's`
          );
        }
        const adapter = adapterFor(kind);
        switch (method) {
          case "getSessionInfo": {
            const info = await adapter.getSessionInfo(
              args[0] as string,
              dirOf(args[1])
            );
            return info ? titled(info) : info;
          }
          case CONTROL_READ_TRANSCRIPT_WINDOW: {
            const at = Date.now();
            const options = args[1] as
              { dir?: string; window: WindowAsk } | undefined;
            if (!options?.window) {
              throw new Error(`${method} names no window`);
            }
            const window = await adapter.readTranscriptWindow(
              args[0] as string,
              dirOf(args[1]),
              options.window
            );
            catalogRead(
              at,
              `readTranscriptWindow ${adapter.kind} ${String(args[0]).slice(0, 8)} ${JSON.stringify(options.window)}: ${window.entries.length} message(s)`
            );
            return window;
          }
          case "getSessionMessages": {
            const at = Date.now();
            // `whole`: every message stored; else the active chain.
            const options = args[1] as
              { tail?: number; whole?: boolean } | undefined;
            const span: TranscriptSpan = options?.whole ? "whole" : "chain";
            const messages = await adapter.getSessionMessages(
              args[0] as string,
              dirOf(args[1]),
              options?.tail,
              span
            );
            catalogRead(
              at,
              `getSessionMessages ${adapter.kind} ${String(args[0]).slice(0, 8)}${span === "chain" ? "" : ` ${span}`}${options?.tail ? ` tail ${options.tail}` : ""}: ${messages.length} message(s)`
            );
            return messages;
          }
          case CONTROL_READ_CONTINUATION: {
            const at = Date.now();
            const key = args[0] as string;
            const [live, whole] = await Promise.all([
              adapter.getSessionMessages(key, dirOf(args[1])),
              adapter.getSessionMessages(
                key,
                dirOf(args[1]),
                undefined,
                "whole"
              ),
            ]);
            const read = readContinuation(live, whole, askersOf(args[1]));
            console.info(
              `[catalog] readContinuation ${adapter.kind} ${key.slice(0, 8)}: ${whole.length} stored message(s), ${read.entries.scope} in its live scope, answered ${JSON.stringify(read).length} characters in ${Date.now() - at} ms`
            );
            return read;
          }
          case "renameSession":
            return await adapter.renameSession(
              args[0] as string,
              args[1] as string,
              dirOf(args[2])
            );
          case "tagSession":
            await adapter.tagSession(
              args[0] as string,
              typeof args[1] === "string" ? args[1] : null,
              dirOf(args[2])
            );
            this.#spinOffs.closeTagging(args[0]);
            return undefined;
          case "deleteSession":
            await adapter.deleteSession(args[0] as string, dirOf(args[1]));
            await this.#transcriptDeleted(args[0] as string);
            return undefined;
          default:
            break;
        }
      }

      // A machine-scoped control only one harness knows: try the named harness,
      // then every harness, until one claims it.
      if (kind) {
        const adapter = adapterFor(kind);
        if (adapter.machine) {
          const answer = await adapter.machine(method, args);
          if (answer !== undefined) {
            return answer;
          }
        }
      }
      for (const adapter of harnesses()) {
        if (adapter.machine) {
          const answer = await adapter.machine(method, args);
          if (answer !== undefined) {
            return answer;
          }
        }
      }
      throw new Error(unknownControlWords(method));
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
    if (method === CONTROL_WORK_IN_FLIGHT) {
      return this.#workInFlight(instanceId);
    }
    const session = this.#session(instanceId);
    if (method === "withdrawSend" && !traitsOf(session.harness).queuesSends) {
      return "started";
    }
    // A credential the hub installs in a live session is known before the
    // process can print it, as a launch's is ({@link #granted}).
    const installing = installOf(method, args);
    if (installing) {
      rememberCredential(instanceId, installing.credential);
    }
    return await session.control(method, args);
  }

  /** {@link installTool} of the tool `args` names, as the hub asked. */
  async #installTool(args: unknown[]): Promise<unknown> {
    // The policy's pin, the newest release the hub sends a tool it keeps
    // current to reach, and whether the hub sent it to keep it current
    // rather than a press (hub tool-releases.ts); JSON says an absent
    // one as null.
    const said = (at: number): string | undefined =>
      typeof args[at] === "string" ? (args[at] as string) : undefined;
    const newest = said(2);
    const installed = await installTool(args[0] as string, said(1), {
      ...(newest ? { newest } : {}),
      automatic: args[3] === true,
    });
    // A harness CLI installed here converges what the machine holds of
    // the fleet, as every harness already here did.
    if (harnesses().some((adapter) => adapter.kind === args[0])) {
      this.#fleet.reconverge();
    }
    return installed;
  }

  /**
   * What `instanceId`'s process holds for later that ending it would lose
   * ({@link CONTROL_WORK_IN_FLIGHT}): null with no process here, or none held.
   */
  #workInFlight(instanceId: string): WorkInFlight | null {
    const session = this.#live.sessions.get(instanceId);
    const later = session?.heldForLater?.() ?? [];
    if (!session || later.length === 0) {
      return null;
    }
    return { why: waitingWords(later), since: session.heldSince?.() ?? null };
  }

  #session(instanceId: string): HarnessSession {
    const session = this.#live.sessions.get(instanceId);
    if (!session) {
      throw new NotRunning(instanceId);
    }
    return session;
  }

  #settleAsk(
    instanceId: string,
    requestId: string,
    outcome: "answered" | "cancelled" = "answered",
    processEnded = false,
    /** Who answered it, when its harness says (Full Send). */
    answer?: AskAnswer
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
      ...(processEnded ? { processEnded } : {}),
      ...(answer ? { answer } : {}),
    };
    if (!this.sink(settled)) {
      this.#unheardSettles.set(requestId, settled);
    }
    this.#live.askSettled(instanceId);
  }
}

/**
 * The directory a spawn runs in, made when it may be. Undefined for a probe
 * that has nothing to find; a throw for a spawn that has nowhere to run.
 */
async function workdirFor(payload: SpawnPayload): Promise<string | undefined> {
  const { bootstrap, reattachOnly, workspace } = payload;
  // Every folder a spawn names is a MachinePath: the hub settled it.
  const workdir = bootstrap ? await cloneRepo(bootstrap) : payload.cwd;
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

/** The harness, when it keeps its children on sessiond ({@link KeeperCustody}). */
function adoptionOf(kind: HarnessKind): KeeperHarness | undefined {
  const adapter = adapterFor(kind);
  return isKeeperHarness(adapter) ? adapter : undefined;
}

/**
 * The stored sessions of every harness, merged and newest-first. Every
 * harness is asked at once, and each has {@link HARNESS_LISTING_MS} to
 * answer: one whose server is slow to answer or to fail (OpenCode waits
 * 30s for its server's first line) is left out of this answer, as one that
 * fails is, rather than holding every other harness's sessions past the
 * reader's own wait (the dashboard's 15s), which lost the whole catalog.
 * Each one left out is said beside the answer (`unanswered`, `failed`),
 * never read as having none.
 */
async function listSessions(args: unknown[]): Promise<{
  sessions: NeutralSessionInfo[];
  unanswered: HarnessUnanswered[];
  failed: HarnessFailed[];
}> {
  const options = (args[0] ?? {}) as { limit?: number; dir?: string };
  const unanswered: HarnessUnanswered[] = [];
  const failed: HarnessFailed[] = [];
  const listed = await Promise.all(
    harnesses().map(async (adapter) => {
      let read: Bounded<NeutralSessionInfo[]>;
      try {
        read = await readWithin(HARNESS_LISTING_MS, () =>
          adapter.listSessions(options.dir)
        );
      } catch (error) {
        warn(`listSessions on ${adapter.kind} failed: ${error}`);
        failed.push({ harness: adapter.kind, error: errorText(error) });
        return [];
      }
      switch (read.kind) {
        case "answered":
          return read.value;
        case "unanswered":
          // Said beside the answer (`unanswered`), never read as having none.
          warn(
            `${adapter.kind} did not list its sessions within ${HARNESS_LISTING_MS / 1000} s; it is left out of this answer`
          );
          unanswered.push({
            harness: adapter.kind,
            after: HARNESS_LISTING_MS,
          });
          return [];
        default:
          unhandled("read", read);
      }
    })
  );
  const all = listed.flat();
  all.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
  return {
    sessions: (options.limit ? all.slice(0, options.limit) : all).map(titled),
    unanswered,
    failed,
  };
}

/**
 * `repo`, a git URL on any host, cloned by plain git with the machine's own
 * git credential, whatever host it names; anything else is refused.
 */
async function cloneRepo({
  repo,
  baseDir,
}: NonNullable<SpawnPayload["bootstrap"]>): Promise<string> {
  if (!isGitUrl(repo)) {
    throw new Error(
      `${repo} is not a git URL: name the repository by its clone URL (https://, ssh:// or git@host:path)`
    );
  }
  // A MachinePath from the hub: absolute, no trailing slash.
  const parent = baseDir;
  const target = `${parent === "/" ? "" : parent}/${repoLeaf(repo)}`;

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

  await Bun.$`mkdir -p ${parent}`.env(hostEnvironment()).quiet();
  const cloned = await hostGit(parent, [
    "clone",
    "--single-branch",
    "--",
    repo.trim(),
    target,
  ]);
  if (cloned.exitCode !== 0) {
    throw new Error(
      `could not clone ${repo}: ${tail(cloned.stderr.toString())}`
    );
  }
  return target;
}

function adapterFor(kind: HarnessKind): Harness {
  const adapter = harnessOf(kind);
  if (!adapter) {
    throw new Error(`no harness adapter for ${kind}`);
  }
  return adapter;
}

/**
 * Ends the instance's children on every keeper that holds one, the current
 * or a retiring one, and waits until each has gone; with `pid`, only the
 * child of that pid, so a process started since under the same id is left.
 */
function endHeld(instanceId: string, pid?: number): Promise<boolean> {
  return withKeepers(async (keepers) => {
    const children = keepers.flatMap(({ client }) =>
      client.procs
        .filter(
          (proc) =>
            proc.alive &&
            (pid === undefined || proc.pid === pid) &&
            sessionOfProc(proc.procId)?.instanceId === instanceId
        )
        .map((proc) => ({ client, child: proc }))
    );
    await Promise.all(
      children.map(async ({ client, child }) => {
        await endProc(client, child.procId);
        const deadline = Date.now() + 10_000;
        let alive = true;
        while (alive && Date.now() < deadline) {
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
  });
}

/** A session's stored mode, asked of its process before anything is sent to it. */
async function applyStoredPermissionMode(
  session: HarnessSession,
  mode: SpawnPayload["permissionMode"]
): Promise<void> {
  if (mode !== undefined) {
    await session.control(CONTROL_SET_PERMISSION_MODE, [mode]);
  }
}

/**
 * THE CREDENTIAL GATE OF A LAUNCH, for every harness. A process this agent
 * launched is published only once it has installed the credential the hub
 * granted as it started ({@link #granted}) and the hub has acknowledged it.
 * Nothing has been sent to it yet, so one that cannot is stopped before its
 * first turn, and the throw is its spawn's failure with the reason. A child
 * this agent attached to proves the credential it already holds after it
 * is published ({@link #settleAttached}).
 */
async function admit(
  session: HarnessSession,
  launched: { credential: string }
): Promise<void> {
  try {
    // Remembered for redaction as it was granted ({@link #granted}).
    await installCredential(session, launched.credential);
  } catch (problem) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the refusal below is the outcome either way
    await session.stop().catch(() => {});
    throw new HeldProcessRefused(
      `The session's CawCo MCP credential could not be installed, so it was stopped before its first turn: ${errorText(problem)}`,
      { cause: problem }
    );
  }
}
