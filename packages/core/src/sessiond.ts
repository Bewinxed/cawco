/**
 * sessiond protocol types — the P0 (mechanical extraction) slice of the
 * sessiond design. Status: design only, matching the design document's own
 * header. **Types and endpoint derivation live here; nothing else.** No
 * runtime, no binary, no spawning — leaf P1 builds the daemon against this.
 *
 * Deviation from the design doc, by operator order (PLAN.md contract C7):
 * there is no `WHIFFLE_SESSIOND` feature flag. Do not add one here.
 *
 * See the design document §3.4 (the verbs sessiond owns), §5 (capability
 * strings and version tolerance), §6 (ring bounds), §9 (socket mode) and §12
 * (endpoint derivation) for the reasoning behind every shape below.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { BuildInfo } from "./index";

/**
 * Capability string a sessiond speaks, exchanged in `attach`/`welcome`
 * (design §5). A breaking revision is a new string, never a change to this
 * one's meaning.
 */
export const SESSIOND_V1 = "sessiond.v1";

/** What sessiond spawns: built entirely agent-side and handed over opaque (design §3.2). */
export interface ProcSpec {
  args: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * agent → sessiond: start a child under sessiond's custody. `procId` is
 * minted by the agent so `spawn` can carry a `commandId` for the idempotency
 * map (design §8) without sessiond ever seeing the harness it belongs to.
 */
export interface SessiondSpawn {
  commandId: string;
  procId: string;
  spec: ProcSpec;
  type: "spawn";
}

/** agent → sessiond: bytes on the child's stdin. Opaque — sessiond never parses them. */
export interface SessiondWrite {
  commandId: string;
  data: string;
  procId: string;
  type: "write";
}

/** agent → sessiond: a signal for the child, by name (design §3.4 — "Signal names are the whole vocabulary"). */
export interface SessiondSignal {
  commandId: string;
  procId: string;
  sig: NodeJS.Signals;
  type: "signal";
}

/** agent → sessiond: close the child's stdin (the SDK's own EOF + grace path). */
export interface SessiondStdinEnd {
  commandId: string;
  procId: string;
  type: "stdin_end";
}

/**
 * agent → sessiond: follow a child's stdout ring. `afterSeq` present is a
 * resume; absent follows from now — the same subscribe choreography as the
 * Ledger Protocol's {@link import('./stream').StreamSubscribe}.
 */
export interface SessiondSubscribe {
  afterSeq?: number;
  procId: string;
  type: "subscribe";
}

/** agent → sessiond: what is alive, right now. */
export interface SessiondList {
  type: "list";
}

/** One child as sessiond currently knows it. */
export interface SessiondProcInfo {
  alive: boolean;
  /**
   * Where the child was spawned, echoed back from its {@link ProcSpec}.
   *
   * An agent that restarted knows sessiond is holding a child but not what
   * directory it belongs to, and a reattach needs one. Without this the only
   * survivors it could adopt were the ones the hub happened to name — so a
   * session the hub had written off was left running with nobody pumping it.
   */
  cwd?: string;
  exitCode?: number;
  /** The ring's current head seq for this child. */
  head: number;
  pid: number;
  procId: string;
}

/**
 * sessiond → agent: the reply to `attach`/`list`. `epoch` is a per-boot UUID
 * (design §7's srcEpoch) — a cursor from a previous epoch is a dead cursor,
 * never replayed against.
 */
export interface SessiondWelcome {
  build: BuildInfo;
  capabilities: readonly string[];
  epoch: string;
  procs: SessiondProcInfo[];
  type: "welcome";
}

/** sessiond → agent: one line of a child's stdout, sequenced within its epoch. */
export interface SessiondLine {
  data: string;
  procId: string;
  seq: number;
}

/** sessiond → agent, live fan-out of one sequenced line. */
export interface SessiondDelta {
  event: SessiondLine;
  type: "proc.line";
}

/** sessiond → agent when the requested gap is inside the ring: contiguous, ascending. */
export interface SessiondBacklog {
  events: SessiondLine[];
  procId: string;
  type: "proc.backlog";
}

/**
 * sessiond → agent when the gap is unrecoverable — the ring overflowed, or
 * `afterSeq` names a dead epoch. An honest refusal, never a partial replay
 * (design §6); the agent forwards a `sessiond_stream_gap` system frame.
 */
export interface SessiondReset {
  nextSeq: number;
  /**
   * The earliest seq sessiond can still serve, when it holds one at all.
   *
   * `nextSeq` answers "where does MY stream resume" — past `head`, because a
   * refused subscriber is left following from now. That is the right answer
   * for a wrapper feeding the SDK, and the wrong one for a caller that asked
   * from the ring's start to READ what is there: it names a line the child has
   * not written yet, so a peek that reopens on it reads nothing at all. This
   * field is the other question — "how far back do you go" — and is absent
   * only when the ring has nothing left (`oldest > head`), or from a sessiond
   * built before it existed.
   */
  oldest?: number;
  procId: string;
  type: "proc.reset";
}

/** sessiond → agent: a child exited. Delivered once per procId per epoch. */
export interface SessiondExit {
  exitCode: number | null;
  procId: string;
  signal: NodeJS.Signals | null;
  type: "proc.exit";
}

/**
 * sessiond → agent, the lifecycle of a mutating command. Unknown message
 * types are answered, never fatal (design §5): sessiond replies `failed`
 * with `reason: 'unsupported: <type>'` and keeps the connection; the agent
 * treats that as a capability probe result, not an error.
 */
export interface SessiondAck {
  commandId: string;
  reason?: string;
  stage: "accepted" | "applied" | "failed";
  type: "ack";
}

export type SessiondClientMessage =
  | SessiondSpawn
  | SessiondWrite
  | SessiondSignal
  | SessiondStdinEnd
  | SessiondSubscribe
  | SessiondList;

export type SessiondServerMessage =
  | SessiondWelcome
  | SessiondDelta
  | SessiondBacklog
  | SessiondReset
  | SessiondExit
  | SessiondAck;

/**
 * The socket dial string a caller connects/listens on — filesystem unix
 * socket on linux/darwin, a reserved named-pipe name on win32 (design §12).
 * `node:net` accepts all three shapes in `listen()`/`connect()`; only the
 * derivation branches.
 *
 * - linux : `$XDG_RUNTIME_DIR/whiffle/sessiond.sock`, else `~/.whiffle/sessiond.sock`.
 *   `XDG_RUNTIME_DIR` is safe here because the install path already requires
 *   lingering, which keeps the runtime dir alive across logout; `~/.whiffle`
 *   covers ad-hoc runs.
 * - darwin: `~/.whiffle/sessiond.sock` always — `sun_path` is 104 bytes on
 *   darwin, so a long `XDG_RUNTIME_DIR`-style path is a real risk; a fixed,
 *   short home-relative path avoids it.
 * - win32 : `\\.\pipe\whiffle-sessiond-<user>` — a name reservation. Windows
 *   implementation is out of scope for this leaf; only the string is fixed
 *   so nothing downstream has to change when it lands.
 */
export const sessiondEndpoint = (): string => {
  switch (process.platform) {
    case "win32": {
      const user = process.env.USERNAME ?? process.env.USER ?? "default";
      return `\\\\.\\pipe\\whiffle-sessiond-${user}`;
    }
    case "darwin":
      return join(homedir(), ".whiffle", "sessiond.sock");
    default: {
      // linux, and every other platform Node reports: same derivation as
      // linux's documented case, since XDG_RUNTIME_DIR is the same signal
      // wherever it is set.
      const runtimeDir = process.env.XDG_RUNTIME_DIR;
      return runtimeDir
        ? join(runtimeDir, "whiffle", "sessiond.sock")
        : join(homedir(), ".whiffle", "sessiond.sock");
    }
  }
};
