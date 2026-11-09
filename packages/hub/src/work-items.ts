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
 * (landing-run.ts `gateSteps`: the steps its project declares in gate.md, on the tree
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
 * project's **conversation** may answer, steer and stop the project's items; their
 * reports and asks reach only the session that started each, the project's conversation only
 * for the work he started ({@link reportees}). And the **plan ↔ to-do link**: a task attempt's plan,
 * CawCo's own steps on every harness, is read on its turn's end, a
 * completed step whose id is a to-do's (`td-3`) ticks that to-do, `finish_item` asks once about the
 * to-dos still open, and steps left open become `(proposed)` to-dos.
 */

import type { EndedBy } from "@cawco/core/accounts";
import { CODE_MODE_TOOL } from "@cawco/core/ask-tools";
import {
  AGENT_RESTARTED_MID_REQUEST,
  AGENT_RESTARTING,
} from "@cawco/core/binary-updates";
import type { DelegateType, SessionRole } from "@cawco/core/delegate-types";
import {
  type MayStart,
  mayStartType,
  narrowMayStart,
  sessionMayStart,
  startsAny,
} from "@cawco/core/delegate-types";
import type { BriefTarget } from "@cawco/core/fleet";
import { byPerson } from "@cawco/core/harness";
import type { HarnessKind, PermissionMode } from "@cawco/core/harness/kinds";
import { WORK_ITEM_ORIGIN } from "@cawco/core/harness/kinds";
import type { CheckoutMove, LandsMode } from "@cawco/core/injected";
import {
  type DashboardReach,
  handoffMarker,
  inputsOnce,
  type WorkspaceLanding,
  withDashboardLine,
  withHostLine,
  withInputsLine,
  withLandingLine,
  withWorkspaceLine,
} from "@cawco/core/injected";
import { machineCalled } from "@cawco/core/machine-names";
import type { MachinePath } from "@cawco/core/machine-path";
import { NO_REPLY_TOOL } from "@cawco/core/no-reply";
import type { PlanStep } from "@cawco/core/plan";
import type {
  Envelope,
  InstanceRow,
  NamedSpawn,
  SendPayload,
  SpawnPayload,
  WorkItemSummary,
} from "@cawco/core/protocol";
import { sessionLink, todoLink } from "@cawco/core/references";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type { NeutralOrigin, SendRefusal } from "@cawco/core/session-messages";
import { type TurnWakes, waitsOnItself } from "@cawco/core/session-messages";
import { shellQuote } from "@cawco/core/shell-quote";
import type { StageCloneFrame } from "@cawco/core/stage";
import type { WaitWitness } from "@cawco/core/task-views";
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { harnessWords } from "@cawco/core/words/harness";
import { workWords } from "@cawco/core/words/work";
import type {
  InputFile,
  InputNamed,
  InputsAdmitted,
  InputsLanded,
  InputsPlace,
  InputsRead,
  WorkspaceArchive,
  WorkspaceChanges,
  WorkspaceRef,
} from "@cawco/core/workspace/controls";
import {
  CONTROL_CLONE_HOLDING,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CHANGES,
  INPUTS_DIR,
  INPUTS_LIMIT_BYTES,
} from "@cawco/core/workspace/controls";
import {
  excludedPaths,
  IGNORED_STATUS,
  stageCloneId,
} from "@cawco/core/workspace-policy";
import { briefingFor } from "./briefings";
import type { DbShape } from "./db";
import type {
  QueuedWorkItemRow,
  WorkItemRow,
  WorkspaceRow,
} from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { Origin, WorkOrigin } from "./db/schema";
import type {
  ItemBlock,
  WorkBudget,
  WorkItemSubmission,
} from "./db/stored-types";
import { failedWith } from "./gate";
import {
  capableMachines,
  capableOnline,
  capableWaitFor,
  capableWaitReason,
} from "./gate-file";
import { type HeldInput, handedInputs } from "./handed-input";
import { type HandedFile, HandedInputRefusal } from "./handed-inputs";
import { byId } from "./handles";
import { boardTitle, leafOf, sessionLabel } from "./labels";
import { statusCommand } from "./landing";
import {
  createLandingRun,
  fenced,
  findingsBlock,
  MIB,
  reportLine,
} from "./landing-run";
import { type HubLifetimeShape, type HubTimer, soon } from "./lifetime";
import { signedInOn } from "./placement";
import { handle } from "./presenters/words";
import { FolderRefusal, folderPath } from "./project-folder";
import { chatPointer, chatPointerRefusal } from "./report-pointer";
import { sessionWord } from "./session-word";
import type { Todo } from "./task-file";
import type { TodoChanges } from "./tasks";
import { unwatchedMode } from "./unwatched-mode";
import { CAWCO_TOOL } from "./web-reads";
import {
  isHubParent,
  isRoutineParent,
  LIVE,
  type Parent,
  WorkItemRefusal,
} from "./work-item-state";
import type { WorkPlace } from "./work-place";
import {
  type ArchivedWorkspace,
  createWorkspaces,
  GIT_TIMEOUT_MS,
  type HeldWork,
  outputsFolder,
  ownCopy,
  refOf,
  type Settled,
  SPACES,
  type Unlanded,
  type WorkspacesDeps,
} from "./workspaces";

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

/**
 * Why `parent` may not start a delegate of `type`, or a session (`type`
 * null), in the words its model reads; nothing when it may. What a session
 * may start is its row's list (core `MayStart`): `["any"]` anything, any
 * other list those types alone, so a leaf that may start `browser` starts a
 * browser delegate and nothing else. Checked before anything spawns.
 */
export const mayStartRefusal = (
  parent: Pick<InstanceRow, "delegateType" | "mayStart">,
  type: string | null
): string | undefined => {
  const may = sessionMayStart(parent);
  if (startsAny(may) || (type !== null && mayStartType(may, type))) {
    return undefined;
  }
  return may.length === 0
    ? workWords.leafRefusal
    : workWords.mayStartOnly(parent.delegateType ?? null, may);
};

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
class MachinePaused extends WorkItemRefusal {
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
const GLOB_WILD = /[*?[{]/u;
const LEADING_DOT_SLASH = /^(\.\/)+/u;
const TRAILING_SLASH = /\/+$/u;

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
const globsOverlap = (
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
const overBudget = (
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
const budgetFrom = (
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
const CLOSED = /[.\s]+$/u;

/** A refusal of a delegation's inputs, in `words` closed by one full stop. */
const inputsRefused = (words: string, options?: ErrorOptions) =>
  new WorkItemRefusal(400, `inputs: ${words.replace(CLOSED, "")}.`, options);

/** What the hub writes is its reader's to read and write. */
const HELD_MODE = 0o600;

/**
 * Why a clean `delegate` can't go as asked: what it names would bring
 * context back into its session (skills it loads, a conversation it copies,
 * a session that started with its own). Undefined when it can.
 */
const cleanProblem = (request: WorkItemRequest): string | undefined => {
  if (!request.clean) {
    return;
  }
  const named = [
    ...(request.skills?.length ? ["skills"] : []),
    ...(request.fork ? ["fork"] : []),
    ...(request.workspace ? ["workspace"] : []),
  ];
  return named.length > 0
    ? harnessWords.cleanWith(named.join(", "))
    : undefined;
};

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
  /**
   * Its session starts clean (core `SpawnPayload.clean`): no instruction
   * context, and none of its type's skills. Not with skills, fork or
   * workspace, which would bring context back ({@link cleanProblem}).
   */
  clean?: boolean;
  /** The repository a new workspace is cut from; the parent's directory by default. */
  cwd?: string;
  /**
   * The commit a new workspace's worktree is moved to, detached, before its
   * session starts (workspaces.ts `detachNew`): a design check's verifier's judged
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
   * What its parent hands it (hub handed-input.ts), written into its
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
  /**
   * The delegate types it may start (core `MayStart`); its type's list when
   * absent. Never past what its parent may start itself ({@link Settings}).
   */
  mayStart?: MayStart;
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
  /**
   * The hub started it to settle its parent's decision cards (settling.ts):
   * a leaf parent takes it too, since a leaf's refusal is of its own
   * delegate calls. Set by the hub alone, never by a tool call.
   */
  settlesCards?: true;
  skills?: string[];
  /**
   * The project task the item is an attempt at (dispatch.ts). Only for a new
   * workspace; the item's session may write that task's to-dos.
   */
  task?: { id: string; projectId: string };
  /** What the caller named the work: the item's title and its session's. */
  title: string;
  type?: string;
  /** An attempt's cards and pins and the values they settled with as it was dispatched (dispatch.ts): its witnesses. */
  waitedOn?: WaitWitness[];
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

/**
 * What a handoff's inputs did before its message went
 * ({@link WorkItems.handOff}): each input's name and where it came from, the
 * folder they landed in as the receiver names it, and whether the
 * receiver's retired workspace was cut again for them.
 */
export interface HandoffInputs {
  cut: boolean;
  folder: string;
  inputs: { from: string; name: string }[];
}

export interface WorkItemStart {
  item: WorkItemRow;
  text: string;
  workspace: WorkspaceRow;
}

export interface WorkItemDeps extends Pick<
  WorkspacesDeps,
  | "call"
  | "command"
  | "db"
  | "end"
  | "launchesOn"
  | "makingFrom"
  | "sendWakes"
  | "servedOwed"
  | "stageRuns"
  | "waitingOnPerson"
  | "workspaceChanged"
> {
  /**
   * Whether a send to the session is still pending, owed or handed, other
   * than a keep-alive ping (cut-turns.ts `awaitsSend`): that send is its next
   * turn, so nothing need wake it.
   */
  readonly awaitsSend: (instanceId: string) => boolean;
  /**
   * Its machine's own word that the session is between turns (server.ts
   * `sessionIdle`): what a hub that started reads for a turn whose end it
   * never heard. False while the machine is away or does not answer.
   */
  readonly between: (row: InstanceRow) => Promise<boolean>;
  /**
   * Where a delegate's browser tools open the live dashboard, for a session
   * on `machineId` in `projectId` (server.ts): undefined when the fleet's
   * chrome-devtools does not reach it, so its brief says nothing of it.
   */
  readonly browserDashboard: (
    machineId: string,
    projectId: string | null
  ) => DashboardReach | undefined;
  /**
   * Whether `machineId`'s custody of session `instanceId` is undecided:
   * the machine is away or reconnecting and has not yet said which
   * processes it still holds, or it holds that one's process unadopted. Its
   * item is neither failed nor reported meanwhile (workflow engine
   * 93a02b3a9: "Keep workflow attempts alive until custody decides
   * absence").
   */
  readonly custodyPending: (machineId: string, instanceId: string) => boolean;
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
   * The {@link WorkItems.finishingFor} hold on `instanceId` is over: what it
   * kept at the hub goes now, in order (sends.ts `releaseOwed`).
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
   * Why a `harness` session on `machineId` may not start on `model`: one
   * the harness does not list there, in words naming those it does
   * (server.ts `modelRefusal`, which every start's `settleMode` asks too);
   * undefined when it lists it, or has listed none to judge by. Asked here
   * so a delegate is refused before its workspace is cut.
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
   * The session's plan steps as its plan panel reads them (plans.ts):
   * CawCo's list, `todo_write`'s session scope. The plan ↔ to-do link reads
   * these.
   */
  readonly planSteps: (instanceId: string) => Promise<PlanStep[]>;
  /**
   * A project's first work item on `machineId`, which holds no checkout of
   * it: the machine is sent the project's rows from now on (server.ts
   * `machineFleetItems`), and places them in each clone of it there. A
   * workspace's own open and archive send nothing: its machine places the
   * rows it holds in the clone as it cuts it, before the boundary starts.
   */
  readonly projectReached: (machineId: string) => void;
  readonly publish: (item: WorkItemSummary) => void;
  /**
   * The session called `finish_item`, and its turn ends with that call: each
   * send its harness was handed and has not read, from a sender the
   * {@link WorkItems.finishingFor} hold keeps, is taken back from the harness
   * and kept at the hub, so it goes as the session's next turn and never
   * into the turn that is ending (sends.ts `reclaimUnread`). Settles once
   * each has answered; never throws.
   */
  readonly reclaimUnread: (instanceId: string) => Promise<void>;
  /**
   * The retired workspace of `instanceId`'s item is cut again
   * ({@link WorkItems.recutFor}): what was kept at the hub for the session
   * meanwhile goes to it now, waking it (sends.ts `releaseOwed`).
   */
  readonly recutDone?: (instanceId: string) => void;
  /** It could not be cut again, for `reason`: what was kept for the session fails with it. */
  readonly recutFailed?: (instanceId: string, reason: string) => void;
  /**
   * It was not cut yet because its machine's agent is restarting, or
   * restarted as it cut ({@link recutWaitsForAgent}): what was kept for the
   * session goes through the send path again (sends.ts `releaseOwed`),
   * whose hold asks for the cut again ({@link WorkItems.recutFor}).
   */
  readonly recutKept?: (instanceId: string) => void;
  /**
   * Hands a report to the parent of the item's session: `body` the full
   * report, `headline` its one-or-two-sentence outcome when there is one,
   * `outputs` the folder paths its finish copied its outputs to.
   */
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean,
    headline?: string,
    outputs?: string[]
  ) => void;
  /** One input that names what the hub holds, as its files, read for `caller` (handed-inputs.ts), an item's assets one by one as they are asked for; throws a refusal in its words. */
  readonly resolveHanded: (
    caller: InstanceRow,
    input: HeldInput
  ) => AsyncGenerator<HandedFile> | Promise<HandedFile[]> | HandedFile[];
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  /**
   * Where a reader opens a session in the dashboard: the link a pull request
   * carries back, and each landed commit's `Agent-Logs-Url` trailer.
   */
  readonly sessionUrl: (instanceId: string) => string;
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
   * "Stopped at A's limit; continues on B" while `instanceId` is stopped at
   * its account's limit (hub at-limit.ts `stall`); undefined while it runs.
   */
  readonly stalled: (instanceId: string) => string | undefined;
  /**
   * Why `instanceId`'s start is held at the hub while its machine takes none
   * ("Omars-MacBook-Pro is installing an update", start-holds.ts `startHold`);
   * undefined once it went. A held start goes by itself when the hold ends.
   */
  readonly startHeld: (instanceId: string) => string | undefined;
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
   * session goes now, waking it (sends.ts `releaseOwed`).
   */
  readonly unblocked: (instanceId: string) => void;
  readonly untellYou: (instanceId: string) => void;
  /** Where a project's work runs now (work-place.ts `workPlace`). */
  readonly workPlace: (project: ProjectRow) => WorkPlace;
}

/** A plan step that stands for one of its task's to-dos: its `id` is that to-do's, `td-3`. */
const PLAN_TODO = /^td-\d{1,6}$/u;
/** Plan items one attempt may leave behind as proposed to-dos. */
const PROPOSALS_LIMIT = 20;
const RUNS_OF_SPACE = /\s+/gu;
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
const ASLEEP_WAKE_LIMIT_MS = DAY_MS;

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
    default:
      unhandled("block", block.kind);
  }
};

/** When a parent hears from its delegate, as `delegate` and a continue answer it. */
const REPORT_ARRIVES = workWords.reportArrives;

/** How an open item ends, as the hub's reminders say it. */
const FINISH_LINE =
  "Finish the work and call finish_item with a report that quotes the output of every command that proves it, or call it with `blocked` and the exact command and error.";

/** Whose word the sweep's wake is: the hub's about an item, as the quiet-turn word is. */
const WAKE_ORIGIN: NeutralOrigin = { kind: "system", name: WORK_ITEM_ORIGIN };

/** The last path segment — how the rail names a session. */
/**
 * How an item's session runs: the request's word, then its type's, then a
 * leaf on claude. A fork runs on its parent's harness and model instead, and
 * resumes the parent's conversation under `forkOf`, its current session key.
 */
interface Settings {
  account?: string;
  /** Its session starts clean ({@link WorkItemRequest.clean}). */
  clean?: boolean;
  forkOf?: string;
  harness: HarnessKind;
  /** The delegate types it may start: its request's or its type's, within its parent's. */
  mayStart: MayStart;
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
 * Where `workspace`'s scratch dir is, as its machine's inputs writer names it
 * (agent inputs.ts `writeInto`, which reads its id alone): every workspace's,
 * a host-scope one's too (agent host-scratch.ts), whose folder no call
 * touches.
 */
const scratchRefOf = (workspace: WorkspaceRow): WorkspaceRef => ({
  id: workspace.id,
  path: workspace.path,
});

/** The boundary a session in `workspace` runs inside: none for a host-scope one. */
const boundaryOf = (workspace: WorkspaceRow): WorkspaceRef | undefined =>
  workspace.host ? undefined : refOf(workspace);

/**
 * The item's session: nested under its parent, working in the workspace's
 * checkout, every shell command inside the workspace's boundary, and its
 * parent's project's, as the workspace is one of that project's places. A
 * host-scope item's session names no workspace: the machine starts it in
 * its folder on the host, unbounded (agent session.ts `#sessionContext`),
 * with its host workspace's scratch dir as its `TMPDIR` (`hostScratch`).
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
    ...(workspace.host ? { hostScratch: workspace.id } : {}),
  };
};

/** {@link spawnOf} but where it works: what placement reads of the session. */
const sessionOf = (
  instanceId: string,
  title: string,
  parent: Parent,
  {
    account,
    clean,
    forkOf,
    harness,
    mayStart,
    model,
    role,
    skills,
    type,
  }: Settings
): Omit<NamedSpawn, "cwd"> => ({
  instanceId,
  harness,
  ...(account ? { account } : {}),
  ...(clean ? { clean: true as const } : {}),
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
  mayStart,
});

/**
 * Where a workspace is, as a delegate's result names it: its clone, its
 * branch, and its scratch dir, the delegate's `TMPDIR`, where its parent
 * copies inputs by path (none for a workspace cut before it was recorded).
 */
const placeOf = (workspace: WorkspaceRow): string =>
  workspace.host
    ? `${workspace.path} on the host, no clone and no boundary; files it leaves in $TMPDIR/outputs/ come back as its item's assets`
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
 * their words, their Send on its artifact, or their answer to its ask: core
 * `byPerson`), the
 * session that delegated it, or its project's conversation (a co-parent of every
 * item of its project).
 */
const reopens = (
  parentInstanceId: string | null,
  origin: NeutralOrigin,
  conversationInstanceId?: string | null
): boolean =>
  byPerson(origin) ||
  (origin.kind === "peer" &&
    (origin.fromSession === parentInstanceId ||
      (!!conversationInstanceId &&
        origin.fromSession === conversationInstanceId)));

/** Why a landed item's follow-up ended, when a stop ended it ({@link WorkItemRow} `error`). */
const FOLLOW_UP_STOPPED = "Its follow-up was stopped before it landed.";

/** What anyone else's message to finished work is answered with. */
const finishedText = (item: WorkItemRow): string =>
  `${item.title} (${handle(item.id)}) is ${item.state}. Only the reader, the session that delegated it, or its project's conversation can continue it.`;

/** What a message to finished work is answered with once a newer item holds its workspace. */
const supersededText = (item: WorkItemRow, latest: WorkItemRow): string =>
  `${item.title} (${handle(item.id)}) is ${item.state}, and workspace ${handle(item.workspaceId)} has moved on to ${latest.title} (${handle(latest.id)}, ${latest.state}). Message that one.`;

/** The first line with words on it. */
const firstLine = (text: string | null): string =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** Quiet turns in a row an item survives: the next one fails it. */
const QUIET_TURNS = 3;

const QUIET_ERROR =
  "did nothing for three turns in a row, with nothing running, and never called finish_item";

/** A CawCo read by its name, the harness's prefix off: `list_*`, `*_list`, `*_read`. */
const CAWCO_READ = /^list_|_list$|_read$/u;
/** The CawCo tools that say themselves what becomes of a wait. */
const WAIT_TOOLS: ReadonlySet<string> = new Set(["wait_item", "finish_item"]);

/**
 * Whether a tool call leaves a declared wait on: a CawCo read, wait_item or
 * finish_item (each settles the wait itself), no_reply_needed, refused to a
 * work item yet listed by OpenCode's shared discovery (roles.ts), so a turn
 * of it alone is still a quiet one, Claude's ToolSearch, which only loads a
 * deferred tool, or OpenCode's Code Mode program, whose own calls are judged
 * one by one as their frames come (server.ts). Any other call is the
 * session's own work.
 */
const restsInWait = (tool: string): boolean => {
  if (tool === "ToolSearch" || tool === CODE_MODE_TOOL) {
    return true;
  }
  if (!CAWCO_TOOL.test(tool)) {
    return false;
  }
  const name = tool.replace(CAWCO_TOOL, "");
  return (
    WAIT_TOOLS.has(name) || name === NO_REPLY_TOOL || CAWCO_READ.test(name)
  );
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
 * its own: there is no workspace to cut, continue or own files in, and
 * nothing lands. Files go both ways through its scratch dir, as a
 * workspace's do (agent host-scratch.ts): `inputs` into its
 * `$TMPDIR/inputs/`, and what it leaves in `$TMPDIR/outputs/` back as its
 * item's assets. Declared `outputs` are paths from a clone's root, which a
 * host delegate has none of.
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
    request.outputs?.length &&
      "outputs: a host delegate has no clone to name files from; it hands files back by leaving them in its $TMPDIR/outputs/, which the hub copies to its item's assets. Say so in the brief.",
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
      workWords.inputsLimits.outputs(outputs.length, OUTPUTS_LIMIT)
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

/** How an item lands, as its session is told. */
const landingOf = (item: WorkItemRow): WorkspaceLanding => ({
  lands: item.lands,
  ...(item.outputs?.length ? { outputs: item.outputs } : {}),
  ...(item.projectId ? { assets: outputsFolder(item) } : {}),
});

/** How long a tray shows a finished item before it leaves (the dashboard's hold). */
const TRAY_HOLD_MS = 6000;

export const createWorkItems = ({
  projectReached,
  awaitsSend,
  browserDashboard,
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
  launchesOn,
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
  startHeld,
  taskTitle,
  tellYou,
  todos,
  types,
  untellYou,
  waitingOnPerson,
  servedOwed,
  makingFrom,
  workspaceChanged,
  workPlace,
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
  /** Turns in a row each live item's session ended having done nothing, with nothing coming, by item. */
  const quiet = new Map<string, number>();
  /** The live items whose running turn has called a tool of the session's own ({@link restsInWait}). */
  const workedThisTurn = new Set<string>();
  /** The live items told they are still open during this stretch of their session's own background work. */
  const toldWhileWaiting = new Set<string>();
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
   * made: called in the synchronous step before its item is filed.
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

  // --- the project's conversation: co-parent of its project's items -----------------

  /** A project's conversation, when it has one that is none of `not`. */
  const projectLead = (
    projectId: string | null,
    ...not: string[]
  ): InstanceRow | undefined => {
    const id = projectId
      ? db.project(projectId)?.conversationInstanceId
      : undefined;
    const [lead] = id ? db.getInstancesByIds([id]) : [];
    return lead && !not.includes(lead.id) ? lead : undefined;
  };

  /**
   * Whether files may go with a handoff from `sender` to `receiver`, whose
   * work item is `item` (none for a session with none): where handoff's own
   * relations reach, both ways. Down to a session it delegated or started,
   * or to an item whose project's conversation it is; up to its parent, or
   * to its project's conversation.
   */
  const inputsGo = (
    sender: InstanceRow,
    receiver: InstanceRow,
    item: WorkItemRow | undefined
  ): boolean =>
    receiver.parentInstanceId === sender.id ||
    item?.parentInstanceId === sender.id ||
    (item !== undefined && leadFor(item)?.id === sender.id) ||
    receiver.id === sender.parentInstanceId ||
    projectLead(sender.projectId ?? null, sender.id)?.id === receiver.id;

  /** The item's project's conversation, when it has one that is not the item's own session. */
  const leadFor = (item: WorkItemRow): InstanceRow | undefined =>
    isHubParent(item.parentInstanceId)
      ? undefined
      : projectLead(item.projectId, item.instanceId);

  /**
   * The boundary a session runs inside: its work item's workspace; none for
   * any other session (launches.ts `sessionWorkspace`, every spawn's).
   */
  const boundOf = (row: InstanceRow): WorkspaceRef | undefined => {
    const item = itemOf(row);
    const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
    return workspace ? boundaryOf(workspace) : undefined;
  };

  /** The pause of the machine a workspace is on, in words; undefined when it is not paused. */
  const pausedWorkspace = (workspaceId: string): string | undefined => {
    const [workspace] = db.workspacesNamed(workspaceId);
    return workspace ? machinePaused(workspace.machineId) : undefined;
  };

  /** An item as its parent's delegate tray reads it. */
  const summaryOf = (item: WorkItemRow): WorkItemSummary => ({
    id: item.id,
    parentInstanceId: item.parentInstanceId,
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
    checkQueue: landingRun.landingWaits.get(item.id) ?? null,
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

  /** Whether a message from `origin` may reopen `item`: {@link reopens}, its conversation counting. */
  const mayReopen = (item: WorkItemRow, origin: NeutralOrigin): boolean =>
    reopens(item.parentInstanceId, origin, leadFor(item)?.id);

  /**
   * The Caw an item's report must not wake: its project's, while he is off
   * and the item is not yours (its origin `event`, or `kept`, whose end is
   * noted in the project's conversation instead, caw.ts `notice`); null otherwise.
   */
  const cawOff = (item: WorkItemRow): string | null => {
    const led = item.projectId ? db.project(item.projectId) : undefined;
    return led && !led.eventsOn && item.origin !== "you"
      ? led.conversationInstanceId
      : null;
  };

  /**
   * Whether a session's reports and asks go up to its parent at all: only
   * delegated work's do (a work item). A session another session started with `start_session`
   * nests under it and reports to no one, its asks the person's. A
   * routine's run has no parent row: routines.ts reads how it ended and
   * sends its report to the project's conversation itself (`surfaceRun`),
   * so a run that answers NO_REPLY wakes no model, the conversation's
   * included.
   */
  const reportsBack = (row: InstanceRow): boolean =>
    !isHubParent(row.parentInstanceId) && !!row.workItemId;

  /**
   * Who hears a delegated session's reports and asks: the session that
   * started its work, by the id its row records, and no one else. A
   * project's conversation hears only the work he started himself, never another
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
   * fails with the sentence that names the budget, its parent (and its project's conversation) are
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
    const failed = failLive(row, reason);
    if (failed) {
      console.log(`[work-items] ${failed}: its session failed: ${reason}`);
    }
  };

  /** `row`'s item failed with `reason` and reported, when it is live: its id, else undefined. */
  const failLive = (row: InstanceRow, reason: string): string | undefined => {
    const item = itemOf(row);
    if (!(item && LIVE.has(item.state))) {
      return;
    }
    quiet.delete(item.id);
    clearWait(item);
    const ended = finish(item, { state: "failed", error: reason });
    report(row, `${reason}${reportLine(ended)}`, ended.state === "failed");
    return item.id;
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

  /** The session rows of `items`, by id. */
  const sessionRows = (
    items: readonly WorkItemRow[]
  ): Map<string, InstanceRow> =>
    new Map(
      db
        .getInstancesByIds(items.map((item) => item.instanceId))
        .map((row) => [row.id, row])
    );

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
    const rows = sessionRows(live);
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
   * turn recorded to hand back (cut-turns.ts `diedOnSignal`), a heartbeat that
   * no longer lists it (an OpenCode server restart; db `reconcileHeartbeat`),
   * a register that restored no process for it (a turn a restart cut, its
   * row older than the restore's horizon or past its cap: the first sweep
   * once its machine is connected wakes it), an interrupted turn left at
   * rest until the agent slept it, and a spawn whose session came up and
   * lost its process before its first turn. A row in `error` or gone is
   * {@link followSessions}'s. A session the register did restore is handed
   * its cut turn by the restore itself (cut-turns.ts `resumeCutTurn`); it has a
   * process, or a send on its way, and the sweep leaves it.
   */
  const wakeAsleep = (): void => {
    const live = db.liveWorkItems();
    if (live.length === 0) {
      return;
    }
    const rows = sessionRows(live);
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
   * project conversation's or your word to it carries the work on ({@link unhold}).
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
    const sent = tell(row, `${STILL_OPEN} ${FINISH_LINE}`);
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
   * conversation while events are off (a project note says the end), or a
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

  /** The item's task, its plan and the task's to-dos, when it has a task with a plan and to-dos are kept. */
  const taskPlan = async (item: WorkItemRow) => {
    const task = taskOf(item);
    const plan = task ? await planFor(item) : undefined;
    return task && todos && plan?.length
      ? { task, plan, ledger: todos }
      : undefined;
  };

  /**
   * Ticks each open to-do of the item's task whose id a completed plan item
   * carries as its id (`td-3`), and each open proposed to-do whose words one
   * without such an id has: a step left open when the attempt ended once
   * ({@link proposeLeftovers}) and completed after it went on. One read of
   * the ledger and, when something is to tick, one commit.
   */
  const syncPlan = async (item: WorkItemRow): Promise<void> => {
    const planned = await taskPlan(item);
    if (!planned) {
      return;
    }
    const { task, plan, ledger } = planned;
    const done = plan.filter((entry) => entry.status === "completed");
    const completed = new Set(
      done.filter((entry) => PLAN_TODO.test(entry.id)).map((entry) => entry.id)
    );
    const said = new Set(
      done
        .filter((entry) => !PLAN_TODO.test(entry.id))
        .map((entry) => planWords(entry.content))
    );
    if (completed.size === 0 && said.size === 0) {
      return;
    }
    const open = (await ledger.read(task.projectId, task.taskId)).filter(
      (todo) =>
        !todo.done &&
        todo.id &&
        (completed.has(todo.id) ||
          (todo.proposed && said.has(planWords(todo.text))))
    );
    if (open.length > 0) {
      await ledger.write(
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
   * open (whose id is no to-do's) become proposed to-dos on its task — a line
   * each, `(proposed)`, skipping words the task already has.
   */
  const proposeLeftovers = async (item: WorkItemRow): Promise<void> => {
    const planned = await taskPlan(item);
    if (!planned) {
      return;
    }
    const { task, plan, ledger } = planned;
    await syncPlan(item);
    const known = new Set(
      (await ledger.read(task.projectId, task.taskId)).map((todo) =>
        planWords(todo.text)
      )
    );
    const left = plan
      .filter(
        (entry) => entry.status !== "completed" && !PLAN_TODO.test(entry.id)
      )
      .map((entry) => entry.content.replace(RUNS_OF_SPACE, " ").trim())
      .filter((text) => text && !known.has(planWords(text)))
      .slice(0, PROPOSALS_LIMIT);
    if (left.length > 0) {
      await ledger.write(
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
    return `Not yet: ${open.length === 1 ? "this to-do" : `these ${open.length} to-dos`} of your task ${open.length === 1 ? "is" : "are"} not ticked.\n\n${open
      .map(
        (todo) =>
          `- ${todo.id ? todoLink(task.projectId, task.taskId, todo.id, todo.text) : `${todo.path} ${todo.text}`}`
      )
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
   * project's conversation, those of its project. One that has filed its item is that
   * item now, and is left out.
   */
  const queuedFor = (caller: string): QueuedWorkItemRow[] =>
    db
      .queuedWorkItems()
      .filter((row) => !db.workItem(row.id))
      .filter(
        (row) =>
          row.parentInstanceId === caller || queuedLead(row)?.id === caller
      );
  /** The conversation of a queued delegate's project, unless it queued it. */
  const queuedLead = (queued: QueuedWorkItemRow): InstanceRow | undefined => {
    const request = queued.request as QueuedRequest;
    const [parent] = db.getInstancesByIds([queued.parentInstanceId]);
    return projectLead(
      request.task?.projectId ?? parent?.projectId ?? null,
      queued.parentInstanceId
    );
  };

  /**
   * A delegate whose brief names neither its machine, nor its folder, nor a
   * fork, in a project whose account is not signed in on its parent's
   * machine: cut at the project's place for its work (work-place.ts), when
   * the account is signed in there. A brief that names any of them keeps
   * it, and placement refuses the start where the account is not signed
   * in; so does one whose project's place is not on such a machine.
   */
  const onProjectAccount = (
    request: WorkItemRequest,
    parent: Parent,
    projectId: string | null
  ): WorkItemRequest => {
    const project = projectId ? db.project(projectId) : undefined;
    const account = project?.inEffect.account.value;
    if (
      !(account && project) ||
      request.machineId ||
      request.cwd?.trim() ||
      request.fork
    ) {
      return request;
    }
    const signins = db.accounts.signins();
    if (signedInOn(signins, account, parent.machineId)) {
      return request;
    }
    const place = workPlace(project);
    return place.kind !== "none" &&
      signedInOn(signins, account, place.machineId)
      ? { ...request, machineId: place.machineId, cwd: place.cwd }
      : request;
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
    const skills = request.skills?.length ? request.skills : type?.skills;
    const settings: Settings = {
      type,
      harness,
      model,
      // A clean session loads no skill, its type's included.
      skills: request.clean ? undefined : skills,
      ...(request.clean ? { clean: true } : {}),
      mayStart: narrowMayStart(
        request.mayStart ?? type?.mayStart ?? [],
        sessionMayStart(parent)
      ),
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
    if (!parent) {
      return undefined;
    }
    const target = briefTarget(request, parent);
    return mayStartRefusal(parent, target.delegateType)
      ? undefined
      : briefingFor(db, parent.id, target);
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
   * Files a work item on `machineId`. Its project's first there, where the
   * project has no checkout, tells the hub the machine holds that project's
   * rows from now on ({@link WorkItemDeps.projectReached}).
   */
  const fileItem = (
    machineId: string,
    row: Parameters<typeof db.createWorkItem>[0]
  ): WorkItemRow => {
    const { projectId } = row;
    const reaches =
      typeof projectId === "string" &&
      !db.projectsWorkedOn(machineId).includes(projectId) &&
      !db
        .project(projectId)
        ?.places.some(
          (place) => place.machineId === machineId && place.kind === "checkout"
        );
    const item = db.createWorkItem(row);
    if (reaches) {
      projectReached(machineId);
    }
    return item;
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
    const item = fileItem(workspace.machineId, {
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
      (item.lands === "main" && !item.outputs?.length) ||
      workspace.kind === "folder"
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
    const claimed = workspaces.claim(needle);
    const { previous } = claimed;
    // Continuing a held workspace ends its hold: its work is live again.
    const workspace = workspaces.continued(claimed.workspace);
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
   * cut again (workspaces.ts `recut`); one that never retired as it stands, while
   * its clone is on its machine. Undefined when that clone is gone.
   */
  const withClone = async (
    workspace: WorkspaceRow
  ): Promise<WorkspaceRow | undefined> => {
    // A host-scope row's folder is the machine's own: there is no clone.
    if (workspace.host) {
      return workspace;
    }
    if (workspaces.recuttable(workspace)) {
      return await workspaces.recut(workspace);
    }
    const there = await command(
      workspace.machineId,
      "/",
      `test -d ${shellQuote(`${workspace.path}/.git`)}`,
      GIT_TIMEOUT_MS
    );
    return there.exitCode === 0 ? workspace : undefined;
  };

  /**
   * The workspace of an earlier attempt a retry runs in again: its earlier
   * sessions stopped ({@link endEarlierSessions}), its clone cut again by id
   * at its own path when it retired (workspaces.ts `recut`), its boundary started
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
    if (workspace.state === "archived" && !workspaces.recuttable(workspace)) {
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
        db.updateWorkspace(workspaces.continued(here).id, {
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
   * Refuses a start its parent may not make (its may-start list, core
   * `MayStart`), before anything spawns: a leaf starts only the types its
   * list names, judged by the type this start runs as (a follow-up's, its
   * session's). A card-settling start is the hub's, whoever asks.
   */
  const mayStartIt = (request: WorkItemRequest, parent: Parent): void => {
    if (request.settlesCards || startsAny(sessionMayStart(parent))) {
      return;
    }
    const refused = mayStartRefusal(
      parent,
      briefTarget(request, parent).delegateType
    );
    if (refused) {
      throw new WorkItemRefusal(403, refused);
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
    mayStartIt(request, parent);
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
   * as soon as what has been read passes {@link INPUTS_LIMIT_BYTES}.
   */
  const resolveHeld = async (
    held: HeldInput[],
    reader: InstanceRow
  ): Promise<HandedFile[]> => {
    const resolved: HandedFile[] = [];
    let bytes = 0;
    for (const input of held) {
      try {
        for await (const file of await resolveHanded(reader, input)) {
          // What is made for its reader as it is written (a preview's pass)
          // is a few hundred bytes: what is in hand now is what counts.
          bytes += typeof file.bytes === "function" ? 0 : file.bytes.length;
          if (bytes > INPUTS_LIMIT_BYTES) {
            throw new WorkItemRefusal(
              400,
              workWords.inputsLimits.held(INPUTS_LIMIT_BYTES / MIB)
            );
          }
          resolved.push(file);
        }
      } catch (error) {
        throw error instanceof HandedInputRefusal
          ? inputsRefused(error.message, { cause: error })
          : error;
      }
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
          `inputs: ${twin} and ${file.from} would both land as ${file.name} in the inputs folder; hand one under another name.`
        );
      }
      landing.set(file.name, file.from);
    }
  };

  /**
   * What `entries` hands on (hub handed-input.ts), before anything is cut:
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
   * `receiver`, the session that reads them, before a brief names them
   * ({@link handInto}).
   */
  const handIn = async (
    workspace: WorkspaceRow,
    inputs: Inputs,
    receiver: InstanceRow
  ): Promise<void> => {
    await handInto(
      workspace.machineId,
      scratchRefOf(workspace),
      inputs,
      receiver
    );
  };

  /**
   * `inputs` put into the inputs folder `place` names on `machineId` (core
   * `InputsPlace`: a workspace's scratch dir, or a session with no work
   * item's own) for `receiver`, the session that reads them, before the
   * message that names them goes. What the hub resolved it writes there
   * itself, what is made for its reader (a preview's pass) made for
   * `receiver` now. Paths are admitted again where they are read. THE ONE
   * DECISION for paths: on the machine that holds them, that machine copies
   * them itself, and none of their bytes crosses its link; from another
   * machine, they are read there and written here, through the hub.
   * Answers the folder as the machine named it, none from an agent that
   * names none.
   */
  const handInto = async (
    machineId: string,
    place: InputsPlace,
    inputs: Inputs,
    receiver: InstanceRow
  ): Promise<string | undefined> => {
    let folder: string | undefined;
    if (inputs.held.length > 0) {
      const files = await Promise.all(
        inputs.held.map(async (file): Promise<InputFile> => ({
          name: file.name,
          from: file.from,
          mode: HELD_MODE,
          content: (typeof file.bytes === "function"
            ? await file.bytes({ session: receiver, machineId })
            : file.bytes
          ).toString("base64"),
        }))
      );
      const landed = (await call(machineId, CONTROL_INPUTS_WRITE, [
        place,
        files,
      ])) as InputsLanded | undefined;
      folder = landed?.folder;
    }
    if (inputs.paths.length === 0) {
      return folder;
    }
    if (machineId === inputs.machineId) {
      const copied = (await call(machineId, CONTROL_INPUTS_COPY, [
        inputs.paths,
        inputs.bound,
        place,
        inputs.project,
      ])) as InputsAdmitted;
      if ("refused" in copied) {
        throw inputsRefused(copied.refused);
      }
      return copied.folder ?? folder;
    }
    const read = (await call(inputs.machineId, CONTROL_INPUTS_READ, [
      inputs.paths,
      inputs.bound,
      inputs.project,
    ])) as InputsRead;
    if ("refused" in read) {
      throw inputsRefused(read.refused);
    }
    const landed = (await call(machineId, CONTROL_INPUTS_WRITE, [
      place,
      read.files satisfies InputFile[],
    ])) as InputsLanded | undefined;
    return landed?.folder ?? folder;
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
      return await startHost(request, parent, inputs);
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
    // A Linux view's path is the person's folder, no clone of its own
    // ({@link ownCopy}): a session there runs on the host as theirs do.
    const filed = [
      ...db.activeWorkspacesOn(machineId),
      ...db.heldWorkspaces().filter((one) => one.machineId === machineId),
    ].find((one) => ownCopy(one) && inside(one.path));
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
   * project place, repository or clone is recorded for it. Its inputs go
   * into its scratch dir's `inputs/` (agent host-scratch.ts), as a
   * workspace's do.
   */
  const startHost = async (
    request: WorkItemRequest,
    parent: Parent,
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    const machineId = targetMachine(request, parent);
    notPaused(machineId);
    const settings = settingsOf(request, parent);
    modelOffered(machineId, settings);
    const path = workspaces.cwdOn(machineId, request.cwd?.trim() || "~");
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
    return spawnIn(workspace, settings, parent, request, inputs);
  };

  /**
   * An item in a new workspace: cut from the request's repository (the
   * parent's directory by default) at its default branch's tip, or, with
   * `from`, on that workspace's machine from its repository and moved to
   * its head (workspaces.ts `cutFrom`); then its session spawned there.
   */
  const startFresh = async (
    asked: WorkItemRequest,
    parent: Parent,
    projectId: string | null,
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    const source = asked.from
      ? workspaces.fromSource(asked.from, parent)
      : undefined;
    const request = source ? asked : onProjectAccount(asked, parent, projectId);
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
    const workspace = await workspaces.openWorkspace(
      parent.id,
      workspaces.cwdOn(
        machineId,
        source?.repoRoot ?? request.cwd ?? parent.cwd
      ),
      machineId,
      projectId,
      {
        account: placement.launchesOn,
        first: { instanceId, harness: settings.harness, resume: null },
      }
    );
    if (source) {
      await workspaces.cutFrom(workspace, source);
    }
    if (request.detachAt) {
      await workspaces.detachNew(workspace, request.detachAt);
    }
    if (projectId) {
      workspaces.recordRepository(projectId, workspace);
      // The machine placed the project's rows in the clone as it cut it.
      projectStands(projectId);
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
   * The follow-up in the workspace `needle` names, going on there in one
   * step of its turn (workspaces.ts `goOnIn`): a retired one cut again at its own
   * path first (workspaces.ts `recut`), so no settle retires it before its item is
   * filed. Its boundary is up and, when it continues a session, its inputs
   * are written for that session before the claim, which files the item in
   * the same step as its one-writer check; the inputs land only in a
   * workspace the claim would take, and the claim is made again as the item
   * is filed. A workspace whose last session never started gets a new
   * session, its item filed in that step and its inputs written for it
   * once it stands, as every new delegate's are.
   */
  const startFollowUp = (
    needle: string,
    request: WorkItemRequest,
    parent: Parent,
    inputs: Inputs
  ): Promise<WorkItemStart> => {
    const named = workspaces.namedWorkspace(needle);
    notPaused(named.machineId);
    return workspaces.goOnIn(named.id, async () => {
      await workspaces.boundaryUp(needle);
      const { workspace, previous } = workspaces.claim(needle);
      const [resumed] = previous
        ? db.getInstancesByIds([previous.instanceId])
        : [];
      if (resumed?.sessionId && inputs.files.length > 0) {
        await handIn(workspace, inputs, resumed);
      }
      const followed = followUp(needle, request, parent, inputs);
      return "item" in followed
        ? followed
        : spawnIn(
            followed,
            settingsOf(request, parent),
            parent,
            request,
            inputs
          );
    });
  };

  /**
   * Where an item lands and what it hands in, and the project it works for
   * (its task's, else its parent's), as its row keeps them.
   */
  /**
   * Whose work a new item is ({@link WorkItemRequest.origin}): the request's,
   * else its parent's. A routine's run is an event's; a work item's
   * session's, its own item's; anyone else's, the project's conversation's
   * among them, yours.
   */
  const originOf = (request: WorkItemRequest, parent: Parent): WorkOrigin => {
    if (request.origin) {
      return request.origin;
    }
    if (isRoutineParent(parent.id)) {
      return "event";
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
      waitedOn: request.waitedOn?.length ? request.waitedOn : null,
      budget: budgetFrom(request.budget, project?.budget),
    };
  };

  /** What the caller's start text adds for inputs copied in: their names, a folder's once. */
  const inputsSaid = (inputs: Inputs): string =>
    inputs.files.length > 0
      ? ` Copied ${counted(inputs.files.length, "input")} into its $TMPDIR/inputs/: ${inputsOnce(
          inputs.files
        )
          .map(({ files, name }) => workWords.inputNamed({ files, name }))
          .join(", ")}.`
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
    const { harness, mayStart } = settings;
    // A queued delegate's session and item take the ids its chip stood under.
    const instanceId =
      ahead?.instanceId ?? request.queuedAs?.instanceId ?? crypto.randomUUID();
    // Not a row yet: it is launched in the workspace's root.
    const label = `${leafOf(workspace.path)}#${instanceId.slice(0, 8)}`;
    const item = fileItem(workspace.machineId, {
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
      const asked = withInputsLine(
        `${handoffMarker(sessionLabel(parent).name, parent.id)}${fork}${request.prompt}`,
        inputs.files
      );
      // Its browser's loopback is its own: it is told where the dashboard is.
      const dashboard = browserDashboard(
        workspace.machineId,
        item.projectId ?? null
      );
      const content = dashboard ? withDashboardLine(asked, dashboard) : asked;
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          workspace.host
            ? withHostLine(
                content,
                workspace.path,
                machineName(workspace.machineId),
                item.projectId ? outputsFolder(item) : undefined
              )
            : withWorkspaceLine(
                content,
                {
                  ...workspace,
                  ...workspaces.askedIn(workspace, request.cwd ?? parent.cwd),
                },
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

    // Its machine takes no start now: the caller is told it is held, and why.
    const held = startHeld(instanceId);
    return {
      item,
      workspace,
      text:
        (held
          ? workWords.heldStart(
              sessionLink(instanceId, request.title),
              label,
              held
            )
          : `Started ${sessionLink(instanceId, request.title)}, ${label}: `) +
        (settings.forkOf
          ? `a fork of this conversation on ${harness}${settings.model ? ` (${settings.model})` : ""}, starting with every turn of yours so far, `
          : `a fresh ${harness} session, `) +
        (workspace.host
          ? `work item ${item.id.slice(0, 8)} with host scope on ${machineName(workspace.machineId)} (${placeOf(workspace)}; nothing lands).`
          : `work item ${item.id.slice(0, 8)} in workspace ${workspace.id.slice(0, 8)} (${placeOf(workspace)}).`) +
        ` ${REPORT_ARRIVES} Guide it, or continue it after it ` +
        `reports, with handoff("${label}", ...): the message lands in the same session and its cached transcript.` +
        ` ${workWords.startsDelegates(mayStart)}` +
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
      landingRun.landingWait(now.id, completingWords(group));
      return;
    }
    console.log(
      `[work-items] ${now.id}: every item it delegated has ended; it lands now`
    );
    landingRun.landingWait(now.id, null);
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
      landingRun.landingWait(item.id, completingWords(group));
      console.log(
        `[work-items] ${item.id}: finish_item stored; it lands once ${group.length} item(s) it delegated have ended`
      );
      return completingText(group);
    }
    update(item.id, { submission: request, landingSince: new Date() });
    return (await landingRun.settleLanding(item, request)).text;
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
    landingRun
      .settleLanding(item, submission)
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
   * Its workspace is settled next (workspaces.ts `settleSoon`): retired or held once
   * nothing holds it, which its session, still in the turn that ended it,
   * does until it sleeps.
   *
   * An item whose work landed (its `landed`) and that runs again (a word
   * from the reader, its parent or its project's conversation, {@link reopen}; a
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
    landingRun.landingStops.get(item.id)?.abort();
    workedThisTurn.delete(item.id);
    toldWhileWaiting.delete(item.id);
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
    workspaces.settleSoon(item.workspaceId);
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
   * A live item's turn that ended with nothing coming for its session: the
   * "still open" message. A turn that called a tool of its own starts the
   * count over; one that did nothing adds to it, and the {@link QUIET_TURNS}th
   * in a row fails the item, its parent told.
   */
  const quietTurn = (
    row: InstanceRow,
    item: WorkItemRow,
    worked: boolean
  ): { body: string; failed: boolean } | undefined => {
    toldWhileWaiting.delete(item.id);
    const turns = worked ? 0 : (quiet.get(item.id) ?? 0) + 1;
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

  /**
   * A live item's turn that ended with its session's own background work
   * running: that work's end wakes it, so the turn counts for nothing. It is
   * told it is still open once a stretch: a delegate that left a server running
   * and forgot finish_item is woken by nothing, and its session never sleeps.
   */
  const waitsInBackground = (row: InstanceRow, item: WorkItemRow): void => {
    quiet.delete(item.id);
    if (toldWhileWaiting.has(item.id)) {
      return;
    }
    toldWhileWaiting.add(item.id);
    tell(
      row,
      `Your work item is still open, with background work of yours running. If you wait on it, end your turn: its end wakes you. If not, ${FINISH_LINE}`
    );
  };

  /**
   * A live item's turn, nothing holding it, ended at `endedAt`: failed, with
   * something coming for its session, waiting on its own background work, or
   * none of these. Answers what its parent is sent, or nothing.
   */
  const openItemTurnEnded = (
    row: InstanceRow,
    item: WorkItemRow,
    turn: { error?: string; wakes?: TurnWakes },
    endedAt: Date,
    worked: boolean
  ): { body: string; failed: boolean } | undefined => {
    const busy = busyAfter(row, endedAt);
    const waits = waitsOnItself(turn.wakes);
    if (turn.error !== undefined) {
      return failedTurn(item, turn.error, busy || waits);
    }
    if (busy) {
      quiet.delete(item.id);
      return undefined;
    }
    if (waits) {
      waitsInBackground(row, item);
      return undefined;
    }
    return quietTurn(row, item, worked);
  };

  /** A word from the hub about an item, to the item's session: how its send went. */
  const tell = (row: InstanceRow, content: string) =>
    send(sessionWord(row, content, WAKE_ORIGIN));

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
  const workspaces = createWorkspaces({
    call,
    command,
    db,
    end,
    launchesOn,
    makingFrom,
    sendWakes,
    servedOwed,
    stageRuns,
    waitingOnPerson,
    workspaceChanged,
    report,
    finishing,
    opening,
    discardCreate,
    leadFor,
    mayReopen,
    notPaused,
    itemOf,
    machineName,
  });
  const landingRun = createLandingRun({
    call,
    command,
    db,
    hubMachineId,
    machineFree,
    machinePaused,
    online,
    sessionUrl,
    taskTitle,
    report,
    finishing,
    closeTurn,
    published,
    update,
    declareWait,
    finish,
    heldForGroup,
    machineName,
    workspaces,
  });

  /**
   * A finished item running again in the same session: its held workspace's
   * hold ended, its result and end cleared. It ends again the usual way, with
   * a new report to its parent.
   */
  const rerun = (item: WorkItemRow): WorkItemRow => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (workspace) {
      workspaces.continued(workspace);
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
    if (workspaces.isHeld(workspace)) {
      return true;
    }
    // A folder's work since is its change set not yet in its folder.
    if (workspace.kind === "folder") {
      const changes = (await call(
        workspace.machineId,
        CONTROL_WORKSPACE_CHANGES,
        [refOf(workspace)]
      )) as WorkspaceChanges;
      return changes.changed.length > 0;
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
    // A folder's changes are its change set, which is what lands.
    if (
      workspace?.state !== "active" ||
      workspace.host ||
      workspace.kind === "folder"
    ) {
      return;
    }
    const run = landingRun.runIn(workspace, item);
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
        ? ` -- .${outputs.map((path) => ` ${shellQuote(`:(exclude,literal)${path}`)}`).join("")}`
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

  return {
    start: (asked: WorkItemRequest) => start(asked),

    /** While the item's landing waits (a shared machine slot, a pause, its turn to land): what its status says, and since when. */
    landingWaitOf: (itemId: string): { words: string; since: number } | null =>
      landingRun.landingWaits.get(itemId) ?? null,

    /**
     * The hub's own work: a routine's run (routines.ts, {@link routineParent})
     * or a design check's verifier (design-verify.ts, {@link verifierParent}).
     * A fresh session in a new workspace cut from `parent.cwd` on
     * `parent.machineId`. It reports to no session, the project's conversation
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
      landingRun.landingWait(itemId, words),

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
     * The fleet's briefing guidance a `delegate` call's caller has yet to
     * read for its delegate ({@link briefingOf}), recorded as handed: what
     * a `delegate` naming its task, which starts on the dispatcher's path
     * (dispatch.ts `AttemptAsk`), is refused with first, as any is here.
     */
    briefing(request: WorkItemRequest): string | undefined {
      return briefingOf(request);
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
      const unclean = cleanProblem(asked);
      if (unclean) {
        throw new WorkItemRefusal(400, unclean);
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
     * conversation may withdraw it; anyone else is refused as `stop_delegate`
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

    /** Whether `leadId` is the conversation of the project of the work item `instanceId` runs: it may answer, steer and stop it. */
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
     * its own ({@link restsInWait} is false for it) makes its turn no quiet
     * one, and ends a wait at rest, so a session working again is not shown
     * waiting. The declaring turn's own calls end nothing.
     */
    worked(instanceId: string, tools: readonly string[]): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(item && tools.some((tool) => !restsInWait(tool)))) {
        return;
      }
      if (LIVE.has(item.state)) {
        workedThisTurn.add(item.id);
      }
      if (item.waitUntil && waitsAtRest.has(item.id)) {
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
      const waitReason = reason.trim().replace(/\s+/gu, " ");
      const waiting = declareWait(item, minutes, waitReason);
      const clock = waitClock(waiting.waitUntil as Date);
      const line = `${item.title} is waiting until ${clock}: ${waitReason}`;
      return `${line}\n\nEnd your turn. The hub will wake you when the wait ends.`;
    },

    /**
     * An interrupt cut the session's turn: its declared wait is cancelled,
     * and, when `hold`, its live item is held ({@link heldFor}): the turn's
     * end hands nothing back and starts nothing, and nothing the hub sends
     * on its own wakes it until its parent, its conversation or the reader writes to
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
     * parent's, its conversation's or the reader's words. Such a send is kept owed
     * and goes, in order, once one of them wakes it.
     */
    heldFor(instanceId: string, origin: NeutralOrigin): boolean {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      return (
        (!!item?.heldAt && LIVE.has(item.state) && !mayReopen(item, origin)) ||
        workspaces.retiredFor(instanceId, origin)
      );
    },

    /**
     * Whether a send from `origin` waits at the hub because the session's
     * finished item's workspace retired and is cut again first
     * (workspaces.ts `recut`): the handoff that reopens it, from its parent, its
     * project's conversation or the reader (workspaces.ts `retiredFor`). Its hold's words say so.
     */
    recutHold: (instanceId: string, origin: NeutralOrigin): boolean =>
      workspaces.retiredFor(instanceId, origin),

    /**
     * A send kept for {@link recutHold}: after whatever runs in the
     * workspace's turn (a settle that may be retiring it as the send came),
     * the workspace retired is cut again at its own path (workspaces.ts `recut`),
     * then what was kept for it goes ({@link WorkItemDeps.recutDone}); its
     * settle meanwhile is deferred by the send on its way (workspaces.ts `holdOn`).
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
          (workspaces.recuttable(workspace) ||
            workspaces.turnMayRetire(workspace.id))
        ) ||
        workspaces.recutWaits.has(instanceId)
      ) {
        return;
      }
      workspaces.recutWaits.add(instanceId);
      workspaces
        .inWorkspaceTurn(workspace.id, async () => {
          const [now] = db.workspacesNamed(workspace.id);
          if (now && workspaces.recuttable(now)) {
            await workspaces.recut(now);
          }
        })
        .finally(() => workspaces.recutWaits.delete(instanceId))
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
     * cut again by workspaces.ts `recut`, rebased as it landed by `landOnBase`);
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
     * A send from `origin` reached the session: its parent's, its conversation's or
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
        if (
          workspace?.state === "archived" &&
          !workspaces.recuttable(workspace)
        ) {
          return {
            reason: `${item.title} (${handle(item.id)}) is ${item.state}, and ${workspaces.archivedWords(workspace)}`,
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
     * from then on held (workspaces.ts `holdOn`) until the answered release, called
     * once the continuation's job is filed (its record holds it from there)
     * or has failed to be. Throws why there is no clone.
     */
    async continuable(itemId: string): Promise<() => void> {
      const item = db.workItem(itemId);
      if (!item) {
        throw new Error(`work item ${itemId} has no workspace`);
      }
      const { workspaceId } = item;
      await workspaces.inWorkspaceTurn(workspaceId, async () => {
        const [workspace] = db.workspacesNamed(workspaceId);
        if (!workspace) {
          throw new Error(`work item ${itemId} has no workspace`);
        }
        if (
          workspace.state === "archived" &&
          !workspaces.recuttable(workspace)
        ) {
          throw new Error(workspaces.archivedWords(workspace));
        }
        if (!(await withClone(workspace))) {
          throw new Error(
            `the clone of workspace ${handle(workspace.id)} is gone from ${machineName(workspace.machineId)}`
          );
        }
        workspaces.continuing.set(
          itemId,
          (workspaces.continuing.get(itemId) ?? 0) + 1
        );
      });
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const left = (workspaces.continuing.get(itemId) ?? 1) - 1;
        if (left > 0) {
          workspaces.continuing.set(itemId, left);
        } else {
          workspaces.continuing.delete(itemId);
        }
        // Held no longer by this, it settles as it stands.
        workspaces.settleSoon(workspaceId);
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
      toldWhileWaiting.delete(item.id);
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
     * failed. A turn with something coming (a send, its own delegated work)
     * or with its own background work running, which its harness says on the
     * result (`wakes`), is not quiet, and starts the count over. Any other
     * gets the "still open" message ({@link quietTurn}), and the third in a
     * row that did nothing fails the item, whoever started those turns, and
     * reports that failure to the parent. A declared wait stays on the tray
     * and is summarized only with the next actionable message. A session
     * that runs no item reports nothing.
     */
    turnEnded(
      row: InstanceRow,
      turn: { text: string; error?: string; wakes?: TurnWakes },
      endedAt: Date
    ): { body: string; failed: boolean } | undefined {
      const item = itemOf(row);
      if (!item) {
        return;
      }
      const worked = workedThisTurn.delete(item.id);
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
      // A finished item has reported; one whose landing is running reports
      // when it settles (its session's own call may have died with the hub).
      if (!LIVE.has(item.state) || item.landingSince) {
        return undefined;
      }
      return openItemTurnEnded(row, item, turn, endedAt, worked);
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
     * landing-run.ts `settleLanding` runs it to its outcome. An item done already
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
     * who may reopen the item wait (its parent, its conversation, the reader): such
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
     * pass is kept, landing-run.ts `gateOnce`); a completing one lands if its own
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
        // on its row (landing-run.ts `gateOnce`).
        const kept = [...landingRun.passesOf(item.id).values()].flat().length;
        console.log(
          `resumed the landing of item ${item.id}${item.landingPhase ? ` at its phase ${item.landingPhase}` : ""}, ${kept} merge check pass(es) kept`
        );
        landStored(item, submission);
      }
      releaseLastTurns(machineId);
    },

    /**
     * A handoff with inputs (hub handed-input.ts), sent where handoff's own
     * relations reach ({@link inputsGo}): the inputs written, then
     * `sendLanded` called with what landed, which hands the message that names them to
     * the send path and answers what became of it. For a receiver whose
     * work item runs in a workspace, both go in one step of its turn
     * (workspaces.ts `goOnIn`): a retired one cut again first (workspaces.ts `recut`), the
     * inputs written into its `$TMPDIR/inputs/` (a host-scope one's scratch
     * dir, agent host-scratch.ts), and the message sent there, so it holds
     * the workspace (workspaces.ts `sessionsHold`) before any settle can retire it
     * and its scratch dir with the inputs. For a session with no work item,
     * its own inputs folder on its machine (core `InputsPlace`). Refused,
     * with nothing sent, for an input that may not go or cannot be read
     * ({@link readInputs}), one its machine cannot write, and a workspace
     * whose work was discarded.
     */
    async handOff<T>(
      instanceId: string,
      from: string,
      entries: unknown[],
      sendLanded: (landed: HandoffInputs) => T
    ): Promise<T> {
      const [row] = db.getInstancesByIds([instanceId]);
      const [caller] = db.getInstancesByIds([from]);
      if (!row) {
        throw new WorkItemRefusal(404, `unknown session ${instanceId}`);
      }
      if (!caller) {
        throw new WorkItemRefusal(404, `unknown session ${from}`);
      }
      const item = itemOf(row);
      if (!inputsGo(caller, row, item)) {
        throw new WorkItemRefusal(
          403,
          workWords.inputsNotTheirs(sessionLink(row.id, boardTitle(row)))
        );
      }
      // Read before a retired workspace is cut again: an input that may not
      // go refuses the handoff before anything is cut.
      const inputs = await readInputs(entries, caller);
      const named = inputs.files.map(({ name, from: read }) => ({
        name,
        from: read,
      }));
      if (!item) {
        const folder = await handInto(
          row.machineId,
          { session: row.id, cwd: row.cwd },
          inputs,
          row
        );
        if (!folder) {
          throw new WorkItemRefusal(
            409,
            `${sessionLink(row.id, boardTitle(row))} runs on ${machineName(row.machineId)}, whose agent keeps no inputs folder for a session with no work item: update it, or hand off without inputs.`
          );
        }
        return sendLanded({ folder, inputs: named, cut: false });
      }
      return await workspaces.goOnIn(
        item.workspaceId,
        async (workspace, cut) => {
          if (!workspace || workspace.state === "archived") {
            throw new WorkItemRefusal(
              409,
              `${item.title} (${handle(item.id)}) is in workspace ${handle(item.workspaceId)}, which is ${workspace?.state ?? "gone"}: nowhere to put inputs.`
            );
          }
          await handIn(workspace, inputs, row);
          return sendLanded({
            folder: `$TMPDIR/${INPUTS_DIR}/`,
            inputs: named,
            cut,
          });
        }
      );
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
      landingRun.landingStops.get(item.id)?.abort();
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
      failLive(row, why);
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

    /**
     * Where every spawn of a session runs ({@link spawnOf}): a work item's
     * workspace whose boundary bounds it ({@link workspaceOf}), or a
     * host-scope item's workspace whose scratch dir is its `TMPDIR` (core
     * `SpawnPayload.hostScratch`); neither for any other session.
     */
    spawnPlace(
      row: InstanceRow
    ): Pick<SpawnPayload, "hostScratch" | "workspace"> {
      const item = itemOf(row);
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      if (!workspace) {
        return {};
      }
      return workspace.host
        ? { hostScratch: workspace.id }
        : { workspace: refOf(workspace) };
    },

    /** {@link holdsProjectOn}: whether a machine holds a delegate workspace of a project, one of its places. */
    holdsProjectOn: workspaces.holdsProjectOn,

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
      const workspace = workspaces.namedWorkspace(needle);
      if (!workspaces.isHeld(workspace)) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${handle(workspace.id)} is ${workspace.state}, not held: what a workspace holds is read on its machine once its work has ended and its boundary is closed, and kept with it while it is held.`
        );
      }
      return workspaces.heldWork(workspace);
    },

    /**
     * What the workspace of session `instanceId`'s item holds that is on no
     * remote ({@link Unlanded}, read by workspaces.ts `unlandedOf`); undefined for a
     * session with no item. Throws the machine's words when git cannot say.
     */
    async unlanded(instanceId: string): Promise<Unlanded | undefined> {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!item) {
        return;
      }
      const read = await workspaces.unlandedOf(item.workspaceId);
      return read && { ...read, live: LIVE.has(item.state) };
    },

    /**
     * The artifacts workspace `id` serves that still hold its retirement
     * (workspaces.ts `owedFrom`), each once by its artifact's own id and title (a
     * held next version by the artifact it is held for): what
     * `stop_delegate` names. Empty for a workspace the hub does not hold.
     */
    serving: (id: string): { id: string; title: string }[] => {
      const [workspace] = db.workspacesNamed(id);
      if (!workspace) {
        return [];
      }
      const titled = new Map<string, string>();
      for (const row of workspaces.owedFrom(workspace)) {
        titled.set(row.heldFor ?? row.id, row.title);
      }
      return [...titled].map(([one, title]) => ({ id: one, title }));
    },

    /** Every held workspace, with what it holds and where ({@link HeldWork}), newest first. */
    heldWorkspaces: (): HeldWork[] =>
      db.heldWorkspaces().filter(workspaces.isHeld).map(workspaces.heldWork),

    /**
     * {@link settle} for each active workspace on `machineId`, one after
     * another, then each archived one whose clone is still there closed
     * again (workspaces.ts `closeLeftClones`): the sweep's look (workspace-retire.ts).
     * A timed look passes over a workspace whose last settle failed until its
     * wait is over ({@link settleFailed}); a look someone `asked` for tries
     * it now. Answers each one's outcome by id.
     */
    async settleOn(
      machineId: string,
      asked: boolean
    ): Promise<{ outcome: Settled; workspace: WorkspaceRow }[]> {
      const done: { outcome: Settled; workspace: WorkspaceRow }[] = [];
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        // Something runs in its turn now, or its last settle failed and its
        // wait is not over: a later look settles it.
        if (
          workspaces.workspaceTurns.has(workspace.id) ||
          (!asked &&
            (workspaces.settleFailures.get(workspace.id)?.retryAt ?? 0) >
              Date.now())
        ) {
          continue;
        }
        done.push({
          workspace,
          outcome: await workspaces.settleNow(workspace.id),
        });
      }
      done.push(...(await workspaces.closeLeftClones(machineId)));
      return done;
    },

    /**
     * The workspace of session `instanceId`'s item settled soon
     * (workspaces.ts `settleSoon`): its session went to sleep, stopped or failed, so
     * it may hold that workspace no longer.
     */
    settleFor(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item) {
        workspaces.settleSoon(item.workspaceId);
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
      return workspaces.inWorkspaceTurn(frame.id, () => {
        workspaces.fileStage(machineId, frame, createdBy);
        return Promise.resolve();
      });
    },

    /**
     * Place `placeId`'s stage clones settled soon (workspaces.ts `settleSoon`): its
     * sheet stage slept, failed or stopped, and with it its hold.
     */
    settleStagesOf(placeId: string): void {
      const [workspace] = db.workspacesNamed(stageCloneId(placeId));
      if (workspace?.stageFor === placeId && workspace.state === "active") {
        workspaces.settleSoon(workspace.id);
      }
    },

    /**
     * Each active workspace on `machineId` that an artifact showed settled
     * soon (workspaces.ts `settleSoon`): the artifact went, and with it a hold.
     */
    settleShown(machineId: string): void {
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        if (!workspace.checksFor) {
          workspaces.settleSoon(workspace.id);
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
     * workspace held (workspaces.ts `WorkspaceHoldsWork`), unless `discard`: a
     * person chose to let it go, and its machine saves it to a carry before
     * deleting anything.
     */
    archive(
      needle: string,
      {
        discard = false,
        anyway = false,
      }: {
        discard?: boolean;
        /** The person confirmed it, knowing what still waits on him ({@link waiting}). */
        anyway?: boolean;
      } = {}
    ): Promise<ArchivedWorkspace> {
      // In its turn: no settle, bundle or read meets this close.
      return workspaces.inWorkspaceTurn(
        workspaces.namedWorkspace(needle).id,
        () =>
          workspaces.archiveNow(
            needle,
            discard,
            anyway ? undefined : workWords.servesWaitingConfirm
          )
      );
    },

    /**
     * What workspace `needle` serves that waits on the person
     * (workspaces.ts `waitingFrom`), each by its id and title: what an archive or
     * discard of it waits on, which the person's confirm names and an
     * approval ask shows.
     */
    waiting(needle: string): { id: string; title: string }[] {
      return workspaces
        .waitingFrom(workspaces.namedWorkspace(needle))
        .map((row) => ({
          id: row.id,
          title: row.title,
        }));
    },

    discardable: (from: string, needle: string): WorkspaceRow =>
      workspaces.discardable(from, needle),

    /**
     * `discard_workspace` from session `from`: {@link archive} with
     * `discard`, for a workspace that session cut or delegated an item into,
     * or one of the project it leads ({@link discardable}). Refused while
     * what it serves waits on the person, in words that give the session
     * its two ways forward, unless `approved`: the person approved that
     * session's ask to discard it anyway (server.ts, the approve ask's run).
     */
    discardFor(
      from: string,
      needle: string,
      { approved = false }: { approved?: boolean } = {}
    ): Promise<ArchivedWorkspace> {
      const workspace = workspaces.discardable(from, needle);
      return workspaces.inWorkspaceTurn(workspace.id, () =>
        workspaces.archiveNow(
          workspace.id,
          true,
          approved ? undefined : workWords.servesWaiting
        )
      );
    },

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

    /**
     * What a session's delegate tray shows when it opens: the items it
     * delegated, and only those — live work, failures nobody has dismissed
     * yet, what finished within the tray's hold — and its delegations still
     * queued for owned files. A project's conversation co-parents its
     * project's items (it may reopen them, hand them files, withdraw their
     * queue), but its tray holds what it made: read as the project's, a new
     * Caw conversation opened under "+8 · 101 failed" made by the
     * conversations before it and every other session in the project.
     */
    trayOf: (sessionId: string): WorkItemSummary[] => {
      const items = db
        .trayItemsOf(sessionId, new Date(Date.now() - TRAY_HOLD_MS))
        .filter((item) => item.instanceId !== sessionId)
        .map(summaryOf);
      const queued = db
        .queuedWorkItems()
        // One that has filed its item is that item, just before it leaves the queue.
        .filter((row) => !db.workItem(row.id))
        .filter((row) => row.parentInstanceId === sessionId)
        .map((row) => queuedSummaryOf(row));
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
