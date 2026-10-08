/** Browser-neutral release policy and machine state consumed by API clients. */
export interface BinaryUpdatePolicy {
  /** One setting for the whole fleet: a machine does not pick its own. */
  autoUpdate: boolean;
  channel: "stable" | "nightly";
}

/**
 * Where a machine stands. `waiting-sessions` is the session keeper's own
 * state: it holds running children and so keeps its old binary; the count is
 * `heldChildren`. A machine whose new agent cannot speak to that keeper is in
 * the same state with `installedVersion` still the old one.
 */
export const BINARY_UPDATE_PHASES = [
  "none",
  "available",
  "downloading",
  "ready",
  "waiting-sessions",
  "waiting-for-channel",
  "installing",
  "installed",
  "failed-rolled-back",
  "failed",
] as const;

export type BinaryUpdatePhase = (typeof BINARY_UPDATE_PHASES)[number];

/** The newest signed release of one channel, as the release host shows it. */
export interface ChannelRelease {
  notes: string;
  sequence: number;
  version: string;
}

/** What the hub knows of each channel; `null` where the release host has no release. */
export interface BinaryUpdateChannels {
  channels: {
    nightly: ChannelRelease | null;
    stable: ChannelRelease | null;
  };
  /** When the release host was asked, in milliseconds. */
  checkedAt: number;
}

/**
 * The last install or rollback that finished. It is the event a notice
 * announces, so nothing but the finish of an install or rollback sets it, and
 * the next one replaces it: the state's other writes carry it through
 * unchanged, and the session keeper moving to the build later is part of the
 * same update, not a new one. Whether a person has seen it is the hub's
 * record (`POST /api/notices/seen`, as `landed:<machineId>:<at>`), so one
 * acknowledgement holds for every tab and device.
 */
export interface BinaryUpdateLanding {
  /** When it finished, in milliseconds: the landing's identity. */
  at: number;
  /** The landed build's release notes. */
  notes?: string;
  outcome: "installed" | "rolled-back";
  /** The build installed, or the build that failed and was rolled back. */
  version: string;
}

/**
 * Kinds of work a restart of the agent or the hub would cut. A turn is not one:
 * the session keeper runs it, and the next agent takes it over where it stands.
 *
 * - `custody`: the agent is still taking over the sessions the keeper holds.
 * - `starting`: a session start the agent is in the middle of.
 * - `image`: an image generation the agent is running.
 * - `workspace`: a delegate's workspace the agent is cutting or archiving.
 * - `command`: a command the hub asked the agent to run (a check, a step).
 * - `tool-call`: a tool call the agent relays to its hub.
 * - `hub-tool-call`: a CawCo tool call the hub is answering, from any machine.
 * - `write`: a message or an answer the agent is handing to a harness.
 * - `opencode`: an OpenCode server operation the agent runs (a config apply,
 *   a session opening, an MCP change, a handoff between server generations).
 * - `opencode-send`: messages the agent holds for OpenCode, not yet handed over.
 */
export type RestartHoldReason =
  | "custody"
  | "starting"
  | "image"
  | "workspace"
  | "command"
  | "tool-call"
  | "hub-tool-call"
  | "write"
  | "opencode"
  | "opencode-send";

/** One kind of work a restart would cut now, and what each piece is (a session, a call). */
export interface RestartHold {
  ids: string[];
  reason: RestartHoldReason;
}

/** What a restart would cut right now; ready when nothing. */
export interface RestartReadiness {
  holds: RestartHold[];
  ready: boolean;
}

/**
 * The CawCo tools a restart can cut without losing work: the hub stores the
 * call before it runs and finishes it after a restart. `finish_item` stores
 * its submission and `checkingSince` before the first check, the hub reruns
 * the checks when the machine's agent registers again, and the session is
 * told an outcome the cut call could no longer carry. A call to one of these
 * holds no restart, and a fence lets it through.
 */
export const RESUMABLE_CAWCO_TOOLS: ReadonlySet<string> = new Set([
  "finish_item",
]);

/**
 * How long an update's fence waits for the work in flight to end, before
 * Install now installs anyway and auto-update tries again later. Ours: just
 * over the 30 s the agent gives a short CawCo tool call (`callDelegationTool`),
 * so every short call admitted before the fence has answered or timed out by
 * its end; the writes to a harness, session starts and OpenCode operations a
 * drain also waits on take seconds. Any longer and the fence, which refuses
 * every new tool call meanwhile, costs the sessions more than it saves them.
 */
export const UPDATE_DRAIN_MS = 45_000;

/**
 * How long auto-update waits on work in flight before it installs anyway and
 * records what it cut. Ours: past the long work a restart would cut (an image
 * generation is given 10 minutes, a delegate's workspace and a continuation's
 * summary take minutes, a check 10 minutes by default), and short enough that
 * a fix still reaches a machine that is never without work in flight.
 */
export const UPDATE_WAIT_CAP_MS = 30 * 60_000;

/** What a request refused by a raised fence answers: it was not started. */
export const AGENT_RESTARTING =
  "The agent is restarting. This request was not started; retry it in a minute.";
export const HUB_RESTARTING =
  "The hub is restarting. This call was not started; call it again in a minute.";

const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

const HOLD_WORDS: Record<RestartHoldReason, (n: number) => string> = {
  custody: () => "the takeover of this machine's sessions",
  starting: (n) => counted(n, "session starting", "sessions starting"),
  image: (n) => counted(n, "image generation", "image generations"),
  workspace: (n) =>
    counted(
      n,
      "workspace being set up or archived",
      "workspaces being set up or archived"
    ),
  command: (n) => counted(n, "command running", "commands running"),
  "tool-call": (n) => counted(n, "tool call", "tool calls"),
  "hub-tool-call": (n) =>
    counted(n, "tool call at the hub", "tool calls at the hub"),
  write: (n) =>
    counted(n, "message being handed over", "messages being handed over"),
  opencode: (n) => counted(n, "OpenCode operation", "OpenCode operations"),
  "opencode-send": (n) =>
    counted(
      n,
      "session with messages not yet handed to OpenCode",
      "sessions with messages not yet handed to OpenCode"
    ),
};

/** Each hold in words, in order: `2 tool calls`, `1 image generation`. A kind a newer build names is still counted. */
export const holdPhrases = (holds: readonly RestartHold[]): string[] =>
  holds.map(({ reason, ids }) =>
    (
      (HOLD_WORDS as Partial<typeof HOLD_WORDS>)[reason] ??
      ((n: number) => counted(n, "piece of work", "pieces of work"))
    )(ids.length)
  );

/** Every hold of `lists`, one entry per reason, each id once. */
export function mergeHolds(
  ...lists: (readonly RestartHold[])[]
): RestartHold[] {
  const grouped = new Map<RestartHoldReason, Set<string>>();
  for (const { reason, ids } of lists.flat()) {
    const known = grouped.get(reason) ?? new Set<string>();
    for (const id of ids) {
      known.add(id);
    }
    grouped.set(reason, known);
  }
  return [...grouped]
    .filter(([, ids]) => ids.size > 0)
    .map(([reason, ids]) => ({ reason, ids: [...ids] }));
}

export interface BinaryUpdateState {
  availableVersion?: string;
  channel: BinaryUpdatePolicy["channel"];
  /**
   * The ids of the last Install now commands this machine acted on, oldest
   * first: one delivered again is answered and not acted on twice.
   */
  commands?: string[];
  /**
   * What the last install cut: the work in flight when it was applied anyway,
   * because a person pressed Install now or auto-update had waited its cap.
   * Kept until the next install.
   */
  cut?: RestartHold[];
  error?: string;
  /** The build that failed to come up and was rolled back; not retried by itself. */
  failedVersion?: string;
  /** Children the session keeper holds, while it is the reason for waiting. */
  heldChildren?: number;
  /** True on the machine that runs the hub. */
  hostsHub: boolean;
  installedVersion: string;
  /** The build the session keeper could not start on; not retried by itself. */
  keeperFailedVersion?: string;
  /** The last install or rollback that finished. */
  landed?: BinaryUpdateLanding;
  notes?: string;
  phase: BinaryUpdatePhase;
  /** The version the session keeper's link names; differs from the build while it holds children. */
  sessiondVersion?: string;
  /** When anything in this state last changed. Not an identity for anything. */
  updatedAt: number;
  /** What `ready` waits for: the work in flight a restart would cut now. */
  waitingOn?: RestartHold[];
  /** When auto-update first waited on work in flight; it installs anyway once its cap has passed. */
  waitingSince?: number;
}
