import { cleanStartRefusal } from "@cawco/core/harness";
import type {
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core/harness/kinds";
import { forkNotice } from "@cawco/core/injected";
import type { MachinePath } from "@cawco/core/machine-path";
import { MachinePathRefused } from "@cawco/core/machine-path";
import type {
  InstanceRow,
  LaunchAsk,
  LaunchGrant,
  NamedSpawn,
  SessionCustody,
  SpawnPayload,
} from "@cawco/core/protocol";
import type { Relaunch } from "@cawco/core/relaunch";
import { relaunchOf } from "@cawco/core/relaunch";
import type { ModeAsk } from "@cawco/core/session-messages";
import { spawnWords } from "@cawco/core/words/spawn";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { cleanSpawn, fencedSpawn } from "./caw";
import type { DbShape } from "./db";
import type { PublicInstanceRow } from "./db/instances";
import type { StoredSendRefusal } from "./db/stored-types";
import type { HubContext } from "./hub-context";
import type { AccountUse, SettledSpawn } from "./hub-shapes";
import { documentFacts, sessionInstructions } from "./memory-scopes";
import { makesRoutines } from "./roles";
import { UNREAD } from "./sends";
import { peekResume } from "./spawns";
import { blockWords, WorkItemRefusal } from "./work-items";

/** Settings reported by the harness, including a live mode change's receipt. */
const peekSessionSettings = (
  payload: unknown
): { model?: unknown; permissionMode?: unknown } | undefined => {
  const body = payload as {
    kind?: string;
    ok?: boolean;
    result?: { permissionMode?: unknown };
    message?: Record<string, unknown>;
  };
  if (body.kind === "control_result") {
    const mode = body.ok ? body.result?.permissionMode : undefined;
    return typeof mode === "string" ? { permissionMode: mode } : undefined;
  }
  const frame = body.message;
  if (frame?.type !== "system") {
    return undefined;
  }
  if (frame.subtype === "init") {
    return { model: frame.model, permissionMode: frame.permissionMode };
  }
  // A mode the session moved to mid-turn (plan mode, Full Send ended), filed
  // now rather than at the next turn's `init`, so a restart restores it.
  if (
    frame.subtype === "status" &&
    typeof frame.permissionMode === "string" &&
    !frame.parent_tool_use_id
  ) {
    return { permissionMode: frame.permissionMode };
  }
  if (frame.subtype === "model_fallback") {
    return { model: frame.fallback_model };
  }
  return undefined;
};

export type LaunchesContext = Pick<
  HubContext,
  | "db"
  | "forgetPending"
  | "harnessReportOf"
  | "hubAsks"
  | "identities"
  | "launchAccount"
  | "launchRefusal"
  | "machineName"
  | "modelRefusal"
  | "noteFreshStart"
  | "owedOn"
  | "processEvent"
  | "processGeneration"
  | "publishInstances"
  | "registry"
  | "releaseOwed"
  | "replaceAtWake"
  | "sendSpawn"
  | "sessionName"
  | "takeOwedMove"
  | "tellEndedByMove"
  | "typeSettingsOf"
  | "unstrand"
  | "wakesForSend"
  | "workItems"
>;

export const createLaunches = (ctx: LaunchesContext) => {
  /**
   * ONE LAUNCH IN FLIGHT PER SESSION. A launch carries the credential minted
   * for it ({@link bounded}), and minting replaces the one hash the hub
   * accepts for the session, so a second launch while one is still on its
   * way leaves the first holding a dead credential: on obelisk (2026-10-10) a
   * session sleeping behind a held custody was woken again by every minute's
   * owed sweep, and when custody let go its machine ran 76 launches oldest
   * first, each refused 401 ("Invalid session credential"). So from its mint
   * until it settles a launch is the session's only one: no wake, relaunch,
   * restart, start or credential install sends another, and what is sent to
   * the session meanwhile goes to its machine behind the launch, which runs
   * one session's envelopes in order. It settles when its process installs
   * its credential ({@link launchSettled} from the ack), when the machine
   * says the session is up for a launch that replaces nothing, when it fails,
   * sleeps or stops, when its machine's socket closes, and when its machine
   * names it nowhere any more ({@link settleLaunchesOn}). A start kept while
   * its machine installs an update is in flight from when it is kept
   * (`db.owesSpawn`), and minted when it goes (`flushOwedStarts`).
   */
  const launches = new Map<
    string,
    {
      readonly machineId: string;
      readonly generation: string;
      readonly at: number;
      /** It replaces a process the machine may still be running: only its own ack says it is up. */
      readonly replaces: boolean;
    }
  >();
  const launchInFlight = (instanceId: string): boolean =>
    launches.has(instanceId) || ctx.db.owesSpawn(instanceId);
  /** Why another launch of `instanceId` does not go now; none when it may. */
  const inFlightRefusal = (instanceId: string): string | undefined =>
    launchInFlight(instanceId)
      ? `${instanceId} is already starting: its launch is still on its way to its machine, and only one goes at a time.`
      : undefined;
  /**
   * The launch of `instanceId` is over, for `why`; only the one of
   * `generation` when one is named. Settled before whatever its end does
   * next (a sleep that wakes for what it is owed, a death started again),
   * so the next launch may go; what it is owed follows that path.
   */
  const launchSettled = (
    instanceId: string,
    why: string,
    generation?: string
  ): boolean => {
    const launch = launches.get(instanceId);
    if (
      !launch ||
      (generation !== undefined && generation !== launch.generation)
    ) {
      return false;
    }
    launches.delete(instanceId);
    console.info(`[hub] launch of ${instanceId} settled: ${why}`);
    return true;
  };
  /** The launch of `instanceId` is up: what was kept for it meanwhile goes to it now. */
  const launchStarted = (instanceId: string, why: string): void => {
    if (launchSettled(instanceId, why)) {
      ctx.processEvent(instanceId);
      ctx.releaseOwed({ instanceId });
    }
  };
  /**
   * A machine's own word on what it carries, at each register and each
   * heartbeat with a custody reading: a launch to it that it now names
   * nowhere (not running, not held, not on its way) is gone, dropped there
   * or with an agent that restarted, once `graceMs` has passed since it was
   * sent (a beat may have been read before the launch arrived; a register
   * is read after every launch to its last connection); one it lists
   * running that replaces nothing is up. Its socket closing alone settles
   * nothing: an agent that only reconnected still has its launches.
   */
  const settleLaunchesOn = (
    machineId: string,
    live: readonly string[],
    custody: SessionCustody,
    graceMs: number
  ): void => {
    if (custody.state !== "available") {
      return;
    }
    const running = new Set(live);
    const named = new Set([
      ...live,
      ...custody.instances,
      ...(custody.pending ?? []),
    ]);
    for (const [instanceId, launch] of [...launches]) {
      if (launch.machineId !== machineId) {
        continue;
      }
      if (running.has(instanceId) && !launch.replaces) {
        launchStarted(instanceId, "its machine runs it");
      } else if (!named.has(instanceId) && Date.now() - launch.at >= graceMs) {
        launchSettled(instanceId, "its machine no longer has it");
      }
    }
  };
  /**
   * A launch of `stored` on its way, in flight from here ({@link launches}):
   * each path that builds a launch has asked {@link inFlightRefusal} first.
   * It carries no credential: its machine asks for one as it starts it
   * ({@link grantLaunch}).
   */
  const launchGoes = (
    payload: SpawnPayload,
    stored: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    launches.set(payload.instanceId, {
      machineId: stored.machineId,
      generation: ctx.processGeneration(stored),
      at: Date.now(),
      replaces: payload.relaunch === true,
    });
  };
  /**
   * MINTED AT DISPATCH. A machine starting a launch asks for what it runs
   * on: the session's credential, minted now, and its account as its row
   * says now. However long the launch was held on its way (custody on the
   * machine, an update, its queue), nothing it runs on is older than this.
   * A credential minted when the launch was sent was replaced by every
   * launch minted after it, and a wake held 2.7 hours ran on one the hub no
   * longer took (2026-10-10).
   *
   * Only the launch the row is on now may ask, from the machine it runs on;
   * a stopped, discarded or replaced one is refused in a sentence its start
   * fails with. A hub that restarted while the launch was on its way has it
   * on record (the row's generation) and takes it as in flight again.
   */
  const grantLaunch = (
    machineId: string,
    instanceId: string | undefined,
    asked: LaunchAsk | undefined
  ): LaunchGrant => {
    const read = askingLaunch(machineId, instanceId, asked);
    if ("refusal" in read) {
      return read;
    }
    const stored = ctx.takeOwedMove(read);
    const where = ctx.launchAccount(
      machineId,
      stored,
      ctx.sessionName(stored),
      "claim"
    );
    if ("refusal" in where) {
      return { refusal: where.refusal };
    }
    if (where.accountId) {
      ctx.unstrand(read.id);
    }
    let account: Pick<SpawnPayload, "accountDir" | "homeLoginMove"> = {};
    if (where.homeLoginMove) {
      account = { homeLoginMove: where.homeLoginMove };
    } else if (where.accountId) {
      account = { accountDir: { accountId: where.accountId } };
    }
    // The fleet's documents for this session's role, delegate type, model
    // and project, as the fleet says them now (memory-scopes.ts). Its
    // project's for its folder are placed there already: in a checkout as
    // its rows reached the machine, in a clone as the clone was cut.
    // A clean session loads none of them (core `SpawnPayload.clean`).
    const projects = ctx.db.listProjects();
    const instructions = stored.clean
      ? []
      : sessionInstructions(
          ctx.db.listFleetMemoryDocs(),
          documentFacts(
            stored,
            projects.flatMap((project) => project.places),
            (projectId) =>
              projects.find((project) => project.id === projectId)?.areaId ??
              null
          )
        );
    return {
      sessionCredential: ctx.identities.mint(read.id),
      ...account,
      ...(instructions.length > 0 ? { instructions } : {}),
    };
  };
  /**
   * The row of the launch asking ({@link grantLaunch}), when it is the one
   * the row is on now, from the machine it runs on; why it may not ask,
   * otherwise. One the hub has no record of in flight (it restarted since the
   * launch went) is in flight again from here.
   */
  const askingLaunch = (
    machineId: string,
    instanceId: string | undefined,
    asked: LaunchAsk | undefined
  ):
    | ReturnType<typeof ctx.db.getInstancesByIds>[number]
    | { refusal: string } => {
    const [read] = instanceId ? ctx.db.getInstancesByIds([instanceId]) : [];
    const owned = instanceId
      ? ctx.db.ownedInstance(instanceId, machineId)
      : undefined;
    if (!(read && owned) || owned.endIntent) {
      return {
        refusal:
          "This session is no longer this machine's to start: it was stopped, discarded or moved.",
      };
    }
    const launch = launches.get(read.id);
    const current =
      asked?.processGeneration === ctx.processGeneration(read) &&
      (!launch ||
        (launch.machineId === machineId &&
          launch.generation === asked.processGeneration));
    if (!current) {
      return {
        refusal:
          "This start of the session is no longer the one the hub has on its way: it was settled or started again since.",
      };
    }
    if (!launch) {
      launchGoes(
        { instanceId: read.id, cwd: read.cwd, harness: read.harness },
        read
      );
    }
    return read;
  };
  /** The sessions whose launch to `machineId` is on its way: a process the machine is about to have. */
  const launchingOn = (machineId: string): string[] =>
    [...launches]
      .filter(([, launch]) => launch.machineId === machineId)
      .map(([instanceId]) => instanceId);
  /**
   * Sessions launched with no effort of their own: the first effort each
   * reads back is its model's default on its account (`putDefaultEffort`),
   * which a picker shows before anyone chooses.
   */
  const effortUnasked = new Set<string>();
  /**
   * The effort a launch going out asks for: the operator's, from one place.
   * The level the spawn names is a new choice (a first spawn's, a
   * continuation target's) and is kept on the row; every other launch (a
   * wake, a restore, a move, a relaunch) asks for the one kept. What the CLI
   * reads back never becomes it (db `chooseEffort`). A reattach launches
   * nothing and asks nothing. Notes, too, whether the launch asked any.
   */
  const launchEffort = (
    payload: SpawnPayload,
    row: { chosenEffort: EffortLevel | null }
  ): Pick<SpawnPayload, "effort"> => {
    if (payload.reattachOnly) {
      return {};
    }
    if (payload.effort) {
      ctx.db.chooseEffort(payload.instanceId, payload.effort);
    }
    const effort = payload.effort ?? row.chosenEffort;
    if (!effort) {
      effortUnasked.add(payload.instanceId);
      return {};
    }
    effortUnasked.delete(payload.instanceId);
    return { effort };
  };
  /**
   * The session's account, every time it is launched: its Claude Code runs
   * in that account's config dir on the machine, where its transcript and
   * its credential are. Every launch asked {@link launchAccount} before its
   * row opened; one that did not is refused here rather than run anywhere
   * else. A reattach launches nothing: its process already runs where it
   * runs. A Claude session on the machine's own login while that moves into
   * CawCo gets no account dir but the move it waits on (`homeLoginMove`),
   * which only this sets.
   */
  const accountDirOf = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    reattachOnly: SpawnPayload["reattachOnly"]
  ): Pick<SpawnPayload, "accountDir" | "homeLoginMove"> => {
    if (reattachOnly) {
      return row.accountId ? { accountDir: { accountId: row.accountId } } : {};
    }
    const launch = ctx.launchAccount(
      row.machineId,
      row,
      ctx.sessionName(row),
      "claim"
    );
    if ("refusal" in launch) {
      throw new WorkItemRefusal(409, launch.refusal);
    }
    if (launch.homeLoginMove) {
      return { homeLoginMove: launch.homeLoginMove };
    }
    return launch.accountId
      ? { accountDir: { accountId: launch.accountId } }
      : {};
  };
  /**
   * What a spawn's row records of the conversation it forks: the session it
   * branches from, by that session's id where the hub holds its row. Read
   * as the row opens, so a fork is one from before its first send: it reads
   * its origin's cache and never moves account on its own (at-limit.ts),
   * and none of its origin's delegates is its own ({@link forkLineage}).
   */
  const forkedFromOf = (payload: SpawnPayload): { forkedFrom?: string } =>
    payload.resume?.fork
      ? {
          forkedFrom:
            ctx.db.instanceBySessionId(payload.resume.sessionKey)?.id ??
            payload.resume.sessionKey,
        }
      : {};

  /**
   * The sessions `instanceId` was forked from, nearest first: the one it
   * branched from, that one's origin, and so on. Empty for a session that
   * is no fork. Every delegate started in the history a fork copied belongs
   * to one of these, and stays theirs: its reports and asks go to it, and
   * the fork cannot list, hand off to, stop, interrupt or answer it.
   */
  const forkLineage = (instanceId: string): PublicInstanceRow[] => {
    const lineage: PublicInstanceRow[] = [];
    const seen = new Set([instanceId]);
    let [row] = ctx.db.getInstancesByIds([instanceId]);
    while (row?.forkedFrom && !seen.has(row.forkedFrom)) {
      seen.add(row.forkedFrom);
      [row] = ctx.db.getInstancesByIds([row.forkedFrom]);
      if (row) {
        lineage.push(row);
      }
    }
    return lineage;
  };

  /**
   * What a fork is told ahead of its first turn, made from its origins'
   * delegates as they stand now: whose they are, which still run, and that
   * their reports go there. Undefined for a session that is no fork, or one
   * whose origins never delegated anything, so its history holds none.
   */
  const forkNoticeFor = (instanceId: string): string | undefined => {
    const lineage = forkLineage(instanceId);
    const [origin] = lineage;
    if (!origin) {
      return;
    }
    const items = ctx.db
      .workItemsOfParents(lineage.map((row) => row.id))
      .filter((item) => item.instanceId !== instanceId);
    if (items.length === 0) {
      return;
    }
    const live = items.filter(
      (item) => item.state === "starting" || item.state === "running"
    );
    const names = new Map(lineage.map((row) => [row.id, ctx.sessionName(row)]));
    const running = live.length
      ? [
          "Running now, each with the session it reports to:",
          ...[
            ...new Map(live.map((item) => [item.instanceId, item])).values(),
          ].map(
            (item) =>
              `- “${item.title}” (${item.instanceId}), ${item.state}: reports to “${names.get(item.parentInstanceId)}” (${item.parentInstanceId})`
          ),
        ].join("\n")
      : "None of them is running now.";
    return forkNotice(
      `Forked from “${ctx.sessionName(origin)}”: its delegates stay its own.`,
      [
        `This session is a fork of “${ctx.sessionName(origin)}” (${origin.id}). It starts with no delegates of its own. Every delegate started in the conversation it copied belongs to the session that started it, and stays there: its reports and asks go to that session, never here, and this session cannot list, hand off to, stop, interrupt or answer it.`,
        running,
        "Work this session needs done, it delegates itself.",
      ].join("\n\n")
    );
  };

  /** The boundary a session's every spawn carries: its work item's workspace; none for any other session. */
  const sessionWorkspace = (row: InstanceRow): WorkspaceRef | undefined =>
    ctx.workItems.workspaceOf(row);
  const bounded = (
    payload: SpawnPayload,
    knownRow?: InstanceRow
  ): NamedSpawn => {
    const {
      scratchWorktree: _callerWorktree,
      account: _pick,
      accountDir: _callerDir,
      homeLoginMove: _callerMove,
      schedulesToParent: _callerSchedules,
      clean: _callerClean,
      ...asked
    } = payload;
    const owned = ctx.db.ownedInstance(payload.instanceId);
    const [read] = ctx.db.getInstancesByIds([payload.instanceId]);
    if (!read) {
      throw new Error("A spawn has no recorded process generation.");
    }
    // A process launched now runs on the account a person moved its session
    // to mid-turn; a reattach takes the process as it runs.
    const stored = payload.reattachOnly ? read : ctx.takeOwedMove(read);
    const row = knownRow ?? stored;
    // The row's harness, on every launch it sends: its conversation is that
    // harness's ({@link enforceRowSessionKey} refused any other).
    const { harness } = read;
    // A launch carries no credential and no account: its machine asks for
    // both as it starts it ({@link grantLaunch}). It is refused here when it
    // may run nowhere, before it goes. A reattach launches nothing: it is
    // sent the account its process runs on, and that process proves its own
    // credential.
    const where = accountDirOf(stored, payload.reattachOnly);
    if (!payload.reattachOnly) {
      launchGoes(payload, stored);
    }
    const effort = launchEffort(payload, stored);
    // A process launched now runs where this launch says, whatever the one
    // before it ran from.
    if (!payload.reattachOnly) {
      ctx.db.accounts.removeMovedFrom(payload.instanceId);
    }
    return {
      // A fenced run (triage, a memory curator) is fenced on every spawn of
      // its row: the first, and each revive, restore and relaunch.
      // A clean session is clean on every spawn of its row: no skills, and
      // CawCo's MCP server alone (`cleanSpawn`).
      ...(row.clean
        ? cleanSpawn(fencedSpawn(asked, row, harness))
        : fencedSpawn(asked, row, harness)),
      // A session refused routine_create is refused its harness's durable
      // schedule too, on every spawn of its row (`makesRoutines`).
      ...(makesRoutines(row) ? {} : { schedulesToParent: true as const }),
      harness,
      ...effort,
      ...(owned?.scratchWorktree
        ? { scratchWorktree: owned.scratchWorktree }
        : {}),
      processGeneration: ctx.processGeneration(stored),
      ...(stored.keepAliveTurn ? { keepAliveTurn: stored.keepAliveTurn } : {}),
      // Its work item's boundary, or a host-scope one's scratch dir.
      ...ctx.workItems.spawnPlace(row),
      ...(payload.reattachOnly ? where : {}),
    };
  };

  /** Each folder a spawn names, as a path on `machineId`; throws the gate's refusal. */
  const spawnPaths = (
    machineId: string,
    { cwd, bootstrap, scratch }: SpawnPayload
  ): Pick<SettledSpawn, "cwd" | "bootstrap" | "scratch"> => {
    const on = (raw: string): MachinePath => {
      const path = ctx.db.machinePathOn(machineId, raw);
      if (path instanceof MachinePathRefused) {
        throw path;
      }
      return path;
    };
    const { baseCwd, ...spinOff } = scratch ?? {};
    return {
      cwd: on(cwd),
      ...(bootstrap
        ? { bootstrap: { ...bootstrap, baseDir: on(bootstrap.baseDir) } }
        : {}),
      ...(scratch
        ? {
            scratch: {
              ...spinOff,
              ...(baseCwd ? { baseCwd: on(baseCwd) } : {}),
            },
          }
        : {}),
    };
  };

  /** The permission modes a machine's harness reported, or undefined when it has not reported that harness. */
  const harnessModes = (
    machineId: string,
    harness: string
  ): readonly string[] | undefined =>
    ctx.harnessReportOf(machineId, harness)?.capabilities.permissionModes;

  /**
   * The one rule for the permission mode a spawn runs in and records, applied
   * where every spawn leaves the hub (dashboard, delegate, start_session,
   * continuation, revive, restore). A harness that reports modes
   * runs in one it offers: the one asked for, else `fallback` — the mode its
   * starter declared (a work item's, Caw's, the caller's or the
   * tree's own), or for a revive the row's last, else the one the person last
   * chose for that harness on that machine ({@link reviveMode}). With neither
   * nothing starts, and the refusal says a mode must be chosen: no mode goes
   * out that nobody chose. A harness that reports none (pi) records
   * none: a fallback is dropped, and a mode asked of it is refused. A machine
   * that has not reported the harness is taken at its word on a mode named;
   * with none named it is refused, as its modes are not known. Its directory
   * is settled here too, for the same every spawn: `cwd` as a path on the
   * machine (core `machinePath`), or the refusal saying why it is none.
   * And its model, for every start that is not a resume: one its harness
   * lists there, else refused ({@link modelRefusal}); a resume runs the
   * model its conversation started on.
   */
  const settleMode = (
    machineId: string,
    payload: NamedSpawn,
    fallback?: string | null
  ):
    | { payload: SettledSpawn; permissionMode: string | null }
    | { refusal: string; ask?: ModeAsk } => {
    const { harness } = payload;
    // A clean start on a harness that can't start one is refused, never
    // started half clean (core `cleanStartRefusal`).
    const unclean = payload.clean ? cleanStartRefusal(harness) : undefined;
    if (unclean) {
      return { refusal: unclean };
    }
    const unlisted = peekResume(payload)
      ? undefined
      : ctx.modelRefusal(machineId, harness, payload.model);
    if (unlisted) {
      return { refusal: unlisted };
    }
    let paths: Pick<SettledSpawn, "cwd" | "bootstrap" | "scratch">;
    try {
      paths = spawnPaths(machineId, payload);
    } catch (error) {
      if (error instanceof MachinePathRefused) {
        return { refusal: `${error.message} Nothing was started.` };
      }
      throw error;
    }
    const {
      permissionMode: asked,
      cwd: _cwd,
      bootstrap: _bootstrap,
      scratch: _scratch,
      ...spawn
    } = payload;
    const rest = { ...spawn, ...paths };
    const settled = modeOf(machineId, harness, asked, fallback);
    if ("refusal" in settled) {
      return settled;
    }
    const { mode } = settled;
    return mode === null
      ? { payload: rest, permissionMode: null }
      : {
          payload: { ...rest, permissionMode: mode as PermissionMode },
          permissionMode: mode,
        };
  };

  /**
   * {@link settleMode}'s rule for the mode alone: the mode a `harness`
   * session on `machineId` runs in (null for a harness with none), or the
   * refusal. A move asks it of its target before it moves anything.
   */
  const modeOf = (
    machineId: string,
    harness: string,
    asked: string | undefined,
    fallback?: string | null
  ): { mode: string | null } | { refusal: string; ask?: ModeAsk } => {
    if (harnessModes(machineId, harness)?.length === 0) {
      return asked
        ? {
            refusal: `${modeRefusal(machineId, harness, asked)} Start it without one. Nothing was started.`,
          }
        : { mode: null };
    }
    const mode = asked ?? fallback;
    if (!mode) {
      // The page asks for one where the person acted (core `ModeAsk`).
      return {
        refusal: unchosenMode(machineId, harness),
        ask: { machineId, harness: harness as HarnessKind },
      };
    }
    const unfit = modeRefusal(machineId, harness, mode);
    // A mode its machine doesn't take: the page asks for one it does.
    return unfit
      ? {
          refusal: `${unfit} Nothing was started.`,
          ask: {
            machineId,
            harness: harness as HarnessKind,
            refused: mode as PermissionMode,
          },
        }
      : { mode };
  };

  /** Why a spawn that names no permission mode does not start ({@link settleMode}). */
  const unchosenMode = (machineId: string, harness: string): string =>
    spawnWords.modeUnchosen(harness, ctx.machineName(machineId));

  /**
   * The mode a revive, restore or relaunch runs on: the row's own, else the
   * one the person last chose for its harness on its machine (db
   * `chosenMode`); none when neither is, and {@link settleMode} refuses it.
   * No row, no mode: a new session's is its starter's to name.
   */
  const reviveMode = (
    row:
      Pick<InstanceRow, "harness" | "machineId" | "permissionMode"> | undefined
  ): string | undefined =>
    row &&
    (row.permissionMode ??
      ctx.db.chosenMode(row.machineId, row.harness ?? "claude"));

  /** The hub's row for `instanceId`, when it names one the hub has. */
  const rowNamed = (instanceId: string | undefined) =>
    instanceId ? ctx.db.getInstancesByIds([instanceId])[0] : undefined;

  /** Why `harness` on `machineId` cannot run in `mode`, or nothing when it can (or has not said). */
  const modeRefusal = (
    machineId: string,
    harness: string,
    mode: string
  ): string | undefined => {
    const modes = harnessModes(machineId, harness);
    if (!modes || modes.includes(mode)) {
      return undefined;
    }
    return modes.length === 0
      ? `${harness} has no permission modes, so no ${harness} session can run in "${mode}".`
      : `${harness} on this machine has no "${mode}" permission mode; it offers ${modes.join(", ")}.`;
  };

  /** {@link modeRefusal} for a session the hub already has. */
  const sessionModeRefusal = (
    instanceId: string,
    mode: string
  ): string | undefined => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    return row ? modeRefusal(row.machineId, row.harness, mode) : undefined;
  };

  /**
   * The session's own word on its settings, written on its row: every `init`
   * names its model and permission mode, a main-loop `status` that names a
   * mode that mode, a `model_fallback` the model
   * that answers instead of the one asked for, and a successful mode control
   * the mode the harness just applied. True when the row moved. A
   * mode the session's harness does not have is not recorded (`settleMode`'s
   * rule).
   */
  const noteSessionSettings = (
    instanceId: string,
    payload: unknown
  ): boolean => {
    const settings = peekSessionSettings(payload);
    if (!settings) {
      return false;
    }
    const { model, permissionMode: mode } = settings;
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      return false;
    }
    const patch: { model?: string; permissionMode?: string } = {};
    if (typeof model === "string" && model && model !== row.model) {
      patch.model = model;
    }
    if (
      typeof mode === "string" &&
      mode &&
      mode !== row.permissionMode &&
      !sessionModeRefusal(instanceId, mode)
    ) {
      patch.permissionMode = mode;
    }
    if (Object.keys(patch).length === 0) {
      return false;
    }
    ctx.db.patchInstance(instanceId, patch);
    if (patch.permissionMode) {
      ctx.hubAsks.fullSendFiled(instanceId);
    }
    return true;
  };

  /**
   * A session's row opened (a start, a relaunch, a revive) in the mode its
   * start settled ({@link settleMode}): one that opens in Full Send has the
   * approvals it held open approved by it (asks.ts `fullSendFiled`), as a
   * mode its harness files does ({@link noteSessionSettings}).
   */
  const openInstance = (row: Parameters<DbShape["openInstance"]>[0]): void => {
    ctx.db.openInstance(row);
    ctx.hubAsks.fullSendFiled(row.id);
  };

  /**
   * Wakes the session a message is for when its process is gone: sleeping,
   * failed, or stopped with a conversation on record. The resume spawn goes
   * out first, and the machine runs one instance's envelopes in order, so the
   * message that follows lands in the process this starts. It comes back on
   * the settings it last ran with, as a revive always has.
   */
  const wakeForSend = (
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>,
    machineId: string,
    instanceId: string,
    /** The hub's own wake of many at once (the person back, `tellBack`): it goes in its turn (`paceSpawn`). */
    paced = false
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!(row && ctx.wakesForSend(row))) {
      return;
    }
    // Moving a session whose cache is cold is free: it is re-placed first.
    ctx.replaceAtWake(row);
    resumeSpawn(agent, machineId, row, false, paced);
  };

  /**
   * Launches a session's process again on its own conversation, on the
   * settings it last ran with and the account its row names: a wake for a
   * send, or a move to another account at its limit. A spawn for a session
   * still running replaces its process, as the machine settles the old one
   * first.
   */
  /**
   * Whether `row`'s process can be started again for a wake (a send, a move
   * to another account): the one rule both the send's gate
   * ({@link inputRefusal}) and the launch ({@link resumeSpawn}) ask. Its
   * account must run on its machine, its conversation be there to resume
   * (core `relaunchOf`), its launch directory known, and a permission mode
   * its machine takes be named for it (`settleMode`). Refused, it says why,
   * with what the page offers back: a sign-in or a move (`SendRefusal`), or
   * a mode to pick (core `ModeAsk`, kept as `mode-ask`). The gate asks
   * (`ask`: nothing is placed); only the launch claims its account.
   */
  const wakeOf = (
    machineId: string,
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    relaunch: boolean,
    use: AccountUse
  ):
    | { refused: { reason: string; refusal?: StoredSendRefusal } }
    | {
        plan: Relaunch;
        settled: { payload: SettledSpawn; permissionMode: string | null };
      } => {
    // On the account a move owed to it names, as its launch takes it
    // ({@link grantLaunch}): a session owed a move off a refused account
    // wakes there, never refused for the account it leaves.
    const launch = ctx.launchAccount(
      machineId,
      ctx.owedOn(row),
      ctx.sessionName(row),
      use
    );
    if ("refusal" in launch) {
      return {
        refused: {
          reason: launch.refusal,
          ...(launch.cause ? { refusal: launch.cause } : {}),
        },
      };
    }
    const plan = relaunchOf(row);
    if (plan.kind === "refused") {
      return { refused: { reason: plan.reason } };
    }
    const unlaunched = ctx.launchRefusal(row.id);
    if (unlaunched) {
      return { refused: { reason: unlaunched } };
    }
    const settled = settleMode(
      machineId,
      revivePayloadOf(row, plan, relaunch),
      reviveMode(row)
    );
    if ("refusal" in settled) {
      return {
        refused: {
          reason: settled.refusal,
          ...(settled.ask
            ? { refusal: { kind: "mode-ask" as const, ...settled.ask } }
            : {}),
        },
      };
    }
    return { plan, settled };
  };

  /**
   * A revive's start: on the settings the session last ran with, on its
   * conversation when it has one (`plan`). A row whose launch directory is
   * known holds it in `cwd` (`atLaunchDir`).
   */
  const revivePayloadOf = (
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    plan: Relaunch,
    relaunch: boolean
  ): NamedSpawn => ({
    instanceId: row.id,
    cwd: row.cwd,
    harness: row.harness,
    ...(plan.kind === "resume"
      ? { resume: { sessionKey: plan.sessionKey } }
      : {}),
    ...(relaunch ? { relaunch: true as const } : {}),
    ...(row.kind === "scratch" ? { scratch: {} } : {}),
    // Its effort is the one chosen for it, which `bounded` puts on every launch.
    ...(row.model ? { model: row.model } : {}),
    ...(row.projectId ? { projectId: row.projectId } : {}),
    // A leaf stays a leaf whatever brings it back (as `restore` says).
    ...(row.mayStart ? { mayStart: row.mayStart } : {}),
    ...ctx.typeSettingsOf(row),
  });

  const resumeSpawn = (
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>,
    machineId: string,
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    /** The process is replaced even if the machine still runs one: a move to another account. */
    relaunch = false,
    /** The hub's own launch: it goes in its turn (`paceSpawn`). A relaunch is one. */
    paced = relaunch
  ): void => {
    const instanceId = row.id;
    // Its item is blocked: nothing starts it without what is missing, and
    // nothing it was sent fails for it (work-items.ts `blockIfMissing`).
    const block = ctx.workItems.blockIfMissing(row);
    if (block) {
      console.info(
        `[hub] not launching ${instanceId}, its work item is blocked: ${blockWords(block)}`
      );
      return;
    }
    // Its launch on the way is the one: what it is sent goes behind that.
    const inFlight = inFlightRefusal(instanceId);
    if (inFlight) {
      console.info(`[hub] not launching ${instanceId} again: ${inFlight}`);
      return;
    }
    // On its conversation, or fresh when its harness never began one; one
    // that can't start fails what it was sent, saying why, with what its
    // row offers back (a mode to pick among them), by the same rule as a
    // send's gate ({@link wakeOf}).
    const wake = wakeOf(machineId, row, relaunch, "claim");
    if ("refused" in wake) {
      ctx.forgetPending(
        instanceId,
        wake.refused.reason,
        false,
        "none",
        wake.refused.refusal
      );
      return;
    }
    const { plan, settled } = wake;
    const revive = settled.payload;
    // A relaunch replaces the process; what the old one had parked is over.
    // What it was handed and never read its machine hands back once it has
    // stopped it, for this one ({@link takeBack}).
    ctx.forgetPending(instanceId, UNREAD.restarted, false, "all");
    if (plan.kind === "fresh") {
      ctx.noteFreshStart(row);
    }
    openInstance({
      id: instanceId,
      machineId,
      // Its own launch directory (revivePayloadOf): a revive never moves it.
      cwd: row.cwd,
      sessionId: row.sessionId ?? undefined,
      harness: row.harness,
      origin: row.origin,
      kind: row.kind ?? undefined,
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
    });
    // A relaunch is the hub's own launch: it goes in its turn.
    ctx.sendSpawn(
      agent,
      machineId,
      { verb: "spawn", machineId, instanceId, payload: revive },
      paced
    );
    // What a move ended with its old process, said to this one first.
    ctx.tellEndedByMove(row);
    ctx.publishInstances(machineId);
  };

  return {
    launches,
    launchInFlight,
    inFlightRefusal,
    launchSettled,
    launchStarted,
    settleLaunchesOn,
    grantLaunch,
    launchingOn,
    effortUnasked,
    forkedFromOf,
    forkLineage,
    forkNoticeFor,
    sessionWorkspace,
    bounded,
    settleMode,
    modeOf,
    reviveMode,
    rowNamed,
    sessionModeRefusal,
    noteSessionSettings,
    openInstance,
    wakeForSend,
    wakeOf,
    resumeSpawn,
  };
};
