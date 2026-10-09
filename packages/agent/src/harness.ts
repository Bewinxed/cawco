/**
 * The daemon-side harness abstraction (2026-08 rework).
 *
 * A harness is a plugin that turns one coding-agent runtime into cawco's
 * neutral spine: it spawns sessions, translates their events into
 * {@link NeutralMessage} frames, parks permission requests under a `requestId`,
 * and answers the machine-scoped session catalog. The supervisor
 * ({@link ./session SessionSupervisor}) is harness-agnostic — it owns the git
 * worktrees, spin-off bookkeeping, busy tracking and the routing, and defers
 * to whichever {@link Harness} a spawn names.
 *
 * Adding a harness: implement {@link Harness}, register it in
 * `./harnesses/index.ts`, and if it ships new UI concepts, teach the dashboard's
 * folding layer about them (they arrive as `raw` frames until then).
 */
import type {
  AuthState,
  Envelope,
  FleetConfig,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessKind,
  HarnessReport,
  NeutralMessage,
  NeutralSessionInfo,
  PermissionResult,
  PermissionUpdate,
  SendPayload,
  SentMessage,
  SessionMessage,
  SpawnPayload,
  TextAttachment,
} from "@cawco/core";

/**
 * What a turn carries to its harness beside its words: the texts it folds in
 * and the pictures it leads with. Files are not here: the supervisor has put
 * them on this machine and named them in the words already.
 */
export interface TurnExtras {
  attachments?: TextAttachment[];
  images?: SendPayload["images"];
  urgent?: boolean;
}

/** Known surviving custody requires an operator decision, not another probe or a replacement. */
export class HarnessRecoveryRefused extends Error {}
/** A refusal is final for its launch attempt, including recovery attempts. */
export class SessionAddressRefused extends Error {}
export class HubContractRefused extends SessionAddressRefused {}
/**
 * A session process that cannot be trusted to run: its CawCo MCP credential
 * did not install (a process this agent launched) or verify (one it attached
 * to), or a Claude Code it attached to carries a workspace boundary hook that
 * can stop holding. The process has been stopped; this is its spawn's
 * failure, with the reason — an end, not a recovery the hub retries.
 */
export class HeldProcessRefused extends Error {}

/**
 * The machine's session keeper (sessiond) refused to pass a session's process
 * its input: a write or the end of its stdin, for a process it does not hold
 * alive. Nothing the refused bytes carried reached the harness, and nothing
 * more will: the session fails with this, in its start failure's words, and
 * keeps what it was sent for its next start.
 */
export class KeeperRefused extends Error {
  readonly procId: string;
  readonly reason: string;
  constructor(procId: string, reason: string) {
    super(
      `This session's process could not be reached: the machine's session keeper refused its input (${reason}).`
    );
    this.procId = procId;
    this.reason = reason;
  }
}

/** Everything a harness needs from the supervisor while it owns a session. */
export interface HarnessContext {
  /**
   * The workspace boundary a work item's session runs every shell command
   * inside (`./boundary`). Absent on every other session, which runs its
   * commands as it always has.
   */
  readonly boundary?: import("./boundary").Boundary;
  /** Whether a turn is in flight — the supervisor's busy set and drain read this. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  busy(active: boolean): void;
  /** The session's event loop ended; the supervisor drops its routing entry. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  closed?(): void;
  /** The resolved working directory (after worktree / bootstrap). */
  readonly cwd: string;
  /** Put an envelope the harness built itself on the daemon's hub socket. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  emit(envelope: Envelope): void;
  /** The session itself died of something the reader should see. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  failed(error: unknown): void;
  /** Ship one neutral frame toward the hub. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  frame(message: NeutralMessage): void;
  readonly ingested?: import("@cawco/core").IngestMark;
  readonly instanceId: string;
  /**
   * The session keeper refused this session's process its input
   * ({@link KeeperRefused}): said, the session failed with it, and the sends
   * it was handed kept for its next start.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the context callbacks
  keeperRefused(error: KeeperRefused): void;
  /** Park a permission request; the supervisor forwards it and tracks the reply. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  permission(request: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    suggestions?: PermissionUpdate[];
    requestKind?: "tool" | "question";
    /** The tool call the ask gates: its `tool_use` id, which names its transcript row. */
    toolUseId?: string;
  }): void;
  /**
   * A gate was answered elsewhere, or by the adapter's own policy; or, with
   * `cancelled`, withdrawn by the harness before anyone answered it (an
   * interrupt mid-ask).
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the context callbacks
  permissionResolved?(
    requestId: string,
    outcome?: "answered" | "cancelled"
  ): void;
  /** Server-session work waits for durable hub storage of its address. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches context callbacks
  recordSessionAddress?(sessionId: string): Promise<void>;
  /**
   * The session's process was stopped because it can no longer be trusted
   * to run ({@link HeldProcessRefused}): its row and work item fail with the
   * reason, which the parent hears, even for a session this agent attached
   * to.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the context callbacks
  refused?(error: HeldProcessRefused): void;
  /**
   * The harness refused one send, `uuid`: that send failed, with the
   * harness's own words. The session goes on — this is never a session
   * failure ({@link failed}).
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the context callbacks
  rejected(uuid: string, error: unknown): void;
  /** The harness's own session id, once the runtime names it. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  session(sessionId: string): void;
  /** Delivered by the hub, held only by this session's MCP configuration/closures. */
  readonly sessionCredential?: string;
}

/** One live session, owned by a harness. */
export interface HarnessSession {
  /** Called only after the supervisor has installed this handle. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the session methods
  attached?(): void;
  /** A neutral control ({@link CONTROL_INTERRUPT}, …), mapped to the runtime. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  control(method: string, args: unknown[]): Promise<unknown>;
  /** Hard teardown, used on drain/shutdown. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  dispose(): Promise<void>;
  readonly harness: HarnessKind;
  /**
   * What stopping this session's processes now would lose, in words, beyond
   * what the supervisor sees for itself (a running turn, a parked ask): work
   * the runtime holds in its own process. Nothing when it holds nothing.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the session methods
  holding?(): string | undefined;
  /** Interrupt the current turn. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  interrupt(): Promise<void>;
  /**
   * The supervisor stopped this session for failing the same way again and
   * again ({@link import("@cawco/core").REPEATED_FAILURE}), in `words`: kept
   * in the session's own history, so a transcript read back says so as the
   * live one did. A runtime that starts no turn of its own between sends
   * cannot loop that way, and has none.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the session methods
  noteStopped?(words: string): Promise<void>;
  /** Settle a parked permission by its `requestId`. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  resolvePermission(requestId: string, result: PermissionResult): void;
  /** Push one user turn into the session's prompt stream. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  send(message: SentMessage, extras: TurnExtras): void;
  /** The runtime's own session id, once known. */
  sessionId: string | null;
  /** End the session gracefully: unblock, interrupt, let the turn settle, close. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  stop(): Promise<void>;
  /**
   * Take back a parked permission nobody could be shown (WITHDRAW_PERMISSION):
   * denied with `message`, and recorded as withdrawn, never as the reader's
   * dismissal.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style like resolvePermission, for the same contravariant parameter checking
  withdrawPermission(requestId: string, message: string): void;
}

/** One harness adapter. Implemented per runtime; registered in `./harnesses`. */
export interface Harness {
  /** Abort a server-held turn without adopting or waking its session. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  abortSession?(sessionKey: string, dir: string): Promise<boolean>;
  /**
   * The machine's provider accounts changed (one signed in, keyed, moved in
   * or forgotten): the harness takes the change into what it runs. Absent
   * from a harness that reads the accounts afresh on its own.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  accountsChanged?(): Promise<void>;
  /** What `register` reports as this harness's auth, cached from {@link detect}. */
  auth: AuthState;
  /** Why {@link auth} is what it is, when the harness can say, cached beside it. */
  readonly authReason?: string;
  /** Authoritative server activity, when the runtime owns turns outside this daemon. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  busyInstances?(): Promise<string[]>;
  readonly capabilities: HarnessCapabilities;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  deleteSession(sessionKey: string, dir?: string): Promise<void>;
  /** What this machine can do with the harness — install, version, auth. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  detect(): Promise<HarnessReport>;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  dispose?(): Promise<void>;
  /** Confirm a server session's turn and resources ended without adopting it. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches adapter methods
  endSession?(
    sessionKey: string,
    dir: string,
    instanceId?: string,
    claimed?: readonly string[]
  ): Promise<void>;
  /**
   * The fleet content this harness's own copy holds on disk now, hashed as the
   * hub hashes it. Absent from a harness that converges no content.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers keep contravariant parameter checking, like the other adapter methods
  fleetHoldings?(): Promise<import("@cawco/core").FleetHoldings>;
  /** What the harness has of what cawco last put on it, without changing it. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  fleetStatus?(): Promise<FleetSyncReport>;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined>;
  /**
   * The session's messages, oldest first. By default what the harness shows
   * as the conversation (claude: its active chain, which begins at the last
   * compaction); `whole` asks for every message the session ever stored,
   * across compactions and abandoned branches — for readers that index the
   * whole history rather than show it. `tail` keeps only the newest.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  getSessionMessages(
    sessionKey: string,
    dir?: string,
    tail?: number,
    whole?: boolean
  ): Promise<SessionMessage[]>;
  /**
   * The hub restarted since this harness's live sessions connected to it:
   * whatever connection to the hub they hold that does not come back by
   * itself is made again. Absent for a harness whose connections do.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  hubRestarted?(): Promise<void>;
  readonly kind: HarnessKind;
  /** The stored sessions this harness can resume. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  listSessions(dir?: string): Promise<NeutralSessionInfo[]>;
  /** A machine-scoped control this harness owns; `undefined` when it is not its word. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  machine?(method: string, args: unknown[]): Promise<unknown> | undefined;
  /**
   * Every provider the harness's own catalog names, by id and name: the
   * providers an account can be for through it. Absent from a harness with
   * no catalog of providers of its own.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  providerList?(): Promise<{ id: string; name: string }[]>;
  /** Reopen surviving custody, or leave the instance sleeping if it is gone. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  reattach?(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined>;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  renameSession(sessionKey: string, title: string, dir?: string): Promise<void>;
  /**
   * What an agent restart would cut of this adapter's own work, now: the work
   * it runs in the agent's process, never its runtime's turns. Absent for an
   * adapter whose runtime holds all of it under the keeper.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  restartHolds?(): import("@cawco/core/binary-updates").RestartHold[];
  /** Exact addresses retained by this adapter, never reconstructed by guessing. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches adapter methods
  sessionAddresses?(): import("@cawco/core").SessionAddress[];
  readonly sessionPresent?: (
    sessionKey: string,
    dir: string
  ) => Promise<boolean>;
  /** Lifecycle guards read the supervisor's one machine recovery barrier. */
  readonly setCustodyReadiness?: (read: () => boolean) => void;
  /** Start a session; resolves once the runtime handle is in place. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  spawn(spec: SpawnPayload, ctx: HarnessContext): Promise<HarnessSession>;
  /** Applies the hub's fleet config to this harness's own files; reports per entry. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  syncFleet?(config: FleetConfig): Promise<FleetSyncReport>;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  tagSession(
    sessionKey: string,
    tag: string | null,
    dir?: string
  ): Promise<void>;
  /** Complete post-stop reading; unknown server runners must remain untouched. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches adapter methods
  unclaimedRunners?(
    directory: string,
    claimed: readonly string[]
  ): Promise<{ count: number; readStartedAt: number }>;
}
