import { existsSync, watch } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { arch, homedir, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import type {
  AccountIdentity,
  AdmissionPayload,
  AuthState,
  BuildInfo,
  Envelope,
  HarnessKind,
  HeartbeatAckPayload,
  HeartbeatPayload,
  LaunchAsk,
  LaunchGrant,
  LentAccess,
  MachineHarnessReport,
  MachineProviderLists,
  RegisterAckPayload,
  SessionCustody,
  SpawnPayload,
} from "@cawco/core";
import {
  CANCEL_BINARY_UPDATE,
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CONFIGURE_BINARY_UPDATES,
  CONTROL_ACCOUNT_LENT,
  CONTROL_BEGIN_PROVIDER_LOGIN,
  CONTROL_BORROW_ACCOUNT,
  CONTROL_CANCEL_COMMAND,
  CONTROL_COMPLETE_PROVIDER_LOGIN,
  CONTROL_FORGET_PROVIDER_ACCOUNT,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_JOIN_PROVIDER_ACCOUNT,
  CONTROL_LEND_ACCOUNT,
  CONTROL_MOVE_CANCEL,
  CONTROL_MOVE_CLONE,
  CONTROL_MOVE_HOME_CREDENTIAL,
  CONTROL_MOVE_INSPECT,
  CONTROL_MOVE_INSTALL,
  CONTROL_MOVE_LFS,
  CONTROL_MOVE_PREPARE,
  CONTROL_MOVE_REMOTE_CREDENTIAL,
  CONTROL_MOVE_SNAPSHOT,
  CONTROL_PLACE_PUSH,
  CONTROL_PLACE_REPO,
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_RUN_COMMAND,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_PROVIDER_KEY,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_MIGRATE,
  invariant,
  lawPolicy,
  type TranscriptQuery,
  UPDATE_CAWCO,
  type WorkspaceRef,
} from "@cawco/core";
import { readInstallation } from "@cawco/core/binary-installation";
import {
  AGENT_RESTARTING,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  CUSTODY_BOUND_MS,
  type HandoverCommand,
  type HandoverEvent,
  type HandoverState,
  step as handoverStep,
  initialHandover,
  type KeeperWord,
  REGISTER_ACK_MS,
} from "@cawco/core/handover";
import { machineEndpoint } from "@cawco/core/keepers";
import { machineId } from "@cawco/core/machine-id";
import {
  machineKeyPath,
  readMachineKey,
  socketProof,
  writeMachineKey,
} from "@cawco/core/machine-key";
import { userLayerPath } from "@cawco/core/paths";
import {
  type ServeSpec,
  type SheetWrite,
  STAGE_COMPONENTS,
  STAGE_ENSURE,
  STAGE_SERVE,
  STAGE_UNSERVE,
  STAGE_WRITE,
} from "@cawco/core/stage";
import { writeStateFile } from "@cawco/core/state-file";
import { fetchOpenCodeGoLimits } from "@cawco/core/usage/opencode-go";
import { announcingParts, clientLine } from "@cawco/core/wire";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Data, Duration, Effect, Fiber, Schedule } from "effect";
import { accountStoreIds, forgetUnknownAccounts } from "./account-sweep";
import { accountReports, claudeAuthNote, claudeSignins } from "./accounts";
import { unlockKeychain } from "./auth";
import {
  BinaryUpdater,
  latestBinaryUpdate,
  reportBinaryUpdate,
} from "./binary-update";
import {
  checkBoundaryHost,
  liveWorkItems,
  rearmHooks,
  takeUpstreamRules,
  watchQuietBoundaries,
} from "./boundary";
import { buildInfo } from "./build";
import { probeCapabilities } from "./capabilities";
import { convertWorktrees } from "./clone";
import { readConfig, writeConfig } from "./config";
import { convergeDeniedTools } from "./denied-tools";
import { rediscoverHub, toWsUrl } from "./discovery";
import type { Harness } from "./harness";
import { harness, harnesses } from "./harnesses";
import { removeCawcoSessionConfigs } from "./harnesses/opencode";
import { PI_AUTH_CHECK_INTERVAL_MS } from "./harnesses/pi-auth";
import { cache as transcriptCache } from "./harnesses/transcript-cache";
import { serveHubCredential } from "./hub-git";
import { recordJoinedHub, setConnectedHub } from "./hub-proof";
import { readInputs, writeInputs } from "./inputs";
import { KeeperWatchdog } from "./keeper-watchdog";
import { type HeldProc, type KeeperReading, withKeepers } from "./keepers";
import { endOrphanedSignIns, endSignIns } from "./login";
import { isMachineAgent } from "./machine-agent";
import { setAccountFreshener, startMcpGateway } from "./mcp-oauth";
import { MEMORY_LOG_INTERVAL_MS, memoryLine } from "./memory";
import {
  moveCancel,
  moveClone,
  moveInspect,
  moveInstall,
  moveLfs,
  movePrepare,
  moveRemoteCredential,
  moveSnapshot,
  setHubCredential,
  setMoveProgress,
} from "./move";
import { placePush } from "./place-push";
import { placeRepo } from "./place-repo";
import { servingPreviews } from "./preview";
import { probesStarted } from "./probe-count";
import { parseProcId, procIdFor, SESSION_PROC_KINDS } from "./proc-id";
import {
  accountLent,
  beginProviderLogin,
  borrowAccount,
  completeProviderLogin,
  dropOpencodeMarkers,
  endProviderSignIns,
  forgetProviderAccount,
  freshen,
  freshenAll,
  homeStoresStamp,
  joinProviderAccount,
  lendAccount,
  moveHomeCredential,
  piProviders,
  providerAccountReports,
  readHomeCredentials,
  setBorrowAsk,
  setProviderKey,
} from "./provider-accounts";
import {
  machineGoKey,
  readDueProviderAccounts,
  setProviderReadingSink,
} from "./provider-usage";
import { outbound, redactConsole } from "./redaction";
import { fenced, setRestartSource } from "./restart";
import { TranscriptSearchService } from "./search";
import { resumableSessions, SessionSupervisor } from "./session";
import { serviceManaged, setSessionLimits } from "./sessiond-client";
import {
  ensureServed,
  ensureStage,
  StageRefusal,
  setStageSink,
  stageComponents,
  stopServed,
  stopStages,
  writeSheet,
} from "./stage";

/** The hub's upstream rules, written into each workspace here; a failure is said in the log, never thrown at the socket. */
const takeUpstream = (
  rules: import("@cawco/core/upstream-guard").UpstreamRules | undefined
): void => {
  takeUpstreamRules(rules).catch((error: unknown) => {
    console.warn(
      `[workspace] the hub's upstream rules could not be written: ${error instanceof Error ? error.message : String(error)}`
    );
  });
};

/** The hub's session limits, said to every keeper, which starts each child under them from here; said in the log once each time they change. */
const takeSessionLimits = (
  limits: import("@cawco/core").SessionLimits | undefined
): void => {
  if (!setSessionLimits(limits)) {
    return;
  }
  const said = [
    limits?.memoryPercent === undefined
      ? "memory unlimited"
      : `memory ${limits.memoryPercent}% of this machine's RAM`,
    limits?.cpuPercent === undefined
      ? "CPU unlimited"
      : `CPU ${limits.cpuPercent}% of its cores`,
  ].join(", ");
  console.info(
    `[sessiond] session limits from the hub: ${said}, for each process started from now`
  );
};

import { damagedRecords, sweepRecords } from "./damaged-records";
import { onToolsMoved, probeTools } from "./tools";
import { UsageScanner } from "./usage/scanner";
import {
  abandonCommands,
  cancelCommand,
  runWorkflowCommand,
  setCommandQueue,
} from "./workflow-command";
import {
  archiveWorkspace,
  createWorkspace,
  discardWorkspace,
  workspaceAt,
  workspaceBoundary,
  workspaceBundle,
} from "./workspace";
import { workspaceRefs } from "./workspace-records";

const DEFAULT_HUB_URL = `ws://localhost:${CAWCO_HUB_PORT}/ws`;
const HEARTBEAT_INTERVAL = Duration.seconds(15);
/**
 * How long after a heartbeat the hub's link may stay silent before it is
 * dropped as dead (the hub answers every beat). Our choice: a whole beat's
 * interval, so a hub that is slow under load is not taken for gone.
 */
const HUB_SILENT_MS = 15_000;
const USAGE_INTERVAL = Duration.seconds(60);
const MEMORY_LOG_INTERVAL = Duration.millis(MEMORY_LOG_INTERVAL_MS);
/** How often every CawCo account dir's `auth status` is read again. */
const CLAUDE_LOGIN_CHECK_INTERVAL_MS = 60_000;
/** How often every provider account's OAuth sign-in is checked for a refresh it needs. */
const ACCOUNT_REFRESH_INTERVAL = Duration.seconds(60);

/**
 * The launches this agent has asked its hub what to run on ({@link
 * LaunchGrant}), until each is answered. They outlive a connection: one asked
 * while the hub is away, or whose answer went with a dropped connection, is
 * asked again on the next connection once it has registered. One not
 * answered within {@link CUSTODY_BOUND_MS} of its first ask keeps waiting,
 * and says so once: the hub answers every grant, a refusal with its reason.
 */
class LaunchAsks {
  readonly #machineId: string;
  readonly #pending = new Map<
    string,
    { envelope: Envelope<LaunchAsk>; settle: (grant: LaunchGrant) => void }
  >();
  #send: ((envelope: Envelope) => void) | undefined;

  constructor(machine: string) {
    this.#machineId = machine;
  }

  ask(payload: SpawnPayload): Promise<LaunchGrant> {
    const { instanceId, processGeneration } = payload;
    if (!processGeneration) {
      return Promise.resolve({
        refusal: "The hub sent this launch no process generation.",
      });
    }
    const requestId = crypto.randomUUID();
    const envelope: Envelope<LaunchAsk> = {
      verb: "launch",
      machineId: this.#machineId,
      instanceId,
      requestId,
      payload: { processGeneration },
    };
    const granted = new Promise<LaunchGrant>((resolve) => {
      const settle = (grant: LaunchGrant) => {
        this.#pending.delete(requestId);
        resolve(grant);
      };
      this.#pending.set(requestId, { envelope, settle });
      this.#send?.(envelope);
    });
    return this.#awaitGrant(instanceId, granted);
  }

  /**
   * The hub's grant for a launch, however long it takes: the hub answers
   * every grant, a refusal with its reason (987bb9cc0), so a launch it has
   * not answered within {@link CUSTODY_BOUND_MS} keeps waiting, said once,
   * never refused for the wait.
   */
  async #awaitGrant(
    instanceId: string,
    granted: Promise<LaunchGrant>
  ): Promise<LaunchGrant> {
    const first = await readWithin(CUSTODY_BOUND_MS, () => granted);
    switch (first.kind) {
      case "answered":
        return first.value;
      case "unanswered":
        console.info(
          `[agent] ${instanceId}: the hub did not answer for this launch's credential within ${CUSTODY_BOUND_MS / 1000} s; still waiting for the hub's credential`
        );
        return granted;
      default: {
        const unhandled: never = first;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /** A connection registered: every ask not yet answered goes on it, and every one after. */
  connected(carry: (envelope: Envelope) => void): void {
    this.#send = carry;
    for (const { envelope } of this.#pending.values()) {
      carry(envelope);
    }
  }

  /** That connection ended: what is asked from here waits for the next. */
  disconnected(carry: (envelope: Envelope) => void): void {
    if (this.#send === carry) {
      this.#send = undefined;
    }
  }

  /** The hub's answer to an ask, settled; whether `envelope` was one. */
  answer(envelope: Envelope): boolean {
    if (envelope.verb !== "launch") {
      return false;
    }
    const pending = envelope.requestId
      ? this.#pending.get(envelope.requestId)
      : undefined;
    pending?.settle(envelope.payload as LaunchGrant);
    return true;
  }
}

/** The words of an error a log line says, its name when it carries no message. */
const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error);

/** A keeper's reading as one harness's custody reads it: the sessions whose children of that harness it holds alive. */
const custodyWord = (
  kind: (typeof SESSION_PROC_KINDS)[number],
  reading: KeeperReading
): KeeperWord =>
  reading.kind === "listed"
    ? {
        kind: "listed",
        alive: reading.procs.flatMap((proc) => {
          const id = parseProcId(proc.procId);
          return proc.alive && id.kind === kind ? [id.instanceId] : [];
        }),
      }
    : reading;

/** OpenCode, told the machine's provider accounts changed, when it takes such a change. */
const tellOpencodeAccountsChanged = (): void => {
  harness("opencode")
    ?.accountsChanged?.()
    .catch((error: unknown) =>
      console.warn(
        `[accounts] OpenCode did not take the accounts' change: ${errorWords(error)}`
      )
    );
};

/**
 * Called whenever this machine's provider accounts changed; the connection
 * fills it in, so the hub hears it and OpenCode takes it.
 */
let providerAccountsChanged: () => void = tellOpencodeAccountsChanged;

/**
 * The providers an account can be for here, as each harness lists them,
 * each read on its own ({@link readPart}): one that could not be read is
 * left out and named in the log, and the hub keeps its last list. Read
 * together, OpenCode's server not answering (a machine whose agent does not
 * own it) left pi's providers out of every beat too.
 */
const machineProviders = async (): Promise<
  MachineProviderLists | undefined
> => {
  const [pi, opencode] = await Promise.all([
    readPart("pi's providers", piProviders),
    readPart(
      "OpenCode's providers",
      async () => (await harness("opencode")?.providerList?.()) ?? []
    ),
  ]);
  if (!(pi || opencode)) {
    return undefined;
  }
  return { ...(pi ? { pi } : {}), ...(opencode ? { opencode } : {}) };
};

/**
 * How long one part of the machine's report may take before it is given up
 * for this beat. Longer than the slowest read that answers (a Claude
 * account's probe waits up to 60 s for initialize, accounts.ts); a part
 * past it is a read that will not answer, which held the whole first report
 * back and so the machine's sign-ins with it.
 */
const PART_MS = 90_000;

/**
 * One part of what the machine reports, read on its own: what it read, or
 * undefined when it was not read (no answer in {@link PART_MS}, or a failure),
 * said once under the part's name. Undefined is never sent as an empty part:
 * the part is left out, the hub keeps its last copy, and it is read again
 * on the next beat. One part failing, or never answering, never keeps the
 * others from being sent.
 */
const readPart = async <T>(
  part: string,
  read: () => Promise<T>
): Promise<T | undefined> => {
  let answer: Bounded<T>;
  try {
    answer = await readWithin(PART_MS, () => read());
  } catch (error) {
    console.warn(`[agent] ${part} could not be read: ${errorWords(error)}`);
    return;
  }
  switch (answer.kind) {
    case "answered":
      return answer.value;
    case "unanswered":
      console.warn(
        `[agent] ${part} was not read within ${PART_MS / 1000} s; the hub keeps its last copy, and it is read again on the next beat`
      );
      return;
    default: {
      const unhandled: never = answer;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** Whether this process has said what its first Claude report found ({@link noteClaudeAuth}). */
let claudeAuthNoted = false;

/** Whether this process has sent a register yet ({@link firstRegisterSpawnedNothing}). */
let registeredOnce = false;

/**
 * Law `register-spawned-nothing` (core invariant.ts), at the register call
 * site: this process's first register is sent before any harness probe has
 * started (probe-count.ts), so a machine whose harness CLIs answer slowly
 * still reads online at once (ea944761a). Later registers (a reconnect, a
 * retry) follow the first connection's own probes, and are not its case.
 *
 * Born red, once: ea944761a^ (2d7526fae) with this check and the counter laid
 * on it, `cawco up` to a scratch hub on loopback exited 70 with "[law] Law
 * broken: register-spawned-nothing. An agent's first register is sent
 * before any harness probe has started. 2 harness probes had started before
 * this process's first register to ws://127.0.0.1:34561/ws." This tree, the
 * same run: "registered with ws://127.0.0.1:34561/ws", no law.
 */
const firstRegisterSpawnedNothing = (url: string): void => {
  if (registeredOnce) {
    return;
  }
  invariant(
    probesStarted() === 0,
    "register-spawned-nothing",
    () =>
      `${probesStarted()} harness probes had started before this process's first register to ${url}.`
  );
  registeredOnce = true;
};

/**
 * The machine's word on Claude, said once per process, from the first Claude
 * report that settles it: nothing while an account is signed in, else the
 * sentence pointing at Configure → Accounts. A report whose dirs gave no
 * answer settles nothing (`auth` absent), and the next one is read for it.
 * It used to be read before the agent started, which made the start wait on
 * `claude auth status` for every account.
 */
const noteClaudeAuth = (auth: AuthState | undefined): void => {
  if (claudeAuthNoted || auth === undefined) {
    return;
  }
  claudeAuthNoted = true;
  const note = claudeAuthNote(auth);
  if (note) {
    Effect.runFork(Effect.logWarning(note));
  }
};

/** A harness's report, read on its own ({@link readPart}). */
const readHarness = (
  adapter: Harness
): Promise<MachineHarnessReport | undefined> =>
  readPart(`the ${adapter.kind} harness's report`, () => adapter.detect());

/** The provider-account controls, each telling the machine's harnesses when the accounts moved. */
const registerProviderAccounts = (supervisor: SessionSupervisor): void => {
  const changing =
    <T>(work: () => Promise<T>) =>
    async (): Promise<T> => {
      const result = await work();
      providerAccountsChanged();
      return result;
    };
  supervisor.registerDaemonFunction(
    CONTROL_BEGIN_PROVIDER_LOGIN,
    (id, provider) => beginProviderLogin(id as string, provider as string)
  );
  supervisor.registerDaemonFunction(
    CONTROL_COMPLETE_PROVIDER_LOGIN,
    async (code, id, expected) => {
      const result = await completeProviderLogin(
        (code as string | null) ?? null,
        id as string,
        (expected as AccountIdentity | null) ?? null
      );
      if (result.state === "signed-in" || result.state === "mismatch") {
        providerAccountsChanged();
      }
      return result;
    }
  );
  supervisor.registerDaemonFunction(
    CONTROL_SET_PROVIDER_KEY,
    (id, provider, key, expected) =>
      changing(() =>
        setProviderKey(
          id as string,
          provider as string,
          key as string,
          (expected as AccountIdentity | null) ?? null
        )
      )()
  );
  supervisor.registerDaemonFunction(CONTROL_FORGET_PROVIDER_ACCOUNT, (id) =>
    changing(async () => {
      await forgetProviderAccount(id as string);
      return { forgotten: true };
    })()
  );
  supervisor.registerDaemonFunction(CONTROL_READ_HOME_CREDENTIALS, () =>
    readHomeCredentials()
  );
  supervisor.registerDaemonFunction(
    CONTROL_JOIN_PROVIDER_ACCOUNT,
    (from, into, expected) =>
      changing(() =>
        joinProviderAccount(
          from as string,
          into as string,
          expected as AccountIdentity
        )
      )()
  );
  supervisor.registerDaemonFunction(
    CONTROL_MOVE_HOME_CREDENTIAL,
    (id, store, storeProvider, expected) =>
      changing(() =>
        moveHomeCredential(
          id as string,
          store as "pi" | "opencode",
          storeProvider as string,
          expected as AccountIdentity
        )
      )()
  );
  supervisor.registerDaemonFunction(CONTROL_LEND_ACCOUNT, (id) =>
    lendAccount(id as string)
  );
  supervisor.registerDaemonFunction(
    CONTROL_BORROW_ACCOUNT,
    (id, lender, lent, store, storeProvider, expected) =>
      changing(() =>
        borrowAccount(
          id as string,
          lender as string,
          lent as LentAccess,
          store as "pi" | "opencode",
          storeProvider as string,
          expected as AccountIdentity
        )
      )()
  );
  supervisor.registerDaemonFunction(
    CONTROL_ACCOUNT_LENT,
    (requestId, answer, accountId) =>
      accountLent(
        (requestId as string | null) ?? null,
        answer as LentAccess | { error: string },
        (accountId as string | undefined) ?? undefined
      )
  );
};

/**
 * How the hub identifies this machine in its registry. Nothing in it is
 * probed: the machine's word on Claude rides Claude's harness report, which
 * follows the register ({@link HeartbeatPayload.harnesses}).
 */
interface MachineIdentity {
  /**
   * The daemon's home folder, absolute: the hub resolves a place named under
   * `~` on this machine against it, so every place it stores is absolute.
   */
  home: string;
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
 * millisecond a healthy machine reads offline. Harnesses, tools and the
 * machine's capabilities, whose probes start processes (a `claude` that took
 * 30 s to answer `--version` and `auth status` kept a machine offline for
 * 31 s), follow on beats of their own: see {@link HeartbeatPayload}.
 */
export interface RegisterPayload extends MachineIdentity {
  /**
   * The machine agent's account stores: every id under `~/.cawco/accounts/`,
   * Claude dirs and provider credential stores alike. The hub's ack names
   * the ones it has no account for ({@link RegisterAckPayload.unknownAccounts}),
   * which the machine forgets. Absent from an agent that is not the
   * machine's: it shares the machine's stores with the machine's own hub,
   * and another hub's accounts are not its to judge.
   */
  accountStores?: string[];
  /** This machine's binary update state at register, as the updater last saw it. */
  binaryUpdate?: BinaryUpdateState;
  /**
   * The cawco this daemon is running (NEW.md §12), as it reported at register.
   */
  build?: BuildInfo;
  /** Custody is not attachment: these still need a handle before being listed live. */
  custody: SessionCustody;
  /**
   * The id this machine last registered as with this hub, when its id has
   * moved since (it follows the hostname, core machine-id.ts): the hub moves
   * what it held for that id to this one once the register proves it is
   * that machine (hub server.ts `takeFormerId`). Absent when it has not moved.
   */
  formerMachineId?: string;
  instances: string[];
  /**
   * The preview listeners this process is serving. A hub that restarted has
   * no targets and takes these as they are; one that only lost the socket
   * points its targets at them again.
   */
  previews: ReturnType<typeof servingPreviews>;
  /**
   * This connection's answer to the hub's challenge with the machine's key
   * ({@link keyProof}); absent before the person admitted the machine.
   */
  proof?: string;
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
        // A throw while a connection is set up or runs (a defect: a system
        // call refused, a bug) ends that connection, never the loop: it is
        // said with what threw, and the series reconnects as from any
        // failure. Retried only as failures are, a defect ended the loop and
        // left the agent running with no hub link and nothing more said (run
        // A, 2026-10-15, after an EMFILE from a file watch).
        Effect.catchDefect((defect) =>
          Effect.fail({
            reason: `the hub connection threw: ${defect instanceof Error ? (defect.stack ?? defect.message) : String(defect)}`,
          } as E)
        ),
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

/**
 * The one way anything leaves for the hub: no session credential does
 * ({@link outbound}), and nothing holds this loop. The hub's server offers
 * permessage-deflate to every socket, so this client deflates each `send()`
 * synchronously, ~15 ms per MB: a 45 MB transcript reply held the loop for
 * ~0.7 s, with every keeper dial, heartbeat and timer behind it. Through the
 * socket's line (`@cawco/core/wire`) a long message goes as parts, one per
 * turn of the loop, in order, never dropped.
 */
const send = (socket: WebSocket, envelope: Envelope): void => {
  const line = clientLine(socket);
  for (const message of outbound(envelope)) {
    line.sendPieces(message.pieces, message.chars);
  }
};

/**
 * How long a dial waits for the hub to answer its upgrade. A socket the far
 * end accepted but never answers (a hub whose loop is wedged, a middlebox
 * holding the connection, another process on the hub's port) fires neither
 * `open` nor `close`: without this the dial waits forever, silent after
 * "connecting", and never reaches the reconnect below. Our choice: a
 * healthy hub answers in milliseconds.
 */
const OPEN_TIMEOUT_MS = 30_000;

/** The hub's first frame on a connection: what its register proves this machine's key against. */
interface Challenge {
  hubId: string;
  nonce: string;
}

/** A frame off the socket as the hub's challenge, or undefined for any other. */
const challengeIn = (data: unknown): Challenge | undefined => {
  let frame: unknown;
  try {
    frame = JSON.parse(String(data));
  } catch {
    return;
  }
  const envelope = frame as Envelope<Partial<AdmissionPayload>> | null;
  const payload = envelope?.payload as
    { hubId?: unknown; kind?: unknown; nonce?: unknown } | undefined;
  return envelope?.verb === "admission" &&
    payload?.kind === "challenge" &&
    typeof payload.nonce === "string" &&
    typeof payload.hubId === "string"
    ? { nonce: payload.nonce, hubId: payload.hubId }
    : undefined;
};

/**
 * Succeeds with an open socket and the hub's challenge, its first frame;
 * fails if the socket closes, or is not answered, before both. The listener
 * goes on as the socket is made: the challenge can arrive before anything
 * else here would listen for it.
 */
const open = (url: string) =>
  Effect.callback<{ challenge: Challenge; socket: WebSocket }, ConnectionLost>(
    (resume) => {
      // Says this agent reads parts; without it the hub sends whole messages,
      // as to an agent on the build before (`WIRE_PARTS_PARAM`).
      const socket = new WebSocket(announcingParts(url));
      let opened = false;
      const interrupted = new AbortController();
      readWithin(
        OPEN_TIMEOUT_MS,
        (signal) =>
          new Promise<Challenge>((resolve, reject) => {
            let challenge: Challenge | undefined;
            const settle = () => {
              socket.removeEventListener("open", onOpen);
              socket.removeEventListener("close", onClose);
              socket.removeEventListener("message", onMessage);
            };
            const ready = () => {
              if (opened && challenge) {
                settle();
                resolve(challenge);
              }
            };
            const onOpen = () => {
              opened = true;
              ready();
            };
            const onMessage = (event: MessageEvent) => {
              challenge ??= challengeIn(event.data);
              ready();
            };
            const onClose = (event: CloseEvent) => {
              settle();
              reject(new ConnectionLost({ url, reason: closeReason(event) }));
            };
            signal.addEventListener(
              "abort",
              () => {
                settle();
                reject(signal.reason);
              },
              { once: true }
            );
            socket.addEventListener("open", onOpen, { once: true });
            socket.addEventListener("close", onClose, { once: true });
            socket.addEventListener("message", onMessage);
          }),
        { signal: interrupted.signal }
      ).then(
        (read) => {
          switch (read.kind) {
            case "answered":
              resume(Effect.succeed({ socket, challenge: read.value }));
              break;
            case "unanswered":
              socket.close();
              resume(
                Effect.fail(
                  new ConnectionLost({
                    url,
                    reason: opened
                      ? `the hub sent no challenge within ${OPEN_TIMEOUT_MS / 1000} s of the connection`
                      : `the hub did not answer the connection within ${OPEN_TIMEOUT_MS / 1000} s`,
                  })
                )
              );
              break;
            default: {
              const unhandled: never = read;
              throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
            }
          }
        },
        (error: unknown) => {
          // The socket closed first; an interrupted open resumes nothing.
          if (error instanceof ConnectionLost) {
            resume(Effect.fail(error));
          }
        }
      );
      return Effect.sync(() => {
        interrupted.abort();
        socket.close();
      });
    }
  );

/**
 * The register's answer to the hub's challenge: `HMAC(machineKey, nonce ‖
 * hubId ‖ machineId)` (core machine-key.ts), when the person admitted this
 * machine; nothing before then. The key itself never leaves the machine.
 */
const keyProof = (
  challenge: Challenge,
  machine: string
): { proof?: string } => {
  const key = readMachineKey();
  return key
    ? { proof: socketProof(key, challenge.nonce, challenge.hubId, machine) }
    : {};
};

const connection = (url: string) =>
  Effect.acquireRelease(open(url), ({ socket }) =>
    Effect.sync(() => socket.close())
  );

/** Never succeeds — it fails when the hub goes away, which is what drives the retry. */
const closed = (socket: WebSocket, url: string) =>
  Effect.callback<never, ConnectionLost>((resume) => {
    // The state is read before the event is waited for, because between `open`
    // dropping its own close listener and this one going on, `attach` registers:
    // it reads custody from the keepers and the catalogs from disk, which takes
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

/** That restore as `SessionSupervisor.takeHeld` wants it: where it runs, and its conversation. */
export const custodyRow = (
  payload: SpawnPayload
): {
  instanceId: string;
  cwd: string;
  sessionId: string | null;
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
});

/**
 * What the register says about this machine's sessions: what every keeper is
 * still holding, the current one and any retiring one, and what each harness
 * could resume. The current keeper must answer; so must every other one
 * there, or what it holds would be read as nothing.
 */
const readCustody = async (
  stopSequence = 0,
  pending: string[] = []
): Promise<SessionCustody> => {
  const readStartedAt = Date.now();
  try {
    return await withKeepers(async (keepers) => {
      if (!keepers.some((keeper) => keeper.current)) {
        throw new Error(`no keeper answers at ${machineEndpoint()}`);
      }
      const held = keepers.flatMap(({ client }) =>
        client.procs.filter((proc) => proc.alive)
      );
      return {
        state: "available" as const,
        readStartedAt,
        stopSequence,
        pending,
        instances: [
          ...new Set(
            held.flatMap((proc) => {
              const id = parseProcId(proc.procId);
              return id.kind === "claude" || id.kind === "pi"
                ? [id.instanceId]
                : [];
            })
          ),
        ],
        // A server a keeper holds, or one of this agent's that runs on with
        // its keeper gone: either holds its sessions' turns.
        opencode:
          held.some(
            (proc) => parseProcId(proc.procId).kind === "opencode-server"
          ) || (await harness("opencode")?.serversRunning?.()) === true,
      };
    });
  } catch (error) {
    Effect.runFork(
      Effect.logWarning(`session custody unavailable: ${String(error)}`)
    );
    return { state: "unavailable", error: String(error) };
  }
};

/**
 * Every register, once the sessions it took custody of are attached: when
 * the hub is another process than the one this machine last registered with
 * (its `hubEpoch`, kept on disk so a restarted agent still knows), the hub
 * restarted, and each harness makes again the connections to it that do not
 * come back by themselves ({@link Harness.hubRestarted}).
 */
const reconnectAfterHubRestart = async (
  url: string,
  ackPayload: unknown
): Promise<void> => {
  const epoch = (ackPayload as { hubEpoch?: unknown } | undefined)?.hubEpoch;
  if (typeof epoch !== "string") {
    return;
  }
  const file = join(
    dirname(machineEndpoint()),
    `hub-epoch-${new URL(url).host.replaceAll(":", "_")}`
  );
  const last = await readFile(file, "utf8").catch(() => undefined);
  if (last === epoch) {
    return;
  }
  // No record is a hub this machine has not seen since this was kept: it
  // reconnects too; with no live session that is nothing.
  await writeStateFile(file, epoch);
  await Promise.all(
    harnesses().map((adapter) =>
      adapter
        .hubRestarted?.()
        .catch((error: unknown) =>
          Effect.runFork(
            Effect.logWarning(
              `${adapter.kind}: reconnecting to the restarted hub failed: ${String(error)}`
            )
          )
        )
    )
  );
};

/**
 * The register's sessions: custody, and the catalogs read from disk. Never a
 * harness's server catalog, whose read starts the server (a cold OpenCode
 * kept a first register waiting 72s); that one follows on a beat
 * ({@link reportServedCatalog}). Custody is read first all the same, so an
 * OpenCode server that beat starts is never taken for one that survived.
 */
const readSessions = async () => {
  const custody = await readCustody();
  const catalog = await resumableSessions("disk");
  return { custody, catalog };
};

/**
 * The catalogs a harness's server answers, read once a connection has
 * registered, and their dates sent on a beat of their own. A read that fails
 * is logged and sends nothing: the hub judges no row by this catalog.
 */
const reportServedCatalog = async (
  socket: WebSocket,
  machine: string,
  carried: () => string[]
): Promise<void> => {
  const catalog = await resumableSessions("server");
  if (!catalog || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  send(socket, {
    verb: "heartbeat",
    machineId: machine,
    payload: {
      at: Date.now(),
      instances: carried(),
      resumableAt: Object.fromEntries(
        catalog.map((entry) => [entry.sessionId, entry.lastModified])
      ),
    } satisfies HeartbeatPayload,
  });
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
  /** What launches ask the hub as they start; this connection carries them once registered. */
  launchAsks: LaunchAsks,
  /**
   * Called once the socket is open and the register has gone out — the moment
   * this connection counts as up. {@link reconnecting} reads it to tell a
   * healthy connection that later died from one that never stood at all; a hub
   * that vanishes while the register is read never marks it, and so is
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
    const { socket, challenge } = yield* connection(url);
    // The hub this socket reached, by its own word: what this machine's HTTP
    // proofs name (hub-proof.ts).
    setConnectedHub(challenge.hubId);
    yield* Effect.promise(() => recordJoinedHub(url, challenge.hubId));
    supervisor.setHubContract(false);
    supervisor.resetStopSequence();
    process.env[CAWCO_ENV.hubUrl] = url;
    const { catalog } = yield* Effect.promise(() => reading);
    // Catalog reads may be cached across reconnects; process absence may not.
    const custody = yield* Effect.promise(() =>
      readCustody(supervisor.stopSequence, supervisor.custodyInstanceIds)
    );
    const build = yield* Effect.promise(() => buildInfo());
    const machineAgent = yield* Effect.promise(isMachineAgent);
    // The id this machine registered as with this hub last, when it was
    // another: the hub moves what it held for it to this one.
    const registeredAs = (yield* Effect.promise(() => readConfig()))
      ?.registeredAs;
    const formerMachineId =
      registeredAs?.hubId === challenge.hubId &&
      registeredAs.machineId !== identity.machineId
        ? registeredAs.machineId
        : undefined;
    const registerPayload = (
      snapshot: Awaited<ReturnType<typeof readSessions>>
    ): RegisterPayload => ({
      ...identity,
      ...keyProof(challenge, identity.machineId),
      ...(formerMachineId ? { formerMachineId } : {}),
      ...(machineAgent ? { accountStores: accountStoreIds() } : {}),
      sessionAddresses: supervisor.sessionAddresses,
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
    /**
     * This connection's half of the handover (core handover.ts): its link,
     * and the custody its register hands back. The connection only turns its
     * socket, its keepers' words and its timers into the reducer's events,
     * and runs what comes back.
     */
    let handover: HandoverState = initialHandover();
    const agentStep = (event: HandoverEvent): HandoverCommand[] => {
      const stepped = handoverStep(handover, event);
      handover = stepped.state;
      return stepped.commands;
    };
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
    /** The wait for a register's ack, or a lapsed register's pause: cleared by the ack and by the connection's end. */
    let registrationDeadline: ReturnType<typeof setTimeout> | undefined;
    /** The register goes out, and its ack is waited for {@link REGISTER_ACK_MS}. */
    const sendRegister = (): void => {
      send(socket, {
        verb: "register",
        machineId: identity.machineId,
        payload,
      });
      registrationDeadline = setTimeout(
        () => obeyLink(agentStep({ kind: "register-expired" })),
        REGISTER_ACK_MS
      );
    };
    /**
     * What the handover decides of a register past its first (core
     * handover.ts `register-expired`, `register-due`): one whose ack did not
     * come lapses, failing the custody that waited on it, and after its pause
     * what the agent holds is read fresh and the step says whether it goes
     * again. No register leaves this connection but by a step's command.
     */
    const obeyLink = (commands: HandoverCommand[]): void => {
      for (const command of commands) {
        if (command.kind === "register-lapsed") {
          supervisor.failCustody(
            custodyEpoch,
            new Error(
              `Registration did not provide a custody decision within ${REGISTER_ACK_MS / 1000} seconds`
            )
          );
          registrationDeadline = setTimeout(async () => {
            payload = registerPayload(await readSessions());
            obeyLink(agentStep({ kind: "register-due" }));
          }, command.retryIn);
        } else if (command.kind === "register") {
          custodyEpoch = supervisor.beginCustody(
            payload.custody.state === "available"
              ? payload.custody.instances
              : []
          );
          sendRegister();
        }
      }
    };
    /** This connection's way to ask the hub what a launch runs on, once it has registered. */
    const askHub = (envelope: Envelope): void => {
      if (socket.readyState === WebSocket.OPEN) {
        send(socket, envelope);
      }
    };
    socket.addEventListener(
      "close",
      () => {
        launchAsks.disconnected(askHub);
        // Frames wait in the outbox for the next register.
        supervisor.linkDown();
        supervisor.resetStopSequence();
        clearTimeout(registrationDeadline);
        // A new epoch first, so the aborted attempt's failure is for an epoch
        // that has ended and says nothing.
        supervisor.loseCustody();
        recoveryController?.abort(new Error("Custody connection was lost."));
        agentStep({ kind: "link-lost" });
        Effect.runFork(
          Effect.logInfo(
            "hub connection lost: custody is recovered on the next register"
          )
        );
      },
      { once: true }
    );

    // What the machine can do goes out once its probes finish, on a beat of
    // its own, and not inside the register (below, the link's first command).
    // The probes spawn processes (claude's starts a real Claude Code to ask
    // for the account), and a register that waited for them kept this machine
    // out of the hub's registry, and so reading offline, for most of the
    // 2.7–3.2s the journal showed between `Connection ended` and `registered
    // with` on every hub restart. Nothing up to the register starts one.
    let reportedHarnesses: MachineHarnessReport[] = [];
    /** Whether this connection's harnesses have been read once ({@link supervisor.reannounce}). */
    let announced = false;
    let lastPiCheck = Date.now();
    const pi = harness("pi");
    let reportedProviderAccounts = providerAccountReports();
    /** The fingerprint of pi's and OpenCode's own stores this connection last sent. */
    let reportedHomeStores = homeStoresStamp();
    /** `report` in place of the one of its harness this connection last read, or beside the others. */
    const keepReport = (report: MachineHarnessReport): void => {
      if (report.harness === "claude") {
        noteClaudeAuth(report.auth);
      }
      reportedHarnesses = [
        ...reportedHarnesses.filter((one) => one.harness !== report.harness),
        report,
      ];
    };
    /**
     * pi's report read again and sent: its catalog and its resolution of
     * `default` and bare ids follow the machine's accounts and pi's own
     * settings, models and sign-ins, so placement reads them as they are.
     */
    const reportPi = async (): Promise<void> => {
      if (!pi) {
        return;
      }
      lastPiCheck = Date.now();
      keepReport(await pi.detect());
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
    };
    // A burst of changes (a write and its rename) is read once, a second on.
    let piSoon: ReturnType<typeof setTimeout> | undefined;
    const reportPiSoon = (): void => {
      clearTimeout(piSoon);
      piSoon = setTimeout(() => {
        reportPi().catch((error: unknown) =>
          console.warn(
            `[pi] report failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }, 1000);
    };
    const piFiles = new Set(["settings.json", "models.json", "auth.json"]);
    // A watch the system refuses (EMFILE: the user's inotify instances are
    // all held) does not start, and says so: pi's report is still read again
    // on its own schedule (PI_AUTH_CHECK_INTERVAL_MS, below). Thrown here, it
    // ended this connection before it could carry a heartbeat (run A,
    // 2026-10-15: "EMFILE: too many open files, watch '…/.pi/agent'").
    const piWatch = existsSync(getAgentDir())
      ? (() => {
          try {
            return watch(getAgentDir(), (_event, file) => {
              if (file && piFiles.has(file)) {
                reportPiSoon();
              }
            });
          } catch (error) {
            console.warn(
              `[pi] ${getAgentDir()} is not watched (${error instanceof Error ? error.message : String(error)}): pi's report is read again every ${PI_AUTH_CHECK_INTERVAL_MS / 1000} s`
            );
          }
        })()
      : undefined;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        clearTimeout(piSoon);
        piWatch?.close();
      })
    );
    // Each part goes on its own beat as soon as it is read (`readPart`), so
    // no part waits on another: Claude's sign-ins reach the hub when Claude's
    // report is read, whatever OpenCode's server or the tool probes are
    // doing. A part that could not be read, or was not read in time, is left
    // out, and the hub keeps what it last read of it: a harness left out of
    // `harnesses` keeps its last report there (`mergeAgentHarnesses`),
    // absent `tools` merge nothing, and a harness absent from `providers`
    // leaves its last list (`machineProviders`).
    supervisor.reannounce = () => {
      const beat = (part: Partial<HeartbeatPayload>): void => {
        if (socket.readyState === WebSocket.OPEN) {
          send(socket, {
            verb: "heartbeat",
            machineId: identity.machineId,
            payload: {
              at: Date.now(),
              instances: supervisor.instanceIds,
              ...part,
            } satisfies HeartbeatPayload,
          });
        }
      };
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — reannounce doesn't await its own sends
      void (async () => {
        reportedProviderAccounts = providerAccountReports();
        reportedHomeStores = homeStoresStamp();
        beat({
          ...(latestBinaryUpdate()
            ? { binaryUpdate: latestBinaryUpdate() }
            : {}),
          providerAccounts: reportedProviderAccounts,
          homeStores: reportedHomeStores,
        });
        await Promise.all([
          ...harnesses().map(async (adapter) => {
            const report = await readHarness(adapter);
            if (report) {
              keepReport(report);
              beat({ harnesses: [report] });
            }
          }),
          (async () => {
            const machineCapabilities = await readPart(
              "the machine's capabilities",
              probeCapabilities
            );
            if (machineCapabilities) {
              beat({ machineCapabilities });
            }
          })(),
          (async () => {
            const tools = await readPart("tools", probeTools);
            if (tools) {
              beat({ tools });
            }
          })(),
          (async () => {
            const providers = await machineProviders();
            if (providers) {
              beat({ providers });
            }
          })(),
        ]);
        // Every part answered or ran out: the cadence below reads again what is missing.
        announced = true;
      })().catch((error: unknown) =>
        console.warn(
          `[agent] the machine's report could not be sent: ${errorWords(error)}`
        )
      );
    };
    // An account signed in, keyed, moved in or forgotten here: the hub hears
    // it on the next beat, and each account's OpenCode server is squared with
    // its credential.
    providerAccountsChanged = () => {
      reportedProviderAccounts = providerAccountReports();
      reportedHomeStores = homeStoresStamp();
      if (socket.readyState === WebSocket.OPEN) {
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            providerAccounts: reportedProviderAccounts,
            homeStores: reportedHomeStores,
          } satisfies HeartbeatPayload,
        });
      }
      tellOpencodeAccountsChanged();
      reportPiSoon();
    };
    // An install this agent ran, or a harness finding its binary at another
    // version than it last did (tools.ts `toolsMoved`): the tools are probed
    // again and sent now, not at the next connect. Only the tools: a
    // harness's own report is its `detect`, which may start its server, and a
    // version moving is no reason to start one. A burst is read once, a
    // second on.
    let toolsSoon: ReturnType<typeof setTimeout> | undefined;
    const reportTools = async (): Promise<void> => {
      const tools = await readPart("tools", probeTools);
      if (tools && socket.readyState === WebSocket.OPEN) {
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            tools,
          } satisfies HeartbeatPayload,
        });
      }
    };
    const stopToolsWatch = onToolsMoved(() => {
      clearTimeout(toolsSoon);
      toolsSoon = setTimeout(() => {
        reportTools().catch((error: unknown) =>
          console.warn(
            `[agent] the tools could not be read again: ${errorWords(error)}`
          )
        );
      }, 1000);
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        clearTimeout(toolsSoon);
        stopToolsWatch();
      })
    );
    // The link's commands, in the handover's order: the register, then the
    // probes (core handover.ts `link-open`, ea944761a).
    for (const command of agentStep({ kind: "link-open" })) {
      if (command.kind === "register") {
        firstRegisterSpawnedNothing(url);
        sendRegister();
        yield* Effect.logInfo(`registered with ${url}`);
        markLive();
        reportServedCatalog(
          socket,
          identity.machineId,
          () => supervisor.instanceIds
        ).catch((error: unknown) =>
          Effect.runFork(
            Effect.logWarning(`server catalog not reported: ${String(error)}`)
          )
        );
      } else if (command.kind === "announce") {
        supervisor.reannounce();
      }
    }

    // This probe counts tokens through pi's proxy; it never starts a Claude SDK
    // query or rotates Claude Code's own login. The initial detect already ran it.
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(async () => {
          if (Date.now() - lastPiCheck < PI_AUTH_CHECK_INTERVAL_MS) {
            return;
          }
          // A read that fails is said and tried again next time, never the end of the checks.
          await readPart("the pi harness's report", reportPi);
        }),
        Schedule.spaced(Duration.millis(PI_AUTH_CHECK_INTERVAL_MS))
      )
    );

    /**
     * Claude's report with its sign-ins and the machine's word on Claude read
     * again, when either moved since the last one this connection sent (a
     * login gone, a keychain locked or unlocked under the agent); the whole
     * report read again when the announce could not read it, so its sign-ins
     * still reach the hub. Nothing when there is nothing new to send.
     */
    const rereadClaude = async (): Promise<
      MachineHarnessReport | undefined
    > => {
      const old = reportedHarnesses.find(
        (report) => report.harness === "claude"
      );
      if (!old) {
        const claude = harness("claude");
        return claude ? await readHarness(claude) : undefined;
      }
      const read = await readPart(
        "the claude harness's sign-ins",
        accountReports
      );
      if (!read) {
        return;
      }
      const {
        accounts: _accounts,
        auth: _auth,
        unreadAccounts: _unread,
        ...rest
      } = old;
      const next = { ...rest, ...(await claudeSignins(read)) };
      return Bun.deepEquals(next, old) ? undefined : next;
    };

    /**
     * The machine's login keychain unlocked with the password the reader
     * typed in the dashboard (auth.ts `unlockKeychain`), then Claude's report
     * read again and sent at once: the hub's row moves on this answer (the
     * machine's menu stops offering Unlock), not at the agent's next connect.
     * Answers the machine's word on Claude, which the dashboard's step says.
     */
    supervisor.registerDaemonFunction("unlockKeychain", async (password) => {
      await unlockKeychain(password as string);
      const claude = harness("claude");
      if (!claude) {
        throw new Error(
          "The keychain unlocked, but this machine has no Claude harness to read its logins."
        );
      }
      const report = await claude.detect();
      keepReport(report);
      if (socket.readyState === WebSocket.OPEN) {
        send(socket, {
          verb: "heartbeat",
          machineId: identity.machineId,
          payload: {
            at: Date.now(),
            instances: supervisor.instanceIds,
            harnesses: [report],
          } satisfies HeartbeatPayload,
        });
      }
      return report.auth;
    });

    // Who each account dir is signed in as, read again on a cadence
    // (`claude auth status`): an account signed out or switched under a
    // connected machine moves its sign-in at the hub within a minute, not at
    // the machine's next connect. `auth status` can refresh the dir's token
    // as it reads, and one ended mid-refresh signed accounts out until
    // Claude Code 2.1.301 (CHANGELOG: "Fixed sign-in refresh timeouts and
    // unexpected sign-outs after a short command such as `claude auth
    // status` or `claude plugin list` exited in the middle of a token
    // refresh"), so it runs on nothing older (claude-version.ts
    // `claudeToStart`).
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(async () => {
          // A login made, refreshed or moved in pi's or OpenCode's own store
          // reaches the hub too, which moves it into an account.
          if (
            !Bun.deepEquals(
              providerAccountReports(),
              reportedProviderAccounts
            ) ||
            homeStoresStamp() !== reportedHomeStores
          ) {
            providerAccountsChanged();
          }
          if (!announced) {
            return;
          }
          const claude = await rereadClaude();
          if (!claude) {
            return;
          }
          keepReport(claude);
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
        Schedule.spaced(Duration.millis(CLAUDE_LOGIN_CHECK_INTERVAL_MS))
      )
    );

    // A spawn also checks pi's sign-in, and any OpenCode call can find its
    // server refusing to start or starting again, or a turn find one of the
    // machine's own OpenCode sign-ins refused or answering again: a changed
    // word on either goes out on the next heartbeat, the other harnesses'
    // reports kept.
    const authed = [pi, harness("opencode")].filter(
      (adapter): adapter is Harness => adapter !== undefined
    );
    const changedAuth = (): MachineHarnessReport[] | undefined => {
      const moved = authed.filter((adapter) => {
        const old = reportedHarnesses.find(
          (report) => report.harness === adapter.kind
        );
        return (
          old !== undefined &&
          (old.auth !== adapter.auth ||
            old.authReason !== adapter.authReason ||
            JSON.stringify(old.signInFaults ?? []) !==
              JSON.stringify(adapter.signInFaults ?? []))
        );
      });
      if (moved.length === 0) {
        return undefined;
      }
      reportedHarnesses = reportedHarnesses.map((report) => {
        const adapter = moved.find((one) => one.kind === report.harness);
        if (!adapter) {
          return report;
        }
        const {
          authReason: _oldReason,
          signInFaults: _oldFaults,
          ...rest
        } = report;
        return {
          ...rest,
          auth: adapter.auth,
          ...(adapter.authReason ? { authReason: adapter.authReason } : {}),
          ...(adapter.signInFaults?.length
            ? { signInFaults: adapter.signInFaults }
            : {}),
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
        return false;
      }
      // Usage and workflow-run transitions originate at the hub, never at a
      // daemon; machine-scoped control replies do travel through this sink,
      // without an instanceId. A move's progress and a command's slot wait
      // go out on `emit`.
      if (
        frame.kind === "usage" ||
        frame.kind === "workflow" ||
        frame.kind === "fleet_mcp" ||
        frame.kind === "moves" ||
        frame.kind === "move_progress" ||
        frame.kind === "command_queue" ||
        frame.kind === "stage"
      ) {
        return false;
      }
      send(socket, {
        verb: "frames",
        machineId: identity.machineId,
        instanceId: frame.instanceId,
        requestId: "requestId" in frame ? frame.requestId : undefined,
        payload: frame,
      });
      return true;
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
    supervisor.replaySpawnFailures();
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
    /** The hub holds this connection until the person admits the machine ({@link admission}). */
    let waitingAdmission = false;
    /**
     * WHAT IS SENT TO A SESSION WHILE ITS CUSTODY IS TAKEN WAITS FOR IT, AND
     * FOR NOTHING ELSE.
     *
     * A held spawn names a session this daemon is about to attach to or start,
     * and until that settles the supervisor holds nothing under its id. A send
     * the hub routed meanwhile (a delegate's report to its parent, an
     * operator's message) failed `no session` and was dropped, though the
     * session was attached seconds later: 19:48:13 send failed, 19:48:29
     * attached. So every envelope for a held session waits here, in order,
     * and goes to the supervisor once that session's own custody is decided
     * ({@link release}). It used to wait for the whole machine's: one OpenCode
     * server answering HTTP 500 to every request held every Claude wake on
     * obelisk for 4.5 hours (2026-10-10).
     */
    const undecided = new Map<string, Envelope[]>();
    /** One session's custody is decided: what waited for it goes to the supervisor, in order. */
    const release = (instanceId: string): void => {
      const waiting = undecided.get(instanceId);
      if (!waiting) {
        return;
      }
      undecided.delete(instanceId);
      for (const envelope of waiting) {
        supervisor.dispatch(envelope);
      }
    };
    /**
     * The restores the hub sent ahead of its ack that go straight to the
     * supervisor rather than wait here: a held opencode session's reattach,
     * which asks its server whether its turn is running before it is handed
     * back. Busy answers wait for them as they wait for claude's: OpenCode
     * counts every recovery still pending as busy (`busyInstances`).
     *
     * EACH IS ITS OWN SESSION'S, AND NOTHING ELSE WAITS ON IT. Custody's
     * completion, the spawns it dispatches and every other session's
     * envelopes go on without them: one reattach that never ended (a server
     * answering 500 for one directory, retried as unreachable) once held every
     * attempt of a machine's custody past its 120 seconds for 4.5 hours, and no
     * Claude session there could start (obelisk, 2026-10-10). A session's own
     * envelopes go to the supervisor behind its reattach, which runs one
     * session's envelopes in order; a reattach that fails is settled
     * unavailable there, its sends owed (`recovery_unavailable`).
     */
    const reattaching: Envelope[] = [];
    supervisor.registerDaemonFunction("sessionCustody", async () => ({
      custody: await readCustody(supervisor.stopSequence, [
        ...supervisor.custodyInstanceIds,
        ...undecided.keys(),
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

    /**
     * THE CUSTODY TRANSACTION, AS THE HANDOVER DECIDES IT (core handover.ts).
     * What sessiond hands back is taken by one unit per harness, Claude's
     * held children in one and pi's in another. Each keeper there is read for
     * its own word, the reducer decides each session from those words, and
     * this runs what it decides: a child a keeper holds is taken into custody
     * the moment it is known ({@link SessionSupervisor.takeHeld}), its attach
     * the first thing in its session's queue however long the child takes to
     * answer; a session no keeper holds, once every keeper has listed or
     * ended, starts afresh; each is let go ({@link release}) as it is decided.
     * A session whose keeper has not answered is neither: it waits for that
     * keeper's word or its end, asked again while it could not be read, and
     * past {@link CUSTODY_BOUND_MS} the wait is said, never ended (an
     * unanswered keeper never reads as holding nothing: 2026-10-16, the
     * keeper of the build before answered past 2 s and its sessions were
     * started afresh). Custody is complete once every session is decided. An
     * OpenCode reattach is no unit of it: it is its own session's
     * ({@link reattaching}).
     */
    const takeCustody = (ackPayload: unknown, spawns: Envelope[]): void => {
      clearTimeout(registrationDeadline);
      const harnessOf = (envelope: Envelope): HarnessKind =>
        (envelope.payload as SpawnPayload).harness ?? "claude";
      const units = new Map(
        spawns.map((envelope) => [
          (envelope.payload as SpawnPayload).instanceId,
          harnessOf(envelope),
        ])
      );
      custodyEpoch = supervisor.beginCustody([...units.keys()]);
      const epoch = custodyEpoch;
      supervisor.custodyUnits(epoch, units);
      // Dispatched once, for this connection, and never awaited: each
      // reattach ends as its own session's attach or failure, and what
      // waited for that session goes behind it ({@link reattaching}).
      for (const envelope of reattaching.splice(0)) {
        supervisor.dispatch(envelope);
        release((envelope.payload as SpawnPayload).instanceId);
      }
      const takeover = new AbortController();
      recoveryController = takeover;
      /** The connection ended: the next register's custody decides instead. */
      const ended = (): boolean =>
        takeover.signal.aborted || socket.readyState !== WebSocket.OPEN;
      const byId = new Map(
        spawns.map((envelope) => [
          (envelope.payload as SpawnPayload).instanceId,
          envelope,
        ])
      );
      /** Each keeper's listing of each harness's children, this custody: what a `hold` takes. */
      const listings = new Map<string, HeldProc[]>();
      const listed = (unit: string, keeper: string): string =>
        `${unit}\0${keeper}`;
      const adopted: string[] = [];

      /** One step of this custody, its commands run in order; nothing once its connection has ended. */
      const custodyStep = (event: HandoverEvent): void => {
        if (ended()) {
          return;
        }
        for (const command of agentStep(event)) {
          obeyCustody(command);
        }
      };
      const obeyCustody = (command: HandoverCommand): void => {
        switch (command.kind) {
          case "read-keeper": {
            const kind = command.unit as (typeof SESSION_PROC_KINDS)[number];
            const reader = supervisor.custodyReader(kind);
            reader
              ?.read(command.keeper)
              .then((answer) => {
                if (answer.kind === "listed") {
                  listings.set(
                    listed(command.unit, command.keeper),
                    answer.procs
                  );
                }
                custodyStep({
                  kind: "keeper-word",
                  epoch: command.epoch,
                  unit: command.unit,
                  keeper: command.keeper,
                  word: custodyWord(kind, answer),
                  now: Date.now(),
                });
              })
              .catch((problem: unknown) =>
                supervisor.failCustody(epoch, problem)
              );
            return;
          }
          case "hold": {
            const envelope = byId.get(command.id);
            const proc = listings
              .get(listed(command.unit, command.keeper))
              ?.find(
                (one) =>
                  one.alive &&
                  one.procId ===
                    procIdFor(
                      command.unit as (typeof SESSION_PROC_KINDS)[number],
                      command.id
                    )
              );
            if (envelope && proc) {
              supervisor.takeHeld(
                command.unit as (typeof SESSION_PROC_KINDS)[number],
                ackPayload,
                custodyRow(envelope.payload as SpawnPayload),
                proc
              );
              adopted.push(command.id);
            }
            return;
          }
          case "start": {
            // A held spawn whose session has no child to take back starts
            // one, ahead of what waited for it.
            const envelope = byId.get(command.id);
            if (envelope) {
              supervisor.dispatch(envelope);
            }
            return;
          }
          case "settle":
            supervisor.custodySettled(epoch, command.id);
            release(command.id);
            return;
          case "say":
            Effect.runFork(
              command.level === "warn"
                ? Effect.logWarning(command.words)
                : Effect.logInfo(command.words)
            );
            return;
          case "wake": {
            const { at } = command;
            setTimeout(
              () =>
                custodyStep({ kind: "tick", now: Math.max(Date.now(), at) }),
              Math.max(0, at - Date.now())
            );
            return;
          }
          case "custody-complete":
            complete().catch((problem: unknown) =>
              supervisor.failCustody(epoch, problem)
            );
            return;
          case "announce":
          case "arm-listed":
          case "arm-read":
          case "arm":
          case "fail-owed":
          case "park":
          case "publish":
          case "register-lapsed":
          case "register":
          case "release-owed":
          case "send-verdict":
            return;
        }
      };

      const custodyRecovered = () => {
        if (adopted.length > 0) {
          Effect.runFork(
            Effect.logInfo(
              `took custody of ${adopted.length} surviving session(s), each attached as it answers: ${adopted.join(", ")}`
            )
          );
        }
        if (supervisor.completeCustody(epoch)) {
          Effect.runFork(
            Effect.logInfo(
              `custody recovered: ${supervisor.instanceIds.length} session(s) attached, ${adopted.length} taken back this time`
            )
          );
        }
        // biome-ignore lint/complexity/noVoid: the harnesses' reconnects are theirs; registration never waits on them
        void reconnectAfterHubRestart(url, ackPayload);
      };

      /** Every unit settled: the machine's custody, read fresh, is complete. */
      const complete = async (): Promise<void> => {
        if (ended()) {
          return;
        }
        const freshCustody = await readCustody(supervisor.stopSequence, [
          ...supervisor.custodyInstanceIds,
          ...undecided.keys(),
        ]);
        if (ended()) {
          return;
        }
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
        custodyRecovered();
      };

      // One unit per harness whose children sessiond keeps, each read from
      // the keepers there now; no control reply waits for the transaction. A
      // harness that keeps none has no keeper to ask, and its rows start.
      // biome-ignore lint/complexity/noVoid: each unit settles its own sessions as its keepers answer
      void Promise.all(
        SESSION_PROC_KINDS.flatMap((kind) => {
          const mine = spawns.filter(
            (envelope) => harnessOf(envelope) === kind
          );
          if (mine.length === 0) {
            return [];
          }
          return [
            (async () => ({
              unit: kind,
              keepers: (await supervisor.custodyReader(kind)?.keepers()) ?? [],
              rows: mine.map((envelope) => ({
                id: (envelope.payload as SpawnPayload).instanceId,
                fresh: !(envelope.payload as SpawnPayload).reattachOnly,
              })),
            }))(),
          ];
        })
      )
        .then((begun) =>
          custodyStep({
            kind: "custody-begin",
            epoch,
            units: begun,
            now: Date.now(),
          })
        )
        .catch((problem: unknown) => supervisor.failCustody(epoch, problem));
    };

    /**
     * The hub refused a frame this daemon sent and says why: logged, since a
     * `frames` envelope is never work for the supervisor. Whether it was one.
     */
    const refusedByHub = (envelope: Envelope): boolean => {
      const refused = envelope.payload as
        { kind?: string; message?: string } | undefined;
      if (envelope.verb !== "frames" || refused?.kind !== "error") {
        return false;
      }
      Effect.runFork(
        Effect.logWarning(
          `hub refused a frame from this machine: ${refused.message ?? "no reason given"}`
        )
      );
      return true;
    };

    /** A stop is logged and its sequence noted the moment it arrives, before it is routed. */
    const receiveStop = (envelope: Envelope): void => {
      if (envelope.verb !== "stop") {
        return;
      }
      const stop = envelope.payload as import("@cawco/core").StopPayload;
      Effect.runFork(
        Effect.logInfo(
          `[agent] stop session=${stop.instanceId} request=${stop.requestId ?? "none"} machine=${identity.machineId} outcome=received elapsedMs=0`
        )
      );
      supervisor.receivedStop(stop.stopSequence ?? 0);
    };

    /**
     * The machine agent forgets the stores its hub named as no account of
     * its own, and then carries each Claude session the hub named into the
     * dir its row says (its sessions' data, once the stores that go have
     * carried theirs out).
     */
    const sweepAccounts = (ack: RegisterAckPayload): void => {
      if (!machineAgent) {
        return;
      }
      const unknown = ack.unknownAccounts ?? [];
      const named = ack.sessions ?? [];
      (async () => {
        if (unknown.length > 0) {
          await forgetUnknownAccounts(unknown);
          providerAccountsChanged();
        }
        if (named.length > 0) {
          const outcomes = Object.values(await supervisor.carrySessions(named));
          const moved = outcomes.filter(
            (one) => one.state === "carried" && one.entries > 0
          ).length;
          const failed = outcomes.filter((one) => one.state === "failed");
          console.info(
            `[claude] ${moved} of ${named.length} session(s) carried into the dir their row names; ${outcomes.filter((one) => one.state === "live").length} left running${
              failed.length > 0
                ? `; ${failed.length} failed, first: ${failed
                    .slice(0, 5)
                    .map((one) => (one.state === "failed" ? one.error : ""))
                    .join("; ")}`
                : ""
            }`
          );
        }
      })().catch((error: unknown) =>
        console.warn(
          `[accounts] the start's account sweep failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    };

    /**
     * The hub took this machine as `identity.machineId`: kept as the id a
     * later register under another names as its former one.
     */
    const recordRegistered = (): void => {
      if (
        registeredAs?.hubId === challenge.hubId &&
        registeredAs.machineId === identity.machineId
      ) {
        return;
      }
      writeConfig({
        registeredAs: { hubId: challenge.hubId, machineId: identity.machineId },
      }).catch((error: unknown) =>
        console.warn(
          `[agent] could not record the id this machine registered as: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    };

    /** What arrives ahead of the register ack: custody, taken on the ack. Whether it was taken. */
    const beforeAck = (envelope: Envelope): boolean => {
      if (envelope.verb === "register") {
        supervisor.declareHubContract(
          (envelope.payload as { addressContract?: unknown })
            .addressContract === true
        );
        agentStep({ kind: "register-ack" });
        recordRegistered();
        // What each session is owed goes first, ahead of anything this ack
        // sets off: every frame the hub has not taken, then each running
        // reply so far (outbox.ts).
        supervisor.linkUp(envelope.payload);
        takeSessionLimits(
          (envelope.payload as RegisterAckPayload).sessionLimits
        );
        takeUpstream((envelope.payload as RegisterAckPayload).upstream);
        // This connection's credential for the hub's git remote, in memory only.
        setHubCredential(
          identity.machineId,
          (envelope.payload as RegisterAckPayload).machineCredential
        );
        // Registered: launches ask on this connection from here, the held
        // spawns below among them, and what went unanswered before goes now.
        launchAsks.connected(askHub);
        // A checkout whose origin is the hub pulls and pushes with it from a terminal.
        serveHubCredential().catch((error: unknown) =>
          console.warn(
            `[hub-git] the credential socket did not start: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        const spawns = heldSpawns.splice(0);
        takeCustody(envelope.payload, spawns);
        sweepAccounts(envelope.payload as RegisterAckPayload);
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
        undecided.set(spawn.instanceId, undecided.get(spawn.instanceId) ?? []);
        return true;
      }
      if (reattachOnly || opencodeSpawn) {
        reattaching.push(envelope);
        if (instanceId) {
          undecided.set(instanceId, undecided.get(instanceId) ?? []);
        }
        return true;
      }
      return false;
    };

    /** An envelope for a session whose custody is not decided waits for it; whether this one does. */
    const waitsForCustody = (envelope: Envelope): boolean => {
      const waiting = envelope.instanceId
        ? undecided.get(envelope.instanceId)
        : undefined;
      if (!waiting) {
        return false;
      }
      // A resume behind the ACK must join adoption too: the candidate read
      // yields before #adopting claims rows, so dispatching it here can
      // replace the very sessiond child this connection is taking over.
      waiting.push(envelope);
      return true;
    };

    /**
     * The hub's word on this machine's admission (hub hub-auth.ts). Waiting:
     * the hub requires paired devices and holds this connection until the
     * person admits the machine; nothing more is sent on it meanwhile.
     * Admitted: the key, kept beside `config.json`; a waiting connection
     * then ends, and the next one proves the key.
     */
    const admission = (said: AdmissionPayload): void => {
      if (said.kind === "waiting") {
        waitingAdmission = true;
        Effect.runFork(Effect.logWarning(`[admission] ${said.message}`));
        return;
      }
      if (said.kind !== "admitted") {
        return;
      }
      writeMachineKey(said.key).then(
        () => {
          Effect.runFork(
            Effect.logInfo(
              `[admission] admitted: this machine's key is kept at ${machineKeyPath()}`
            )
          );
          if (waitingAdmission && socket.readyState === WebSocket.OPEN) {
            socket.close(
              4000,
              "admitted: connecting again with this machine's key"
            );
          }
        },
        (error: unknown) =>
          Effect.runFork(
            Effect.logError(
              `[admission] the key could not be written to ${machineKeyPath()}: ${error instanceof Error ? error.message : String(error)}`
            )
          )
      );
    };

    const onEnvelope = (envelope: Envelope): void => {
      if (launchAsks.answer(envelope) || refusedByHub(envelope)) {
        return;
      }
      receiveStop(envelope);
      if (
        envelope.verb === "control" &&
        (envelope.payload as import("@cawco/core").ControlPayload).method ===
          "acknowledgeSessionAddress"
      ) {
        supervisor.dispatch(envelope);
        return;
      }
      // Ahead of the register's ack: custody, taken on the ack.
      if (handover.link.kind === "registering" && beforeAck(envelope)) {
        return;
      }
      // The hub's answer to a beat: the sessions it keeps awake.
      if (envelope.verb === "heartbeat") {
        const beat = envelope.payload as
          Partial<HeartbeatAckPayload> | undefined;
        supervisor.keepAwake(beat?.keepAwake);
        liveWorkItems(beat?.liveWorkspaces);
        takeSessionLimits(beat?.sessionLimits);
        takeUpstream(beat?.upstream);
        supervisor.acknowledged(beat);
        return;
      }
      if (!waitsForCustody(envelope)) {
        supervisor.dispatch(envelope);
      }
    };
    // Every frame is read in order through the socket's line, a part's worth
    // per turn of the loop; a message too long for one frame arrives as parts.
    const line = clientLine(socket);
    // The hub's word on this machine's admission is its own ({@link admission}).
    line.listen((message) => {
      const envelope = message as Envelope;
      if (envelope.verb === "admission") {
        admission(envelope.payload as AdmissionPayload);
      } else {
        onEnvelope(envelope);
      }
    });
    // When anything last came from the hub: what the heartbeat's deadline reads.
    let lastHeard = Date.now();
    socket.addEventListener("message", (event) => {
      lastHeard = Date.now();
      line.receive(String(event.data));
    });

    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(async () => {
          // `instances` rides every beat (not just register) so the hub can
          // reconcile session truth continuously — see HeartbeatPayload.
          // `binaryUpdate` rides it for the same reason: it is a live fact
          // that changes without anybody reconnecting.
          const beat = {
            at: Date.now(),
            damagedRecords: await damagedRecords(),
            sessionAddresses: supervisor.sessionAddresses,
            instances: supervisor.instanceIds,
            custody: await readCustody(supervisor.stopSequence, [
              ...supervisor.custodyInstanceIds,
              ...undecided.keys(),
            ]),
            ...(changedAuth() ? { harnesses: reportedHarnesses } : {}),
            ...(latestBinaryUpdate()
              ? { binaryUpdate: latestBinaryUpdate() }
              : {}),
          } satisfies HeartbeatPayload;
          // A connection waiting to be admitted says nothing more until it is.
          if (socket.readyState !== WebSocket.OPEN || waitingAdmission) {
            return;
          }
          send(socket, {
            verb: "heartbeat",
            machineId: identity.machineId,
            payload: beat,
          });
          // THE LINK'S DEADLINE. The hub answers every beat. A socket on a
          // network that went away (Wi-Fi, a laptop that slept) reads open
          // and delivers nothing, for as long as the system lets it: with
          // nothing heard {@link HUB_SILENT_MS} after a beat, it is dropped
          // as dead, the reconnect below runs, and the outbox sends again
          // what the hub did not take.
          const asked = Date.now();
          setTimeout(() => {
            if (lastHeard >= asked || socket.readyState !== WebSocket.OPEN) {
              return;
            }
            Effect.runFork(
              Effect.logWarning(
                `hub link silent ${Date.now() - asked} ms after a heartbeat: dropping it as dead`
              )
            );
            // Not `close()`: its handshake waits on the peer that went silent.
            (socket as WebSocket & { terminate: () => void }).terminate();
          }, HUB_SILENT_MS);
        }),
        Schedule.spaced(HEARTBEAT_INTERVAL)
      )
    );

    // A turn on an account reads its windows shortly after; they go to the
    // hub on this connection as they come.
    setProviderReadingSink((accounts) => {
      if (socket.readyState === WebSocket.OPEN) {
        send(socket, {
          verb: "usage",
          machineId: identity.machineId,
          payload: { accounts },
        });
      }
    });

    // Usage, cost & limits (USAGE-SPEC.md §5): scan the machine's transcripts
    // and opencode DB, then report absolute bucket totals with OpenCode Go's
    // windows. A scan failure must never kill the daemon — it hosts the user's
    // live sessions — so the whole tick is caught and logged.
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.gen(function* () {
          const buckets = yield* Effect.promise(() => scanner.scan(Date.now()));
          // The OpenCode Go plan's windows, when this machine holds a Go key.
          // Claude's limits are its accounts', which each session's Claude
          // Code reports as it runs.
          // The machine's OpenCode Go windows, from its Go account's key, and
          // every metered account's windows, each every 5 minutes.
          const openCodeGo = yield* Effect.promise(() =>
            fetchOpenCodeGoLimits(machineGoKey())
          );
          const accounts = yield* Effect.promise(() =>
            readDueProviderAccounts()
          );
          send(socket, {
            verb: "usage",
            machineId: identity.machineId,
            payload: { buckets, openCodeGo, accounts },
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

    // No periodic Claude Code login probe. It cost far more than it was worth:
    // a probe that starts a real `query()` is a Claude Code process that
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
    // and the hub runs its landing gate again from the first when it is
    // back: the commands go with the connection. Sessions are not commands
    // and stay.
    return yield* closed(socket, url).pipe(
      Effect.tapError(() => Effect.sync(abandonCommands))
    );
  });

/**
 * Runs until interrupted: connect, register, heartbeat, reconnect on loss.
 * Nothing on the way to the first register starts a harness's CLI: each
 * harness's report follows it on a beat of its own (`reannounce`).
 *
 * `rediscover` says whether the hub URL was discovered rather than named. Only
 * then may a sustained reconnect failure re-run discovery and repin; a named
 * hub is retried with the usual backoff forever.
 */
export const startDaemon = (rediscover = false) =>
  Effect.gen(function* () {
    // Every record read once, before anything reads one: what a crash left
    // damaged is in the log and on the first beat now, not at the next spawn.
    yield* Effect.promise(() =>
      sweepRecords().catch((error: unknown) =>
        console.warn(
          `[records] the start-up sweep could not finish: ${error instanceof Error ? error.message : String(error)}`
        )
      )
    );
    // First: CLIs already running read their workspace's hook on every shell
    // call, and one an earlier build wrote runs what this build no longer has.
    // Begun, not awaited: registration and custody go on meanwhile, and each
    // session waits for its own workspace's hook alone before it is adopted
    // or launched (boundary.ts `hookArmed`).
    rearmHooks().catch((error: unknown) =>
      console.warn(
        `[workspace] boundary hooks could not be written again: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    checkBoundaryHost();
    const url = process.env[CAWCO_ENV.hubUrl] ?? DEFAULT_HUB_URL;
    // Re-pinned by the rediscovery trigger below (discovered hubs only), read fresh by every attempt
    // `reconnecting` makes — see its own doc for why a plain closure variable
    // is enough: each attempt calls `session` anew, in the same tick that
    // reads this.
    let hubUrl = url;
    yield* Effect.acquireRelease(
      Effect.promise(() => startMcpGateway(() => hubUrl)),
      (listener) => Effect.sync(() => listener.stop(true))
    );
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
        `converged fleet denied-tools into ${userLayerPath("settings.json")}`
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
      home: homedir(),
      hostname: hostname(),
      os: `${platform()}-${arch()}`,
    };

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

    // A workspace's boundary runs only while something holds it: a carried
    // session bounded there, a preview of a port in it (and, read by
    // boundary.ts itself, an attached CLI, a command in flight, a live work
    // item the hub names on each beat). One quiet for a while closes, and its
    // next command starts it again.
    watchQuietBoundaries({
      sessions: () => supervisor.boundedWorkspaces(),
      previews: () =>
        servingPreviews().flatMap(({ source }) =>
          "workspace" in source && source.workspace ? [source.workspace] : []
        ),
    });

    // The usage scanner outlives connections too: its store (usage.db) is the
    // machine's, so a reconnect picks up where the last scan stopped.
    const scanner = yield* Effect.sync(() => new UsageScanner());
    supervisor.registerDaemonFunction("probeCapabilities", probeCapabilities);

    // Updates arrive only as signed builds from the hub: this one object owns
    // the update tick, the "Install now" command and the policy the hub pushes.
    const updater = new BinaryUpdater(reportBinaryUpdate);
    supervisor.registerDaemonFunction(UPDATE_CAWCO, (command) =>
      updater.installNow(
        (command ?? {}) as { commandId?: string; version?: string }
      )
    );
    supervisor.registerDaemonFunction(CONFIGURE_BINARY_UPDATES, () =>
      updater.configure()
    );
    supervisor.registerDaemonFunction(CANCEL_BINARY_UPDATE, () =>
      updater.cancel()
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => updater.stop()));
    yield* Effect.forkScoped(Effect.promise(() => updater.start()));

    // Provider accounts: their controls, the agent's own refresh of every
    // OAuth sign-in (the store's only writer, which also writes each
    // account's OpenCode store), the refresh pi sessions ask for, and
    // OpenCode's own store cleared of the markers CawCo kept there before.
    registerProviderAccounts(supervisor);
    setAccountFreshener((accountId) => freshen(accountId));
    setBorrowAsk((frame) =>
      supervisor.emit({ verb: "frames", machineId: "", payload: frame })
    );
    yield* Effect.promise(() =>
      dropOpencodeMarkers().catch((error: unknown) =>
        console.warn(
          `[accounts] OpenCode's own store kept CawCo's old markers: ${String(error)}`
        )
      )
    );
    yield* Effect.forkScoped(
      Effect.repeat(
        Effect.promise(() => freshenAll()),
        Schedule.spaced(ACCOUNT_REFRESH_INTERVAL)
      )
    );

    // A keeper that is alive and answers nobody is restarted (or, retiring,
    // removed) through the service manager, which is the only thing that runs
    // it on a managed machine; a hand-run `cawco up` owns its keeper and has
    // no manager to ask.
    if (serviceManaged()) {
      const watchdog = new KeeperWatchdog({
        log: (line) => Effect.runFork(Effect.logWarning(line)),
        // The notice rides the update state, which a binary install keeps.
        record: async (restart) => {
          if (await readInstallation()) {
            await updater.noteKeeperRestart(restart);
          }
        },
      });
      watchdog.start();
      yield* Effect.addFinalizer(() => Effect.sync(() => watchdog.stop()));
    }

    // Transcript search index: FTS5-backed BM25 search over transcripts.
    // Created once, syncs every ten minutes in the background and before a
    // search, outlives reconnects.
    const search = yield* Effect.promise(() =>
      TranscriptSearchService.create()
    );
    search.start();
    // The agent's memory, by what holds it (memory.ts): once its first usage
    // scan and search sync have ended, and on its own clock from the start, so
    // an agent that never reaches its hub still says it.
    const logMemory = Effect.suspend(() => Effect.logInfo(memoryLine()));
    yield* Effect.forkScoped(
      Effect.promise(() => Promise.all([scanner.scanned, search.synced])).pipe(
        Effect.andThen(logMemory)
      )
    );
    yield* Effect.forkScoped(
      Effect.sleep(MEMORY_LOG_INTERVAL).pipe(
        Effect.andThen(
          Effect.repeat(logMemory, Schedule.spaced(MEMORY_LOG_INTERVAL))
        )
      )
    );
    // A command runs as this process's child, so a restart kills it: none starts behind a raised fence.
    setCommandQueue((frame) =>
      supervisor.emit({ verb: "frames", machineId: "", payload: frame })
    );
    supervisor.registerDaemonFunction(
      CONTROL_RUN_COMMAND,
      (cwd, cmd, timeoutMs, workspace, run) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : runWorkflowCommand(cwd, cmd, timeoutMs, workspace, run)
    );
    // A cancel ends a command already running, so it is taken behind a raised fence too.
    supervisor.registerDaemonFunction(CONTROL_CANCEL_COMMAND, async (runId) =>
      cancelCommand(runId)
    );
    // A workspace is cut in this process, so a restart would cut it too: none starts behind a raised fence.
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_CREATE,
      (cwd, id, projectId, account, at) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : createWorkspace(cwd, id, projectId, account, at)
    );
    // A place's first commit writes its folder: none starts behind a raised fence.
    supervisor.registerDaemonFunction(CONTROL_PLACE_REPO, (path) =>
      fenced() ? Promise.reject(new Error(AGENT_RESTARTING)) : placeRepo(path)
    );
    // A place published to GitHub goes through the hub's remote first.
    supervisor.registerDaemonFunction(
      CONTROL_PLACE_PUSH,
      (path, projectId, dryRun) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : placePush(path, projectId, dryRun)
    );
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_BOUNDARY,
      workspaceBoundary
    );
    // An archive ends the workspace's stage first: nothing of it is left to serve.
    supervisor.registerDaemonFunction(CONTROL_WORKSPACE_ARCHIVE, (ref) => {
      stopStages((ref as { id?: string } | null)?.id);
      return archiveWorkspace(ref);
    });
    // An archive whose unlanded work a person let go: a carry first.
    supervisor.registerDaemonFunction(CONTROL_WORKSPACE_DISCARD, (ref) => {
      stopStages((ref as { id?: string } | null)?.id);
      return discardWorkspace(ref);
    });
    // Live components: a workspace's stage, started or woken, and a sheet's stories (stage.ts).
    setStageSink((frame) =>
      supervisor.emit({ verb: "frames", machineId: "", payload: frame })
    );
    supervisor.registerDaemonFunction(STAGE_ENSURE, (ref, file) =>
      fenced()
        ? Promise.reject(new Error(AGENT_RESTARTING))
        : ensureStage(ref as WorkspaceRef, String(file))
    );
    // A sheet's story file written by its stage: a story's args, a story added, duplicated, removed or moved.
    supervisor.registerDaemonFunction(STAGE_WRITE, (ref, write) =>
      fenced()
        ? Promise.reject(new Error(AGENT_RESTARTING))
        : writeSheet(ref as WorkspaceRef, write as SheetWrite)
    );
    // A toolchain root's components, as its stage finds them (spec §6's discovery).
    supervisor.registerDaemonFunction(STAGE_COMPONENTS, (ref, dir) =>
      fenced()
        ? Promise.reject(new Error(AGENT_RESTARTING))
        : stageComponents(
            ref as WorkspaceRef,
            typeof dir === "string" ? dir : undefined
          )
    );
    // A workspace preview's server, started or woken and kept up there (stage.ts).
    supervisor.registerDaemonFunction(STAGE_SERVE, async (workspace, serve) => {
      if (fenced()) {
        throw new Error(AGENT_RESTARTING);
      }
      const ref = (await workspaceRefs()).find((one) => one.id === workspace);
      if (!ref) {
        throw new StageRefusal(`No workspace ${workspace} is on this machine.`);
      }
      return ensureServed(ref, serve as ServeSpec);
    });
    supervisor.registerDaemonFunction(STAGE_UNSERVE, (workspace, port) =>
      stopServed(String(workspace), Number(port))
    );
    // A check that names another machine: the commit leaves here, and arrives there.
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_BUNDLE,
      workspaceBundle
    );
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_AT,
      (ref, base, at, from) =>
        fenced()
          ? Promise.reject(new Error(AGENT_RESTARTING))
          : workspaceAt(ref, base, at, from)
    );
    // Host checks are gone (2026-10-16): the checkouts a crashed run of one
    // left under ~/.cawco/host-checks go, as the agent's start once cleared them.
    yield* Effect.promise(() =>
      rm(join(homedir(), ".cawco", "host-checks"), {
        recursive: true,
        force: true,
      }).catch((error: unknown) =>
        console.warn(
          `[agent] ~/.cawco/host-checks was not removed: ${String(error)}`
        )
      )
    );
    // A delegate's inputs: read here for a parent here, written here into a workspace here.
    supervisor.registerDaemonFunction(CONTROL_INPUTS_READ, readInputs);
    supervisor.registerDaemonFunction(CONTROL_INPUTS_WRITE, writeInputs);
    supervisor.registerDaemonFunction(
      CONTROL_WORKSPACE_MIGRATE,
      convertWorktrees
    );
    // A project move's steps (move.ts). Each runs as this process's child, so
    // none starts behind a raised fence; the hub runs it again after a restart.
    const unfenced =
      <A extends unknown[], R>(step: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> =>
        fenced() ? Promise.reject(new Error(AGENT_RESTARTING)) : step(...args);
    setMoveProgress((frame) =>
      supervisor.emit({ verb: "frames", machineId: "", payload: frame })
    );
    supervisor.registerDaemonFunction(CONTROL_MOVE_INSPECT, (path) =>
      moveInspect(path as string)
    );
    supervisor.registerDaemonFunction(CONTROL_MOVE_REMOTE_CREDENTIAL, (path) =>
      moveRemoteCredential(path as string)
    );
    supervisor.registerDaemonFunction(
      CONTROL_MOVE_PREPARE,
      unfenced((request) =>
        movePrepare(request as Parameters<typeof movePrepare>[0])
      )
    );
    supervisor.registerDaemonFunction(
      CONTROL_MOVE_SNAPSHOT,
      unfenced((request) =>
        moveSnapshot(request as Parameters<typeof moveSnapshot>[0])
      )
    );
    supervisor.registerDaemonFunction(
      CONTROL_MOVE_CLONE,
      unfenced((request) =>
        moveClone(request as Parameters<typeof moveClone>[0])
      )
    );
    supervisor.registerDaemonFunction(
      CONTROL_MOVE_LFS,
      unfenced((request) => moveLfs(request as Parameters<typeof moveLfs>[0]))
    );
    supervisor.registerDaemonFunction(
      CONTROL_MOVE_INSTALL,
      unfenced((request) =>
        moveInstall(request as Parameters<typeof moveInstall>[0])
      )
    );
    supervisor.registerDaemonFunction(CONTROL_MOVE_CANCEL, (jobId) =>
      moveCancel(jobId as string)
    );
    supervisor.registerDaemonFunction(
      CONTROL_SEARCH_TRANSCRIPTS,
      (query, options) =>
        search.search(query as string, options as TranscriptQuery | undefined)
    );

    yield* Effect.logInfo(
      `cawco agent ${identity.machineId} connecting to ${url}`
    );
    const sessions = sessionsReader();
    // A launch asks for its credential and account as it starts; the asks
    // outlive any one connection, as the supervisor does.
    const launchAsks = new LaunchAsks(identity.machineId);
    supervisor.launchGrant = (payload) => launchAsks.ask(payload);
    // The connection — and only the connection — is what the loop re-enters.
    // The supervisor above it keeps its sessions and the scanner keeps its
    // dedup set across every reconnect; an interrupt still unwinds through this
    // to the supervisor's release, so a signalled daemon drains between turns.
    yield* reconnecting(
      (markLive) =>
        Effect.scoped(
          attach(
            scanner,
            supervisor,
            identity,
            hubUrl,
            sessions,
            launchAsks,
            markLive
          )
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
export const runDaemon = (rediscover = false): void => {
  // No log line prints a session credential.
  redactConsole();
  // A broken law crashes the agent (core invariant.ts): sessiond keeps the
  // sessions' processes across its restart.
  lawPolicy("crash");
  const daemon = Effect.runFork(
    // A daemon before this one that was killed or crashed left its logins
    // waiting; nothing else could ever end them. Ended before the daemon
    // starts, so no login of this one is mistaken for one of those.
    Effect.promise(() => endOrphanedSignIns()).pipe(
      // Never rejects: what it cannot judge it leaves and says.
      Effect.andThen(Effect.promise(() => removeCawcoSessionConfigs())),
      Effect.andThen(startDaemon(rediscover)),
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
  // However the daemon ends, a `claude auth login` it holds ends with it.
  process.on("exit", () => {
    endSignIns();
    endProviderSignIns();
  });
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
