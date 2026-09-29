import { arch, hostname, platform } from "node:os";
import type {
  AuthState,
  BuildInfo,
  DeployInfo,
  Envelope,
  HeartbeatPayload,
  SpawnPayload,
} from "@whiffle/core";
import {
  CONTROL_RUN_COMMAND,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_MIGRATE,
  WHIFFLE_ENV,
  WHIFFLE_HUB_PORT,
} from "@whiffle/core";
import { sessiondEndpoint } from "@whiffle/core/sessiond";
import { fetchClaudeLimits } from "@whiffle/core/usage/limits";
import { mergeObserved } from "@whiffle/core/usage/observed";
import { Data, Duration, Effect, Fiber, Schedule } from "effect";
import { buildInfo } from "./build";
import { convertWorktrees } from "./clone";
import { readConfig } from "./config";
import { convergeDeniedTools } from "./denied-tools";
import { deployRoot, latestDeploy } from "./deploy";
import { rediscoverHub, toWsUrl } from "./discovery";
import { harnesses } from "./harnesses";
import { OPENCODE_SERVER_PROC_ID } from "./harnesses/opencode";
import { cache as transcriptCache } from "./harnesses/transcript-cache";
import { machineId } from "./machine-id";
import { servingPreviews } from "./preview";
import { TranscriptSearchService } from "./search";
import { resumableSessions, SessionSupervisor } from "./session";
import { SessiondClient } from "./sessiond-client";
import { probeTools } from "./tools";
import { consumeRestartMarker } from "./update";
import { UsageScanner } from "./usage/scanner";
import { runWorkflowCommand } from "./workflow-command";
import {
  archiveWorkspace,
  createWorkspace,
  workspaceBoundary,
} from "./workspace";

const DEFAULT_HUB_URL = `ws://localhost:${WHIFFLE_HUB_PORT}/ws`;
const HEARTBEAT_INTERVAL = Duration.seconds(15);
const USAGE_INTERVAL = Duration.seconds(60);
const USAGE_FULL_REBUILD_MS = 30 * 60 * 1000;

/** How the hub identifies this machine in its registry. */
interface MachineIdentity {
  /**
   * Whether this daemon can reach Claude Code's credentials. It travels with the
   * identity because it is a fact about the machine, not about a session, and
   * because a machine that cannot start one should not sit in the fleet looking
   * ready to.
   */
  auth: AuthState;
  hostname: string;
  machineId: string;
  os: string;
}

/**
 * What `register` carries. The supervisor outlives any one connection, so a
 * register is not a promise of zero sessions — `instances` names the ones still
 * running and the hub marks every other row it calls running as unknown.
 *
 * Only what the daemon can say without spawning anything. The register is the
 * moment the hub puts this machine back in its registry — `online` is read
 * from nowhere else — so every millisecond spent before sending it is a
 * millisecond a healthy machine reads offline. Harnesses and tools, whose
 * probes start processes, follow on a beat of their own: see
 * {@link HeartbeatPayload}.
 */
export interface RegisterPayload extends MachineIdentity {
  /**
   * The whiffle this daemon is running (NEW.md §12), as it reported at register.
   */
  build?: BuildInfo;
  /** Custody is not attachment: these still need a handle before being listed live. */
  custody?: { instances: string[]; opencode: boolean };
  /**
   * Where this machine's deployment clone stood at register (contract C8), so a
   * board that has just been handed a machine knows without waiting a beat.
   * Whatever the poller last saw — this never asks git anything itself, so a
   * daemon with no deployment watcher running simply omits it.
   */
  deploy?: DeployInfo;
  instances: string[];
  /**
   * The preview listeners this process is serving. A hub that restarted has
   * no targets and takes these as they are; one that only lost the socket
   * points its targets at them again.
   */
  previews: ReturnType<typeof servingPreviews>;
  /**
   * True on exactly one register: the first one this process ever sends,
   * and only when it came up because the deploy poller's idle-gated restart
   * (`DeployWatcher#drainPendingRestart`, update.ts) fired it — never for a
   * manual `service restart`, a crash, or a plain machine boot. What the
   * dashboard toasts on; see `consumeRestartMarker`, which is what makes this
   * exactly-once rather than "every register until someone reconnects".
   */
  restarted?: true;
  /**
   * The sessions this machine could resume, so the rows the daemon no
   * longer carries settle as sleeping or as lost rather than all alike. Absent
   * when the catalog could not be read.
   */
  resumable?: string[];
  /**
   * When each of those conversations last changed, ms epoch, by session id.
   * The hub writes it onto the rows it is not being told are live, so a
   * sleeping session's age is when the session last said something rather than
   * when this register ran. Absent alongside `resumable`, and separate from it
   * so a hub that predates this field still reads the ids.
   */
  resumableAt?: Record<string, number>;
}

export class ConnectionLost extends Data.TaggedError("ConnectionLost")<{
  readonly url: string;
  readonly reason: string;
}> {}

/**
 * How often a daemon knocks while its hub is coming back from a restart, and
 * how many knocks it spends before deciding the outage is real.
 *
 * A deploy that reaches the hub's code restarts it (`restartStack`,
 * update.ts), and a restarted hub starts with an empty registry, which is the only place `online` is read
 * from: every machine reads offline until its daemon registers again. Measured
 * here, the hub is listening again 0.42–0.54s after systemd stops it (journal,
 * `Stopping` to `listening on`, 12 deploy restarts). The first attempt after a
 * connection ends always finds the port closed, and when the series started at
 * 1s the second attempt came 0.8–1.2s later (jittered), so every deploy showed
 * healthy machines as offline for another 0.3–0.8s of pure waiting after the
 * hub was already listening. A 50ms knock means the daemon is back within
 * 50ms of the hub. 40 knocks (2s) give a slow boot nearly four times the
 * slowest measured restart before the series backs off.
 */
const RESTART_KNOCK = Duration.millis(50);
const RESTART_KNOCKS = 40;
const RESTART_WINDOW_MS = Duration.toMillis(RESTART_KNOCK) * RESTART_KNOCKS;

/**
 * One retry series: a 50ms knock for 2s ({@link RESTART_KNOCK}), then 1s, 2s,
 * 4s … capped at 30s, all jittered so a fleet never retries in lockstep.
 *
 * A schedule carries its exponent in its own state, and that state lives for
 * exactly as long as the `Effect.retry` that stepped it. Because `attach` never
 * succeeds on its own — see {@link closed} — a single `retry` around it would be
 * ONE series for the whole life of the process: the exponent accumulates across
 * every outage the daemon ever survived, saturates past the cap within the
 * first few, and `Schedule.min` then hands back 30s forever. Measured in
 * production: the first reconnect after hours of healthy uptime cost 26–32s,
 * and every send and spawn aimed at this machine was refused with `machine <id>
 * is not connected` for the whole of it.
 *
 * {@link reconnecting} is what keeps this honest — it ends the series once a
 * connection has actually been healthy, so the next outage steps a schedule
 * that starts again at the knock.
 */
export const reconnect = Schedule.concat(
  Schedule.spaced(RESTART_KNOCK).pipe(Schedule.upTo({ times: RESTART_KNOCKS })),
  Schedule.min([
    Schedule.exponential(Duration.seconds(1)),
    Schedule.spaced(Duration.seconds(30)),
  ])
).pipe(Schedule.jittered);

/**
 * How long a connection must stand before losing it counts as a fresh outage
 * rather than another failure in a failing series.
 *
 * Ours, because: nothing in the protocol declares a connection healthy — there
 * is no register ack — so the only evidence available is that the socket stayed
 * open. 60s is two heartbeats (HEARTBEAT_INTERVAL is 15s) plus room for the
 * register's harness and tool probes, which spawn processes and take real time;
 * a hub that was going to reject or drop this daemon has done it well inside
 * that. Below it we are looking at a genuine flap — a hub that is crash-looping
 * or a network that will not hold — and backing off is the right answer. Above
 * it the previous series has nothing left to say about the next outage.
 *
 * Effect 4's `Schedule` has no `resetAfter`/`resetWhen` (they are 3.x only, and
 * the 3.x copies in node_modules belong to other packages), so the reset is the
 * loop in {@link reconnecting} rather than a schedule combinator.
 */
export const HEALTHY_CONNECTION = Duration.seconds(60);

/**
 * The one supervisor a daemon process ever runs, for {@link currentBusy} to
 * read — set the moment `startDaemon` constructs it, cleared on its release.
 * Same module-level-latch idiom as {@link latestDeploy}'s `latest`: a fact
 * that changes without anyone reconnecting, read by something in the same
 * process rather than carried over a socket to itself.
 */
let activeSupervisor: SessionSupervisor | undefined;

/**
 * How many sessions this daemon is carrying mid-turn, right now — `0` before
 * the supervisor exists (nothing has been asked yet, so nothing can be busy).
 * This is what lets the deploy poller (deploy.ts) hold a restart until idle
 * without asking the hub a question the daemon can answer about itself.
 */
export const currentBusy = (): number => activeSupervisor?.busyCount ?? 0;

/**
 * How many consecutive failures against the pinned URL, and how much wall
 * time they must span, before the daemon stops trusting that URL and re-runs
 * discovery instead of just retrying it — only for a daemon started with
 * `rediscover` (a hub `whiffle up` discovered). A hub the operator named
 * (`--hub`, `WHIFFLE_HUB_URL`) is retried forever and never swapped.
 *
 * Both ours, chosen together: 5 failures is inside one retry series (past the
 * point where a flap is still plausibly transient) but comfortably short of
 * the count a genuine multi-minute network blip would rack up on its own — and
 * {@link HEALTHY_CONNECTION} is what keeps a hub restart from ever reaching
 * either number, since a restart's reconnect ends the series (and resets the
 * failure count with it) the moment it goes healthy. 2 minutes is there so a
 * burst of near-instant failures (a hub that is up but refusing connections,
 * failing in milliseconds) still has to *last*, not just *count*, before the
 * daemon concludes the URL itself is gone rather than the hub being briefly
 * unwell at it.
 */
export const REDISCOVERY_FAILURE_COUNT = 5;
export const REDISCOVERY_FAILURE_WINDOW = Duration.minutes(2);

/**
 * Connect, and keep connecting — forever, and with a backoff that means it.
 *
 * `session` is handed a `markLive` it calls at the moment the connection is
 * genuinely up (for the daemon: socket open and the register sent). It never
 * succeeds; it fails when the connection goes away.
 *
 * Each pass through the outer loop builds its own `Effect.retry`, and therefore
 * its own schedule state. A failure that arrives before the connection was ever
 * live, or less than `healthyAfter` after it went live, stays inside that retry
 * and pays the growing backoff. A failure after a healthy stretch ENDS the
 * series by succeeding, and the loop re-enters with a schedule that starts over
 * at the knock.
 *
 * The loop deliberately contains nothing but the connection: the supervisor and
 * the scanner are built by the caller, outside it, and stay built across every
 * reconnect.
 *
 * `rediscover`, when given, adds a side channel that composes with the above
 * rather than replacing any of it: a failure counter and its first-failure
 * timestamp live for the life of one series (the same lifetime `Schedule`'s
 * own backoff state has), incrementing on every failure regardless of how the
 * backoff or the healthy-check settle it. Once the counter and the span both
 * cross the configured threshold, `onTrigger` is awaited — inline, before the
 * schedule's next attempt — and then the counter resets so the next window
 * starts clean. A series that ends by going healthy gets a fresh counter the
 * same way it gets a fresh schedule, because {@link reconnecting} builds a new
 * `series` value (and therefore a new closure) every time {@link
 * Effect.forever} re-enters it.
 */
export const reconnecting = <E extends { readonly reason: string }, R>(
  session: (markLive: () => void) => Effect.Effect<never, E, R>,
  options?: {
    readonly healthyAfter?: Duration.Duration;
    readonly schedule?: typeof reconnect;
    readonly now?: () => number;
    readonly rediscover?: {
      readonly failureCount?: number;
      readonly window?: Duration.Duration;
      readonly onTrigger: () => Effect.Effect<void>;
    };
  }
) => {
  const healthyAfter = Duration.toMillis(
    options?.healthyAfter ?? HEALTHY_CONNECTION
  );
  const now = options?.now ?? (() => Date.now());
  const rediscover = options?.rediscover;
  const failureThreshold =
    rediscover?.failureCount ?? REDISCOVERY_FAILURE_COUNT;
  const failureWindow = Duration.toMillis(
    rediscover?.window ?? REDISCOVERY_FAILURE_WINDOW
  );

  const buildSeries = () => {
    // Series-scoped, not attempt-scoped: unlike `liveAt` below, this must
    // survive across the retries `Effect.retry` runs within one series, so it
    // lives in this closure rather than inside the `Effect.suspend` thunk that
    // `Effect.retry` re-invokes on every attempt.
    let failures = 0;
    let firstFailureAt: number | undefined;
    // The last reason this series logged, and when. A hub restart fails the
    // knock about ten times inside half a second; one line per reason says
    // as much, and a reason repeated after a knock window has passed (a real
    // outage backing off) is logged again, as every attempt used to be.
    let said: { at: number; reason: string } | undefined;

    return Effect.suspend(() => {
      // Per-pass, and read only after the failure that ends the pass — nothing
      // else can observe it, so a plain binding is the whole of the state.
      let liveAt: number | undefined;
      return session(() => {
        liveAt = now();
      }).pipe(
        Effect.tapError((error) => {
          const at = now();
          if (
            said?.reason === error.reason &&
            at - said.at <= RESTART_WINDOW_MS
          ) {
            return Effect.void;
          }
          said = { at, reason: error.reason };
          return Effect.logWarning(`${error.reason} — reconnecting`);
        }),
        Effect.tapError(() => {
          if (!rediscover) {
            return Effect.void;
          }
          const at = now();
          failures += 1;
          firstFailureAt ??= at;
          if (
            failures < failureThreshold ||
            at - firstFailureAt < failureWindow
          ) {
            return Effect.void;
          }
          failures = 0;
          firstFailureAt = undefined;
          return rediscover.onTrigger();
        }),
        Effect.catch((error: E) =>
          liveAt !== undefined && now() - liveAt >= healthyAfter
            ? Effect.void
            : Effect.fail(error)
        )
      );
    }).pipe(Effect.retry(options?.schedule ?? reconnect));
  };
  return Effect.forever(Effect.suspend(buildSeries));
};

const closeReason = (event: CloseEvent): string =>
  event.reason || `close code ${event.code}`;

const send = (socket: WebSocket, envelope: Envelope): void => {
  socket.send(JSON.stringify(envelope));
};

/** Succeeds with an open socket; fails if the socket closes before opening. */
const open = (url: string) =>
  Effect.callback<WebSocket, ConnectionLost>((resume) => {
    const socket = new WebSocket(url);
    const onOpen = () => {
      socket.removeEventListener("close", onClose);
      resume(Effect.succeed(socket));
    };
    const onClose = (event: CloseEvent) => {
      socket.removeEventListener("open", onOpen);
      resume(
        Effect.fail(new ConnectionLost({ url, reason: closeReason(event) }))
      );
    };
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("close", onClose, { once: true });
    return Effect.sync(() => socket.close());
  });

const connection = (url: string) =>
  Effect.acquireRelease(open(url), (socket) =>
    Effect.sync(() => socket.close())
  );

/** Never succeeds — it fails when the hub goes away, which is what drives the retry. */
const closed = (socket: WebSocket, url: string) =>
  Effect.callback<never, ConnectionLost>((resume) => {
    // The state is read before the event is waited for, because between `open`
    // dropping its own close listener and this one going on, `attach` registers:
    // it probes every harness and every tool, which spawns processes and takes
    // real time. A hub that goes away inside that window fires `close` at nobody
    // — and a listener added afterwards waits for an event that has already
    // been and gone. That wait is silent and permanent: `send` on a dead socket
    // throws nothing, so the register is logged as if it landed, no
    // `ConnectionLost` is ever raised, and the retry below never gets its turn.
    // The daemon keeps its sessions and looks healthy while the hub stops
    // hearing from it altogether.
    if (
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      resume(
        Effect.fail(
          new ConnectionLost({ url, reason: "closed while registering" })
        )
      );
      return;
    }
    const onClose = (event: CloseEvent) =>
      resume(
        Effect.fail(new ConnectionLost({ url, reason: closeReason(event) }))
      );
    socket.addEventListener("close", onClose, { once: true });
    return Effect.sync(() => socket.removeEventListener("close", onClose));
  });

/**
 * A hub restore this daemon could take custody of instead of re-spawning.
 *
 * `adopt` is claude's alone (see `session.ts`'s `reattach`), and a spawn that
 * has to clone a repository or cut a worktree first is not a session that
 * already exists to be adopted — both go straight to the supervisor.
 */
export const adoptable = (
  payload: SpawnPayload | undefined
): payload is SpawnPayload =>
  payload !== undefined &&
  typeof payload.instanceId === "string" &&
  payload.instanceId.length > 0 &&
  typeof payload.cwd === "string" &&
  payload.cwd.length > 0 &&
  (payload.harness === undefined || payload.harness === "claude") &&
  payload.bootstrap === undefined &&
  payload.scratch === undefined;

/** That restore as `reattachFrom` wants it: where it runs, and its conversation. */
export const custodyRow = (
  payload: SpawnPayload
): { instanceId: string; cwd: string; sessionId: string | null } => ({
  instanceId: payload.instanceId,
  cwd: payload.cwd,
  sessionId: payload.resume?.sessionKey ?? null,
});

/**
 * What the register says about this machine's sessions: what sessiond is still
 * holding, and what each harness could resume.
 */
const readSessions = async () => {
  // Read before the catalog: listing OpenCode conversations may start a new
  // server, which must not be mistaken for one that survived this restart.
  const custody = await (async () => {
    try {
      const client = await SessiondClient.connect(
        process.env.WHIFFLE_SESSIOND_ENDPOINT ?? sessiondEndpoint()
      );
      try {
        const held = client.procs.filter((proc) => proc.alive);
        return {
          instances: held
            .filter((proc) => proc.procId !== OPENCODE_SERVER_PROC_ID)
            .map((proc) => proc.procId),
          opencode: held.some(
            (proc) => proc.procId === OPENCODE_SERVER_PROC_ID
          ),
        };
      } finally {
        client.close();
      }
    } catch (error) {
      Effect.runFork(
        Effect.logWarning(`session custody unavailable: ${String(error)}`)
      );
    }
  })();
  const catalog = await resumableSessions();
  return { custody, catalog };
};

/**
 * The sessions half of the register, read when an attempt starts rather than
 * after its socket opens, and shared by every attempt inside one knock window.
 *
 * The catalog is the slow part of a register: listing 757 claude conversations
 * took 315–380ms here, and the register cannot go out without it. Read after
 * the socket opened, it was the last thing keeping a healthy machine offline
 * after a hub restart (0.39–0.41s in restart runs against a local hub). Started
 * when the attempt starts, it runs while the hub is still booting. The knocks
 * after it reuse that one read instead of starting their own, so it is at most
 * one knock window (2s) old when a register carries it. The register used to
 * wait about that long on the harness probes after this same read, so it is no
 * staler than it was.
 */
const sessionsReader = () => {
  let latest: { at: number; read: ReturnType<typeof readSessions> } | undefined;
  return () => {
    const now = Date.now();
    if (!latest || now - latest.at > RESTART_WINDOW_MS) {
      latest = { at: now, read: readSessions() };
    }
    return latest.read;
  };
};

const attach = (
  scanner: UsageScanner,
  supervisor: SessionSupervisor,
  identity: MachineIdentity,
  url: string,
  sessions: () => ReturnType<typeof readSessions>,
  /**
   * Called once the socket is open and the register has gone out — the moment
   * this connection counts as up. {@link reconnecting} reads it to tell a
   * healthy connection that later died from one that never stood at all; a hub
   * that vanishes during the register's probes never marks it, and so is
   * correctly treated as a flap.
   */
  markLive: () => void = () => {
    // no-op: the caller only wants the promotion when it cares to observe it
  }
) =>
  Effect.gen(function* () {
    // Started before the socket, so it runs while the hub is still booting:
    // see {@link sessionsReader}.
    const reading = sessions();
    const socket = yield* connection(url);
    const { custody, catalog } = yield* Effect.promise(() => reading);
    const build = yield* Effect.promise(() => buildInfo());
    // Consumed, not just read: true only the first register after THIS
    // process came up because a deploy restarted it onto `build.commit`, and
    // never again for the life of this connection — see `restartAgentNow` /
    // `consumeRestartMarker` in update.ts for why a file beats a live send
    // here (the process that wrote the marker was about to die).
    const restarted = yield* Effect.promise(() =>
      build.commit
        ? consumeRestartMarker(deployRoot(), build.commit)
        : Promise.resolve(false)
    );
    const payload: RegisterPayload = {
      ...identity,
      instances: supervisor.instanceIds,
      previews: servingPreviews(),
      ...(custody ? { custody } : {}),
      ...(catalog
        ? {
            resumable: catalog.map((entry) => entry.sessionId),
            resumableAt: Object.fromEntries(
              catalog.map((entry) => [entry.sessionId, entry.lastModified])
            ),
          }
        : {}),
      build,
      ...(latestDeploy() ? { deploy: latestDeploy() } : {}),
      ...(restarted ? { restarted: true } : {}),
    };
    send(socket, { verb: "register", machineId: identity.machineId, payload });
    yield* Effect.logInfo(`registered with ${url}`);
    markLive();

    // What the machine can do goes out once its probes finish, on a beat of
    // its own, and not inside the register above. The probes spawn processes
    // (claude's starts a real Claude Code to ask for the account), and a
    // register that waited for them kept this machine out of the hub's
    // registry, and so reading offline, for most of the 2.7–3.2s the journal
    // showed between `Connection ended` and `registered with` on every hub
    // restart.
    supervisor.reannounce = () => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — reannounce doesn't await its own send
      void Promise.all([
        Promise.all(harnesses().map((adapter) => adapter.detect())),
        probeTools(),
      ]).then(([detected, tools]) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            ...(latestDeploy() ? { deploy: latestDeploy() } : {}),
            harnesses: detected,
            tools,
          } satisfies HeartbeatPayload,
        });
      });
    };
    supervisor.reannounce();

    // An envelope a harness builds itself (opencode's custody inspection
    // frame); hand-offs and spawns go through the hub's MCP, never this socket.
    supervisor.emit = (envelope) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      send(socket, {
        ...envelope,
        machineId: envelope.machineId || identity.machineId,
      });
    };

    supervisor.sink = (frame) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      // Usage and workflow-run transitions originate at the hub, never at a
      // daemon; machine-scoped control replies do travel through this sink,
      // without an instanceId.
      if (frame.kind === "usage" || frame.kind === "workflow") {
        return;
      }
      send(socket, {
        verb: "frames",
        machineId: identity.machineId,
        instanceId: frame.instanceId,
        requestId: "requestId" in frame ? frame.requestId : undefined,
        payload: frame,
      });
    };
    // A hub that restarted while a session sat on a permission ask has
    // forgotten the question; the callback is still parked here. Replay every
    // unresolved ask so the hub can re-park it — it re-notifies only what it
    // does not already know.
    //
    // AFTER THE SINK, NOT AFTER THE REGISTER. The replay goes out through
    // `supervisor.sink`, and until the assignment above that field still holds
    // the CLOSED socket of the connection that just died — on the first
    // connection, the no-op it is born with. Replaying any earlier therefore
    // sank every parked ask into nothing, which is how a session blocked on a
    // question outlived the hub that could have answered it: the daemon held
    // the callback, the hub had forgotten the request, and no dashboard could
    // see one to answer. The register is already on the wire above and the
    // socket preserves that order, so the hub still reads the register first.
    supervisor.replayOpenAsks();
    /**
     * CUSTODY OFF THE REGISTER ACK (design §7, step 4).
     *
     * A daemon that just restarted holds no sessions, so the hub's answer to
     * its register is: the ledger it has ingested of them (the ack), preceded
     * by a `spawn` for each session it thinks should be running again. Those
     * spawns are the ONLY place this process learns a surviving child's
     * directory and conversation — sessiond hands back procIds and ring heads,
     * never a cwd — so they are held here until the ack arrives rather than
     * dispatched straight into a fresh process.
     *
     * On the ack the supervisor is asked to attach to them instead: whatever
     * sessiond is still holding gets a `Query` on its existing pipe and ring,
     * and every spawn it did NOT attach to is dispatched exactly as it would
     * have been. So a machine with no sessiond children behaves precisely as it
     * did before this wiring, and one that has them keeps their processes.
     *
     * The window is this connection's first register ack and nothing else: an
     * operator's spawn, a delegate's, and every later `reannounce` ack go
     * straight through.
     */
    const heldSpawns: Envelope[] = [];
    let awaitingRegisterAck = true;

    const takeCustody = (ackPayload: unknown, spawns: Envelope[]): void => {
      const named = spawns.map((envelope) =>
        custodyRow(envelope.payload as SpawnPayload)
      );
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — takeCustody doesn't await its own reattach
      void supervisor
        // Whatever sessiond is still holding that the hub did NOT name is still
        // this machine's to carry. The hub decides what to restore from its own
        // rows, and a session it has written off - nothing to resume, so not
        // restorable - is exactly the one whose child is nonetheless alive and
        // pumping into a ring nobody reads. Asking the machine first is the rule
        // the board already follows: never serve stored liveness.
        .survivors()
        .catch(() => [] as Awaited<ReturnType<typeof supervisor.survivors>>)
        .then((surviving) => {
          const claimed = new Set(named.map((row) => row.instanceId));
          const rows = [
            ...named,
            ...surviving.filter((row) => !claimed.has(row.instanceId)),
          ];
          if (rows.length === 0) {
            return [] as string[];
          }
          return supervisor.reattachFrom(ackPayload, rows);
        })
        .catch((error: unknown) => {
          // Fresh restores may still spawn; custody-only requests must not turn
          // an unavailable sessiond into an unbounded spawn queue.
          Effect.runFork(
            Effect.logWarning(`reattach failed: ${String(error)}`)
          );
          return [] as string[];
        })
        .then((adopted) => {
          if (adopted.length > 0) {
            Effect.runFork(
              Effect.logInfo(
                `attached to ${adopted.length} surviving session(s): ${adopted.join(", ")}`
              )
            );
          }
          for (const envelope of spawns) {
            const spawn = envelope.payload as SpawnPayload;
            if (!(adopted.includes(spawn.instanceId) || spawn.reattachOnly)) {
              supervisor.dispatch(envelope);
            }
          }
        });
    };

    socket.addEventListener("message", (event) => {
      const envelope = JSON.parse(String(event.data)) as Envelope;
      if (awaitingRegisterAck) {
        if (envelope.verb === "register") {
          awaitingRegisterAck = false;
          const spawns = heldSpawns.splice(0);
          takeCustody(envelope.payload, spawns);
          return;
        }
        if (
          envelope.verb === "spawn" &&
          adoptable(envelope.payload as SpawnPayload | undefined)
        ) {
          heldSpawns.push(envelope);
          return;
        }
      }
      supervisor.dispatch(envelope);
    });

    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.sync(() =>
          send(socket, {
            verb: "heartbeat",
            machineId: identity.machineId,
            // `instances` rides every beat (not just register) so the hub can
            // reconcile session truth continuously — see HeartbeatPayload.
            // `deploy` rides it for the same reason: it is a live fact, and
            // `diverged` appearing between two registers must not wait for the
            // next one. Omitted entirely until a watcher has ticked.
            payload: {
              at: Date.now(),
              instances: supervisor.instanceIds,
              ...(latestDeploy() ? { deploy: latestDeploy() } : {}),
            } satisfies HeartbeatPayload,
          })
        ),
        Schedule.spaced(HEARTBEAT_INTERVAL)
      )
    );

    // Usage, cost & limits (USAGE-SPEC.md §5): scan the machine's transcripts
    // and opencode DB, then report absolute bucket totals with the live limit
    // windows. A scan failure must never kill the daemon — it hosts the user's
    // live sessions — so the whole tick is caught and logged.
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.gen(function* () {
          const rebuilt = scanner.dueForFullRebuild(USAGE_FULL_REBUILD_MS);
          yield* Effect.promise(() =>
            rebuilt ? scanner.fullRebuild() : scanner.incremental()
          );
          const buckets = scanner.reportBuckets(Date.now());
          // The poll is the fallback, not the source: it alone carries plan
          // tier, spend and the scoped windows, but the session stream has
          // already reported the session and weekly windows straight off the
          // response headers, for free. `mergeObserved` lays those over it.
          const limits = mergeObserved(
            yield* Effect.promise(() => fetchClaudeLimits())
          );
          send(socket, {
            verb: "usage",
            machineId: identity.machineId,
            payload: { buckets, limits },
          });
        }).pipe(
          Effect.catchDefect((error) =>
            Effect.logWarning(
              `usage scan failed: ${error instanceof Error ? error.message : String(error)}`
            )
          )
        ),
        Schedule.spaced(USAGE_INTERVAL)
      )
    );

    // No periodic auth re-probe. It cost far more than it was worth:
    // `probeAuth` starts a real `query()`, which is a Claude Code process that
    // reads the credentials and may refresh them. Refresh tokens rotate, so a
    // probe that refreshes invalidates the token every other process on this
    // machine is holding — measured: 38 live processes against 10 sessions,
    // with the credentials file rewritten seconds earlier, and sessions dying
    // of "OAuth session expired and could not be refreshed".
    //
    // Auth is read once at start. The authoritative signal was never this
    // probe anyway: a session that cannot answer says so in its own turn,
    // where it is unambiguous and costs nothing to learn.

    return yield* closed(socket, url);
  });

/**
 * Runs until interrupted: connect, register, heartbeat, reconnect on loss.
 *
 * `auth` is what the caller already found out — `whiffle up` probes before it
 * gets here, because it may still be able to fix it. A daemon started any other
 * way asks for itself.
 *
 * `rediscover` says whether the hub URL was discovered rather than named. Only
 * then may a sustained reconnect failure re-run discovery and repin; a named
 * hub is retried with the usual backoff forever.
 */
export const startDaemon = (auth?: AuthState, rediscover = false) =>
  Effect.gen(function* () {
    const url = process.env[WHIFFLE_ENV.hubUrl] ?? DEFAULT_HUB_URL;
    // Re-pinned by the rediscovery trigger below (discovered hubs only), read fresh by every attempt
    // `reconnecting` makes — see its own doc for why a plain closure variable
    // is enough: each attempt calls `session` anew, in the same tick that
    // reads this.
    let hubUrl = url;
    // The claude harness's auth is the machine's headline word — the original
    // rail still reads it — while `register` carries every harness's own.
    const claude = harnesses().find((adapter) => adapter.kind === "claude");
    const machineIdValue = yield* Effect.promise(() => machineId());
    // Child processes — the opencode server and its plugins most of all — read
    // the machine's identity and the hub off the environment they inherit.
    process.env[WHIFFLE_ENV.machineId] = machineIdValue;
    process.env[WHIFFLE_ENV.hubUrl] = url;
    // The sessions this daemon spawns carry the deny list in their own options;
    // the settings file is how the `claude` the user starts by hand gets it too.
    const denied = yield* Effect.promise(() => convergeDeniedTools());
    if (denied.state === "applied") {
      yield* Effect.logInfo(
        "converged fleet denied-tools into ~/.claude/settings.json"
      );
    } else if (denied.state === "failed") {
      yield* Effect.logWarning(denied.detail);
    }
    // Size the transcript cache from machine config (if set).
    const machineConfig = yield* Effect.promise(() => readConfig());
    if (machineConfig?.transcriptCacheMb) {
      transcriptCache.configureBudget(
        machineConfig.transcriptCacheMb * 1024 * 1024
      );
    }
    const identity: MachineIdentity = {
      machineId: machineIdValue,
      hostname: hostname(),
      os: `${platform()}-${arch()}`,
      auth:
        auth ??
        (yield* Effect.promise(() =>
          (claude
            ? claude.detect()
            : Promise.resolve({ auth: "unauthenticated" as AuthState })
          ).then((r) => r.auth)
        )),
    };
    if (identity.auth !== "authenticated") {
      yield* Effect.logWarning(
        `Claude Code credentials are ${identity.auth} on this machine`
      );
    }

    // Outlives any one connection: a hub restart must not kill running sessions.
    const supervisor = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const created = new SessionSupervisor();
        // See {@link currentBusy}: the deploy poller's in-process read of it.
        activeSupervisor = created;
        return created;
      }),
      (running) =>
        // Detached, not drained: the sessions outlive this daemon in sessiond,
        // and the next one reattaches to them. See `SessionSupervisor.detach`.
        Effect.logInfo(
          `detaching ${running.instanceIds.length} session(s)`
        ).pipe(
          Effect.andThen(
            Effect.sync(() => {
              running.detach();
              if (activeSupervisor === running) {
                activeSupervisor = undefined;
              }
            })
          )
        )
    );

    // The usage scanner outlives connections too: its dedup set is rebuilt only
    // on start (USAGE-SPEC.md §5.1), so a reconnect must not reset it.
    const scanner = yield* Effect.promise(() => UsageScanner.load());

    // Transcript search index: FTS5-backed BM25 search over transcripts.
    // Created once, syncs every 30s in the background, outlives reconnects.
    const search = yield* Effect.promise(() =>
      TranscriptSearchService.create()
    );
    search.start();
    supervisor.registerDaemonFunction(CONTROL_RUN_COMMAND, runWorkflowCommand);
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_CREATE,
      createWorkspace
    );
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_BOUNDARY,
      workspaceBoundary
    );
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_ARCHIVE,
      archiveWorkspace
    );
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_MIGRATE,
      convertWorktrees
    );
    supervisor.registerDaemonFunction(
      CONTROL_SEARCH_TRANSCRIPTS,
      (query, options) =>
        search.search(
          query as string,
          options as
            | {
                limit?: number;
                sessionId?: string;
                role?: "user" | "assistant";
              }
            | undefined
        )
    );

    yield* Effect.logInfo(
      `whiffle agent ${identity.machineId} connecting to ${url}`
    );
    const sessions = sessionsReader();
    // The connection — and only the connection — is what the loop re-enters.
    // The supervisor above it keeps its sessions and the scanner keeps its
    // dedup set across every reconnect; an interrupt still unwinds through this
    // to the supervisor's release, so a signalled daemon drains between turns.
    yield* reconnecting(
      (markLive) =>
        Effect.scoped(
          attach(scanner, supervisor, identity, hubUrl, sessions, markLive)
        ),
      rediscover
        ? {
            rediscover: {
              onTrigger: () =>
                Effect.promise(async () => {
                  const winner = await rediscoverHub({
                    log: (line) => Effect.runSync(Effect.logInfo(line)),
                  });
                  if (winner) {
                    hubUrl = toWsUrl(winner);
                  }
                }).pipe(
                  // A rediscovery attempt that throws (a probe rejecting oddly, a
                  // malformed tailscale JSON) must never take the reconnect loop
                  // down with it — worst case is the pinned URL simply stays put
                  // and the backoff series it was already running continues.
                  Effect.catchDefect((defect) =>
                    Effect.logWarning(`rediscovery failed: ${String(defect)}`)
                  )
                ),
            },
          }
        : undefined
    );
  }).pipe(Effect.scoped);

/**
 * Runs {@link startDaemon} until the process is signalled — how a daemon
 * normally ends, on a deliberate restart or a machine going down. Interrupting
 * the fiber runs the supervisor's drain first, so the sessions it owns stop
 * between turns instead of mid-tool. A second signal arrives with the handler
 * already gone, and kills the daemon the usual way.
 */
export const runDaemon = (auth?: AuthState, rediscover = false): void => {
  const daemon = Effect.runFork(startDaemon(auth, rediscover));
  const drain = (signal: NodeJS.Signals): void => {
    // bun-types' `NodeJS.Process` merge redeclares `off` for its own
    // `"memoryPressure"` event only, which shadows @types/node's generic
    // `EventEmitter.off(event: string | symbol, listener)` instead of
    // overloading it — so `process.off(signal, drain)` type-checks against
    // that one unrelated overload and never against a signal. Going through
    // `EventEmitter` directly reaches the generic signature `process.off`
    // itself no longer offers.
    (process as NodeJS.EventEmitter).off(signal, drain);
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the signal handler doesn't await its own exit
    void Effect.runPromise(Fiber.interrupt(daemon)).then(() => process.exit(0));
  };
  process.on("SIGINT", drain).on("SIGTERM", drain);
  process.on("unhandledRejection", (reason: unknown) => {
    Effect.runFork(
      Effect.logError(
        `[daemon] unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`
      )
    );
  });
  process.on("uncaughtException", (reason: Error) => {
    Effect.runFork(
      Effect.logError(
        `[daemon] uncaughtException: ${reason instanceof Error ? reason.stack : String(reason)}`
      )
    );
  });
};
