/**
 * Delegated work, as the hub keeps it. A work item is one brief run by one
 * session in one workspace — a fresh session, a fork of its parent's
 * conversation, or, for a follow-up, the workspace's last session carrying
 * on; a workspace is one shared clone on its own branch, with a boundary
 * every shell command of its items runs inside, and at most one live item —
 * the only writer its checkout has. Finished work takes another turn only
 * from the reader or the session that delegated it: that message reopens the
 * item and lands in the same session, on the transcript its provider still
 * has cached. A rule, the supervisor, a workflow or any other session is
 * refused — a standing instruction once woke a finished leaf into a checkout
 * a newer item owned.
 *
 * The hub is the one authority: `delegate` is a request to {@link start}, and
 * the frames that move a session move its item. An item carries acceptance
 * checks; it is `done` only when its session calls `finish_item` and the hub
 * has run every check in the item's worktree and seen it pass. The parent's
 * report is built by the hub from those results, never from the session's
 * prose.
 *
 * Slice 7b of Projects P1 adds four rules. A **group** (`group`) under one
 * parent reports once, combined, when every item of it has ended; a failure
 * still reports at once. **Owned files** (`owns` globs): two live items whose
 * globs overlap ({@link globsOverlap}) in one repository never run at once —
 * the later `delegate` is queued (`queued_work_items`) and starts as items
 * end. A **budget** (dollars, turns, minutes; the call's, else the task's,
 * else the project's) is checked in one place ({@link overBudget}); at its
 * limit the item fails, its parent is told, and its session is ended. The
 * project's **lead** may answer, steer and stop the project's items; their
 * reports and asks reach only the session that started each, the lead only
 * for the work he started ({@link reportees}). And the **plan ↔ to-do link**: a task attempt's plan, as
 * its plan panel reads it on any harness (CawCo's own steps where "CawCo's
 * to-dos" is on, else the harness's list), is read on its turn's end, a
 * completed `[td-n]` step ticks that to-do, `finish_item` asks once about the
 * to-dos still open, and steps left open become `(proposed)` to-dos.
 */
import type {
  CommandResult,
  DelegateType,
  EndedBy,
  Envelope,
  HarnessKind,
  InputFile,
  InputsRead,
  InstanceRow,
  LandsMode,
  NeutralOrigin,
  PermissionMode,
  PlanStep,
  SendPayload,
  SendRefusal,
  SessionRole,
  SpawnPayload,
  WorkItemSummary,
  WorkspaceArchive,
  WorkspaceArchived,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceCut,
  WorkspaceHolding,
  WorkspaceRef,
  WorkspaceUnlanded,
} from "@cawco/core";
import {
  byPerson,
  CONTROL_HOST_CHECKOUT,
  CONTROL_HOST_CHECKOUT_REMOVE,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_MIGRATE,
  DEPS_INSTALLING,
  depsScript,
  handoffMarker,
  holdingWords,
  machineLabel,
  namedAmong,
  namesAmong,
  sizeWords,
  type WorkspaceLanding,
  withInputsLine,
  withLandingLine,
  withWorkspaceLine,
} from "@cawco/core";
import {
  isMachinePath,
  type MachinePath,
  MachinePathRefused,
} from "@cawco/core/machine-path";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import {
  APPLE_GATE_CHECK,
  APPLE_GATE_COMMAND,
  APPLE_GATE_INPUTS,
  APPLE_GATE_TIMEOUT_SEC,
  appleGateDiff,
  appleGateRefusal,
  appleMachines,
  appPaths,
  diffPaths,
  lastMac,
} from "./apple-gate";
import type {
  DbShape,
  QueuedWorkItemRow,
  WorkItemRow,
  WorkspaceRow,
} from "./db";
import type {
  Origin,
  WorkBudget,
  WorkItemCheck,
  WorkItemSubmission,
  WorkOrigin,
} from "./db/schema";
import { leafOf, sessionLabel } from "./labels";
import {
  type BranchOutcome,
  type Failed,
  GATE_COVERS,
  type LandingTurn,
  land,
  landGateChecks,
  landingQueue,
  openPullRequest,
  pushBranch,
  quote,
  type Refusal,
  statusCommand,
} from "./landing";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { type CommandOptions, WouldWait } from "./machine-pause";
import {
  FOLDER_FILE_LIMIT,
  FolderRefusal,
  folderPath,
  projectRoot,
  writeFolderFiles,
} from "./project-folder";
import { placesChanged } from "./project-placements";
import type { Todo } from "./task-file";
import type { TodoChanges } from "./tasks";
import { unwatchedMode } from "./unwatched-mode";

/** How long the name a caller gives a delegate or a started session may run. */
export const SESSION_TITLE_MAX = 48;

/** What the caller's model is asked for when it names a delegate or a started session. */
export const SESSION_TITLE_DESCRIPTION =
  "What this delegate is doing, in 3–6 plain words, verb first, e.g. 'Fix tray chip overflow'. It names the session in the sidebar and the tray chip.";

/** Why a title a caller gave cannot name a session, or nothing when it can. */
export const titleProblem = (title: string): string | undefined => {
  const { length } = title.trim();
  if (!length) {
    return "title is blank. Name the work in 3–6 plain words, verb first, e.g. 'Fix tray chip overflow'.";
  }
  return length > SESSION_TITLE_MAX
    ? `title runs ${length} characters; the limit is ${SESSION_TITLE_MAX}. Name the work in 3–6 plain words, verb first.`
    : undefined;
};

/** What a leaf delegate hears when it tries to spawn — relayed verbatim to the model. */
export const LEAF_DELEGATE_REFUSAL =
  "This session is a leaf delegate — it was spawned with can_delegate=false and may not delegate or start sessions. Do the work yourself, or handoff to your parent session.";

/**
 * Who an item is started for: the session that delegated it, or, for a
 * routine's run, the routine ({@link routineParent}). What starting an item
 * reads of its parent and no more.
 */
export type Parent = Pick<
  InstanceRow,
  | "canDelegate"
  | "cwd"
  | "harness"
  | "id"
  | "launchDir"
  | "machineId"
  | "model"
  | "projectId"
  | "sessionId"
  | "title"
>;

/** What a routine's runs name as their parent: `routine:<id>`, which no session's row has. */
const ROUTINE_PARENT = "routine:";

/** The parent id a routine's runs carry, on their item and their session's row. */
export const routineParentId = (routineId: string): string =>
  `${ROUTINE_PARENT}${routineId}`;

/** Whether a parent id is a routine's: its runs report to no session (routines.ts reads their end). */
export const isRoutineParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(ROUTINE_PARENT);

/**
 * A routine as its run's parent: its project, and the machine and checkout
 * the run's workspace is cut from, under the routine's name.
 */
export const routineParent = (routine: {
  cwd: string;
  id: string;
  machineId: string;
  name: string;
  projectId: string | null;
}): Parent => ({
  id: routineParentId(routine.id),
  projectId: routine.projectId,
  machineId: routine.machineId,
  cwd: routine.cwd,
  title: routine.name,
  launchDir: "unknown",
  harness: "routine",
  model: null,
  sessionId: null,
  canDelegate: true,
});

/** The states that take messages; every other one is finished work. */
const LIVE: ReadonlySet<WorkItemRow["state"]> = new Set([
  "starting",
  "running",
]);

/** Whether an item in `state` is live work: starting or running. */
export const isLive = (state: WorkItemRow["state"]): boolean => LIVE.has(state);

/** A request the hub turns down, with the status and the words the caller reads. */
export class WorkItemRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(
    status: 400 | 403 | 404 | 409,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = status;
  }
}

/**
 * What a held workspace holds that is nowhere else, as its machine read it
 * once its boundary was closed (schema.ts `workspaces.holding`), and where
 * it is.
 */
export interface HeldWork extends WorkspaceHolding {
  /** When its machine read it, ISO. */
  heldAt: string;
  /** What it holds, in words: "2 commits on no remote, 3 changed files, 1 stash". */
  holds: string;
  machine: string;
  machineId: string;
  path: string;
  /** The clone's size on disk, in words. */
  size: string;
  workspaceId: string;
}

/**
 * A workspace closed on its machine: its row, archived, and the carry its
 * machine wrote first when its work was discarded; or, its clone holding
 * work that is nowhere else, its row held and `held` naming the work.
 */
export interface ArchivedWorkspace {
  carry: string | null;
  held?: HeldWork;
  workspace: WorkspaceRow;
}

/**
 * An archive refused because the clone holds work that is nowhere else: it
 * names what, the workspace is held, and nothing is deleted. `discard`
 * archives it anyway, its unlanded commits, changes and stashes saved to a
 * carry first.
 */
export class WorkspaceHoldsWork extends WorkItemRefusal {
  readonly held: HeldWork;
  constructor(held: HeldWork) {
    super(
      409,
      `Workspace ${held.workspaceId} on ${held.machine} holds ${held.holds} (${held.size} at ${held.path}), so it was not archived and nothing was deleted: it is held. Continue its work, or pass discard: true to archive it with its unlanded commits, changes and stashes saved to a carry in ~/.cawco/carries on ${held.machine}.`
    );
    this.held = held;
  }
}

/**
 * A start turned down because a live item owns files this one would own too
 * ({@link globsOverlap}): the caller queues it until `blocker` ends.
 */
export class OwnsOverlap extends WorkItemRefusal {
  readonly blocker: { id: string; title: string };
  constructor(blocker: { id: string; title: string }, globs: string) {
    super(
      409,
      `${blocker.title} (work item ${blocker.id}) is live and owns files this work owns too (${globs}); one writer per file, so this waits until it ends.`
    );
    this.blocker = blocker;
  }
}

/**
 * A start turned down because the machine it runs on is paused
 * (machine-pause.ts), `words` saying which and until when: `delegate`
 * queues it, and it starts once the pause ends; anything else is refused.
 */
export class MachinePaused extends WorkItemRefusal {
  readonly words: string;
  constructor(words: string) {
    super(
      409,
      `${words}, and nothing starts on it until then. Wait for it, or start this on another machine.`
    );
    this.words = words;
  }
}

// --- file ownership ------------------------------------------------------------

/** Globs one work item may own, and how long one may run. */
const OWNS_LIMIT = 50;
const GLOB_LIMIT = 200;
const GLOB_WILD = /[*?[{]/;
const LEADING_DOT_SLASH = /^(\.\/)+/;
const TRAILING_SLASH = /\/+$/;

/** A glob as ownership compares it: no leading `./`, no trailing `/`. */
const globOf = (raw: string): string =>
  raw.trim().replace(LEADING_DOT_SLASH, "").replace(TRAILING_SLASH, "");

/** Why owned globs cannot stand, or nothing when they can. */
export const ownsProblem = (owns: string[]): string | undefined => {
  if (owns.length > OWNS_LIMIT) {
    return `owns names ${owns.length} globs; it stops at ${OWNS_LIMIT}.`;
  }
  for (const raw of owns) {
    const glob = globOf(raw);
    if (!glob || glob.length > GLOB_LIMIT) {
      return `owns: “${raw}” is not a glob of ${GLOB_LIMIT} characters or fewer.`;
    }
    if (glob.startsWith("/") || glob.split("/").includes("..")) {
      return `owns: “${raw}” reaches outside the repository; name files from its root, like src/theme/** or docs/theme.md.`;
    }
  }
  return undefined;
};

/**
 * Whether two owned globs may name one file, judged conservatively on their
 * literal parts. A glob's literal part is what comes before its first
 * wildcard (`*`, `?`, `[`, `{`); `src/theme/**` → `src/theme/`, `**` → ``.
 * Two globs without wildcards are paths, and a path owns everything under
 * it: they overlap when they are equal or one is a folder of the other. When
 * either has a wildcard, they overlap when one literal part starts with the
 * other — `src/*.ts` and `src/ui/a.css` overlap though no file matches both,
 * which errs towards waiting, never towards two writers.
 */
export const globsOverlap = (
  a: readonly string[],
  b: readonly string[]
): string | undefined => {
  for (const first of a.map(globOf)) {
    for (const second of b.map(globOf)) {
      const wild = GLOB_WILD.test(first) || GLOB_WILD.test(second);
      const [p1] = first.split(GLOB_WILD);
      const [p2] = second.split(GLOB_WILD);
      const overlap = wild
        ? p1.startsWith(p2) || p2.startsWith(p1)
        : p1 === p2 || p1.startsWith(`${p2}/`) || p2.startsWith(`${p1}/`);
      if (overlap) {
        return first === second ? first : `${first} and ${second}`;
      }
    }
  }
  return undefined;
};

/** The repository an item works in: its project, else its machine and path. */
interface RepoRef {
  machineId: string;
  path: string;
  projectId: string | null;
}

/**
 * Whether two items work in one repository: one project, or (either without
 * a project) one machine and one path, a path under the other counting too.
 */
const sameRepo = (a: RepoRef, b: RepoRef): boolean =>
  a.projectId && b.projectId
    ? a.projectId === b.projectId
    : a.machineId === b.machineId &&
      (a.path === b.path ||
        a.path.startsWith(`${b.path}/`) ||
        b.path.startsWith(`${a.path}/`));

// --- budgets ---------------------------------------------------------------------

/** Why a budget cannot stand, or nothing when it can. */
export const budgetProblem = (budget: WorkBudget): string | undefined => {
  const { usd, turns, minutes } = budget;
  if (usd !== undefined && !(Number.isFinite(usd) && usd > 0)) {
    return "budget.usd is a number of dollars above 0.";
  }
  for (const [name, value] of [
    ["turns", turns],
    ["minutes", minutes],
  ] as const) {
    if (value !== undefined && !(Number.isInteger(value) && value >= 1)) {
      return `budget.${name} is a whole number from 1.`;
    }
  }
  return undefined;
};

/** What an item has used of a budget: dollars, turns ended, minutes since it started. */
export interface BudgetUse {
  minutes: number;
  turns: number;
  usd: number;
}

/**
 * THE budget check: the sentence that stops an item at its budget, or
 * nothing while it is within it. Every caller — a turn's end, the sweep,
 * and later a routine's run (P3) — comes here.
 */
export const overBudget = (
  budget: WorkBudget | null,
  used: BudgetUse
): string | undefined => {
  if (!budget) {
    return undefined;
  }
  if (budget.usd !== undefined && used.usd >= budget.usd) {
    return `The hub stopped this item at its budget: it spent $${used.usd.toFixed(2)} of its $${budget.usd.toFixed(2)}.`;
  }
  if (budget.turns !== undefined && used.turns >= budget.turns) {
    return `The hub stopped this item at its budget: it ended ${used.turns} of its ${counted(budget.turns, "turn")}.`;
  }
  if (budget.minutes !== undefined && used.minutes >= budget.minutes) {
    return `The hub stopped this item at its budget: it ran ${Math.floor(used.minutes)} of its ${counted(budget.minutes, "minute")}.`;
  }
  return undefined;
};

/** `1 turn`, `40 turns`. */
const counted = (count: number, one: string): string =>
  `${count} ${one}${count === 1 ? "" : "s"}`;

/** A budget's fields, each from the first that sets it; null when none does. */
export const budgetFrom = (
  ...budgets: (WorkBudget | null | undefined)[]
): WorkBudget | null => {
  const merged: WorkBudget = {};
  for (const budget of [...budgets].reverse()) {
    Object.assign(
      merged,
      Object.fromEntries(
        Object.entries(budget ?? {}).filter(([, value]) => value !== undefined)
      )
    );
  }
  return Object.keys(merged).length > 0 ? merged : null;
};

/** Statuses of a session whose process its machine confirmed gone. */
const GONE: ReadonlySet<string> = new Set(["stopped", "discarded"]);

/** The delegate type a session the fleet starts runs as when its caller names none. */
export const DEFAULT_DELEGATE_TYPE = "medium";

/**
 * What a session the fleet starts runs on — `delegate`'s and
 * `start_session`'s one rule, so neither ever leaves its model to the
 * machine's default. A named type sets harness and model, and an explicit
 * harness or model still overrides it. With no type, {@link
 * DEFAULT_DELEGATE_TYPE} applies; a harness other than that type's has no
 * model to take from it, so it must come with one.
 */
export const resolveSpawnType = (
  types: DelegateType[],
  request: { type?: string; harness?: HarnessKind; model?: string }
): { type?: DelegateType; harness: HarnessKind; model: string } => {
  const named = (name: string): DelegateType => {
    const found = types.find((entry) => entry.name === name);
    if (!found) {
      const names =
        types.map((entry) => entry.name).join(", ") || "none are configured";
      throw new WorkItemRefusal(
        400,
        `No delegate type "${name}". Available: ${names}.`
      );
    }
    return found;
  };
  const type = named(request.type ?? DEFAULT_DELEGATE_TYPE);
  if (request.type || !request.harness || request.harness === type.harness) {
    return {
      type,
      harness: request.harness ?? type.harness,
      model: request.model ?? type.model,
    };
  }
  if (!request.model) {
    throw new WorkItemRefusal(
      400,
      `No type was named, and the default type '${type.name}' runs on ${type.harness}, not ${request.harness}. Name a type, or a model for ${request.harness}.`
    );
  }
  return { harness: request.harness, model: request.model };
};

/** What `delegate` asks for. */
export interface WorkItemRequest {
  /** The account its session must run on (an id or label); placement chooses when absent. */
  account?: string;
  /** What it may spend before the hub stops it; the project's default fills what this leaves out. */
  budget?: WorkBudget;
  /**
   * A person started it himself (work_items.by_person): set by the
   * dispatcher for an attempt he started from the dashboard.
   */
  byPerson?: boolean;
  canDelegate?: boolean;
  /** Its acceptance checks: at least one. */
  checks: WorkItemCheck[];
  /** The repository a new workspace is cut from; the parent's directory by default. */
  cwd?: string;
  /**
   * The item's session forks its parent's conversation as it stands now, on
   * the parent's harness and model so the parent's prompt cache still holds.
   * Always a new workspace.
   */
  fork?: boolean;
  /** Its group under its parent: one combined report once every item of it has ended. */
  group?: string;
  harness?: HarnessKind;
  /**
   * Files on its parent's machine, by absolute path, copied into its
   * workspace's `$TMPDIR/inputs/` before the brief that names them
   * (agent inputs.ts): what its boundary cannot read where it lies.
   */
  inputs?: string[];
  /** Where its commits go once its checks pass; `main` when left out. */
  lands?: LandsMode;
  /** The machine a new workspace is cut on; the parent's by default. */
  machineId?: string;
  model?: string;
  /**
   * Whose work it is (work_items.origin). Left out, its parent's: Caw's, the
   * origin of the turn he is in; a work item's session, its own item's; any
   * other session's, `you`. The dispatcher and routines set it.
   */
  origin?: Origin;
  /**
   * Files in its workspace, as paths from the clone's root, that the hub
   * copies into its project's folder when it finishes. Needs a project.
   */
  outputs?: string[];
  /** Globs of the repository's files it owns: it waits while a live item's overlap them. */
  owns?: string[];
  parentInstanceId: string;
  prompt: string;
  /**
   * The ids a queued `delegate` stood under in its parent's tray while it
   * waited (the queued row's id, and a session id made then): its item and
   * its session take them when it starts, so its chip carries on. Set by the
   * hub when it queues the request, never by a caller.
   */
  queuedAs?: { id: string; instanceId: string };
  /**
   * The workspace of an earlier attempt at the same task (a retry): the item
   * runs in a fresh session there when its clone is still on its machine,
   * else in a new workspace as though this were not given. Either way, the
   * sessions of that workspace's earlier items are stopped first.
   */
  reuse?: string;
  /**
   * With `reuse`, the machines its workspace must be on (an attempt's
   * `runs_on`, dispatch.ts): one on any other machine is passed over as a
   * gone clone is, its sessions stopped, and the item cut a new workspace.
   */
  reuseOn?: string[];
  /**
   * The toolset its session runs in, over its type's: set by the hub alone
   * (a memory curator run's `curator`, routines.ts), never by a tool call.
   */
  role?: SessionRole;
  skills?: string[];
  /**
   * The project task the item is an attempt at (dispatch.ts). Only for a new
   * workspace; the item's session may write that task's to-dos.
   */
  task?: { id: string; projectId: string };
  /** What the caller named the work: the item's title and its session's. */
  title: string;
  type?: string;
  /**
   * An existing workspace's id or unique prefix: the item is its follow-up,
   * on the session its last item ran, so type, model, harness, skills and
   * fork are the session's own and not the request's to set.
   */
  workspace?: string;
}

/** A request as `queued_work_items` keeps it: with the ids it stands under while it waits. */
type QueuedRequest = WorkItemRequest &
  Required<Pick<WorkItemRequest, "queuedAs">>;

/**
 * A `delegate` waiting in the queue for owned files, as `delegate_list`
 * shows it: when it was queued, and the live item and globs that hold it
 * (null once its files are free and it is about to start).
 */
export interface QueuedDelegate {
  heldBy: { itemId: string; title: string; globs: string } | null;
  id: string;
  queuedAt: string;
  state: "queued";
  title: string;
}

export interface WorkItemStart {
  item: WorkItemRow;
  text: string;
  workspace: WorkspaceRow;
}

export interface WorkItemDeps {
  /**
   * Whether a send to the session is still pending, owed or handed, other
   * than a keep-alive ping (server.ts `awaitsSend`): that send is its next
   * turn, so nothing need wake it.
   */
  readonly awaitsSend: (instanceId: string) => boolean;
  /**
   * Before a workspace of `projectId` is cut from `cwd` on `machineId`: the
   * project's place that holds `cwd` made a git repository when it is a
   * plain folder (place-repo.ts `beforeCut`). Throws, in the machine's
   * words, when it cannot be one.
   */
  readonly beforeCut: (
    projectId: string,
    machineId: string,
    cwd: string
  ) => Promise<void>;
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  /**
   * Runs a command on a machine, in a directory — inside `workspace`'s
   * boundary when one is named; throws when the machine cannot. Its limit
   * stands while it waits for a shared machine slot; on a paused machine it
   * waits for the pause's end, and one a pause cancels runs again after it
   * (or answers `cancelled`, `how.movable`); `how.onWait` hears each wait.
   */
  readonly command: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef,
    how?: CommandOptions
  ) => Promise<CommandResult>;
  readonly db: DbShape;
  /**
   * Store stop intent and wait for the machine's positive end confirmation,
   * for `waitMs` at most. Returns at once for a session already ended or with
   * no process on its machine.
   */
  readonly end: (instanceId: string, waitMs?: number) => Promise<void>;
  /**
   * THE gate on input to a session (server.ts `inputRefusal`): why a message
   * from `origin` may not reach it now, or nothing when it may.
   */
  readonly inputRefusal: (
    instanceId: string,
    origin: NeutralOrigin
  ) => { reason: string } | undefined;
  /** The agent's live turn state, including a long tool call with no output. */
  readonly inTurn: (row: InstanceRow) => boolean;
  /**
   * An item went from live to finished (done, failed or cancelled), as
   * written. Called in the same step; whoever listens defers its own work.
   */
  readonly itemEnded?: (item: WorkItemRow) => void;
  /**
   * The boundary of a project's Caw, his place's (caw.ts `leadPlaceRef`);
   * none for any other session. With a work item's workspace, what tells
   * whether a session runs inside a boundary at all.
   */
  readonly leadPlace: (row: InstanceRow) => WorkspaceRef | undefined;
  /**
   * The origin of the turn a project's Caw is in (caw.ts `turnOrigin`), when
   * `instanceId` is a project's lead; undefined for any other session.
   */
  readonly leadTurn?: (instanceId: string) => WorkOrigin | undefined;
  /** Runs the budget sweep and every wait's timer until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Resolves once `machineId`'s pause is over; at once when it is not paused. */
  readonly machineFree: (machineId: string) => Promise<void>;
  /**
   * "Omars-MacBook-Pro is paused until 00:57" while the owner has paused
   * `machineId` (machine-pause.ts); undefined when it is not paused.
   */
  readonly machinePaused: (machineId: string) => string | undefined;
  /**
   * Why `machineId` would not run `model` on `harness`, in words naming the
   * models it does offer from that provider; undefined when it offers it, or
   * when the machine has reported no models to judge by.
   */
  readonly modelRefusal: (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined
  ) => string | undefined;
  /** Whether `machineId`'s agent is connected now: the Apple build gate runs only on one that is. */
  readonly online: (machineId: string) => boolean;
  /** Tells every dashboard an item moved: its parent's delegate tray follows it. */
  /**
   * Why an attempt at one of the project's tasks may not start now: its spend
   * cap holds (project-caps.ts `pauses`); nothing when it may.
   */
  readonly pauses: (projectId: string) => string | undefined;
  /**
   * A new workspace's first session placed before the workspace is cut
   * ({@link ItemPlacement}), on the project and task its item will name.
   * Throws the refusal its start would.
   */
  readonly placeAhead: (
    machineId: string,
    session: Omit<SpawnPayload, "cwd">,
    task: { projectId: string | null; taskId?: string }
  ) => ItemPlacement;
  /**
   * The session's plan steps as its plan panel reads them (plans.ts): CawCo's
   * own list where "CawCo's to-dos" is on for it, else its harness's (Claude
   * Code's ledger, OpenCode's todos). The plan ↔ to-do link reads these.
   */
  readonly planSteps: (instanceId: string) => Promise<PlanStep[]>;
  readonly publish: (item: WorkItemSummary) => void;
  /**
   * The retired workspace of `instanceId`'s item is cut again
   * ({@link WorkItems.recutFor}): what was kept at the hub for the session
   * meanwhile goes to it now, waking it (server.ts `releaseOwed`).
   */
  readonly recutDone?: (instanceId: string) => void;
  /** It could not be cut again, for `reason`: what was kept for the session fails with it. */
  readonly recutFailed?: (instanceId: string, reason: string) => void;
  /**
   * Hands a report to the parent of the item's session: `body` the full
   * report, `headline` its one-or-two-sentence outcome when there is one.
   */
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean,
    headline?: string
  ) => void;
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  /** Where a reader opens a session in the dashboard: the link a pull request carries back. */
  readonly sessionUrl?: (instanceId: string) => string;
  /**
   * Sends a spawn and records its row under the work item. `fallbackMode` is
   * the mode it runs in when its harness has modes; the hub's one rule
   * settles it (none at all for a harness without modes). `placed`: the
   * account {@link placeAhead} put it on, which it opens on without being placed
   * again; absent, it is placed now.
   */
  readonly spawn: (
    machineId: string,
    payload: SpawnPayload,
    workItemId: string,
    fallbackMode: PermissionMode,
    placed?: { accountId?: string }
  ) => void;
  /**
   * An item's session was filed under its parent's turn (memory.ts
   * `TurnWatch.spawned`): a routine run's turn makes its children the run's.
   */
  readonly spawnedUnder?: (instanceId: string, parentId: string) => void;
  /** A task's title as its project's index has it: a pull request's title. */
  readonly taskTitle?: (
    projectId: string,
    taskId: string
  ) => string | undefined;
  /**
   * A project task's to-dos (tasks.ts), for the plan ↔ to-do link: read them,
   * and tick or propose them as the hub. Without it the link is off.
   */
  readonly todos?: {
    read: (projectId: string, taskId: string) => Promise<Todo[]>;
    write: (
      projectId: string,
      taskId: string,
      changes: TodoChanges,
      reason: string
    ) => Promise<unknown>;
  };
  /** The delegate types a session of the project sees (the fleet's without one), read at dispatch. */
  readonly types: (projectId?: string | null) => DelegateType[];
  /** A workspace was settled on its machine, archived or held: the dashboards draw it so. */
  readonly workspaceChanged?: (workspace: WorkspaceRow) => void;
}

/** A plan item's to-do id, `[td-3] Persist the choice` → `td-3`. */
const PLAN_TODO = /\[(td-\d{1,6})\]/;
/** Plan items one attempt may leave behind as proposed to-dos. */
const PROPOSALS_LIMIT = 20;
/**
 * How often the hub looks at every live item's budget, between turns, and
 * for items whose session is gone or asleep: the first look comes this long
 * after the hub starts.
 */
const BUDGET_SWEEP_MS = 30_000;

/** Why a live item whose session row no longer exists fails. */
const SESSION_GONE = "its session is gone";
/** A session row in `error` that kept no words for why. */
const SESSION_FAILED_UNSAID =
  "Its session failed, and its machine sent no words for why.";

/**
 * Wakes in a row the sweep gives one item's session with no turn of it ending
 * between them; found asleep again after the last, the item fails. Two (our
 * call): one wake answers a process lost once, a second a loss that raced the
 * first wake, and a third sleep with no turn ended is something that keeps
 * stopping the session, which a wake would only feed.
 */
const SLEEP_WAKES = 2;

/** What the sweep's wake tells a session asleep on open work. */
const STILL_OPEN = "Your work item is still open: continue it.";

/** Whose word the sweep's wake is: the hub's about an item, as the quiet-turn word is. */
const WAKE_ORIGIN: NeutralOrigin = { kind: "system", name: "work-item" };

/**
 * How long archiving waits on a running session's machine to confirm its
 * stop: well inside the hub's 120 s HTTP idle timeout (index.ts).
 */
const ARCHIVE_STOP_WAIT_MS = 30_000;

/** The last path segment — how the rail names a session. */
/**
 * How an item's session runs: the request's word, then its type's, then a
 * leaf on claude. A fork runs on its parent's harness and model instead, and
 * resumes the parent's conversation under `forkOf`, its current session key.
 */
interface Settings {
  account?: string;
  canDelegate: boolean;
  forkOf?: string;
  harness: HarnessKind;
  model?: string;
  /** The request's role, over its type's ({@link WorkItemRequest.role}). */
  role?: SessionRole;
  skills?: string[];
  type?: DelegateType;
}

/**
 * A new workspace's first session, placed before the workspace is cut: the
 * account its row opens on (`accountId`), and the Claude account its launch
 * runs on (`launchesOn`), as the hub's launch grant will name it. The
 * workspace's boundary starts reading `launchesOn`'s user layer, so the
 * session's spawn finds the boundary in its form and hands it over to no new
 * generation.
 */
export interface ItemPlacement {
  accountId?: string;
  launchesOn?: string;
}

/** A workspace as its machine is told about it. */
const refOf = (workspace: WorkspaceRow): WorkspaceRef => ({
  id: workspace.id,
  path: workspace.path,
});

/**
 * The item's session: nested under its parent, working in the workspace's
 * checkout, every shell command inside the workspace's boundary, and its
 * parent's project's, as the workspace is one of that project's places.
 */
const spawnOf = (
  instanceId: string,
  title: string,
  parent: Parent,
  workspace: WorkspaceRow,
  settings: Settings
): SpawnPayload => ({
  ...sessionOf(instanceId, title, parent, settings),
  cwd: workspace.path,
  workspace: refOf(workspace),
});

/** {@link spawnOf} but where it works: what placement reads of the session. */
const sessionOf = (
  instanceId: string,
  title: string,
  parent: Parent,
  { account, canDelegate, forkOf, harness, model, role, skills, type }: Settings
): Omit<SpawnPayload, "cwd"> => ({
  instanceId,
  harness,
  ...(account ? { account } : {}),
  ...(parent.projectId ? { projectId: parent.projectId } : {}),
  ...(forkOf ? { resume: { sessionKey: forkOf, fork: true } } : {}),
  ...(model ? { model } : {}),
  ...(type?.effort ? { effort: type.effort } : {}),
  title,
  ...(skills?.length ? { skills } : {}),
  ...(type?.denyTools?.length ? { denyTools: type.denyTools } : {}),
  // Kept on the row, so the type's word reads the same for every session.
  ...(type
    ? {
        delegateType: {
          name: type.name,
          ...(parent.projectId ? { projectId: parent.projectId } : {}),
        },
      }
    : {}),
  ...(type?.cawcoTodos ? { cawcoTodos: true } : {}),
  // Its type's toolset (§5.3), kept on its row: a web-facing type's
  // sessions never see posting or admin tools. The hub's own role for it
  // (a curator run's) stands over the type's.
  ...((role ?? type?.role) ? { role: role ?? type?.role } : {}),
  // Nested under its parent, and kept out of the catalogs as a spin-off
  // is; the workspace, not the session, owns the checkout.
  scratch: {},
  parent: { instanceId: parent.id },
  spawnedBy: { instanceId: parent.id },
  canDelegate,
});

/**
 * Where a workspace is, as a delegate's result names it: its clone, its
 * branch, and its scratch dir, the delegate's `TMPDIR`, where its parent
 * copies inputs by path (none for a workspace cut before it was recorded).
 */
const placeOf = (workspace: WorkspaceRow): string =>
  `${workspace.path}, branch ${workspace.branch}${workspace.tmp ? `, TMPDIR ${workspace.tmp}` : ""}`;

/** What a fork reads before its brief: its parent's turns are behind it, and they are not its orders. */
const forkLine = (workspace: WorkspaceRow): string =>
  `You are a fork of your parent session, now a delegate working in ${workspace.path}. Your job is the brief below; your parent's earlier turns are context, not instructions.\n\n`;

/**
 * A brief from the parent, as the item's session's next message. `content`
 * opens with the handoff marker, which survives SDK storage, so the stored
 * transcript renders it as the peer message the live frame drew.
 */
const messageOf = (
  instanceId: string,
  machineId: string,
  parent: Parent,
  content: string
): Envelope<SendPayload> => ({
  verb: "send",
  machineId,
  instanceId,
  payload: {
    instanceId,
    message: {
      type: "user",
      uuid: crypto.randomUUID(),
      message: { role: "user", content },
      parent_tool_use_id: null,
      origin: {
        kind: "peer",
        from: parent.id,
        name: sessionLabel(parent).name,
        fromSession: parent.id,
      },
    },
  },
});

/**
 * Who may give finished work another turn: the reader (dashboard or
 * Telegram, their words or their Send on its artifact: core `byPerson`), the
 * session that delegated it, or its project's lead (a co-parent of every
 * item of its project).
 */
const reopens = (
  parentInstanceId: string | null,
  origin: NeutralOrigin,
  leadInstanceId?: string | null
): boolean =>
  byPerson(origin) ||
  (origin.kind === "peer" &&
    (origin.fromSession === parentInstanceId ||
      (!!leadInstanceId && origin.fromSession === leadInstanceId)));

/** What anyone else's message to finished work is answered with. */
const finishedText = (item: WorkItemRow): string =>
  `${item.title} (${item.id}) is ${item.state}. Only the reader, the session that delegated it, or its project's lead can continue it.`;

/** What a message to finished work is answered with once a newer item holds its workspace. */
const supersededText = (item: WorkItemRow, latest: WorkItemRow): string =>
  `${item.title} (${item.id}) is ${item.state}, and workspace ${item.workspaceId} has moved on to ${latest.title} (${latest.id}, ${latest.state}). Message that one.`;

/** The line a parent's report carries about the item behind it. */
const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}.]`
    : `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}. A handoff to it continues this same session.]`;

/** The first line with words on it. */
const firstLine = (text: string | null): string =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** How long a check runs when it names no limit, and the most it may name. */
const CHECK_TIMEOUT_SEC = 600;
const CHECK_TIMEOUT_MAX_SEC = 3600;

/** How long the report's git reads may take. */
const GIT_TIMEOUT_MS = 60_000;

/**
 * The commits a worktree's session made since `since` (unix seconds) that
 * HEAD still holds, one hash per line. It runs on the machine and prints
 * only the hashes, so the whole reflog never crosses the wire: its HEAD entries whose
 * action made or rewrote a commit (commit, amend, merge, cherry-pick, a
 * rebase pick), written at or after `since`, each once, kept while
 * `git merge-base --is-ancestor` says HEAD holds it.
 */
const keptCommits = (since: number): string =>
  `git reflog --date=unix --format='%H %gd %gs' HEAD` +
  ` | grep -E '^[0-9a-f]{40} HEAD@\\{[0-9]+\\} (commit|commit \\((amend|merge)\\)|cherry-pick|rebase( -i)? \\((pick|reword|edit|squash|fixup)\\)): '` +
  ` | awk -v since=${since} '{ t = $2; gsub(/[^0-9]/, "", t) } t + 0 >= since && !seen[$1]++ { print $1 }'` +
  ` | while read -r c; do git merge-base --is-ancestor "$c" HEAD && echo "$c"; done`;

/** Lines of diffstat a report keeps: the last, its summary, always among them. */
const DIFFSTAT_LINES = 40;

/** Quiet turns in a row an item survives: the next one fails it. */
const QUIET_TURNS = 3;

const QUIET_ERROR = "ended three turns in a row without finish_item";

/** A harness gets one minute after its declared deadline to start a turn. */
const WAIT_RESUME_GRACE_MS = 60_000;
const waitClock = (at: Date): string =>
  at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const WAIT_ITEM_LIMIT =
  "Wait not set. Use whole minutes from 1 to 120 and a non-empty reason for waiting on a command you started.";

const WORD = /\s+/;

/** Why a `delegate` call's checks cannot stand, or nothing when they can. */
export const checksProblem = (checks: WorkItemCheck[]): string | undefined => {
  if (checks.length === 0) {
    return "checks is empty: give at least one acceptance check.";
  }
  for (const check of checks) {
    const words = check.name.trim().split(WORD).filter(Boolean).length;
    if (words < 2 || words > 6) {
      return `check "${check.name}": name it in 2 to 6 plain words.`;
    }
    if (!check.command.trim()) {
      return `check "${check.name}": command is blank.`;
    }
    if (check.machine !== undefined && !check.machine.trim()) {
      return `check "${check.name}": machine is blank; name one, or leave it out to run the check on the workspace's own machine.`;
    }
    const limit = check.timeoutSec;
    if (
      limit !== undefined &&
      !(Number.isInteger(limit) && limit >= 1 && limit <= CHECK_TIMEOUT_MAX_SEC)
    ) {
      return `check "${check.name}": timeoutSec must be a whole number from 1 to ${CHECK_TIMEOUT_MAX_SEC}.`;
    }
  }
  return undefined;
};

/** Why a request's title, checks, owned files, budget or group cannot stand; nothing when they can. */
const requestProblem = (request: WorkItemRequest): string | undefined =>
  titleProblem(request.title) ??
  checksProblem(request.checks) ??
  (request.owns ? ownsProblem(request.owns) : undefined) ??
  (request.budget ? budgetProblem(request.budget) : undefined) ??
  (request.group !== undefined && !request.group.trim()
    ? "group is blank: name it, like 'theme'."
    : undefined);

/** A path as the project's folder reads it, or undefined when the folder refuses it. */
const folderPathOf = (raw: string): string | undefined => {
  try {
    return folderPath(raw);
  } catch (error) {
    if (error instanceof FolderRefusal) {
      return undefined;
    }
    throw error;
  }
};

/** Outputs one work item may name. */
const OUTPUTS_LIMIT = 50;

/**
 * A request's outputs as paths from the clone's root, each once; null for
 * none. Refused when one could reach outside the clone or into its history,
 * the same rules a path in the project's folder follows (where they go).
 */
const outputsOf = (outputs: string[] | undefined): string[] | null => {
  if (!outputs?.length) {
    return null;
  }
  if (outputs.length > OUTPUTS_LIMIT) {
    throw new WorkItemRefusal(
      400,
      `outputs names ${outputs.length} files; it stops at ${OUTPUTS_LIMIT}.`
    );
  }
  const paths = outputs.map((raw) => {
    const path = folderPathOf(raw.trim());
    if (path === undefined) {
      throw new WorkItemRefusal(
        400,
        `outputs: “${raw}” is not a path inside the workspace. Name each file from the workspace's root, like report.md or docs/notes.md: no leading "/", no "..", nothing under .git.`
      );
    }
    if (!path) {
      throw new WorkItemRefusal(
        400,
        `outputs: “${raw}” names the workspace itself; name a file in it, like report.md.`
      );
    }
    return path;
  });
  return [...new Set(paths)];
};

/** What an item's branch and its assets folder are named by: its task, else its own short id. */
const landingKey = (item: Pick<WorkItemRow, "id" | "taskId">): string =>
  item.taskId ?? item.id.slice(0, 8);

/** The branch an item that lands `branch` or `pr` is pushed to: `cawco/tsk-12`. */
/**
 * Where an item's outputs land in its project's folder: `assets/tsk-12/`
 * for an attempt at a task, `assets/<item>/` for a work item of none.
 */
export const outputsFolder = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `assets/${landingKey(item)}`;

export const landingBranch = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `cawco/${landingKey(item)}`;

/** How an item lands, as its session is told. */
const landingOf = (item: WorkItemRow): WorkspaceLanding => ({
  lands: item.lands,
  ...(item.outputs?.length ? { outputs: item.outputs } : {}),
});

const MIB = 1024 * 1024;

/** The shell that says of each output whether it is missing, a link, or a file of some size. */
const outputsProbe = (outputs: string[]): string =>
  outputs
    .map(
      (path) =>
        `p=${quote(path)}; if [ -L "$p" ]; then echo "link $p"; elif [ ! -f "$p" ]; then echo "missing $p"; else echo "size $(wc -c < "$p" | tr -d ' ') $p"; fi`
    )
    .join("; ");

/** What a probe's answer says is wrong with the outputs, a sentence each. */
const outputsSaid = (stdout: string): string[] => {
  const by = { missing: [] as string[], link: [] as string[] };
  const large: string[] = [];
  for (const line of stdout.split("\n")) {
    const [word, ...rest] = line.split(" ");
    if (word === "missing" || word === "link") {
      by[word].push(rest.join(" "));
    } else if (word === "size" && Number(rest[0]) > FOLDER_FILE_LIMIT) {
      large.push(
        `${rest.slice(1).join(" ")} is ${(Number(rest[0]) / MIB).toFixed(2)} MiB`
      );
    }
  }
  return [
    ...(by.missing.length > 0
      ? [
          `These outputs are not in your workspace: ${by.missing.join(", ")}; write each at its path from the workspace's root.`,
        ]
      : []),
    ...(by.link.length > 0
      ? [
          `These outputs are links, and the hub copies files: ${by.link.join(", ")}. Write the file itself at that path.`,
        ]
      : []),
    ...(large.length > 0
      ? [
          `${large.join("; ")}; an output stops at ${FOLDER_FILE_LIMIT / MIB} MiB.`,
        ]
      : []),
  ];
};

/** A command's failure in a few words: what it wrote, else its exit code. */
const failedWith = (result: CommandResult): string =>
  (result.stderr || result.stdout).trim() || `exit ${result.exitCode}`;

/** How much of each stream a check keeps: `expect` and the report read this. */
const CHECK_TAIL = 4000;

/** A check's command result, each stream cut to its last {@link CHECK_TAIL} characters. */
const checkTails = (result: CommandResult): CommandResult => ({
  exitCode: result.exitCode,
  stdout: result.stdout.slice(-CHECK_TAIL),
  stderr: result.stderr.slice(-CHECK_TAIL),
});

/** One check, as the hub ran it: `result` holds the stream tails. */
interface CheckOutcome {
  check: WorkItemCheck;
  durationMs: number;
  exitCode: number;
  passed: boolean;
  result: CommandResult;
  /**
   * Why a check did not run, its pass carried over ({@link checkOnce}):
   * `passed on this tree at finish_item`.
   */
  skipped?: string;
  /** Where a check that names another machine ran: `on Omars-MacBook-Pro at 1a2b3c4d5`. */
  where?: string;
}

/**
 * A check command that passed on a tree, with the `expect` it passed with
 * and the stage it ran in (`at finish_item`, `while gating on top of main`,
 * `in its turn to land on main`), for the line of a check its pass lets skip.
 */
interface Passed {
  command: string;
  expect: string | undefined;
  stage: string;
}

/**
 * The paths a check's command reads, for the commands that declare them: its
 * pass is kept and matched by those paths' trees rather than the whole
 * tree's, so it holds after a rebase that left them as they were (the Apple
 * gate's compile, apple-gate.ts {@link APPLE_GATE_INPUTS}). Every other check
 * is kept and matched by the whole tree.
 */
const CHECK_INPUTS: Readonly<Record<string, readonly string[]>> = {
  [APPLE_GATE_COMMAND]: APPLE_GATE_INPUTS,
};
/** Every path a check declares, read once per look at the workspace. */
const INPUT_PATHS = [...new Set(Object.values(CHECK_INPUTS).flat())];

/**
 * A clean workspace as {@link checkOnce} keys passes by it: `tree`, HEAD's
 * tree with the item's outputs' contents beside it; `inputs`, the tree of
 * each declared input path at HEAD (`absent` where HEAD has none); `outputs`,
 * each output's content hash; `stamp`, all of it, to tell whether the
 * workspace moved during a run.
 */
interface Checked {
  inputs: ReadonlyMap<string, string>;
  outputs: ReadonlyMap<string, string>;
  stamp: string;
  tree: string;
}

/**
 * Where `check`'s pass is kept in `state`, and how its skip says where it
 * passed: the whole tree, or, for a check that declares inputs, those paths'
 * trees (and the contents of any output under them).
 */
const passKey = (
  check: WorkItemCheck,
  state: Checked
): { key: string; said: (stage: string) => string } => {
  const inputs = CHECK_INPUTS[check.command.trim()];
  if (!inputs) {
    return {
      key: state.tree,
      said: (stage) => `passed on this tree ${stage}`,
    };
  }
  const parts = inputs.flatMap((path) => [
    `${path}=${state.inputs.get(path) ?? "absent"}`,
    ...[...state.outputs]
      .filter(([output]) => output === path || output.startsWith(`${path}/`))
      .map(([output, hash]) => `${output}=${hash}`),
  ]);
  return {
    key: `inputs ${parts.join(" ")}`,
    said: (stage) => `passed ${stage} on the same ${inputs.join(" and ")} tree`,
  };
};

/**
 * Why `check` need not run where `passed` passed (all kept under its
 * {@link passKey}, which `said` names): the same command passed there (with
 * the same `expect`, when it has one), or one that covers it did (landing.ts
 * {@link GATE_COVERS}). Undefined when it must run.
 */
const priorPass = (
  check: WorkItemCheck,
  passed: Passed[],
  said: (stage: string) => string
): string | undefined => {
  const command = check.command.trim();
  const same = passed.find(
    (each) =>
      each.command === command &&
      (check.expect === undefined || each.expect === check.expect)
  );
  if (same) {
    return said(same.stage);
  }
  const covers = GATE_COVERS[command] ?? [];
  const cover =
    check.expect === undefined
      ? passed.find((each) => covers.includes(each.command))
      : undefined;
  return cover
    ? `${cover.command}, which covers it, ${said(cover.stage)}`
    : undefined;
};

/**
 * An install {@link depsScript} ran ahead of the checks: not one of the
 * item's checks, and never counted with them.
 */
interface InstallOutcome {
  durationMs: number;
  passed: boolean;
  result: CommandResult;
  /** What it said it ran: `bun install (bun.lock changed …)`. */
  said: string;
  /** Where it ran, when on another machine's check workspace. */
  where?: string;
}

/**
 * A check run: the installs it made first, and the checks' own outcomes,
 * none of them when the workspace's own install failed.
 */
interface CheckRun {
  installs: InstallOutcome[];
  outcomes: CheckOutcome[];
}

/**
 * How a check run waits. At finish_item and while an item gates (`inTurn`
 * false) its checks wait out their machine's pause and the shared slots they
 * need, `say` hearing each wait with the name of the check that waits (null
 * once none does). In the landing turn (`inTurn` true) nothing waits: a
 * check due there that runs on another machine or on the host, or one (or its
 * dependency install) that would wait for a pause or a slot, throws
 * {@link WouldWait}, and the item steps out of its turn (landing.ts).
 */
interface CheckHow {
  inTurn: boolean;
  say: (words: string | null, check?: string) => void;
}

/**
 * The turn runs only what runs in the workspace itself: a due check that
 * runs on another machine (the Apple gate's build on a Mac) or on the host is
 * the gate's, outside the queue. Throws {@link WouldWait} naming the first
 * such check, before any of them runs; nothing when there is none.
 */
const refuseAway = (
  checks: WorkItemCheck[],
  machineId: string,
  named: (machineId: string) => string
): void => {
  const away = checks.find(
    (check) => check.host || (check.machine && check.machine !== machineId)
  );
  if (away) {
    throw new WouldWait(
      `${away.name} runs on ${named(away.machine ?? machineId)}${away.host ? ", outside its workspace" : ""}`
    );
  }
};

/**
 * Rethrows `error`: a {@link WouldWait} from `what`'s run saying that it was
 * `what` that would have waited, any other as it was.
 */
function waitedIn(error: unknown, what: string): never {
  if (error instanceof WouldWait) {
    throw new WouldWait(`${what} would have waited: ${error.message}`, {
      cause: error,
    });
  }
  throw error;
}

/** One check that ran to its end, and where, when on another machine. */
interface Ran {
  complete: CommandResult;
  where: string | undefined;
}

/** A check's install a machine's pause cancelled: it runs again with its check. */
class PausedRun extends Error {
  constructor() {
    super("cancelled by its machine's pause");
  }
}

/** Whether a run fails: an install that failed, or a check. */
const runFailed = (run: CheckRun): boolean =>
  run.installs.some((install) => !install.passed) ||
  run.outcomes.some((outcome) => !outcome.passed);

/** A fenced block that no command output can close early. */
const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;

/**
 * An install's line above the checks: what it ran, and on a failure the
 * installer's output (and its stderr, for the delegate).
 */
const installLine = (
  { said, passed, result, durationMs, where }: InstallOutcome,
  withStderr = false
): string => {
  const facts = `${passed ? "" : `exit ${result.exitCode}, `}${(durationMs / 1000).toFixed(1)}s${where ? `, ${where}` : ""}`;
  const line = `- ${passed ? "installed dependencies" : "dependencies didn't install"}: ${said} (${facts})`;
  if (passed) {
    return line;
  }
  const out = result.stdout.trim() ? `${line}${fenced(result.stdout)}` : line;
  return withStderr && result.stderr.trim()
    ? `${out}\nstderr:${fenced(result.stderr)}`
    : out;
};

/** A run's install lines, each on its own line ahead of the checks; empty without one. */
const installLines = (run: CheckRun, withStderr = false): string =>
  run.installs.map((each) => `${installLine(each, withStderr)}\n`).join("");

/**
 * A failed run as the delegate reads it: `head`, when the workspace's
 * install failed, that no check ran, else how many of the item's checks
 * failed; `lines`, the install lines and then the checks', failures first.
 */
const failedRun = (run: CheckRun): { head: string; lines: string } => {
  const failing = run.outcomes.filter((outcome) => !outcome.passed);
  const passing = run.outcomes.filter((outcome) => outcome.passed);
  return {
    head:
      run.outcomes.length === 0
        ? "Dependencies didn't install, so no checks ran."
        : `${failing.length} of ${run.outcomes.length} checks failed.`,
    lines:
      `${installLines(run, true)}${[...failing, ...passing].map(checkResultLine).join("\n")}`.trimEnd(),
  };
};

/**
 * A check's line: its name, pass or fail, exit code and duration. A failure
 * carries its stdout tail under it; a pass is the line alone.
 */
const checkLine = ({
  check,
  passed,
  exitCode,
  durationMs,
  result,
  skipped,
  where,
}: CheckOutcome): string => {
  if (skipped) {
    return `- ${check.name}: pass (not run again: ${skipped})`;
  }
  const missing =
    exitCode === 0 && !passed && check.expect !== undefined
      ? `, stdout does not contain ${JSON.stringify(check.expect)}`
      : "";
  const line = `- ${check.name}: ${passed ? "pass" : "fail"} (exit ${exitCode}, ${(durationMs / 1000).toFixed(1)}s${missing}${where ? `, ${where}` : ""})`;
  // A pass is its line: its output is the report's length, not its news.
  return !passed && result.stdout.trim()
    ? `${line}${fenced(result.stdout)}`
    : line;
};

/** A run's passed installs, as the landing line says them; empty without one. */
const installedSaid = (run: CheckRun): string =>
  run.installs
    .filter((each) => each.passed)
    .map((each) => `, installing dependencies first: ${each.said}`)
    .join("");

/** A gate's or a turn's run as the landing line says it: each check, run or not and why. */
const ranSaid = (run: CheckRun | undefined): string =>
  run && run.outcomes.length > 0
    ? `: ${run.outcomes
        .map((each) =>
          each.skipped
            ? `${each.check.name} not run again (${each.skipped})`
            : `${each.check.name} ran and passed`
        )
        .join(", ")}${installedSaid(run)}`
    : "";

/**
 * The landing line of an item that landed: where, what its last gate on top
 * of the branch ran, and what its turn ran again after the turn's rebase
 * (nothing when the branch had not moved since), and each time it stepped
 * out of its turn.
 */
const landedLine = (
  base: string,
  landed: { rebased: boolean; sha: string },
  runs: { gate?: CheckRun; turn?: CheckRun },
  steps: string[]
): string => {
  const turn = landed.rebased
    ? `${base} had moved by its turn, so it rebased again${ranSaid(runs.turn) || ", with no checks to run"}`
    : `${base} had not moved by its turn, so nothing ran again`;
  const stepped =
    steps.length > 0
      ? `; it stepped out of its turn ${steps.length === 1 ? "once" : `${steps.length} times`} to gate again, the last time because ${steps.at(-1)}`
      : "";
  return `Landed on ${base} at ${landed.sha.slice(0, 9)}; gated on top of ${base}${ranSaid(runs.gate)}; ${turn}${stepped}.`;
};

/** A check as the delegate reads it: a failure carries its stderr too. */
const checkResultLine = (outcome: CheckOutcome): string =>
  !outcome.passed && outcome.result.stderr.trim()
    ? `${checkLine(outcome)}\nstderr:${fenced(outcome.result.stderr)}`
    : checkLine(outcome);

/** The findings, numbered; nothing when there are none. */
const findingsBlock = (findings: WorkItemSubmission["findings"]): string =>
  findings?.length
    ? `\n\nFindings:\n${findings.map((finding, index) => `${index + 1}. ${finding.title}: ${finding.detail}`).join("\n")}`
    : "";

/**
 * What landing a checked item came to: done (with the pull request it opened
 * or found, landing `pr`), back to its session, or refused.
 */
type Landed =
  | { kind: "done"; line: string; prUrl?: string; cut?: WorkspaceCut }
  | { kind: "refused"; line: string; prUrl?: string }
  | { kind: "retry"; text: string };

/** The text that hands uncommitted work back to the session, for a landing that takes only commits. */
const dirtyText = (files: string, where: string): string =>
  `The checks passed, but the workspace has changes that are not committed, new files included. The checks ran on them and the hub lands only commits, so landing now could leave ${where} without them. Commit them, delete them, or add them to .gitignore, then call finish_item again.${fenced(files)}`;

/**
 * A refused landing's line, its first sentence what failed: the step git was
 * on, from which machine, and the cause when git's words name one (the remote
 * refusing the login; a branch that moved before every push). Then git's
 * words, and where the commits are.
 */
const refusedLine = (
  refusal: Refusal,
  landing: { head: "Not landed" | "Not pushed"; target: string },
  workspace: WorkspaceRow,
  machine: string
): string => {
  const { head, target } = landing;
  const step: Record<Refusal["step"], string> = {
    fetch: `the fetch of origin/${workspace.base}`,
    push: `the push to ${target}`,
    read: "reading the workspace's git",
    "pull request": "opening the pull request",
  };
  let said = `${step[refusal.step]} on ${machine} failed`;
  if (refusal.cause === "auth") {
    said = `${step[refusal.step]} from ${machine} wasn't authorised by origin`;
  } else if (refusal.cause === "race") {
    said = `${target} moved on origin before each of the hub's ${refusal.tries} pushes, so every one was turned down as behind it`;
  } else if (refusal.step === "push") {
    said = `${step.push} was refused`;
  }
  return `${head}: ${said}.${fenced(refusal.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${workspace.id}.`;
};

/**
 * Why a checked item that passed its checks fails, when it does: the
 * landing's line (its first sentence the step that failed), or, once it
 * landed, the line on the outputs that did not arrive.
 */
const failureOf = (
  landing: Exclude<Landed, { kind: "retry" }>,
  collected: { ok: boolean; line: string }
): string | undefined => {
  if (landing.kind !== "done") {
    return landing.line;
  }
  return collected.ok ? undefined : collected.line.trim();
};

/**
 * A checked item's report to its parent: what it said it did, its checks,
 * how it landed and its outputs, then `tail` (commits, diffstat, findings).
 * A failure leads it, so the parent reads why before what.
 */
const checkedReport = (
  said: { lines: string; summary: string },
  landing: Exclude<Landed, { kind: "retry" }>,
  collected: { ok: boolean; line: string },
  tail: string
): string => {
  const failure = failureOf(landing, collected);
  const head = `${said.summary}\n\nChecks:\n${said.lines}`;
  if (!failure) {
    return `${head}\n\n${landing.line}${collected.line}${tail}`;
  }
  const landed = landing.kind === "done" ? `\n\n${landing.line}` : "";
  return `${failure}\n\n${head}${landed}${tail}`;
};

/** A push to an item's own branch that did not happen, as its landing. */
const unpushed = (
  pushed: Exclude<BranchOutcome, { kind: "pushed" }>,
  workspace: WorkspaceRow,
  branch: string,
  lands: LandsMode,
  machine: string
): Landed => {
  switch (pushed.kind) {
    case "dirty":
      return { kind: "retry", text: dirtyText(pushed.files, branch) };
    case "nothing":
      return {
        kind: "done",
        line: `Nothing to push: ${workspace.base} already holds every commit in this workspace${lands === "pr" ? ", so no pull request was opened" : ""}.`,
      };
    case "no-remote":
      return {
        kind: "done",
        line: "Not pushed: this workspace's repository has no remote.",
      };
    default:
      return {
        kind: "refused",
        line: refusedLine(
          pushed,
          { head: "Not pushed", target: `branch ${branch}` },
          workspace,
          machine
        ),
      };
  }
};

/** How long a tray shows a finished item before it leaves (the dashboard's hold). */
const TRAY_HOLD_MS = 6000;

export const createWorkItems = ({
  awaitsSend,
  beforeCut,
  call,
  command,
  db,
  end,
  itemEnded,
  lifetime,
  pauses,
  placeAhead,
  planSteps,
  publish,
  recutDone,
  recutFailed,
  report,
  inputRefusal,
  inTurn,
  leadPlace,
  leadTurn,
  machineFree,
  machinePaused,
  modelRefusal,
  online,
  send,
  sessionUrl,
  spawn,
  spawnedUnder,
  taskTitle,
  todos,
  types,
  workspaceChanged,
}: WorkItemDeps) => {
  /** Turns in a row each live item's session ended without `finish_item`, by item. */
  const quiet = new Map<string, number>();
  /**
   * Wakes of each item's session by the sweep ({@link wakeAsleep}) with no
   * turn of it ending between: the item's turn count at the last wake, and
   * how many. A turn's end ({@link countTurn}) is progress, and starts the
   * count again. In memory, as the quiet-turn count is: a hub that starts
   * counts from none.
   */
  const woken = new Map<string, { count: number; turns: number }>();
  const waitTimers = new Map<string, HubTimer>();
  /** Waits whose declaring turn ended: the next busy transition resumes them. */
  const waitsAtRest = new Set<string>();
  const disarmWait = (id: string): void => {
    lifetime.cancel(waitTimers.get(id));
    waitTimers.delete(id);
    waitsAtRest.delete(id);
    quiet.delete(id);
  };
  /**
   * Refuses a start whose project was deleted while its workspace was being
   * made: called in the synchronous step that files the project's place.
   */
  const projectStands = (projectId: string): void => {
    if (!db.project(projectId)) {
      throw new WorkItemRefusal(
        404,
        `The project "${projectId}" was deleted, so the work item can't start in it. Pick another.`
      );
    }
  };
  /** Items whose checks this hub process is running now: a resume leaves them to that run. */
  const finishing = new Set<string>();
  /**
   * Items whose checks wait for something now: what its status says, and
   * since when. In memory: a hub that starts runs the checks again from the
   * first.
   */
  const checkQueues = new Map<string, { words: string; since: number }>();
  /**
   * The check commands that passed for each live item, by what they passed
   * on ({@link passKey}: the whole tree, or the trees of the paths a check
   * declares): one command runs at most once on one such key
   * ({@link checkOnce}). In memory: a hub that starts runs them again.
   */
  const passes = new Map<string, Map<string, Passed[]>>();
  /**
   * What an item's checks wait for, as its status says it (WorkItemSummary
   * `checkQueue`): a shared slot ("queued for …"), its machine's pause
   * ("waiting: Omars-MacBook-Pro is paused until 00:57"), another command in
   * its folder, its gate on top of the branch ("gating on top of main: iOS
   * build compiles queued for the Mac's build slot behind …"), or its turn
   * to land ("queued to land on main behind …"); null
   * once it waits no more. Every wait between `finish_item` and the item's
   * outcome comes here: before 2026-10-16 only a check's own slot and pause
   * waits did, and items queued to land sat "checking" with nothing said.
   */
  const checkWait = (itemId: string, words: string | null): void => {
    if (words) {
      checkQueues.set(itemId, {
        words,
        since: checkQueues.get(itemId)?.since ?? Date.now(),
      });
    } else if (!checkQueues.delete(itemId)) {
      return;
    }
    published(db.workItem(itemId));
  };
  /** One landing at a time per repository and branch (landing.ts). */
  const landings = landingQueue();
  /** Creates this hub is still waiting for; register recovery leaves those to their caller. */
  const opening = new Set<string>();
  const discarding = new Map<string, Promise<void>>();
  /** The filed and unfiled cases use the same machine archive, acknowledged before forgetting it. */
  const discardCreate = (id: string, machineId: string): Promise<void> => {
    const pending = discarding.get(id);
    if (pending !== undefined) {
      return pending;
    }
    const unmade: WorkspaceArchive = { id, unlanded: "unmade" };
    const discarded = call(machineId, CONTROL_WORKSPACE_ARCHIVE, [unmade])
      .then(() => db.finishWorkspaceCreate(id))
      .finally(() => discarding.delete(id));
    discarding.set(id, discarded);
    return discarded;
  };
  /** Every write to an item goes out to the dashboards as it lands. */
  const published = (
    item: WorkItemRow | undefined
  ): WorkItemRow | undefined => {
    if (item) {
      publish(summaryOf(item));
    }
    return item;
  };
  const update = (
    id: string,
    change: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow | undefined => {
    if (change.state && !LIVE.has(change.state)) {
      disarmWait(id);
      woken.delete(id);
      const before = db.workItem(id);
      const after = published(
        db.updateWorkItem(id, {
          ...change,
          waitUntil: null,
          waitReason: null,
          waitResumeBy: null,
        })
      );
      if (after && before && LIVE.has(before.state)) {
        itemEnded?.(after);
        // After the step that ended it, and after the failure report the
        // caller sends in that same step.
        queueMicrotask(() => afterEnd(after));
      }
      return after;
    }
    return published(db.updateWorkItem(id, change));
  };
  const clearWait = (item: WorkItemRow): void => {
    disarmWait(item.id);
    if (item.waitUntil || item.waitReason !== null || item.waitResumeBy) {
      update(item.id, {
        waitUntil: null,
        waitReason: null,
        waitResumeBy: null,
      });
    }
  };

  // --- the project's lead: co-parent of its project's items -----------------

  /** A project's lead, when it has one that is none of `not`. */
  const projectLead = (
    projectId: string | null,
    ...not: string[]
  ): InstanceRow | undefined => {
    const id = projectId ? db.project(projectId)?.leadInstanceId : undefined;
    const [lead] = id ? db.getInstancesByIds([id]) : [];
    return lead && !not.includes(lead.id) ? lead : undefined;
  };

  /** The item's project's lead, when it has one that is not the item's own session. */
  const leadFor = (item: WorkItemRow): InstanceRow | undefined =>
    isRoutineParent(item.parentInstanceId)
      ? undefined
      : projectLead(item.projectId, item.instanceId);

  /**
   * The boundary a session runs inside: its work item's workspace, else its
   * Caw place's ({@link WorkItemDeps.leadPlace}); none for a session the
   * person started (server.ts `sessionWorkspace`, every spawn's).
   */
  const boundOf = (row: InstanceRow): WorkspaceRef | undefined => {
    const item = itemOf(row);
    const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
    return workspace ? refOf(workspace) : leadPlace(row);
  };

  /**
   * Refuses host checks declared by a session that runs inside a boundary:
   * its delegate's commits would run outside the boundary it is kept in, as
   * though it had run them there itself. Only a session outside every
   * boundary (one the person started) declares one; a routine's runs never
   * do. Nothing when `checks` has none, or `declaredBy` may.
   */
  const hostDeclared = (checks: WorkItemCheck[], declaredBy: string): void => {
    const host = checks.find((check) => check.host);
    const [row] = host ? db.getInstancesByIds([declaredBy]) : [];
    const bound = row ? boundOf(row) : undefined;
    if (host && bound) {
      throw new WorkItemRefusal(
        403,
        `check "${host.name}" is marked host, and only a session outside every boundary declares one: you run inside ${row?.role === "lead" ? "your place's" : `workspace ${bound.id}'s`} boundary, and a host check would run your delegate's commits outside it. Leave host out, or ask the session that started you to declare it.`
      );
    }
  };

  /** The pause of the machine a workspace is on, in words; undefined when it is not paused. */
  const pausedWorkspace = (workspaceId: string): string | undefined => {
    const [workspace] = db.workspacesNamed(workspaceId);
    return workspace ? machinePaused(workspace.machineId) : undefined;
  };

  /**
   * An item as its parent's delegate tray reads it, and its lead's: the lead
   * named when it co-parents the item from another session.
   */
  const summaryOf = (item: WorkItemRow): WorkItemSummary => ({
    id: item.id,
    parentInstanceId: item.parentInstanceId,
    leadInstanceId: isRoutineParent(item.parentInstanceId)
      ? null
      : (projectLead(item.projectId, item.instanceId, item.parentInstanceId)
          ?.id ?? null),
    instanceId: item.instanceId,
    title: item.title,
    state: item.state,
    machinePaused: LIVE.has(item.state)
      ? (pausedWorkspace(item.workspaceId) ?? null)
      : null,
    queued: null,
    createdAt: item.createdAt.getTime(),
    endedAt: item.endedAt?.getTime() ?? null,
    dismissedAt: item.dismissedAt?.getTime() ?? null,
    dismissReason: item.dismissReason,
    replacedBy: item.replacedBy,
    waitUntil: item.waitUntil?.getTime() ?? null,
    waitReason: item.waitReason,
    checkQueue: checkQueues.get(item.id) ?? null,
    firstLines: {
      brief: firstLine(item.brief),
      result: item.headline ?? firstLine(item.result),
      error: firstLine(item.error),
    },
  });

  /**
   * The item the reader says took over `item`'s work: a later one of the
   * same parent, or of the same project. Its id, or a throw with why not.
   */
  const replacementOf = (
    item: WorkItemRow,
    { replacedBy }: { replacedBy: string }
  ): string => {
    const by = replacedBy === item.id ? undefined : db.workItem(replacedBy);
    if (!by) {
      throw new Error(`There is no later work item ${replacedBy}.`);
    }
    const kin =
      by.parentInstanceId === item.parentInstanceId ||
      (item.projectId !== null && by.projectId === item.projectId);
    if (!kin || by.createdAt.getTime() <= item.createdAt.getTime()) {
      throw new Error(
        `${by.title} (${by.id}) was not delegated after ${item.title} by the same session, so it cannot have replaced it.`
      );
    }
    return by.id;
  };

  /**
   * A queued `delegate` as the trays read it: starting, under the ids its
   * item takes, with the files it owns; `dismissedAt` once it leaves the
   * queue without starting.
   */
  const queuedSummaryOf = (
    queued: QueuedWorkItemRow,
    dismissedAt: Date | null = null
  ): WorkItemSummary => {
    const request = queued.request as QueuedRequest;
    const [parent] = db.getInstancesByIds([queued.parentInstanceId]);
    const machineId = request.workspace
      ? db.workspacesNamed(request.workspace)[0]?.machineId
      : (request.machineId ?? parent?.machineId);
    return {
      id: queued.id,
      parentInstanceId: queued.parentInstanceId,
      leadInstanceId:
        projectLead(
          request.task?.projectId ?? parent?.projectId ?? null,
          queued.parentInstanceId
        )?.id ?? null,
      instanceId: request.queuedAs.instanceId,
      title: queued.title,
      state: "starting",
      machinePaused: null,
      queued: {
        owns: [...new Set((request.owns ?? []).map(globOf))],
        paused: (machineId && machinePaused(machineId)) || null,
      },
      createdAt: queued.queuedAt.getTime(),
      endedAt: null,
      dismissedAt: dismissedAt?.getTime() ?? null,
      dismissReason: null,
      replacedBy: null,
      waitUntil: null,
      waitReason: null,
      checkQueue: null,
      firstLines: { brief: firstLine(request.prompt), result: "", error: "" },
    };
  };

  /** Whether a message from `origin` may reopen `item`: {@link reopens}, its lead counting. */
  const mayReopen = (item: WorkItemRow, origin: NeutralOrigin): boolean =>
    reopens(item.parentInstanceId, origin, leadFor(item)?.id);

  /**
   * The Caw an item's report must not wake: its project's, while he is off
   * and the item is not yours (its origin `event`, or `kept`, whose end is
   * noted in his thread instead, caw.ts `itemEnded`); null otherwise.
   */
  const cawOff = (item: WorkItemRow): string | null => {
    const led = item.projectId ? db.project(item.projectId) : undefined;
    return led && !led.caw && item.origin !== "you" ? led.leadInstanceId : null;
  };

  /**
   * Whether a session's reports and asks go up to its parent at all: only
   * delegated work's do (a work item; a workflow step, to its run's
   * supervisor). A session another session started with `start_session`
   * nests under it and reports to no one, its asks the person's; a
   * routine's run reports to nobody either, as its routine reads how it
   * ended, and a run that answers NO_REPLY must wake no model, the lead's
   * included.
   */
  const reportsBack = (row: InstanceRow): boolean =>
    !isRoutineParent(row.parentInstanceId) &&
    !!(row.workItemId || row.workflowStepId);

  /**
   * Who hears a delegated session's reports and asks: the session that
   * started its work, by the id its row records, and no one else. A
   * project's lead hears only the work he started himself, never another
   * session's work in his project because it is in his project. While a
   * project's Caw is off, an item he started whose work is not yours
   * reaches him not at all: off, only your words wake him (caw.ts). Your
   * work reaches him on or off.
   */
  const reportees = (row: InstanceRow): InstanceRow[] => {
    if (!reportsBack(row)) {
      return [];
    }
    const [parent] = row.parentInstanceId
      ? db.getInstancesByIds([row.parentInstanceId])
      : [];
    const item = itemOf(row);
    const sleeping = item ? cawOff(item) : null;
    return parent && parent.id !== sleeping ? [parent] : [];
  };

  // --- file ownership ---------------------------------------------------------

  /** Owned globs held by starts that have checked and not yet filed their item. */
  const reserved = new Map<symbol, { repo: RepoRef; owns: string[] }>();

  /** The repository a live item works in. */
  const repoOfItem = (item: WorkItemRow): RepoRef | undefined => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    return workspace
      ? {
          projectId: item.projectId,
          machineId: workspace.machineId,
          path: workspace.repoRoot,
        }
      : undefined;
  };

  /** The repository a request would work in: the workspace it names, else its machine and folder. */
  const repoOfRequest = (
    request: WorkItemRequest,
    parent: Parent,
    projectId: string | null
  ): RepoRef => {
    const named = request.workspace ?? request.reuse;
    const [workspace] = named ? db.workspacesNamed(named.trim()) : [];
    return workspace
      ? { projectId, machineId: workspace.machineId, path: workspace.repoRoot }
      : {
          projectId,
          machineId: request.machineId ?? parent.machineId,
          path: request.cwd ?? parent.cwd,
        };
  };

  /** The live item whose owned files overlap `owns` in `repo`, and the globs that do. */
  const ownsBlocker = (
    repo: RepoRef,
    owns: string[]
  ): { item: { id: string; title: string }; globs: string } | undefined => {
    for (const { item, globs: theirs } of db.liveOwningWorkItems()) {
      const where = repoOfItem(item);
      const globs =
        where && sameRepo(repo, where) && globsOverlap(owns, theirs);
      if (globs) {
        return { item, globs };
      }
    }
    for (const claim of reserved.values()) {
      const globs =
        sameRepo(repo, claim.repo) && globsOverlap(owns, claim.owns);
      if (globs) {
        return {
          item: { id: "(starting)", title: "Another start" },
          globs,
        };
      }
    }
    return undefined;
  };

  /**
   * Holds a start's owned files from its check until its item is filed;
   * refused with {@link OwnsOverlap} while a live item's overlap them. The
   * check and the hold are one step. Answers the release.
   */
  const claimOwns = (
    request: WorkItemRequest,
    parent: Parent,
    projectId: string | null
  ): (() => void) => {
    const owns = request.owns ?? [];
    if (owns.length === 0) {
      return () => undefined;
    }
    const repo = repoOfRequest(request, parent, projectId);
    const blocker = ownsBlocker(repo, owns);
    if (blocker) {
      throw new OwnsOverlap(blocker.item, blocker.globs);
    }
    const key = Symbol("owns");
    reserved.set(key, { repo, owns });
    return () => reserved.delete(key);
  };

  // --- budgets ------------------------------------------------------------------

  /** What an item has used: its session's reported dollars past its base, its turns, its minutes. */
  const usedBy = (item: WorkItemRow): BudgetUse => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const spent = row?.sessionId ? db.sessionCostUsd(row.sessionId) : 0;
    return {
      usd: Math.max(0, spent - item.spendBaseUsd),
      turns: item.turns,
      minutes: (Date.now() - item.createdAt.getTime()) / 60_000,
    };
  };

  /**
   * Stops a live item that has reached its budget ({@link overBudget}): it
   * fails with the sentence that names the budget, its parent (and lead) are
   * told, and its session is ended. An item whose checks are running is left
   * to them.
   */
  const enforceBudget = (item: WorkItemRow): void => {
    if (!(item.budget && LIVE.has(item.state)) || item.checkingSince) {
      return;
    }
    const reason = overBudget(item.budget, usedBy(item));
    if (!reason) {
      return;
    }
    const [row] = db.getInstancesByIds([item.instanceId]);
    const failed = finish(item, { state: "failed", error: reason });
    console.log(`[work-items] ${item.id}: ${reason}`);
    if (row) {
      report(row, `${reason}${reportLine(failed)}`, true);
    }
    end(item.instanceId).catch((error: unknown) =>
      console.warn(
        `[work-items] ${item.id} reached its budget, and its session did not end: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  // --- items their session can no longer finish ------------------------------------

  /**
   * The item's session as its report names it, once its row is gone: the
   * fields the report path reads (its id and machine, its parent and item,
   * its title as its label), from the item and its workspace.
   */
  const standIn = (item: WorkItemRow): InstanceRow => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    return {
      id: item.instanceId,
      machineId: workspace?.machineId ?? "",
      parentInstanceId: item.parentInstanceId,
      workItemId: item.id,
      title: item.title,
      launchDir: "unknown",
      harness: item.harness,
    } as InstanceRow;
  };

  /**
   * A live item whose session can't go on — its row in `error`
   * ({@link followSessions}), or asleep where no wake can reach it or nobody
   * would hear it ({@link wakeAsleep}): the item fails with `reason`, and whoever
   * hears its reports is told, once — {@link finish} moves only a live item.
   */
  const sessionFailed = (row: InstanceRow, reason: string): void => {
    const item = itemOf(row);
    if (!(item && LIVE.has(item.state))) {
      return;
    }
    quiet.delete(item.id);
    clearWait(item);
    const failed = finish(item, { state: "failed", error: reason });
    console.log(`[work-items] ${item.id}: its session failed: ${reason}`);
    report(row, `${reason}${reportLine(failed)}`, true);
  };

  /**
   * THE RULE: a live item follows its session's life. Its session's row in
   * `error` — a start refused, a process that failed, a conversation found
   * gone at a register, nothing left to resume after a restart — the item
   * fails with the row's own reason; its row gone, with {@link SESSION_GONE}.
   * Whoever hears its reports is told, once: {@link finish} moves only a
   * live item. It reads the row, never the path that wrote it, so no writer
   * of `error` has an item to remember. An end (a stop, a discard) is filed
   * with its item's cancel in one step (server.ts `sessionEnding`), before a
   * discard can take the row. An item whose checks this hub runs now is left
   * to that run; one whose session still has a row and whose checks a
   * stopped hub left running is its checks' to settle ({@link resumeChecks}).
   * `only` limits the read to those sessions: the ones whose rows just moved
   * (server.ts, off the database's change log of `instances`); without it,
   * every live item (the sweep, which reads what a hub before this one wrote).
   */
  const followSessions = (only?: ReadonlySet<string>): void => {
    const live = db
      .liveWorkItems()
      .filter(
        (item) =>
          (!only || only.has(item.instanceId)) && !finishing.has(item.id)
      );
    if (live.length === 0) {
      return;
    }
    const rows = new Map(
      db
        .getInstancesByIds(live.map((item) => item.instanceId))
        .map((row) => [row.id, row])
    );
    for (const item of live) {
      const row = rows.get(item.instanceId);
      if (row && (row.workItemId !== item.id || item.checkingSince)) {
        continue;
      }
      if (row) {
        if (row.status === "error") {
          sessionFailed(row, row.lastError ?? SESSION_FAILED_UNSAID);
        }
        continue;
      }
      quiet.delete(item.id);
      const failed = finish(item, {
        state: "failed",
        error: SESSION_GONE,
        checkingSince: null,
        submission: null,
      });
      console.log(`[work-items] ${item.id}: ${SESSION_GONE}`);
      report(
        standIn(item),
        `${item.title} failed: ${SESSION_GONE}. The hub has no row for its session ${item.instanceId.slice(0, 8)} any more, so nothing can run it or call finish_item. Delegate the work again if it is still needed.\n\n[Work item ${failed.id} is ${failed.state} in workspace ${failed.workspaceId}.]`,
        true
      );
    }
  };

  /**
   * Whether the sweep leaves a live item's session as it is: it has a
   * process, or something holds the item on purpose or will move it anyway.
   * An interrupt's hold (`heldAt`, until its parent or the reader writes); a
   * paused machine under its workspace; a declared wait; checks in flight
   * (here, or left by a hub before this one); a session that has moved on to
   * another item; a machine that is not connected (it settles its sessions
   * when it registers); a send on its way to the session, which is its next
   * turn (a cut turn's hand-back included).
   */
  const leftAsleep = (item: WorkItemRow, row: InstanceRow): boolean =>
    !(row.status === "sleeping" || GONE.has(row.status)) ||
    item.heldAt !== null ||
    pausedWorkspace(item.workspaceId) !== undefined ||
    !!(item.waitUntil || item.waitResumeBy) ||
    !!item.checkingSince ||
    finishing.has(item.id) ||
    row.workItemId !== item.id ||
    !online(row.machineId) ||
    awaitsSend(row.id);

  /**
   * THE RULE FOR WORK ASLEEP: a live item whose session has no process while
   * nothing holds it ({@link leftAsleep}) is woken or ended, never left. Its
   * session asleep, the hub tells it {@link STILL_OPEN} through the one send
   * path a handoff takes, which starts its process; one that cannot take
   * that message (the hub's input gate refuses it, it never began a
   * conversation, its workspace is archived, nobody is left to hear its
   * reports ({@link heard}), or the hub's word may not start a turn in it
   * because it was stopped) fails with why, its parent told. A session woken
   * {@link SLEEP_WAKES} times in a row with no turn ended and found asleep
   * again fails too: something keeps stopping it.
   *
   * Its process lost without a turn ending is how it gets here: a process
   * that exits on its own between turns or mid-turn with no turn recorded
   * open (the agent files it asleep, `#gone`), one a signal killed with no
   * turn recorded to hand back (server.ts `diedOnSignal`), a heartbeat that
   * no longer lists it (an OpenCode server restart; db `reconcileHeartbeat`),
   * a register that restored no process for it (a turn a restart cut, its
   * row older than the restore's horizon or past its cap: the first sweep
   * once its machine is connected wakes it), an interrupted turn left at
   * rest until the agent slept it, and a spawn whose session came up and
   * lost its process before its first turn. A row in `error` or gone is
   * {@link followSessions}'s. A session the register did restore is handed
   * its cut turn by the restore itself (server.ts `resumeCutTurn`); it has a
   * process, or a send on its way, and the sweep leaves it.
   */
  const wakeAsleep = (): void => {
    const live = db.liveWorkItems();
    if (live.length === 0) {
      return;
    }
    const rows = new Map(
      db
        .getInstancesByIds(live.map((item) => item.instanceId))
        .map((row) => [row.id, row])
    );
    for (const item of live) {
      const row = rows.get(item.instanceId);
      if (row && !leftAsleep(item, row)) {
        wakeOrFail(item, row);
      }
    }
  };

  /** {@link wakeAsleep} for one item: its session woken, or the item failed with why. */
  const wakeOrFail = (item: WorkItemRow, row: InstanceRow): void => {
    const refused = asleepRefusal(item, row);
    if (refused) {
      sessionFailed(row, refused);
      return;
    }
    const before = woken.get(item.id);
    const count = before && before.turns === item.turns ? before.count : 0;
    if (count >= SLEEP_WAKES) {
      sessionFailed(
        row,
        `Its session went back to sleep after each of the hub's ${counted(count, "wake")}, without ending a turn in between, so the hub stopped waking it.`
      );
      return;
    }
    const sent = send({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: item.checks
              ? `${STILL_OPEN} Its checks: ${checkNames(item.checks)}. Finish the work and call finish_item, or call it with \`blocked\` and the exact command and error.`
              : STILL_OPEN,
          },
          parent_tool_use_id: null,
          origin: WAKE_ORIGIN,
        },
      },
    });
    if (sent.state === "failed") {
      sessionFailed(
        row,
        `Its session was asleep with its work item open, and the hub's wake did not reach it: ${sent.reason ?? "the send failed"}.`
      );
      return;
    }
    woken.set(item.id, { count: count + 1, turns: item.turns });
    console.log(
      `[work-items] ${item.id}: its session ${row.id} was asleep with the item open; woke it (wake ${count + 1} of ${SLEEP_WAKES})`
    );
  };

  /**
   * Why a live item's session with no process cannot take the sweep's wake,
   * as the sentence its failure carries; nothing when it can.
   */
  const asleepRefusal = (
    item: WorkItemRow,
    row: InstanceRow
  ): string | undefined => {
    if (GONE.has(row.status)) {
      return `Its session was ${row.status} with its work item open, and only its parent or the reader may start a stopped session again.`;
    }
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (workspace?.state !== "active") {
      return `Its session was asleep with its work item open, and its workspace ${item.workspaceId} is ${workspace?.state ?? "gone"}: there is nowhere for it to carry on.`;
    }
    if (!row.sessionId) {
      return "Its session was asleep with its work item open, and it never began a conversation, so there is nothing to wake it into.";
    }
    if (!heard(item, row)) {
      return "Its session was asleep with its work item open, and nobody is left to hear its reports.";
    }
    const gate = inputRefusal(row.id, WAKE_ORIGIN);
    return gate ? gate.reason : undefined;
  };

  /**
   * Whether someone will hear how an item ends, so waking its work is worth
   * it: its routine (which reads its run's end, routines.ts), its project's
   * Caw while he is off (his thread notes the end, caw.ts `itemEnded`), or a
   * reportee that can still take a turn: running, starting, or asleep on a
   * conversation of its own.
   */
  const heard = (item: WorkItemRow, row: InstanceRow): boolean =>
    isRoutineParent(item.parentInstanceId) ||
    cawOff(item) === item.parentInstanceId ||
    reportees(row).some(
      (reportee) =>
        reportee.status === "running" ||
        reportee.status === "starting" ||
        (reportee.status === "sleeping" && reportee.sessionId !== null)
    );

  lifetime.every(BUDGET_SWEEP_MS, () => {
    for (const item of db.liveWorkItems()) {
      if (item.budget) {
        enforceBudget(item);
      }
    }
    followSessions();
    wakeAsleep();
  });

  // --- groups ---------------------------------------------------------------------

  /** One item's part of its group's combined report. */
  const groupPart = (item: WorkItemRow, index: number): string => {
    const head = `${index + 1}. ${item.title} (work item ${item.id.slice(0, 8)}, workspace ${item.workspaceId.slice(0, 8)}): ${item.state}`;
    if (item.state === "done") {
      return `${head}\n${(item.digest ?? firstLine(item.result)).trim()}`;
    }
    if (item.state === "cancelled") {
      return `${head}: stopped before it finished.`;
    }
    const why = firstLine(item.error) || "no reason was kept";
    return `${head}, reported when it failed: ${why}`;
  };

  /**
   * An item of a group ended: once every item of the group has, the parent
   * hears ONE report of them all — each one's summary and landing line, and
   * each failure in a line (it reported at once). A group none of whose items
   * is done has nothing held, and needs no word.
   */
  const settleGroup = (item: WorkItemRow): void => {
    if (!item.group) {
      return;
    }
    const members = db.groupWorkItems(item.parentInstanceId, item.group);
    if (members.length === 0 || members.some((each) => LIVE.has(each.state))) {
      return;
    }
    const now = new Date();
    for (const member of members) {
      db.updateWorkItem(member.id, { groupReportedAt: now });
    }
    const done = members.filter((each) => each.state === "done").length;
    if (done === 0) {
      return;
    }
    const [row] = db.getInstancesByIds([item.instanceId]);
    if (!row) {
      return;
    }
    const tally =
      done === members.length
        ? `all ${members.length} done`
        : `${done} done, ${members.length - done} not`;
    const headline = `Group “${item.group}”: every item has ended (${tally}).`;
    report(
      row,
      `${headline}\n\n${members.map(groupPart).join("\n\n")}`,
      false,
      false,
      headline
    );
  };

  // --- plan ↔ to-dos ----------------------------------------------------------------

  /** The item's session's plan as its panel reads it; undefined when it cannot be read now. */
  const planFor = (item: WorkItemRow): Promise<PlanStep[] | undefined> =>
    planSteps(item.instanceId).catch(() => undefined);

  /** The task an item is an attempt at, when the plan link can reach it. */
  const taskOf = (
    item: WorkItemRow
  ): { projectId: string; taskId: string } | undefined =>
    todos && item.projectId && item.taskId
      ? { projectId: item.projectId, taskId: item.taskId }
      : undefined;

  /**
   * Ticks each open to-do of the item's task whose id a completed plan item
   * carries (`[td-3] …`). One read of the ledger and, when something is to
   * tick, one commit.
   */
  const syncPlan = async (item: WorkItemRow): Promise<void> => {
    const task = taskOf(item);
    const plan = task ? await planFor(item) : undefined;
    if (!(task && todos && plan?.length)) {
      return;
    }
    const completed = new Set(
      plan
        .filter((entry) => entry.status === "completed")
        .map((entry) => PLAN_TODO.exec(entry.content)?.[1])
        .filter((id): id is string => id !== undefined)
    );
    if (completed.size === 0) {
      return;
    }
    const open = (await todos.read(task.projectId, task.taskId)).filter(
      (todo) => !todo.done && todo.id && completed.has(todo.id)
    );
    if (open.length > 0) {
      await todos.write(
        task.projectId,
        task.taskId,
        { tick: open.map((todo) => todo.id as string) },
        `attempt ${item.id.slice(0, 8)}'s plan completed them`
      );
    }
  };

  /** {@link syncPlan} off the turn's path; a machine that cannot answer is logged, not fatal. */
  const syncSoon = (item: WorkItemRow): void => {
    if (!(taskOf(item) && LIVE.has(item.state))) {
      return;
    }
    syncPlan(item).catch((error: unknown) =>
      console.warn(
        `[work-items] ${item.id}: its plan was not read: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /**
   * An item ended: its plan's last ticks land, and the plan items it left
   * open (without a to-do id) become proposed to-dos on its task — a line
   * each, `(proposed)`, skipping words the task already has.
   */
  const proposeLeftovers = async (item: WorkItemRow): Promise<void> => {
    const task = taskOf(item);
    const plan = task ? await planFor(item) : undefined;
    if (!(task && todos && plan?.length)) {
      return;
    }
    await syncPlan(item);
    const known = new Set(
      (await todos.read(task.projectId, task.taskId)).map((todo) =>
        todo.text.trim().toLowerCase()
      )
    );
    const left = plan
      .filter(
        (entry) =>
          entry.status !== "completed" && !PLAN_TODO.test(entry.content)
      )
      .map((entry) => entry.content.replace(/\s+/g, " ").trim())
      .filter((text) => text && !known.has(text.toLowerCase()))
      .slice(0, PROPOSALS_LIMIT);
    if (left.length > 0) {
      await todos.write(
        task.projectId,
        task.taskId,
        { add: [...new Set(left)].map((text) => ({ text, proposed: true })) },
        `attempt ${item.id.slice(0, 8)} ended ${item.state} with these left open in its plan`
      );
    }
  };

  /** Items whose session was asked once, at finish_item, about the task's unticked to-dos. */
  const todosAsked = new Set<string>();

  /**
   * The words that send a `finish_item` back once while the task has open
   * to-dos (its plan's completed ones ticked first): each listed, to tick or
   * explain. Nothing on the second call, or when every to-do is ticked.
   */
  const untickedText = async (
    item: WorkItemRow
  ): Promise<string | undefined> => {
    const task = taskOf(item);
    if (!(task && todos) || todosAsked.has(item.id)) {
      return;
    }
    try {
      await syncPlan(item);
    } catch (error) {
      console.warn(
        `[work-items] ${item.id}: its plan was not read at finish_item: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    // A task that cannot be read (deleted, a folder that refuses) asks nothing.
    const open = (
      await todos.read(task.projectId, task.taskId).catch(() => [])
    ).filter((todo) => !(todo.done || todo.proposed || todo.promoted));
    if (open.length === 0) {
      return;
    }
    todosAsked.add(item.id);
    return `Not yet: ${open.length === 1 ? "this to-do" : `these ${open.length} to-dos`} of ${task.taskId} ${open.length === 1 ? "is" : "are"} not ticked.\n\n${open
      .map((todo) => `- [${todo.id ?? todo.path}] ${todo.text}`)
      .join(
        "\n"
      )}\n\nTick each one you finished with todo_write, and say in your summary why each other one stays open. Then call finish_item again: the next call runs the checks whatever is ticked.`;
  };

  /** What follows an item's end, off the step that ended it. */
  const afterEnd = (item: WorkItemRow): void => {
    settleGroup(item);
    drainQueued().catch((error: unknown) =>
      console.warn(
        `[work-items] queued delegates did not start: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    if (taskOf(item)) {
      proposeLeftovers(item).catch((error: unknown) =>
        console.warn(
          `[work-items] ${item.id}: its plan's open items were not proposed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  };

  // --- delegates waiting on owned files ----------------------------------------------

  let draining = false;
  let drainAgain = false;

  /**
   * Starts the `delegate` calls that waited for owned files, oldest first,
   * each once no live item overlaps it: its chip in the trays becomes its
   * item's, and its parent hears from it as from any delegate, or is told
   * why it could not start. One drain at a time; an end during one runs it
   * again.
   */
  const drainQueued = async (): Promise<void> => {
    if (draining) {
      drainAgain = true;
      return;
    }
    draining = true;
    try {
      do {
        drainAgain = false;
        for (const queued of db.queuedWorkItems()) {
          // biome-ignore lint/performance/noAwaitInLoops: one start at a time, so each sees the files the last one took
          await startQueued(queued);
        }
      } while (drainAgain);
    } finally {
      draining = false;
    }
  };

  /**
   * A queued delegate leaves the queue without starting: its chip leaves the
   * trays, unless an item was filed under its id and failed, whose own chip
   * stands.
   */
  const unqueue = (queued: QueuedWorkItemRow): void => {
    db.dropQueuedWorkItem(queued.id);
    if (!db.workItem(queued.id)) {
      publish(queuedSummaryOf(queued, new Date()));
    }
  };

  /**
   * One queued delegate, started when its files are free under the ids its
   * chip stood under; a start that fails takes the chip off and tells the
   * parent why, as it waits for a report that will not come.
   */
  const startQueued = async (queued: QueuedWorkItemRow): Promise<void> => {
    const request = queued.request as QueuedRequest;
    const [parent] = db.getInstancesByIds([queued.parentInstanceId]);
    if (!parent) {
      unqueue(queued);
      return;
    }
    if (heldBy(queued, parent)) {
      return;
    }
    startingQueued.add(queued.id);
    try {
      await start(request);
      db.dropQueuedWorkItem(queued.id);
    } catch (error) {
      if (error instanceof OwnsOverlap || error instanceof MachinePaused) {
        return;
      }
      unqueue(queued);
      tell(
        parent,
        `Your queued delegate “${queued.title}” could not start: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      startingQueued.delete(queued.id);
    }
  };

  /** Queued delegates whose start is running now: a withdraw would race their filed item. */
  const startingQueued = new Set<string>();

  /** The live item and the globs that hold a queued delegate back; nothing once its files are free. */
  const heldBy = (
    queued: QueuedWorkItemRow,
    parent: InstanceRow
  ): ReturnType<typeof ownsBlocker> => {
    const request = queued.request as QueuedRequest;
    const repo = repoOfRequest(
      request,
      parent,
      request.task?.projectId ?? parent.projectId ?? null
    );
    return ownsBlocker(repo, request.owns ?? []);
  };

  /**
   * The queued delegates `caller` may withdraw: those it queued, and, as its
   * project's lead, those of its project. One that has filed its item is that
   * item now, and is left out.
   */
  const queuedFor = (caller: string): QueuedWorkItemRow[] =>
    db
      .queuedWorkItems()
      .filter((row) => !db.workItem(row.id))
      .filter(
        (row) =>
          row.parentInstanceId === caller ||
          queuedSummaryOf(row).leadInstanceId === caller
      );

  /** The one workspace `needle` names; refused when it names none or several. */
  const namedWorkspace = (needle: string): WorkspaceRow => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length !== 1) {
      throw new WorkItemRefusal(
        404,
        named.length
          ? `"${needle}" names ${named.length} workspaces. Pass the full workspace id.`
          : `No workspace "${needle}".`
      );
    }
    return named[0];
  };

  /** The paths a workspace's items handed over as outputs: `git status` passes over them. */
  const handedOver = (workspace: WorkspaceRow): string[] => [
    ...new Set(
      db.workItemsIn(workspace.id).flatMap((item) => item.outputs ?? [])
    ),
  ];

  /** A held workspace's work as its row keeps it (schema.ts `workspaces.holding`). */
  const heldWork = (
    workspace: WorkspaceRow & { holding: WorkspaceHolding }
  ): HeldWork => ({
    ...workspace.holding,
    heldAt: (workspace.heldAt ?? workspace.createdAt).toISOString(),
    holds: holdingWords(workspace.holding),
    size: sizeWords(workspace.holding.bytes),
    machine: machineName(workspace.machineId),
    machineId: workspace.machineId,
    path: workspace.path,
    workspaceId: workspace.id,
  });

  /** Whether a workspace's row is held with what it holds on record. */
  const isHeld = (
    workspace: WorkspaceRow
  ): workspace is WorkspaceRow & { holding: WorkspaceHolding } =>
    workspace.state === "held" && workspace.holding !== null;

  /**
   * A workspace closed on its machine ({@link CONTROL_WORKSPACE_ARCHIVE}):
   * its boundary killed first and never started, then what it holds that is
   * nowhere else read on the host, and done with as `unlanded` says
   * ({@link WorkspaceUnlanded}), or with `discard` saved to a carry first
   * ({@link CONTROL_WORKSPACE_DISCARD}, which an agent that cannot write
   * one refuses); `skip`, its items' handed-over outputs. Archived, its
   * places go with it and its row says so, with the carry; holding work
   * (only a `keep` answers so) its row is held with what it holds, its clone
   * and places standing.
   */
  const closeWorkspace = async (
    workspace: WorkspaceRow,
    unlanded: WorkspaceUnlanded | "discard",
    skip: string[] = []
  ): Promise<ArchivedWorkspace> => {
    const discard = unlanded === "discard";
    const request: WorkspaceArchive = {
      ...refOf(workspace),
      unlanded: discard ? "keep" : unlanded,
      skip,
    };
    const { carry, held } = (await call(
      workspace.machineId,
      discard ? CONTROL_WORKSPACE_DISCARD : CONTROL_WORKSPACE_ARCHIVE,
      [request]
    )) as WorkspaceArchived;
    if (held) {
      const kept =
        db.updateWorkspace(workspace.id, {
          state: "held",
          holding: held,
          heldAt: new Date(),
          boundaryPid: null,
        }) ?? workspace;
      placesChanged(workspace.machineId);
      workspaceChanged?.(kept);
      const work = heldWork({ ...kept, holding: held });
      console.log(
        `[workspaces] ${workspace.id} on ${work.machine}: held, ${work.holds} (${work.size} at ${workspace.path}); the person continues it or discards it`
      );
      return { workspace: kept, carry: null, held: work };
    }
    db.removeWorkspacePlaces(workspace.machineId, workspace.path);
    placesChanged(workspace.machineId);
    const archived =
      db.updateWorkspace(workspace.id, {
        state: "archived",
        boundaryPid: null,
        holding: null,
        heldAt: null,
        ...(carry ? { carry } : {}),
      }) ?? workspace;
    workspaceChanged?.(archived);
    return { workspace: archived, carry };
  };

  /** Session statuses whose process may still run a command in its workspace. */
  const ATTACHED: ReadonlySet<string> = new Set([
    "running",
    "starting",
    "unknown",
    "stopping",
  ]);

  /**
   * What holds a workspace whose items have all ended, in words, or nothing:
   * a session of its items whose process may still run there (one asleep,
   * stopped or failed has none), or an artifact, any session's, showing what
   * it serves (db artifacts.ts `previewing`: a port preview naming it, a
   * folder preview inside its clone). On 2026-10-15 a workspace was retired
   * while it served the owner's two open previews; a hold defers retirement
   * until it goes, never cancels it.
   */
  const holdOn = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): string | undefined => {
    const rows = db.getInstancesByIds([
      ...new Set(items.map((item) => item.instanceId)),
    ]);
    const attached = rows.find((row) => ATTACHED.has(row.status));
    if (attached) {
      return `its session ${attached.id} is ${attached.status === "stopping" ? "stopping" : "attached"}`;
    }
    const shown = db.artifacts.previewing(workspace).map((one) => one.name);
    if (shown.length > 0) {
      return `${shown.length === 1 ? "the artifact" : "the artifacts"} ${shown.join(", ")} ${shown.length === 1 ? "shows" : "show"} what it serves`;
    }
  };

  /** What one {@link settle} came to. */
  type Settled =
    | { kind: "retired"; carry: string | null }
    | { kind: "held"; held: HeldWork }
    | { kind: "deferred"; hold: string }
    | { kind: "failed"; reason: string }
    | { kind: "none" };

  /** The last failure each workspace's settle logged: one line per change, not per sweep. */
  const settleFailures = new Map<string, string>();

  /**
   * THE end of a workspace's life (schema.ts `WorkspaceState`). An active
   * delegate's workspace whose items have all ended is closed on its machine
   * ({@link closeWorkspace}, a `keep`) once nothing holds it ({@link holdOn}):
   * archived when its clone holds nothing that is nowhere else, held with
   * what it holds otherwise. A hold defers it to the event that ends the hold
   * (its session asleep or ended, the artifact gone), or the sweep's next
   * look (workspace-retire.ts). Its sessions are not ended: each is asleep or
   * gone already, and a handoff to one goes on in a clone cut again
   * ({@link recut}). A check workspace goes with its source.
   */
  const settle = async (id: string): Promise<Settled> => {
    const [workspace] = db.workspacesNamed(id);
    if (workspace?.state !== "active" || workspace.checksFor) {
      return { kind: "none" };
    }
    const items = db.workItemsIn(workspace.id);
    if (items.length === 0 || items.some((item) => LIVE.has(item.state))) {
      return { kind: "none" };
    }
    const hold = holdOn(workspace, items);
    if (hold) {
      return { kind: "deferred", hold };
    }
    const machine = machineName(workspace.machineId);
    try {
      const closed = await closeWorkspace(
        workspace,
        "keep",
        handedOver(workspace)
      );
      settleFailures.delete(workspace.id);
      if (closed.held) {
        return { kind: "held", held: closed.held };
      }
      await Promise.all(
        db
          .checkWorkspacesOf(workspace.id)
          .map((check) => closeWorkspace(check, "check"))
      );
      console.log(
        `[workspaces] ${workspace.id} on ${machine}: retired, its work over and nothing of it anywhere but on its remote; ${workspace.path} and what it owned there are gone`
      );
      return { kind: "retired", carry: closed.carry };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (settleFailures.get(workspace.id) !== reason) {
        console.warn(
          `[workspaces] ${workspace.id} on ${machine}: not retired: ${reason}`
        );
      }
      settleFailures.set(workspace.id, reason);
      return { kind: "failed", reason };
    }
  };

  /** Each workspace's settle under way, and whether one was asked for meanwhile. */
  const settling = new Map<string, { again: boolean }>();

  /**
   * {@link settle} soon, off the caller's step, once at a time per
   * workspace: one asked for while one runs runs again after it. Never
   * throws.
   */
  const settleSoon = (id: string): void => {
    const running = settling.get(id);
    if (running) {
      running.again = true;
      return;
    }
    settling.set(id, { again: false });
    const run = (): void => {
      settle(id)
        .catch((error: unknown) =>
          console.warn(
            `[workspaces] ${id}: its settle failed: ${error instanceof Error ? error.message : String(error)}`
          )
        )
        .finally(() => {
          const asked = settling.get(id);
          if (asked?.again) {
            asked.again = false;
            run();
          } else {
            settling.delete(id);
          }
        });
    };
    queueMicrotask(run);
  };

  /**
   * Whether a workspace is retired and may be cut again: archived, not a
   * check workspace, and its work not discarded (a discard's carry holds
   * it, and nothing on its remote does).
   */
  const recuttable = (workspace: WorkspaceRow): boolean =>
    workspace.state === "archived" &&
    workspace.carry === null &&
    !workspace.checksFor;

  /** Each workspace's cut under way ({@link recut}): one at a time. */
  const recutting = new Map<string, Promise<WorkspaceRow>>();

  /**
   * A retired workspace cut again on its machine, at the same path (a
   * function of its id) with the same id and branch, at the commit its last
   * item landed ({@link CONTROL_WORKSPACE_CREATE}'s `at`; its default
   * branch's tip when none landed one), its boundary started on the account
   * its latest item's session runs on: its delegate goes on in the same
   * session, on its transcript, in the same folder. Filed active again, one
   * of its project's places. Its installed dependencies are gone with the
   * old clone. One cut at a time per workspace; every caller shares it.
   * `onCut` runs in the step that files it active, before anything else
   * can settle it: what wakes its session there.
   */
  const recut = (
    workspace: WorkspaceRow,
    onCut?: () => void
  ): Promise<WorkspaceRow> => {
    const pending = recutting.get(workspace.id);
    if (pending !== undefined) {
      return onCut
        ? pending.then((row) => {
            onCut();
            return row;
          })
        : pending;
    }
    const work = (async (): Promise<WorkspaceRow> => {
      notPaused(workspace.machineId);
      const [latest] = db.workItemsIn(workspace.id);
      const [session] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
      const projectId = latest?.projectId ?? null;
      const checkout = (await call(
        workspace.machineId,
        CONTROL_WORKSPACE_CREATE,
        [
          workspace.repoRoot,
          workspace.id,
          projectId,
          session?.accountId ?? null,
          workspace.landed ?? null,
        ]
      )) as WorkspaceCheckout;
      const path = cutPath(workspace.machineId, checkout.path);
      if (path !== workspace.path) {
        throw new Error(
          `workspace ${workspace.id} was cut again at ${path}, not at its own path ${workspace.path}`
        );
      }
      if (projectId && db.project(projectId)) {
        db.addPlace({
          projectId,
          machineId: workspace.machineId,
          path: workspace.path,
          kind: "workspace",
        });
        placesChanged(workspace.machineId, projectId);
      }
      const again =
        db.updateWorkspace(workspace.id, {
          state: "active",
          boundaryPid: checkout.boundaryPid,
          base: checkout.base,
          tmp: checkout.tmp,
        }) ?? workspace;
      onCut?.();
      workspaceChanged?.(again);
      console.log(
        `[workspaces] ${workspace.id} on ${machineName(workspace.machineId)}: cut again at ${workspace.path}, at ${workspace.landed ? `${workspace.landed.commit.slice(0, 9)} on ${workspace.landed.branch}` : `the tip of ${checkout.base}`}, for its delegate to go on`
      );
      return again;
    })().finally(() => recutting.delete(workspace.id));
    recutting.set(workspace.id, work);
    return work;
  };

  /**
   * Whether a send from `origin` to session `instanceId` reopens a finished
   * item whose workspace retired ({@link recuttable}): from one who may
   * reopen it ({@link mayReopen}), to its workspace's latest item. Such a
   * send waits at the hub while the workspace is cut again ({@link recut}).
   */
  const retiredFor = (instanceId: string, origin: NeutralOrigin): boolean => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row ? itemOf(row) : undefined;
    if (!item || LIVE.has(item.state) || !mayReopen(item, origin)) {
      return false;
    }
    const [workspace] = db.workspacesNamed(item.workspaceId);
    return (
      workspace !== undefined &&
      recuttable(workspace) &&
      db.workItemsIn(workspace.id)[0]?.id === item.id
    );
  };

  /** A held workspace filed active again: a follow-up, a retry or a handoff continues its work. */
  const continued = (workspace: WorkspaceRow): WorkspaceRow => {
    if (workspace.state !== "held") {
      return workspace;
    }
    const active =
      db.updateWorkspace(workspace.id, {
        state: "active",
        holding: null,
        heldAt: null,
      }) ?? workspace;
    placesChanged(workspace.machineId);
    workspaceChanged?.(active);
    return active;
  };

  /**
   * The workspace a follow-up names, and the item before it there. Refused
   * while that workspace has a live item: one writer per checkout. Nothing
   * here awaits, so the check and the item {@link start} files after it are
   * one step — two follow-ups can never both pass it.
   */
  const claim = (
    needle: string
  ): { workspace: WorkspaceRow; previous: WorkItemRow | undefined } => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length !== 1) {
      throw new WorkItemRefusal(
        404,
        named.length
          ? `"${needle}" names ${named.length} workspaces. Pass the full workspace id.`
          : `No workspace "${needle}".`
      );
    }
    const [workspace] = named;
    // A retired one was cut again before this ({@link startFollowUp}).
    if (workspace.state === "archived") {
      throw new WorkItemRefusal(
        409,
        workspace.carry
          ? `Workspace ${workspace.id} was discarded: its unlanded work is in the carry ${workspace.carry} on ${machineName(workspace.machineId)}, and its clone is gone. Delegate without workspace to start a new one.`
          : `Workspace ${workspace.id} is archived: its clone and boundary are gone. Delegate without workspace to start a new one.`
      );
    }
    if (workspace.checksFor) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${workspace.id} runs the checks of workspace ${workspace.checksFor} on its machine and takes no work item. Delegate with workspace ${workspace.checksFor}, or without workspace to start a new one.`
      );
    }
    const items = db.workItemsIn(workspace.id);
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${workspace.id} already has a live work item: ${live.title} (${live.id}) is ${live.state}. A workspace runs one work item at a time; wait for its report, or delegate without workspace to start a new one.`
      );
    }
    return { workspace, previous: items[0] };
  };

  /**
   * A follow-up's boundary, running before its item is filed: the machine
   * starts it again when it has gone (a reboot, a sessiond restart, a held
   * workspace's settle), or says why it cannot and the follow-up is
   * refused. A workspace that is missing or archived is left to
   * {@link claim}, which refuses it in its own words.
   */
  const boundaryUp = async (needle: string): Promise<void> => {
    const [workspace] = db.workspacesNamed(needle.trim());
    if (!workspace || workspace.state === "archived") {
      return;
    }
    const boundaryPid = (await call(
      workspace.machineId,
      CONTROL_WORKSPACE_BOUNDARY,
      [refOf(workspace)]
    )) as number;
    db.updateWorkspace(workspace.id, { boundaryPid });
  };

  /**
   * The folder a delegate names (`cwd`), or its parent's, as a path on the
   * machine its workspace is cut on (db `machinePathOn`): refused with that
   * gate's sentence, a 400, before anything is cut.
   */
  const cwdOn = (machineId: string, raw: string): MachinePath => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      throw new WorkItemRefusal(400, path.message, { cause: path });
    }
    return path;
  };

  /** A path the machine reported about a clone it cut: absolute, or its refusal thrown. */
  const cutPath = (machineId: string, raw: string): MachinePath => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      throw path;
    }
    return path;
  };

  /**
   * A new workspace: the project's place made a git repository first when it
   * is a plain folder ({@link WorkItemDeps.beforeCut}), then its machine cuts
   * the clone and starts its boundary, and the hub files it. A place that
   * cannot be made one refuses the workspace in the machine's words, before
   * anything is cut. `checksFor` makes it the check workspace of that one;
   * `account` is the Claude account its first session launches on
   * ({@link ItemPlacement}), whose user layer the boundary reads from its
   * first start.
   */
  const openWorkspace = async (
    createdBy: string,
    cwd: MachinePath,
    machineId: string,
    projectId: string | null,
    { account, checksFor }: { account?: string; checksFor?: string } = {}
  ): Promise<WorkspaceRow> => {
    if (projectId) {
      await beforeCut(projectId, machineId, cwd);
    }
    const id = crypto.randomUUID();
    db.beginWorkspaceCreate(id, machineId);
    opening.add(id);
    const started = Date.now();
    try {
      const checkout = (await call(machineId, CONTROL_WORKSPACE_CREATE, [
        cwd,
        id,
        projectId,
        account ?? null,
      ])) as WorkspaceCheckout;
      return db.createWorkspace({
        id,
        machineId,
        // Absolute as the machine cut them; the gate says so or refuses.
        repoRoot: cutPath(machineId, checkout.repoRoot),
        path: cutPath(machineId, checkout.path),
        branch: checkout.branch,
        base: checkout.base,
        boundaryPid: checkout.boundaryPid,
        tmp: checkout.tmp,
        state: "active",
        createdByInstanceId: createdBy,
        checksFor: checksFor ?? null,
      });
    } catch (error) {
      opening.delete(id);
      const reason = error instanceof Error ? error.message : String(error);
      const waited = ((Date.now() - started) / 1000).toFixed(1);
      try {
        await discardCreate(id, machineId);
      } catch (discardError) {
        const pending =
          discardError instanceof Error
            ? discardError.message
            : String(discardError);
        throw new Error(
          `Workspace create on machine ${machineId} failed after ${waited}s: ${reason}. Discard of workspace ${id} is pending (${pending}); it will be retried when the machine next registers.`,
          { cause: discardError }
        );
      }
      throw new Error(
        `Workspace create on machine ${machineId} failed after ${waited}s: ${reason}. Workspace ${id} was discarded; no clone or boundary was left.`,
        { cause: error }
      );
    } finally {
      opening.delete(id);
    }
  };

  /**
   * Records the repository a new workspace of the project was cut from, on
   * its machine: a check that names that machine is cut from it, whatever
   * becomes of the workspace. One cut from another workspace's clone records
   * the repository that clone was cut from.
   */
  const recordRepository = (
    projectId: string,
    workspace: WorkspaceRow
  ): void => {
    const source = db
      .activeWorkspacesOn(workspace.machineId)
      .find((each) => each.path === workspace.repoRoot);
    db.recordProjectRepository({
      projectId,
      machineId: workspace.machineId,
      path: source?.repoRoot ?? workspace.repoRoot,
    });
  };

  /** A new workspace's machine; a remote one needs its own repository and cannot fork. */
  const targetMachine = (request: WorkItemRequest, parent: Parent): string => {
    const machineId = request.machineId ?? parent.machineId;
    if (machineId !== parent.machineId) {
      if (request.fork) {
        throw new WorkItemRefusal(
          400,
          "A fork copies a conversation stored on the parent's machine; drop machine, or delegate without fork."
        );
      }
      if (!request.cwd?.trim()) {
        throw new WorkItemRefusal(
          400,
          "A delegate on another machine needs cwd: the repository's absolute path on that machine."
        );
      }
    }
    return machineId;
  };

  const settingsOf = (request: WorkItemRequest, parent: Parent): Settings => {
    const { type, harness, model } = resolveSpawnType(
      types(parent.projectId),
      request
    );
    const settings: Settings = {
      type,
      harness,
      model,
      skills: request.skills?.length ? request.skills : type?.skills,
      canDelegate: request.canDelegate ?? type?.canDelegate ?? false,
      ...(request.account ? { account: request.account } : {}),
      ...(request.role ? { role: request.role } : {}),
    };
    return request.fork
      ? { ...settings, ...forkOf(request, parent) }
      : settings;
  };

  /**
   * What a fork takes from its parent: the conversation as it stands, and the
   * harness and model that wrote it. The prompt cache is keyed on both, so a
   * fork onto anything else would re-read the whole history at full price;
   * asking for one is refused rather than quietly overridden.
   */
  const forkOf = (
    request: WorkItemRequest,
    parent: Parent
  ): Pick<Settings, "forkOf" | "harness" | "model"> => {
    if (!parent.sessionId) {
      throw new WorkItemRefusal(
        409,
        "This session has not named its conversation yet, so there is nothing to fork. Delegate without fork."
      );
    }
    const harness = parent.harness as HarnessKind;
    const model = parent.model ?? undefined;
    if (request.account) {
      throw new WorkItemRefusal(
        400,
        "A fork runs on its parent's account, which is what keeps the prompt cache. Drop account, or delegate without fork."
      );
    }
    if (
      (request.harness && request.harness !== harness) ||
      (request.model && request.model !== model)
    ) {
      throw new WorkItemRefusal(
        400,
        `A fork runs on its parent's harness and model (${harness}${model ? `, ${model}` : ""}), which is what keeps the prompt cache. Drop harness/model, or delegate without fork.`
      );
    }
    return { forkOf: parent.sessionId, harness, model };
  };

  /**
   * A follow-up in a workspace whose last session has a conversation: a new
   * item on that same session, its brief the session's next message, read on
   * the transcript its provider still has cached. The session now answers to
   * the caller, and its reports come here.
   */
  const continueIn = (
    workspace: WorkspaceRow,
    previous: WorkItemRow,
    session: InstanceRow,
    parent: Parent,
    request: WorkItemRequest,
    inputs: InputFile[]
  ): WorkItemStart => {
    const item = db.createWorkItem({
      // A queued follow-up's item takes the id its chip stood under.
      id: request.queuedAs?.id ?? crypto.randomUUID(),
      workspaceId: workspace.id,
      parentInstanceId: parent.id,
      instanceId: session.id,
      brief: request.prompt,
      title: request.title.trim(),
      type: previous.type,
      ...placing(request, parent),
      harness: previous.harness,
      model: previous.model,
      effort: previous.effort,
      state: "running",
      checks: request.checks,
      // The session has history: what it spent before is not this item's.
      spendBaseUsd: session.sessionId
        ? db.sessionCostUsd(session.sessionId)
        : 0,
    });
    db.patchInstance(session.id, {
      workItemId: item.id,
      parentInstanceId: parent.id,
    });
    published(item);
    const brief = withInputsLine(
      `${handoffMarker(sessionLabel(parent).name, parent.id)}${request.prompt}`,
      inputs
    );
    // The session read how its last item landed; this one is told when it
    // lands otherwise or hands in outputs.
    const told =
      item.lands === "main" && !item.outputs?.length
        ? brief
        : withLandingLine(brief, workspace.base, landingOf(item));
    const sent = send(messageOf(session.id, session.machineId, parent, told));
    if (sent.state === "failed") {
      update(item.id, {
        state: "failed",
        error: sent.reason,
        endedAt: new Date(),
      });
      throw new Error(sent.reason ?? `could not reach ${session.id}`);
    }
    const label = sessionLabel(session).tag;
    return {
      item,
      workspace,
      text:
        `Continued ${label} as work item ${item.id} in workspace ${workspace.id} (${placeOf(workspace)}): ` +
        "the brief is its next message, in the same session and its cached transcript. " +
        "Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
        `reports, with handoff("${session.id}", ...).${extrasLine(item)}${inputsSaid(inputs)}`,
    };
  };

  /**
   * A follow-up in the workspace `needle` names: continued in the session its
   * last item ran ({@link continueIn}), or, when that session never started,
   * the workspace alone for a new session to start in. The session's settings
   * are its own, so a request naming others is refused.
   */
  const followUp = (
    needle: string,
    request: WorkItemRequest,
    parent: Parent,
    inputs: InputFile[]
  ): WorkItemStart | WorkspaceRow => {
    if (
      request.type ||
      request.model ||
      request.harness ||
      request.fork ||
      request.machineId !== undefined ||
      request.skills?.length
    ) {
      throw new WorkItemRefusal(
        400,
        "a follow-up continues the same session; delegate without workspace for a different model or machine"
      );
    }
    const claimed = claim(needle);
    const { previous } = claimed;
    // Continuing a held workspace ends its hold: its work is live again.
    const workspace = continued(claimed.workspace);
    const [session] = previous
      ? db.getInstancesByIds([previous.instanceId])
      : [];
    return previous && session?.sessionId
      ? continueIn(workspace, previous, session, parent, request, inputs)
      : workspace;
  };

  /**
   * The sessions of a workspace's items whose process is not confirmed gone
   * (a failed attempt's session stays up after its item fails; a stopping
   * one may still run until its machine confirms).
   */
  const sessionsUpIn = (workspaceId: string): InstanceRow[] =>
    db
      .getInstancesByIds([
        ...new Set(db.workItemsIn(workspaceId).map((item) => item.instanceId)),
      ])
      .filter((row) => !GONE.has(row.status));

  /**
   * Stops the sessions of a workspace's earlier items as `stop_delegate`
   * does (`end`: the stored stop, then the machine's confirmation), so a
   * retry's fresh session is the only one there. Refused when a machine does
   * not confirm: no fresh session starts beside one still running.
   */
  const endEarlierSessions = async (workspace: WorkspaceRow): Promise<void> => {
    const up = sessionsUpIn(workspace.id);
    const stops = await Promise.allSettled(up.map((row) => end(row.id)));
    const unconfirmed = stops.find(
      (stop): stop is PromiseRejectedResult => stop.status === "rejected"
    );
    if (unconfirmed) {
      const { reason } = unconfirmed;
      throw new WorkItemRefusal(
        409,
        `The last attempt's session in workspace ${workspace.id} was told to stop and has not confirmed it, so no fresh session starts beside it: ${reason instanceof Error ? reason.message : String(reason)} Retry once its machine has ended it.`
      );
    }
    if (up.length > 0) {
      console.log(
        `[work-items] workspace ${workspace.id}: stopped ${up.map((row) => row.id).join(", ")} before a retry's fresh session`
      );
    }
  };

  /**
   * The workspace a retry goes on in, with its clone there: a retired one
   * cut again ({@link recut}); one that never retired as it stands, while
   * its clone is on its machine. Undefined when that clone is gone.
   */
  const withClone = async (
    workspace: WorkspaceRow
  ): Promise<WorkspaceRow | undefined> => {
    if (recuttable(workspace)) {
      return await recut(workspace);
    }
    const there = await command(
      workspace.machineId,
      "/",
      `test -d ${quote(`${workspace.path}/.git`)}`,
      GIT_TIMEOUT_MS
    );
    return there.exitCode === 0 ? workspace : undefined;
  };

  /**
   * The workspace of an earlier attempt a retry runs in again: its earlier
   * sessions stopped ({@link endEarlierSessions}), its clone cut again by id
   * at its own path when it retired ({@link recut}), its boundary started
   * again, and the workspace filed active (a held one's hold ends).
   * Undefined when its work was discarded, its clone is gone from a
   * workspace that never retired, its machine cannot say, or it is on none
   * of the machines `on` names (the request's `reuseOn`), and the retry cuts
   * a new workspace. Refused while an item there is live.
   */
  const reusable = async (
    id: string,
    on: string[] | undefined
  ): Promise<WorkspaceRow | undefined> => {
    const [workspace] = db.workspacesNamed(id);
    if (!workspace || (on && !on.includes(workspace.machineId))) {
      return;
    }
    const busy = (): void => {
      const live = db
        .workItemsIn(workspace.id)
        .find((item) => LIVE.has(item.state));
      if (live) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} already has a live work item: ${live.title} (${live.id}) is ${live.state}. A workspace runs one work item at a time.`
        );
      }
    };
    busy();
    // Before anything reaches the machine, as a new clone is refused.
    notPaused(workspace.machineId);
    if (workspace.state === "archived" && !recuttable(workspace)) {
      return;
    }
    try {
      await endEarlierSessions(workspace);
      const here = await withClone(workspace);
      if (!here) {
        return;
      }
      const boundaryPid = (await call(
        here.machineId,
        CONTROL_WORKSPACE_BOUNDARY,
        [refOf(here)]
      )) as number;
      // Awaited above: the one-writer check again, in the step that files the item.
      busy();
      return (
        db.updateWorkspace(continued(here).id, {
          boundaryPid,
          state: "active",
        }) ?? here
      );
    } catch (error) {
      if (error instanceof WorkItemRefusal) {
        throw error;
      }
      console.warn(
        `[work-items] workspace ${workspace.id} cannot be used again, so a new one is cut: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  };

  /**
   * The request as {@link start} files it (its outputs as paths), its parent,
   * and the project it works for; refused when any of it cannot stand.
   */
  const admitted = (
    asked: WorkItemRequest,
    /** The parent when it is no session (a routine's): read off the hub otherwise. */
    given?: Parent
  ): {
    parent: Parent;
    projectId: string | null;
    request: WorkItemRequest;
  } => {
    const request = {
      ...asked,
      outputs: outputsOf(asked.outputs) ?? undefined,
      owns: asked.owns?.length
        ? [...new Set(asked.owns.map(globOf))]
        : undefined,
    };
    const [parent] = given
      ? [given]
      : db.getInstancesByIds([request.parentInstanceId]);
    if (!parent) {
      throw new WorkItemRefusal(
        404,
        `unknown session ${request.parentInstanceId}`
      );
    }
    if (parent.canDelegate === false) {
      throw new WorkItemRefusal(403, LEAF_DELEGATE_REFUSAL);
    }
    const problem = requestProblem(request);
    if (problem) {
      throw new WorkItemRefusal(400, problem);
    }
    request.checks = machinesOf(request.checks);
    hostDeclared(request.checks, parent.id);
    // An attempt spends the project's money: none starts past its cap.
    const capped = request.task ? pauses(request.task.projectId) : undefined;
    if (capped) {
      throw new WorkItemRefusal(409, capped);
    }
    const projectId = request.task?.projectId ?? parent.projectId ?? null;
    if (request.outputs && !projectId) {
      throw new WorkItemRefusal(
        400,
        "outputs are copied into the project's folder, and this session belongs to no project. Drop outputs, or delegate from a session in a project."
      );
    }
    return { request, parent, projectId };
  };

  /**
   * The inputs `paths` names, read on `reader`'s machine (agent inputs.ts):
   * none for none. Refused, in the machine's words, when one may not leave
   * it; one outside `reader`'s own clone and scratch dir may not, when it
   * runs inside a boundary ({@link boundOf}).
   */
  const readInputs = async (
    paths: string[] | undefined,
    reader: Pick<Parent, "id" | "machineId">
  ): Promise<InputFile[]> => {
    if (!paths?.length) {
      return [];
    }
    const [row] = db.getInstancesByIds([reader.id]);
    const read = (await call(reader.machineId, CONTROL_INPUTS_READ, [
      paths,
      (row && boundOf(row)) ?? null,
    ])) as InputsRead;
    if ("refused" in read) {
      throw new WorkItemRefusal(400, `inputs: ${read.refused}.`);
    }
    return read.files;
  };

  /** `inputs` written into `workspace`'s `$TMPDIR/inputs/` on its machine, before a brief names them. */
  const handIn = async (
    workspace: WorkspaceRow,
    inputs: InputFile[]
  ): Promise<void> => {
    if (inputs.length > 0) {
      await call(workspace.machineId, CONTROL_INPUTS_WRITE, [
        refOf(workspace),
        inputs,
      ]);
    }
  };

  /**
   * Files and spawns an item. Refused with {@link OwnsOverlap} while a live
   * item owns files it owns too; the files it owns are held from that check
   * until its item is filed, so two starts never both pass it. Its inputs are
   * read first: one that may not go refuses the start before anything is cut.
   */
  const start = async (
    asked: WorkItemRequest,
    given?: Parent
  ): Promise<WorkItemStart> => {
    const { request, parent, projectId } = admitted(asked, given);
    const inputs = await readInputs(request.inputs, parent);
    const release = claimOwns(request, parent, projectId);
    try {
      return await startAdmitted(request, parent, projectId, inputs);
    } finally {
      release();
    }
  };

  /** Refuses a start on a machine the owner paused ({@link MachinePaused}). */
  const notPaused = (machineId: string): void => {
    const paused = machinePaused(machineId);
    if (paused) {
      throw new MachinePaused(paused);
    }
  };

  /** Refuses settings whose model the machine does not run ({@link WorkItemDeps.modelRefusal}). */
  const modelOffered = (machineId: string, settings: Settings): void => {
    const refusal = modelRefusal(machineId, settings.harness, settings.model);
    if (refusal) {
      throw new WorkItemRefusal(400, refusal);
    }
  };

  const startAdmitted = async (
    request: WorkItemRequest,
    parent: Parent,
    projectId: string | null,
    inputs: InputFile[]
  ): Promise<WorkItemStart> => {
    if (request.reuse) {
      const again = await reusable(request.reuse, request.reuseOn);
      if (again) {
        await handIn(again, inputs);
        return spawnIn(
          again,
          settingsOf(request, parent),
          parent,
          request,
          inputs
        );
      }
      // Its clone is gone, or on a machine the attempt may not run on: the
      // retry runs in a new workspace, and the old one's sessions are
      // stopped all the same, the stop stored for a machine that is away.
      for (const row of sessionsUpIn(request.reuse)) {
        end(row.id).catch((error: unknown) =>
          console.warn(
            `[work-items] ${row.id}, an earlier attempt's session, is told to stop and has not confirmed it: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
    if (!request.workspace) {
      const machineId = targetMachine(request, parent);
      // Before anything reaches the machine: a paused one cuts no clone.
      notPaused(machineId);
      const settings = settingsOf(request, parent);
      // Before the clone is cut: a model the machine does not run starts nothing.
      modelOffered(machineId, settings);
      // Placed before the clone is cut: the boundary starts with the account
      // the session launches on, and the session opens on that same account.
      const instanceId = request.queuedAs?.instanceId ?? crypto.randomUUID();
      const placement = placeAhead(
        machineId,
        sessionOf(instanceId, request.title.trim(), parent, settings),
        { projectId, taskId: request.task?.id }
      );
      const workspace = await openWorkspace(
        parent.id,
        cwdOn(machineId, request.cwd ?? parent.cwd),
        machineId,
        projectId,
        { account: placement.launchesOn }
      );
      if (projectId) {
        recordRepository(projectId, workspace);
      }
      // While it lives, the clone is one of the parent's project's places;
      // archiving the workspace removes it.
      if (parent.projectId) {
        projectStands(parent.projectId);
        db.addPlace({
          projectId: parent.projectId,
          machineId,
          path: workspace.path,
          kind: "workspace",
        });
        placesChanged(machineId, parent.projectId);
      }
      // In its scratch dir before its session starts.
      await handIn(workspace, inputs);
      return spawnIn(workspace, settings, parent, request, inputs, {
        instanceId,
        placement,
      });
    }
    return await startFollowUp(request.workspace, request, parent, inputs);
  };

  /**
   * The follow-up in the workspace `needle` names. A retired one is cut
   * again at its own path first ({@link recut}). Its boundary is up and its
   * inputs are written before the claim, which files the item in the same
   * step as its one-writer check; the inputs land only in a workspace the
   * claim would take, and the claim is made again as the item is filed.
   */
  const startFollowUp = async (
    needle: string,
    request: WorkItemRequest,
    parent: Parent,
    inputs: InputFile[]
  ): Promise<WorkItemStart> => {
    const named = namedWorkspace(needle);
    notPaused(named.machineId);
    if (recuttable(named)) {
      await recut(named);
    }
    await boundaryUp(needle);
    if (inputs.length > 0) {
      await handIn(claim(needle).workspace, inputs);
    }
    const followed = followUp(needle, request, parent, inputs);
    // A workspace whose last session never started has nothing to continue:
    // a session starts there the way every new delegate's does.
    return "item" in followed
      ? followed
      : spawnIn(followed, settingsOf(request, parent), parent, request, inputs);
  };

  /**
   * Where an item lands and what it hands in, and the project it works for
   * (its task's, else its parent's), as its row keeps them.
   */
  /**
   * Whose work a new item is ({@link WorkItemRequest.origin}): the request's,
   * else its parent's. A routine's run is an event's; Caw's, the turn he is
   * in; a work item's session's, its own item's; anyone else's, yours.
   */
  const originOf = (request: WorkItemRequest, parent: Parent): WorkOrigin => {
    if (request.origin) {
      return request.origin;
    }
    if (isRoutineParent(parent.id)) {
      return "event";
    }
    const turn = leadTurn?.(parent.id);
    if (turn) {
      return turn;
    }
    const [row] = db.getInstancesByIds([parent.id]);
    return (row?.workItemId && db.workItem(row.workItemId)?.origin) || "you";
  };

  const placing = (request: WorkItemRequest, parent: Parent) => {
    const projectId = request.task?.projectId ?? parent.projectId;
    const project = projectId ? db.project(projectId) : undefined;
    return {
      origin: originOf(request, parent),
      byPerson: request.byPerson ?? false,
      ...(request.task ? { taskId: request.task.id } : {}),
      ...(projectId ? { projectId } : {}),
      lands: request.lands ?? "main",
      outputs: request.outputs?.length ? request.outputs : null,
      group: request.group?.trim() || null,
      owns: request.owns?.length ? request.owns : null,
      budget: budgetFrom(request.budget, project?.budget),
    };
  };

  /** What the caller's start text adds for inputs copied in: their names. */
  const inputsSaid = (inputs: InputFile[]): string =>
    inputs.length > 0
      ? ` Copied ${counted(inputs.length, "input")} into its $TMPDIR/inputs/: ${inputs.map((input) => input.name).join(", ")}.`
      : "";

  /** What the caller's start text adds for a group, owned files and a budget. */
  const extrasLine = (item: WorkItemRow): string => {
    const owns = db.workItemGlobs(item.id);
    return [
      item.group
        ? ` It is in group “${item.group}”: its report waits until every item of the group has ended (a failure reports at once).`
        : "",
      owns.length > 0 ? ` It owns ${owns.join(", ")}.` : "",
      item.budget
        ? ` Its budget: ${[
            item.budget.usd === undefined ? "" : `$${item.budget.usd}`,
            item.budget.turns === undefined
              ? ""
              : counted(item.budget.turns, "turn"),
            item.budget.minutes === undefined
              ? ""
              : counted(item.budget.minutes, "minute"),
          ]
            .filter(Boolean)
            .join(", ")}.`
        : "",
    ].join("");
  };

  /**
   * A new session in `workspace`, running a new item from the request's
   * brief. `ahead`: its id and account, placed before a new workspace was
   * cut ({@link ItemPlacement}); absent, it is placed as it spawns.
   */
  const spawnIn = (
    workspace: WorkspaceRow,
    settings: Settings,
    parent: Parent,
    request: WorkItemRequest,
    inputs: InputFile[],
    ahead?: { instanceId: string; placement: ItemPlacement }
  ): WorkItemStart => {
    notPaused(workspace.machineId);
    modelOffered(workspace.machineId, settings);
    const { harness, canDelegate } = settings;
    // A queued delegate's session and item take the ids its chip stood under.
    const instanceId =
      ahead?.instanceId ?? request.queuedAs?.instanceId ?? crypto.randomUUID();
    // Not a row yet: it is launched in the workspace's root.
    const label = `${leafOf(workspace.path)}#${instanceId.slice(0, 8)}`;
    const item = db.createWorkItem({
      id: request.queuedAs?.id ?? crypto.randomUUID(),
      workspaceId: workspace.id,
      parentInstanceId: parent.id,
      instanceId,
      brief: request.prompt,
      title: request.title.trim(),
      type: settings.type?.name,
      ...placing(request, parent),
      harness,
      model: settings.model,
      effort: settings.type?.effort,
      state: "starting",
      checks: request.checks,
    });
    published(item);
    spawnedUnder?.(instanceId, parent.id);

    try {
      // A fork opens with what it is.
      const fork = settings.forkOf ? forkLine(workspace) : "";
      spawn(
        workspace.machineId,
        spawnOf(instanceId, item.title, parent, workspace, settings),
        item.id,
        // Autonomous by definition: it must never sit waiting on a tool
        // permission prompt nobody is watching for. Questions still ask.
        // Its parent caused it: Full Send only when the parent is in it now,
        // read off its row as it stands after the workspace was cut.
        unwatchedMode(db.getInstancesByIds([parent.id])[0]?.permissionMode),
        ahead && { accountId: ahead.placement.accountId }
      );
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          withWorkspaceLine(
            withInputsLine(
              `${handoffMarker(sessionLabel(parent).name, parent.id)}${fork}${request.prompt}`,
              inputs
            ),
            workspace.repoRoot,
            workspace.base,
            landingOf(item)
          )
        )
      );
    } catch (error) {
      // An Error with no message still names its kind: String() gives "TypeError".
      const message =
        (error instanceof Error && error.message) || String(error);
      update(item.id, {
        state: "failed",
        error: `Its session did not start: ${message}`,
        endedAt: new Date(),
      });
      throw error;
    }

    return {
      item,
      workspace,
      text:
        `Started work item ${item.id} in workspace ${workspace.id} (${placeOf(workspace)}): ` +
        (settings.forkOf
          ? `a fork of this conversation on ${harness}${settings.model ? ` (${settings.model})` : ""}, ${label}. It starts with every turn of yours so far.`
          : `a fresh ${harness} session, ${label}.`) +
        " Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
        `reports, with handoff("${instanceId}", ...): the message lands in the same session and its cached transcript.` +
        (canDelegate
          ? " It may spawn delegates of its own."
          : " It is a leaf: it cannot delegate further.") +
        extrasLine(item) +
        inputsSaid(inputs),
    };
  };

  /** The item a session runs, when it runs one. */
  const itemOf = (row: InstanceRow): WorkItemRow | undefined =>
    row.workItemId ? db.workItem(row.workItemId) : undefined;

  /**
   * Moves a live item to a finished state; finished work stays as it ended.
   * Its workspace is settled next ({@link settleSoon}): retired or held once
   * nothing holds it, which its session, still in the turn that ended it,
   * does until it sleeps.
   */
  const finish = (
    item: WorkItemRow,
    change: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow => {
    passes.delete(item.id);
    if (!LIVE.has(item.state)) {
      return item;
    }
    const ended = update(item.id, { ...change, endedAt: new Date() }) ?? item;
    settleSoon(item.workspaceId);
    return ended;
  };

  /**
   * Whether the session still has something coming as its turn ends at
   * `endedAt`: a send it has not read, one it read since, or its own
   * delegated work still live.
   */
  const busyAfter = (row: InstanceRow, endedAt: Date): boolean =>
    db.sendsIn(row.id, ["pending"]).length > 0 ||
    db
      .sendsIn(row.id, ["read"])
      .some((handed) => handed.acceptedAt > endedAt) ||
    db.liveWorkItemsOf(row.id).length > 0;

  /**
   * Whether an item that just ended keeps its report for its group's one
   * report ({@link settleGroup}): a done item of a group not yet reported.
   * A failure reports at once. The one rule for every way an item ends done.
   */
  const heldForGroup = (ended: WorkItemRow): boolean =>
    ended.state === "done" && ended.group !== null && !ended.groupReportedAt;

  /**
   * A turn of an item filed before checks existed: unless the session is
   * busy, it ends the item with the turn's text, and the report carries it;
   * a done item of a group says nothing now ({@link heldForGroup}).
   */
  const uncheckedTurn = (
    item: WorkItemRow,
    turn: { text: string; error?: string },
    busy: boolean
  ): { body: string; failed: boolean } | undefined => {
    const failed = turn.error !== undefined;
    const ended = busy
      ? item
      : finish(
          item,
          failed
            ? { state: "failed", error: turn.error, result: turn.text }
            : { state: "done", result: turn.text }
        );
    if (failed && !busy) {
      console.log(`[work-items] ${item.id}: its turn failed: ${turn.error}`);
    }
    return heldForGroup(ended)
      ? undefined
      : { body: `${turn.text}${reportLine(ended)}`, failed };
  };

  /**
   * A live item's turn that failed with `error`: the item fails with it,
   * unless its session is busy again, and its parent hears it either way.
   */
  const failedTurn = (
    item: WorkItemRow,
    error: string,
    busy: boolean
  ): { body: string; failed: boolean } => {
    quiet.delete(item.id);
    if (busy) {
      return { body: `${error}${reportLine(item)}`, failed: true };
    }
    const ended = finish(item, { state: "failed", error });
    console.log(`[work-items] ${item.id}: its turn failed: ${error}`);
    return { body: `${error}${reportLine(ended)}`, failed: true };
  };

  /**
   * A live item's turn that ended quietly, with nothing queued for its
   * session: the "still open" message, and the {@link QUIET_TURNS}th in a
   * row fails it, its parent told.
   */
  const quietTurn = (
    row: InstanceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): { body: string; failed: boolean } | undefined => {
    const turns = (quiet.get(item.id) ?? 0) + 1;
    if (turns >= QUIET_TURNS) {
      quiet.delete(item.id);
      const failed = finish(item, { state: "failed", error: QUIET_ERROR });
      console.log(`[work-items] ${item.id}: ${QUIET_ERROR}`);
      return { body: `${QUIET_ERROR}${reportLine(failed)}`, failed: true };
    }
    quiet.set(item.id, turns);
    tell(
      row,
      `Your work item is still open. Its checks: ${checkNames(checks)}. Finish the work and call finish_item, or call it with \`blocked\` and the exact command and error. Use wait_item for a bounded wait on a command you started.`
    );
    return undefined;
  };

  /** A word from the hub about an item, to the item's session. */
  const tell = (row: InstanceRow, content: string): void => {
    send({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "work-item" },
        },
      },
    });
  };

  /** One expiry path for a live timer, an overdue startup wait, or a turn reaching its deadline. */
  const endWait = (id: string): void => {
    const item = db.workItem(id);
    if (!item?.waitUntil) {
      disarmWait(id);
      return;
    }
    const reason = item.waitReason;
    const resumeBy = new Date(item.waitUntil.getTime() + WAIT_RESUME_GRACE_MS);
    clearWait(item);
    const [row] = db.getInstancesByIds([item.instanceId]);
    if (row && LIVE.has(item.state)) {
      if (inTurn(row)) {
        return;
      }
      const resuming = update(id, { waitResumeBy: resumeBy }) as WorkItemRow;
      armWait(resuming);
      tell(
        row,
        `Your wait is over: ${reason}. Continue, then call finish_item.`
      );
    }
  };
  const armWait = (item: WorkItemRow): void => {
    disarmWait(item.id);
    if (item.waitResumeBy && LIVE.has(item.state)) {
      const missed = (): void => {
        waitTimers.delete(item.id);
        const current = db.workItem(item.id);
        if (!(current?.waitResumeBy && LIVE.has(current.state))) {
          return;
        }
        update(item.id, { waitResumeBy: null });
        const [row] = db.getInstancesByIds([item.instanceId]);
        if (row && !inTurn(row)) {
          report(
            row,
            `${item.title}: the delegate did not resume within 60 seconds of its wait deadline.`,
            false,
            true
          );
        }
      };
      waitTimers.set(
        item.id,
        lifetime.after(
          Math.max(0, item.waitResumeBy.getTime() - Date.now()),
          missed
        )
      );
      return;
    }
    if (!item.waitUntil) {
      return;
    }
    const remaining = item.waitUntil.getTime() - Date.now();
    if (!LIVE.has(item.state) || remaining <= 0) {
      endWait(item.id);
      return;
    }
    waitTimers.set(
      item.id,
      lifetime.after(remaining, () => endWait(item.id))
    );
  };
  const waitingTurn = (item: WorkItemRow): boolean => {
    if (!item.waitUntil) {
      return false;
    }
    quiet.delete(item.id);
    if (item.waitUntil.getTime() <= Date.now()) {
      endWait(item.id);
    }
    return true;
  };

  /** The names of an item's checks, as its session is told them. */
  const checkNames = (checks: WorkItemCheck[]): string =>
    checks.map((check) => check.name).join(", ");

  /**
   * `checks`, each machine one names kept as its machineId: named by that id,
   * its hostname, or the hostname as the fleet shows it, case aside. Refused
   * when a name is no machine of the fleet's, or several. The machine need
   * not be online now, only when the checks run.
   */
  const machinesOf = (checks: WorkItemCheck[]): WorkItemCheck[] => {
    const agents = db.listAgents();
    return checks.map((check) => {
      if (check.machine === undefined) {
        return check;
      }
      const needle = check.machine.trim().toLowerCase();
      const matches = agents.filter(
        (agent) =>
          agent.machineId.toLowerCase() === needle ||
          agent.hostname.toLowerCase() === needle ||
          machineLabel(agent.hostname).toLowerCase() === needle
      );
      const [found] = matches;
      if (matches.length === 1 && found) {
        return { ...check, machine: found.machineId };
      }
      throw new WorkItemRefusal(
        400,
        matches.length > 1
          ? `check "${check.name}": "${check.machine}" names ${matches.length} machines: ${matches.map((agent) => `${machineLabel(agent.hostname)} (${agent.machineId})`).join(", ")}. Name one by its machineId.`
          : `check "${check.name}": no machine of the fleet is named "${check.machine}". The fleet: ${namesAmong(agents, agents)}.`
      );
    });
  };

  /** A machine as a check's line names it: its hostname as the fleet shows it. */
  const machineName = (machineId: string): string => {
    const agents = db.listAgents();
    const agent = agents.find((each) => each.machineId === machineId);
    return agent ? namedAmong(agent, agents) : machineId;
  };

  /**
   * The session's live, checked item that `finish_item` may finish; the done
   * result, when it is done already; or the refusal.
   */
  const finishable = (
    instanceId: string
  ):
    | { row: InstanceRow; item: WorkItemRow; checks: WorkItemCheck[] }
    | string => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row ? itemOf(row) : undefined;
    if (!(row && item)) {
      throw new WorkItemRefusal(409, "No work item is open on this session.");
    }
    if (item.state === "done") {
      return `The item is done.\n\n${item.result ?? ""}\n\nEnd your turn.`;
    }
    if (!LIVE.has(item.state)) {
      throw new WorkItemRefusal(
        409,
        `${item.title} (${item.id}) is ${item.state}; finish_item finishes live work only.`
      );
    }
    if (!item.checks?.length) {
      throw new WorkItemRefusal(
        409,
        "This item has no acceptance checks yet; your parent sets them with set_item_checks."
      );
    }
    if (item.checkingSince) {
      throw new WorkItemRefusal(
        409,
        "checks are already running for this item"
      );
    }
    return { row, item, checks: item.checks };
  };

  /**
   * The project's repository on a machine, which a check workspace there is
   * cut from: its checkout place there (the primary first), or the folder
   * the last workspace of the project cut there was cut from
   * ({@link recordRepository}), which outlives that workspace. Nothing when
   * the hub knows neither.
   */
  const repositoryOn = (
    projectId: string,
    machineId: string
  ): MachinePath | undefined => {
    const checkout = db
      .project(projectId)
      ?.places.find(
        (place) => place.machineId === machineId && place.kind === "checkout"
      )?.path;
    return checkout && isMachinePath(checkout)
      ? checkout
      : db.projectRepository(projectId, machineId);
  };

  /**
   * The workspace that runs `workspace`'s checks on `machineId`: the one cut
   * there before, or a new one cut from the project's repository on that
   * machine. It stays between runs, so a build there is incremental; it is
   * archived with `workspace`.
   */
  const checkWorkspace = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    machineId: string
  ): Promise<WorkspaceRow> => {
    const held = db
      .checkWorkspacesOf(workspace.id)
      .find((each) => each.machineId === machineId);
    if (held) {
      return held;
    }
    const { projectId } = item;
    const repository = projectId
      ? repositoryOn(projectId, machineId)
      : undefined;
    if (!(projectId && repository)) {
      throw new Error(
        projectId
          ? `the hub knows no repository of this project on ${machineName(machineId)}: no checkout place there, and no workspace of it was ever cut there. Your parent delegates once to that machine with cwd at the repository there (or adds it as a checkout of the project); then call finish_item again.`
          : "this item belongs to no project, so the hub knows no checkout of its repository there."
      );
    }
    const opened = await openWorkspace(
      item.instanceId,
      repository,
      machineId,
      projectId,
      { checksFor: workspace.id }
    );
    db.addPlace({ projectId, machineId, path: opened.path, kind: "workspace" });
    placesChanged(machineId, projectId);
    return opened;
  };

  /** The workspace's last commit, read inside its boundary. */
  const headOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string> => {
    const read = await runIn(workspace, item)(
      "git rev-parse --verify 'HEAD^{commit}'",
      GIT_TIMEOUT_MS
    );
    if (read.exitCode !== 0) {
      throw new Error(
        `the workspace's last commit could not be read: ${failedWith(read)}`
      );
    }
    return read.stdout.trim();
  };

  /**
   * Runs `checks` in order. A check runs in the workspace's worktree, on its
   * machine, inside its boundary: it reads what its delegate wrote, at the
   * path the delegate wrote it (`$TMPDIR` is the workspace's own scratch dir there). A check
   * that names another machine runs there, in the workspace's check workspace
   * ({@link checkWorkspace}), inside that one's boundary, at the workspace's
   * last commit: the commits past its base go over as a git bundle, once per
   * run and machine. Uncommitted work stays where it is.
   *
   * A check its parent marked `host` runs outside every boundary, as the
   * agent's user, on the workspace's machine or the one it names: in a fresh
   * checkout of the workspace's last commit (agent host-check.ts), cloned
   * from the clone that holds it there (the workspace, or its check
   * workspace), its dependencies installed, once per run and machine. What
   * no sandbox may do runs there: user namespaces, podman, a probe whose
   * scratch fleet cuts workspaces. Each such checkout goes when the run ends.
   */
  const runChecks = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[],
    how: CheckHow
  ): Promise<CheckRun> => {
    let commit: Promise<WorkspaceCommit> | undefined;
    /** The check running now, for the words of its waits. */
    let current: WorkItemCheck | undefined;
    /** What a check waits for, as the item's status says it ({@link CheckHow}). */
    const queued = (words: string | null): void =>
      how.say(words, current?.name);
    /**
     * How a check's commands run: a pause that cancels one hands it back
     * here; in the turn, one that would wait throws {@link WouldWait}.
     */
    const asCheck = {
      onWait: queued,
      what: "check",
      movable: true,
      noWait: how.inTurn,
    } as const;
    /**
     * Waits out a pause of the machine a check runs on, the item's status
     * saying it; at once when it is not paused. In the turn it throws
     * {@link WouldWait} instead.
     */
    const unpaused = async (machineId: string): Promise<void> => {
      const words = machinePaused(machineId);
      if (!words) {
        return;
      }
      if (how.inTurn) {
        throw new WouldWait(words);
      }
      queued(`waiting: ${words}`);
      await machineFree(machineId);
      queued(null);
    };
    /** The installs this run made, each a line of the check log ahead of the checks. */
    const installs: InstallOutcome[] = [];
    /**
     * Installs the dependencies of the checkout at `path` on `machineId`,
     * inside `bound`'s boundary (none for a host check's checkout), when its
     * lockfile moved since they were installed ({@link depsScript}).
     * Answers whether the checkout can be checked: false once its install
     * failed. An install that ran is logged in {@link installs}, with `where`.
     * One a pause cancels throws {@link PausedRun}: it runs again with its check.
     */
    const install = async (
      machineId: string,
      path: string,
      bound: WorkspaceRef | undefined,
      where?: string
    ): Promise<boolean> => {
      const started = Date.now();
      const complete = await command(
        machineId,
        path,
        `${SAFE_GIT_SHELL}${depsScript()}`,
        CHECK_TIMEOUT_SEC * 1000,
        bound,
        asCheck
      );
      if (complete.cancelled) {
        throw new PausedRun();
      }
      if (
        complete.exitCode === 0 &&
        !complete.stdout.startsWith(DEPS_INSTALLING)
      ) {
        return true;
      }
      const said = complete.stdout.startsWith(DEPS_INSTALLING)
        ? (complete.stdout.split("\n")[0] ?? "").slice(DEPS_INSTALLING.length)
        : "the dependency install";
      installs.push({
        said,
        result: checkTails(complete),
        where,
        durationMs: Date.now() - started,
        passed: complete.exitCode === 0,
      });
      return complete.exitCode === 0;
    };
    /** A memo per machine: the first call for a machine runs `make`, every later one shares it. */
    const once = <T>(
      memo: Map<string, Promise<T>>,
      machineId: string,
      make: () => Promise<T>
    ): Promise<T> => {
      const known = memo.get(machineId);
      if (known !== undefined) {
        return known;
      }
      const made = make();
      memo.set(machineId, made);
      return made;
    };
    const placed = new Map<
      string,
      Promise<{ at: WorkspaceRow; head: string }>
    >();
    /** The check workspace on `machineId`, at the workspace's commit; its dependencies not yet installed. */
    const atCommit = (
      machineId: string
    ): Promise<{ at: WorkspaceRow; head: string }> =>
      once(placed, machineId, async () => {
        const at = await checkWorkspace(workspace, item, machineId);
        commit ??= call(workspace.machineId, CONTROL_WORKSPACE_BUNDLE, [
          refOf(workspace),
          workspace.base,
        ]) as Promise<WorkspaceCommit>;
        const made = await commit;
        await call(machineId, CONTROL_WORKSPACE_AT, [
          refOf(at),
          workspace.base,
          made,
          workspace.id,
        ]);
        return { at, head: made.head };
      });
    /** The failure a checkout whose install failed throws, for its check's line. */
    const INSTALL_FAILED =
      "its dependency install failed there; the dependencies line above the checks has the installer's output";
    const installed = new Map<
      string,
      Promise<{ at: WorkspaceRow; head: string }>
    >();
    /** The check workspace on `machineId`, at the workspace's commit, its dependencies installed. */
    const elsewhere = (
      machineId: string
    ): Promise<{ at: WorkspaceRow; head: string }> =>
      once(installed, machineId, async () => {
        const ready = await atCommit(machineId);
        const where = `on ${machineName(machineId)} at ${ready.head.slice(0, 9)}`;
        if (
          !(await install(machineId, ready.at.path, refOf(ready.at), where))
        ) {
          throw new Error(INSTALL_FAILED);
        }
        return ready;
      });
    /** The host checkouts this run made, each removed when the run ends. */
    const checkouts: { machineId: string; run: string }[] = [];
    const cloned = new Map<string, Promise<{ path: string; where: string }>>();
    /**
     * The host checkout on `machineId`, at the workspace's last commit,
     * outside every boundary: cloned from the workspace's own clone on its
     * machine, else from its check workspace there, put at the commit first
     * ({@link atCommit}).
     */
    const hostCheckout = (
      machineId: string
    ): Promise<{ path: string; where: string }> =>
      once(cloned, machineId, async () => {
        const { source, head } =
          machineId === workspace.machineId
            ? { source: refOf(workspace), head: await headOf(workspace, item) }
            : await atCommit(machineId).then((ready) => ({
                source: refOf(ready.at),
                head: ready.head,
              }));
        const run = crypto.randomUUID();
        checkouts.push({ machineId, run });
        const path = (await call(machineId, CONTROL_HOST_CHECKOUT, [
          source,
          head,
          run,
        ])) as string;
        return {
          path,
          where: `on the host, ${machineName(machineId)} at ${head.slice(0, 9)}`,
        };
      });
    const hosted = new Map<string, Promise<{ path: string; where: string }>>();
    /** {@link hostCheckout}, its dependencies installed outside every boundary. */
    const onHost = (
      machineId: string
    ): Promise<{ path: string; where: string }> =>
      once(hosted, machineId, async () => {
        const ready = await hostCheckout(machineId);
        if (!(await install(machineId, ready.path, undefined, ready.where))) {
          throw new Error(INSTALL_FAILED);
        }
        return ready;
      });
    /**
     * One check on the host; a machine that cannot run it fails the check in
     * its words. Undefined when a pause cancelled it, to run again.
     */
    const runOnHost = async (
      machineId: string,
      check: WorkItemCheck,
      limit: number
    ): Promise<Ran | undefined> => {
      const on = `on the host, ${machineName(machineId)}`;
      try {
        const { path, where } = await onHost(machineId);
        const complete = await command(
          machineId,
          path,
          check.command,
          limit,
          undefined,
          asCheck
        );
        return complete.cancelled ? undefined : { where, complete };
      } catch (error) {
        if (error instanceof PausedRun) {
          // Its install was cut: the next run there installs again, in the same checkout.
          hosted.delete(machineId);
          return;
        }
        return {
          where: on,
          complete: {
            exitCode: 1,
            stdout: "",
            stderr: `The hub could not run this check ${on}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    };
    /**
     * One check on another machine; a machine that cannot run it fails the
     * check in its words. Undefined when a pause cancelled it, to run again.
     */
    const runElsewhere = async (
      machineId: string,
      check: WorkItemCheck,
      limit: number
    ): Promise<Ran | undefined> => {
      const on = `on ${machineName(machineId)}`;
      try {
        const { at, head } = await elsewhere(machineId);
        const complete = await command(
          machineId,
          at.path,
          check.command,
          limit,
          refOf(at),
          asCheck
        );
        return complete.cancelled
          ? undefined
          : { where: `${on} at ${head.slice(0, 9)}`, complete };
      } catch (error) {
        if (error instanceof PausedRun) {
          // Its install was cut: the next run there starts the install again.
          installed.delete(machineId);
          return;
        }
        return {
          where: on,
          complete: {
            exitCode: 1,
            stdout: "",
            stderr: `The hub could not run this check ${on}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    };
    /** The workspace's own install, run again from the start while a pause cuts it. */
    const installHere = async (): Promise<boolean> => {
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: an install a pause cut runs again once it is over
        await unpaused(workspace.machineId);
        try {
          return await install(
            workspace.machineId,
            workspace.path,
            refOf(workspace)
          );
        } catch (error) {
          if (!(error instanceof PausedRun)) {
            throw error;
          }
        }
      }
    };
    /**
     * Where a check runs: the machine it names, else the workspace's. The
     * Apple build gate whose Mac is paused moves to a Mac that is not, when
     * one is online ({@link gateMac}).
     */
    const machineFor = (check: WorkItemCheck): string => {
      const named = check.machine ?? workspace.machineId;
      return check.name === APPLE_GATE_CHECK &&
        item.projectId &&
        machinePaused(named)
        ? (gateMac(workspace, item.projectId)?.machineId ?? named)
        : named;
    };
    /**
     * One run of a check where `machineId` is: on the host there when it is
     * marked so, else in the workspace or its check workspace there.
     * Undefined when a pause cancelled it.
     */
    const runCheck = async (
      machineId: string,
      check: WorkItemCheck,
      limit: number
    ): Promise<Ran | undefined> => {
      if (check.host) {
        return await runOnHost(machineId, check, limit);
      }
      if (machineId !== workspace.machineId) {
        return await runElsewhere(machineId, check, limit);
      }
      const complete = await command(
        workspace.machineId,
        workspace.path,
        check.command,
        limit,
        refOf(workspace),
        asCheck
      );
      return complete.cancelled ? undefined : { complete, where: undefined };
    };
    const local = checks.some(
      (check) =>
        !(
          check.host ||
          (check.machine && check.machine !== workspace.machineId)
        )
    );
    if (how.inTurn) {
      refuseAway(checks, workspace.machineId, machineName);
    }
    try {
      // A failed install is the run's one line: no check can pass without it.
      if (local && !(await installHere())) {
        return { installs, outcomes: [] };
      }
      const outcomes: CheckOutcome[] = [];
      for (const check of checks) {
        current = check;
        const limit = (check.timeoutSec ?? CHECK_TIMEOUT_SEC) * 1000;
        let started = 0;
        // A check a pause cancels is no outcome and no attempt: it waits the
        // pause out (or moves, the Apple gate), then runs again from the start.
        let ran: Ran | undefined;
        while (!ran) {
          const machineId = machineFor(check);
          // biome-ignore lint/performance/noAwaitInLoops: checks run in order, each once its machine runs work
          await unpaused(machineId);
          started = Date.now();
          // A check that ends while waiting (killed, past the most a wait may
          // last, or a machine that could not run it) leaves no wait behind it.
          ran = await runCheck(machineId, check, limit).finally(() =>
            queued(null)
          );
        }
        const { complete, where } = ran;
        const result = checkTails(complete);
        outcomes.push({
          check,
          result,
          where,
          exitCode: result.exitCode,
          durationMs: Date.now() - started,
          passed:
            result.exitCode === 0 &&
            (check.expect === undefined ||
              result.stdout.includes(check.expect)),
        });
      }
      return { installs, outcomes };
    } catch (error) {
      waitedIn(error, current?.name ?? "the dependency install");
    } finally {
      // Every host checkout goes with its run, whatever its checks came to;
      // one its machine could not remove goes with that machine's next
      // connection or start (agent host-check.ts `abandonHostCheckouts`).
      await Promise.all(
        checkouts.map(({ machineId, run }) =>
          call(machineId, CONTROL_HOST_CHECKOUT_REMOVE, [run]).catch(
            (error: unknown) =>
              console.warn(
                `[work-items] ${item.id}: host checkout ${run} on ${machineName(machineId)} was not removed: ${error instanceof Error ? error.message : String(error)}`
              )
          )
        )
      );
    }
  };

  /**
   * What a check run in the workspace checks ({@link Checked}): HEAD's tree
   * (`git rev-parse HEAD^{tree}`), with the item's outputs' contents beside
   * it when it has outputs, and the tree of each path a check declares as
   * its inputs (`git rev-parse HEAD:<path>`), while nothing else is
   * uncommitted; landing.ts lands only such a tree. Undefined while
   * something else is uncommitted: those checks read files no tree names, so
   * their passes are neither kept nor matched. `noWait` in a landing turn.
   */
  const checkedState = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    noWait: boolean
  ): Promise<Checked | undefined> => {
    const outputs = item.outputs ?? [];
    const hashed =
      outputs.length > 0
        ? ` && git hash-object -- ${outputs.map(quote).join(" ")}`
        : "";
    const declared =
      INPUT_PATHS.length > 0
        ? ` && for path in ${INPUT_PATHS.map(quote).join(" ")}; do git rev-parse --verify -q "HEAD:$path" || echo absent; done`
        : "";
    const read = await runIn(workspace, item)(
      `left=$(${statusCommand(outputs)}) && test -z "$left" && git rev-parse --verify 'HEAD^{tree}'${hashed}${declared}`,
      GIT_TIMEOUT_MS,
      noWait
    );
    const lines = read.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      read.exitCode !== 0 ||
      lines.length !== 1 + outputs.length + INPUT_PATHS.length
    ) {
      return;
    }
    const contents = lines.slice(1, 1 + outputs.length);
    const trees = lines.slice(1 + outputs.length);
    return {
      tree: lines.slice(0, 1 + outputs.length).join(" "),
      outputs: new Map(
        outputs.map((output, at) => [output, contents[at] ?? ""])
      ),
      inputs: new Map(INPUT_PATHS.map((path, at) => [path, trees[at] ?? ""])),
      stamp: lines.join(" "),
    };
  };

  /**
   * {@link runChecks}, each check run at most once on one tree: a check that
   * passed on the tree the workspace holds now, or whose command one that
   * covers it did (landing.ts GATE_COVERS), is not run again; its outcome
   * says where it passed. A check that declares its inputs
   * ({@link CHECK_INPUTS}) is matched by those paths' trees instead, so a
   * rebase that left them alone does not run it again: the Apple gate's iOS
   * compile once per apps/apple tree, where it ran twice (at finish_item and
   * after the rebase) on every landing behind another. `stage` names this run
   * for the lines of the checks it lets skip later; `how`, whether its checks
   * may wait ({@link CheckHow}). A pass is kept only when the workspace held
   * the same trees before and after the run.
   */
  const checkOnce = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[],
    stage: string,
    how: CheckHow
  ): Promise<CheckRun> => {
    const state = await checkedState(workspace, item, how.inTurn);
    const kept = passes.get(item.id);
    const prior = checks.map((check): string | undefined => {
      if (!state) {
        return undefined;
      }
      const { key, said } = passKey(check, state);
      return priorPass(check, kept?.get(key) ?? [], said);
    });
    const due = checks.filter((_, at) => prior[at] === undefined);
    const run =
      due.length > 0
        ? await runChecks(workspace, item, due, how)
        : { installs: [], outcomes: [] };
    if (due.length > 0 && run.outcomes.length === 0) {
      // The workspace's install failed: no check ran.
      return run;
    }
    if (
      state &&
      due.length > 0 &&
      (await checkedState(workspace, item, how.inTurn))?.stamp === state.stamp
    ) {
      const byKey = kept ?? new Map<string, Passed[]>();
      for (const each of run.outcomes.filter((outcome) => outcome.passed)) {
        const { key } = passKey(each.check, state);
        byKey.set(key, [
          ...(byKey.get(key) ?? []),
          {
            command: each.check.command.trim(),
            expect: each.check.expect,
            stage,
          },
        ]);
      }
      passes.set(item.id, byKey);
    }
    const ran = [...run.outcomes];
    return {
      installs: run.installs,
      outcomes: checks.map((check, at) => {
        const skipped = prior[at];
        return skipped === undefined
          ? (ran.shift() as CheckOutcome)
          : {
              check,
              skipped,
              passed: true,
              exitCode: 0,
              durationMs: 0,
              result: { exitCode: 0, stdout: "", stderr: "" },
            };
      }),
    };
  };

  /**
   * The report's commits and diffstat: only what the item's own session
   * made. A range from a starting commit cannot say that — a rebase onto a
   * newer main pulls other people's commits into it, and after the push that
   * lands the work, `merge-base origin/<base> HEAD` is HEAD itself. The
   * worktree's HEAD reflog can: every commit its session made, or rewrote by
   * rebasing, is an entry there. The ones since the item began that HEAD still
   * holds are the item's ({@link keptCommits}); the diffstat runs from the
   * oldest of them. Each command prints only what the report shows.
   */
  const changesSince = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string> => {
    const git = (cmd: string) => runIn(workspace, item)(cmd, GIT_TIMEOUT_MS);
    const since = Math.floor(item.createdAt.getTime() / 1000);
    const kept = (await git(keptCommits(since))).stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    if (!kept) {
      return `\n\nCommits:${fenced("(none)")}\n\nDiffstat:${fenced("(no changes)")}`;
    }
    const [commits, diffstat] = await Promise.all([
      git(`git log --oneline --no-walk ${kept}`),
      git(
        `git diff --stat "$(git merge-base --octopus ${kept})^" HEAD | tail -n ${DIFFSTAT_LINES}`
      ),
    ]);
    return `\n\nCommits:${fenced(commits.stdout.trim())}\n\nDiffstat:${fenced(diffstat.stdout.trim() || "(no changes)")}`;
  };

  /**
   * Runs a command in the item's workspace, inside its boundary, with every
   * `git` in it run as `safe-git.ts` says: no hook or config the workspace
   * wrote runs for the hub. Each wait it makes (its machine's pause, another
   * command in the folder, a boundary starting) is the item's status
   * ({@link checkWait}); `noWait`, in a landing turn, it makes none and
   * throws {@link WouldWait} instead.
   */
  const runIn =
    (workspace: WorkspaceRow, item: WorkItemRow) =>
    (cmd: string, timeoutMs: number, noWait = false): Promise<CommandResult> =>
      command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}${cmd}`,
        timeoutMs,
        refOf(workspace),
        { onWait: (words) => checkWait(item.id, words), noWait }
      );

  /**
   * How an item's checks run in its landing on `base` (landing.ts): in its
   * turn they never wait; while it gates on top of the branch, its status
   * says so (and why, when it stepped out of its turn: `stepped`), with what
   * each check waits for there.
   */
  const landingHow = (
    itemId: string,
    base: string,
    turning: boolean,
    stepped: string | undefined
  ): CheckHow => {
    if (turning) {
      return { inTurn: true, say: (words) => checkWait(itemId, words) };
    }
    const gating = stepped
      ? `stepped out of its turn to land (${stepped}), so gating again on top of ${base}`
      : `gating on top of ${base}`;
    return {
      inTurn: false,
      say: (words, check) =>
        checkWait(
          itemId,
          words ? `${gating}: ${check ? `${check} ` : ""}${words}` : gating
        ),
    };
  };

  /** The item in the landing queue: named as `“title” (id)`, its wait its status. */
  const turnOf = (item: WorkItemRow): LandingTurn => ({
    who: `“${item.title}” (${item.id.slice(0, 8)})`,
    onWait: (words) => checkWait(item.id, words),
  });

  /**
   * Lands a checked item's commits on its workspace's base branch
   * (landing.ts): it gates on top of the branch outside the queue, its
   * status saying so and what each check waits for there, then takes its
   * turn. Answers the line the report and the delegate read when the item can
   * be done; the text that hands it back to its delegate (`retry`:
   * uncommitted work, a conflict, checks that fail on the rebased tree); or
   * the line that says why it could not land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): Promise<Landed> => {
    const { base } = workspace;
    /** The last gate's run and the turn's, for the landing line. */
    const runs: { gate?: CheckRun; turn?: CheckRun } = {};
    /** The times it stepped out of its turn, and why the last time. */
    const steps: string[] = [];
    /**
     * The item's checks, then the repository's lint and typecheck
     * (landing.ts LAND_GATE_SCRIPTS), on the tree the workspace holds: run
     * as checks are, so a lockfile the rebase moved is installed first.
     */
    const onBaseChecks = async (
      turning: boolean
    ): Promise<Failed<CheckRun> | undefined> => {
      const how = landingHow(item.id, base, turning, steps.at(-1));
      const stage = turning
        ? `in its turn to land on ${base}`
        : `while gating on top of ${base}`;
      how.say(null);
      const recheck = await checkOnce(workspace, item, checks, stage, how);
      if (runFailed(recheck)) {
        return { kind: "recheck-failed", failing: recheck };
      }
      const gate = await checkOnce(
        workspace,
        item,
        await landGateChecks((cmd, timeoutMs) =>
          runIn(workspace, item)(cmd, timeoutMs, turning)
        ),
        stage,
        how
      );
      if (runFailed(gate)) {
        return { kind: "gate-failed", failing: gate };
      }
      runs[turning ? "turn" : "gate"] = {
        installs: [...recheck.installs, ...gate.installs],
        outcomes: [...recheck.outcomes, ...gate.outcomes],
      };
      // Gated, it says next that it waits its turn, or nothing when it takes
      // it at once. A failure's or an error's words go as settleChecks ends.
      checkWait(item.id, null);
    };
    const outcome = await land<CheckRun>(base, {
      run: runIn(workspace, item),
      turn: turnOf(item),
      check: onBaseChecks,
      onStepOut: (words) => {
        steps.push(words);
      },
      queue: landings,
      skip: item.outputs ?? [],
      ...(item.projectId ? { repo: item.projectId } : {}),
    });
    switch (outcome.kind) {
      case "landed":
        return {
          kind: "done",
          line: landedLine(base, outcome, runs, steps),
          cut: { branch: base, commit: outcome.sha },
        };
      case "nothing":
        return {
          kind: "done",
          line: `Nothing to land: ${base} already holds every commit in this workspace.`,
        };
      case "no-remote":
        return {
          kind: "done",
          line: "Not landed: this workspace's repository has no remote.",
        };
      case "dirty":
        return { kind: "retry", text: dirtyText(outcome.files, base) };
      case "conflict":
        return {
          kind: "retry",
          text: `The checks passed, but your commits conflict with origin/${base} in:${fenced(outcome.files)}\nThe hub undid its rebase. Rebase onto origin/${base} yourself, resolve the conflicts, commit, and call finish_item again.`,
        };
      case "recheck-failed": {
        const { head, lines } = failedRun(outcome.failing);
        return {
          kind: "retry",
          text: `The hub rebased your commits onto origin/${base} and ran the checks again there. ${head} Your branch is now on top of origin/${base}. Fix the cause and call finish_item again.\n\n${lines}`,
        };
      }
      case "gate-failed": {
        const { lines } = failedRun(outcome.failing);
        const failing = outcome.failing.outcomes
          .filter((each) => !each.passed)
          .map((each) => each.check.name);
        return {
          kind: "retry",
          text: `The checks passed, but the work did not land: before pushing to ${base}, the hub runs the repository's lint and typecheck on your commits as they stand on top of origin/${base}, and ${failing.length > 0 ? failing.join(" and ") : "the dependency install"} failed. Your branch is now on top of origin/${base}. Fix it, commit, and call finish_item again.\n\n${lines}`,
        };
      }
      default:
        return {
          kind: "refused",
          line: refusedLine(
            outcome,
            { head: "Not landed", target: base },
            workspace,
            machineName(workspace.machineId)
          ),
        };
    }
  };

  /**
   * The report of an item that just ended through its checks, to its parent;
   * or, for a done item of a group, held for the group's one report
   * ({@link settleGroup}) — a failure reports at once. Answers what the
   * delegate is told of a hold.
   */
  const reportOrHold = (
    row: InstanceRow,
    ended: WorkItemRow,
    body: string,
    headline: string
  ): string => {
    if (heldForGroup(ended)) {
      return `; your parent hears of it with the rest of group “${ended.group}”`;
    }
    report(
      row,
      `${body}${reportLine(ended)}`,
      ended.state === "failed",
      false,
      headline
    );
    return "";
  };

  /** A pull request's body: what the delegate said it did, its checks, and where its report is. */
  const pullRequestBody = (
    item: WorkItemRow,
    said: { lines: string; summary: string }
  ): string => {
    const link = sessionUrl?.(item.instanceId);
    const what = item.taskId
      ? `an attempt at ${item.taskId}`
      : `work item ${item.id}`;
    return [
      said.summary.trim(),
      `Checks, run by the CawCo hub:\n${said.lines}`,
      link
        ? `This is ${what}; its report and transcript: ${link}`
        : `This is ${what} (work item ${item.id}).`,
    ].join("\n\n");
  };

  /**
   * Lands an item that lands `branch` or `pr`: its commits pushed as they are
   * to `cawco/<task or item>`, and for `pr`, a pull request against the base
   * branch opened, or the open one found. gh turning the pull request down
   * refuses the landing in gh's words.
   */
  const landOnBranch = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    said: { lines: string; summary: string }
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const pushed = await pushBranch(base, branch, {
      run: runIn(workspace, item),
      turn: turnOf(item),
      queue: landings,
      skip: item.outputs ?? [],
      ...(item.projectId ? { repo: item.projectId } : {}),
    });
    if (pushed.kind !== "pushed") {
      return unpushed(
        pushed,
        workspace,
        branch,
        item.lands,
        machineName(workspace.machineId)
      );
    }
    const at = `${branch} at ${pushed.sha.slice(0, 9)}`;
    const cut: WorkspaceCut = { branch, commit: pushed.sha };
    if (item.lands !== "pr") {
      return {
        kind: "done",
        line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
        cut,
      };
    }
    const opened = await pullRequestFor(workspace, item, said, at);
    return opened.kind === "done" ? { ...opened, cut } : opened;
  };

  /** Opens the pull request for an item's pushed branch, or finds the open one. */
  const pullRequestFor = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    said: { lines: string; summary: string },
    at: string
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const title =
      (item.projectId && item.taskId
        ? taskTitle?.(item.projectId, item.taskId)
        : undefined) ?? item.title;
    const pr = await openPullRequest(
      { base, branch, title, body: pullRequestBody(item, said) },
      runIn(workspace, item)
    );
    if (pr.kind === "refused") {
      const why =
        pr.cause === "auth"
          ? `gh on ${machineName(workspace.machineId)} wasn't authorised to open the pull request`
          : "the pull request was not opened";
      return {
        kind: "refused",
        line: `Pushed to branch ${at}, but ${why}. gh said:${fenced(pr.detail)}\nOpen it by hand from ${branch} into ${base}, or start the task again once gh can.`,
      };
    }
    return {
      kind: "done",
      prUrl: pr.url,
      line:
        pr.kind === "opened"
          ? `Pushed to branch ${at} and opened a pull request against ${base}: ${pr.url}`
          : `Pushed to branch ${at}, which updates its open pull request: ${pr.url}`,
    };
  };

  /** Lands a checked item the way it lands: on its base, on a branch, through a pull request, or not at all. */
  const landChecked = (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[],
    said: { lines: string; summary: string }
  ): Promise<Landed> => {
    switch (item.lands) {
      case "none":
        return Promise.resolve({
          kind: "done",
          line: item.outputs?.length
            ? "Nothing pushed: this item lands none, and its outputs are what it hands in."
            : "Nothing pushed: this item lands none.",
        });
      case "branch":
      case "pr":
        return landOnBranch(workspace, item, said);
      default:
        return landOnBase(workspace, item, checks);
    }
  };

  /**
   * Whether each of the item's outputs is in its workspace: a file (not a
   * link, which could lead anywhere) within the size the project's folder
   * takes. The text that sends the item back when one is not; else nothing.
   */
  const outputsProblem = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    outputs: string[]
  ): Promise<string | undefined> => {
    const result = await runIn(workspace, item)(
      outputsProbe(outputs),
      GIT_TIMEOUT_MS
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `the hub could not look for the item's outputs: ${failedWith(result)}`
      );
    }
    const problems = outputsSaid(result.stdout);
    return problems.length > 0
      ? `The checks passed, but the item's outputs are not ready. ${problems.join(" ")} Then call finish_item again.`
      : undefined;
  };

  /**
   * Copies the item's outputs from its workspace into its project's folder,
   * under `assets/<task or item>/`, in one commit (project-folder.ts). The
   * report's lines on them, and whether they arrived.
   */
  const collectOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<{ ok: boolean; line: string }> => {
    const outputs = item.outputs ?? [];
    if (outputs.length === 0) {
      return { ok: true, line: "" };
    }
    if (!item.projectId) {
      return {
        ok: false,
        line: "\n\nOutputs not collected: the item belongs to no project.",
      };
    }
    const folder = outputsFolder(item);
    try {
      const files: { path: string; content: Uint8Array }[] = [];
      for (const path of outputs) {
        // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps each read under the command's output cap
        const read = await runIn(workspace, item)(
          `base64 < ${quote(path)}`,
          GIT_TIMEOUT_MS
        );
        if (read.exitCode !== 0) {
          throw new Error(`${path} could not be read: ${failedWith(read)}`);
        }
        files.push({
          path: `${folder}/${path}`,
          content: Buffer.from(read.stdout, "base64"),
        });
      }
      const written = await writeFolderFiles(item.projectId, files, {
        author: { name: item.title },
        message: `assets: ${item.taskId ? `outputs of ${item.taskId}, attempt ${item.id.slice(0, 8)}` : `outputs of work item ${item.id.slice(0, 8)}`}`,
      });
      // Absolute, as the project's workspaces on the hub's machine read them
      // (core workspace-policy.ts `projectFolder`); a delegate on any machine
      // reads them by the folder path with `folder_read`.
      const root = projectRoot(item.projectId);
      return {
        ok: true,
        line: `\n\nOutputs, copied into the project's folder ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}, readable by the project's delegates (on the hub's machine at these paths, on any machine with folder_read and the path after ${root}/):\n${written.paths.map((path) => `- ${root}/${path}`).join("\n")}`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        line: `\n\nOutputs not collected into ${folder}/: ${reason}`,
      };
    }
  };

  /** Where a landing put the item's commit, on its workspace's row: a retired workspace is cut again there ({@link recut}). */
  const noteLanded = (workspace: WorkspaceRow, landing: Landed): void => {
    if (landing.kind === "done" && landing.cut) {
      db.updateWorkspace(workspace.id, { landed: landing.cut });
    }
  };

  /**
   * A checked item, its checks all passed, to its end: its outputs must be
   * in its workspace (else it is back to running, told which are not); then
   * it lands as its row says and its outputs are collected, and it is done
   * (or failed, when it could not land or its outputs did not arrive) with
   * the report the hub builds sent to its parent.
   */
  const landAndReport = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    checks: WorkItemCheck[],
    submission: WorkItemSubmission,
    passed: { count: number; lines: string }
  ): Promise<{ done: boolean; text: string }> => {
    const settled = { checkingSince: null, submission: null };
    const { count, lines } = passed;
    const unready = item.outputs?.length
      ? await outputsProblem(workspace, item, item.outputs)
      : undefined;
    if (unready) {
      update(item.id, settled);
      return { done: false, text: unready };
    }
    const landing = await landChecked(workspace, item, checks, {
      summary: submission.summary,
      lines,
    });
    if (landing.kind === "retry") {
      update(item.id, settled);
      return { done: false, text: landing.text };
    }
    noteLanded(workspace, landing);
    const collected =
      landing.kind === "done"
        ? await collectOutputs(workspace, item)
        : { ok: true, line: "" };
    const failure = failureOf(landing, collected);
    const body = checkedReport(
      { summary: submission.summary, lines },
      landing,
      collected,
      `${await changesSince(workspace, item)}${findingsBlock(submission.findings)}`
    );
    const ended = finish(db.workItem(item.id) ?? item, {
      ...(failure ? { state: "failed", error: failure } : { state: "done" }),
      result: body,
      summary: submission.summary,
      headline: submission.headline,
      digest: `${submission.summary.trim()}\n${landing.line}${collected.line}`,
      ...(landing.kind === "done" && landing.prUrl
        ? { prUrl: landing.prUrl }
        : {}),
      ...settled,
    });
    const held = reportOrHold(row, ended, body, submission.headline);
    if (landing.kind !== "done") {
      return {
        done: false,
        text: `All ${count} checks passed, but the work could not land. ${landing.line}\n\nThe item has failed and your parent has the details. End your turn.`,
      };
    }
    return collected.ok
      ? {
          done: true,
          text: `All ${count} checks passed. ${landing.line}${collected.line}\n\n${lines}\n\nThe item is done${held}. End your turn.`,
        }
      : {
          done: false,
          text: `All ${count} checks passed. ${landing.line} But the outputs did not arrive.${collected.line}\n\nThe item has failed and your parent has the details. End your turn.`,
        };
  };

  /** The paths of the workspace's changes against its target that the Swift build reads (apple-gate.ts). */
  const appTouched = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string[]> => {
    const diff = await runIn(workspace, item)(
      appleGateDiff(quote(`origin/${workspace.base}`)),
      GIT_TIMEOUT_MS
    );
    if (diff.exitCode !== 0) {
      throw new Error(
        `the hub could not read the item's changes against origin/${workspace.base} for the Apple build gate: ${failedWith(diff)}`
      );
    }
    return appPaths(diffPaths(diff.stdout));
  };

  /**
   * The online Mac the gate runs on: one holding the workspace's check
   * workspace already, else one with the project's repository, else any;
   * among the Macs not paused first. With every Mac paused, a paused one: its
   * check waits for the pause's end, its item's status saying so.
   */
  const gateMac = (workspace: WorkspaceRow, projectId: string) => {
    const macs = appleMachines(db.listAgents(), online);
    const held = new Set(
      db.checkWorkspacesOf(workspace.id).map((each) => each.machineId)
    );
    const pick = (among: typeof macs) =>
      among.find((each) => held.has(each.machineId)) ??
      among.find((each) => repositoryOn(projectId, each.machineId)) ??
      among[0];
    return (
      pick(macs.filter((each) => !machinePaused(each.machineId))) ?? pick(macs)
    );
  };

  /**
   * The item's checks with the Apple build gate's added (apple-gate.ts): when
   * its project has the gate on, it lands somewhere, and its diff against
   * its target touches what the Swift build reads, one more check compiles
   * the iOS app on an online Mac, at its last commit, as any check that
   * names a machine runs ({@link runChecks}). A Mac that holds the item's
   * check workspace already is picked first (its build is incremental), then
   * one with a checkout of the project. With no Mac online the item does not
   * land: `refusal` says why, in one sentence.
   */
  const appleGate = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): Promise<{ checks: WorkItemCheck[] } | { refusal: string }> => {
    const gated =
      item.lands !== "none" &&
      item.projectId !== null &&
      db.project(item.projectId)?.appleGate === true &&
      !checks.some((check) => check.name === APPLE_GATE_CHECK);
    if (!(gated && item.projectId)) {
      return { checks };
    }
    const touched = await appTouched(workspace, item);
    if (touched.length === 0) {
      return { checks };
    }
    const mac = gateMac(workspace, item.projectId);
    if (!mac) {
      return { refusal: appleGateRefusal(touched, lastMac(db.listAgents())) };
    }
    return {
      checks: [
        ...checks,
        {
          name: APPLE_GATE_CHECK,
          command: APPLE_GATE_COMMAND,
          machine: mac.machineId,
          timeoutSec: APPLE_GATE_TIMEOUT_SEC,
        },
      ],
    };
  };

  /**
   * THE run of a `finish_item`: the item's checks, in order, against the
   * submission stored on its row, to an outcome. The live call and a hub
   * start-up resume both come here. All passing, the item's outputs must be
   * in its workspace (else it is back to running, told which are not); then
   * it lands as its row says and its outputs are collected, and it is done
   * and the parent gets the report the hub builds; any check failing, it is
   * back to running and the answer names the failures. Either way the row
   * stops checking — also when a check cannot run at all, which throws.
   * Answers the text the delegate reads, and whether the item is done.
   */
  const settleChecks = async (
    item: WorkItemRow,
    asked: WorkItemCheck[],
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    const settled = { checkingSince: null, submission: null };
    finishing.add(item.id);
    try {
      const gate = await appleGate(workspace, item, asked);
      if ("refusal" in gate) {
        update(item.id, settled);
        return { done: false, text: gate.refusal };
      }
      const { checks } = gate;
      const run = await checkOnce(workspace, item, checks, "at finish_item", {
        inTurn: false,
        say: (words) => checkWait(item.id, words),
      });
      if (runFailed(run)) {
        update(item.id, settled);
        const { head, lines } = failedRun(run);
        return {
          done: false,
          text: `${head} The item is still running: fix the cause and call finish_item again.\n\n${lines}`,
        };
      }
      const { outcomes } = run;
      // The install, when one ran, is its own line above the checks.
      const lines = `${installLines(run)}${outcomes.map(checkLine).join("\n")}`;
      // The checks took their time: the item may have been stopped since.
      const stopped = db.workItem(item.id) ?? item;
      if (!LIVE.has(stopped.state)) {
        update(item.id, settled);
        return {
          done: false,
          text: `The checks passed, but ${stopped.title} is ${stopped.state} now; nothing was landed or reported.`,
        };
      }
      return await landAndReport(stopped, row, workspace, checks, submission, {
        count: outcomes.length,
        lines,
      });
    } catch (error) {
      update(item.id, settled);
      throw error;
    } finally {
      finishing.delete(item.id);
      // A wait an error cut short leaves no words behind it.
      checkWait(item.id, null);
    }
  };

  return {
    start: (asked: WorkItemRequest) => start(asked),

    /** While one of the item's checks waits for a shared machine slot: what its status says, and since when. */
    checkQueueOf: (itemId: string): { words: string; since: number } | null =>
      checkQueues.get(itemId) ?? null,

    /**
     * A routine's run (routines.ts): a fresh session in a new workspace cut
     * from `parent.cwd` on `parent.machineId`, owned by the routine
     * ({@link routineParent}). It reports to no session, the project's lead
     * included: the routine reads how it ended from {@link WorkItemDeps.itemEnded}.
     */
    startForRoutine: (
      request: Omit<
        WorkItemRequest,
        "parentInstanceId" | "workspace" | "fork" | "reuse"
      >,
      parent: Parent
    ): Promise<WorkItemStart> =>
      start({ ...request, parentInstanceId: parent.id }, parent),

    /** What an item's session has spent since the item began (its budget's dollars). */
    spentBy: (item: WorkItemRow): number => usedBy(item).usd,

    /**
     * `delegate`: {@link start}, or, while a live item owns files this one
     * owns too, the request queued until no live item overlaps it, a chip in
     * its parent's tray from now on under the ids its item and session take
     * when it starts. Every other refusal is the caller's.
     */
    async delegate(
      called: WorkItemRequest
    ): Promise<WorkItemStart | { queued: string; text: string }> {
      // A role is the hub's to give (a curator run's), never a caller's.
      const { role: _role, ...asked } = called;
      try {
        return await start(asked);
      } catch (error) {
        if (!(error instanceof OwnsOverlap || error instanceof MachinePaused)) {
          throw error;
        }
        const id = crypto.randomUUID();
        const request: QueuedRequest = {
          ...asked,
          queuedAs: { id, instanceId: crypto.randomUUID() },
        };
        const queued = db.queueWorkItem({
          id,
          parentInstanceId: asked.parentInstanceId,
          request,
          title: asked.title.trim(),
        });
        publish(queuedSummaryOf(queued));
        const until =
          error instanceof MachinePaused
            ? `${error.words}. It waits in your delegate tray and starts there when the pause ends`
            : `${error.message} It waits in your delegate tray and starts when no live item owns its files any more`;
        return {
          queued: queued.id,
          text: `Queued “${queued.title}” (${queued.id}): ${until}; its report reaches you as any delegate's does.`,
        };
      }
    },

    /**
     * A machine's pause began or ended: the trays say so again, for every
     * live item on it and every delegate still queued.
     */
    pauseChanged(machineId: string): void {
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        for (const item of db.workItemsIn(workspace.id)) {
          if (LIVE.has(item.state)) {
            published(item);
          }
        }
      }
      for (const queued of db.queuedWorkItems()) {
        if (!db.workItem(queued.id)) {
          publish(queuedSummaryOf(queued));
        }
      }
    },

    /** Starts the queued delegates whose files are free: at hub start, and after a machine returns. */
    resumeQueued(): void {
      drainQueued().catch((error: unknown) =>
        console.warn(
          `[work-items] queued delegates did not start: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    },

    /**
     * `stop_delegate` on a queued delegate: the one `target` names (its full
     * id, or a prefix of eight or more characters) leaves the queue through
     * {@link unqueue}, its chip with it. Only its parent or its project's
     * lead may withdraw it; anyone else is refused as `stop_delegate`
     * refuses a session that is not theirs. Undefined when `target` names no
     * queued delegate, so the caller looks among sessions.
     */
    withdrawQueued(from: string, target: string): string | undefined {
      const needle = target.trim().toLowerCase();
      const named = (row: QueuedWorkItemRow): boolean =>
        row.id === needle || (needle.length >= 8 && row.id.startsWith(needle));
      const mine = queuedFor(from).filter(named);
      if (mine.length === 0) {
        const theirs = db
          .queuedWorkItems()
          .some((row) => named(row) && !db.workItem(row.id));
        if (theirs) {
          throw new WorkItemRefusal(
            403,
            `"${target}" is not your delegate — you can only stop or interrupt your own delegates.`
          );
        }
        return;
      }
      if (mine.length > 1) {
        throw new WorkItemRefusal(
          400,
          `"${target}" names ${mine.length} queued delegates: ${mine.map((row) => `“${row.title}” (${row.id})`).join(", ")}. Pass the full id.`
        );
      }
      const [queued] = mine;
      if (startingQueued.has(queued.id)) {
        throw new WorkItemRefusal(
          409,
          `Your queued delegate “${queued.title}” (${queued.id.slice(0, 8)}) is starting now that its files are free. Stop it by its id once delegate_list shows its session.`
        );
      }
      unqueue(queued);
      return `Withdrew your queued delegate “${queued.title}” (${queued.id.slice(0, 8)}): it never started, so it has no session or workspace.`;
    },

    /**
     * The queued delegates `caller` may withdraw, for `delegate_list`: each
     * with when it was queued and the live item and globs that hold it.
     */
    queuedOf(caller: string): QueuedDelegate[] {
      return queuedFor(caller).map((queued) => {
        const [parent] = db.getInstancesByIds([queued.parentInstanceId]);
        const held = parent ? heldBy(queued, parent) : undefined;
        return {
          id: queued.id,
          title: queued.title,
          state: "queued",
          queuedAt: queued.queuedAt.toISOString(),
          heldBy: held
            ? {
                itemId: held.item.id,
                title: held.item.title,
                globs: held.globs,
              }
            : null,
        };
      });
    },

    /**
     * A turn of a delegated session ended: its item's turn count goes up and
     * its budget is looked at ({@link enforceBudget}). Every turn counts,
     * whatever answers it.
     */
    countTurn(row: InstanceRow): void {
      const item = itemOf(row);
      if (!(item && LIVE.has(item.state))) {
        return;
      }
      enforceBudget(update(item.id, { turns: item.turns + 1 }) ?? item);
    },

    reportees,

    /** Whether `leadId` leads the project of the work item `instanceId` runs: it may answer, steer and stop it. */
    ledBy(instanceId: string, leadId: string): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      return !!item && leadFor(item)?.id === leadId;
    },

    /** The one send path adds this to reports, handoffs and asks alike. */
    waitSummary(instanceId: string, parentInstanceId: string): string {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      const history =
        item?.parentInstanceId === parentInstanceId ? item.waitHistory : null;
      return history
        ? `\n\nWaited ${history.count} time${history.count === 1 ? "" : "s"} since its last delivered message; last wait until ${waitClock(new Date(history.until))}: ${history.reason}.`
        : "";
    },

    delivered(instanceId: string, parentInstanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.parentInstanceId === parentInstanceId && item.waitHistory) {
        db.updateWorkItem(item.id, { waitHistory: null });
      }
    },

    /** The live idle/busy transition, even while turn-end rules are still deciding. */
    turnState(instanceId: string, busy: boolean): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!busy && item?.waitUntil) {
        waitsAtRest.add(item.id);
      } else if (
        busy &&
        (item?.waitResumeBy || (item?.waitUntil && waitsAtRest.has(item.id)))
      ) {
        clearWait(item);
      }
    },

    /** Called once startup has installed the hub's send path. */
    resumeWaits(): void {
      for (const item of db.waitingWorkItems()) {
        armWait(item);
        if (item.waitUntil) {
          waitsAtRest.add(item.id);
        }
      }
    },

    /** Declares a bounded wait; the tray keeps it, the next actionable message summarizes it. */
    waitItem(instanceId: string, minutes: unknown, reason: unknown): string {
      if (
        typeof minutes !== "number" ||
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 120 ||
        typeof reason !== "string" ||
        !reason.trim()
      ) {
        throw new WorkItemRefusal(400, WAIT_ITEM_LIMIT);
      }
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(row && item)) {
        throw new WorkItemRefusal(
          409,
          "No work item is open on this session. Start a delegate before calling wait_item."
        );
      }
      if (!LIVE.has(item.state) || item.checkingSince) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${item.id}) cannot wait while ${item.checkingSince ? "its checks run" : `it is ${item.state}`}. Continue a live item before calling wait_item.`
        );
      }
      clearWait(item);
      const waitUntil = new Date(Date.now() + minutes * 60_000);
      const waitReason = reason.trim().replace(/\s+/g, " ");
      const waiting = update(item.id, {
        state: "running",
        waitUntil,
        waitReason,
        waitHistory: {
          count: (item.waitHistory?.count ?? 0) + 1,
          until: waitUntil.getTime(),
          reason: waitReason,
        },
      }) as WorkItemRow;
      armWait(waiting);
      const clock = waitClock(waitUntil);
      const line = `${item.title} is waiting until ${clock}: ${waitReason}`;
      return `${line}\n\nEnd your turn. The hub will wake you when the wait ends.`;
    },

    /**
     * An interrupt cut the session's turn: its declared wait is cancelled,
     * and, when `hold`, its live item is held ({@link heldFor}): the turn's
     * end hands nothing back and starts nothing, and nothing the hub sends
     * on its own wakes it until its parent, its lead or the reader writes to
     * it ({@link unhold}). A pause's interrupt does not hold: the pause sends
     * the session its own word to carry on when it ends.
     */
    interrupted(instanceId: string, hold: boolean): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.waitUntil || item?.waitResumeBy) {
        clearWait(item);
      }
      if (hold && item && LIVE.has(item.state) && !item.heldAt) {
        quiet.delete(item.id);
        update(item.id, { heldAt: new Date() });
        console.log(`[work-items] ${item.id}: held by an interrupt`);
      }
    },

    /**
     * Whether a send from `origin` waits at the hub because an interrupt
     * holds the session's item ({@link interrupted}): anything but its
     * parent's, its lead's or the reader's words. Such a send is kept owed
     * and goes, in order, once one of them wakes it.
     */
    heldFor(instanceId: string, origin: NeutralOrigin): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      return (
        (!!item?.heldAt && LIVE.has(item.state) && !mayReopen(item, origin)) ||
        retiredFor(instanceId, origin)
      );
    },

    /**
     * Whether a send from `origin` waits at the hub because the session's
     * finished item's workspace retired and is cut again first
     * ({@link recut}): the handoff that reopens it, from its parent, its
     * lead or the reader ({@link retiredFor}). Its hold's words say so.
     */
    recutHold: (instanceId: string, origin: NeutralOrigin): boolean =>
      retiredFor(instanceId, origin),

    /**
     * A send kept for {@link recutHold}: the session's retired workspace cut
     * again at its own path ({@link recut}), then what was kept for it goes
     * ({@link WorkItemDeps.recutDone}), or fails with why the cut could not
     * be made ({@link WorkItemDeps.recutFailed}). Nothing for a session
     * whose workspace is not retired. Never throws.
     */
    recutFor(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      if (!(item && workspace && recuttable(workspace))) {
        return;
      }
      recut(workspace, () => recutDone?.(instanceId)).catch(
        (error: unknown) => {
          const reason = `Its workspace ${workspace.id} retired when its work landed and could not be cut again: ${error instanceof Error ? error.message : String(error)}`;
          console.warn(`[workspaces] ${instanceId}: ${reason}`);
          recutFailed?.(instanceId, reason);
        }
      );
    },

    /**
     * A send from `origin` reached the session: its parent's, its lead's or
     * the reader's ends the interrupt's hold on its item. Answers whether it
     * did, so what the hold kept goes right behind it.
     */
    unhold(instanceId: string, origin: NeutralOrigin): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(item?.heldAt && mayReopen(item, origin))) {
        return false;
      }
      update(item.id, { heldAt: null });
      console.log(`[work-items] ${item.id}: woken from its interrupt's hold`);
      return true;
    },

    /** Replays durable discards, including creates whose reply a previous hub never received. */
    discardUnfiled(machineId: string): void {
      for (const { id } of db.workspaceCreatesOn(machineId)) {
        if (opening.has(id)) {
          continue;
        }
        discardCreate(id, machineId).catch((error: unknown) => {
          console.warn(
            `[workspaces] discard ${id} on ${machineId} is still pending: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }
    },

    /**
     * THE gate on input to a session: why a message from `origin` may not
     * give it a turn, or nothing when it may. A live item takes input from
     * anyone. Finished work takes it from the reader or its parent only
     * ({@link reopens}), and only while it is still its workspace's latest
     * item — one writer per checkout; the send that passes reopens it
     * ({@link reopen}). Every other session, one another session started
     * with `start_session` included, is not delegated work, and takes
     * messages as it always has.
     */
    refusal(
      row: InstanceRow,
      origin: NeutralOrigin
    ): { reason: string; refusal: SendRefusal } | undefined {
      const item = itemOf(row);
      if (item) {
        if (LIVE.has(item.state)) {
          return undefined;
        }
        if (!mayReopen(item, origin)) {
          return {
            reason: finishedText(item),
            refusal: { kind: "item-closed", itemId: item.id },
          };
        }
        const [workspace] = db.workspacesNamed(item.workspaceId);
        // A retired one is cut again for the send ({@link recutHold}).
        if (workspace?.state === "archived" && !recuttable(workspace)) {
          return {
            reason: workspace.carry
              ? `${item.title} (${item.id}) is ${item.state}, and its workspace ${item.workspaceId} was discarded: its unlanded work is in the carry ${workspace.carry} on ${machineName(workspace.machineId)}, and its clone is gone.`
              : `${item.title} (${item.id}) is ${item.state}, and its workspace ${item.workspaceId} is archived: its clone and boundary are gone.`,
            refusal: {
              kind: "workspace-archived",
              itemId: item.id,
              workspaceId: item.workspaceId,
            },
          };
        }
        const [latest] = db.workItemsIn(item.workspaceId);
        return latest.id === item.id
          ? undefined
          : {
              reason: supersededText(item, latest),
              refusal: {
                kind: "item-superseded",
                itemId: item.id,
                latest: {
                  id: latest.id,
                  title: latest.title,
                  instanceId: latest.instanceId,
                },
              },
            };
      }
      return undefined;
    },

    /**
     * A send {@link refusal} let through reached finished work and a live
     * process has read it: the item runs again, in the same session, and ends
     * again the usual way — on a turn nothing answers — with a new report to
     * its parent. Called on the read, never on the send: a send nothing takes
     * up (a revive or fresh start that failed) leaves the item as it ended,
     * with its reason.
     */
    reopen(instanceId: string, sentAt: Date): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      // Only a send made to finished work reopens it: one accepted while the
      // item was live and read after it ended was never addressed to a
      // finished item.
      if (
        item &&
        !LIVE.has(item.state) &&
        item.endedAt !== null &&
        item.endedAt.getTime() <= sentAt.getTime()
      ) {
        // Its held workspace's hold ends: the work is live again.
        const [workspace] = db.workspacesNamed(item.workspaceId);
        if (workspace) {
          continued(workspace);
        }
        update(item.id, {
          state: "running",
          result: null,
          error: null,
          endedAt: null,
          dismissedAt: null,
          heldAt: null,
        });
      }
    },

    /** Its session is up: the item is running. */
    started(row: InstanceRow): void {
      const item = itemOf(row);
      if (item?.state === "starting") {
        update(item.id, { state: "running" });
      }
    },

    /**
     * A turn of a delegated session ended at `endedAt`, not by an interrupt,
     * and no standing instruction answered it. `turn.error` is the harness's
     * error when the turn failed; `turn.text` is what a report from a session
     * without checks carries. Answers what the parent is sent, or nothing.
     *
     * An item with checks ends only through {@link finishItem}, or here when
     * its turn failed. A turn that ends it quietly, with nothing queued for
     * the session, nothing handed to it since, and none of its own delegated
     * work live, gets the "still open" message; the third in a row fails it
     * and reports that failure to the parent. A declared wait stays
     * on the tray and is summarized only with the next actionable message.
     *
     * An item filed before checks existed ends as it always did: on a turn
     * nothing answers, with that turn's text as the report. A session that
     * runs no item reports nothing.
     */
    turnEnded(
      row: InstanceRow,
      turn: { text: string; error?: string },
      endedAt: Date
    ): { body: string; failed: boolean } | undefined {
      const item = itemOf(row);
      if (!item) {
        return;
      }
      // The plan's completed to-do ids tick their to-dos, off the turn's path.
      syncSoon(item);
      // The turn an interrupt cut: nothing goes back, nothing fails it and
      // nothing nudges it. Before this check, a Claude turn cut by
      // interrupt_delegate (an error result, never OpenCode's `aborted`)
      // failed its item ("[ede_diagnostic] result_type=user … stop_reason=
      // tool_use", seen on the host, 2026-10-15), or, ending quietly, got the
      // "still open" reminder. Here before every such branch.
      if (item.heldAt) {
        quiet.delete(item.id);
        return undefined;
      }
      if (turn.error === undefined && waitingTurn(item)) {
        return undefined;
      }
      const busy = busyAfter(row, endedAt);
      if (!item.checks) {
        return uncheckedTurn(item, turn, busy);
      }
      // A finished item has reported; one whose checks are running reports
      // when they settle (its session's own call may have died with the hub).
      if (!LIVE.has(item.state) || item.checkingSince) {
        return undefined;
      }
      if (turn.error !== undefined) {
        return failedTurn(item, turn.error, busy);
      }
      return busy ? undefined : quietTurn(row, item, item.checks);
    },

    /**
     * A message reached a session: one from its parent or the reader starts
     * its item's count of quiet turns over.
     */
    heard(instanceId: string, origin: NeutralOrigin): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item && mayReopen(item, origin)) {
        quiet.delete(item.id);
      }
    },

    /**
     * `finish_item` from the session `instanceId`: with `blocked`, the item
     * fails with that command and error. Otherwise the submission is stored
     * and the item marked checking before the first check starts, so a hub
     * that dies mid-run resumes it ({@link resumeChecks}); then
     * {@link settleChecks} runs it to its outcome. An item done already
     * answers its done result; one checking already is refused. Answers what
     * the tool returns.
     */
    async finishItem(
      instanceId: string,
      request: WorkItemSubmission
    ): Promise<string> {
      const open = finishable(instanceId);
      if (typeof open === "string") {
        return open;
      }
      const { row, item, checks } = open;
      clearWait(item);

      if (request.blocked) {
        const error = `Blocked: ${request.blocked.command}${fenced(request.blocked.error)}`;
        const failed = finish(item, {
          state: "failed",
          error,
          headline: request.headline,
        });
        report(
          row,
          `${request.summary}\n\n${error}${findingsBlock(request.findings)}${reportLine(failed)}`,
          true,
          false,
          request.headline
        );
        return "The item failed as blocked; your parent has the command and the error. End your turn.";
      }

      // The task's to-dos first: unticked ones are listed once, to tick or
      // explain; the next call runs the checks.
      const unticked = await untickedText(item);
      if (unticked) {
        return unticked;
      }
      update(item.id, { submission: request, checkingSince: new Date() });
      return (await settleChecks(item, checks, request)).text;
    },

    /**
     * An agent has registered: every item on its machine left checking by a
     * hub that stopped mid-run has its checks run again from the first, on
     * the stored submission, through {@link settleChecks}. A pass needs no
     * word to the session — its parent has the report; a failure, or checks
     * that cannot run, is sent to the session as the tool would have
     * answered. An item this hub is running now is left to that run.
     */
    resumeChecks(machineId: string): void {
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        for (const item of db.workItemsIn(workspace.id)) {
          const { checks, submission } = item;
          if (
            !(item.checkingSince && checks && submission) ||
            finishing.has(item.id)
          ) {
            continue;
          }
          console.log(`resumed checks for item ${item.id}`);
          const [row] = db.getInstancesByIds([item.instanceId]);
          settleChecks(item, checks, submission)
            .then(({ done, text }) => {
              if (!done) {
                tell(row, text);
              }
            })
            .catch((error: unknown) => {
              const reason =
                error instanceof Error ? error.message : String(error);
              console.error(`[work-items] ${item.id}: ${reason}`);
              tell(
                row,
                `Your work item's checks could not run: ${reason}. Call finish_item again.`
              );
            });
        }
      }
    },

    /**
     * The parent replaces the whole list of a running item's checks — one
     * written for a design that changed since. Refused to anyone else, while
     * the checks run, and on finished work. The session is told the new list,
     * and the still-open reminder and `finish_item` read it from then on.
     * Answers what the tool returns.
     */
    setChecks(
      instanceId: string,
      from: string,
      checks: WorkItemCheck[]
    ): string {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(row && item)) {
        throw new WorkItemRefusal(404, `${instanceId} runs no work item.`);
      }
      if (item.parentInstanceId !== from) {
        throw new WorkItemRefusal(
          403,
          "Only the session that delegated an item can replace its checks."
        );
      }
      if (item.checkingSince) {
        throw new WorkItemRefusal(
          409,
          "checks are running; wait for the outcome"
        );
      }
      if (!LIVE.has(item.state)) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${item.id}) is ${item.state}; only a running item's checks can be replaced.`
        );
      }
      const unchecked = checksProblem(checks);
      if (unchecked) {
        throw new WorkItemRefusal(400, unchecked);
      }
      hostDeclared(checks, from);
      update(item.id, { checks: machinesOf(checks) });
      tell(
        row,
        `Your work item's checks were replaced by your parent. Its checks: ${checkNames(checks)}.`
      );
      return `Replaced the checks of ${item.title} (${item.id}): ${checkNames(checks)}. Its session was told.`;
    },

    /**
     * A handoff's inputs: `paths` on `from`'s machine copied into the
     * `$TMPDIR/inputs/` of the workspace `instanceId`'s item runs in, before
     * the handoff that names them goes. Only the session that delegated the
     * item, or its project's lead, hands it inputs; refused, too, for a
     * workspace whose work was discarded and an input that may not go
     * ({@link readInputs}). A retired workspace is cut again first
     * ({@link recut}). Answers each input's name and where it was read.
     */
    async handInputs(
      instanceId: string,
      from: string,
      paths: string[]
    ): Promise<{ from: string; name: string }[]> {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(row && item)) {
        throw new WorkItemRefusal(
          404,
          `${instanceId} runs no work item, so it has no $TMPDIR/inputs/ to hand inputs into. Hand off without inputs.`
        );
      }
      if (!(item.parentInstanceId === from || leadFor(item)?.id === from)) {
        throw new WorkItemRefusal(
          403,
          "Only the session that delegated an item, or its project's lead, hands it inputs."
        );
      }
      const [named] = db.workspacesNamed(item.workspaceId);
      const [caller] = db.getInstancesByIds([from]);
      if (!caller) {
        throw new WorkItemRefusal(404, `unknown session ${from}`);
      }
      // Read before a retired workspace is cut again: an input that may not
      // go refuses the handoff before anything is cut.
      const inputs = await readInputs(paths, caller);
      const workspace = named && recuttable(named) ? await recut(named) : named;
      if (!workspace || workspace.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${item.id}) is in workspace ${item.workspaceId}, which is ${workspace?.state ?? "gone"}: nowhere to put inputs.`
        );
      }
      await handIn(workspace, inputs);
      return inputs.map(({ name, from: read }) => ({ name, from: read }));
    },

    /** {@link sessionFailed}: a restart cut its turn and nothing can resume it. */
    sessionFailed,

    /** {@link followSessions}: the items of the sessions whose rows just moved follow them. */
    followSessions,

    /**
     * Its session was stopped or archived while the work was live, by `by`
     * (null: a stop whose stopper the hub did not hear), kept on the item so
     * its task says who stopped it.
     */
    cancelled(row: InstanceRow, by: EndedBy | null): void {
      const item = itemOf(row);
      if (item) {
        quiet.delete(item.id);
        finish(item, {
          state: "cancelled",
          stoppedBy: by,
          checkingSince: null,
          submission: null,
        });
      }
    },

    /** One item, as `stop_delegate` and its callers read it. */
    item: (id: string): WorkItemRow | undefined => db.workItem(id),

    /** One item as its tray reads it (a tray's Retry answers with it). */
    summary(id: string): WorkItemSummary | undefined {
      const item = db.workItem(id);
      return item ? summaryOf(item) : undefined;
    },

    /** Whether the session's work item is over: done, failed or cancelled. */
    over(row: InstanceRow): boolean {
      const item = itemOf(row);
      return item !== undefined && !LIVE.has(item.state);
    },

    /**
     * The workspace a session's spawn is bounded to: every spawn of a work
     * item's session — a restore, a revive, a relaunch — carries it, so no
     * way back into a session runs its commands outside the boundary.
     */
    workspaceOf(row: InstanceRow): WorkspaceRef | undefined {
      const item = itemOf(row);
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      return workspace ? refOf(workspace) : undefined;
    },

    /**
     * What a held workspace holds that is nowhere else, as its machine read
     * it once its boundary was closed ({@link HeldWork}). Refused for one
     * that is not held: what a workspace holds is read as it is settled,
     * never while its boundary may run.
     */
    held(needle: string): HeldWork {
      const workspace = namedWorkspace(needle);
      if (!isHeld(workspace)) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} is ${workspace.state}, not held: what a workspace holds is read on its machine once its work has ended and its boundary is closed, and kept with it while it is held.`
        );
      }
      return heldWork(workspace);
    },

    /** Every held workspace, with what it holds and where ({@link HeldWork}), newest first. */
    heldWorkspaces: (): HeldWork[] =>
      db.heldWorkspaces().filter(isHeld).map(heldWork),

    /**
     * {@link settle} for each active workspace on `machineId`, one after
     * another: the sweep's look (workspace-retire.ts). Answers each one's
     * outcome by id.
     */
    async settleOn(
      machineId: string
    ): Promise<{ outcome: Settled; workspace: WorkspaceRow }[]> {
      const done: { outcome: Settled; workspace: WorkspaceRow }[] = [];
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        if (settling.has(workspace.id)) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, so a sweep never loads a machine with many archives at once
        done.push({ workspace, outcome: await settle(workspace.id) });
      }
      return done;
    },

    /**
     * The workspace of session `instanceId`'s item settled soon
     * ({@link settleSoon}): its session went to sleep, stopped or failed, so
     * it may hold that workspace no longer.
     */
    settleFor(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item) {
        settleSoon(item.workspaceId);
      }
    },

    /**
     * Each active workspace on `machineId` that an artifact showed settled
     * soon ({@link settleSoon}): the artifact went, and with it a hold.
     */
    settleShown(machineId: string): void {
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        if (!workspace.checksFor) {
          settleSoon(workspace.id);
        }
      }
    },

    /**
     * Archives a workspace now, a person's or a session's hand on it: its
     * sessions are ended, then its machine kills the boundary with every
     * process in it, never starting one, reads on the host what the clone
     * holds that is nowhere else, and deletes the clone. Refused while an
     * item there is live — stop it first — and for a workspace already
     * archived. A clone that holds work that is nowhere else is kept and the
     * workspace held ({@link WorkspaceHoldsWork}), unless `discard`: a
     * person chose to let it go, and its machine saves it to a carry before
     * deleting anything.
     */
    async archive(
      needle: string,
      { discard = false }: { discard?: boolean } = {}
    ): Promise<ArchivedWorkspace> {
      const workspace = namedWorkspace(needle);
      if (workspace.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} is already archived.`
        );
      }
      if (workspace.checksFor) {
        return closeWorkspace(workspace, "check");
      }
      const live = db
        .workItemsIn(workspace.id)
        .find((item) => LIVE.has(item.state));
      if (live) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} has a live work item: ${live.title} (${live.id}) is ${live.state}. Stop it before archiving the workspace.`
        );
      }
      const skip = handedOver(workspace);
      // Bounded well inside the HTTP call's own idle timeout: a machine that
      // never confirms leaves the workspace active, and the answer says so.
      const stops = await Promise.allSettled(
        [
          ...new Set(
            db.workItemsIn(workspace.id).map((item) => item.instanceId)
          ),
        ].map((instanceId) => end(instanceId, ARCHIVE_STOP_WAIT_MS))
      );
      const unconfirmed = stops.flatMap((stop) =>
        stop.status === "rejected"
          ? [
              stop.reason instanceof Error
                ? stop.reason.message
                : String(stop.reason),
            ]
          : []
      );
      if (unconfirmed.length > 0) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} stays active: ${unconfirmed.join(" ")} Retry once its machine has ended it.`
        );
      }
      const closed = await closeWorkspace(
        workspace,
        discard ? "discard" : "keep",
        skip
      );
      if (closed.held) {
        throw new WorkspaceHoldsWork(closed.held);
      }
      // Its check workspaces on other machines go with it: none outlives it.
      await Promise.all(
        db
          .checkWorkspacesOf(workspace.id)
          .map((check) => closeWorkspace(check, "check"))
      );
      return closed;
    },

    /**
     * An agent has started: its machine's workspaces that still have a clone
     * (active and held) go to it, and each one still a git worktree from
     * before workspaces were clones becomes a clone in place. The machine
     * logs each workspace it converts, skips or cannot convert.
     */
    async convertWorktrees(machineId: string): Promise<void> {
      const refs = [
        ...db.activeWorkspacesOn(machineId),
        ...db.heldWorkspaces().filter((one) => one.machineId === machineId),
      ].map(refOf);
      if (refs.length > 0) {
        await call(machineId, CONTROL_WORKSPACE_MIGRATE, [refs]);
      }
    },

    /**
     * What a session's delegate tray shows when it opens: the items it
     * delegated and, as its projects' lead, the ones it co-parents from
     * another session — live work, failures nobody has dismissed yet, what
     * finished within the tray's hold — and the delegations of either kind
     * still queued for owned files.
     */
    trayOf: (sessionId: string): WorkItemSummary[] => {
      const led = db
        .listProjects()
        .filter((project) => project.leadInstanceId === sessionId)
        .map((project) => project.id);
      const items = db
        .trayItemsOf(sessionId, led, new Date(Date.now() - TRAY_HOLD_MS))
        .filter((item) => item.instanceId !== sessionId)
        .map(summaryOf);
      const queued = db
        .queuedWorkItems()
        // One that has filed its item is that item, just before it leaves the queue.
        .filter((row) => !db.workItem(row.id))
        .map((row) => queuedSummaryOf(row))
        .filter(
          (summary) =>
            summary.parentInstanceId === sessionId ||
            summary.leadInstanceId === sessionId
        );
      return [...items, ...queued].sort((a, b) => a.createdAt - b.createdAt);
    },

    /**
     * The reader dismissed its chip: gone from the tray and from
     * `delegate_list`'s live read on every screen, with why: their reason in
     * their words, or the later item of the same parent that took over its
     * work (`replacedBy`), which must exist and have been made after it. A
     * dismissed item that is still live is over: cancelled, and its session
     * ended if it still has a process. One whose checks this hub runs now
     * ends with them. Throws with the sentence when the replacement is not
     * one.
     */
    dismiss(
      id: string,
      why: { reason: string } | { replacedBy: string }
    ): WorkItemSummary | undefined {
      const item = db.workItem(id);
      if (!item) {
        return undefined;
      }
      const said =
        "reason" in why
          ? { dismissReason: why.reason, replacedBy: null }
          : { dismissReason: null, replacedBy: replacementOf(item, why) };
      const dismissedAt = new Date();
      if (!LIVE.has(item.state) || finishing.has(item.id)) {
        const kept = update(id, { dismissedAt, ...said });
        return kept ? summaryOf(kept) : undefined;
      }
      quiet.delete(item.id);
      const cancelled = finish(item, {
        state: "cancelled",
        stoppedBy: { kind: "person" },
        dismissedAt,
        ...said,
        checkingSince: null,
        submission: null,
      });
      console.log(`[work-items] ${item.id}: dismissed while live; cancelled`);
      end(item.instanceId).catch((error: unknown) =>
        console.warn(
          `[work-items] ${item.id} was dismissed, and its session did not end: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      return summaryOf(cancelled);
    },
  };
};

export type WorkItems = ReturnType<typeof createWorkItems>;
