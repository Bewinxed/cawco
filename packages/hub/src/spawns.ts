import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountProvider } from "@cawco/core/accounts";
import type { PlacementStrategy } from "@cawco/core/accounts/kinds";
import { HARNESSES, harnessNamed } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { MachinePath } from "@cawco/core/machine-path";
import type {
  Envelope,
  InstanceRow,
  NamedSpawn,
  SendPayload,
  SessionOrigin,
  SpawnPayload,
  TabNamed,
} from "@cawco/core/protocol";
import { CONTROL_GET_SESSION_INFO } from "@cawco/core/session/controls";
import type { SentMessage } from "@cawco/core/session-messages";
import { secondsOf } from "@cawco/core/time";
import { StartsHeld } from "./continuations";
import { peek } from "./cut-turns";
import type { InstanceKind } from "./db/instances";
import { handleId, isHandle } from "./handles";
import type { HubContext } from "./hub-context";
import type { Located, SessionLocation, SettledSpawn } from "./hub-shapes";
import type { LabelledRow } from "./labels";
import { sessionLabel } from "./labels";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import type { PlacementInput } from "./placement";
import {
  accountFacts,
  place as placeAccount,
  projectAccountOf,
  unreportedHarnessRefusal,
} from "./placement";
import { projectRoot } from "./project-folder";
import type { ForecastRead } from "./rebalance";
import { kindBurn, readForecast } from "./rebalance";
import { UNREAD } from "./sends";
import { TaskDoc } from "./task-file";
import { unreachable } from "./unreachable";
import type { ItemPlacement } from "./work-items";
import { WorkItemRefusal } from "./work-items";

/**
 * What a request to a machine gets when its own deadline passes with the
 * machine away: held for it all that time, and sent again each time it came
 * back (server.ts `resendHeld`), it never answered. A machine that is there
 * at the deadline and silent is unanswered instead. True of a write only: a
 * read runs nothing, and is answered as its machine being away (`asRead`).
 */
export const MACHINE_DISCONNECTED =
  "The machine was away when this request's deadline passed: the hub held the request and sent it again each time the machine came back, and no answer came in time, so whether it ran is not known. Check what it does before asking again.";

/**
 * The session a `spawn` resumes, so the instance row records what it re-opened.
 * A fork is the exception: it *reads* the origin conversation but creates a new
 * one, so claiming the origin's id here would trip openInstance's
 * one-conversation-one-row guard. Left blank, the fork's own init frame stamps
 * the real id via noteInstanceSession.
 */
export const peekResume = (payload: unknown): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { resume } = payload as { resume?: unknown };
  if (typeof resume !== "object" || resume === null) {
    return undefined;
  }
  if ((resume as { fork?: unknown }).fork) {
    return undefined;
  }
  const key = (resume as { sessionKey?: unknown }).sessionKey;
  return typeof key === "string" ? key : undefined;
};

/**
 * Whether a start's first turn names its session: a fresh one its start
 * left untitled. A start that carries its title (a summariser, a delegate)
 * is named already, so its first message, a summariser's whole transcript
 * prompt among them, is never read for one; a resumed one's next turn is
 * not its first.
 */
export const awaitsItsName = (payload: unknown): boolean =>
  !(peekResume(payload) || peek(payload, "title"));

/**
 * The hub row is the single authority for an instance's session key. A spawn
 * addressed to an existing row resumes under the row's key, whatever the
 * client sent: the dashboard once resumed two opencode sessions under their
 * cawco instance ids, the harness rejected both, and the rows went `error`.
 * A row that never reported a key has nothing to resume, and a key the
 * client made up for it is refused rather than tried. A start of an existing
 * row names the row's harness: its key is that harness's. Mutates `payload`
 * in place; returns the reason the spawn must be refused, or `undefined`
 * when it may go out.
 */
export const enforceRowSessionKey = (
  row: InstanceRow | undefined,
  payload: NamedSpawn
): string | undefined => {
  if (!row) {
    return undefined;
  }
  if (payload.harness !== row.harness) {
    return `instance ${row.id} runs on ${row.harness}; refusing to start it on ${payload.harness}`;
  }
  const asked = peekResume(payload);
  if (asked === undefined) {
    return undefined;
  }
  if (!row.sessionId) {
    return `instance ${row.id} has no session key on record; refusing to resume it under "${asked}"`;
  }
  if (asked !== row.sessionId) {
    console.warn(
      `[hub] spawn ${row.id} asked to resume "${asked}"; using the row's session key "${row.sessionId}"`
    );
    (payload as { resume: { sessionKey: string } }).resume.sessionKey =
      row.sessionId;
  }
  return undefined;
};

/** Why a start that names no harness is refused. */
const HARNESS_UNNAMED = `A start names the harness it runs on (${HARNESSES.join(", ")}).`;

/**
 * `payload` as a {@link NamedSpawn}, or why it is none: every start names a
 * harness CawCo runs, and nothing stands in for one it left out.
 */
export const namedSpawn = (
  payload: SpawnPayload
): NamedSpawn | { refusal: string } => {
  const harness = harnessNamed(payload.harness);
  return harness
    ? { ...payload, harness }
    : {
        refusal: `${HARNESS_UNNAMED} This one named ${peek(payload, "harness") ?? "none"}.`,
      };
};

/** A spawn asking for scratch isolation, or for a session that is never stored. */
export const peekKind = (payload: unknown): InstanceKind => {
  if (typeof payload !== "object" || payload === null) {
    return "mainline";
  }
  const { scratch, persistSession } = payload as {
    scratch?: unknown;
    persistSession?: unknown;
  };
  return scratch || persistSession === false ? "scratch" : "mainline";
};

/** The session that started a spawn (`SpawnPayload.parent`), so its row nests under it. */
export const peekParent = (
  payload: unknown
): { parentInstanceId?: string; parentToolUseId?: string } => {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }
  const { parent } = payload as { parent?: unknown };
  if (typeof parent !== "object" || parent === null) {
    return {};
  }
  const { instanceId, toolUseId } = parent as {
    instanceId?: unknown;
    toolUseId?: unknown;
  };
  return {
    ...(typeof instanceId === "string" ? { parentInstanceId: instanceId } : {}),
    ...(typeof toolUseId === "string" ? { parentToolUseId: toolUseId } : {}),
  };
};

/**
 * A delegate's effective permission mode, resolved to the ROOT of its delegate
 * tree. A delegate spawned by another delegate carries no `permissionMode` of
 * its own (the opencode plugin's `delegate` tool omits it), so the daemon's
 * `autoAllows` would park its tool asks even though the tree's root session
 * runs under `bypassPermissions`. Walk `parentInstanceId` up to the root and
 * inherit its mode, so the child spawns with it explicitly and the row records
 * it. `rowOf` reads one listed row by its key; `parentInstanceId` is the
 * spawn's immediate parent.
 */
const resolveDelegatePermissionMode = (
  rowOf: (id: string) => InstanceRow | undefined,
  parentInstanceId: string
): string | undefined => {
  const seen = new Set<string>();
  let current: string | undefined = parentInstanceId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = rowOf(current);
    if (!row) {
      break;
    }
    const parent = row.parentInstanceId;
    if (parent && parent !== current) {
      current = parent;
      continue;
    }
    return row.permissionMode ?? undefined;
  }
  return undefined;
};

export type SpawnsContext = Pick<
  HubContext,
  | "accountProviderFor"
  | "accountStartRefusal"
  | "awaitStart"
  | "awaitingFirstTurn"
  | "awayError"
  | "bounded"
  | "db"
  | "deliverSend"
  | "forgetPending"
  | "forkedFromOf"
  | "harnessReportOf"
  | "heldClaim"
  | "inFlightRefusal"
  | "keptOn"
  | "launchAccount"
  | "launchClaims"
  | "locations"
  | "machineFault"
  | "machineName"
  | "openInstance"
  | "owedMoves"
  | "owedOn"
  | "pending"
  | "piDefaultFor"
  | "projectTypes"
  | "publishInstances"
  | "readAgent"
  | "refusedHarness"
  | "registry"
  | "sendAnswerable"
  | "sendSpawn"
  | "sessionName"
  | "settleMode"
  | "startHold"
  | "startsOnHomeLogin"
>;

export const createSpawns = (ctx: SpawnsContext) => {
  /**
   * WHERE a conversation lives: which machine, which folder, which harness.
   *
   * A session id is a uuid and does not collide, so it identifies a
   * conversation completely — but it does not LOCATE one, and the two got
   * conflated. Every link carried the machine and folder around as query
   * parameters, and every client kept its own copy in a capped
   * most-recently-used record. Both were caches of a fact the fleet already
   * knew, and when a cache was lost or evicted the conversation became
   * unreachable: not missing, just unaddressed.
   *
   * So the fleet answers instead. The hub's own row first, which covers
   * everything it ever spawned or adopted. Failing that, ask the connected
   * machines whether they hold a transcript under that id — the harnesses
   * already answer exactly this question, and asking one id is a lookup
   * rather than the fleet-wide directory sweep a catalogue read would be
   * (898 files and 1.1GB on one machine here, which is why the catalogue is
   * capped and why a capped catalogue was never the thing to resolve
   * against). Each harness the machine reports is asked, because the control
   * goes to ONE adapter and only the one that wrote the transcript can find
   * it; a machine whose harnesses have not reported yet is asked about every
   * kind. A machine that is away cannot be asked: one whose last catalog
   * ({@link keptOn}) holds the id answers `away`, so its readers wait for it
   * rather than hear that nothing goes by the id.
   *
   * The answer is kept, so a conversation is located once per hub lifetime
   * and every reader after the first is a map lookup. Deliberately in
   * memory: this is a cache of something the machines can always be asked
   * again, and a stale row on disk claiming a transcript lives somewhere it
   * no longer does would be worse than the question being asked twice.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves a session's location from the cache, the stored row, or a live ask across every machine and harness in one place; splitting it would scatter the fallback order this depends on.
  const locateSession = async (id: string): Promise<Located> => {
    if (ctx.db.hiddenSession(id)) {
      return { kind: "nowhere" };
    }
    const known = ctx.locations.get(id);
    if (known !== undefined) {
      return known ? { kind: "found", at: known } : { kind: "nowhere" };
    }

    const [row] = ctx.db.getInstancesByIds([id]);
    if (row) {
      // The row is the single authority for its session: a row that never
      // reported a key holds nothing locatable, and no machine is asked under
      // a guessed one. Not cached, so the key it reports later is found.
      // Rows are written before their harness address is known.
      if (!row.sessionId) {
        return { kind: "nowhere" };
      }
      const found: SessionLocation = {
        id,
        machineId: row.machineId,
        sessionId: row.sessionId,
        cwd: row.cwd ?? "",
        harness: row.harness,
      };
      ctx.locations.set(id, found);
      return { kind: "found", at: found };
    }

    // Nobody spawned it here, so it is a transcript somebody left on a disk.
    // Ask the machines that are actually reachable, newest contact first.
    // A machine that did not answer is not one without it: the locate is
    // a miss only when every machine asked answered.
    const silent: string[] = [];
    for (const agent of ctx.db.listAgents()) {
      if (!ctx.registry.agent(agent.machineId)) {
        continue;
      }
      const kinds =
        agent.harnesses && agent.harnesses.length > 0
          ? agent.harnesses.map((report) => report.harness)
          : HARNESSES;
      // One machine, every adapter at once: the asks are independent reads and
      // the machine answers them concurrently, so the wait is the slowest one
      // rather than their sum.
      const answers = await Promise.all(
        kinds.map(async (harness) => {
          const answer = await ctx.readAgent(
            agent.machineId,
            CONTROL_GET_SESSION_INFO,
            [id],
            READ_TIMEOUT_MS,
            harness
          );
          switch (answer.kind) {
            case "unanswered":
              return "unanswered" as const;
            case "answered": {
              if (!answer.value.ok) {
                return null;
              }
              const info = answer.value.result as
                { sessionId?: string; cwd?: string } | undefined | null;
              return info?.sessionId
                ? { harness, sessionId: info.sessionId, info }
                : null;
            }
            default:
              throw unreachable(answer);
          }
        })
      );
      const hit = answers.find(
        (answer): answer is Exclude<typeof answer, null | "unanswered"> =>
          answer !== null && answer !== "unanswered"
      );
      if (!hit) {
        if (answers.includes("unanswered")) {
          silent.push(agent.machineId);
        }
        continue;
      }
      const found: SessionLocation = {
        id,
        machineId: agent.machineId,
        sessionId: hit.sessionId,
        cwd: hit.info.cwd ?? "",
        harness: hit.harness,
      };
      ctx.locations.set(id, found);
      return { kind: "found", at: found };
    }

    // A machine that is away keeps it, by its last catalog: not remembered,
    // so the machine's return finds it.
    const keeper = ctx.db
      .listAgents()
      .find(
        (agent) =>
          !ctx.registry.agent(agent.machineId) &&
          ctx.keptOn.get(agent.machineId)?.has(id)
      );
    if (keeper) {
      return { kind: "away", machineId: keeper.machineId };
    }
    // Not known: nothing is cached, and the caller says who did not answer.
    if (silent.length > 0) {
      console.warn(
        `[hub] locating ${id}: ${silent.map(ctx.machineName).join(", ")} did not answer; not remembered as nowhere`
      );
      return { kind: "unanswered", machines: silent };
    }
    // Remembered as unknown too, so a bad id cannot make every render sweep
    // the fleet. A machine coming online clears this (see `locations`).
    ctx.locations.set(id, null);
    return { kind: "nowhere" };
  };

  /**
   * What a tab's id names (`POST /api/instances/named`, core `TabNamed`),
   * asked in the order a read resolves it: a row (a former id read as its
   * session's), a row's harness key, the one row a short id begins, an ask
   * parked under it (a pane that is that ask's card), else a stored
   * conversation located on the machines connected now. `machine`, the one
   * the tab remembers the conversation on, away: unknown, never none.
   */
  const tabNamed = async (
    asked: string,
    machine: string | null
  ): Promise<TabNamed> => {
    const session = (id: string): TabNamed => ({ asked, kind: "session", id });
    const now = ctx.db.instanceIdOf(asked);
    if (ctx.db.getInstancesByIds([now]).length > 0) {
      return session(now);
    }
    const keyed = ctx.db.instanceBySessionId(asked);
    if (keyed) {
      return session(keyed.id);
    }
    if (isHandle(asked)) {
      const [only, ...more] = ctx.db.find.idsByPrefix(handleId(asked));
      if (only && more.length === 0) {
        return session(only);
      }
    }
    if (ctx.pending.list().some((parked) => parked.instanceId === asked)) {
      return session(asked);
    }
    if (machine && !ctx.registry.agent(machine)) {
      return { asked, kind: "unknown" };
    }
    const located = await locateSession(asked);
    switch (located.kind) {
      case "found":
        return session(asked);
      case "nowhere":
        return { asked, kind: "none" };
      case "away":
      case "unanswered":
        return { asked, kind: "unknown" };
      default:
        throw unreachable(located);
    }
  };

  /**
   * Summariser turns a continuation is waiting on, by instance id. Settled by
   * frames the hub already reads: the turn's `result`, an `error` frame, or
   * the session stopping before it answered — or its machine going away. What
   * it answered is then read from its transcript.
   */
  const turnWaiters = new Map<
    string,
    {
      machineId: string;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  >();

  /** Who hears that a session started a delegate (project-offers.ts). */
  const delegateSpawned = new Set<(parentInstanceId: string) => void>();

  /**
   * A spawn sent on a session's behalf — a relayed one, or a work item's —
   * recorded as every spawn is: the row is what puts it in the rail. A
   * conversation that starts here is named by its first turn.
   */
  /** The accounts a project task allows its attempts (`accounts:`), read from its file; null: every account. */
  const taskAccounts = (
    projectId: string | null | undefined,
    taskId: string | null | undefined
  ): string[] | null => {
    if (!(projectId && taskId)) {
      return null;
    }
    const indexed = ctx.db
      .taskIndex(projectId)
      .find((row) => row.id === taskId);
    if (!indexed) {
      return null;
    }
    try {
      const { accounts } = new TaskDoc(
        indexed.path,
        readFileSync(join(projectRoot(projectId), indexed.path), "utf8")
      ).read().fields;
      return accounts.length > 0 ? accounts : null;
    } catch {
      return null;
    }
  };

  /**
   * Everything placement reads for a session about to start on `machineId`
   * (placement.ts): its provider's accounts, where they are signed in, their
   * readings and bench, the project's and task's lists, the delegate type's
   * preference, and who started it.
   */
  /**
   * What a spawn itself asks of placement: who started it, the account it
   * picked, its delegate type's preference, and its project's and task's
   * allow-lists.
   */
  const spawnAsks = (
    payload: SpawnPayload,
    task: { projectId?: string | null; taskId?: string | null }
  ): Pick<
    PlacementInput,
    | "explicit"
    | "kind"
    | "projectAccount"
    | "projectAccounts"
    | "taskAccounts"
    | "typeAccount"
  > => {
    const projectId = payload.projectId ?? task.projectId ?? undefined;
    const project = projectId ? ctx.db.project(projectId) : undefined;
    const type = payload.delegateType;
    const typeAccount = type
      ? ctx.projectTypes.resolveTypeFor(type.projectId ?? projectId, type.name)
          ?.account
      : undefined;
    const { parentInstanceId } = peekParent(payload);
    return {
      kind: parentInstanceId || payload.spawnedBy ? "delegates" : "yours",
      projectAccounts: project?.accounts ?? null,
      taskAccounts: taskAccounts(projectId, task.taskId),
      // The start's own account wins over its project's (placement.ts `place`).
      ...(payload.account ? { explicit: payload.account } : {}),
      ...projectAccountOf(project, (id) => ctx.db.areas.get(id)?.name ?? null),
      ...(typeAccount ? { typeAccount } : {}),
    };
  };

  const placementInput = (
    machineId: string,
    payload: NamedSpawn,
    task: { projectId?: string | null; taskId?: string | null },
    fork: { accountId: string | null } | undefined
  ): PlacementInput | undefined => {
    const provider = ctx.accountProviderFor(
      machineId,
      payload.harness,
      payload.model
    );
    if (!provider) {
      return undefined;
    }
    const asks = spawnAsks(payload, task);
    const routing = ctx.db.accounts.routing(provider);
    const now = Date.now();
    return {
      ...accountFacts(ctx.db, provider),
      routing,
      machineId,
      machineName: ctx.db
        .listAgents()
        .find((agent) => agent.machineId === machineId)?.hostname,
      model: payload.model,
      ...asks,
      ...(fork ? { fork } : {}),
      ...carryTestFor(provider, routing[asks.kind].strategy, (forecast) =>
        kindBurn(forecast, isOfKind(forecast, asks.kind), now)
      ),
      now,
    };
  };

  /**
   * What soonest-reset's carry test reads (placement `paces`, `burn` and
   * `arrivals`): each of `provider`'s accounts' paces, the burn the session
   * brings, and the sessions already arriving on each account but `self`.
   * Read only for soonest-reset, which alone asks.
   */
  const carryTestFor = (
    provider: AccountProvider,
    strategy: PlacementStrategy,
    burnOf: (forecast: ForecastRead) => number | null,
    self?: string
  ): Pick<PlacementInput, "arrivals" | "burn" | "paces"> => {
    if (strategy !== "soonest-reset") {
      return {};
    }
    const forecast = readForecast(ctx.db, provider, Date.now(), owedTargets());
    return {
      paces: forecast.paces,
      burn: burnOf(forecast),
      arrivals: forecast.arrivals.filter((one) => one.instanceId !== self),
    };
  };

  /**
   * The account each session is on its way to and not on yet, by session: a
   * move owed to its turn's end ({@link owedMoves}), or a launch
   * placed and still carrying its conversation there ({@link launchClaims}).
   */
  const owedTargets = (): Map<string, string> => {
    const owed = new Map<string, string>();
    for (const [id, one] of ctx.owedMoves.list()) {
      if (one.to !== undefined) {
        owed.set(id, one.to);
      }
    }
    for (const id of ctx.launchClaims.keys()) {
      const to = ctx.heldClaim(id);
      if (to) {
        owed.set(id, to);
      }
    }
    return owed;
  };

  /** Whether a session with turns in `forecast` is of `kind`: a person's, or a session's delegate. */
  const isOfKind = (
    forecast: ForecastRead,
    kind: "yours" | "delegates"
  ): ((instanceId: string) => boolean) => {
    const ids = [
      ...new Set(
        [...forecast.turns.values()].flatMap((turns) =>
          turns.map((turn) => turn.instanceId)
        )
      ),
    ];
    const delegates = new Set(
      ctx.db
        .getInstancesByIds(ids)
        .filter((row) => row.parentInstanceId)
        .map((row) => row.id)
    );
    return (instanceId) => delegates.has(instanceId) === (kind === "delegates");
  };

  /**
   * The account a spawn already has, so nothing is placed: its row's (an
   * account is for the session's whole life), or, for a resumed conversation,
   * the account of the row it was stored under (its transcript is there).
   * Undefined for a session to place: a new one, a fork, or a conversation
   * that ran on no account (the machine carries it into the placed one's dir).
   */
  const accountHeld = (
    payload: SpawnPayload
  ): { accountId?: string } | undefined => {
    const [row] = ctx.db.getInstancesByIds([payload.instanceId]);
    if (row?.accountId) {
      return { accountId: row.accountId };
    }
    const { resume } = payload;
    if (!resume || resume.fork) {
      return undefined;
    }
    const origin = ctx.db.instanceBySessionId(resume.sessionKey);
    return origin?.accountId ? { accountId: origin.accountId } : undefined;
  };

  /**
   * The account a row opened for a launch names now. A Claude conversation
   * resumed onto an account it is not on yet (one placed now, its origin on
   * none) has its data carried there by that launch, so the row names the
   * account only once the launch says so ({@link launchClaims}); meanwhile
   * it names the account the conversation is on.
   */
  const openedAccount = (
    payload: SpawnPayload,
    placed: { accountId?: string }
  ): { accountId?: string } => {
    if (
      traitsOf(payload.harness).accountModel !== "dir" ||
      !payload.resume ||
      payload.resume.fork ||
      !placed.accountId
    ) {
      return placed;
    }
    const held = accountHeld(payload);
    if (held?.accountId === placed.accountId) {
      return placed;
    }
    ctx.launchClaims.set(payload.instanceId, {
      accountId: placed.accountId,
      at: Date.now(),
    });
    return held ?? {};
  };

  /**
   * The account a session about to open runs on: its row's, when it has one
   * (an account is for the session's whole life); a resumed conversation's
   * stays where its transcript is; a fork takes its origin's; anything else
   * is placed. `task`: the project and task of its work item, whose
   * allow-lists it keeps to. A refusal is a sentence for whoever asked.
   */
  const placeSpawn = (
    machineId: string,
    payload: NamedSpawn,
    task: { projectId?: string | null; taskId?: string | null } = {}
  ): { accountId?: string } | { refusal: string; status?: 404 } => {
    // Checked here, in the same synchronous step as the row's write that
    // follows: a project deleted after it was picked refuses the start.
    if (payload.projectId && !ctx.db.project(payload.projectId)) {
      return {
        status: 404,
        refusal: `The project "${payload.projectId}" was deleted, so the session can't start in it. Pick another.`,
      };
    }
    // A machine's agent registers before it reads its harnesses: until a
    // harness has reported, nothing says it is installed there or who is
    // signed in to it, so nothing starts on it.
    const { harness } = payload;
    const report = ctx.harnessReportOf(machineId, harness);
    if (!report) {
      return {
        refusal: unreportedHarnessRefusal(ctx.machineName(machineId), harness),
      };
    }
    // A machine that refuses every start of this harness's CLI (not
    // installed, Claude Code's version not said yet or too old) is refused
    // for that, in the words its row says: its report is filed signed out
    // then (no dir was asked), which the account's check would read as no
    // account at all.
    const refused = ctx.refusedHarness(machineId, harness);
    if (refused) {
      return { refusal: refused };
    }
    // Held, resumed, forked or placed: an account with no sign-in on the
    // machine has no dir there to run in, so the start is refused.
    const runsOn = (chosen: {
      accountId?: string;
    }): { accountId?: string } | { refusal: string } => {
      const [row] = ctx.db.getInstancesByIds([payload.instanceId]);
      const refusal = ctx.accountStartRefusal(
        machineId,
        { accountId: chosen.accountId, harness: payload.harness },
        row ? ctx.sessionName(row) : payload.title || "this session"
      );
      return refusal ? { refusal } : chosen;
    };
    const held = accountHeld(payload);
    if (held) {
      return runsOn(held);
    }
    const { resume } = payload;
    const input = placementInput(
      machineId,
      payload,
      task,
      resume?.fork
        ? {
            accountId:
              ctx.db.instanceBySessionId(resume.sessionKey)?.accountId ?? null,
          }
        : undefined
    );
    if (!input) {
      return payload.account
        ? {
            refusal: `${payload.model ?? "This model"} is no account's model on ${ctx.machineName(machineId)}; start it without an account. Nothing was started.`,
          }
        : {};
    }
    const placed = placedStart(machineId, payload, input);
    return "refusal" in placed ? placed : runsOn(placed);
  };

  /**
   * The account a start goes on, by placement, or none: on the machine's own
   * Claude login while it moves into CawCo ({@link startsOnHomeLogin}), or
   * on no account where its model is none's.
   */
  const placedStart = (
    machineId: string,
    payload: SpawnPayload,
    input: Parameters<typeof placeAccount>[0]
  ): { accountId?: string } | { refusal: string } => {
    if (ctx.startsOnHomeLogin(machineId, payload)) {
      return {};
    }
    const placed = placeAccount(input);
    if (!placed.ok) {
      return { refusal: `${placed.refusal} Nothing was started.` };
    }
    return placed.accountId ? { accountId: placed.accountId } : {};
  };

  /**
   * A start as the placement explain query describes it, for placement to
   * read, with pi's `default` named as its machine answers it in `cwd`; or
   * why there is none: a 400 for a harness CawCo does not run, a 503 for a
   * machine that could not say pi's default.
   */
  const askedStart = async (query: {
    account?: string;
    cwd?: string;
    harness: string;
    kind?: "yours" | "delegates";
    machineId: string;
    model?: string;
    projectId?: string;
    type?: string;
  }): Promise<NamedSpawn | { refusal: string; status: 400 | 503 }> => {
    const harness = harnessNamed(query.harness);
    if (!harness) {
      return { refusal: HARNESS_UNNAMED, status: 400 };
    }
    const { projectId } = query;
    const asked = await ctx.piDefaultFor(query.machineId, {
      instanceId: "",
      cwd: query.cwd ?? "",
      harness,
      model: query.model,
      projectId,
      account: query.account,
      ...(query.type ? { delegateType: { name: query.type, projectId } } : {}),
      ...(query.kind === "delegates" ? { spawnedBy: { instanceId: "" } } : {}),
    });
    return "refusal" in asked ? { ...asked, status: 503 } : asked;
  };

  /** {@link placeSpawn} for a path that refuses by throwing: its refusal is a 400, a deleted project's a 404. */
  const placedOrRefused = (
    machineId: string,
    payload: NamedSpawn,
    task?: { projectId?: string | null; taskId?: string | null }
  ): { accountId?: string } => {
    const placed = placeSpawn(machineId, payload, task);
    if ("refusal" in placed) {
      throw new WorkItemRefusal(placed.status ?? 400, placed.refusal);
    }
    return placed;
  };

  /**
   * A new workspace's first session placed before the workspace is cut
   * (work-items `ItemPlacement`): its account by {@link placedOrRefused}, and
   * the Claude account its launch runs on as {@link grantLaunch} will name it
   * ({@link launchAccount} on the row it opens with: the machine's own login
   * while that moves into CawCo, else its account). The agent adds that one
   * to the workspace's accounts as the boundary first starts, as its spawn
   * would (`boundaryFor`). Placement reads no directory.
   */
  const placeItem = (
    machineId: string,
    session: Omit<NamedSpawn, "cwd">,
    task: { projectId: string | null; taskId?: string }
  ): ItemPlacement => {
    const placed = placedOrRefused(machineId, { ...session, cwd: "" }, task);
    if (traitsOf(session.harness).accountModel !== "dir") {
      return placed;
    }
    const launchesOn = launchedOn(
      ctx.launchAccount(
        machineId,
        {
          accountId: placed.accountId ?? null,
          harness: session.harness,
          model: session.model,
          projectId: session.projectId,
        },
        session.title || "this session",
        "ask"
      )
    );
    return { ...placed, ...(launchesOn ? { launchesOn } : {}) };
  };

  /** The account a launch {@link launchAccount} answered runs on: the one the machine's own login moves into, else its account; none for a refusal. */
  const launchedOn = (
    launch: ReturnType<typeof ctx.launchAccount>
  ): string | undefined =>
    "refusal" in launch
      ? undefined
      : (launch.homeLoginMove?.accountId ?? launch.accountId);

  /**
   * The Claude account session `instanceId`'s next launch on `machineId`
   * runs on, as {@link grantLaunch} will name it (the account a move owed to
   * it names over its row's, {@link owedOn}), read without taking anything:
   * what its workspace cut again names (work-items `launchesOn`).
   */
  const nextLaunchOn = (
    machineId: string,
    instanceId: string
  ): string | undefined => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (traitsOf(row?.harness).accountModel !== "dir") {
      return;
    }
    const owed = ctx.owedOn(row);
    return launchedOn(
      ctx.launchAccount(machineId, owed, ctx.sessionName(owed), "ask")
    );
  };

  /**
   * A spawn of a row that exists goes to the directory the row was launched
   * in, whatever directory the caller sent: the harness keeps the conversation
   * under that directory, and a folder the CLI later wandered into may be gone.
   * A row whose launch directory is unknown (its machine had no record of its
   * conversation) is refused: there is nothing there to resume. Every
   * start, wake, resume and restore of an existing row is decided here.
   */
  const atLaunchDir = <P extends { cwd: string }>(
    instanceId: string | undefined,
    payload: P
  ): { payload: P } | { refusal: string } => {
    const launched = instanceId ? ctx.db.launchDirOf(instanceId) : undefined;
    if (!launched) {
      return { payload };
    }
    if ("unknown" in launched) {
      const row = instanceId
        ? ctx.db.getInstancesByIds([instanceId])[0]
        : undefined;
      const name = row ? ctx.sessionName(row) : String(instanceId).slice(0, 8);
      const machine = row ? ctx.machineName(row.machineId) : "its machine";
      return {
        refusal: `${name}'s conversation is no longer on ${machine}, so it can't be resumed.`,
      };
    }
    return { payload: { ...payload, cwd: launched.cwd } };
  };
  /** {@link atLaunchDir}'s refusal for a row, if it would refuse one. */
  const launchRefusal = (instanceId: string): string | undefined => {
    const launched = atLaunchDir(instanceId, { cwd: "" });
    return "refusal" in launched ? launched.refusal : undefined;
  };

  /** A hub-issued spawn's mode (`settleMode`) and directory (`atLaunchDir`), or the first refusal. */
  const settleSpawn = (
    machineId: string,
    asked: NamedSpawn,
    fallbackMode?: string | null
  ):
    | { payload: SettledSpawn; permissionMode: string | null }
    | { refusal: string } => {
    const inFlight = ctx.inFlightRefusal(asked.instanceId);
    if (inFlight) {
      return { refusal: inFlight };
    }
    const settled = ctx.settleMode(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      return settled;
    }
    const launched = atLaunchDir(settled.payload.instanceId, settled.payload);
    return "refusal" in launched
      ? launched
      : { payload: launched.payload, permissionMode: settled.permissionMode };
  };

  /**
   * The account a spawn opens on: `placedAhead`, when a work item's session
   * was placed before its workspace was cut ({@link placeItem}), so it is
   * placed once; otherwise placed now, keeping to the allow-lists of work
   * item `workItemId`'s project and task.
   */
  const spawnPlacement = (
    machineId: string,
    payload: NamedSpawn,
    workItemId: string | undefined,
    placedAhead: { accountId?: string } | undefined
  ): { accountId?: string } => {
    if (placedAhead) {
      return placedAhead;
    }
    const item = workItemId ? ctx.db.workItem(workItemId) : undefined;
    return placedOrRefused(machineId, payload, {
      projectId: item?.projectId,
      taskId: item?.taskId,
    });
  };

  /**
   * Why `machineId` takes no start now, or nothing. A machine inside its
   * reconnect window takes it on its register, under the request id its
   * caller waits on ({@link flushOwedStarts}); a caller `asking` and waiting
   * on any other hold is told now rather than left to time out.
   */
  const startRefusal = (
    machineId: string,
    asking: boolean
  ): string | undefined => {
    const held = ctx.startHold(machineId);
    if (!(ctx.registry.agent(machineId) || held?.kind === "away")) {
      return ctx.machineFault(machineId, "offline");
    }
    if (asking && held && held.kind !== "away") {
      return `${held.words}; start the session again once it has`;
    }
    return undefined;
  };

  /**
   * The one project a start's row opens in: its parent's, whatever started
   * it under one (a delegate, Caw's work, a check, a person's start under a
   * session), none included, since it is listed under that parent; else
   * the project the start names; else the project whose place on its
   * machine holds its folder most closely (core `projectAt`). Undefined:
   * none holds it.
   */
  const projectOfStart = (
    parentInstanceId: string | undefined,
    named: string | undefined,
    machineId: string,
    cwd: string
  ): string | undefined => {
    const [parent] = parentInstanceId
      ? ctx.db.getInstancesByIds([parentInstanceId])
      : [];
    if (parent) {
      return parent.projectId ?? undefined;
    }
    if (named && ctx.db.project(named)) {
      return named;
    }
    return ctx.db.projectHolding(machineId, cwd);
  };

  /** Sends a spawn and opens its row, on the account {@link spawnPlacement} gives. */
  const issueSpawn = (
    machineId: string,
    asked: NamedSpawn,
    /** Who asked for it: its row's origin. */
    by: SessionOrigin,
    workItemId?: string,
    fallbackMode?: string | null,
    placedAhead?: { accountId?: string }
  ): Envelope | undefined => {
    const agent = ctx.registry.agent(machineId);
    const refused = startRefusal(machineId, Boolean(asked.requestId));
    if (refused) {
      throw new Error(refused);
    }
    const settled = settleSpawn(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      throw new WorkItemRefusal(400, settled.refusal);
    }
    const { parentInstanceId } = peekParent(settled.payload);
    // Its machine is handed the project its row opens in, as every revive
    // hands it the row's (`revivePayloadOf`).
    const payload = {
      ...settled.payload,
      projectId: projectOfStart(
        parentInstanceId,
        settled.payload.projectId,
        machineId,
        settled.payload.cwd
      ),
    };
    const placed = spawnPlacement(machineId, payload, workItemId, placedAhead);
    // A start under an id that ran before: what it was handed and never read
    // its machine hands back as it replaces the process ({@link takeBack}).
    ctx.forgetPending(payload.instanceId, UNREAD.restarted, false, "all");
    ctx.openInstance({
      id: payload.instanceId,
      machineId,
      cwd: payload.cwd,
      sessionId: peekResume(payload),
      harness: payload.harness,
      origin: by,
      projectId: payload.projectId,
      title: payload.title,
      kind: peekKind(payload),
      permissionMode: settled.permissionMode,
      model: payload.model,
      mayStart: payload.mayStart,
      ...peekParent(payload),
      ...(workItemId ? { workItemId } : {}),
      ...(payload.role ? { role: payload.role } : {}),
      ...(payload.delegateType ? { delegateType: payload.delegateType } : {}),
      clean: payload.clean === true,
      ...openedAccount(payload, placed),
      // The account its start named, as placement honoured it.
      ...(payload.account && placed.accountId
        ? { namedAccount: placed.accountId }
        : {}),
      ...ctx.forkedFromOf(payload),
    });
    const sent = ctx.sendSpawn(agent, machineId, {
      verb: "spawn",
      machineId,
      instanceId: payload.instanceId,
      payload,
    } satisfies Envelope<SpawnPayload>);
    if (awaitsItsName(payload)) {
      ctx.awaitingFirstTurn.add(payload.instanceId);
    }
    ctx.publishInstances(machineId);
    const { parentInstanceId: spawnedBy } = peekParent(payload);
    if (spawnedBy) {
      for (const heard of delegateSpawned) {
        heard(spawnedBy);
      }
    }
    return sent;
  };

  /**
   * An in-process spawn, issued. One that carries a `requestId` (start_session's)
   * is held until its machine says the session is in place, and answers with
   * the machine's own words when it is not; one without is fire-and-forget,
   * its failure reaching the row and its parent later.
   */
  const relaySpawn = async (
    machineId: string,
    asked: NamedSpawn,
    by: SessionOrigin,
    fallbackMode?: string
  ): Promise<{ code: number; message: string } | undefined> => {
    const payload = await ctx.piDefaultFor(machineId, asked);
    if ("refusal" in payload) {
      return { code: 503, message: payload.refusal };
    }
    const { requestId } = payload;
    if (!requestId) {
      issueSpawn(machineId, payload, by, undefined, fallbackMode);
      return;
    }
    const reply = await ctx.awaitStart(
      machineId,
      payload.instanceId,
      requestId,
      () => issueSpawn(machineId, payload, by, undefined, fallbackMode)
    );
    switch (reply.kind) {
      case "unanswered":
        return {
          code: 504,
          message: `the session on ${ctx.machineName(machineId)} did not start within ${secondsOf(reply.after)} s`,
        };
      case "answered":
        if (!reply.value.ok) {
          return {
            code: 422,
            message: reply.value.error ?? "the session failed to start",
          };
        }
        return;
      default:
        throw unreachable(reply);
    }
  };

  /**
   * Shared by session tools and the hub's own starts; never an HTTP
   * door. Answers the folder the session runs in, as its row was filed
   * ({@link settleMode}'s settled cwd, a spin-off's worktree once made).
   */
  const spawnSession = async (
    machineId: string,
    payload: SpawnPayload,
    /** Who asked for it: its row's origin. */
    by: SessionOrigin,
    fallbackMode?: string
  ): Promise<MachinePath> => {
    const named = namedSpawn(payload);
    if ("refusal" in named) {
      throw new WorkItemRefusal(400, named.refusal);
    }
    const listed = (id: string) => ctx.db.listedInstancesByIds([id])[0];
    const refusal = enforceRowSessionKey(listed(named.instanceId), named);
    if (refusal) {
      throw new WorkItemRefusal(409, refusal);
    }
    if (
      !ctx.registry.agent(machineId) &&
      ctx.startHold(machineId)?.kind !== "away"
    ) {
      throw new WorkItemRefusal(404, ctx.machineFault(machineId, "offline"));
    }
    const { parentInstanceId } = peekParent(named);
    const refused = await relaySpawn(
      machineId,
      named,
      by,
      fallbackMode ??
        (parentInstanceId
          ? resolveDelegatePermissionMode(listed, parentInstanceId)
          : undefined)
    );
    if (refused) {
      throw new Error(refused.message);
    }
    const [row] = ctx.db.getInstancesByIds([payload.instanceId]);
    if (!row) {
      throw new Error(
        `the session ${payload.instanceId.slice(0, 8)} started, and the hub has no row for it`
      );
    }
    return row.cwd;
  };

  /**
   * Spawns a session from the hub itself — a continuation's summarisers and
   * its target — recorded exactly like a dashboard's spawn, and resolved once
   * the machine says the session is in place. A refusal is the machine's own
   * words.
   */
  const spawnFromHub = async (
    machineId: string,
    asked: NamedSpawn,
    kind: InstanceKind,
    /** Who it is (core `SessionOrigin`): a continuation's, its source's; a summariser, the hub's own check. */
    origin: SessionOrigin,
    fallbackMode?: string,
    /** The work item its row names from its first listing on: a continuation's, taken on from its source. */
    workItemId?: string
  ): Promise<void> => {
    const agent = ctx.registry.agent(machineId);
    if (!agent) {
      throw ctx.awayError(machineId);
    }
    const held = ctx.startHold(machineId);
    if (held) {
      throw new StartsHeld(machineId, held.words);
    }
    const named = await ctx.piDefaultFor(machineId, asked);
    if ("refusal" in named) {
      throw new Error(named.refusal);
    }
    const settled = settleSpawn(machineId, named, fallbackMode);
    if ("refusal" in settled) {
      throw new Error(settled.refusal);
    }
    // Its machine is handed the project its row opens in, as every revive
    // hands it the row's (`revivePayloadOf`).
    const payload = {
      ...settled.payload,
      projectId: projectOfStart(
        peekParent(settled.payload).parentInstanceId,
        settled.payload.projectId,
        machineId,
        settled.payload.cwd
      ),
    };
    const placed = placedOrRefused(machineId, payload);
    const requestId = crypto.randomUUID();
    // A start under an id that ran before: what it was handed and never read
    // its machine hands back as it replaces the process ({@link takeBack}).
    ctx.forgetPending(payload.instanceId, UNREAD.restarted, false, "all");
    ctx.openInstance({
      id: payload.instanceId,
      machineId,
      cwd: payload.cwd,
      harness: payload.harness,
      origin,
      projectId: payload.projectId,
      title: payload.title,
      kind,
      permissionMode: settled.permissionMode,
      model: payload.model,
      ...peekParent(payload),
      ...(workItemId ? { workItemId } : {}),
      ...openedAccount(payload, placed),
      ...ctx.forkedFromOf(payload),
    });
    ctx.publishInstances(machineId);
    const reply = await ctx.awaitStart(
      machineId,
      payload.instanceId,
      requestId,
      () =>
        ctx.sendAnswerable(agent, {
          verb: "spawn",
          machineId,
          instanceId: payload.instanceId,
          payload: { ...ctx.bounded(payload), requestId },
        } satisfies Envelope<SpawnPayload>)
    );
    switch (reply.kind) {
      case "unanswered":
        throw new Error(
          `the ${payload.harness} session on ${ctx.machineName(machineId)} did not start within ${secondsOf(reply.after)}s`
        );
      case "answered":
        if (!reply.value.ok) {
          throw reply.value.error === MACHINE_DISCONNECTED
            ? ctx.awayError(machineId)
            : new Error(reply.value.error ?? "the session failed to start");
        }
        return;
      default:
        throw unreachable(reply);
    }
  };

  /**
   * Puts one user message into a session, from the session it continues,
   * under `uuid`: its send record is what says it went.
   */
  const sendFromHub = (
    machineId: string,
    instanceId: string,
    content: string,
    from: LabelledRow,
    uuid: string,
    /** What rides it beside its words, as a dashboard's send carries it. */
    extras: Pick<SendPayload, "images" | "attachments"> = {},
    /** Who it is from, as its row says; absent, `from` as a peer. */
    origin?: SentMessage["origin"]
  ): void => {
    ctx.deliverSend({
      verb: "send",
      machineId,
      instanceId,
      payload: {
        ...(extras.images?.length ? { images: extras.images } : {}),
        ...(extras.attachments?.length
          ? { attachments: extras.attachments }
          : {}),
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: origin ?? {
            kind: "peer",
            from: from.id,
            name: sessionLabel(from).name,
            fromSession: from.id,
          },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  return {
    locateSession,
    tabNamed,
    turnWaiters,
    delegateSpawned,
    taskAccounts,
    placementInput,
    carryTestFor,
    owedTargets,
    openedAccount,
    placeSpawn,
    askedStart,
    placeItem,
    nextLaunchOn,
    atLaunchDir,
    launchRefusal,
    projectOfStart,
    issueSpawn,
    spawnSession,
    spawnFromHub,
    sendFromHub,
  };
};
