import { arch, hostname, platform } from "node:os";
import type {
  AuthState,
  BuildInfo,
  Envelope,
  HarnessReport,
  HeartbeatAckPayload,
  HeartbeatPayload,
  SessionCustody,
  SpawnPayload,
} from "@cawco/core";
import {
  ACKNOWLEDGE_BINARY_UPDATE,
  CANCEL_BINARY_UPDATE,
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CONFIGURE_BINARY_UPDATES,
  CONTROL_RUN_COMMAND,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_MIGRATE,
  UPDATE_CAWCO,
} from "@cawco/core";
import {
  AGENT_RESTARTING,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { fetchClaudeLimits } from "@cawco/core/usage/limits";
import { mergeObserved } from "@cawco/core/usage/observed";
import { fetchOpenCodeGoLimits } from "@cawco/core/usage/opencode-go";
import { Data, Duration, Effect, Fiber, Schedule } from "effect";
import {
  BinaryUpdater,
  latestBinaryUpdate,
  reportBinaryUpdate,
} from "./binary-update";
import { buildInfo } from "./build";
import { probeCapabilities } from "./capabilities";
import { convertWorktrees } from "./clone";
import { readConfig } from "./config";
import { convergeDeniedTools } from "./denied-tools";
import { rediscoverHub, toWsUrl } from "./discovery";
import { harnesses } from "./harnesses";
import type { PiHarness } from "./harnesses/pi";
import { PI_AUTH_CHECK_INTERVAL_MS } from "./harnesses/pi-auth";
import { cache as transcriptCache } from "./harnesses/transcript-cache";
import { machineId } from "./machine-id";
import { startMcpGateway } from "./mcp-oauth";
import { servingPreviews } from "./preview";
import { parseProcId, SESSION_PROC_KINDS } from "./proc-id";
import { fenced, setRestartSource } from "./restart";
import { TranscriptSearchService } from "./search";
import { resumableSessions, SessionSupervisor } from "./session";
import { SessiondClient } from "./sessiond-client";
import { probeTools } from "./tools";
import { UsageScanner } from "./usage/scanner";
import { abandonCommands, runWorkflowCommand } from "./workflow-command";
import {
  archiveWorkspace,
  createWorkspace,
  workspaceBoundary,
} from "./workspace";

const DEFAULT_HUB_URL = `ws://localhost:${CAWCO_HUB_PORT}/ws`;
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
  /** This machine's binary update state at register, as the updater last saw it. */
  binaryUpdate?: BinaryUpdateState;
  /**
   * The cawco this daemon is running (NEW.md §12), as it reported at register.
   */
  build?: BuildInfo;
  /** Custody is not attachment: these still need a handle before being listed live. */
  custody: SessionCustody;
  instances: string[];
  machineCapabilities: ReturnType<typeof probeCapabilities>;
  /**
   * The preview listeners this process is serving. A hub that restarted has
   * no targets and takes these as they are; one that only lost the socket
   * points its targets at them again.
   */
  previews: ReturnType<typeof servingPreviews>;
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
  sessionAddresses: import("@cawco/core").SessionAddress[];
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
 * How many consecutive failures against the pinned URL, and how much wall
 * time they must span, before the daemon stops trusting that URL and re-runs
 * discovery instead of just retrying it — only for a daemon started with
 * `rediscover` (a hub `cawco up` discovered). A hub the operator named
 * (`--hub`, `CAWCO_HUB_URL`) is retried forever and never swapped.
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
 * Claude and pi adopt sessiond-held processes (see `session.ts`'s `reattach`); a spawn that
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
  (payload.harness === undefined ||
    SESSION_PROC_KINDS.some((kind) => kind === payload.harness)) &&
  payload.bootstrap === undefined &&
  payload.scratch === undefined;

/** That restore as `reattachFrom` wants it: where it runs, and its conversation. */
export const custodyRow = (
  payload: SpawnPayload
): {
  instanceId: string;
  cwd: string;
  sessionId: string | null;
  sessionCredential?: string;
  processGeneration?: string;
  keepAliveTurn?: string;
  permissionMode?: SpawnPayload["permissionMode"];
} => ({
  instanceId: payload.instanceId,
  cwd: payload.cwd,
  sessionId: payload.resume?.sessionKey ?? null,
  processGeneration: payload.processGeneration,
  ...(payload.permissionMode ? { permissionMode: payload.permissionMode } : {}),
  ...(payload.keepAliveTurn ? { keepAliveTurn: payload.keepAliveTurn } : {}),
  ...(payload.sessionCredential
    ? { sessionCredential: payload.sessionCredential }
    : {}),
});

/**
 * What the register says about this machine's sessions: what sessiond is still
 * holding, and what each harness could resume.
 */
const readCustody = async (
  stopSequence = 0,
  pending: string[] = []
): Promise<SessionCustody> => {
  const readStartedAt = Date.now();
  try {
    const client = await SessiondClient.connect(
      process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
    );
    try {
      const held = client.procs.filter((proc) => proc.alive);
      return {
        state: "available",
        readStartedAt,
        stopSequence,
        pending,
        instances: held.flatMap((proc) => {
          const id = parseProcId(proc.procId);
          return id.kind === "claude" || id.kind === "pi"
            ? [id.instanceId]
            : [];
        }),
        opencode: held.some(
          (proc) => parseProcId(proc.procId).kind === "opencode-server"
        ),
      };
    } finally {
      client.close();
    }
  } catch (error) {
    Effect.runFork(
      Effect.logWarning(`session custody unavailable: ${String(error)}`)
    );
    return { state: "unavailable", error: String(error) };
  }
};

const readSessions = async () => {
  // Read before the catalog: listing OpenCode conversations may start a new
  // server, which must not be mistaken for one that survived this restart.
  const custody = await readCustody();
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
    supervisor.setHubContract(false);
    supervisor.resetStopSequence();
    process.env[CAWCO_ENV.hubUrl] = url;
    const { catalog } = yield* Effect.promise(() => reading);
    // Catalog reads may be cached across reconnects; process absence may not.
    const custody = yield* Effect.promise(() =>
      readCustody(supervisor.stopSequence, supervisor.custodyInstanceIds)
    );
    const build = yield* Effect.promise(() => buildInfo());
    const registerPayload = (
      snapshot: Awaited<ReturnType<typeof readSessions>>
    ): RegisterPayload => ({
      ...identity,
      sessionAddresses: supervisor.sessionAddresses,
      machineCapabilities: probeCapabilities(),
      instances: supervisor.instanceIds,
      previews: servingPreviews(),
      custody: snapshot.custody,
      ...(snapshot.catalog
        ? {
            resumable: snapshot.catalog.map((entry) => entry.sessionId),
            resumableAt: Object.fromEntries(
              snapshot.catalog.map((entry) => [
                entry.sessionId,
                entry.lastModified,
              ])
            ),
          }
        : {}),
      build,
      ...(latestBinaryUpdate() ? { binaryUpdate: latestBinaryUpdate() } : {}),
    });
    let payload = registerPayload({ custody, catalog });
    // NO BUSY ANSWER BEFORE CUSTODY HAS SAID. From the register until the
    // sessions this connection takes custody of have each said whether their
    // turn is running (`takeCustody` below), a busy question waits: before
    // then an empty busy set means nothing has been read yet, and a restarted
    // agent read `0` for 23 s while two sessions worked (2026-10-01). Let go
    // when custody is handed over, or when the connection ends without it.
    let custodyEpoch = supervisor.beginCustody(
      payload.custody.state === "available" ? payload.custody.instances : []
    );
    let recoveryController: AbortController | undefined;
    let registrationAttempt = 0;
    let registrationDeadline: ReturnType<typeof setTimeout>;
    const registrationExpired = () => {
      if (awaitingRegisterAck && socket.readyState === WebSocket.OPEN) {
        supervisor.failCustody(
          custodyEpoch,
          new Error(
            "Registration did not provide a custody decision within 120 seconds"
          )
        );
        registrationAttempt += 1;
        const backoff = Math.min(
          30_000,
          1000 * 2 ** Math.min(registrationAttempt - 1, 5)
        );
        registrationDeadline = setTimeout(async () => {
          if (awaitingRegisterAck && socket.readyState === WebSocket.OPEN) {
            payload = registerPayload(await readSessions());
            if (!awaitingRegisterAck || socket.readyState !== WebSocket.OPEN) {
              return;
            }
            custodyEpoch = supervisor.beginCustody(
              payload.custody.state === "available"
                ? payload.custody.instances
                : []
            );
            send(socket, {
              verb: "register",
              machineId: identity.machineId,
              payload,
            });
            registrationDeadline = setTimeout(registrationExpired, 120_000);
          }
        }, backoff);
      }
    };
    registrationDeadline = setTimeout(registrationExpired, 120_000);
    socket.addEventListener(
      "close",
      () => {
        supervisor.resetStopSequence();
        clearTimeout(registrationDeadline);
        recoveryController?.abort(new Error("Custody connection was lost."));
        supervisor.failCustody(
          custodyEpoch,
          new Error(
            "Registration connection was lost; custody must be recovered after reconnect"
          )
        );
      },
      { once: true }
    );
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
    let reportedHarnesses: HarnessReport[] = [];
    let lastPiCheck = Date.now();
    const pi = harnesses().find((adapter) => adapter.kind === "pi") as
      | PiHarness
      | undefined;
    supervisor.reannounce = () => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — reannounce doesn't await its own send
      void Promise.all([
        Promise.all(harnesses().map((adapter) => adapter.detect())),
        probeTools(),
      ]).then(([detected, tools]) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }
        reportedHarnesses = detected;
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            ...(latestBinaryUpdate()
              ? { binaryUpdate: latestBinaryUpdate() }
              : {}),
            harnesses: detected,
            tools,
          } satisfies HeartbeatPayload,
        });
      });
    };
    supervisor.reannounce();

    // This probe counts tokens through pi's proxy; it never starts a Claude SDK
    // query or rotates Claude Code's own login. The initial detect already ran it.
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(async () => {
          if (!pi || Date.now() - lastPiCheck < PI_AUTH_CHECK_INTERVAL_MS) {
            return;
          }
          lastPiCheck = Date.now();
          const report = await pi.detect();
          reportedHarnesses = reportedHarnesses.map((one) =>
            one.harness === "pi" ? report : one
          );
          if (socket.readyState === WebSocket.OPEN) {
            send(socket, {
              verb: "heartbeat",
              machineId: identity.machineId,
              payload: {
                at: Date.now(),
                instances: supervisor.instanceIds,
                harnesses: reportedHarnesses,
              } satisfies HeartbeatPayload,
            });
          }
        }),
        Schedule.spaced(Duration.millis(PI_AUTH_CHECK_INTERVAL_MS))
      )
    );

    // A spawn also checks sign-in. Publish a changed default-provider result on
    // the next heartbeat while preserving the other harnesses' reports.
    const changedPiAuth = (): HarnessReport[] | undefined => {
      const old = reportedHarnesses.find((report) => report.harness === "pi");
      if (
        !(pi && old) ||
        (old.auth === pi.auth && old.authReason === pi.authReason)
      ) {
        return undefined;
      }
      reportedHarnesses = reportedHarnesses.map((report) => {
        if (report.harness !== "pi") {
          return report;
        }
        const { authReason: _oldReason, ...rest } = report;
        return {
          ...rest,
          auth: pi.auth,
          ...(pi.authReason ? { authReason: pi.authReason } : {}),
        };
      });
      return reportedHarnesses;
    };

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
      if (
        frame.kind === "usage" ||
        frame.kind === "workflow" ||
        frame.kind === "fleet_mcp"
      ) {
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
    supervisor.replaySessionAddresses();
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
    /**
     * WHAT IS SENT TO A SESSION WHILE ITS CUSTODY IS TAKEN WAITS FOR IT.
     *
     * A held spawn names a session this daemon is about to attach to or start,
     * and until that settles the supervisor holds nothing under its id. A send
     * the hub routed meanwhile (a delegate's report to its parent, an
     * operator's message) failed `no session` and was dropped, though the
     * session was attached seconds later: 19:48:13 send failed, 19:48:29
     * attached. So every envelope for a held session waits here, in order, and
     * goes to the supervisor after the attach or the spawn it was waiting on.
     */
    const custodyIds = new Set<string>();
    const custodyWaiting: Envelope[] = [];
    /**
     * The restores the hub sent ahead of its ack that go straight to the
     * supervisor rather than wait here: a held opencode session's reattach,
     * which asks its server whether its turn is running before it is handed
     * back. Busy answers wait for them as they wait for claude's.
     */
    const reattaching: Envelope[] = [];
    supervisor.registerDaemonFunction("sessionCustody", async () => ({
      custody: await readCustody(supervisor.stopSequence, [
        ...supervisor.custodyInstanceIds,
        ...custodyIds,
      ]),
      attached: supervisor.instanceIds,
    }));
    supervisor.registerDaemonFunction(
      "removedSessionCustody",
      (rows, claimed) =>
        supervisor.removedSessionCustody(
          rows as { id: string; sessionId: string | null; cwd: string }[],
          claimed as string[]
        )
    );

    const takeCustody = (ackPayload: unknown, spawns: Envelope[]): void => {
      clearTimeout(registrationDeadline);
      const named = spawns.map((envelope) =>
        custodyRow(envelope.payload as SpawnPayload)
      );
      const otherRecoveries = reattaching
        .splice(0)
        .map((envelope) => supervisor.dispatch(envelope));
      const recoverAttempt = async (signal: AbortSignal) => {
        const { attached, failed } = await supervisor.reattachFrom(
          ackPayload,
          named,
          signal
        );
        signal.throwIfAborted();
        await Promise.all(otherRecoveries);
        signal.throwIfAborted();
        const outcomes = spawns.flatMap((envelope) => {
          const spawn = envelope.payload as SpawnPayload;
          return attached.includes(spawn.instanceId) ||
            failed.has(spawn.instanceId) ||
            spawn.reattachOnly
            ? []
            : [supervisor.dispatch(envelope)];
        });
        await Promise.all(outcomes);
        signal.throwIfAborted();
        // Wait for explicit stops sent behind the ack before taking the listing.
        await Promise.all(
          custodyWaiting
            .splice(0)
            .map((envelope) => supervisor.dispatch(envelope))
        );
        const freshCustody = await readCustody(supervisor.stopSequence, [
          ...supervisor.custodyInstanceIds,
          ...custodyIds,
        ]);
        signal.throwIfAborted();
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            custody: freshCustody,
            custodyComplete: true,
          } satisfies HeartbeatPayload,
        });
        return attached;
      };
      const custodyRecovered = (epoch: number, adopted: string[]) => {
        if (adopted.length > 0) {
          Effect.runFork(
            Effect.logInfo(
              `attached to ${adopted.length} surviving session(s): ${adopted.join(", ")}`
            )
          );
        }
        supervisor.completeCustody(epoch);
        custodyIds.clear();
        for (const envelope of custodyWaiting.splice(0)) {
          supervisor.dispatch(envelope);
        }
      };
      // biome-ignore lint/complexity/noVoid: each bounded attempt publishes readiness; no control reply waits for recovery.
      void (async () => {
        let attempt = 0;
        while (socket.readyState === WebSocket.OPEN) {
          custodyEpoch = supervisor.beginCustody(
            named.map((row) => row.instanceId)
          );
          const epoch = custodyEpoch;
          recoveryController = new AbortController();
          const controller = recoveryController;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            // biome-ignore lint/performance/noAwaitInLoops: recovery attempts are serialized and back off; overlapping attempts may not publish readiness.
            const adopted = await Promise.race([
              recoverAttempt(controller.signal),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  const problem = new Error(
                    "Machine custody recovery did not complete within 120 seconds"
                  );
                  controller.abort(problem);
                  reject(problem);
                }, 120_000);
              }),
            ]);
            if (socket.readyState !== WebSocket.OPEN) {
              return;
            }
            custodyRecovered(epoch, adopted);
            return;
          } catch (problem) {
            controller.abort(problem);
            supervisor.failCustody(epoch, problem);
          } finally {
            clearTimeout(timer);
          }
          attempt += 1;
          await Bun.sleep(
            Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5))
          );
        }
      })();
    };

    /** What arrives ahead of the register ack: custody, taken on the ack. Whether it was taken. */
    const beforeAck = (envelope: Envelope): boolean => {
      if (envelope.verb === "register") {
        supervisor.declareHubContract(
          (envelope.payload as { addressContract?: unknown })
            .addressContract === true
        );
        awaitingRegisterAck = false;
        const spawns = heldSpawns.splice(0);
        takeCustody(envelope.payload, spawns);
        return true;
      }
      if (envelope.verb !== "spawn") {
        return false;
      }
      const spawn = envelope.payload as SpawnPayload | undefined;
      const reattachOnly = spawn?.reattachOnly;
      const opencodeSpawn = spawn?.harness === "opencode";
      const instanceId = spawn?.instanceId;
      if (adoptable(spawn)) {
        heldSpawns.push(envelope);
        custodyIds.add(spawn.instanceId);
        return true;
      }
      if (reattachOnly || opencodeSpawn) {
        reattaching.push(envelope);
        if (instanceId) {
          custodyIds.add(instanceId);
        }
        return true;
      }
      return false;
    };

    socket.addEventListener("message", (event) => {
      const envelope = JSON.parse(String(event.data)) as Envelope;
      if (envelope.verb === "stop") {
        const stop = envelope.payload as import("@cawco/core").StopPayload;
        Effect.runFork(
          Effect.logInfo(
            `[agent] stop session=${stop.instanceId} request=${stop.requestId ?? "none"} machine=${identity.machineId} outcome=received elapsedMs=0`
          )
        );
        supervisor.receivedStop(
          (envelope.payload as import("@cawco/core").StopPayload)
            .stopSequence ?? 0
        );
      }
      if (
        envelope.verb === "control" &&
        (envelope.payload as import("@cawco/core").ControlPayload).method ===
          "acknowledgeSessionAddress"
      ) {
        supervisor.dispatch(envelope);
        return;
      }
      if (awaitingRegisterAck && beforeAck(envelope)) {
        return;
      }
      // The hub's answer to a beat: the sessions it keeps awake.
      if (envelope.verb === "heartbeat") {
        supervisor.keepAwake(
          (envelope.payload as Partial<HeartbeatAckPayload> | undefined)
            ?.keepAwake
        );
        return;
      }
      if (envelope.instanceId && custodyIds.has(envelope.instanceId)) {
        // A resume behind the ACK must join adoption too: the candidate read
        // yields before #adopting claims rows, so dispatching it here can
        // replace the very sessiond child this connection is taking over.
        custodyWaiting.push(envelope);
        return;
      }
      supervisor.dispatch(envelope);
    });

    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(async () =>
          send(socket, {
            verb: "heartbeat",
            machineId: identity.machineId,
            // `instances` rides every beat (not just register) so the hub can
            // reconcile session truth continuously — see HeartbeatPayload.
            // `binaryUpdate` rides it for the same reason: it is a live fact
            // that changes without anybody reconnecting.
            payload: {
              at: Date.now(),
              sessionAddresses: supervisor.sessionAddresses,
              instances: supervisor.instanceIds,
              custody: await readCustody(supervisor.stopSequence, [
                ...supervisor.custodyInstanceIds,
                ...custodyIds,
              ]),
              ...(changedPiAuth() ? { harnesses: reportedHarnesses } : {}),
              ...(latestBinaryUpdate()
                ? { binaryUpdate: latestBinaryUpdate() }
                : {}),
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
          // The OpenCode Go plan's windows, when this machine holds a Go key.
          const openCodeGo = yield* Effect.promise(() =>
            fetchOpenCodeGoLimits()
          );
          send(socket, {
            verb: "usage",
            machineId: identity.machineId,
            payload: { buckets, limits, openCodeGo },
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

    // No periodic Claude Code auth re-probe. It cost far more than it was worth:
    // `probeAuth` starts a real `query()`, which is a Claude Code process that
    // reads the credentials and may refresh them. Refresh tokens rotate, so a
    // probe that refreshes invalidates the token every other process on this
    // machine is holding — measured: 38 live processes against 10 sessions,
    // with the credentials file rewritten seconds earlier, and sessions dying
    // of "OAuth session expired and could not be refreshed".
    //
    // Claude Code auth is read once at start. The authoritative signal was never this
    // probe anyway: a session that cannot answer says so in its own turn,
    // where it is unambiguous and costs nothing to learn.

    // A command the hub ran over this connection answers nobody once it ends,
    // and the hub runs its checks again from the first when it is back: the
    // commands go with the connection. Sessions are not commands and stay.
    return yield* closed(socket, url).pipe(
      Effect.tapError(() => Effect.sync(abandonCommands))
    );
  });

/**
 * Runs until interrupted: connect, register, heartbeat, reconnect on loss.
 *
 * `auth` is what the caller already found out — `cawco up` probes before it
 * gets here, because it may still be able to fix it. A daemon started any other
 * way asks for itself.
 *
 * `rediscover` says whether the hub URL was discovered rather than named. Only
 * then may a sustained reconnect failure re-run discovery and repin; a named
 * hub is retried with the usual backoff forever.
 */
export const startDaemon = (auth?: AuthState, rediscover = false) =>
  Effect.gen(function* () {
    const url = process.env[CAWCO_ENV.hubUrl] ?? DEFAULT_HUB_URL;
    // Re-pinned by the rediscovery trigger below (discovered hubs only), read fresh by every attempt
    // `reconnecting` makes — see its own doc for why a plain closure variable
    // is enough: each attempt calls `session` anew, in the same tick that
    // reads this.
    let hubUrl = url;
    yield* Effect.acquireRelease(
      Effect.sync(() => startMcpGateway(() => hubUrl)),
      (listener) => Effect.sync(() => listener.stop(true))
    );
    // The claude harness's auth is the machine's headline word — the original
    // rail still reads it — while `register` carries every harness's own.
    const claude = harnesses().find((adapter) => adapter.kind === "claude");
    const machineIdValue = yield* Effect.promise(() => machineId());
    // Child processes — the opencode server and its plugins most of all — read
    // the machine's identity and the hub off the environment they inherit.
    process.env[CAWCO_ENV.machineId] = machineIdValue;
    process.env[CAWCO_ENV.hubUrl] = url;
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
        // What a restart would cut is the supervisor's to say from here on
        // (`restart.ts`); the updater and `cawco service restart` read it.
        setRestartSource(() => created.restartHolds());
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
              setRestartSource(undefined);
            })
          )
        )
    );

    // The usage scanner outlives connections too: its dedup set is rebuilt only
    // on start (USAGE-SPEC.md §5.1), so a reconnect must not reset it.
    const scanner = yield* Effect.promise(() => UsageScanner.load());
    supervisor.registerDaemonFunction("probeCapabilities", probeCapabilities);

    // Updates arrive only as signed builds from the hub: this one object owns
    // the update tick, the "Install now" command and the policy the hub pushes.
    const updater = new BinaryUpdater(reportBinaryUpdate);
    supervisor.registerDaemonFunction(UPDATE_CAWCO, () => updater.installNow());
    supervisor.registerDaemonFunction(CONFIGURE_BINARY_UPDATES, () =>
      updater.configure()
    );
    supervisor.registerDaemonFunction(CANCEL_BINARY_UPDATE, () =>
      updater.cancel()
    );
    supervisor.registerDaemonFunction(ACKNOWLEDGE_BINARY_UPDATE, (at) =>
      updater.acknowledge(at)
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => updater.stop()));
    yield* Effect.forkScoped(Effect.promise(() => updater.start()));

    // Transcript search index: FTS5-backed BM25 search over transcripts.
    // Created once, syncs every 30s in the background, outlives reconnects.
    const search = yield* Effect.promise(() =>
      TranscriptSearchService.create()
    );
    search.start();
    // A command runs as this process's child, so a restart kills it: none starts behind a raised fence.
    supervisor.registerDaemonFunction(
      CONTROL_RUN_COMMAND,
      (cwd, cmd, timeoutMs, workspace) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : runWorkflowCommand(cwd, cmd, timeoutMs, workspace)
    );
    // A workspace is cut in this process, so a restart would cut it too: none starts behind a raised fence.
    supervisor.registerDaemonFunction(CONTROL_WORKSPACE_CREATE, (cwd, id) =>
      fenced()
        ? Promise.reject(new Error(AGENT_RESTARTING))
        : createWorkspace(cwd, id)
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
      `cawco agent ${identity.machineId} connecting to ${url}`
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
  const daemon = Effect.runFork(
    startDaemon(auth, rediscover).pipe(
      Effect.catchDefect((error) =>
        Effect.logError(
          `[daemon] ${error instanceof Error ? error.message : String(error)}`
        ).pipe(
          Effect.andThen(
            Effect.sync(() => {
              process.exitCode = 1;
            })
          )
        )
      )
    )
  );
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
