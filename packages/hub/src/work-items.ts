/**
 * Delegated work, as the hub keeps it. A work item is one brief run by one
 * session in one workspace — a fresh session, a fork of its parent's
 * conversation, or, for a follow-up, the workspace's last session carrying
 * on; a workspace is one shared clone on its own branch, with a boundary
 * every shell command of its items runs inside, and at most one live item —
 * the only writer its checkout has. Finished work takes another turn only
 * from the reader or the session that delegated it: that message reopens the
 * item and lands in the same session, on the transcript its provider still
 * has cached. A rule or any other session is refused — a standing instruction
 * once woke a finished leaf into a checkout a newer item owned.
 *
 * The hub is the one authority: `delegate` is a request to {@link start}, and
 * the frames that move a session move its item. It is `done` only when its
 * session calls `finish_item` and its work passes the hub's landing gate
 * ({@link gateSteps}: the steps its project declares in gate.md, on the tree
 * about to land; gate-file.ts) and lands. No session declares what the hub
 * runs: the session's report, quoting the output of every command
 * that proves its work, is the proof, and the parent's report is that
 * report with the gate's lines, the landing and the commits under it.
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
  BriefTarget,
  CheckoutMove,
  CommandResult,
  DeclaredStep,
  DelegateType,
  EndedBy,
  Envelope,
  HarnessKind,
  InputFile,
  InputNamed,
  InputsAdmitted,
  InputsRead,
  InstanceRow,
  LandsMode,
  NamedSpawn,
  NeutralOrigin,
  PermissionMode,
  PlanStep,
  RunsOnCapability,
  SendPayload,
  SendRefusal,
  SessionRole,
  WorkItemSummary,
  WorkspaceArchive,
  WorkspaceArchived,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceCut,
  WorkspaceFirstSession,
  WorkspaceHolding,
  WorkspaceRef,
  WorkspaceUnlanded,
  WorkspaceWorkEnd,
} from "@cawco/core";
import {
  byPerson,
  CODE_MODE_TOOL,
  CONTROL_CLONE_HOLDING,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_MIGRATE,
  CONTROL_WORKSPACE_WORK_END,
  handoffMarker,
  holdingWords,
  INPUTS_LIMIT_BYTES,
  isWorkspaceNeedsRefusal,
  machineCalled,
  sessionLink,
  sizeWords,
  WORK_ITEM_ORIGIN,
  type WorkspaceLanding,
  withHostLine,
  withInputsLine,
  withLandingLine,
  withWorkspaceLine,
  workWords,
} from "@cawco/core";
import {
  AGENT_RESTARTED_MID_REQUEST,
  AGENT_RESTARTING,
} from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import { type HeldInput, handedInputs } from "@cawco/core/handed-input";
import {
  isMachinePath,
  type MachinePath,
  MachinePathRefused,
} from "@cawco/core/machine-path";
import { ownCommitsShell } from "@cawco/core/own-commits";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type { StageCloneFrame } from "@cawco/core/stage";
import {
  CONTROL_FORGE_POST,
  type ForgeVerdict,
  type ForgeWrite,
} from "@cawco/core/upstream-post";
import {
  excludedPaths,
  IGNORED_STATUS,
  stageCloneId,
} from "@cawco/core/workspace-policy";
import { gateStepFor, readTargetMap, type TargetMap } from "./app-targets";
import { briefingFor } from "./briefings";
import type {
  DbShape,
  QueuedWorkItemRow,
  WorkItemRow,
  WorkspaceRow,
} from "./db";
import type {
  GatePass,
  ItemBlock,
  LandingPhase,
  Origin,
  WorkBudget,
  WorkItemSubmission,
  WorkLanding,
  WorkOrigin,
} from "./db/schema";
import {
  capableMachines,
  capableOnline,
  capableRefusal,
  capableWaitFor,
  capableWaitReason,
  changedPathsCommand,
  diffPaths,
  GATE_FILE,
  lastCapable,
  projectGate,
  projectShip,
} from "./gate-file";
import { type HandedFile, HandedInputRefusal } from "./handed-inputs";
import { byId } from "./handles";
import { boardTitle, leafOf, sessionLabel } from "./labels";
import {
  type BranchOutcome,
  branchPushCheck,
  type Failed,
  type GateStep,
  type LandingTurn,
  land,
  landingQueue,
  pushBranch,
  quote,
  type Refusal,
  statusCommand,
} from "./landing";
import { type HubLifetimeShape, type HubTimer, soon } from "./lifetime";
import {
  type CommandOptions,
  CommandStopped,
  WouldWait,
  whenStopped,
} from "./machine-pause";
import { handle } from "./presenters/words";
import {
  FOLDER_FILE_LIMIT,
  FolderRefusal,
  folderPath,
  projectRoot,
  writeFolderFiles,
} from "./project-folder";
import { placesChanged } from "./project-placements";
import { chatPointer, chatPointerRefusal } from "./report-pointer";
import { shipLanded } from "./ship";
import type { Todo } from "./task-file";
import type { TodoChanges } from "./tasks";
import { unwatchedMode } from "./unwatched-mode";
import { CAWCO_TOOL } from "./web-reads";

/** How long the name a caller gives a delegate or a started session may run. */
export const SESSION_TITLE_MAX = 48;

/** What the caller's model is asked for when it names a delegate or a started session. */
export const SESSION_TITLE_DESCRIPTION =
  "3–6 plain words, verb first, like 'Fix tray chip overflow'.";

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
 * reads of its parent and no more. A routine or a design check runs on no
 * harness: its `harness` is null.
 */
export type Parent = Pick<
  InstanceRow,
  | "canDelegate"
  | "cwd"
  | "id"
  | "launchDir"
  | "machineId"
  | "model"
  | "projectId"
  | "sessionId"
  | "title"
> & { harness: HarnessKind | null };

/** What a routine's runs name as their parent: `routine:<id>`, which no session's row has. */
const ROUTINE_PARENT = "routine:";

/** The parent id a routine's runs carry, on their item and their session's row. */
export const routineParentId = (routineId: string): string =>
  `${ROUTINE_PARENT}${routineId}`;

/** Whether a parent id is a routine's: its runs report to no session (routines.ts reads their end). */
export const isRoutineParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(ROUTINE_PARENT);

/** What a design check's verifier names as its parent: `verifier:<the builder's item>`, which no session's row has. */
const VERIFIER_PARENT = "verifier:";

/**
 * Whether a parent id is the hub's own, a routine's or a design check's
 * (design-verify.ts): the item reports to no session, and the hub reads how
 * it ended.
 */
export const isHubParent = (id: string | null | undefined): boolean =>
  isRoutineParent(id) || isVerifierParent(id);

/** Whether a parent id is a design check's: its session is that check's verifier. */
export const isVerifierParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(VERIFIER_PARENT);

/**
 * A design check's verifier's parent: the builder's item, in its project,
 * its workspace cut from the builder's (so its clone holds the builder's
 * commits), under the check's name.
 */
export const verifierParent = (builder: {
  cwd: string;
  itemId: string;
  machineId: string;
  projectId: string;
}): Parent => ({
  id: `${VERIFIER_PARENT}${builder.itemId}`,
  projectId: builder.projectId,
  machineId: builder.machineId,
  cwd: builder.cwd,
  title: "Design check",
  launchDir: "unknown",
  harness: null,
  model: null,
  sessionId: null,
  // The hub starts it: its own session is the leaf (its request's canDelegate).
  canDelegate: true,
});

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
  harness: null,
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
 * What a session's workspace holds that is on no remote, for a message about
 * to wake that session cold (delegation-actions.ts `checkCold`): `changed`,
 * its uncommitted changes and stashes, which only that clone can reach;
 * `ahead`, its commits on no remote, which a fresh delegate cut from its
 * branch reaches too (`delegate` with `from`). `live`: its item still runs.
 */
export interface Unlanded {
  ahead: number;
  changed: number;
  live: boolean;
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

/** How many of a held workspace's excluded paths are named in words; the rest are counted. */
const EXCLUDED_NAMED = 20;

/** A held workspace's excluded paths in words ("a, b and 3 more"), or "" when it has none. */
export const excludedNamed = (excluded: readonly string[] = []): string =>
  excluded.length > EXCLUDED_NAMED
    ? `${excluded.slice(0, EXCLUDED_NAMED).join(", ")} and ${excluded.length - EXCLUDED_NAMED} more`
    : excluded.join(", ");

/**
 * An archive refused because the clone holds work that is nowhere else: it
 * names what, the workspace is held, and nothing is deleted. `discard`
 * archives it anyway, its unlanded commits, changes, stashes and excluded
 * files saved to a carry first.
 */
export class WorkspaceHoldsWork extends WorkItemRefusal {
  readonly held: HeldWork;
  constructor(held: HeldWork) {
    const named = excludedNamed(held.excluded);
    super(
      409,
      `Workspace ${handle(held.workspaceId)} on ${held.machine} holds ${held.holds} (${held.size} at ${held.path}), so it was not archived and nothing was deleted: it is held.${named ? ` Kept out of git by its own excludes: ${named}.` : ""} Continue its work, or pass discard: true to archive it with its unlanded commits, changes, stashes and excluded files saved to a carry in ~/.cawco/carries on ${held.machine}.`
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

/**
 * A delegation's inputs: the paths named, admitted on its parent's machine,
 * with the parent's own workspace when it runs in one (what they were
 * admitted against) and the machine they are on, whose bytes the
 * workspace's machine copies or writes (`handIn`); `held`, what the hub
 * resolved itself (handed-inputs.ts), bytes and all; and every one by name.
 */
interface Inputs {
  bound: WorkspaceRef | null;
  files: InputNamed[];
  held: HandedFile[];
  machineId: string;
  paths: string[];
  /** The project the parent belongs to: a file in its folder may go. */
  project: string | null;
}

/** A delegation that names no inputs. */
const NO_INPUTS: Inputs = {
  paths: [],
  bound: null,
  project: null,
  machineId: "",
  files: [],
  held: [],
};

/** A sentence's closing stops and space, which an inputs refusal ends once. */
const CLOSED = /[.\s]+$/;

/** A refusal of a delegation's inputs, in `words` closed by one full stop. */
const inputsRefused = (words: string, options?: ErrorOptions) =>
  new WorkItemRefusal(400, `inputs: ${words.replace(CLOSED, "")}.`, options);

/** Entries one delegation's inputs may name (agent inputs.ts holds its paths to the same). */
const INPUTS_COUNT_LIMIT = 50;

/** What the hub writes is its reader's to read and write. */
const HELD_MODE = 0o600;

/** What `delegate` asks for. */
/** An item's clone as a brief reads it: its workspace, on its machine (commands in it run inside its boundary). */
export interface CloneRef {
  id: string;
  machineId: string;
  path: string;
}

export interface WorkItemRequest {
  /** The account its session must run on (an id or label); placement chooses when absent. */
  account?: string;
  /**
   * The brief, written from the item's clone once it is cut or reused and
   * before the item is filed: what the clone holds that the brief carries
   * (an attempt's design system, dispatch.ts). Its answer is the brief the
   * item stores and its session reads; `prompt` is that brief as it reads
   * before any clone, for what is said of the request before one is cut. Set
   * by the hub alone.
   */
  briefFromClone?: (clone: CloneRef) => Promise<string>;
  /** What it may spend before the hub stops it; the project's default fills what this leaves out. */
  budget?: WorkBudget;
  /**
   * A person started it himself (work_items.by_person): set by the
   * dispatcher for an attempt he started from the dashboard.
   */
  byPerson?: boolean;
  canDelegate?: boolean;
  /** The repository a new workspace is cut from; the parent's directory by default. */
  cwd?: string;
  /**
   * The commit a new workspace's worktree is moved to, detached, before its
   * session starts ({@link detachNew}): a design check's verifier's judged
   * commit (design-verify.ts). Set by the hub alone.
   */
  detachAt?: string;
  /**
   * The item's session forks its parent's conversation as it stands now, on
   * the parent's harness and model so the parent's prompt cache still holds.
   * Always a new workspace.
   */
  fork?: boolean;
  /**
   * A workspace of the caller's, with no live item: the new workspace's
   * branch is cut at that workspace's head, its commits carried in a
   * bundle, on its machine and from its repository.
   */
  from?: string;
  /** Its group under its parent: one combined report once every item of it has ended. */
  group?: string;
  harness?: HarnessKind;
  /**
   * Host scope: its session runs on the machine itself (`machineId`, the
   * parent's by default) in `cwd` (the agent user's home when left out),
   * with no clone and no boundary ({@link startHost}). It lands nothing, and
   * takes nothing that needs a clone ({@link hostProblem}).
   */
  host?: boolean;
  /**
   * What its parent hands it (core handed-input.ts), written into its
   * workspace's `$TMPDIR/inputs/` before the brief that names them: files
   * on the parent's machine by absolute path (agent inputs.ts), and what
   * the hub holds by name, resolved here (handed-inputs.ts). Checked as
   * they come: the route takes any list.
   */
  inputs?: unknown[];
  /** Where its commits go once it passes the landing gate; `main` when left out. */
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
  /**
   * Its machine's own word that the session is between turns (server.ts
   * `sessionIdle`): what a hub that started reads for a turn whose end it
   * never heard. False while the machine is away or does not answer.
   */
  readonly between: (row: InstanceRow) => Promise<boolean>;
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
  /**
   * Whether `machineId`'s custody of session `instanceId` is undecided:
   * the machine is away or reconnecting and has not yet said which
   * processes it still holds, or it holds that one's process unadopted. Its
   * item is neither failed nor reported meanwhile (workflow engine
   * 93a02b3a9: "Keep workflow attempts alive until custody decides
   * absence").
   */
  readonly custodyPending: (machineId: string, instanceId: string) => boolean;
  readonly db: DbShape;
  /** Whether a verifier is judging the item's result now: its turns ending quietly are waiting, not idle. */
  readonly designHeld: (itemId: string) => boolean;
  /**
   * The design check (design-verify.ts) of a `finish_item`, before its
   * landing gate runs: the words the call answers while a verifier session
   * judges the result against its project's design system, or nothing when
   * the item goes on (not design work, no system to judge against, or passed
   * at its commit).
   */
  readonly designHold: (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ) => Promise<string | undefined>;
  /**
   * Store stop intent and wait for the machine's positive end confirmation,
   * for `waitMs` at most. Returns at once for a session already ended or with
   * no process on its machine.
   */
  readonly end: (instanceId: string, waitMs?: number) => Promise<void>;
  /**
   * The {@link WorkItems.finishingFor} hold on `instanceId` is over: what it
   * kept at the hub goes now, in order (server.ts `releaseOwed`).
   */
  readonly finishOver: (instanceId: string) => void;
  /** The machine the hub runs on, once read (server.ts `ownMachineIdRead`): where a project ships from (ship.ts). */
  readonly hubMachineId: () => string | undefined;
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
   * What `row`'s session cannot be started again without and is missing
   * now: its delegate type, its machine, or its account (server.ts); none
   * when nothing is ({@link WorkItems.blockIfMissing}).
   */
  readonly missingFor: (
    row: InstanceRow
  ) => Omit<ItemBlock, "since"> | undefined;
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
    session: Omit<NamedSpawn, "cwd">,
    task: { projectId: string | null; taskId?: string }
  ) => ItemPlacement;
  /**
   * Waits, bounded, until `machineId`'s harnesses converged the project's
   * rows placed at the place `placeId` (its MCP servers, skills, hooks,
   * memory documents, Claude Code settings, OpenCode plugins and pi
   * extensions): a delegate's session in a new workspace starts with them,
   * as each harness reads what is placed at its folder as it launches.
   */
  readonly placeTaken: (machineId: string, placeId: string) => Promise<void>;
  /**
   * The session's plan steps as its plan panel reads them (plans.ts):
   * CawCo's list, `todo_write`'s session scope. The plan ↔ to-do link reads
   * these.
   */
  readonly planSteps: (instanceId: string) => Promise<PlanStep[]>;
  readonly publish: (item: WorkItemSummary) => void;
  /**
   * The session called `finish_item`, and its turn ends with that call: each
   * send its harness was handed and has not read, from a sender the
   * {@link WorkItems.finishingFor} hold keeps, is taken back from the harness
   * and kept at the hub, so it goes as the session's next turn and never
   * into the turn that is ending (server.ts `reclaimUnread`). Settles once
   * each has answered; never throws.
   */
  readonly reclaimUnread: (instanceId: string) => Promise<void>;
  /**
   * The retired workspace of `instanceId`'s item is cut again
   * ({@link WorkItems.recutFor}): what was kept at the hub for the session
   * meanwhile goes to it now, waking it (server.ts `releaseOwed`).
   */
  readonly recutDone?: (instanceId: string) => void;
  /** It could not be cut again, for `reason`: what was kept for the session fails with it. */
  readonly recutFailed?: (instanceId: string, reason: string) => void;
  /**
   * It was not cut yet because its machine's agent is restarting, or
   * restarted as it cut ({@link recutWaitsForAgent}): what was kept for the
   * session goes through the send path again (server.ts `releaseOwed`),
   * whose hold asks for the cut again ({@link WorkItems.recutFor}).
   */
  readonly recutKept?: (instanceId: string) => void;
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
  /** One input that names what the hub holds, as its files, read for `caller` (handed-inputs.ts); throws a refusal in its words. */
  readonly resolveHanded: (
    caller: InstanceRow,
    input: HeldInput
  ) => Promise<HandedFile[]> | HandedFile[];
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  /**
   * Whether a send pending for the session may start a turn in it (server.ts
   * `startsTurnIn`): it wakes the session in its workspace, which holds the
   * workspace ({@link holdOn}). One kept for a stopped session no such send
   * has woken holds nothing.
   */
  readonly sendWakes: (instanceId: string) => boolean;
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
    payload: NamedSpawn,
    workItemId: string,
    fallbackMode: PermissionMode,
    placed?: { accountId?: string }
  ) => void;
  /**
   * An item's session was filed under its parent's turn (memory.ts
   * `TurnWatch.spawned`): a routine run's turn makes its children the run's.
   */
  readonly spawnedUnder?: (instanceId: string, parentId: string) => void;
  /**
   * Why place `placeId`'s sheet stage holds its stage clone, in words: it
   * starts, wakes or serves as its machine last said (core `StageFrame`).
   * Nothing once every stage of the place sleeps, failed or was never heard.
   */
  readonly stageRuns?: (placeId: string) => string | undefined;
  /**
   * "Stopped at A's limit; continues on B" while `instanceId` is stopped at
   * its account's limit (hub at-limit.ts `stall`); undefined while it runs.
   */
  readonly stalled: (instanceId: string) => string | undefined;
  /** A task's title as its project's index has it: a pull request's title. */
  readonly taskTitle?: (
    projectId: string,
    taskId: string
  ) => string | undefined;
  /**
   * A notice about the session in Needs you (fleet-watch.ts `tellYou`), and
   * its end once the hold it told of is over (`untellYou`).
   */
  readonly tellYou: (row: InstanceRow, title: string, body: string) => void;
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
  /**
   * Item `instanceId`'s block is over: what was kept at the hub for its
   * session goes now, waking it (server.ts `releaseOwed`).
   */
  readonly unblocked: (instanceId: string) => void;
  readonly untellYou: (instanceId: string) => void;
  /** A workspace was settled on its machine, archived or held: the dashboards draw it so. */
  readonly workspaceChanged?: (workspace: WorkspaceRow) => void;
}

/** A plan item's to-do id, `[td-3] Persist the choice` → `td-3`. */
const PLAN_TODO = /\[(td-\d{1,6})\]/;
/** Plan items one attempt may leave behind as proposed to-dos. */
const PROPOSALS_LIMIT = 20;
const RUNS_OF_SPACE = /\s+/g;
/** A plan item's or to-do's words as they are matched: spaces folded, lowercase. */
const planWords = (text: string): string =>
  text.replace(RUNS_OF_SPACE, " ").trim().toLowerCase();
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

/**
 * How long an item's session may sleep and still be woken by the sweep, when
 * its item has no minutes budget: a day (our call). A process lost to a
 * restart, a reboot or an idle sleep is found within the sweep's minutes; a
 * session asleep a day is work nobody is waiting on, and the obelisk storm's
 * (2026-10-23) had slept for weeks.
 */
const ASLEEP_WAKE_LIMIT_MS = 24 * 60 * 60_000;

/** The longest `item`'s session may sleep and be woken: its budget's minutes, else {@link ASLEEP_WAKE_LIMIT_MS}. */
const asleepLimit = (item: WorkItemRow): { ms: number; words: string } => {
  const minutes = item.budget?.minutes;
  return minutes === undefined
    ? { ms: ASLEEP_WAKE_LIMIT_MS, words: workWords.aDay }
    : { ms: minutes * 60_000, words: workWords.budgetMinutes(minutes) };
};

/** A row's time as ms, 0 when it has none. */
const timeOf = (at: string | number | Date | null | undefined): number =>
  at === null || at === undefined ? 0 : new Date(at).getTime() || 0;

/** What the sweep's wake tells a session asleep on open work. */
const STILL_OPEN = "Your work item is still open: continue it.";

/** A blocked item's reason as the person reads it ({@link ItemBlock}): what is missing, and what puts it right. */
export const blockWords = (block: ItemBlock): string => {
  switch (block.kind) {
    case "type":
      return workWords.missingType(block.name);
    case "machine":
      return workWords.missingMachine(block.name);
    case "account":
      return workWords.missingAccount(block.name);
    default: {
      const unhandled: never = block.kind;
      throw new Error(`unhandled block: ${String(unhandled)}`);
    }
  }
};

/** When a parent hears from its delegate, as `delegate` and a continue answer it. */
const REPORT_ARRIVES = workWords.reportArrives;

/** How an open item ends, as the hub's reminders say it. */
const FINISH_LINE =
  "Finish the work and call finish_item with a report that quotes the output of every command that proves it, or call it with `blocked` and the exact command and error.";

/** Whose word the sweep's wake is: the hub's about an item, as the quiet-turn word is. */
const WAKE_ORIGIN: NeutralOrigin = { kind: "system", name: WORK_ITEM_ORIGIN };

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

/**
 * A workspace as its machine is told about it: a clone and its boundary. A
 * host-scope row (schema.ts `workspaces.host`) is the host's own folder,
 * which no machine call may treat as a clone (an archive deletes one), so
 * naming one throws.
 */
const refOf = (workspace: WorkspaceRow): WorkspaceRef => {
  if (workspace.host) {
    throw new Error(
      `workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path}: no clone and no boundary to act on`
    );
  }
  return { id: workspace.id, path: workspace.path };
};

/** The boundary a session in `workspace` runs inside: none for a host-scope one. */
const boundaryOf = (workspace: WorkspaceRow): WorkspaceRef | undefined =>
  workspace.host ? undefined : refOf(workspace);

/**
 * The item's session: nested under its parent, working in the workspace's
 * checkout, every shell command inside the workspace's boundary, and its
 * parent's project's, as the workspace is one of that project's places. A
 * host-scope item's session names no workspace: the machine starts it in
 * its folder on the host, unbounded (agent session.ts `#sessionContext`).
 */
const spawnOf = (
  instanceId: string,
  title: string,
  parent: Parent,
  workspace: WorkspaceRow,
  settings: Settings
): NamedSpawn => {
  const bound = boundaryOf(workspace);
  return {
    ...sessionOf(instanceId, title, parent, settings),
    cwd: workspace.path,
    ...(bound ? { workspace: bound } : {}),
  };
};

/** {@link spawnOf} but where it works: what placement reads of the session. */
const sessionOf = (
  instanceId: string,
  title: string,
  parent: Parent,
  { account, canDelegate, forkOf, harness, model, role, skills, type }: Settings
): Omit<NamedSpawn, "cwd"> => ({
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
  workspace.host
    ? `${workspace.path} on the host, no clone and no boundary`
    : `${workspace.path}, branch ${workspace.branch}${workspace.tmp ? `, TMPDIR ${workspace.tmp}` : ""}`;

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
 * Who may give finished work another turn: the reader (dashboard or app,
 * their words, their Send on its artifact, or their answer to its held
 * upstream post: core `byPerson`), the
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

/** Why a landed item's follow-up ended, when a stop ended it ({@link WorkItemRow} `error`). */
const FOLLOW_UP_STOPPED = "Its follow-up was stopped before it landed.";

/** What anyone else's message to finished work is answered with. */
const finishedText = (item: WorkItemRow): string =>
  `${item.title} (${handle(item.id)}) is ${item.state}. Only the reader, the session that delegated it, or its project's lead can continue it.`;

/** What a message to finished work is answered with once a newer item holds its workspace. */
const supersededText = (item: WorkItemRow, latest: WorkItemRow): string =>
  `${item.title} (${handle(item.id)}) is ${item.state}, and workspace ${handle(item.workspaceId)} has moved on to ${latest.title} (${handle(latest.id)}, ${latest.state}). Message that one.`;

/** The line a parent's report carries about the item behind it. */
const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}.]`
    : `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}. A handoff to it continues this same session.]`;

/** The first line with words on it. */
const firstLine = (text: string | null): string =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** How long a gate step runs when it names no limit of its own. */
const GATE_TIMEOUT_SEC = 600;

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

/** Runs of whitespace between the counts a git read prints. */
const SPACES = /\s+/;

/** A full commit id, as a machine names one: never an option or a ref. */
const COMMIT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** A CawCo read by its name, the harness's prefix off: `list_*`, `*_list`, `*_read`. */
const CAWCO_READ = /^list_|_list$|_read$/;
/** The CawCo tools that say themselves what becomes of a wait. */
const WAIT_TOOLS: ReadonlySet<string> = new Set(["wait_item", "finish_item"]);

/**
 * Whether a tool call leaves a declared wait on: a CawCo read, wait_item or
 * finish_item (each settles the wait itself), Claude's ToolSearch, which
 * only loads a deferred tool, or OpenCode's Code Mode program, whose own
 * calls are judged one by one as their frames come (server.ts). Any other
 * call is the session's own work.
 */
const restsInWait = (tool: string): boolean => {
  if (tool === "ToolSearch" || tool === CODE_MODE_TOOL) {
    return true;
  }
  if (!CAWCO_TOOL.test(tool)) {
    return false;
  }
  const name = tool.replace(CAWCO_TOOL, "");
  return WAIT_TOOLS.has(name) || CAWCO_READ.test(name);
};

/** A harness gets one minute after its declared deadline to start a turn. */
const WAIT_RESUME_GRACE_MS = 60_000;

/**
 * How soon a cut again its agent refused behind its restart's fence is asked
 * again if the agent's register has not asked it first: the minute the
 * refusal itself names ("retry it in a minute").
 */
const RESTART_RECUT_MS = 60_000;

/**
 * Whether a cut again failed only for its machine's agent's restart, and
 * what it waits for: `fenced`, refused behind the fence an agent raises
 * before it restarts (an install, `cawco service restart agent`), so the
 * agent's next register asks it again; `restarted`, cut short as the agent
 * ended and answered so by the agent that came back, so it is asked again
 * now, the agent clearing its own unfinished cut first (agent workspace.ts
 * `clearOwnCut`). On 2026-10-23 a handoff to a retired delegate sent as its
 * machine's agent restarted for an update failed, "The agent is restarting.
 * This request was not started; retry it in a minute.", while one to a live
 * session there was queued until the update was done.
 */
const recutWaitsForAgent = (
  message: string
): "fenced" | "restarted" | undefined => {
  if (message === AGENT_RESTARTING) {
    return "fenced";
  }
  return message === AGENT_RESTARTED_MID_REQUEST ? "restarted" : undefined;
};
const waitClock = (at: Date): string =>
  at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const WAIT_ITEM_LIMIT =
  "Wait not set. Use whole minutes from 1 to 120 and a non-empty reason for waiting on a command you started.";

/** A `from` request with what it cannot go with: a new workspace, cut where its source's repository is. */
const fromProblem = (request: WorkItemRequest): string | undefined => {
  if (request.from === undefined) {
    return;
  }
  if (!request.from.trim()) {
    return "from is blank: name a workspace id from one of your delegates.";
  }
  const clashes = [
    request.workspace && "workspace",
    request.cwd && "cwd",
    request.machineId && "machine",
    request.reuse && "reuse",
  ].filter(Boolean);
  return clashes.length > 0
    ? `from cuts a new workspace on its source's machine, from its repository; drop ${clashes.join(" and ")}.`
    : undefined;
};

/**
 * A host-scope request with what needs a clone, each refused in a line of
 * its own: there is no workspace to cut, continue, own files in, hand files
 * into or collect from, and nothing lands.
 */
const hostProblem = (request: WorkItemRequest): string | undefined => {
  if (!request.host) {
    return;
  }
  const refused = [
    request.from !== undefined &&
      "from: a host delegate has no clone to start at another workspace's commits.",
    request.workspace !== undefined &&
      "workspace: a host delegate is a new session; continue one with handoff.",
    request.owns?.length &&
      "owns: a host delegate has no clone whose files it could own.",
    request.inputs?.length &&
      "inputs: a host delegate has no $TMPDIR/inputs/; name the paths on its machine in the brief.",
    request.outputs?.length &&
      "outputs: nothing is collected from a host delegate; its report carries the result.",
    request.lands !== undefined &&
      request.lands !== "none" &&
      `lands ${request.lands}: a host delegate lands nothing; leave lands out.`,
    (request.reuse !== undefined || request.task !== undefined) &&
      "a task's attempt runs in a clone of its project.",
  ].filter((line): line is string => typeof line === "string");
  return refused.length > 0 ? workWords.hostRefused(refused) : undefined;
};

/** Why a request's title, owned files, budget, group, `from` or host scope cannot stand; nothing when they can. */
const requestProblem = (request: WorkItemRequest): string | undefined =>
  hostProblem(request) ??
  fromProblem(request) ??
  titleProblem(request.title) ??
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
        `outputs: “${raw}” is not a path inside the workspace. Name each file or folder from the workspace's root, like report.md or docs/notes/: no leading "/", no "..", nothing under .git.`
      );
    }
    if (!path) {
      throw new WorkItemRefusal(
        400,
        `outputs: “${raw}” names the workspace itself; name a file or folder in it, like report.md.`
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

/**
 * The shell that says of each output whether it is missing, a link, or a
 * file of some size. A folder is said file by file, so a link inside it is
 * refused and each file meets the size limit; a folder with no files in it
 * is missing.
 */
const outputsProbe = (outputs: string[]): string =>
  outputs
    .map(
      (path) =>
        `p=${quote(path)}; if [ -L "$p" ]; then echo "link $p"; elif [ -d "$p" ]; then find "$p" -type l | while IFS= read -r f; do echo "link $f"; done; find "$p" -type f | while IFS= read -r f; do echo "size $(wc -c < "$f" | tr -d ' ') $f"; done; [ -n "$(find "$p" -type f | head -n 1)" ] || echo "missing $p"; elif [ ! -f "$p" ]; then echo "missing $p"; else echo "size $(wc -c < "$p" | tr -d ' ') $p"; fi`
    )
    .join("; ");

/**
 * The shell that lists the files to collect for one output, a path from the
 * workspace's root a line: the file itself, or every file under a folder.
 */
const outputFilesCommand = (path: string): string =>
  `p=${quote(path)}; if [ -d "$p" ]; then find "$p" -type f | LC_ALL=C sort; else echo "$p"; fi`;

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

/** How much of each stream a gate step keeps: the report and the delegate read this. */
const GATE_TAIL = 4000;

/** A step's command result, each stream cut to its last {@link GATE_TAIL} characters. */
const gateTails = (result: CommandResult): CommandResult => ({
  exitCode: result.exitCode,
  stdout: result.stdout.slice(-GATE_TAIL),
  stderr: result.stderr.slice(-GATE_TAIL),
});

/** One landing gate step, as the hub ran it: `result` holds the stream tails. */
interface StepOutcome {
  durationMs: number;
  exitCode: number;
  /** Why the step had nothing to run (GateStep `nothing`): it passes, and its line says this. */
  nothing?: string;
  passed: boolean;
  result: CommandResult;
  /**
   * Why a step did not run, its pass carried over ({@link gateOnce}):
   * `passed on this tree at finish_item`.
   */
  skipped?: string;
  step: GateStep;
  /**
   * Why a step did not run and so did not pass: an earlier step with
   * `on-fail: stop` failed (`bun install --frozen-lockfile failed first`).
   */
  unrun?: string;
  /** Where a step on another machine ran: `on Omars-MacBook-Pro at 1a2b3c4d5`. */
  where?: string;
}

/** Every path the steps declare as their inputs (`on:`), read once per look at the workspace. */
const inputPathsOf = (steps: readonly GateStep[]): string[] => [
  ...new Set(steps.flatMap((step) => step.inputs ?? [])),
];

/**
 * A clean workspace as {@link gateOnce} keys passes by it: `tree`, HEAD's
 * tree with the item's outputs' contents beside it; `inputs`, the tree of
 * each declared input path at HEAD (`absent` where HEAD has none); `outputs`,
 * each output's content hash; `stamp`, all of it, to tell whether the
 * workspace moved during a run. A step that declares its inputs (`on:`) has
 * its pass kept and matched by those paths' trees rather than the whole
 * tree's, so it holds after a rebase that left them as they were; every
 * other step by the whole tree.
 */
interface TreeState {
  inputs: ReadonlyMap<string, string>;
  outputs: ReadonlyMap<string, string>;
  stamp: string;
  tree: string;
}

/**
 * Where `step`'s pass is kept in `state`, and how its skip says where it
 * passed: the whole tree, or, for a step that declares inputs, those paths'
 * trees (and the contents of any output under them).
 */
const passKey = (
  step: GateStep,
  state: TreeState
): { key: string; said: (stage: string) => string } => {
  const { inputs } = step;
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
    said: (stage) =>
      `passed ${stage} on the same ${step.inputsSaid ?? inputs.join(" and ")} tree`,
  };
};

/** A git tree's name, as `git rev-parse <commit>^{tree}` prints it. */
const TREE_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * Why `step` need not run where `passed` passed (all kept under its
 * {@link passKey}, which `said` names): the same command passed there.
 * Undefined when it must run.
 */
const priorPass = (
  step: GateStep,
  passed: GatePass[],
  said: (stage: string) => string
): string | undefined => {
  const command = step.command.trim();
  const same = passed.find((each) => each.command === command);
  return same ? said(same.stage) : undefined;
};

/**
 * A run of the landing gate: each step's outcome, and whether the project
 * declares a gate at all (gate-file.ts): one that declares none lands with
 * no checks, and its report says so.
 */
interface GateRun {
  declared: boolean;
  outcomes: StepOutcome[];
}

/**
 * The landing gate an item lands through: the steps its project declares
 * that are due for it (gate-file.ts), and whether it declares a gate at all.
 */
interface Gate {
  declared: boolean;
  steps: GateStep[];
}

/**
 * Why an item's gate cannot run now, in words; `needs`, when that is no
 * online machine with a capability a due step needs: the item waits for one.
 */
interface GateRefusal {
  needs?: RunsOnCapability;
  refusal: string;
}

/**
 * How long an item waits for a machine its gate needs before the hub wakes
 * it to try again (the {@link WAIT_ITEM_LIMIT} ceiling); one coming online
 * wakes it sooner, at the sweep.
 */
const CAPABLE_WAIT_MINUTES = 120;

/** What a landing that pushed says of a project that declares no gate. */
const NO_CHECKS = "merged with no checks: this project declares none";

/**
 * How a gate run waits. At finish_item and while an item gates on top of
 * its branch (`inTurn` false) its steps wait out their machine's pause and
 * the shared slots they need, `say` hearing each wait with the name of the
 * step that waits (null once none does). In the landing turn (`inTurn` true)
 * nothing waits: a step due there that runs on another machine, or one that
 * would wait for a pause or a slot, throws {@link WouldWait}, and the item
 * steps out of its turn (landing.ts).
 */
interface GateHow {
  inTurn: boolean;
  say: (words: string | null, step?: string) => void;
}

/**
 * A gate step's wait as its item's status says it: `the step “iOS build
 * compiles” is waiting: obelisk-of-light is paused until 18:52`, `… is
 * queued for the Mac's build slot behind …`; the wait alone when no step
 * waits. Before 2026-10-18 the step's name ran straight into the wait
 * ("iOS build compiles waiting: …").
 */
const stepWaitWords = (words: string, step: string | undefined): string =>
  step ? `the step “${step}” is ${words}` : words;

/**
 * The turn runs only what runs in the workspace itself: a due step on
 * another machine (one that `needs:` a Mac) is the gate's, outside the queue.
 * Throws {@link WouldWait} naming the first such step, before any of them
 * runs; nothing when there is none.
 */
const refuseAway = (
  steps: GateStep[],
  machineId: string,
  named: (machineId: string) => string
): void => {
  const away = steps.find((step) => step.machine && step.machine !== machineId);
  if (away?.machine) {
    throw new WouldWait(`${away.name} runs on ${named(away.machine)}`);
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

/** One step that ran to its end, and where, when on another machine. */
interface Ran {
  complete: CommandResult;
  where: string | undefined;
}

/** Whether a run fails: a step that failed, or one left unrun by one that did. */
const runFailed = (run: GateRun): boolean =>
  run.outcomes.some((outcome) => !outcome.passed);

/** A fenced block that no command output can close early. */
const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;

/**
 * A failed gate run as the delegate reads it: `head`, which steps failed
 * and which they left unrun; `lines`, the steps', failures first, each
 * failure with its output.
 */
const failedRun = (run: GateRun): { head: string; lines: string } => {
  const failing = run.outcomes.filter(
    (outcome) => !(outcome.passed || outcome.unrun)
  );
  const unrun = run.outcomes.filter((outcome) => outcome.unrun);
  const passing = run.outcomes.filter((outcome) => outcome.passed);
  const names = (each: StepOutcome[]) =>
    each.map((outcome) => outcome.step.name).join(" and ");
  return {
    head: `${names(failing)} failed${unrun.length > 0 ? `, so ${names(unrun)} did not run` : ""}`,
    lines: [...failing, ...unrun, ...passing]
      .map(stepResultLine)
      .join("\n")
      .trimEnd(),
  };
};

/**
 * A step's line: its name, pass or fail, exit code and duration. A failure
 * carries its stdout tail under it; a pass is the line alone.
 */
const stepLine = ({
  step,
  passed,
  exitCode,
  durationMs,
  result,
  skipped,
  unrun,
  where,
  nothing,
}: StepOutcome): string => {
  if (nothing) {
    return `- ${step.name}: ${nothing}`;
  }
  if (skipped) {
    return `- ${step.name}: pass (not run again: ${skipped})`;
  }
  if (unrun) {
    return `- ${step.name}: not run (${unrun})`;
  }
  const line = `- ${step.name}: ${passed ? "pass" : "fail"} (exit ${exitCode}, ${(durationMs / 1000).toFixed(1)}s${where ? `, ${where}` : ""})`;
  // A pass is its line: its output is the report's length, not its news.
  return !passed && result.stdout.trim()
    ? `${line}${fenced(result.stdout)}`
    : line;
};

/** A gate run as the report lists it: each step; empty when it ran nothing. */
const gateLines = (run: GateRun): string =>
  run.outcomes.map(stepLine).join("\n").trimEnd();

/**
 * A finished landing's gate lines: its steps, or, for a project that
 * declares no gate, {@link NO_CHECKS} once it pushed something; empty
 * when it pushed nothing.
 */
const landingGateLines = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>
): string => {
  if (landing.gate.declared) {
    return gateLines(landing.gate);
  }
  return landing.kind === "done" && landing.landed ? NO_CHECKS : "";
};

/** A step as the delegate reads it: a failure carries its stderr too. */
const stepResultLine = (outcome: StepOutcome): string =>
  !outcome.passed && outcome.result.stderr.trim()
    ? `${stepLine(outcome)}\nstderr:${fenced(outcome.result.stderr)}`
    : stepLine(outcome);

/**
 * The landing line of an item that landed on its base: where, what its turn
 * ran again after the turn's rebase (nothing when the branch had not moved
 * since it gated), and each time it stepped out of its turn. What its last
 * gate on top of the branch ran is the report's landing gate section.
 */
const landedLine = (
  base: string,
  landed: { rebased: boolean; sha: string },
  turn: GateRun | undefined,
  steps: string[]
): string => {
  const ran = turn?.outcomes
    .filter((each) => !each.nothing)
    .map((each) =>
      each.skipped
        ? `${each.step.name} not run again (${each.skipped})`
        : `${each.step.name} ${each.passed ? "passed" : "failed"}`
    )
    .join(", ");
  const after = landed.rebased
    ? `${base} had moved by its turn, so it rebased again${ran ? `: ${ran}` : ", with no merge checks to run"}`
    : `${base} had not moved by its turn, so nothing ran again`;
  const stepped =
    steps.length > 0
      ? `; it stepped out of its turn ${steps.length === 1 ? "once" : `${steps.length} times`} to run the merge checks again, the last time because ${steps.at(-1)}`
      : "";
  return `${workWords.landedOn(base)} at ${landed.sha.slice(0, 9)}, checked on top of ${base}; ${after}${stepped}.`;
};

/** The findings, numbered; nothing when there are none. */
const findingsBlock = (findings: WorkItemSubmission["findings"]): string =>
  findings?.length
    ? `\n\nFindings:\n${findings.map((finding, index) => `${index + 1}. ${finding.title}: ${finding.detail}`).join("\n")}`
    : "";

/**
 * What landing a finished item came to: done (with the pull request it
 * opened or found, landing `pr`), back to its session, or refused. `gate` is
 * the landing gate's run, for the report.
 */
type Landed =
  | {
      kind: "done";
      line: string;
      gate: GateRun;
      /** What it put where, when it pushed (the item's `landed`). */
      landed?: WorkLanding;
      prUrl?: string;
    }
  | { kind: "refused"; line: string; gate: GateRun; prUrl?: string }
  | { kind: "retry"; text: string }
  | { kind: "stopped"; text: string };

/**
 * What a landing that went writes on its item: what it put where and the
 * pull request it opened. A follow-up with nothing new to land keeps what
 * the item landed before.
 */
const landedFields = (
  landing: Landed
): { landed?: WorkLanding; prUrl?: string } =>
  landing.kind === "done"
    ? {
        ...(landing.landed ? { landed: landing.landed } : {}),
        ...(landing.prUrl ? { prUrl: landing.prUrl } : {}),
      }
    : {};

/** A landing its item's stop ended before it pushed (landing.ts `Stopped`): nothing landed, nothing reported. */
const stoppedLanding = (item: WorkItemRow): Landed => ({
  kind: "stopped",
  text: `${item.title} was stopped while it landed; nothing was landed or reported.`,
});

/** The text that hands uncommitted work back to the session, for a landing that takes only commits. */
const dirtyText = (files: string, where: string): string =>
  `Not landed: the workspace has changes that are not committed, new files included. The hub lands only commits, so landing now could leave ${where} without them. Commit them, delete them, or move scratch to $TMPDIR, then call finish_item again.${fenced(files)}`;

/** The text that hands failed merge checks back to the session. */
const gateFailedText = (run: GateRun, where: string): string => {
  const { head, lines } = failedRun(run);
  return `Not landed: the merge checks ran on ${where}, and ${head}. Fix it, commit, and call finish_item again.\n\n${lines}`;
};

/**
 * A refused landing's line, its first sentence what failed: the step git was
 * on, from which machine, and a branch that moved before every push, or a
 * push the boundary cut off, when the state after it says so. Then git's
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
    rebase: `the rebase onto origin/${workspace.base}`,
    "push check": `the push check (git push --dry-run to ${target}, before any merge check)`,
    push: `the push to ${target}`,
    read: "reading the workspace's git",
  };
  let said = `${step[refusal.step]} on ${machine} failed`;
  if (refusal.cause === "taken") {
    said = `${target} on origin was moved by someone other than the hub, so it was not replaced`;
  } else if (refusal.cause === "race") {
    said = `${target} moved on origin before each of the hub's ${refusal.tries} pushes, so every one was turned down as behind it`;
  } else if (refusal.cause === "cut-off") {
    said = `${step.push} was cut off, and ${target} does not hold the commits`;
  } else if (refusal.step === "push check") {
    said = `${step["push check"]} from ${machine} was refused, so no merge check ran`;
  } else if (refusal.step === "push") {
    said = `${step.push} was refused`;
  }
  return `${head}: ${said}.${fenced(refusal.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${handle(workspace.id)}.`;
};

/**
 * Why a finished item that passed its landing gate fails, when it does: the
 * landing's line (its first sentence the step that failed), or, once it
 * landed, the line on the outputs that did not arrive.
 */
const failureOf = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string }
): string | undefined => {
  if (landing.kind !== "done") {
    return landing.line;
  }
  return collected.ok ? undefined : collected.line.trim();
};

/**
 * The landing gate's section of a report: its lines under their heading;
 * nothing for a landing with no gate.
 */
const gateSection = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>
): string => {
  const lines = landingGateLines(landing);
  return lines ? `\n\n${workWords.gateHeading}\n${lines}` : "";
};

/**
 * A finished item's report to its parent: what it said it did (its own
 * report, quoting what it ran), the landing gate's lines, how it landed and
 * its outputs, then `tail` (commits, diffstat, findings). A failure leads
 * it, so the parent reads why before what.
 */
const finishedReport = (
  summary: string,
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
  tail: string
): string => {
  const failure = failureOf(landing, collected);
  const head = `${summary}${gateSection(landing)}`;
  if (!failure) {
    return `${head}\n\n${landing.line}${collected.line}${tail}`;
  }
  const landed = landing.kind === "done" ? `\n\n${landing.line}` : "";
  return `${failure}\n\n${head}${landed}${tail}`;
};

/**
 * What `finish_item` answers once a landing ended its item: done, or failed
 * because it could not land or its outputs did not arrive. `gateSaid` is the
 * landing gate's lines, `held` the words on a group's held report.
 */
const landedText = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
  gateSaid: string,
  held: string
): { done: boolean; text: string } => {
  if (landing.kind !== "done") {
    return {
      done: false,
      text: `The work could not land. ${landing.line}\n\nThe item has failed and your parent has the details. End your turn.`,
    };
  }
  return collected.ok
    ? {
        done: true,
        text: `${landing.line}${collected.line}${gateSaid}\n\nThe item is done${held}. End your turn.`,
      }
    : {
        done: false,
        text: `${landing.line} But the outputs did not arrive.${collected.line}\n\nThe item has failed and your parent has the details. End your turn.`,
      };
};

/** A push to an item's own branch that did not happen, as its landing. */
const unpushed = (
  pushed: Exclude<BranchOutcome, { kind: "pushed" | "stopped" }>,
  workspace: WorkspaceRow,
  branch: string,
  lands: LandsMode,
  machine: string,
  gate: GateRun
): Landed => {
  switch (pushed.kind) {
    case "dirty":
      return { kind: "retry", text: dirtyText(pushed.files, branch) };
    case "nothing":
      return {
        kind: "done",
        gate,
        line: `Nothing to push: ${workspace.base} already holds every commit in this workspace${lands === "pr" ? ", so no pull request was opened" : ""}.`,
      };
    case "no-remote":
      return {
        kind: "done",
        gate,
        line: "Not pushed: this workspace's repository has no remote.",
      };
    case "refused":
      return {
        kind: "refused",
        gate,
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
  placeTaken,
  awaitsSend,
  beforeCut,
  call,
  command,
  custodyPending,
  db,
  designHeld,
  designHold,
  end,
  finishOver,
  hubMachineId,
  itemEnded,
  lifetime,
  pauses,
  placeAhead,
  planSteps,
  publish,
  reclaimUnread,
  recutDone,
  recutFailed,
  recutKept,
  report: reportTo,
  resolveHanded,
  inputRefusal,
  inTurn,
  between,
  missingFor,
  unblocked,
  leadPlace,
  leadTurn,
  machineFree,
  machinePaused,
  modelRefusal,
  online,
  stalled,
  send,
  sendWakes,
  sessionUrl,
  spawn,
  spawnedUnder,
  stageRuns,
  taskTitle,
  tellYou,
  todos,
  types,
  untellYou,
  workspaceChanged,
}: WorkItemDeps) => {
  /**
   * THE HELD STOP: once a stop of an item's session is asked (its
   * `stoppingAt`, tree-stops.ts), nothing reports for the item until its
   * machine confirmed the session ended and the stop gave the item its final
   * state ({@link finish} with `stopped`). The workflow engine held a step's
   * stop the same way (156e913bb): a stop not yet confirmed is a session that
   * may still run, and a report, a retry or a failure filed meanwhile was
   * read as the work's outcome while it went on.
   */
  const report: WorkItemDeps["report"] = (row, body, ...rest) => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    if (item?.stoppingAt && LIVE.has(item.state)) {
      console.log(
        `[work-items] ${item.id}: a report held while its stop waits on its machine: ${firstLine(body)}`
      );
      return;
    }
    reportTo(row, body, ...rest);
  };
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
  /**
   * Waits whose declaring turn ended. From then on a tool call of the
   * session's own ends the wait ({@link restsInWait} says which are not);
   * a turn a word to it started (a proposal's answer, a verifier's findings,
   * a delegate's report, a handoff) leaves it on, so that turn ends as a
   * waiting turn and counts toward no quiet-turn failure. Before
   * 2026-10-17 any busy transition ended it, and a builder waiting on two
   * proposal answers failed on the quiet turns that followed the first.
   */
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
  /** Items whose landing this hub process is running now: a resume leaves them to that run. */
  const finishing = new Set<string>();
  /**
   * Whether `item`'s landing holds its reopeners' sends: one that runs, not
   * one completing, which waits on its own delegates and may be written to
   * meanwhile ({@link completeIfDrained}).
   */
  const landingHolds = (item: WorkItemRow): boolean =>
    !!item.landingSince && item.landingPhase !== "completing";
  /**
   * The {@link finishingFor} hold on `item` ends if nothing keeps it: not
   * its landing, and not its session's last turn (`lastTurnAt`, stored),
   * unless `turnOver` (that turn has ended) or the item is live (a gate
   * sent it back, and the turn goes on). What the hold kept goes now.
   */
  const closeTurn = (item: WorkItemRow, turnOver: boolean): void => {
    const now = db.workItem(item.id) ?? item;
    if (landingHolds(now)) {
      if (turnOver && now.lastTurnAt) {
        update(item.id, { lastTurnAt: null });
      }
      return;
    }
    const [row] = db.getInstancesByIds([now.instanceId]);
    if (
      !(turnOver || LIVE.has(now.state)) &&
      now.lastTurnAt &&
      row &&
      inTurn(row)
    ) {
      return;
    }
    if (now.lastTurnAt) {
      update(item.id, { lastTurnAt: null });
    }
    finishOver(now.instanceId);
  };
  /**
   * After a hub restart, at `machineId`'s register: each item whose
   * session's `finish_item` turn the hub that stopped never heard end
   * (`lastTurnAt`, stored) is released once its machine says the session is
   * between turns ({@link closeTurn}), and what that hold kept goes. One
   * still in its turn is released at that turn's end ({@link
   * WorkItems.turnOver}).
   */
  const releaseLastTurns = (machineId: string): void => {
    for (const item of db.lastTurnWorkItems()) {
      const [row] = db.getInstancesByIds([item.instanceId]);
      if (row?.machineId !== machineId) {
        continue;
      }
      between(row)
        .then((idle) => {
          if (idle && db.workItem(item.id)?.lastTurnAt) {
            console.log(
              `[work-items] ${item.id}: the turn that called finish_item ended while the hub was away; what waited on it goes`
            );
            closeTurn(item, true);
          }
        })
        .catch((error: unknown) =>
          console.warn(
            `[work-items] ${item.id}: whether its finish_item turn ended was not read: ${error instanceof Error ? error.message : String(error)}`
          )
        );
    }
  };
  /**
   * `item`'s session called `finish_item`, and the call ends its turn: from
   * here its reopeners' sends wait at the hub ({@link finishingFor}), the
   * hold stored on the row (`lastTurnAt`) so a hub restart keeps it, and
   * what its harness holds of theirs unread is taken back to wait with them
   * ({@link WorkItemDeps.reclaimUnread}).
   */
  const lastTurn = async (item: WorkItemRow): Promise<void> => {
    update(item.id, { lastTurnAt: new Date() });
    await reclaimUnread(item.instanceId);
  };
  /**
   * Each landing this hub process runs, by item: aborted as its item ends
   * ({@link finish}), which cancels every command the landing has running,
   * its gate's steps on every machine included, through the runner that
   * started each (server.ts `runOnMachine`, `how.stop`). Before 2026-10-18 a
   * stop ended a landing only at its next turn or push: three stopped items'
   * iOS steps waited on in the Mac's queue, one for 1 h 22 m.
   */
  const landingStops = new Map<string, AbortController>();
  /**
   * Items whose landing waits for something now: what its status says, and
   * since when. In memory: a hub that starts says it again as the landing
   * it resumes waits ({@link resumeLandings}).
   */
  const landingWaits = new Map<string, { words: string; since: number }>();
  /**
   * The gate commands that passed for a live item, by what they passed on
   * ({@link passKey}: the whole tree, or the trees of the paths a step
   * declares), as its row keeps them (`gatePasses`): one command runs at
   * most once on one such key ({@link gateOnce}), a hub restart included.
   */
  const passesOf = (itemId: string): Map<string, GatePass[]> =>
    new Map(Object.entries(db.workItem(itemId)?.gatePasses ?? {}));
  /** `pass` kept on `item`'s row under `key`, as its step passes. */
  const keepPass = (itemId: string, key: string, pass: GatePass): void => {
    const kept = db.workItem(itemId)?.gatePasses ?? {};
    update(itemId, {
      gatePasses: { ...kept, [key]: [...(kept[key] ?? []), pass] },
    });
  };
  /** The passes `taken` let go of: their run's workspace moved while it ran. */
  const dropPasses = (
    itemId: string,
    taken: readonly { key: string; pass: GatePass }[]
  ): void => {
    const kept = { ...(db.workItem(itemId)?.gatePasses ?? {}) };
    for (const { key, pass } of taken) {
      kept[key] = (kept[key] ?? []).filter(
        (each) => !(each.command === pass.command && each.stage === pass.stage)
      );
    }
    update(itemId, { gatePasses: kept });
  };
  /** Where `item`'s landing stands now ({@link LandingPhase}), stored as it moves there. */
  const landingAt = (item: WorkItemRow, phase: LandingPhase): void => {
    if (db.workItem(item.id)?.landingPhase !== phase) {
      update(item.id, { landingPhase: phase });
    }
  };
  /**
   * What an item's landing waits for, as its status says it (WorkItemSummary
   * `checkQueue`): a shared slot ("queued for …"), its machine's pause
   * ("waiting: Omars-MacBook-Pro is paused until 00:57"), another command in
   * its folder, its gate on top of the branch ("gating on top of main: the
   * step “iOS build compiles” is waiting: Omars-MacBook-Pro is paused until
   * 00:57", {@link stepWaitWords}), or its turn
   * to land ("queued to land on main behind …"); null once it waits no more.
   * Every wait between `finish_item` and the item's
   * outcome comes here: before 2026-10-16 only a step's own slot and pause
   * waits did, and items queued to land sat with nothing said.
   */
  const landingWait = (itemId: string, words: string | null): void => {
    if (words) {
      landingWaits.set(itemId, {
        words,
        since: landingWaits.get(itemId)?.since ?? Date.now(),
      });
    } else if (!landingWaits.delete(itemId)) {
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
    asked: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow | undefined => {
    // A landing that stops leaves no phase of it behind.
    const change =
      asked.landingSince === null ? { ...asked, landingPhase: null } : asked;
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
        soon(() => afterEnd(after));
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
  /**
   * THE declared wait of a live item: `minutes` from now, for `reason`. The
   * turn that ends with it is a waiting turn ({@link waitingTurn}), and its
   * session is woken when it ends ({@link endWait}). wait_item declares one,
   * and so does the gate, for an item no capable machine is online for.
   */
  const declareWait = (
    item: WorkItemRow,
    minutes: number,
    reason: string
  ): WorkItemRow => {
    clearWait(item);
    const waitUntil = new Date(Date.now() + minutes * 60_000);
    const waiting = update(item.id, {
      state: "running",
      waitUntil,
      waitReason: reason,
      waitHistory: {
        count: ((db.workItem(item.id) ?? item).waitHistory?.count ?? 0) + 1,
        until: waitUntil.getTime(),
        reason,
      },
    }) as WorkItemRow;
    armWait(waiting);
    return waiting;
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
    isHubParent(item.parentInstanceId)
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
    return workspace ? boundaryOf(workspace) : leadPlace(row);
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
    leadInstanceId: isHubParent(item.parentInstanceId)
      ? null
      : (projectLead(item.projectId, item.instanceId, item.parentInstanceId)
          ?.id ?? null),
    instanceId: item.instanceId,
    title: item.title,
    state: item.state,
    machinePaused: LIVE.has(item.state)
      ? (pausedWorkspace(item.workspaceId) ?? null)
      : null,
    stalled: LIVE.has(item.state) ? (stalled(item.instanceId) ?? null) : null,
    queued: null,
    createdAt: item.createdAt.getTime(),
    endedAt: item.endedAt?.getTime() ?? null,
    dismissedAt: item.dismissedAt?.getTime() ?? null,
    dismissReason: item.dismissReason,
    replacedBy: item.replacedBy,
    waitUntil: item.waitUntil?.getTime() ?? null,
    waitReason: item.waitReason,
    checkQueue: landingWaits.get(item.id) ?? null,
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
      stalled: null,
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
   * delegated work's do (a work item). A session another session started with `start_session`
   * nests under it and reports to no one, its asks the person's; a
   * routine's run reports to nobody either, as its routine reads how it
   * ended, and a run that answers NO_REPLY must wake no model, the lead's
   * included.
   */
  const reportsBack = (row: InstanceRow): boolean =>
    !isHubParent(row.parentInstanceId) && !!row.workItemId;

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
   * told, and its session is ended. An item whose landing is running is left
   * to it.
   */
  const enforceBudget = (item: WorkItemRow): void => {
    if (!(item.budget && LIVE.has(item.state)) || landingHolds(item)) {
      return;
    }
    const reason = overBudget(item.budget, usedBy(item));
    if (!reason) {
      return;
    }
    const [row] = db.getInstancesByIds([item.instanceId]);
    const ended = finish(item, { state: "failed", error: reason });
    console.log(`[work-items] ${item.id}: ${reason}`);
    if (row) {
      report(row, `${reason}${reportLine(ended)}`, ended.state === "failed");
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
    const ended = finish(item, { state: "failed", error: reason });
    console.log(`[work-items] ${item.id}: its session failed: ${reason}`);
    report(row, `${reason}${reportLine(ended)}`, ended.state === "failed");
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
   * discard can take the row. An item whose landing this hub runs now is left
   * to that run; one whose session still has a row and whose landing a
   * stopped hub left running is its landing's to settle ({@link resumeLandings}).
   * `only` limits the read to those sessions: the ones whose rows just moved
   * (server.ts, off the database's change log of `instances`); without it,
   * every live item (the sweep, which reads what a hub before this one wrote).
   */
  /**
   * Whether {@link followSessions} leaves a live item as it is: its session
   * moved on to another item, its landing runs, or THE CUSTODY WAIT: while
   * its machine's reconnect has not decided whether the session's process is
   * still there, nothing fails or reports the item, and the next look after
   * the decision follows it ({@link WorkItemDeps.custodyPending}).
   */
  const leftToFollow = (
    item: WorkItemRow,
    row: InstanceRow | undefined
  ): boolean =>
    (!!row && (row.workItemId !== item.id || !!item.landingSince)) ||
    custodyPending(row?.machineId ?? standIn(item).machineId, item.instanceId);

  const followSessions = (only?: ReadonlySet<string>): void => {
    const live = db
      .liveWorkItems()
      .filter(
        (item) =>
          (!only || only.has(item.instanceId)) &&
          !finishing.has(item.id) &&
          !item.stoppingAt
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
      if (leftToFollow(item, row)) {
        continue;
      }
      if (row) {
        if (row.status === "error") {
          sessionFailed(row, row.lastError ?? SESSION_FAILED_UNSAID);
        }
        continue;
      }
      quiet.delete(item.id);
      const ended = finish(item, {
        state: "failed",
        error: SESSION_GONE,
        landingSince: null,
        submission: null,
      });
      const failed = ended.state === "failed";
      console.log(`[work-items] ${item.id}: ${SESSION_GONE}`);
      report(
        standIn(item),
        `${failed ? `${item.title} failed` : `${item.title}'s follow-up ended; its landed work stays`}: ${SESSION_GONE}. The hub has no row for its session ${item.instanceId.slice(0, 8)} any more, so nothing can run it or call finish_item. Delegate the work again if it is still needed.\n\n[Work item ${handle(ended.id)} is ${ended.state} in workspace ${handle(ended.workspaceId)}.]`,
        failed
      );
    }
  };

  /**
   * Whether the sweep leaves a live item's session as it is: it has a
   * process, or something holds the item on purpose or will move it anyway.
   * An interrupt's hold (`heldAt`, until its parent or the reader writes); a
   * paused machine under its workspace; a declared wait; a landing in flight
   * (here, or left by a hub before this one); a session that has moved on to
   * another item; a machine that is not connected (it settles its sessions
   * when it registers); a send on its way to the session, which is its next
   * turn (a cut turn's hand-back included).
   */
  const leftAsleep = (item: WorkItemRow, row: InstanceRow): boolean =>
    !(row.status === "sleeping" || GONE.has(row.status)) ||
    item.heldAt !== null ||
    item.blocked !== null ||
    item.stoppingAt !== null ||
    custodyPending(row.machineId, row.id) ||
    pausedWorkspace(item.workspaceId) !== undefined ||
    !!(item.waitUntil || item.waitResumeBy) ||
    !!item.landingSince ||
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

  /**
   * An item whose session has slept past {@link asleepLimit} is held, not
   * failed: the sweep no longer wakes it, nothing the hub sends on its own
   * does ({@link heldFor}), and you are told in Needs you. Its parent's, its
   * lead's or your word to it carries the work on ({@link unhold}).
   * 2026-10-23, obelisk: items from September asleep for weeks were woken
   * at every sweep after each turn.
   */
  const blockAsleep = (
    item: WorkItemRow,
    row: InstanceRow,
    since: number,
    limit: { ms: number; words: string }
  ): void => {
    quiet.delete(item.id);
    woken.delete(item.id);
    // Stored, not kept in memory: the word that ends the hold takes the
    // notice down after a hub restart too (`unhold`).
    const now = new Date();
    update(item.id, { heldAt: now, heldAsleepAt: now });
    const why = workWords.heldAsleep(
      `${new Date(since).toISOString().slice(0, 16).replace("T", " ")} UTC`,
      limit.words
    );
    console.log(`[work-items] ${item.id}: held: ${why}`);
    tellYou(row, workWords.blockedTitle(item.title), why);
  };

  /** {@link wakeAsleep} for one item: its session woken, held when it slept past its limit, or the item failed with why. */
  const wakeOrFail = (item: WorkItemRow, row: InstanceRow): void => {
    const refused = asleepRefusal(item, row);
    if (refused) {
      sessionFailed(row, refused);
      return;
    }
    const since = Math.max(timeOf(row.updatedAt), timeOf(row.turnEndedAt));
    const limit = asleepLimit(item);
    if (since > 0 && Date.now() - since > limit.ms) {
      blockAsleep(item, row, since, limit);
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
            content: `${STILL_OPEN} ${FINISH_LINE}`,
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
      return `Its session was asleep with its work item open, and its workspace ${handle(item.workspaceId)} is ${workspace?.state ?? "gone"}: there is nowhere for it to carry on.`;
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
   * THE RULE FOR A BLOCKED ITEM: a live item whose session is to be started
   * again (a wake for a send, a restart's resume) while its delegate type,
   * its machine or its account is missing ({@link WorkItemDeps.missingFor})
   * is blocked, the reason stored on its row and told you in Needs you
   * (`tellYou`), never failed for it; what it is sent waits at the hub (server.ts
   * `deliverToSession`). Answers the block, or nothing when nothing is
   * missing, which ends a block it had ({@link unblock}).
   */
  const blockIfMissing = (row: InstanceRow): ItemBlock | undefined => {
    const item = itemOf(row);
    if (!(item && LIVE.has(item.state))) {
      return;
    }
    const missing = missingFor(row);
    if (!missing) {
      if (item.blocked) {
        unblock(item);
      }
      return;
    }
    if (
      item.blocked?.kind === missing.kind &&
      item.blocked.name === missing.name
    ) {
      return item.blocked;
    }
    const block: ItemBlock = { ...missing, since: Date.now() };
    update(item.id, { blocked: block });
    console.log(`[work-items] ${item.id} is blocked: ${blockWords(block)}`);
    // It stands until the block clears, whatever you write to the item
    // (fleet-watch.ts `humanSend`).
    tellYou(row, workWords.blockedTitle(item.title), blockWords(block));
    return block;
  };

  /** `item`'s block is over: its row says so, and what waited for it goes. */
  const unblock = (item: WorkItemRow): void => {
    update(item.id, { blocked: null });
    untellYou(item.instanceId);
    console.log(
      `[work-items] ${item.id}: no longer blocked; what it was sent goes now`
    );
    unblocked(item.instanceId);
  };

  /**
   * Each blocked live item whose missing type, machine or account is back
   * goes on, at the sweep ({@link BUDGET_SWEEP_MS}): the release rule of a
   * block.
   */
  const unblockReady = (): void => {
    for (const item of db.liveWorkItems()) {
      if (!item.blocked) {
        continue;
      }
      const [row] = db.getInstancesByIds([item.instanceId]);
      if (row && !missingFor(row)) {
        unblock(item);
      }
    }
  };

  /**
   * Whether someone will hear how an item ends, so waking its work is worth
   * it: its routine (which reads its run's end, routines.ts), its project's
   * Caw while he is off (his thread notes the end, caw.ts `itemEnded`), or a
   * reportee that can still take a turn: running, starting, or asleep on a
   * conversation of its own.
   */
  const heard = (item: WorkItemRow, row: InstanceRow): boolean =>
    isHubParent(item.parentInstanceId) ||
    cawOff(item) === item.parentInstanceId ||
    reportees(row).some(
      (reportee) =>
        reportee.status === "running" ||
        reportee.status === "starting" ||
        (reportee.status === "sleeping" && reportee.sessionId !== null)
    );

  lifetime.every(BUDGET_SWEEP_MS, () => {
    for (const item of db.liveWorkItems()) {
      if (item.budget && !item.stoppingAt) {
        enforceBudget(item);
      }
    }
    followSessions();
    unblockReady();
    wakeAsleep();
    wakeCapable();
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
   * carries (`[td-3] …`), and each open proposed to-do whose words one
   * without an id has: a step left open when the attempt ended once
   * ({@link proposeLeftovers}) and completed after it went on. One read of
   * the ledger and, when something is to tick, one commit.
   */
  const syncPlan = async (item: WorkItemRow): Promise<void> => {
    const task = taskOf(item);
    const plan = task ? await planFor(item) : undefined;
    if (!(task && todos && plan?.length)) {
      return;
    }
    const done = plan.filter((entry) => entry.status === "completed");
    const completed = new Set(
      done
        .map((entry) => PLAN_TODO.exec(entry.content)?.[1])
        .filter((id): id is string => id !== undefined)
    );
    const said = new Set(
      done
        .filter((entry) => !PLAN_TODO.test(entry.content))
        .map((entry) => planWords(entry.content))
    );
    if (completed.size === 0 && said.size === 0) {
      return;
    }
    const open = (await todos.read(task.projectId, task.taskId)).filter(
      (todo) =>
        !todo.done &&
        todo.id &&
        (completed.has(todo.id) ||
          (todo.proposed && said.has(planWords(todo.text))))
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
        planWords(todo.text)
      )
    );
    const left = plan
      .filter(
        (entry) =>
          entry.status !== "completed" && !PLAN_TODO.test(entry.content)
      )
      .map((entry) => entry.content.replace(RUNS_OF_SPACE, " ").trim())
      .filter((text) => text && !known.has(planWords(text)))
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
      )}\n\nTick each one you finished with todo_write, and say in your summary why each other one stays open. Then call finish_item again: the next call runs the merge checks whatever is ticked.`;
  };

  /** What follows an item's end, off the step that ended it. */
  const afterEnd = (item: WorkItemRow): void => {
    settleGroup(item);
    // The item that delegated it may be completing on its group's end.
    const [owner] = db.getInstancesByIds([item.parentInstanceId]);
    const owning = owner ? itemOf(owner) : undefined;
    if (owning) {
      completeIfDrained(owning);
    }
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
    // The item that queued it may be completing on its group's end.
    const [owner] = db.getInstancesByIds([queued.parentInstanceId]);
    const owning = owner ? itemOf(owner) : undefined;
    if (owning) {
      completeIfDrained(owning);
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
   * The commits of workspace `id` whose work is on its base branch through a
   * workspace cut `from` it that landed them ({@link vouchLanded}): what its
   * archive does not count as its own (core `WorkspaceArchive.landed`).
   */
  const landedFrom = (id: string): string[] =>
    db
      .workspacesCutFrom(id)
      .flatMap((cut) => (cut.cutFrom?.landed ? [cut.cutFrom.commit] : []));

  /**
   * Tells the session that started a workspace's work, its latest item's
   * parent, that the workspace was just held, through its report path as a
   * notice: what it holds, and the two ways on. Only that session decides
   * held work; nobody else is asked (2026-10-18: 38 held workspaces sat in
   * the owner's list, every one his to sort).
   */
  const heldNotice = (workspace: WorkspaceRow, work: HeldWork): void => {
    const [latest] = db.workItemsIn(workspace.id);
    const [row] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
    if (!(latest && row)) {
      return;
    }
    const named = work.excluded?.length
      ? ` Kept out of git by its own excludes: ${work.excluded.join(", ")}.`
      : "";
    report(
      row,
      `Workspace ${handle(workspace.id)} of “${latest.title}” on ${work.machine} holds ${work.holds} (${work.size} at ${workspace.path}) that is nowhere else, so it was kept, not retired.${named} It is yours to decide: continue it (delegate with workspace: "${handle(workspace.id)}", or with from: "${handle(workspace.id)}" for a fresh delegate on its commits), or discard it (discard_workspace with workspace: "${handle(workspace.id)}"), which saves that work to a carry in ~/.cawco/carries on ${work.machine} and removes the clone.`,
      false,
      true,
      `Workspace ${workspace.id.slice(0, 8)} holds ${work.holds}: continue it or discard it.`
    );
  };

  /**
   * Where an archived workspace is cut again, as its row keeps it: where its
   * machine said its HEAD was. A discard's carry is let go of, and its clone
   * is cut again nowhere; a retirement's carry (`retired`, its items landing
   * none) is cut again with its commits ({@link recut}).
   */
  const cutAgainAt = (
    head: WorkspaceCut | undefined,
    carry: string | null,
    retired: boolean
  ): WorkspaceCut | null => {
    if (!head) {
      return null;
    }
    if (!carry) {
      return head;
    }
    return retired ? { ...head, carry } : null;
  };

  /**
   * Whether a settled workspace's work goes to a carry rather than holding
   * it: every item of it lands none (what it hands in are its outputs,
   * copied out as it finished; its commits feed nothing), and its latest
   * ended on its own, done or failed. One its parent, the person or the hub
   * stopped is the stopper's to decide, and is held. On 2026-10-23 drawings,
   * decision pages and research reads sat held with 1 to 4 commits each,
   * their deliverables long since handed in.
   */
  const carriesOff = (items: readonly WorkItemRow[]): boolean => {
    const [latest] = items;
    return (
      latest !== undefined &&
      latest.state !== "cancelled" &&
      latest.stoppedBy === null &&
      items.every((item) => item.lands === "none")
    );
  };

  /**
   * Tells the session that started a workspace's work, its latest item's
   * parent, as a notice, that the workspace retired with its commits in a
   * carry ({@link carriesOff}): where that carry is, and that a handoff or
   * follow-up cuts the clone again with them ({@link recut}).
   */
  const carryNotice = (workspace: WorkspaceRow, carry: string): void => {
    const [latest] = db.workItemsIn(workspace.id);
    const [row] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
    if (!(latest && row)) {
      return;
    }
    const machine = machineName(workspace.machineId);
    report(
      row,
      workWords.carriedNotice(
        handle(workspace.id),
        latest.title,
        carry,
        machine,
        workspace.path
      ),
      false,
      true,
      workWords.carriedHeadline(workspace.id.slice(0, 8), carry, machine)
    );
  };

  /**
   * A workspace closed on its machine ({@link CONTROL_WORKSPACE_ARCHIVE}):
   * its boundary killed first and never started, then what it holds that is
   * nowhere else read on the host, and done with as `unlanded` says
   * ({@link WorkspaceUnlanded}), or with `discard` saved to a carry first
   * ({@link CONTROL_WORKSPACE_DISCARD}, which an agent that cannot write
   * one refuses), and so with `carry` (its items land none,
   * {@link carriesOff}), whose carry it is cut again with; `skip`, its
   * items' handed-over outputs. The commits its
   * `from` cuts landed are not its own ({@link landedFrom}). Archived, its
   * places go with it and its row says so, with the carry and where its
   * clone's HEAD was ({@link recut} cuts it again there); holding work (only
   * a `keep` answers so) its row is held with what it holds, its clone and
   * places standing, and the session that started its work is told
   * ({@link heldNotice}) as it becomes held.
   */
  const closeWorkspace = async (
    workspace: WorkspaceRow,
    unlanded: WorkspaceUnlanded | "discard" | "carry",
    skip: string[] = []
  ): Promise<ArchivedWorkspace> => {
    const discard = unlanded === "discard" || unlanded === "carry";
    const landed = landedFrom(workspace.id);
    const request: WorkspaceArchive = {
      ...refOf(workspace),
      base: workspace.base,
      unlanded: discard ? "keep" : unlanded,
      skip,
      ...(landed.length > 0 ? { landed } : {}),
    };
    const { carry, head, held } = (await call(
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
        `[workspaces] ${workspace.id} on ${work.machine}: held, ${work.holds} (${work.size} at ${workspace.path}); the session that started its work continues it or discards it`
      );
      if (workspace.state !== "held") {
        heldNotice(workspace, work);
      }
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
        head: cutAgainAt(head, carry, unlanded === "carry"),
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

  /** Sessions whose kept sends wait for their workspace's turn and cut ({@link recutFor}): one wait each. */
  const recutWaits = new Set<string>();

  /** Items whose session's continuation is being prepared, by count: their workspace is held ({@link holdOn}). */
  const continuing = new Map<string, number>();

  /** A continuation's stages before it settles: its job still reads or starts in the clone. */
  const CONTINUING = new Set(["filing", "summarising", "starting"]);

  /**
   * What the sessions of a workspace's ended items hold it by ({@link holdOn}):
   * a process that may still run there, a message on its way to one, or a
   * continuation of one being prepared or under way.
   */
  const sessionsHold = (items: readonly WorkItemRow[]): string | undefined => {
    const sessions = new Set(items.map((item) => item.instanceId));
    const rows = db.getInstancesByIds([...sessions]);
    const attached = rows.find((row) => ATTACHED.has(row.status));
    if (attached) {
      return `its session ${attached.id} is ${attached.status === "stopping" ? "stopping" : "attached"}`;
    }
    const awaited = rows.find((row) => sendWakes(row.id));
    if (awaited) {
      return `a message to its session ${awaited.id} is on its way`;
    }
    const prepared = items.find((item) => continuing.has(item.id));
    const job = db
      .continuationRows()
      .find(
        (row) => CONTINUING.has(row.stage) && sessions.has(row.sourceInstanceId)
      );
    if (prepared || job) {
      return `a continuation of its session ${job?.sourceInstanceId ?? prepared?.instanceId} is under way`;
    }
  };

  /** A workspace's clone and its scratch dir (its commands' `TMPDIR`, which goes with it). */
  const rootsOf = (workspace: WorkspaceRow): string[] => [
    workspace.path,
    ...(workspace.tmp ? [workspace.tmp] : []),
  ];

  /**
   * The artifacts, any session's, showing what a workspace serves (db
   * artifacts.ts `previewing`: a port preview naming it, a folder preview
   * inside its clone or scratch dir), in words, or nothing. On 2026-10-15 a
   * workspace was retired while it served the owner's two open previews.
   * Only retirement waits for them ({@link holdOn}); an explicit archive ends
   * their served servers, and their rows stay, reading as a workspace that
   * isn't running.
   */
  const previewedBy = (workspace: WorkspaceRow): string | undefined => {
    const shown = [
      ...new Set(
        rootsOf(workspace).flatMap((path) =>
          db.artifacts
            .previewing({
              id: workspace.id,
              machineId: workspace.machineId,
              path,
            })
            .map((one) => one.name)
        )
      ),
    ];
    if (shown.length > 0) {
      return `${shown.length === 1 ? "the artifact" : "the artifacts"} ${shown.join(", ")} ${shown.length === 1 ? "shows" : "show"} what it serves`;
    }
  };

  /**
   * The projects' places inside a workspace's clone or its scratch dir, other
   * than the workspace's own, in words, or nothing. On 2026-10-17 one was
   * retired with two live test projects' folders in its scratch dir, and they
   * went with it.
   */
  const placesIn = (workspace: WorkspaceRow): string | undefined => {
    const roots = rootsOf(workspace);
    const inside = (path: string): boolean =>
      roots.some((root) => path === root || path.startsWith(`${root}/`));
    const places = db
      .listProjects()
      .flatMap((project) =>
        project.places
          .filter(
            (place) =>
              place.kind !== "workspace" &&
              place.machineId === workspace.machineId &&
              inside(place.path)
          )
          .map((place) => `${project.name} at ${place.path}`)
      );
    if (places.length > 0) {
      return `${places.length === 1 ? "a project's folder is" : "projects' folders are"} inside it: ${places.join(", ")}`;
    }
  };

  /**
   * What holds a workspace whose items have all ended, in words, or nothing:
   * the landing of one of its items still running (its run settles the
   * workspace again as it ends, {@link settleLanding}), a session of its
   * items whose process may still run there (one asleep, stopped or failed
   * has none), a message on its way that wakes one of those sessions there,
   * a continuation of one of them being prepared or under way (it reads the
   * clone and its new session starts there, taking the item on:
   * {@link sessionsHold}), an artifact previewing it ({@link previewedBy}),
   * or a project's folder inside it ({@link placesIn}). On
   * 2026-10-17 one was retired between the check that its clone was there
   * and a continuation's read of it (attach-continue, "could not read git …
   * ENOENT"). A hold defers
   * retirement until it goes, never cancels it.
   */
  const holdOn = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): string | undefined => {
    // A stopped item's landing runs on in the clone until its next turn or
    // push ends it (landing.ts `stopped`): closing the clone under it would
    // cut its commands off mid-rebase.
    const landing = items.find((item) => finishing.has(item.id));
    if (landing) {
      return `the landing of its item ${landing.id} still runs`;
    }
    const held = sessionsHold(items);
    if (held) {
      return held;
    }
    return previewedBy(workspace) ?? placesIn(workspace);
  };

  /** What one {@link settle} came to. */
  type Settled =
    | { kind: "retired"; carry: string | null }
    | { kind: "held"; held: HeldWork }
    | { kind: "deferred"; hold: string }
    | { kind: "failed"; reason: string }
    | { kind: "none" };

  /**
   * A place's stage clone filed as its machine says it is cut and in step
   * (core `StageCloneFrame`): a new row of the stage kind, or one archived or
   * held made active again (a sheet after it retired cut it again, or it is
   * in use again). `createdBy` is a session working in the place.
   */
  const fileStage = (
    machineId: string,
    frame: StageCloneFrame,
    createdBy: string
  ): void => {
    const [row] = db.workspacesNamed(frame.id);
    if (!row) {
      const path = cutPath(machineId, frame.path);
      const filed = db.createWorkspace({
        id: frame.id,
        machineId,
        repoRoot: cutPath(machineId, frame.repoRoot),
        path,
        // Detached at the checkout's HEAD: no branch of its own, nothing it lands.
        branch: "",
        base: "",
        tmp: frame.tmp,
        state: "active",
        createdByInstanceId: createdBy,
        stageFor: frame.place,
      });
      console.log(
        `[workspaces] ${filed.id} on ${machineName(machineId)}: filed, the stage clone of place ${frame.place} at ${path}`
      );
      placesChanged(machineId);
      workspaceChanged?.(filed);
      return;
    }
    if (row.state === "active") {
      return;
    }
    const active =
      db.updateWorkspace(row.id, {
        state: "active",
        holding: null,
        heldAt: null,
        head: null,
        tmp: frame.tmp,
      }) ?? row;
    console.log(
      `[workspaces] ${row.id} on ${machineName(machineId)}: active again, the stage clone of place ${frame.place} at ${row.path}`
    );
    workspaceChanged?.(active);
  };

  /**
   * Whether an active workspace is one to settle now: its items have all
   * ended, or it is a stage clone, which has none (its place's sheet stage
   * is what holds it).
   */
  const settlable = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): boolean =>
    (items.length > 0 || Boolean(workspace.stageFor)) &&
    !items.some((item) => LIVE.has(item.state));

  /** What holds a settlable workspace, in words: a stage clone's place's stage that runs, any other's {@link holdOn}. */
  const holdOf = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): string | undefined =>
    workspace.stageFor
      ? stageRuns?.(workspace.stageFor)
      : holdOn(workspace, items);

  /** The last failure each workspace's settle logged: one line per change, not per sweep. */
  const settleFailures = new Map<string, string>();

  /**
   * A settled workspace closed on its machine ({@link closeWorkspace}): a
   * `keep`, or a `carry` when its items land none ({@link carriesOff}),
   * whose parent is told where the carry is ({@link carryNotice}); retired,
   * its gate workspaces go with it.
   */
  const closeSettled = async (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): Promise<Settled> => {
    const closed = await closeWorkspace(
      workspace,
      carriesOff(items) ? "carry" : "keep",
      handedOver(workspace)
    );
    settleFailures.delete(workspace.id);
    workEndedFor.delete(workspace.id);
    workEndFailures.delete(workspace.id);
    if (closed.held) {
      return { kind: "held", held: closed.held };
    }
    if (closed.carry) {
      carryNotice(closed.workspace, closed.carry);
    }
    await Promise.all(
      db
        .checkWorkspacesOf(workspace.id)
        .map((check) => closeWorkspace(check, "check"))
    );
    console.log(
      `[workspaces] ${workspace.id} on ${machineName(workspace.machineId)}: retired, its work over and nothing of it anywhere but on its remote${closed.carry ? ` or in its carry ${closed.carry}` : ""}; ${workspace.path} and what it owned there are gone`
    );
    return { kind: "retired", carry: closed.carry };
  };

  /** The ended items, each with its end, whose sessions' work each workspace's settle last ended ({@link endLeftWork}): once per set, not per sweep. */
  const workEndedFor = new Map<string, string>();

  /** The last failure each workspace's {@link endLeftWork} logged: one line per change, not per sweep. */
  const workEndFailures = new Map<string, string>();

  /**
   * A WORKSPACE WHOSE ITEMS HAVE ALL ENDED RUNS NOTHING BUT WHAT A LANDING
   * RUNS OR AN ARTIFACT SHOWS. Settled while an awake session of its items is
   * all that holds it (`hold`, {@link sessionsHold}), its machine ends what
   * those sessions left running in its boundary (core
   * {@link CONTROL_WORKSPACE_WORK_END}: agent boundary.ts `endSessionWork`,
   * as an interrupt and a stop do), once per set of ended items; the
   * boundary and the sessions run on, so a handoff resumes one there. Not
   * while its landing runs (`finishing`), an artifact shows what it serves
   * ({@link previewedBy}: once the artifact goes, the next settle ends it),
   * a project's folder is inside it ({@link placesIn}), or a message or
   * continuation is on its way to one of its sessions (its new turn's work
   * is not left work). Why: a done delegate stays awake until it is at rest
   * (server.ts `sleepFinished` then puts it to sleep), or for its idle half
   * hour while its session is kept warm, and until it slept what its
   * commands left ran on; on 2026-10-24 its parent was told to end three
   * pids it left, already gone by the time it looked.
   */
  const endLeftWork = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[],
    hold: string
  ): void => {
    if (
      workspace.stageFor ||
      items.some((item) => finishing.has(item.id)) ||
      previewedBy(workspace) ||
      placesIn(workspace)
    ) {
      return;
    }
    const sessions = new Set(items.map((item) => item.instanceId));
    if (
      [...sessions].some((id) => sendWakes(id)) ||
      items.some((item) => continuing.has(item.id)) ||
      db
        .continuationRows()
        .some(
          (row) =>
            CONTINUING.has(row.stage) && sessions.has(row.sourceInstanceId)
        )
    ) {
      return;
    }
    const awake = db
      .getInstancesByIds([...sessions])
      .filter((row) => row.status === "running")
      .map((row) => row.id);
    const ended = items
      .map((item) => `${item.id}@${item.endedAt?.getTime() ?? 0}`)
      .sort()
      .join(" ");
    if (awake.length === 0 || workEndedFor.get(workspace.id) === ended) {
      return;
    }
    workEndedFor.set(workspace.id, ended);
    const machine = machineName(workspace.machineId);
    console.log(
      `[workspaces] ${workspace.id} on ${machine}: ${workWords.workEnding(awake, hold)}`
    );
    const asked: WorkspaceWorkEnd = { id: workspace.id, instanceIds: awake };
    detach(
      call(workspace.machineId, CONTROL_WORKSPACE_WORK_END, [asked]).then(
        () => {
          workEndFailures.delete(workspace.id);
        },
        (error: unknown) => {
          // Asked again at the next settle.
          if (workEndedFor.get(workspace.id) === ended) {
            workEndedFor.delete(workspace.id);
          }
          const reason = error instanceof Error ? error.message : String(error);
          if (workEndFailures.get(workspace.id) !== reason) {
            console.warn(
              `[workspaces] ${workspace.id} on ${machine}: ${workWords.workNotEnded(reason)}`
            );
          }
          workEndFailures.set(workspace.id, reason);
        }
      ),
      `end left work ${workspace.id}`
    );
  };

  /**
   * THE end of a workspace's life (schema.ts `WorkspaceState`). An active
   * delegate's workspace whose items have all ended is closed on its machine
   * ({@link closeWorkspace}, a `keep`) once nothing holds it ({@link holdOn}):
   * archived when its clone holds nothing that is nowhere else, held with
   * what it holds otherwise. A hold defers it to the event that ends the hold
   * (its session asleep or ended, the artifact gone), or the sweep's next
   * look (workspace-retire.ts); held only by its awake sessions, what they
   * left running there ends meanwhile ({@link endLeftWork}). Its sessions are
   * not ended: each is asleep or gone already, and a handoff to one goes on
   * in a clone cut again ({@link recut}). A gate workspace goes with its
   * source.
   */
  const settle = async (id: string): Promise<Settled> => {
    const [workspace] = db.workspacesNamed(id);
    // A host-scope row has no clone to close: nothing of it settles.
    if (
      workspace?.state !== "active" ||
      workspace.checksFor ||
      workspace.host
    ) {
      return { kind: "none" };
    }
    const items = db.workItemsIn(workspace.id);
    if (!settlable(workspace, items)) {
      return { kind: "none" };
    }
    const hold = holdOf(workspace, items);
    if (hold) {
      endLeftWork(workspace, items, hold);
      return { kind: "deferred", hold };
    }
    const machine = machineName(workspace.machineId);
    try {
      return await closeSettled(workspace, items);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (settleFailures.get(workspace.id) !== reason) {
        console.warn(
          `[workspaces] ${workspace.id} on ${machine}: ${workWords.notRetired(reason)}`
        );
      }
      settleFailures.set(workspace.id, reason);
      return { kind: "failed", reason };
    }
  };

  /** The last step queued in each workspace's turn ({@link inWorkspaceTurn}); it only resolves. */
  const workspaceTurns = new Map<string, Promise<void>>();

  /**
   * Runs `work` in workspace `id`'s turn: after every step queued before it,
   * before any queued after. A step is anything that closes the workspace's
   * boundary on its machine or reads its clone through it: its settle, its
   * archive, the bundle a `from` cut takes of it, a read of what it holds
   * on no remote ({@link unlandedOf}). On 2026-10-17 a read ran git through
   * a boundary that the workspace's settle was closing, and failed. A step
   * never takes its own workspace's turn again.
   */
  const inWorkspaceTurn = async <T>(
    id: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const before = workspaceTurns.get(id);
    const { promise: mine, resolve } = Promise.withResolvers<void>();
    workspaceTurns.set(id, mine);
    try {
      await before;
      return await work();
    } finally {
      resolve();
      if (workspaceTurns.get(id) === mine) {
        workspaceTurns.delete(id);
      }
    }
  };

  /** A settle queued in its workspace's turn and not yet begun: every caller meanwhile shares it. */
  const settleQueued = new Map<string, Promise<Settled>>();

  /**
   * THE way a workspace is settled ({@link settle}), in its turn: asked while
   * one runs, one more runs after it, shared by every caller asking before
   * it begins. The events, the sweep and a read of what the workspace holds
   * all come here. Never rejects.
   */
  const settleNow = (id: string): Promise<Settled> => {
    const queued = settleQueued.get(id);
    if (queued !== undefined) {
      return queued;
    }
    const run = inWorkspaceTurn(id, () => {
      settleQueued.delete(id);
      return settle(id);
    }).catch((error: unknown): Settled => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[workspaces] ${id}: its settle failed: ${reason}`);
      return { kind: "failed", reason };
    });
    settleQueued.set(id, run);
    return run;
  };

  /** {@link settleNow}, off the caller's step. */
  const settleSoon = (id: string): void => {
    soon(() => detach(settleNow(id), `settle ${id}`));
  };

  /**
   * Workspace `id` read again, off the caller's step and in its turn, now
   * that commits it held are on its base branch through a workspace cut from
   * it ({@link vouchLanded}): held, it is closed again with those left out
   * ({@link landedFrom}), and retires when they were all it held; active, its
   * settle reads it the same way.
   */
  const resettleSoon = (id: string): void => {
    const [workspace] = db.workspacesNamed(id);
    if (workspace?.state === "active") {
      settleSoon(id);
      return;
    }
    if (workspace?.state !== "held") {
      return;
    }
    const again = inWorkspaceTurn(id, async (): Promise<void> => {
      const [now] = db.workspacesNamed(id);
      if (now?.state !== "held") {
        return;
      }
      const closed = await closeWorkspace(now, "keep", handedOver(now));
      if (closed.held) {
        return;
      }
      await Promise.all(
        db
          .checkWorkspacesOf(now.id)
          .map((check) => closeWorkspace(check, "check"))
      );
      console.log(
        `[workspaces] ${now.id} on ${machineName(now.machineId)}: retired, its commits landed through the workspace cut from it and nothing else of it anywhere but on its remote`
      );
    });
    detach(again, `resettle ${id}`);
  };

  /**
   * What workspace `id` holds on no remote, in its turn
   * ({@link inWorkspaceTurn}), so no close of its boundary runs meanwhile.
   * Its settle comes first ({@link settle}): a workspace nothing holds any
   * more is closed there and read as the settle recorded it, held with what
   * it holds, or archived, holding nothing anywhere but its remote. Only one
   * something still holds (a live item, an attached session, a preview) is
   * read now, by git inside its boundary, which that hold keeps up; never
   * waiting (a paused machine or a busy folder throws {@link WouldWait}).
   * Undefined for one archived, gone, or a landing gate's. Throws the
   * machine's words when git cannot say.
   */
  const unlandedOf = (
    id: string
  ): Promise<Omit<Unlanded, "live"> | undefined> =>
    inWorkspaceTurn(id, async () => {
      await settle(id);
      const [workspace] = db.workspacesNamed(id);
      if (
        !workspace ||
        workspace.state === "archived" ||
        workspace.checksFor ||
        workspace.host
      ) {
        return;
      }
      if (isHeld(workspace)) {
        const { dirty, stashes, ahead } = workspace.holding;
        return { workspaceId: id, changed: dirty + stashes, ahead };
      }
      const skip = handedOver(workspace).map(
        (path) => ` ${quote(`:(exclude,literal)${path}`)}`
      );
      const lines = (name: string): string =>
        `{ [ -z "$${name}" ] || printf '%s\\n' "$${name}"; } | wc -l`;
      const read = await command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}a=$( ${ownCommitsShell(workspace.base || undefined, landedFrom(id))} ) && s=$(git status --porcelain${skip.length > 0 ? ` -- .${skip.join("")}` : ""}) && t=$(git stash list) && echo "$a" && ${lines("s")} && ${lines("t")}`,
        GIT_TIMEOUT_MS,
        refOf(workspace),
        { noWait: true }
      );
      const [ahead, dirty, stashes] = read.stdout
        .trim()
        .split(SPACES)
        .map(Number);
      if (
        read.exitCode !== 0 ||
        [ahead, dirty, stashes].some((count) => !Number.isInteger(count))
      ) {
        throw new Error(
          `git in workspace ${id} on ${machineName(workspace.machineId)} said: ${(read.stderr || read.stdout).trim() || `exit ${read.exitCode}`}`
        );
      }
      return {
        workspaceId: id,
        changed: (dirty as number) + (stashes as number),
        ahead: ahead as number,
      };
    });

  /** The `archive` method's work, in the workspace's turn: the workspace read as it stands then. */
  const archiveNow = async (
    needle: string,
    discard: boolean
  ): Promise<ArchivedWorkspace> => {
    const workspace = namedWorkspace(needle);
    if (workspace.state === "archived") {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} is already archived.`
      );
    }
    if (workspace.host) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path} on ${machineName(workspace.machineId)}, not a clone: there is nothing to archive or discard, and nothing was deleted.`
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
        `Workspace ${handle(workspace.id)} has a live work item: ${live.title} (${handle(live.id)}) is ${live.state}. Stop it before archiving the workspace.`
      );
    }
    // Even with `discard`: a discard lets go of the clone's own work, never
    // a project's folder there. A preview of it does not refuse: the archive
    // ends its served server ({@link previewedBy}).
    const places = placesIn(workspace);
    if (places) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} was not archived and nothing was deleted: ${places}. Delete or move that, then archive it again.`
      );
    }
    const skip = handedOver(workspace);
    // Bounded well inside the HTTP call's own idle timeout: a machine that
    // never confirms leaves the workspace active, and the answer says so.
    const stops = await Promise.allSettled(
      [
        ...new Set(db.workItemsIn(workspace.id).map((item) => item.instanceId)),
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
        `Workspace ${handle(workspace.id)} stays active: ${unconfirmed.join(" ")} Retry once its machine has ended it.`
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
    // Its gate workspaces on other machines go with it: none outlives it.
    await Promise.all(
      db
        .checkWorkspacesOf(workspace.id)
        .map((check) => closeWorkspace(check, "check"))
    );
    return closed;
  };

  /**
   * Whether a workspace is retired and may be cut again: archived, not a
   * gate workspace, and its machine said where its clone's HEAD was as it
   * deleted it ({@link closeWorkspace}): on a branch of its remote, or, its
   * items landing none, in its carry (`head.carry`). A discard's carry is let
   * go of, and its row keeps no head. One with no such word (a clone already
   * gone, a folder that was no clone, a retirement before the hub kept it)
   * is not: any other commit could leave its commits behind.
   */
  const recuttable = (workspace: WorkspaceRow): boolean =>
    workspace.state === "archived" &&
    workspace.head !== null &&
    (workspace.carry === null || workspace.head.carry !== undefined) &&
    !workspace.checksFor;

  /** Why an archived workspace is not cut again ({@link recuttable}), in words. */
  const archivedWords = (workspace: WorkspaceRow): string => {
    if (workspace.carry) {
      return `its workspace ${handle(workspace.id)} was discarded: its unlanded work is in the carry ${workspace.carry} on ${machineName(workspace.machineId)}, and its clone is gone.`;
    }
    if (workspace.checksFor) {
      return `its workspace ${handle(workspace.id)} is archived: its clone and boundary are gone.`;
    }
    const taker = db
      .workspacesCutFrom(workspace.id)
      .find((cut) => cut.cutFrom?.landed);
    if (taker) {
      return `its workspace ${handle(workspace.id)} retired: its work went on in workspace ${handle(taker.id)}, cut from it, which landed it, so it is not cut again; workspace ${handle(taker.id)} is where that work goes on.`;
    }
    return `its workspace ${handle(workspace.id)} retired with no word of the commit its clone was on, so it is not cut again: a cut anywhere else could leave its commits behind.`;
  };

  /** Each workspace's cut under way ({@link recut}): one at a time. */
  const recutting = new Map<string, Promise<WorkspaceRow>>();

  /**
   * A retired workspace ({@link recuttable}) cut again on its machine, at the
   * same path (a function of its id) with the same id and branch, at the
   * commit its clone's HEAD was on when it retired
   * ({@link CONTROL_WORKSPACE_CREATE}'s `at`), never its default branch's
   * tip: on 2026-10-17 a clone whose landing was stopped while queued came
   * back at main, without its own commit. The machine refuses a commit the
   * branch it was on no longer holds. Its boundary is started on the account
   * its latest item's session runs on: its delegate goes on in the same
   * session, on its transcript, in the same folder. Filed active again, one
   * of its project's places. Nothing git does not track comes back:
   * installed dependencies, build outputs, its scratch dir. CawCo installs
   * nothing (the owner, 2026-10-18); the next message handed to its session
   * opens with the hub's line saying the folder is new (its row's
   * `movedUntold`, {@link WorkItems.movedTold}), whichever path goes on there (a handoff, a
   * follow-up, a retry or a continuation), so it sets up what it needs. One
   * cut at a time per workspace; every caller shares it.
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
    const { head } = workspace;
    if (!head) {
      return Promise.reject(
        new Error(
          `workspace ${handle(workspace.id)}: ${archivedWords(workspace)}`
        )
      );
    }
    const work = (async (): Promise<WorkspaceRow> => {
      notPaused(workspace.machineId);
      const [latest] = db.workItemsIn(workspace.id);
      const [session] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
      const projectId = latest?.projectId ?? null;
      // Its delegate goes on in that session: its conversation resumed there,
      // or a new one when it had none yet.
      const first: WorkspaceFirstSession | null = session
        ? {
            instanceId: session.id,
            harness: session.harness,
            resume: session.sessionId ?? null,
          }
        : null;
      const checkout = (await call(
        workspace.machineId,
        CONTROL_WORKSPACE_CREATE,
        [
          workspace.repoRoot,
          workspace.id,
          projectId,
          session?.accountId ?? null,
          head,
          first,
        ]
      )) as WorkspaceCheckout;
      const path = cutPath(workspace.machineId, checkout.path);
      if (path !== workspace.path) {
        throw new Error(
          `workspace ${handle(workspace.id)} was cut again at ${path}, not at its own path ${workspace.path}`
        );
      }
      if (projectId && db.project(projectId)) {
        const { place } = db.addPlace({
          projectId,
          machineId: workspace.machineId,
          path: workspace.path,
          kind: "workspace",
        });
        placesChanged(workspace.machineId, projectId);
        await placeTaken(workspace.machineId, place.id);
      }
      const again =
        db.updateWorkspace(workspace.id, {
          state: "active",
          boundaryPid: checkout.boundaryPid,
          base: checkout.base,
          tmp: checkout.tmp,
          movedUntold: {
            kind: "recut",
            ...head,
            ...(checkout.restored ? { restored: checkout.restored } : {}),
          },
          // Its commits are in the clone again: a carry of its next end is its own.
          carry: null,
        }) ?? workspace;
      onCut?.();
      workspaceChanged?.(again);
      console.log(
        `[workspaces] ${workspace.id} on ${machineName(workspace.machineId)}: cut again at ${workspace.path}, at ${head.commit.slice(0, 9)} on ${head.branch}, where its clone was when it retired, for its delegate to go on`
      );
      return again;
    })().finally(() => recutting.delete(workspace.id));
    recutting.set(workspace.id, work);
    return work;
  };

  /**
   * Whether a send from `origin` to session `instanceId` reopens a finished
   * item whose workspace retired ({@link recuttable}), or is in a turn that
   * may be retiring it (its settle, run as its session fell asleep): from
   * one who may reopen it ({@link mayReopen}), to its workspace's latest
   * item. Such a send waits at the hub for that turn, and while the
   * workspace is cut again ({@link recutFor}).
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
      (recuttable(workspace) || workspaceTurns.has(workspace.id)) &&
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
        `Not continued: ${archivedWords(workspace)} Delegate without workspace to start a new one.`
      );
    }
    if (workspace.host) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path}, not a clone: continue its session with handoff, or delegate with host again.`
      );
    }
    if (workspace.checksFor) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} runs the iOS build of the merge checks for workspace ${handle(workspace.checksFor)} on its machine and takes no work item. Delegate with workspace ${handle(workspace.checksFor)}, or without workspace to start a new one.`
      );
    }
    const items = db.workItemsIn(workspace.id);
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(workspace.id)} already has a live work item: ${live.title} (${handle(live.id)}) is ${live.state}. A workspace runs one work item at a time; wait for its report, or delegate without workspace to start a new one.`
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
    if (!workspace || workspace.state === "archived" || workspace.host) {
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
   * What a refused workspace create says: the machine's words, `pending`
   * the discard's own failure when it did not go. A machine that lacks what
   * a workspace needs (agent workspace-needs.ts) refused before anything was
   * cut, and its words end in the install command alone, so they go on
   * whole, nothing after it; its discard, if it waits, is retried as every
   * other's is.
   */
  const createFailed = (
    machineId: string,
    id: string,
    reason: string,
    waited: string,
    pending: string | undefined
  ): string => {
    if (isWorkspaceNeedsRefusal(reason)) {
      if (pending) {
        console.warn(
          `[work-items] workspace ${id}, refused on ${machineName(machineId)} for what it lacks, is discarded when the machine next registers: ${pending}`
        );
      }
      return reason;
    }
    const failed = `Workspace create on ${machineName(machineId)} failed after ${waited}s: ${reason}.`;
    return pending
      ? `${failed} Discard of workspace ${id} is pending (${pending}); it will be retried when the machine next registers.`
      : `${failed} Workspace ${id.slice(0, 8)} was discarded; no clone or boundary was left.`;
  };

  /**
   * A new workspace: the project's place made a git repository first when it
   * is a plain folder ({@link WorkItemDeps.beforeCut}), then its machine cuts
   * the clone and starts its boundary, and the hub files it. A place that
   * cannot be made one refuses the workspace in the machine's words, before
   * anything is cut. `checksFor` makes it the gate workspace of that one;
   * `account` is the Claude account its first session launches on
   * ({@link ItemPlacement}), whose user layer the boundary reads from its
   * first start; `first` is that session ({@link WorkspaceFirstSession}),
   * whose spill folder it reads from then too, so its spawn hands the
   * boundary over to no second one.
   */
  const openWorkspace = async (
    createdBy: string,
    cwd: MachinePath,
    machineId: string,
    projectId: string | null,
    {
      account,
      checksFor,
      first,
    }: {
      account?: string;
      checksFor?: string;
      first?: WorkspaceFirstSession;
    } = {}
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
        null,
        first ?? null,
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
      const pending = await discardCreate(id, machineId).then(
        () => undefined,
        (discardError: unknown) =>
          discardError instanceof Error
            ? discardError.message
            : String(discardError)
      );
      throw new Error(createFailed(machineId, id, reason, waited, pending), {
        cause: error,
      });
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

  /**
   * The workspace a `delegate` call's `from` names: one of the caller's
   * (its own delegates' workspace), with no live item, whose clone is still
   * on its machine. Refused in a sentence naming what to do otherwise.
   */
  const fromSource = (needle: string, parent: Parent): WorkspaceRow => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length !== 1) {
      throw new WorkItemRefusal(
        404,
        named.length
          ? `"${needle}" names ${named.length} workspaces. Pass the full workspace id as from.`
          : `No workspace "${needle}". Pass as from a workspace id from one of your delegates' results or reports.`
      );
    }
    const [source] = named as [WorkspaceRow];
    const items = db.workItemsIn(source.id);
    if (
      source.createdByInstanceId !== parent.id &&
      !items.some((item) => item.parentInstanceId === parent.id)
    ) {
      throw new WorkItemRefusal(
        403,
        `Workspace ${handle(source.id)} is not one of yours: from takes a workspace one of your own delegates worked in. Delegate without from, or ask the session that owns it.`
      );
    }
    if (source.state === "archived" || source.checksFor || source.host) {
      let why = "it is archived, its clone gone";
      if (source.host) {
        why = "it is a host-scope delegate's folder, not a clone";
      } else if (source.checksFor) {
        why = "it runs the iOS build of the merge checks";
      }
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(source.id)} has no branch to cut from: ${why}. Delegate without from.`
      );
    }
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${handle(source.id)} has a live work item, ${live.title} (${handle(live.id)}), so its branch is still moving. Wait for its report, or stop it with stop_delegate, then delegate with from.`
      );
    }
    return source;
  };

  /**
   * A workspace's HEAD and its commits past its base, bundled inside its
   * boundary ({@link CONTROL_WORKSPACE_BUNDLE}). A held one's boundary,
   * started for that, is closed again however the bundle went, and the
   * workspace stays held.
   */
  const bundleOf = (id: string): Promise<WorkspaceCommit> =>
    inWorkspaceTurn(id, async () => {
      // As it stands in its turn: a settle before it may have closed it.
      const [source] = db.workspacesNamed(id);
      if (!source || source.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `Workspace ${id} was archived before its branch could be read: its clone is gone. Delegate without from.`
        );
      }
      try {
        return (await call(source.machineId, CONTROL_WORKSPACE_BUNDLE, [
          refOf(source),
          source.base,
        ])) as WorkspaceCommit;
      } finally {
        if (source.state === "held") {
          await closeWorkspace(source, "keep", handedOver(source));
        }
      }
    });

  /**
   * A new workspace's branch moved to `source`'s head: the source's HEAD
   * and its commits past its base bundled inside the source's boundary
   * ({@link CONTROL_WORKSPACE_BUNDLE}), taken inside the new workspace's
   * own ({@link CONTROL_WORKSPACE_AT}), and its branch set there, still
   * tracking the default branch. Every git step runs inside a boundary, as
   * the landing gate's own transfer does, but the checkout of the commit's
   * tracked files, which the agent runs on its host with the new
   * workspace's boundary closed (agent workspace.ts `workspaceAt`). A move
   * that fails archives the new workspace, unworked, and throws why.
   */
  const cutFrom = async (
    workspace: WorkspaceRow,
    source: WorkspaceRow
  ): Promise<void> => {
    try {
      const made = await bundleOf(source.id);
      await call(workspace.machineId, CONTROL_WORKSPACE_AT, [
        refOf(workspace),
        workspace.base,
        made,
        source.id,
      ]);
      const branch = quote(workspace.branch);
      const set = await command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}git checkout --quiet -B ${branch} && git branch --quiet --set-upstream-to=${quote(`origin/${workspace.base}`)} ${branch}`,
        GIT_TIMEOUT_MS,
        refOf(workspace),
        // A checkout: one that left a path the boundary keeps other than
        // the commit has it fails, never passes with it dropped.
        { moves: made.head }
      );
      if (set.exitCode !== 0) {
        throw new Error(
          (set.stderr || set.stdout).trim() || `exit ${set.exitCode}`
        );
      }
      db.updateWorkspace(workspace.id, {
        cutFrom: { workspace: source.id, commit: made.head, landed: false },
      });
    } catch (error) {
      await closeWorkspace(workspace, "unmade");
      const words = `Workspace ${handle(workspace.id)} could not be cut from workspace ${handle(source.id)}, so it was archived: ${error instanceof Error ? error.message : String(error)}`;
      throw error instanceof WorkItemRefusal
        ? new WorkItemRefusal(error.status, words, { cause: error })
        : new Error(words, { cause: error });
    }
  };

  /**
   * A new workspace's worktree moved to commit `at`, detached, before its
   * session starts: a move (`CommandOptions.moves`), so a commit that
   * changes a path the boundary keeps is checked out on the machine's host
   * and none is dropped. Its session's own checkout there would fail on such
   * a path, or, without `--force`, exit 0 with the file gone. One that fails
   * archives the workspace, unworked, and throws why.
   */
  const detachNew = async (
    workspace: WorkspaceRow,
    at: string
  ): Promise<void> => {
    const moved = await command(
      workspace.machineId,
      workspace.path,
      `${SAFE_GIT_SHELL}git checkout --quiet --detach ${quote(at)}`,
      GIT_TIMEOUT_MS,
      refOf(workspace),
      { moves: at }
    ).catch((error: unknown) => ({
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    if (moved.exitCode === 0) {
      return;
    }
    await closeWorkspace(workspace, "unmade");
    throw new Error(
      `Workspace ${handle(workspace.id)} could not be moved to ${at.slice(0, 9)}, so it was archived: ${(moved.stderr || moved.stdout).trim() || `exit ${moved.exitCode}`}`
    );
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
      if (!(request.host || request.cwd?.trim())) {
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
   * The delegate a `delegate` call briefs: a follow-up's, the session its
   * workspace continues; any other's, the type and model it starts on.
   */
  const briefTarget = (
    request: WorkItemRequest,
    parent: Parent
  ): BriefTarget => {
    if (request.workspace) {
      const [named] = db.workspacesNamed(request.workspace.trim());
      const previous = named ? db.workItemsIn(named.id)[0] : undefined;
      const [session] = previous
        ? db.getInstancesByIds([previous.instanceId])
        : [];
      if (session) {
        return {
          delegateType: session.delegateType ?? null,
          model: session.model ?? "",
        };
      }
    }
    const settings = settingsOf(request, parent);
    return {
      delegateType: settings.type?.name ?? null,
      model: settings.model ?? "",
    };
  };

  /**
   * The briefing guidance a `delegate` call's caller has yet to read for its
   * delegate (briefings.ts), recorded as handed; nothing when it has read
   * it, or when the call is one {@link start} refuses in its own words.
   */
  const briefingOf = (request: WorkItemRequest): string | undefined => {
    const [parent] = db.getInstancesByIds([request.parentInstanceId]);
    if (!parent || parent.canDelegate === false) {
      return undefined;
    }
    return briefingFor(db, parent.id, briefTarget(request, parent));
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
    const { harness } = parent;
    if (!(parent.sessionId && harness)) {
      throw new WorkItemRefusal(
        409,
        "This session has not named its conversation yet, so there is nothing to fork. Delegate without fork."
      );
    }
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
    inputs: Inputs
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
      inputs.files
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
        `Continued ${sessionLink(session.id, boardTitle(session))}, ${label}, as work item ${item.id.slice(0, 8)} in workspace ${workspace.id.slice(0, 8)} (${placeOf(workspace)}): ` +
        "the brief is its next message, in the same session and its cached transcript. " +
        `${REPORT_ARRIVES} Guide it, or continue it after it ` +
        `reports, with handoff("${label}", ...).${extrasLine(item)}${inputsSaid(inputs)}`,
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
    inputs: Inputs
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
        `The last attempt's session in workspace ${handle(workspace.id)} was told to stop and has not confirmed it, so no fresh session starts beside it: ${reason instanceof Error ? reason.message : String(reason)} Retry once its machine has ended it.`
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
    // A host-scope row's folder is the machine's own: there is no clone.
    if (workspace.host) {
      return workspace;
    }
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
          `Workspace ${handle(workspace.id)} already has a live work item: ${live.title} (${handle(live.id)}) is ${live.state}. A workspace runs one work item at a time.`
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
   * `paths` admitted on `reader`'s machine (agent inputs.ts) against its
   * workspace when it runs in one (`bound`) and its project: refused in the
   * machine's words when one may not leave it. One outside `reader`'s own
   * clone and scratch dir may not, when it runs inside a boundary ({@link
   * boundOf}); a file in the folder of its project, which its delegates'
   * boundaries read, may. No byte of them is read here: {@link handIn}
   * moves them once their workspace is known.
   */
  const admitPaths = async (
    paths: string[],
    reader: Pick<Parent, "machineId" | "projectId">,
    bound: WorkspaceRef | null
  ): Promise<InputNamed[]> => {
    if (paths.length === 0) {
      return [];
    }
    const judged = (await call(reader.machineId, CONTROL_INPUTS_ADMIT, [
      paths,
      bound,
      reader.projectId ?? null,
    ])) as InputsAdmitted;
    if ("refused" in judged) {
      throw inputsRefused(judged.refused);
    }
    return judged.files;
  };

  /**
   * What `held` names, resolved now and read for `reader` (handed-inputs.ts):
   * refused in words naming it when it names nothing `reader` may read, or
   * when together it is more than {@link INPUTS_LIMIT_BYTES}.
   */
  const resolveHeld = async (
    held: HeldInput[],
    reader: InstanceRow
  ): Promise<HandedFile[]> => {
    const resolved = (
      await Promise.all(
        held.map(async (input) => {
          try {
            return await resolveHanded(reader, input);
          } catch (error) {
            throw error instanceof HandedInputRefusal
              ? inputsRefused(error.message, { cause: error })
              : error;
          }
        })
      )
    ).flat();
    // What is made for its reader as it is written (a preview's pass) is a
    // few hundred bytes: what is in hand now is the whole of it that counts.
    const bytes = resolved.reduce(
      (sum, file) =>
        sum + (typeof file.bytes === "function" ? 0 : file.bytes.length),
      0
    );
    if (bytes > INPUTS_LIMIT_BYTES) {
      throw new WorkItemRefusal(
        400,
        `inputs: what the hub hands comes to more than ${INPUTS_LIMIT_BYTES / MIB} MiB, the most one delegation carries; hand larger data on through git.`
      );
    }
    return resolved;
  };

  /** Refuses two inputs that would land under one name in `inputs/`. */
  const oneNameEach = (files: InputNamed[]): void => {
    const landing = new Map<string, string>();
    for (const file of files) {
      const twin = landing.get(file.name);
      if (twin !== undefined) {
        throw new WorkItemRefusal(
          400,
          `inputs: ${twin} and ${file.from} would both land as ${file.name} in $TMPDIR/inputs/; hand one under another name.`
        );
      }
      landing.set(file.name, file.from);
    }
  };

  /**
   * What `entries` hands on (core handed-input.ts), before anything is cut:
   * none for none. Each entry is checked against the core's shapes; paths
   * are admitted on `reader`'s machine ({@link admitPaths}), every other
   * entry resolved by the hub ({@link resolveHeld}); two that would land
   * under one name are refused. The hub's own reader (a routine, a design
   * check's verifier: {@link isHubParent}) has no session row and runs in no
   * boundary: its paths are admitted on its machine for its project, and
   * it hands nothing held, which is read for a session.
   */
  const readInputs = async (
    entries: unknown[] | undefined,
    reader: Pick<Parent, "id" | "machineId" | "projectId">
  ): Promise<Inputs> => {
    if (!entries?.length) {
      return NO_INPUTS;
    }
    const checked = handedInputs(entries);
    if ("refused" in checked) {
      throw inputsRefused(checked.refused);
    }
    if (checked.inputs.length > INPUTS_COUNT_LIMIT) {
      throw new WorkItemRefusal(
        400,
        `inputs: ${checked.inputs.length} entries; one delegation carries ${INPUTS_COUNT_LIMIT} at most.`
      );
    }
    const paths = checked.inputs.filter(
      (input): input is string => typeof input === "string"
    );
    if (isHubParent(reader.id)) {
      if (paths.length < checked.inputs.length) {
        throw new WorkItemRefusal(
          400,
          "inputs: the hub's own work hands paths only; what the hub holds by name is read for a session."
        );
      }
      const files = await admitPaths(paths, reader, null);
      oneNameEach(files);
      return {
        paths,
        bound: null,
        project: reader.projectId ?? null,
        machineId: reader.machineId,
        files,
        held: [],
      };
    }
    const [row] = db.getInstancesByIds([reader.id]);
    if (!row) {
      throw new WorkItemRefusal(404, `unknown session ${reader.id}`);
    }
    const bound = boundOf(row) ?? null;
    const [pathFiles, hubFiles] = await Promise.all([
      admitPaths(paths, row, bound),
      resolveHeld(
        checked.inputs.filter(
          (input): input is HeldInput => typeof input !== "string"
        ),
        row
      ),
    ]);
    const files: InputNamed[] = [
      ...pathFiles,
      ...hubFiles.map(({ name, from }) => ({ name, from, mode: HELD_MODE })),
    ];
    oneNameEach(files);
    return {
      paths,
      bound,
      project: row.projectId ?? null,
      machineId: reader.machineId,
      files,
      held: hubFiles,
    };
  };

  /**
   * `inputs` put into `workspace`'s `$TMPDIR/inputs/` on its machine for
   * `receiver`, the session that reads them, before a brief names them.
   * What the hub resolved it writes there itself, what is made for its
   * reader (a preview's pass) made for `receiver` now. Paths are admitted
   * again where they are read. THE ONE DECISION for paths: on the machine
   * that holds them, that machine copies them itself, and none of their
   * bytes crosses its link; from another machine, they are read there and
   * written here, through the hub.
   */
  const handIn = async (
    workspace: WorkspaceRow,
    inputs: Inputs,
    receiver: InstanceRow
  ): Promise<void> => {
    if (inputs.held.length > 0) {
      const files = await Promise.all(
        inputs.held.map(async (file): Promise<InputFile> => ({
          name: file.name,
          from: file.from,
          mode: HELD_MODE,
          content: (typeof file.bytes === "function"
            ? await file.bytes({
                session: receiver,
                machineId: workspace.machineId,
              })
            : file.bytes
          ).toString("base64"),
        }))
      );
      await call(workspace.machineId, CONTROL_INPUTS_WRITE, [
        refOf(workspace),
        files,
      ]);
    }
    if (inputs.paths.length === 0) {
      return;
    }
    if (workspace.machineId === inputs.machineId) {
      const copied = (await call(workspace.machineId, CONTROL_INPUTS_COPY, [
        inputs.paths,
        inputs.bound,
        refOf(workspace),
        inputs.project,
      ])) as InputsAdmitted;
      if ("refused" in copied) {
        throw inputsRefused(copied.refused);
      }
      return;
    }
    const read = (await call(inputs.machineId, CONTROL_INPUTS_READ, [
      inputs.paths,
      inputs.bound,
      inputs.project,
    ])) as InputsRead;
    if ("refused" in read) {
      throw inputsRefused(read.refused);
    }
    await call(workspace.machineId, CONTROL_INPUTS_WRITE, [
      refOf(workspace),
      read.files satisfies InputFile[],
    ]);
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
    // A session a stop walks starts nothing more: its tree is ending.
    if (db.treeStops.get(parent.id)) {
      throw new WorkItemRefusal(409, workWords.stoppingRefused);
    }
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
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    if (request.reuse) {
      const again = await reusable(request.reuse, request.reuseOn);
      if (again) {
        return spawnIn(
          again,
          settingsOf(request, parent),
          parent,
          await briefedFrom(request, again),
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
    if (request.host) {
      return await startHost(request, parent);
    }
    return request.workspace
      ? await startFollowUp(request.workspace, request, parent, inputs)
      : await startFresh(request, parent, projectId, inputs);
  };

  /**
   * Why a host-scope delegate may not run in `path` on `machineId`, in the
   * words {@link hostProblem} refuses with, or nothing: a folder inside a
   * clone is bounded to that clone's boundary whatever the spawn names (agent
   * session.ts `#sessionContext`, workspace-records.ts `cloneHolding`), so
   * host scope there would silently be no host scope. Inside a workspace the
   * hub holds a clone of on that machine (active or held), or one the
   * machine's own records hold ({@link CONTROL_CLONE_HOLDING}).
   */
  const hostFolderProblem = async (
    machineId: string,
    path: MachinePath
  ): Promise<string | undefined> => {
    const inside = (root: string): boolean =>
      path === root || path.startsWith(`${root}/`);
    const filed = [
      ...db.activeWorkspacesOn(machineId),
      ...db.heldWorkspaces().filter((one) => one.machineId === machineId),
    ].find((one) => inside(one.path));
    const held =
      filed ??
      ((await call(machineId, CONTROL_CLONE_HOLDING, [
        path,
      ])) as WorkspaceRef | null);
    return held
      ? workWords.hostRefused([
          `cwd ${path}: it is inside workspace ${handle(held.id)}'s clone ${held.path} on ${machineName(machineId)}, where a session runs inside that workspace's boundary. Name a folder outside every clone, or leave cwd out for the agent user's home.`,
        ])
      : undefined;
  };

  /**
   * A host-scope item ({@link WorkItemRequest.host}): its row of the host
   * kind filed for the folder it runs in (`cwd` on its machine, the agent
   * user's home by default), with nothing cut, then its session spawned
   * there with no boundary ({@link spawnOf}). Its machine and model are
   * checked as a new workspace's are, and its folder refused inside a clone
   * ({@link hostFolderProblem}); the folder is the machine's own, so no
   * project place, repository or clone is recorded for it.
   */
  const startHost = async (
    request: WorkItemRequest,
    parent: Parent
  ): Promise<WorkItemStart> => {
    const machineId = targetMachine(request, parent);
    notPaused(machineId);
    const settings = settingsOf(request, parent);
    modelOffered(machineId, settings);
    const path = cwdOn(machineId, request.cwd?.trim() || "~");
    const cloned = await hostFolderProblem(machineId, path);
    if (cloned) {
      throw new WorkItemRefusal(400, cloned);
    }
    const workspace = db.createWorkspace({
      id: crypto.randomUUID(),
      machineId,
      repoRoot: path,
      path,
      branch: "",
      base: "",
      state: "active",
      host: true,
      createdByInstanceId: parent.id,
    });
    console.log(
      `[workspaces] ${workspace.id} on ${machineName(machineId)}: a host-scope delegate's folder ${path}, no clone and no boundary`
    );
    return spawnIn(workspace, settings, parent, request, NO_INPUTS);
  };

  /**
   * An item in a new workspace: cut from the request's repository (the
   * parent's directory by default) at its default branch's tip, or, with
   * `from`, on that workspace's machine from its repository and moved to
   * its head ({@link cutFrom}); then its session spawned there.
   */
  const startFresh = async (
    request: WorkItemRequest,
    parent: Parent,
    projectId: string | null,
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    const source = request.from ? fromSource(request.from, parent) : undefined;
    const machineId = targetMachine(
      source
        ? { ...request, machineId: source.machineId, cwd: source.repoRoot }
        : request,
      parent
    );
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
      cwdOn(machineId, source?.repoRoot ?? request.cwd ?? parent.cwd),
      machineId,
      projectId,
      {
        account: placement.launchesOn,
        first: { instanceId, harness: settings.harness, resume: null },
      }
    );
    if (source) {
      await cutFrom(workspace, source);
    }
    if (request.detachAt) {
      await detachNew(workspace, request.detachAt);
    }
    if (projectId) {
      recordRepository(projectId, workspace);
    }
    // While it lives, the clone is one of the parent's project's places;
    // archiving the workspace removes it.
    if (parent.projectId) {
      projectStands(parent.projectId);
      const { place } = db.addPlace({
        projectId: parent.projectId,
        machineId,
        path: workspace.path,
        kind: "workspace",
      });
      placesChanged(machineId, parent.projectId);
      await placeTaken(machineId, place.id);
    }
    // In its scratch dir before its session starts ({@link spawnIn}).
    return spawnIn(
      workspace,
      settings,
      parent,
      await briefedFrom(request, workspace),
      inputs,
      { instanceId, placement }
    );
  };

  /** The request with its brief written from its clone, when it asks for that ({@link WorkItemRequest.briefFromClone}). */
  const briefedFrom = async (
    request: WorkItemRequest,
    workspace: WorkspaceRow
  ): Promise<WorkItemRequest> =>
    request.briefFromClone
      ? {
          ...request,
          prompt: await request.briefFromClone({
            id: workspace.id,
            machineId: workspace.machineId,
            path: workspace.path,
          }),
        }
      : request;

  /**
   * The follow-up in the workspace `needle` names. A retired one is cut
   * again at its own path first ({@link recut}). Its boundary is up and,
   * when it continues a session, its inputs are written for that session
   * before the claim, which files the item in the same step as its
   * one-writer check; the inputs land only in a workspace the claim would
   * take, and the claim is made again as the item is filed. A workspace
   * whose last session never started gets a new session, its inputs
   * written for it once it stands, as every new delegate's are.
   */
  const startFollowUp = async (
    needle: string,
    request: WorkItemRequest,
    parent: Parent,
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    const named = namedWorkspace(needle);
    notPaused(named.machineId);
    if (recuttable(named)) {
      await recut(named);
    }
    await boundaryUp(needle);
    const { workspace, previous } = claim(needle);
    const [resumed] = previous
      ? db.getInstancesByIds([previous.instanceId])
      : [];
    if (resumed?.sessionId && inputs.files.length > 0) {
      await handIn(workspace, inputs, resumed);
    }
    const followed = followUp(needle, request, parent, inputs);
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

  /**
   * Whether a new item is background work (its `background`): a routine's
   * run, or what a session starts in a turn an event woke while its own
   * work is not an event's (Caw's routine turn). Work under a background
   * item is that item's own tree, not background of its own.
   */
  const backgroundOf = (origin: WorkOrigin, parent: Parent): boolean => {
    if (isRoutineParent(parent.id)) {
      return true;
    }
    if (origin !== "event") {
      return false;
    }
    const [row] = db.getInstancesByIds([parent.id]);
    const own = row?.workItemId ? db.workItem(row.workItemId) : undefined;
    return own?.origin !== "event";
  };

  const placing = (request: WorkItemRequest, parent: Parent) => {
    const projectId = request.task?.projectId ?? parent.projectId;
    const project = projectId ? db.project(projectId) : undefined;
    const origin = originOf(request, parent);
    return {
      origin,
      background: backgroundOf(origin, parent),
      byPerson: request.byPerson ?? false,
      ...(request.task ? { taskId: request.task.id } : {}),
      ...(projectId ? { projectId } : {}),
      // Host scope lands nothing ({@link startHost}).
      lands: request.host ? "none" : (request.lands ?? "main"),
      outputs: request.outputs?.length ? request.outputs : null,
      group: request.group?.trim() || null,
      owns: request.owns?.length ? request.owns : null,
      budget: budgetFrom(request.budget, project?.budget),
    };
  };

  /** What the caller's start text adds for inputs copied in: their names. */
  const inputsSaid = (inputs: Inputs): string =>
    inputs.files.length > 0
      ? ` Copied ${counted(inputs.files.length, "input")} into its $TMPDIR/inputs/: ${inputs.files.map((input) => input.name).join(", ")}.`
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
   * brief; `inputs` are put in for it once it stands, after the item is
   * answered and before its brief ({@link handIn}). `ahead`: its id and
   * account, placed before a new workspace was cut ({@link ItemPlacement});
   * absent, it is placed as it spawns.
   */
  const spawnIn = (
    workspace: WorkspaceRow,
    settings: Settings,
    parent: Parent,
    request: WorkItemRequest,
    inputs: Inputs,
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
    });
    published(item);
    spawnedUnder?.(instanceId, parent.id);

    // A fork opens with what it is.
    const fork = settings.forkOf ? forkLine(workspace) : "";
    try {
      // Its session's row stands from now, as its item does: a live item
      // whose session has no row is one whose session is gone
      // ({@link followSessions}).
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
    /** Its first message, which names its inputs: sent once they are in. */
    const brief = (): void => {
      const content = withInputsLine(
        `${handoffMarker(sessionLabel(parent).name, parent.id)}${fork}${request.prompt}`,
        inputs.files
      );
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          workspace.host
            ? withHostLine(
                content,
                workspace.path,
                machineName(workspace.machineId)
              )
            : withWorkspaceLine(
                content,
                workspace.repoRoot,
                workspace.base,
                landingOf(item)
              )
        )
      );
    };
    if (inputs.files.length > 0) {
      // The caller is answered now, with its workspace, item and session:
      // putting the inputs in waits on nothing the answer says, and behind a
      // conductor's burst it held the answer past the caller's own deadline
      // (2026-10-20, link-under-load: "the hub did not answer within 30000
      // ms" for 10 of 16 lanes, each clone cut and its inputs still on their
      // way). The session is spawned with its item; its brief, which names
      // the inputs, goes once they are in. Spawning only then left a live
      // item with no session row while they went, which reads as a session
      // gone: the item failed, its workspace retired under the inputs still
      // being written ("ENOENT … rename …/inputs/…", 2026-10-20). Inputs that
      // cannot go fail the item in their words, its report says so, and its
      // session ends.
      /** Its inputs did not go: the item fails in their words, and its session ends. */
      const notIn = (error: unknown): Promise<void> => {
        const reason = `Its inputs did not reach its $TMPDIR/inputs/, so its brief was not sent: ${(error instanceof Error && error.message) || String(error)}`;
        const ended = finish(item, { state: "failed", error: reason });
        const [row] = db.getInstancesByIds([instanceId]);
        if (row) {
          report(row, `${reason}${reportLine(ended)}`, true);
        }
        return end(instanceId);
      };
      const [receiver] = db.getInstancesByIds([instanceId]);
      (receiver
        ? handIn(workspace, inputs, receiver)
        : Promise.reject(new Error(`its session ${instanceId} has no row`))
      )
        .then(brief, notIn)
        .catch((stopped: unknown) =>
          console.warn(
            `[work-items] ${item.id}: its session, whose inputs did not go in, is told to stop and has not confirmed it: ${stopped instanceof Error ? stopped.message : String(stopped)}`
          )
        );
    } else {
      brief();
    }

    return {
      item,
      workspace,
      text:
        (workspace.host
          ? `Started work item ${item.id.slice(0, 8)} with host scope on ${machineName(workspace.machineId)} (${placeOf(workspace)}; nothing lands): `
          : `Started work item ${item.id.slice(0, 8)} in workspace ${workspace.id.slice(0, 8)} (${placeOf(workspace)}): `) +
        (settings.forkOf
          ? `a fork of this conversation on ${harness}${settings.model ? ` (${settings.model})` : ""}, ${sessionLink(instanceId, request.title)}, ${label}. It starts with every turn of yours so far.`
          : `a fresh ${harness} session, ${sessionLink(instanceId, request.title)}, ${label}.`) +
        ` ${REPORT_ARRIVES} Guide it, or continue it after it ` +
        `reports, with handoff("${label}", ...): the message lands in the same session and its cached transcript.` +
        (canDelegate
          ? " It may spawn delegates of its own."
          : " It is a leaf: it cannot delegate further.") +
        extrasLine(item) +
        inputsSaid(inputs),
    };
  };

  /** The live items on `machineId`, in a clone or with host scope. */
  const liveItemsOn = (machineId: string): WorkItemRow[] =>
    db
      .liveWorkItems()
      .filter(
        (item) =>
          db.workspacesNamed(item.workspaceId)[0]?.machineId === machineId
      );

  /** The item a session runs, when it runs one. */
  const itemOf = (row: InstanceRow): WorkItemRow | undefined =>
    row.workItemId ? db.workItem(row.workItemId) : undefined;

  /**
   * The work session `instanceId` delegated that has not ended: its live
   * items and its delegates still queued. A completing item lands once
   * this is empty ({@link completeIfDrained}).
   */
  const ownedLive = (instanceId: string): { id: string; title: string }[] => [
    ...db
      .liveWorkItemsOf(instanceId)
      .map((one) => ({ id: one.id, title: one.title })),
    ...db
      .queuedWorkItems()
      .filter((one) => one.parentInstanceId === instanceId)
      .map((one) => ({ id: one.id, title: one.title })),
  ];

  /** A completing item's group, as a line names it: `“Theme” (1a2b3c4d), …`. */
  const groupWords = (group: readonly { id: string; title: string }[]) =>
    group.map((one) => `“${one.title}” (${handle(one.id)})`).join(", ");

  /** A completing item's status, as its chip says it. */
  const completingWords = (group: readonly { id: string; title: string }[]) =>
    `waiting for ${group.length === 1 ? "the item" : `the ${group.length} items`} it delegated to end: ${groupWords(group)}`;

  /** What `finish_item` answers an item whose own delegates are still live. */
  const completingText = (group: readonly { id: string; title: string }[]) =>
    `Stored, not landed yet: your work lands once ${group.length === 1 ? "the item" : `the ${group.length} items`} you delegated ${group.length === 1 ? "has" : "have"} ended: ${groupWords(group)}. Their reports still come to you, and a finish_item meanwhile replaces this one. End your turn.`;

  /**
   * A completing item whose own delegates have all ended lands now, on its
   * stored submission ({@link landStored}); while any is live it waits,
   * its chip naming them. Asked as each item ends ({@link afterEnd}), and
   * at its machine's register after a hub restart ({@link resumeLandings}).
   */
  const completeIfDrained = (owner: WorkItemRow): void => {
    const now = db.workItem(owner.id) ?? owner;
    if (!(
      LIVE.has(now.state) &&
      now.landingPhase === "completing" &&
      now.submission
    )) {
      return;
    }
    const group = ownedLive(now.instanceId);
    if (group.length > 0) {
      landingWait(now.id, completingWords(group));
      return;
    }
    console.log(
      `[work-items] ${now.id}: every item it delegated has ended; it lands now`
    );
    landingWait(now.id, null);
    const landing = update(now.id, { landingPhase: null }) ?? now;
    landStored(landing, now.submission);
  };

  /**
   * A `finish_item` that lands, stored first: it runs now, or, while work
   * the item delegated is still live, it completes once all of that has
   * ended ({@link completeIfDrained}). Answers what the tool returns.
   */
  const landOrComplete = async (
    item: WorkItemRow,
    request: WorkItemSubmission
  ): Promise<string> => {
    const group = ownedLive(item.instanceId);
    if (group.length > 0) {
      update(item.id, {
        submission: request,
        landingSince: new Date(),
        landingPhase: "completing",
      });
      landingWait(item.id, completingWords(group));
      console.log(
        `[work-items] ${item.id}: finish_item stored; it lands once ${group.length} item(s) it delegated have ended`
      );
      return completingText(group);
    }
    update(item.id, { submission: request, landingSince: new Date() });
    return (await settleLanding(item, request)).text;
  };

  /**
   * A stored submission's landing, run to its end with no session's call
   * waiting on it (a hub restart's resume, a completing item's group's
   * end): a landing needs no word to the session, as its parent has the
   * report; a failure, or a gate that cannot run, is sent to the session
   * as the tool would have answered.
   */
  const landStored = (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ): void => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    settleLanding(item, submission)
      .then(({ done, text }) => {
        if (!done && row) {
          tell(row, text);
        }
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[work-items] ${item.id}: ${reason}`);
        if (row) {
          tell(
            row,
            `The merge checks of your work item could not run: ${reason}. Call finish_item again.`
          );
        }
      });
  };

  /**
   * Moves a live item to a finished state; finished work stays as it ended.
   * Its workspace is settled next ({@link settleSoon}): retired or held once
   * nothing holds it, which its session, still in the turn that ended it,
   * does until it sleeps.
   *
   * An item whose work landed (its `landed`) and that runs again (a word
   * from the reader, its parent or its project's lead, {@link reopen}; a
   * continuation of its session, `continuedIn`; work found since its landing,
   * {@link finishable}) stays done however its follow-up ends without
   * landing: blocked, a failed or third quiet turn, its session failing or
   * gone, its budget, a stop. The reason is its `error`, and its task goes to
   * review with it (dispatch.ts `settle`). On nightly 3944 Caw's send-back
   * of a landed design build ended blocked and failed the attempt that had
   * landed it, its task back in its first stage.
   */
  const finish = (
    item: WorkItemRow,
    change: Parameters<DbShape["updateWorkItem"]>[1],
    { stopped = false }: { stopped?: boolean } = {}
  ): WorkItemRow => {
    if (!LIVE.has(item.state)) {
      return item;
    }
    // A held stop ({@link report}): only the stop itself ends it, once its
    // session's end is confirmed.
    const current = db.workItem(item.id) ?? item;
    if (current.stoppingAt && !stopped) {
      return current;
    }
    // Its landing, if one runs, ends with it: every command of it stops.
    landingStops.get(item.id)?.abort();
    const { landed } = db.workItem(item.id) ?? item;
    const kept =
      landed && (change.state === "failed" || change.state === "cancelled")
        ? {
            state: "done" as const,
            error: change.error ?? FOLLOW_UP_STOPPED,
          }
        : {};
    const ended =
      update(item.id, {
        ...change,
        ...kept,
        gatePasses: null,
        endedAt: new Date(),
      }) ?? item;
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
    return {
      body: `${error}${reportLine(ended)}`,
      failed: ended.state === "failed",
    };
  };

  /**
   * A live item's turn that ended quietly, with nothing queued for its
   * session: the "still open" message, and the {@link QUIET_TURNS}th in a
   * row fails it, its parent told.
   */
  const quietTurn = (
    row: InstanceRow,
    item: WorkItemRow
  ): { body: string; failed: boolean } | undefined => {
    const turns = (quiet.get(item.id) ?? 0) + 1;
    if (turns >= QUIET_TURNS) {
      quiet.delete(item.id);
      const ended = finish(item, { state: "failed", error: QUIET_ERROR });
      console.log(`[work-items] ${item.id}: ${QUIET_ERROR}`);
      return {
        body: `${QUIET_ERROR}${reportLine(ended)}`,
        failed: ended.state === "failed",
      };
    }
    quiet.set(item.id, turns);
    tell(
      row,
      `Your work item is still open. ${FINISH_LINE} Use wait_item for a bounded wait on a command you started.`
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
          origin: WAKE_ORIGIN,
        },
      },
    });
  };

  /**
   * The one expiry path for a wait whose time has passed: a live timer, an
   * overdue startup wait, or a turn ending past the deadline (`turnOver`).
   * A turn under way at the deadline is never the session's own work (its
   * first call of its own ended the wait, {@link worked}): it is a word that
   * reached it, or the turn that declared the wait. That turn's end settles
   * the wait ({@link waitingTurn}, `turnState` going idle), and a re-check
   * stands meanwhile, so a turn whose end never comes holds no wait for
   * ever. Otherwise the wait ends and the session is told so (`words`, else
   * that its wait is over), with a minute to resume before its parent hears
   * it did not.
   */
  const endWait = (id: string, turnOver = false, words?: string): void => {
    const item = db.workItem(id);
    if (!item?.waitUntil) {
      disarmWait(id);
      return;
    }
    const [row] = db.getInstancesByIds([item.instanceId]);
    const live = !!row && LIVE.has(item.state);
    if (live && !turnOver && inTurn(row)) {
      lifetime.cancel(waitTimers.get(id));
      waitTimers.set(
        id,
        lifetime.after(WAIT_RESUME_GRACE_MS, () => endWait(id, false, words))
      );
      return;
    }
    const reason = item.waitReason;
    clearWait(item);
    if (row && live) {
      const resumeBy = new Date(Date.now() + WAIT_RESUME_GRACE_MS);
      const resuming = update(id, { waitResumeBy: resumeBy }) as WorkItemRow;
      armWait(resuming);
      tell(
        row,
        words ??
          `Your wait is over: ${reason}. Continue, then call finish_item.`
      );
    }
  };
  /**
   * THE wake of an item waiting for a machine its gate needs
   * ({@link capableWaitReason}): once one with that capability is online,
   * its wait ends ({@link endWait}) and its session is told to call
   * finish_item again. The sweep looks, so a machine that registers, or
   * whose reported OS changes, wakes it within one sweep.
   */
  const wakeCapable = (): void => {
    for (const item of db.waitingWorkItems()) {
      const needs = capableWaitFor(item.waitReason);
      const [machine] = needs
        ? capableMachines(db.listAgents(), needs, online)
        : [];
      if (needs && machine && LIVE.has(item.state)) {
        endWait(
          item.id,
          false,
          capableOnline(needs, machineName(machine.machineId))
        );
      }
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
            `${item.title}: the delegate did not resume within 60 seconds of being told its wait was over.`,
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
  /**
   * A turn that ended with its item's wait still declared: a waiting turn,
   * which counts toward no quiet-turn failure, whatever started it. Its time
   * passed, the wait ends here and the session is told ({@link endWait}).
   */
  const waitingTurn = (item: WorkItemRow): boolean => {
    if (!item.waitUntil) {
      return false;
    }
    quiet.delete(item.id);
    if (item.waitUntil.getTime() <= Date.now()) {
      endWait(item.id, true);
    }
    return true;
  };

  /** A machine as a gate step's line names it: its hostname as the fleet shows it. */
  const machineName = (machineId: string): string =>
    machineCalled(machineId, db.listAgents());

  /**
   * Whether the landing `item` is in was stopped ({@link LandingDeps.stopped}):
   * the item ended (a stop cancels it and clears its `landingSince`), or its
   * row marks a landing other than the one `item` was read in.
   */
  const landingStopped = (item: WorkItemRow): (() => boolean) => {
    const since = item.landingSince?.getTime();
    return () => {
      const now = db.workItem(item.id);
      return !(
        now &&
        LIVE.has(now.state) &&
        since !== undefined &&
        now.landingSince?.getTime() === since
      );
    };
  };

  /**
   * A finished item running again in the same session: its held workspace's
   * hold ended, its result and end cleared. It ends again the usual way, with
   * a new report to its parent.
   */
  const rerun = (item: WorkItemRow): WorkItemRow => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (workspace) {
      continued(workspace);
    }
    return (
      update(item.id, {
        state: "running",
        result: null,
        error: null,
        stoppedBy: null,
        endedAt: null,
        dismissedAt: null,
        heldAt: null,
        heldAsleepAt: null,
      }) ?? item
    );
  };

  /**
   * Whether a done item's workspace holds work since it landed: commits no
   * branch of `origin` has, or changes not committed (its outputs passed
   * over). Its session made them after the item ended, in the turn that
   * landed it, and a `finish_item` lands them. A call repeated after its
   * landing settled (a hub restarted under it) finds none: everything it
   * landed is on `origin`.
   * A held workspace holds such work by its record. Git inside its boundary,
   * never waiting; a read git cannot answer throws its words.
   */
  const followsUp = async (item: WorkItemRow): Promise<boolean> => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (
      !workspace ||
      workspace.state === "archived" ||
      workspace.checksFor ||
      workspace.host
    ) {
      return false;
    }
    if (isHeld(workspace)) {
      return true;
    }
    const read = await command(
      workspace.machineId,
      workspace.path,
      `${SAFE_GIT_SHELL}git rev-list --count HEAD --not --remotes=origin && ${statusCommand(item.outputs ?? [])} | wc -l`,
      GIT_TIMEOUT_MS,
      refOf(workspace),
      { noWait: true }
    );
    const counts = read.stdout.trim().split(SPACES).map(Number);
    if (
      read.exitCode !== 0 ||
      counts.length !== 2 ||
      counts.some((count) => !Number.isInteger(count))
    ) {
      throw new Error(
        `git in workspace ${handle(workspace.id)} on ${machineName(workspace.machineId)} said: ${(read.stderr || read.stdout).trim() || `exit ${read.exitCode}`}`
      );
    }
    return counts.some((count) => count > 0);
  };

  /**
   * The session's live item that `finish_item` may finish; the done result,
   * when it is done already with nothing since ({@link followsUp}); or the
   * refusal. A done item whose workspace holds work since runs again
   * ({@link rerun}), and this call lands that work: on 2026-10-17 a
   * follow-up commit could not land, the call answering the old report.
   */
  const finishable = async (
    instanceId: string
  ): Promise<{ row: InstanceRow; item: WorkItemRow } | string> => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row ? itemOf(row) : undefined;
    if (!(row && item)) {
      throw new WorkItemRefusal(409, "No work item is open on this session.");
    }
    if (item.state === "done") {
      if (!(await followsUp(item))) {
        return `The item is done.\n\n${item.result ?? ""}\n\nEnd your turn.`;
      }
      console.log(
        `[work-items] ${item.id}: finish_item on done work whose workspace holds work since it landed: it runs again to land it`
      );
      return { row, item: rerun(item) };
    }
    if (!LIVE.has(item.state)) {
      throw new WorkItemRefusal(
        409,
        `${item.title} (${handle(item.id)}) is ${item.state}; finish_item finishes live work only.`
      );
    }
    if (item.stoppingAt) {
      throw new WorkItemRefusal(409, workWords.stoppingRefused);
    }
    // A completing item's submission waits on its own delegates: a new
    // call replaces it ({@link completeIfDrained}).
    if (landingHolds(item)) {
      throw new WorkItemRefusal(
        409,
        "the merge checks already run for this item; their outcome comes to you when they end"
      );
    }
    // A stop cancels every command its landing has running (landingStops);
    // the landing settles once they answer, and one runs at a time per item.
    if (finishing.has(item.id)) {
      throw new WorkItemRefusal(
        409,
        "the landing this item's stop cut short is still ending (its commands are being cancelled); call finish_item again in a minute"
      );
    }
    return { row, item };
  };

  /**
   * What `item`'s clone holds outside its commits that would keep its
   * workspace held once the item ends (agent workspace.ts `holding`), read
   * inside its boundary: changed and untracked files (`git status`), stashes,
   * and files kept out of git by the clone's own excludes rather than a
   * tracked `.gitignore` (core `excludedPaths`); the item's outputs, which
   * the hub collects, pass. The words that send `finish_item` back naming
   * them, or nothing when there are none. Before this, scratch a delegate
   * left in its clone (eval output, captures, notes, a stash) held its
   * workspace after its work had landed, for the owner to sort (2026-10-18).
   */
  const leftoversIn = async (
    item: WorkItemRow
  ): Promise<string | undefined> => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (workspace?.state !== "active" || workspace.host) {
      return;
    }
    const run = runIn(workspace, item);
    const read = async (what: string, cmd: string): Promise<string> => {
      const result = await run(cmd, GIT_TIMEOUT_MS);
      if (result.exitCode !== 0) {
        throw new Error(
          `the hub could not read ${what} in workspace ${handle(workspace.id)}: ${failedWith(result)}`
        );
      }
      return result.stdout;
    };
    const outputs = item.outputs ?? [];
    const pathspec =
      outputs.length > 0
        ? ` -- .${outputs.map((path) => ` ${quote(`:(exclude,literal)${path}`)}`).join("")}`
        : "";
    const status = (
      await read("its uncommitted files", statusCommand(outputs))
    ).trimEnd();
    const stashes = (await read("its stashes", "git stash list")).trimEnd();
    // Exit 1 from check-ignore: nothing ignored, which is no failure.
    const rules = await read(
      "its excluded files",
      `git ${IGNORED_STATUS.join(" ")}${pathspec} | tr '\\0' '\\n' | sed -n 's/^!! //p' | tr '\\n' '\\0' | git check-ignore -v -z --stdin; [ $? -le 1 ]`
    );
    const excluded = rules
      ? excludedPaths(
          workspace.path,
          await read(
            "its tracked .gitignore files",
            "git ls-files -z -- ':(glob)**/.gitignore'"
          ),
          rules
        )
      : [];
    if (!(status || stashes || excluded.length > 0)) {
      return;
    }
    return [
      "Not finished: your clone holds work that is in no commit, so its workspace would be kept after this item ends, for someone else to sort out. Commit what belongs to the work, delete what does not, or move scratch (notes, captures, eval output, logs) to $TMPDIR, which goes with the workspace; then call finish_item again.",
      ...(status ? [`Changed and untracked files:${fenced(status)}`] : []),
      ...(stashes
        ? [
            `Stashes (apply and commit, or \`git stash drop\`):${fenced(stashes)}`,
          ]
        : []),
      ...(excluded.length > 0
        ? [
            `Kept out of git by the clone's own excludes (.git/info/exclude or an untracked .gitignore), not the repository's:${fenced(excluded.join("\n"))}`,
          ]
        : []),
    ].join("\n\n");
  };

  /**
   * The project's repository on a machine, which a gate workspace there is
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
   * The workspace that runs `workspace`'s landing gate steps on `machineId`
   * (the iOS build on a Mac): the one cut there before, or a new one cut from
   * the project's repository on that machine. It stays between runs, so a
   * build there is incremental; it is archived with `workspace`.
   */
  const gateWorkspace = async (
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

  /**
   * Runs the landing gate's `steps` in order. A step runs in the workspace's
   * worktree, on its machine, inside its boundary. A step on another machine
   * (the iOS build on a Mac) runs there, in the workspace's gate workspace
   * ({@link gateWorkspace}), inside that one's boundary, at the workspace's
   * last commit: the commits past its base go over as a git bundle, once per
   * run and machine. Uncommitted work stays where it is. `how` says whether
   * its steps may wait ({@link GateHow}).
   */
  const runGate = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    steps: GateStep[],
    how: GateHow,
    passed?: (step: GateStep) => void
  ): Promise<GateRun> => {
    let commit: Promise<WorkspaceCommit> | undefined;
    /** The step running now, for the words of its waits. */
    let current: GateStep | undefined;
    /** What a step waits for, as the item's status says it ({@link GateHow}). */
    const queued = (words: string | null): void =>
      how.say(words, current?.name);
    /** The item's end, which cancels every step running ({@link landingStops}). */
    const stop = landingStops.get(item.id)?.signal;
    /**
     * How a step's commands run: a pause that cancels one hands it back
     * here; in the turn, one that would wait throws {@link WouldWait}; the
     * item's end cancels it.
     */
    const asStep = (step: GateStep): CommandOptions => ({
      onWait: queued,
      what: "merge check",
      movable: true,
      noWait: how.inTurn,
      gate: `the merge checks of “${item.title}” (${item.id.slice(0, 8)}): ${step.name}`,
      stop,
    });
    /**
     * Waits out a pause of the machine a step runs on, the item's status
     * saying it; at once when it is not paused. In the turn it throws
     * {@link WouldWait} instead; the item's end throws {@link CommandStopped}.
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
      await Promise.race([machineFree(machineId), whenStopped(stop)]);
      queued(null);
      if (stop?.aborted) {
        throw new CommandStopped(
          `${item.title} ended while its merge checks waited for a pause to end`
        );
      }
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
    /** The gate workspace on `machineId`, at the workspace's commit. */
    const atCommit = (
      machineId: string
    ): Promise<{ at: WorkspaceRow; head: string }> =>
      once(placed, machineId, async () => {
        const at = await gateWorkspace(workspace, item, machineId);
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
    /**
     * One step on another machine; a machine that cannot run it fails the
     * step in its words. Undefined when a pause cancelled it, to run again.
     */
    const runElsewhere = async (
      machineId: string,
      step: GateStep,
      limit: number
    ): Promise<Ran | undefined> => {
      const on = `on ${machineName(machineId)}`;
      try {
        const { at, head } = await atCommit(machineId);
        const complete = await command(
          machineId,
          at.path,
          step.command,
          limit,
          refOf(at),
          asStep(step)
        );
        return complete.cancelled
          ? undefined
          : { where: `${on} at ${head.slice(0, 9)}`, complete };
      } catch (error) {
        // The item's end cancelled it: the landing stops, no step failed.
        if (error instanceof CommandStopped) {
          throw error;
        }
        return {
          where: on,
          complete: {
            exitCode: 1,
            stdout: "",
            stderr: `The hub could not run this step ${on}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    };
    /**
     * Where a step runs: the machine it names, else the workspace's. A step
     * that `needs:` a capability whose machine is paused moves to one with
     * it that is not, when one is online ({@link gateMachine}).
     */
    const machineFor = (step: GateStep): string => {
      const named = step.machine ?? workspace.machineId;
      return step.needs && item.projectId && machinePaused(named)
        ? (gateMachine(workspace, item.projectId, step.needs)?.machineId ??
            named)
        : named;
    };
    /**
     * One run of a step where `machineId` is: in the workspace, or its gate
     * workspace there. Undefined when a pause cancelled it.
     */
    const runStep = async (
      machineId: string,
      step: GateStep,
      limit: number
    ): Promise<Ran | undefined> => {
      if (machineId !== workspace.machineId) {
        return await runElsewhere(machineId, step, limit);
      }
      const complete = await command(
        workspace.machineId,
        workspace.path,
        step.command,
        limit,
        refOf(workspace),
        asStep(step)
      );
      return complete.cancelled ? undefined : { complete, where: undefined };
    };
    if (how.inTurn) {
      refuseAway(steps, workspace.machineId, machineName);
    }
    try {
      const outcomes: StepOutcome[] = [];
      /** A failed step with `on-fail: stop`, which leaves every step after it unrun. */
      let stopped: GateStep | undefined;
      for (const step of steps) {
        current = step;
        if (stopped) {
          outcomes.push({
            step,
            unrun: `${stopped.name} failed first`,
            passed: false,
            exitCode: 0,
            durationMs: 0,
            result: { exitCode: 0, stdout: "", stderr: "" },
          });
          continue;
        }
        const limit = (step.timeoutSec ?? GATE_TIMEOUT_SEC) * 1000;
        let started = 0;
        // A step a pause cancels is no outcome and no attempt: it waits the
        // pause out (or moves, a step that `needs:` a capability), then runs
        // again from the start.
        let ran: Ran | undefined;
        while (!ran) {
          const machineId = machineFor(step);
          // biome-ignore lint/performance/noAwaitInLoops: steps run in order, each once its machine runs work
          await unpaused(machineId);
          started = Date.now();
          // A step that ends while waiting (killed, past the most a wait may
          // last, or a machine that could not run it) leaves no wait behind it.
          ran = await runStep(machineId, step, limit).finally(() =>
            queued(null)
          );
        }
        const { complete, where } = ran;
        const result = gateTails(complete);
        outcomes.push({
          step,
          result,
          where,
          exitCode: result.exitCode,
          durationMs: Date.now() - started,
          passed: result.exitCode === 0,
        });
        if (result.exitCode === 0) {
          passed?.(step);
        } else if (step.stopsRest) {
          stopped = step;
        }
      }
      return { declared: true, outcomes };
    } catch (error) {
      waitedIn(error, current?.name ?? "the merge checks");
    }
  };

  /**
   * What a gate run in the workspace runs on ({@link TreeState}): HEAD's
   * tree (`git rev-parse HEAD^{tree}`), with the item's outputs' contents
   * beside it when it has outputs, and the tree of each path a step declares
   * as its inputs, `inputPaths` (`git rev-parse HEAD:<path>`), while nothing
   * else is uncommitted; landing.ts lands only such a tree. Undefined while
   * something else is uncommitted: those steps read files no tree names, so
   * their passes are neither kept nor matched. `noWait` in a landing turn.
   */
  const treeState = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    inputPaths: readonly string[],
    noWait: boolean
  ): Promise<TreeState | undefined> => {
    const outputs = item.outputs ?? [];
    // One hash a line per output; a folder's is the hash of its files' list
    // with each file's hash.
    const hashed =
      outputs.length > 0
        ? ` && for p in ${outputs.map(quote).join(" ")}; do if [ -d "$p" ]; then find "$p" -type f | LC_ALL=C sort | while IFS= read -r f; do echo "$f $(git hash-object -- "$f")"; done | git hash-object --stdin; else git hash-object -- "$p"; fi || exit 1; done`
        : "";
    const declared =
      inputPaths.length > 0
        ? ` && for path in ${inputPaths.map(quote).join(" ")}; do git rev-parse --verify -q "HEAD:$path" || echo absent; done`
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
      lines.length !== 1 + outputs.length + inputPaths.length
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
      inputs: new Map(inputPaths.map((path, at) => [path, trees[at] ?? ""])),
      stamp: lines.join(" "),
    };
  };

  /**
   * {@link runGate} over `gate`'s steps, each run at most once on one tree:
   * a step that passed on the tree the workspace holds now is not run again;
   * its outcome says where it passed. A step that declares its inputs
   * (`on:`) is matched by those paths' trees instead, so a rebase that left
   * them alone does not run it again: an iOS compile on `apps/apple` runs
   * once per apps/apple tree, at finish_item, and not again on the rebased
   * tree when the rebase left apps/apple as it was. `stage` names this run
   * for the lines of the steps it lets skip later; `how`, whether its steps
   * may wait ({@link GateHow}). A pass is kept only when the workspace held
   * the same trees before and after the run.
   */
  const gateOnce = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate,
    stage: string,
    how: GateHow
  ): Promise<GateRun> => {
    const { steps } = gate;
    const inputPaths = inputPathsOf(steps);
    const state = await treeState(workspace, item, inputPaths, how.inTurn);
    const kept = passesOf(item.id);
    const prior = steps.map((step): string | undefined => {
      if (!state || step.nothing) {
        return undefined;
      }
      const { key, said } = passKey(step, state);
      return priorPass(step, kept.get(key) ?? [], said);
    });
    const due = steps.filter(
      (step, at) => !step.nothing && prior[at] === undefined
    );
    // Each pass is kept as its step passes, so a gate a restart cuts runs
    // again from the step it was on; a run whose workspace moved under it
    // lets this run's passes go at its end.
    const taken: { key: string; pass: GatePass }[] = [];
    const passed = state
      ? (step: GateStep) => {
          const one = {
            key: passKey(step, state).key,
            pass: { command: step.command.trim(), stage },
          };
          taken.push(one);
          keepPass(item.id, one.key, one.pass);
        }
      : undefined;
    const run =
      due.length > 0
        ? await runGate(workspace, item, due, how, passed)
        : { declared: gate.declared, outcomes: [] };
    if (
      taken.length > 0 &&
      (await treeState(workspace, item, inputPaths, how.inTurn))?.stamp !==
        state?.stamp
    ) {
      dropPasses(item.id, taken);
    }
    const ran = [...run.outcomes];
    return {
      declared: gate.declared,
      outcomes: steps.map((step, at) => {
        if (step.nothing) {
          return {
            step,
            nothing: step.nothing,
            passed: true,
            exitCode: 0,
            durationMs: 0,
            result: { exitCode: 0, stdout: "", stderr: "" },
          };
        }
        const skipped = prior[at];
        return skipped === undefined
          ? (ran.shift() as StepOutcome)
          : {
              step,
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
   * ({@link landingWait}); `noWait`, in a landing turn, it makes none and
   * throws {@link WouldWait} instead. The item's end cancels it while its
   * landing runs ({@link landingStops}), all but a push (`lands`), which
   * runs to its end.
   */
  const runIn =
    (workspace: WorkspaceRow, item: WorkItemRow) =>
    (
      cmd: string,
      timeoutMs: number,
      noWait = false,
      lands = false,
      moves?: string
    ): Promise<CommandResult> =>
      command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}${cmd}`,
        timeoutMs,
        refOf(workspace),
        {
          onWait: (words) => landingWait(item.id, words),
          noWait,
          ...(moves ? { moves } : {}),
          ...(lands ? {} : { stop: landingStops.get(item.id)?.signal }),
        }
      );

  /**
   * The landing gate's passes on the tree `sha` holds (WorkLanding `gate`):
   * the tree, and each step that passed in `run`, the gate's last run, on
   * the tree that landed. Nothing when git cannot name the tree.
   */
  const gatePassOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    sha: string,
    run: GateRun
  ): Promise<{ passed: string[]; tree: string } | undefined> => {
    const read = await runIn(workspace, item)(
      `git rev-parse ${sha}^{tree}`,
      GIT_TIMEOUT_MS,
      false,
      true
    );
    const tree = read.exitCode === 0 ? read.stdout.trim() : "";
    if (!TREE_SHA.test(tree)) {
      return;
    }
    const passed = run.outcomes
      .filter((outcome) => outcome.passed)
      .map((outcome) => outcome.step.command.trim());
    return { tree, passed: [...new Set(passed)] };
  };

  /** HEAD of the workspace's checkout, read whatever stops the item's landing; nothing when git cannot say. */
  const headOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string | undefined> => {
    const read = await runIn(workspace, item)(
      "git rev-parse HEAD",
      GIT_TIMEOUT_MS,
      false,
      true
    );
    return read.exitCode === 0 ? read.stdout.trim() : undefined;
  };

  /**
   * The landing rebased workspace `id`'s commits onto origin's `base`, HEAD
   * going `from` → `to` (landing.ts `onBase`, landed or not): its row's
   * `movedUntold` says so to the next message its session reads
   * ({@link WorkItems.movedTold}). One still untold keeps where it started:
   * a clone cut again stays the new clone it is, at `to` now; an earlier
   * landing's move keeps its `from`.
   */
  const movedByLanding = (
    id: string,
    base: string,
    from: string,
    to: string
  ): void => {
    const [row] = db.workspacesNamed(id);
    const prior = row?.movedUntold ?? undefined;
    const move: CheckoutMove =
      prior?.kind === "recut"
        ? { ...prior, commit: to }
        : { kind: "landing", branch: base, from: prior?.from ?? from, to };
    db.updateWorkspace(id, { movedUntold: move });
  };

  /**
   * How an item's landing gate runs in its landing on `base` (landing.ts):
   * in its turn it never waits; while it gates on top of the branch, its
   * status says so (and why, when it stepped out of its turn: `stepped`),
   * with what each step waits for there.
   */
  const landingHow = (
    itemId: string,
    base: string,
    turning: boolean,
    stepped: string | undefined
  ): GateHow => {
    if (turning) {
      return { inTurn: true, say: (words) => landingWait(itemId, words) };
    }
    const gating = stepped
      ? `stepped out of its turn to land (${stepped}), so running the merge checks again on top of ${base}`
      : `running the merge checks on top of ${base}`;
    return {
      inTurn: false,
      say: (words, step) =>
        landingWait(
          itemId,
          words ? `${gating}: ${stepWaitWords(words, step)}` : gating
        ),
    };
  };

  /** The item in the landing queue: named as `“title” (id)`, its wait its status. */
  const turnOf = (item: WorkItemRow): LandingTurn => ({
    who: `“${item.title}” (${item.id.slice(0, 8)})`,
    onWait: (words) => landingWait(item.id, words),
  });

  /**
   * Lands a finished item's commits on its workspace's base branch
   * (landing.ts): it gates on top of the branch outside the queue, the
   * landing gate's steps run on the rebased tree, its status saying so and
   * what each step waits for there; then it takes its turn, where only the
   * steps whose inputs the turn's rebase moved run again, and none waits.
   * Answers the line the report and the delegate read when the item can be
   * done; the text that hands it back to its delegate (`retry`: uncommitted
   * work, a conflict, a gate that failed); or the line that says why it
   * could not land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate
  ): Promise<Landed> => {
    const { base } = workspace;
    /** The last gate's run on top of the branch and the turn's, for the report. */
    const runs: { gate: GateRun; turn?: GateRun } = {
      gate: { declared: gate.declared, outcomes: [] },
    };
    /** The times it stepped out of its turn, and why the last time. */
    const stepped: string[] = [];
    /** The landing gate on the tree the workspace holds. */
    const onBaseGate = async (
      turning: boolean
    ): Promise<Failed<GateRun> | undefined> => {
      const how = landingHow(item.id, base, turning, stepped.at(-1));
      how.say(null);
      landingAt(item, turning ? "turn" : "gating");
      const run = await gateOnce(
        workspace,
        item,
        gate,
        turning
          ? `in its turn to land on ${base}`
          : `while it ran the merge checks on top of ${base}`,
        how
      );
      if (runFailed(run)) {
        return { kind: "gate-failed", failing: run };
      }
      if (turning) {
        runs.turn = run;
      } else {
        runs.gate = run;
      }
      // Gated, it says next that it waits its turn, or nothing when it takes
      // it at once. A failure's or an error's words go as settleLanding ends.
      landingWait(item.id, null);
    };
    const before = await headOf(workspace, item);
    const outcome = await land<GateRun>(base, {
      run: runIn(workspace, item),
      turn: turnOf(item),
      check: onBaseGate,
      onStepOut: (words) => {
        stepped.push(words);
      },
      queue: landings,
      skip: item.outputs ?? [],
      stopped: landingStopped(item),
      ...(item.projectId ? { repo: item.projectId } : {}),
    });
    const after = await headOf(workspace, item);
    if (before && after && before !== after) {
      movedByLanding(workspace.id, base, before, after);
    }
    const ran = runs.gate;
    switch (outcome.kind) {
      case "stopped":
        return stoppedLanding(item);
      case "landed": {
        const gated = await gatePassOf(
          workspace,
          item,
          outcome.sha,
          runs.turn ?? ran
        );
        return {
          kind: "done",
          gate: ran,
          landed: {
            sha: outcome.sha,
            onto: outcome.onto,
            ...(gated ? { gate: gated } : {}),
          },
          line: landedLine(base, outcome, runs.turn, stepped),
        };
      }
      case "nothing":
        return {
          kind: "done",
          gate: ran,
          line: `Nothing to land: ${base} already holds every commit in this workspace.`,
        };
      case "no-remote":
        return {
          kind: "done",
          gate: ran,
          line: "Not landed: this workspace's repository has no remote.",
        };
      case "dirty":
        return { kind: "retry", text: dirtyText(outcome.files, base) };
      case "conflict":
        return {
          kind: "retry",
          text: `Not landed: your commits conflict with origin/${base} in:${fenced(outcome.files)}\nThe hub undid its rebase. Rebase onto origin/${base} yourself, resolve the conflicts, commit, and call finish_item again.`,
        };
      case "gate-failed":
        return {
          kind: "retry",
          text: gateFailedText(
            outcome.failing,
            `your commits rebased onto origin/${base}, which your branch is now on top of`
          ),
        };
      case "refused":
        return {
          kind: "refused",
          gate: ran,
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
   * The report of an item that just ended through `finish_item`, to its parent;
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

  /** A pull request's body: what the delegate said it did, the landing gate's lines, and where its report is. */
  const pullRequestBody = (
    item: WorkItemRow,
    summary: string,
    gate: GateRun
  ): string => {
    const link = sessionUrl?.(item.instanceId);
    const what = item.taskId
      ? `an attempt at ${item.taskId}`
      : `work item ${handle(item.id)}`;
    const lines = gate.declared ? gateLines(gate) : NO_CHECKS;
    return [
      summary.trim(),
      ...(lines ? [`Merge checks, run by the CawCo hub:\n${lines}`] : []),
      link
        ? `This is ${what}; its report and transcript: ${link}`
        : `This is ${what} (work item ${handle(item.id)}).`,
    ].join("\n\n");
  };

  /**
   * The commit the hub last pushed to `item`'s own branch
   * ({@link landingBranch}): the newest branch landing of every attempt at
   * its task in its project, the item's own earlier rounds among them, or of
   * the item alone when it is no task's. Undefined: the hub never pushed there.
   */
  const lastBranchPush = (item: WorkItemRow): string | undefined => {
    const now = db.workItem(item.id) ?? item;
    const sharing =
      now.projectId && now.taskId
        ? db
            .projectAttempts(now.projectId)
            .filter((attempt) => attempt.taskId === now.taskId)
        : [now];
    let last: WorkLanding | undefined;
    for (const { landed } of sharing) {
      if (
        landed &&
        landed.onto === null &&
        (!last || (landed.at ?? 0) > (last.at ?? 0))
      ) {
        last = landed;
      }
    }
    return last?.sha;
  };

  /**
   * Lands an item that lands `branch` or `pr`: its commits pushed as they are
   * to `cawco/<task or item>`, and for `pr`, a pull request against the base
   * branch opened, or the open one found. gh turning the pull request down
   * refuses the landing in gh's words. `gate` is the landing gate's run at
   * finish_item, on the tree pushed.
   */
  const landOnBranch = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string,
    gate: GateRun
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const pushed = await pushBranch(base, branch, {
      last: lastBranchPush(item),
      run: runIn(workspace, item),
      turn: turnOf(item),
      queue: landings,
      skip: item.outputs ?? [],
      stopped: landingStopped(item),
      ...(item.projectId ? { repo: item.projectId } : {}),
    });
    if (pushed.kind === "stopped") {
      return stoppedLanding(item);
    }
    if (pushed.kind !== "pushed") {
      return unpushed(
        pushed,
        workspace,
        branch,
        item.lands,
        machineName(workspace.machineId),
        gate
      );
    }
    const at = `${branch} at ${pushed.sha.slice(0, 9)}`;
    const landed: WorkLanding = {
      sha: pushed.sha,
      onto: null,
      at: Date.now(),
    };
    if (item.lands !== "pr") {
      return {
        kind: "done",
        gate,
        landed,
        line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
      };
    }
    return pullRequestFor(workspace, item, summary, gate, at, landed);
  };

  /**
   * Opens the pull or merge request for an item's pushed branch, or finds
   * the open one: the workspace's machine makes it through the forge adapter
   * of its origin's host with its own sign-in there (agent forges/,
   * `CONTROL_FORGE_POST`, the project's own repository, so no rule holds
   * it). A forge that turns it down refuses the landing in its words.
   */
  const pullRequestFor = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string,
    gate: GateRun,
    at: string,
    landed: WorkLanding
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const machine = machineName(workspace.machineId);
    const title =
      (item.projectId && item.taskId
        ? taskTitle?.(item.projectId, item.taskId)
        : undefined) ?? item.title;
    const origin = (
      await runIn(workspace, item)("git remote get-url origin", GIT_TIMEOUT_MS)
    ).stdout.trim();
    const write: ForgeWrite = {
      op: "pull_request",
      base,
      head: branch,
      title,
      body: pullRequestBody(item, summary, gate),
    };
    let verdict: ForgeVerdict;
    try {
      verdict = (await call(workspace.machineId, CONTROL_FORGE_POST, [
        null,
        { repo: origin, write },
      ])) as ForgeVerdict;
    } catch (error) {
      verdict = {
        kind: "refused",
        why: error instanceof Error ? error.message : String(error),
      };
    }
    const made =
      verdict.kind === "made"
        ? verdict.made
        : {
            ok: false,
            said:
              verdict.kind === "refused"
                ? verdict.why
                : "it was held, which a project's own repository never is",
          };
    if (!(made.ok && made.url)) {
      return {
        kind: "refused",
        gate,
        line: `Pushed to branch ${at}, but ${machine} did not open the pull or merge request. It said:${fenced(made.said)}\nOpen it by hand from ${branch} into ${base}, or start the task again once ${machine} can.`,
      };
    }
    return {
      kind: "done",
      gate,
      landed,
      prUrl: made.url,
      line: made.existing
        ? `Pushed to branch ${at}, which updates its open pull or merge request: ${made.url}`
        : `Pushed to branch ${at} and opened a pull or merge request against ${base}: ${made.url}`,
    };
  };

  /**
   * Lands a finished item the way it lands: on its base (the gate's steps
   * run on top of it, {@link landOnBase}), on a branch, through a pull
   * request, or not at all. `earlier` is the gate's run at finish_item: every
   * step for a branch or a pull request, none for an item landing on its base.
   */
  const landFinished = (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate,
    earlier: GateRun,
    summary: string
  ): Promise<Landed> => {
    switch (item.lands) {
      case "none":
        return Promise.resolve({
          kind: "done",
          gate: earlier,
          line: item.outputs?.length
            ? "Nothing pushed: this item lands none, and its outputs are what it hands in."
            : "Nothing pushed: this item lands none.",
        });
      case "branch":
      case "pr":
        return landOnBranch(workspace, item, summary, earlier);
      case "main":
        return landOnBase(workspace, item, gate);
    }
  };

  /**
   * Whether each of the item's outputs is in its workspace: a file, or a
   * folder of files (no link, which could lead anywhere), each within the
   * size the project's folder takes. The text that sends the item back when
   * one is not; else nothing.
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
      ? `Not landed: the item's outputs are not ready. ${problems.join(" ")} Then call finish_item again.`
      : undefined;
  };

  /**
   * One output's files read from the workspace, each at its whole path from
   * the workspace's root under the item's assets `folder` (so two folders of
   * one name never merge): the file itself, or every file of a folder, its
   * subfolders' included.
   */
  const outputFiles = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    output: string,
    folder: string
  ): Promise<{ path: string; content: Uint8Array }[]> => {
    const listed = await runIn(workspace, item)(
      outputFilesCommand(output),
      GIT_TIMEOUT_MS
    );
    if (listed.exitCode !== 0) {
      throw new Error(`${output} could not be listed: ${failedWith(listed)}`);
    }
    const files: { path: string; content: Uint8Array }[] = [];
    for (const path of listed.stdout.split("\n").filter(Boolean)) {
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
    return files;
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
      for (const output of outputs) {
        // biome-ignore lint/performance/noAwaitInLoops: one output at a time keeps each read under the command's output cap
        files.push(...(await outputFiles(workspace, item, output, folder)));
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

  /**
   * After `workspace`'s item landed on its base: the commit each workspace
   * up its `from` chain was cut at ({@link cutFrom}) is vouched landed when
   * `git cherry` in this clone, against the branch it just pushed, finds
   * every patch of it there (no `+` line), and that workspace is read again
   * ({@link resettleSoon}). A landing rebases a workspace's own commits, so
   * main carries new commits for them: the workspace it was cut from still
   * had the originals, on no remote, and stayed held for good (2026-10-18,
   * three of the 38 retired by hand). A patch the landing changed (a
   * conflict resolved on the way) is not vouched: that source stays held,
   * and its parent decides.
   */
  const vouchLanded = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<void> => {
    const target = quote(`origin/${workspace.base}`);
    let [row] = db.workspacesNamed(workspace.id);
    while (row?.cutFrom && !row.cutFrom.landed) {
      const from = row.cutFrom;
      if (!COMMIT_ID.test(from.commit)) {
        return;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one link of the chain at a time, each read in the clone that landed it
      const cherry = await runIn(workspace, item)(
        `git cherry ${target} ${from.commit}`,
        GIT_TIMEOUT_MS
      );
      if (
        cherry.exitCode !== 0 ||
        cherry.stdout.split("\n").some((line) => line.startsWith("+"))
      ) {
        console.log(
          `[workspaces] ${row.id}: the work of ${from.commit.slice(0, 9)}, cut from workspace ${from.workspace}, is not all on ${workspace.base}: ${cherry.exitCode === 0 ? "git cherry names patches not there" : failedWith(cherry)}`
        );
        return;
      }
      db.updateWorkspace(row.id, { cutFrom: { ...from, landed: true } });
      console.log(
        `[workspaces] ${row.id}: landed the work of workspace ${from.workspace} at ${from.commit.slice(0, 9)}; that workspace is read again`
      );
      resettleSoon(from.workspace);
      [row] = db.workspacesNamed(from.workspace);
    }
  };

  /**
   * A finished item whose gate passed at finish_item, to its end: its
   * outputs must be in its workspace (else it is back to running, told which
   * are not); then it lands as its row says (on its base, the rest of the
   * gate's steps run on the rebased tree) and its outputs are collected,
   * and it is done (or failed, when it could not land or its outputs did not
   * arrive) with the report the hub builds sent to its parent. Landed on its
   * base, what it was cut `from` is vouched landed ({@link vouchLanded}).
   */
  const landAndReport = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    gate: Gate,
    submission: WorkItemSubmission,
    earlier: GateRun
  ): Promise<{ done: boolean; text: string }> => {
    const settled = { landingSince: null, submission: null };
    const unready = item.outputs?.length
      ? await outputsProblem(workspace, item, item.outputs)
      : undefined;
    if (unready) {
      update(item.id, settled);
      return { done: false, text: unready };
    }
    const landing = await landFinished(
      workspace,
      item,
      gate,
      earlier,
      submission.summary
    );
    if (landing.kind === "retry") {
      update(item.id, settled);
      return { done: false, text: landing.text };
    }
    return await reportLanding(item, row, workspace, submission, landing);
  };

  /**
   * A landing that went or was refused, to the item's end: its outputs
   * collected when it went, the report built and sent, the item done or
   * failed. A stopped landing's item is settled already: its text alone.
   */
  const reportLanding = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    submission: WorkItemSubmission,
    landing: Exclude<Landed, { kind: "retry" }>
  ): Promise<{ done: boolean; text: string }> => {
    const settled = { landingSince: null, submission: null };
    // Its stop settled the row already.
    if (landing.kind === "stopped") {
      console.log(
        `[work-items] ${item.id}: its landing stopped as the item ended; nothing was landed or reported`
      );
      return { done: false, text: landing.text };
    }
    if (landing.kind === "done" && item.lands === "main") {
      await vouchLanded(workspace, item);
    }
    const collected =
      landing.kind === "done"
        ? await collectOutputs(workspace, item)
        : { ok: true, line: "" };
    const failure = failureOf(landing, collected);
    const shipped =
      landing.kind === "done" && !failure && submission.ship
        ? `\n\n${await shipWords(item, landing, submission.ship.notes)}`
        : "";
    const body = finishedReport(
      submission.summary,
      landing,
      collected,
      `${workspace.host ? "" : await changesSince(workspace, item)}${findingsBlock(submission.findings)}${shipped}`
    );
    const lines = landingGateLines(landing);
    const gateSaid = `${lines ? `\n\nMerge checks:\n${lines}` : ""}${shipped}`;
    const ended = finish(db.workItem(item.id) ?? item, {
      ...(failure ? { state: "failed", error: failure } : { state: "done" }),
      result: body,
      summary: submission.summary,
      headline: submission.headline,
      digest: `${submission.summary.trim()}\n${landing.line}${collected.line}`,
      ...landedFields(landing),
      ...settled,
    });
    const held = reportOrHold(row, ended, body, submission.headline);
    return landedText(landing, collected, gateSaid, held);
  };

  /**
   * What shipping a landed item said (ship.ts): its project's `Ship:`
   * command run on the hub's machine with the landed commit and `notes`, or
   * why it did not run.
   */
  const shipWords = async (
    item: WorkItemRow,
    landing: Extract<Landed, { kind: "done" }>,
    notes: string
  ): Promise<string> => {
    const sha = landing.landed?.sha;
    if (!(item.lands === "main" && landing.landed?.onto && sha)) {
      return "Not shipped: only work that lands on main ships, and this item put nothing there.";
    }
    const ship = item.projectId ? await projectShip(item.projectId) : undefined;
    if (!(ship && item.projectId)) {
      return `Not shipped: this project's ${GATE_FILE} declares no Ship: command, so the hub has nothing to ship it with. The nightly ships it.`;
    }
    const hub = hubMachineId();
    const checkout = hub ? repositoryOn(item.projectId, hub) : undefined;
    if (!checkout) {
      return "Not shipped: the hub's machine holds no checkout of this project to run its Ship: command in. The nightly ships it.";
    }
    try {
      return await shipLanded({
        checkout,
        command: ship,
        commit: sha,
        notes,
      });
    } catch (error) {
      return `Not shipped: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /** The paths of the workspace's changes against its target, for the steps that run `on:` some. */
  const changedPaths = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string[]> => {
    const diff = await runIn(workspace, item)(
      changedPathsCommand(quote(`origin/${workspace.base}`)),
      GIT_TIMEOUT_MS
    );
    if (diff.exitCode !== 0) {
      throw new Error(
        `the hub could not read the item's changes against origin/${workspace.base} for the on: steps of its merge checks: ${failedWith(diff)}`
      );
    }
    return diffPaths(diff.stdout);
  };

  /**
   * The online machine with `capability` a step that `needs:` it runs on:
   * one holding the workspace's gate workspace already (its build is
   * incremental), else one with the project's repository, else any; among
   * the machines not paused first. With every one paused, a paused one: its
   * step waits for the pause's end, its item's status saying so.
   */
  const gateMachine = (
    workspace: WorkspaceRow,
    projectId: string,
    capability: RunsOnCapability
  ) => {
    const capable = capableMachines(db.listAgents(), capability, online);
    const held = new Set(
      db.checkWorkspacesOf(workspace.id).map((each) => each.machineId)
    );
    const pick = (among: typeof capable) =>
      among.find((each) => held.has(each.machineId)) ??
      among.find((each) => repositoryOn(projectId, each.machineId)) ??
      among[0];
    return (
      pick(capable.filter((each) => !machinePaused(each.machineId))) ??
      pick(capable)
    );
  };

  /**
   * THE landing gate of an item: what stands between its finished work and
   * where it lands, and what no session writes. The steps its project
   * declares in gate.md (gate-file.ts), in order: each `on:` step only when
   * the item's diff against its target touches one of its paths, and each
   * `needs:` step on an online machine with that capability, at the item's
   * last commit, in the workspace's gate workspace there ({@link runGate}).
   * A project with no gate.md declares none. An item that lands none has no
   * gate: it puts nothing anywhere. `refusal`, in words, when gate.md does
   * not read or no machine a due step needs is online (then `needs`, the
   * capability the item waits for).
   */
  const gateSteps = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<Gate | GateRefusal> => {
    const { projectId } = item;
    if (item.lands === "none" || !projectId) {
      return { declared: false, steps: [] };
    }
    const declared = await projectGate(projectId);
    if (declared.kind === "none") {
      return { declared: false, steps: [] };
    }
    if (declared.kind === "unreadable") {
      return {
        refusal: `Not landed: this project's ${GATE_FILE}, which declares its merge checks, does not read, so the hub cannot tell what to run. ${declared.problems.join(" ")} It is in the project's folder on the hub: ask your parent or the person to fix it there, then call finish_item again.`,
      };
    }
    const touched = declared.steps.some((step) => step.inputs || step.targetMap)
      ? await changedPaths(workspace, item)
      : [];
    const maps = await targetMapsOf(workspace, item, declared.steps, touched);
    if ("refusal" in maps) {
      return maps;
    }
    const steps: GateStep[] = [];
    for (const step of declared.steps) {
      const due = dueStep(
        workspace,
        projectId,
        step,
        touched,
        step.targetMap ? maps.get(step.targetMap) : undefined
      );
      if ("refusal" in due) {
        return due;
      }
      steps.push(...due.steps);
    }
    return { declared: true, steps };
  };

  /** The target map of every `targets:` step in `steps`, by its path ({@link targetMapOf}), or the first refusal. */
  const targetMapsOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    steps: readonly DeclaredStep[],
    touched: readonly string[]
  ): Promise<Map<string, TargetMap> | GateRefusal> => {
    const maps = new Map<string, TargetMap>();
    for (const path of new Set(steps.flatMap((step) => step.targetMap ?? []))) {
      // biome-ignore lint/performance/noAwaitInLoops: one map per gate, and a gate names one
      const map = await targetMapOf(workspace, item, path, touched);
      if ("refusal" in map) {
        return map;
      }
      maps.set(path, map);
    }
    return maps;
  };

  /**
   * The target map at `path` (app-targets.ts) as the tree that lands holds
   * it: the item's own (HEAD's) when its diff `touched` changes it, else its
   * target's (`origin/<base>`). A refusal in words when it does not read.
   */
  const targetMapOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    path: string,
    touched: readonly string[]
  ): Promise<TargetMap | GateRefusal> => {
    const ref = touched.includes(path) ? "HEAD" : `origin/${workspace.base}`;
    const shown = await runIn(workspace, item)(
      `git show ${quote(`${ref}:${path}`)}`,
      GIT_TIMEOUT_MS
    );
    const map =
      shown.exitCode === 0
        ? readTargetMap(shown.stdout)
        : { problem: failedWith(shown) };
    return "problem" in map
      ? {
          refusal: `Not landed: this project's merge checks build what its target map, ${path}, gives a change, and ${ref}'s ${path} does not read: ${map.problem}. Write it with apps/apple/scripts/targets-map.sh --write on the Mac and commit it, or ask your parent; then call finish_item again.`,
        }
      : map;
  };

  /**
   * One declared step as the gate runs it for an item whose diff is
   * `touched` (app-targets.ts `gateStepFor`, with its target `map` for a
   * `targets:` step): none, or one with nothing to run, when the diff
   * leaves what it reads alone; on an online machine with the capability it
   * `needs:`, else `refusal`, naming the changed paths that made it due.
   */
  const dueStep = (
    workspace: WorkspaceRow,
    projectId: string,
    step: DeclaredStep,
    touched: readonly string[],
    map: TargetMap | undefined
  ): { steps: GateStep[] } | GateRefusal => {
    const shaped = gateStepFor(step, touched, map);
    if ("steps" in shaped) {
      return shaped;
    }
    const { base, reads } = shaped;
    const { needs } = step;
    if (!needs) {
      return { steps: [base] };
    }
    const machine = gateMachine(workspace, projectId, needs);
    return machine
      ? { steps: [{ ...base, needs, machine: machine.machineId }] }
      : {
          refusal: capableRefusal(
            { name: step.name, needs },
            reads,
            lastCapable(db.listAgents(), needs)
          ),
          needs,
        };
  };

  /**
   * THE run of a `finish_item`, against the submission stored on its row, to
   * an outcome. The live call and a hub start-up resume both come here. The
   * landing gate ({@link gateSteps}) runs on the tree that lands: for an
   * item that lands on its base, on top of that base, inside the landing
   * ({@link landOnBase}); for a branch or a pull request, here, on the tree
   * it pushes. A gate that fails hands the item back to its
   * session with the failing output; one that passes lands it and reports.
   * Either way the row stops landing — also when a step cannot run at all,
   * which throws. Answers the text the delegate reads, and whether the item
   * is done.
   */
  const settleLanding = async (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    finishing.add(item.id);
    const stop = new AbortController();
    landingStops.set(item.id, stop);
    try {
      return await landSubmitted(item, submission);
    } catch (error) {
      update(item.id, { landingSince: null, submission: null });
      if (error instanceof CommandStopped) {
        return stoppedWith(item, error);
      }
      throw error;
    } finally {
      landingStops.delete(item.id);
      finishing.delete(item.id);
      // A wait an error cut short leaves no words behind it.
      landingWait(item.id, null);
      // An item stopped while it landed was not settled for it ({@link holdOn}).
      if (!LIVE.has((db.workItem(item.id) ?? item).state)) {
        settleSoon(item.workspaceId);
      }
      // What waited out the landing goes: into the turn a failed gate hands
      // back, or, landed, once the turn that called finish_item is over.
      closeTurn(item, false);
    }
  };

  /**
   * A landing its item's end cancelled ({@link landingStops}): a stop, not a
   * failure. The item's end settled its row; the text is what the delegate
   * reads.
   */
  const stoppedWith = (
    item: WorkItemRow,
    error: CommandStopped
  ): { done: boolean; text: string } => {
    const now = db.workItem(item.id) ?? item;
    console.log(
      `[work-items] ${item.id}: its landing was stopped as the item ended (${now.state}); every command it had running was cancelled: ${error.message}`
    );
    return {
      done: false,
      text: `${now.title} is ${now.state} now; its landing stopped with it, and nothing was landed or reported.`,
    };
  };

  /**
   * {@link settleLanding}'s run: the gate's steps read, the gate at
   * finish_item run (none for an item landing on its base), and the landing.
   */
  const landSubmitted = async (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    const settled = { landingSince: null, submission: null };
    // Host scope: no clone, so no gate, no landing and no diffstat; the
    // report is the whole of it.
    if (workspace.host) {
      return await reportLanding(item, row, workspace, submission, {
        kind: "done",
        line: "Nothing landed: it ran with host scope.",
        gate: { declared: false, outcomes: [] },
      });
    }
    const gate = await gateSteps(workspace, item);
    if ("refusal" in gate) {
      const refused = update(item.id, settled) ?? item;
      // No machine a due step needs is online: the item waits for one, never
      // idle, and the sweep wakes it when one comes ({@link wakeCapable}).
      if (gate.needs && LIVE.has(refused.state)) {
        declareWait(
          refused,
          CAPABLE_WAIT_MINUTES,
          capableWaitReason(gate.needs)
        );
      }
      return { done: false, text: gate.refusal };
    }
    const refused = await branchRefused(workspace, item, gate);
    if (refused) {
      return await reportLanding(item, row, workspace, submission, refused);
    }
    landingAt(item, "gating");
    const run = await gateOnce(
      workspace,
      item,
      item.lands === "main" ? { ...gate, steps: [] } : gate,
      "at finish_item",
      {
        inTurn: false,
        say: (words, step) =>
          landingWait(item.id, words && stepWaitWords(words, step)),
      }
    );
    if (runFailed(run)) {
      update(item.id, settled);
      return { done: false, text: gateFailedText(run, "your commits") };
    }
    // The gate took its time: the item may have been stopped since.
    const current = db.workItem(item.id) ?? item;
    if (landingStopped(current)()) {
      return {
        done: false,
        text: `${current.title} is ${current.state} now; nothing was landed or reported.`,
      };
    }
    return await landAndReport(current, row, workspace, gate, submission, run);
  };

  /**
   * A branch or a pull request gates at finish_item, before its push: the
   * push is checked first, so one that will be refused runs no step
   * (landing.ts `branchPushCheck`; a landing on its base checks inside
   * `land`). The refused landing, or nothing.
   */
  const branchRefused = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate
  ): Promise<Extract<Landed, { kind: "refused" }> | undefined> => {
    if (item.lands !== "branch" && item.lands !== "pr") {
      return;
    }
    const branch = landingBranch(item);
    const refused = await branchPushCheck(
      runIn(workspace, item),
      branch,
      lastBranchPush(item)
    );
    return refused
      ? {
          kind: "refused",
          gate: { declared: gate.declared, outcomes: [] },
          line: refusedLine(
            refused,
            { head: "Not pushed", target: `branch ${branch}` },
            workspace,
            machineName(workspace.machineId)
          ),
        }
      : undefined;
  };

  return {
    start: (asked: WorkItemRequest) => start(asked),

    /** While the item's landing waits (a shared machine slot, a pause, its turn to land): what its status says, and since when. */
    landingWaitOf: (itemId: string): { words: string; since: number } | null =>
      landingWaits.get(itemId) ?? null,

    /**
     * The hub's own work: a routine's run (routines.ts, {@link routineParent})
     * or a design check's verifier (design-verify.ts, {@link verifierParent}).
     * A fresh session in a new workspace cut from `parent.cwd` on
     * `parent.machineId`. It reports to no session, the project's lead
     * included: its owner reads how it ended from {@link WorkItemDeps.itemEnded}.
     */
    startForHub: (
      request: Omit<
        WorkItemRequest,
        "parentInstanceId" | "workspace" | "fork" | "reuse"
      >,
      parent: Parent
    ): Promise<WorkItemStart> =>
      start({ ...request, parentInstanceId: parent.id }, parent),

    /** What an item's session has spent since the item began (its budget's dollars). */
    spentBy: (item: WorkItemRow): number => usedBy(item).usd,

    /** A word from the hub to a session, as its own item's notices go (`tell`). */
    tellSession: (instanceId: string, content: string): void => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (row) {
        tell(row, content);
      }
    },

    /**
     * What an item's chip says while the hub holds it for something other
     * than its landing (a design check's verifier, design-verify.ts); null
     * clears it.
     */
    holdWords: (itemId: string, words: string | null): void =>
      landingWait(itemId, words),

    /**
     * The hub's own item stopped by the hub, `why` kept as who stopped it: a
     * design check's verifier whose builder ended (design-verify.ts). Its
     * session ends; it reports to no session.
     */
    stopForHub(itemId: string, why: string): void {
      const item = db.workItem(itemId);
      if (!(
        item &&
        LIVE.has(item.state) &&
        isHubParent(item.parentInstanceId)
      )) {
        return;
      }
      quiet.delete(item.id);
      finish(item, {
        state: "cancelled",
        stoppedBy: { kind: "hub", why },
        landingSince: null,
        submission: null,
      });
      end(item.instanceId).catch((error: unknown) =>
        console.warn(
          `[work-items] ${item.id} was stopped (${why}), and its session did not end: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    },

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
      // The fleet's guidance for briefing this delegate, before anything
      // starts, when the caller has not read it since its start or its
      // last compaction (briefings.ts).
      const guide = briefingOf(asked);
      if (guide) {
        throw new WorkItemRefusal(409, guide);
      }
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
          text: `Queued “${queued.title}” (${queued.id.slice(0, 8)}): ${until}; its report reaches you as any delegate's does.`,
        };
      }
    },

    /**
     * A machine's pause began or ended: the trays say so again, for every
     * live item on it and every delegate still queued.
     */
    pauseChanged(machineId: string): void {
      // Every live item on it, a host-scope one's too (no active clone lists it).
      for (const item of liveItemsOn(machineId)) {
        published(item);
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
     * `stop_delegate` on a queued delegate: the one `target` names (by id as
     * every tool reads one, handles.ts `byId`) leaves the queue through
     * {@link unqueue}, its chip with it. Only its parent or its project's
     * lead may withdraw it; anyone else is refused as `stop_delegate`
     * refuses a session that is not theirs. Undefined when `target` names no
     * queued delegate, so the caller looks among sessions.
     */
    withdrawQueued(from: string, target: string): string | undefined {
      const named = (rows: QueuedWorkItemRow[]) =>
        byId(target, rows, (row) => row.id);
      const mine = named(queuedFor(from));
      if (mine.length === 0) {
        const theirs = named(db.queuedWorkItems()).some(
          (row) => !db.workItem(row.id)
        );
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

    /**
     * The live idle/busy transition, even while turn-end rules are still
     * deciding. Idle after the declaring turn puts its wait at rest; busy
     * after the wait's time passed is the session resuming, which ends the
     * resume grace and its missed-resume notice. Busy during the wait's time
     * ends nothing: the word that woke it is not work ({@link worked}).
     */
    turnState(instanceId: string, busy: boolean): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!busy && item?.waitUntil) {
        waitsAtRest.add(item.id);
        // A turn that ran past the deadline ended: the wait ends now.
        if (item.waitUntil.getTime() <= Date.now()) {
          endWait(item.id, true);
        }
      } else if (busy && item?.waitResumeBy) {
        clearWait(item);
      }
    },

    /**
     * The tools a session's model called in one message: one that is work of
     * its own ({@link restsInWait} is false for it) ends a wait at rest, so
     * a session working again is not shown waiting and its turns count
     * again. The declaring turn's own calls end nothing.
     */
    worked(instanceId: string, tools: readonly string[]): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (
        item?.waitUntil &&
        waitsAtRest.has(item.id) &&
        tools.some((tool) => !restsInWait(tool))
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
      if (!LIVE.has(item.state) || item.landingSince) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${handle(item.id)}) cannot wait while ${item.landingSince ? "its merge checks run" : `it is ${item.state}`}. Continue a live item before calling wait_item.`
        );
      }
      const waitReason = reason.trim().replace(/\s+/g, " ");
      const waiting = declareWait(item, minutes, waitReason);
      const clock = waitClock(waiting.waitUntil as Date);
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
     * A send kept for {@link recutHold}: after whatever runs in the
     * workspace's turn (a settle that may be retiring it as the send came),
     * the workspace retired is cut again at its own path ({@link recut}),
     * then what was kept for it goes ({@link WorkItemDeps.recutDone}); its
     * settle meanwhile is deferred by the send on its way ({@link holdOn}).
     * Fails it with why the cut could not be made
     * ({@link WorkItemDeps.recutFailed}), unless only its machine's agent's
     * restart stopped the cut ({@link recutWaitsForAgent}): then it stays
     * kept, and the cut is asked again once the agent is back
     * ({@link WorkItemDeps.recutKept}). Nothing for a session whose
     * workspace is neither retired nor in a turn. Never throws.
     */
    recutFor(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      if (
        !(
          item &&
          workspace &&
          (recuttable(workspace) || workspaceTurns.has(workspace.id))
        ) ||
        recutWaits.has(instanceId)
      ) {
        return;
      }
      recutWaits.add(instanceId);
      inWorkspaceTurn(workspace.id, async () => {
        const [now] = db.workspacesNamed(workspace.id);
        if (now && recuttable(now)) {
          await recut(now);
        }
      })
        .finally(() => recutWaits.delete(instanceId))
        .then(
          () => recutDone?.(instanceId),
          (error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            const wait = recutWaitsForAgent(message);
            if (wait !== undefined) {
              console.info(
                `[workspaces] ${instanceId}: its workspace ${handle(workspace.id)} is not cut again yet, its machine's agent answering "${message}"; what was sent to it is kept at the hub, and the cut is asked again ${wait === "fenced" ? `once the agent is back (at the latest in ${RESTART_RECUT_MS / 1000} s)` : "now"}`
              );
              if (wait === "fenced") {
                lifetime.after(RESTART_RECUT_MS, () => recutKept?.(instanceId));
              } else {
                recutKept?.(instanceId);
              }
              return;
            }
            const reason = `Its workspace ${handle(workspace.id)} retired and could not be cut again: ${message}`;
            console.warn(`[workspaces] ${instanceId}: ${reason}`);
            recutFailed?.(instanceId, reason);
          }
        );
    },

    /**
     * How CawCo moved session `instanceId`'s workspace's checkout since a
     * message was last handed to a session of it (its row's `movedUntold`:
     * cut again by {@link recut}, rebased as it landed by `landOnBase`);
     * taken, so only the first message handed there says so. Called as a
     * message is handed to the machine.
     */
    movedTold(instanceId: string): CheckoutMove | undefined {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      const move = workspace?.movedUntold ?? undefined;
      if (workspace && move) {
        db.updateWorkspace(workspace.id, { movedUntold: null });
      }
      return move;
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
      update(item.id, { heldAt: null, heldAsleepAt: null });
      if (item.heldAsleepAt) {
        untellYou(instanceId);
      }
      console.log(`[work-items] ${item.id}: woken from its hold`);
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
            reason: `${item.title} (${handle(item.id)}) is ${item.state}, and ${archivedWords(workspace)}`,
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
      // finished item. A reopener's send made while the item was finishing
      // waited at the hub ({@link finishingFor}) and is accepted again as it
      // goes, after the end, so it reopens it.
      if (
        item &&
        !LIVE.has(item.state) &&
        item.endedAt !== null &&
        item.endedAt.getTime() <= sentAt.getTime()
      ) {
        rerun(item);
      }
    },

    /**
     * Item `itemId`'s workspace with its clone there, held for a
     * continuation of its session: in the workspace's turn, after any settle
     * already under way, a retired one cut again ({@link withClone}), and
     * from then on held ({@link holdOn}) until the answered release, called
     * once the continuation's job is filed (its record holds it from there)
     * or has failed to be. Throws why there is no clone.
     */
    async continuable(itemId: string): Promise<() => void> {
      const item = db.workItem(itemId);
      if (!item) {
        throw new Error(`work item ${itemId} has no workspace`);
      }
      const { workspaceId } = item;
      await inWorkspaceTurn(workspaceId, async () => {
        const [workspace] = db.workspacesNamed(workspaceId);
        if (!workspace) {
          throw new Error(`work item ${itemId} has no workspace`);
        }
        if (workspace.state === "archived" && !recuttable(workspace)) {
          throw new Error(archivedWords(workspace));
        }
        if (!(await withClone(workspace))) {
          throw new Error(
            `the clone of workspace ${handle(workspace.id)} is gone from ${machineName(workspace.machineId)}`
          );
        }
        continuing.set(itemId, (continuing.get(itemId) ?? 0) + 1);
      });
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const left = (continuing.get(itemId) ?? 1) - 1;
        if (left > 0) {
          continuing.set(itemId, left);
        } else {
          continuing.delete(itemId);
        }
        // Held no longer by this, it settles as it stands.
        settleSoon(workspaceId);
      };
    },

    /**
     * Item `itemId` goes on in session `to`, the continuation of its
     * session, whoever asked for it: the item and `to` name each other, its
     * old session no longer does, so `to` finishes it. A finished item runs
     * again ({@link rerun}) and a live one loses an interrupt's hold, so the
     * continuation's opening and every turn after are the item's. Nothing
     * when `to` holds it already (a restart in between).
     */
    continuedIn(itemId: string, to: string): void {
      const item = db.workItem(itemId);
      if (!item || item.instanceId === to) {
        return;
      }
      db.carryWorkItem(item.id, item.instanceId, to);
      quiet.delete(item.id);
      if (LIVE.has(item.state)) {
        update(item.id, { heldAt: null, heldAsleepAt: null });
        if (item.heldAsleepAt) {
          untellYou(item.instanceId);
        }
      } else {
        rerun(item);
      }
      console.log(
        `[work-items] ${item.id}: goes on in ${to.slice(0, 8)}, the continuation of ${item.instanceId.slice(0, 8)}`
      );
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
     * error when the turn failed. Answers what the parent is sent, or nothing.
     *
     * An item ends only through {@link finishItem}, or here when its turn
     * failed. A turn that ends it quietly, with nothing queued for the
     * session, nothing handed to it since, and none of its own delegated work
     * live, gets the "still open" message; the third in a row fails it and
     * reports that failure to the parent. A declared wait stays on the tray
     * and is summarized only with the next actionable message. A session
     * that runs no item reports nothing.
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
      if (item.heldAt || item.stoppingAt) {
        quiet.delete(item.id);
        return undefined;
      }
      if (turn.error === undefined && waitingTurn(item)) {
        return undefined;
      }
      // A verifier judges its result: the turn that ended waits for its word.
      if (turn.error === undefined && designHeld(item.id)) {
        quiet.delete(item.id);
        return undefined;
      }
      const busy = busyAfter(row, endedAt);
      // A finished item has reported; one whose landing is running reports
      // when it settles (its session's own call may have died with the hub).
      if (!LIVE.has(item.state) || item.landingSince) {
        return undefined;
      }
      if (turn.error !== undefined) {
        return failedTurn(item, turn.error, busy);
      }
      return busy ? undefined : quietTurn(row, item);
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
     * and the item marked landing before the gate's first step starts, so a
     * hub that dies mid-run resumes it ({@link resumeLandings}); then
     * {@link settleLanding} runs it to its outcome. An item done already
     * answers its done result, unless its workspace holds work since, which
     * this lands ({@link finishable}); one landing already is refused.
     * Answers what the tool returns.
     */
    async finishItem(
      instanceId: string,
      request: WorkItemSubmission
    ): Promise<string> {
      const open = await finishable(instanceId);
      if (typeof open === "string") {
        return open;
      }
      const { row, item } = open;
      // The parent reads the report alone: one that points at the chat for
      // its result hands in nothing, blocked or not (report-pointer.ts).
      const pointer =
        chatPointer(request.headline) ?? chatPointer(request.summary);
      if (pointer) {
        return chatPointerRefusal(pointer);
      }
      clearWait(item);
      if (!request.blocked) {
        // The task's to-dos first: unticked ones are listed once, to tick or
        // explain; the next call goes on.
        const unticked = await untickedText(item);
        if (unticked) {
          return unticked;
        }
        // Design work in a project with a design system: a verifier session
        // judges the working tree as it stands, committed or not
        // (design-verify.ts), and its pass runs this again. Holding ends
        // nothing, so it comes before the leftovers below.
        const held = await designHold(item, request);
        if (held) {
          return held;
        }
      }
      // The item ends past here, blocked or landed: nothing outside its
      // commits may be left in its clone.
      const left = await leftoversIn(item);
      if (left) {
        return left;
      }

      if (request.blocked) {
        await lastTurn(item);
        const error = `Blocked: ${request.blocked.command}${fenced(request.blocked.error)}`;
        const ended = finish(item, {
          state: "failed",
          error,
          headline: request.headline,
          landingSince: null,
          submission: null,
        });
        const failed = ended.state === "failed";
        report(
          row,
          `${request.summary}\n\n${error}${findingsBlock(request.findings)}${reportLine(ended)}`,
          failed,
          false,
          request.headline
        );
        return failed
          ? "The item failed as blocked; your parent has the command and the error. End your turn."
          : "Your earlier work stays landed, and the item is done with this block noted: its task goes to review with it, and your parent has the command and the error. End your turn.";
      }

      await lastTurn(item);
      return await landOrComplete(item, request);
    },

    /** {@link blockIfMissing}: the block `row`'s item has as its session is to start again, or nothing. */
    blockIfMissing,

    /**
     * Whether `row`'s live item would be blocked if its session were to
     * start again now, read and nothing written: the question a reader asks
     * (server.ts `inputRefusal`); only a start records the block
     * ({@link blockIfMissing}).
     */
    missingNow(row: InstanceRow): boolean {
      const item = itemOf(row);
      return !!(item && LIVE.has(item.state) && missingFor(row));
    },

    /** Whether `instanceId`'s live item is blocked ({@link blockIfMissing}): what it is sent waits at the hub. */
    blockedFor(instanceId: string): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      return !!item?.blocked && LIVE.has(item.state);
    },

    /**
     * Whether a send from `origin` waits at the hub because the session's
     * item is finishing: its landing runs, or its session is in the turn
     * that called `finish_item` (`lastTurnAt`). Only the words of one
     * who may reopen the item wait (its parent, its lead, the reader): such
     * a send handed to the harness now would join a turn that ends as
     * `finish_item` answers, and read after the item ended it would reopen
     * nothing ({@link reopen}: it was accepted while the item was live). Kept,
     * it goes once that turn is over ({@link closeTurn}), as the next turn:
     * a send the item's landing ended before reopens it.
     */
    finishingFor(instanceId: string, origin: NeutralOrigin): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      return (
        !!item &&
        (landingHolds(item) || item.lastTurnAt !== null) &&
        mayReopen(item, origin)
      );
    },

    /**
     * A turn of `instanceId` ended: when it was the one that called
     * `finish_item`, what the {@link finishingFor} hold kept goes now, unless
     * its landing still runs (it goes as that settles).
     */
    turnOver(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.lastTurnAt) {
        closeTurn(item, true);
      }
    },

    /**
     * An agent has registered: every item on its machine left landing by a
     * hub that stopped mid-run has its landing run again on the stored
     * submission ({@link landStored}), its gate from the step it was on (each
     * pass is kept, {@link gateOnce}); a completing one lands if its own
     * delegates ended meanwhile ({@link completeIfDrained}). An item this
     * hub is running now is left to that run. Then each `finish_item` turn
     * the stopped hub never heard end is released once the machine says the
     * session is between turns ({@link releaseLastTurns}).
     */
    resumeLandings(machineId: string): void {
      for (const item of liveItemsOn(machineId)) {
        const { submission } = item;
        if (!(item.landingSince && submission) || finishing.has(item.id)) {
          continue;
        }
        // Completing: it lands once its own delegates have ended, which
        // may have happened while the hub was away.
        if (item.landingPhase === "completing") {
          completeIfDrained(item);
          continue;
        }
        // Its gate goes on from the step it was on: what passed is kept
        // on its row ({@link gateOnce}).
        const kept = [...passesOf(item.id).values()].flat().length;
        console.log(
          `resumed the landing of item ${item.id}${item.landingPhase ? ` at its phase ${item.landingPhase}` : ""}, ${kept} merge check pass(es) kept`
        );
        landStored(item, submission);
      }
      releaseLastTurns(machineId);
    },

    /**
     * A handoff's inputs (core handed-input.ts): written into the
     * `$TMPDIR/inputs/` of the workspace `instanceId`'s item runs in, before
     * the handoff that names them goes. Only the session that delegated the
     * item, or its project's lead, hands it inputs; refused, too, for a
     * workspace whose work was discarded and an input that may not go
     * ({@link readInputs}). A retired workspace is cut again first
     * ({@link recut}). Answers each input's name and where it came from.
     */
    async handInputs(
      instanceId: string,
      from: string,
      entries: unknown[]
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
      if (named?.host) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${handle(item.id)}) runs with host scope on ${machineName(named.machineId)}: it has no $TMPDIR/inputs/. Name the paths on its machine in the message, without inputs.`
        );
      }
      const [caller] = db.getInstancesByIds([from]);
      if (!caller) {
        throw new WorkItemRefusal(404, `unknown session ${from}`);
      }
      // Read before a retired workspace is cut again: an input that may not
      // go refuses the handoff before anything is cut.
      const inputs = await readInputs(entries, caller);
      const workspace = named && recuttable(named) ? await recut(named) : named;
      if (!workspace || workspace.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${handle(item.id)}) is in workspace ${handle(item.workspaceId)}, which is ${workspace?.state ?? "gone"}: nowhere to put inputs.`
        );
      }
      await handIn(workspace, inputs, row);
      return inputs.files.map(({ name, from: read }) => ({ name, from: read }));
    },

    /** {@link sessionFailed}: a restart cut its turn and nothing can resume it. */
    sessionFailed,

    /** {@link followSessions}: the items of the sessions whose rows just moved follow them. */
    followSessions,

    /**
     * A stop of its session was asked while the work was live, by `by`
     * (null: a stop whose stopper the hub did not hear), kept on the item so
     * its task says who stopped it. The item is held where it stands (its
     * `stoppingAt`, {@link report}): its landing, if one runs, is cut, its
     * wait cleared, and it takes its final state only once its machine
     * confirms the session ended ({@link stopConfirmed}).
     */
    stopping(row: Pick<InstanceRow, "workItemId">, by: EndedBy | null): void {
      const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
      if (!(item && LIVE.has(item.state)) || item.stoppingAt) {
        return;
      }
      quiet.delete(item.id);
      clearWait(item);
      landingStops.get(item.id)?.abort();
      update(item.id, {
        stoppingAt: new Date(),
        stoppedBy: by,
        landingSince: null,
        submission: null,
      });
      console.log(
        `[work-items] ${item.id}: stopping; held until its machine confirms its session ended`
      );
    },

    /**
     * The machine confirmed `row`'s session ended on a stop: its live item
     * is `cancelled` now, `by` the stop's asker when it named none before.
     * Answers the item as it ended, or nothing when its session ran none
     * that was live.
     */
    stopConfirmed(
      row: Pick<InstanceRow, "workItemId">,
      by: EndedBy | null = null
    ): WorkItemRow | undefined {
      const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
      if (!(item && LIVE.has(item.state))) {
        return undefined;
      }
      quiet.delete(item.id);
      const ended = finish(
        item,
        {
          state: "cancelled",
          stoppedBy: item.stoppedBy ?? by,
          stoppingAt: null,
          landingSince: null,
          submission: null,
        },
        { stopped: true }
      );
      console.log(
        `[work-items] ${item.id}: its session's end is confirmed; ${ended.state}`
      );
      return ended;
    },

    /**
     * Its session's provider kept retrying past the item's deadline for
     * that (provider-retries.ts): the item fails with `why`, and its parent
     * hears it. Nothing for an item that is no longer live.
     */
    retryPassed(row: InstanceRow, why: string): void {
      const item = itemOf(row);
      if (!(item && LIVE.has(item.state))) {
        return;
      }
      quiet.delete(item.id);
      clearWait(item);
      const ended = finish(item, { state: "failed", error: why });
      report(row, `${why}${reportLine(ended)}`, ended.state === "failed");
    },

    /** The reports of `report`, as {@link WorkItemDeps.report} hands them on: a stop's own report (tree-stops.ts). */
    reportStopped(row: InstanceRow, body: string, headline: string): void {
      report(row, body, false, false, headline);
    },

    /** One item, as `stop_delegate` and its callers read it. */
    item: (id: string): WorkItemRow | undefined => db.workItem(id),

    /**
     * `instanceId`'s stop at its account's limit began, changed or ended:
     * its live item goes out again, its chip saying so.
     */
    stallChanged(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item && LIVE.has(item.state)) {
        publish(summaryOf(item));
      }
    },

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
      return workspace ? boundaryOf(workspace) : undefined;
    },

    /** Workspace `id` as a spawn or a stage is bounded to it; undefined when no workspace has that id. */
    workspaceRef(id: string): WorkspaceRef | undefined {
      const workspace = db.workspacesNamed(id).find((one) => one.id === id);
      return workspace ? boundaryOf(workspace) : undefined;
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
          `Workspace ${handle(workspace.id)} is ${workspace.state}, not held: what a workspace holds is read on its machine once its work has ended and its boundary is closed, and kept with it while it is held.`
        );
      }
      return heldWork(workspace);
    },

    /**
     * What the workspace of session `instanceId`'s item holds that is on no
     * remote ({@link Unlanded}, read by {@link unlandedOf}); undefined for a
     * session with no item. Throws the machine's words when git cannot say.
     */
    async unlanded(instanceId: string): Promise<Unlanded | undefined> {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!item) {
        return;
      }
      const read = await unlandedOf(item.workspaceId);
      return read && { ...read, live: LIVE.has(item.state) };
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
        // Something runs in its turn now: the sweep's next look settles it.
        if (workspaceTurns.has(workspace.id)) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, so a sweep never loads a machine with many archives at once
        done.push({ workspace, outcome: await settleNow(workspace.id) });
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
     * A place's stage clone, as its machine says it is cut and in step
     * (core `StageCloneFrame`), filed as a workspace of the stage kind: a new
     * row, or one archived or held made active again (a sheet after it
     * retired cut it again). `createdBy` is a session working in the place.
     * In its turn, so no settle of it runs meanwhile.
     */
    fileStageClone(
      machineId: string,
      frame: StageCloneFrame,
      createdBy: string
    ): Promise<void> {
      return inWorkspaceTurn(frame.id, () => {
        fileStage(machineId, frame, createdBy);
        return Promise.resolve();
      });
    },

    /**
     * Place `placeId`'s stage clones settled soon ({@link settleSoon}): its
     * sheet stage slept, failed or stopped, and with it its hold.
     */
    settleStagesOf(placeId: string): void {
      const [workspace] = db.workspacesNamed(stageCloneId(placeId));
      if (workspace?.stageFor === placeId && workspace.state === "active") {
        settleSoon(workspace.id);
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
    archive(
      needle: string,
      { discard = false }: { discard?: boolean } = {}
    ): Promise<ArchivedWorkspace> {
      // In its turn: no settle, bundle or read meets this close.
      return inWorkspaceTurn(namedWorkspace(needle).id, () =>
        archiveNow(needle, discard)
      );
    },

    /**
     * `discard_workspace` from session `from`: {@link archive} with
     * `discard`, for a workspace that session cut or delegated an item into,
     * or one of the project it leads. Refused, naming whose it is, for any
     * other.
     */
    discardFor(from: string, needle: string): Promise<ArchivedWorkspace> {
      const workspace = namedWorkspace(needle);
      const items = db.workItemsIn(workspace.id);
      const ours =
        workspace.createdByInstanceId === from ||
        items.some(
          (item) => item.parentInstanceId === from || leadFor(item)?.id === from
        );
      if (!ours) {
        throw new WorkItemRefusal(
          403,
          `Workspace ${handle(workspace.id)} is not one of yours: discard_workspace lets go of a workspace your own delegates worked in. Nothing was deleted.`
        );
      }
      return inWorkspaceTurn(workspace.id, () =>
        archiveNow(workspace.id, true)
      );
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
    /**
     * What the landing gate passed on `tree`, a git tree's name: each step's
     * command that passed on it, over every item that landed it (WorkLanding
     * `gate`). Empty when none did. A release asks it of its commit's tree
     * (scripts/release.ts), and checks only what it does not find here.
     */
    gatePassesOn: (tree: string): string[] => [
      ...new Set(
        db
          .landedOnTree(tree)
          .flatMap((row) =>
            row.landed?.gate?.tree === tree ? row.landed.gate.passed : []
          )
      ),
    ],

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
     * ended if it still has a process. One whose landing this hub runs now
     * ends with it. Throws with the sentence when the replacement is not
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
        landingSince: null,
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
