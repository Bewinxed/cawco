/**
 * The daemon-side harness abstraction (2026-08 rework).
 *
 * A harness is a plugin that turns one coding-agent runtime into cawco's
 * neutral spine: it spawns sessions, translates their events into
 * {@link NeutralMessage} frames, parks permission requests under a `requestId`,
 * and answers the machine-scoped session catalog. The supervisor
 * ({@link ./session SessionSupervisor}) is harness-agnostic — it owns the git
 * worktrees, side-quest bookkeeping, busy tracking and the routing, and defers
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
} from "@cawco/core";

/** Known surviving custody requires an operator decision, not another probe or a replacement. */
export class HarnessRecoveryRefused extends Error {}

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
  readonly instanceId: string;
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
  /** A gate was answered elsewhere, or by the adapter's own policy. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the context callbacks
  permissionResolved?(requestId: string): void;
  /** Server-session work waits for durable hub storage of its address. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches context callbacks
  recordSessionAddress?(sessionId: string): Promise<void>;
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
  /** Settle a parked permission by its `requestId`. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  resolvePermission(requestId: string, result: PermissionResult): void;
  /** Push one user turn into the session's prompt stream. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  send(
    message: SentMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void;
  /** The runtime's own session id, once known. */
  sessionId: string | null;
  /** End the session gracefully: unblock, interrupt, let the turn settle, close. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  stop(): Promise<void>;
}

/** One harness adapter. Implemented per runtime; registered in `./harnesses`. */
export interface Harness {
  /** Abort a server-held turn without adopting or waking its session. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  abortSession?(sessionKey: string, dir: string): Promise<boolean>;
  /** What `register` reports as this harness's auth, cached from {@link detect}. */
  auth: AuthState;
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
  endSession?(sessionKey: string, dir: string): Promise<void>;
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
  readonly kind: HarnessKind;
  /** The stored sessions this harness can resume. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  listSessions(dir?: string): Promise<NeutralSessionInfo[]>;
  /** A machine-scoped control this harness owns; `undefined` when it is not its word. */
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  machine?(method: string, args: unknown[]): Promise<unknown> | undefined;
  /** Reopen surviving custody, or leave the instance sleeping if it is gone. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches the other adapter methods
  reattach?(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined>;
  // biome-ignore lint/style/useConsistentMethodSignatures: method-style kept so implementers (opencode.ts, pi.ts) keep contravariant parameter checking; property-style would change signature variance
  renameSession(sessionKey: string, title: string, dir?: string): Promise<void>;
  /** Exact addresses retained by this adapter, never reconstructed by guessing. */
  // biome-ignore lint/style/useConsistentMethodSignatures: matches adapter methods
  sessionAddresses?(): import("@cawco/core").SessionAddress[];
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
