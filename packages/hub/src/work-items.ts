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
 * project's **lead** is a co-parent: it may answer, steer and stop the
 * project's items, hears their reports beside the parent, and alone once the
 * parent has ended. And the **plan ↔ to-do link**: a task attempt's plan, as
 * its plan panel reads it on any harness (CawCo's own steps where "CawCo's
 * to-dos" is on, else the harness's list), is read on its turn's end, a
 * completed `[td-n]` step ticks that to-do, `finish_item` asks once about the
 * to-dos still open, and steps left open become `(proposed)` to-dos.
 */
import type {
  CommandResult,
  DelegateType,
  Envelope,
  HarnessKind,
  InstanceRow,
  LandsMode,
  NeutralOrigin,
  PermissionMode,
  PlanStep,
  SendPayload,
  SpawnPayload,
  WorkItemSummary,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceRef,
} from "@cawco/core";
import {
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_MIGRATE,
  handoffMarker,
  machineLabel,
  type WorkspaceLanding,
  withLandingLine,
  withWorkspaceLine,
} from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type {
  DbShape,
  QueuedWorkItemRow,
  WorkItemRow,
  WorkspaceRow,
} from "./db";
import type {
  WorkBudget,
  WorkItemCheck,
  WorkItemSubmission,
} from "./db/schema";
import { leafOf, sessionLabel } from "./labels";
import {
  type BranchOutcome,
  land,
  landingQueue,
  openPullRequest,
  pushBranch,
  quote,
} from "./landing";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  FOLDER_FILE_LIMIT,
  FolderRefusal,
  folderPath,
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
  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
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

/** Statuses of a session that has ended: its work items are orphans its project's lead adopts. */
const ENDED: ReadonlySet<string> = new Set(["stopped", "discarded"]);

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
  /** Where its commits go once its checks pass; `main` when left out. */
  lands?: LandsMode;
  /** The machine a new workspace is cut on; the parent's by default. */
  machineId?: string;
  model?: string;
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

export interface WorkItemStart {
  item: WorkItemRow;
  text: string;
  workspace: WorkspaceRow;
}

export interface WorkItemDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  /**
   * Runs a command on a machine, in a directory — inside `workspace`'s
   * boundary when one is named; throws when the machine cannot.
   */
  readonly command: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef
  ) => Promise<CommandResult>;
  readonly db: DbShape;
  /**
   * Store stop intent and wait for the machine's positive end confirmation,
   * for `waitMs` at most. Returns at once for a session already ended or with
   * no process on its machine.
   */
  readonly end: (instanceId: string, waitMs?: number) => Promise<void>;
  /** The agent's live turn state, including a long tool call with no output. */
  readonly inTurn: (row: InstanceRow) => boolean;
  /**
   * An item went from live to finished (done, failed or cancelled), as
   * written. Called in the same step; whoever listens defers its own work.
   */
  readonly itemEnded?: (item: WorkItemRow) => void;
  /** Runs the budget sweep and every wait's timer until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Tells every dashboard an item moved: its parent's delegate tray follows it. */
  /**
   * Why an attempt at one of the project's tasks may not start now: its spend
   * cap holds (project-caps.ts `pauses`); nothing when it may.
   */
  readonly pauses: (projectId: string) => string | undefined;
  /**
   * The session's plan steps as its plan panel reads them (plans.ts): CawCo's
   * own list where "CawCo's to-dos" is on for it, else its harness's (Claude
   * Code's ledger, OpenCode's todos). The plan ↔ to-do link reads these.
   */
  readonly planSteps: (instanceId: string) => Promise<PlanStep[]>;
  readonly publish: (item: WorkItemSummary) => void;
  /** Hands a report to the parent of the item's session. */
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean
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
   * settles it (none at all for a harness without modes).
   */
  readonly spawn: (
    machineId: string,
    payload: SpawnPayload,
    workItemId: string,
    fallbackMode: PermissionMode
  ) => void;
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
}

/** A plan item's to-do id, `[td-3] Persist the choice` → `td-3`. */
const PLAN_TODO = /\[(td-\d{1,6})\]/;
/** Plan items one attempt may leave behind as proposed to-dos. */
const PROPOSALS_LIMIT = 20;
/** How often the hub looks at every live item's budget, between turns. */
const BUDGET_SWEEP_MS = 30_000;

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
  skills?: string[];
  type?: DelegateType;
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
  parent: InstanceRow,
  workspace: WorkspaceRow,
  { account, canDelegate, forkOf, harness, model, skills, type }: Settings
): SpawnPayload => ({
  instanceId,
  cwd: workspace.path,
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
  // sessions never see posting or admin tools.
  ...(type?.role ? { role: type.role } : {}),
  // Nested under its parent, and kept out of the catalogs as a spin-off
  // is; the workspace, not the session, owns the checkout.
  scratch: {},
  parent: { instanceId: parent.id },
  spawnedBy: { instanceId: parent.id },
  canDelegate,
  workspace: refOf(workspace),
});

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
  parent: InstanceRow,
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
 * Telegram), the session that delegated it, or its project's lead (a
 * co-parent of every item of its project).
 */
const reopens = (
  parentInstanceId: string | null,
  origin: NeutralOrigin,
  leadInstanceId?: string | null
): boolean =>
  origin.kind === "human" ||
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
  /** Where a check that names another machine ran: `on Omars-MacBook-Pro at 1a2b3c4d5`. */
  where?: string;
}

/** A fenced block that no command output can close early. */
const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;

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
  where,
}: CheckOutcome): string => {
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
  | { kind: "done" | "refused"; line: string; prUrl?: string }
  | { kind: "retry"; text: string };

/** The text that hands uncommitted work back to the session, for a landing that takes only commits. */
const dirtyText = (files: string, where: string): string =>
  `The checks passed, but the workspace has changes that are not committed, new files included. The checks ran on them and the hub lands only commits, so landing now could leave ${where} without them. Commit them, delete them, or add them to .gitignore, then call finish_item again.${fenced(files)}`;

/** A push to an item's own branch that did not happen, as its landing. */
const unpushed = (
  pushed: Exclude<BranchOutcome, { kind: "pushed" }>,
  workspace: WorkspaceRow,
  branch: string,
  lands: LandsMode
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
        line: `Not pushed: the push to branch ${branch} was refused.${fenced(pushed.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${workspace.id}.`,
      };
  }
};

/** How long a tray shows a finished item before it leaves (the dashboard's hold). */
const TRAY_HOLD_MS = 6000;

export const createWorkItems = ({
  call,
  command,
  db,
  end,
  itemEnded,
  lifetime,
  pauses,
  planSteps,
  publish,
  report,
  inTurn,
  send,
  sessionUrl,
  spawn,
  taskTitle,
  todos,
  types,
}: WorkItemDeps) => {
  /** Turns in a row each live item's session ended without `finish_item`, by item. */
  const quiet = new Map<string, number>();
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
    const discarded = call(machineId, CONTROL_WORKSPACE_ARCHIVE, [{ id }])
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
    projectLead(item.projectId, item.instanceId);

  /**
   * An item as its parent's delegate tray reads it, and its lead's: the lead
   * named when it co-parents the item from another session.
   */
  const summaryOf = (item: WorkItemRow): WorkItemSummary => ({
    id: item.id,
    parentInstanceId: item.parentInstanceId,
    leadInstanceId:
      projectLead(item.projectId, item.instanceId, item.parentInstanceId)?.id ??
      null,
    instanceId: item.instanceId,
    title: item.title,
    state: item.state,
    queued: null,
    createdAt: item.createdAt.getTime(),
    endedAt: item.endedAt?.getTime() ?? null,
    dismissedAt: item.dismissedAt?.getTime() ?? null,
    waitUntil: item.waitUntil?.getTime() ?? null,
    waitReason: item.waitReason,
    firstLines: {
      brief: firstLine(item.brief),
      result: firstLine(item.result),
      error: firstLine(item.error),
    },
  });

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
      queued: { owns: [...new Set((request.owns ?? []).map(globOf))] },
      createdAt: queued.queuedAt.getTime(),
      endedAt: null,
      dismissedAt: dismissedAt?.getTime() ?? null,
      waitUntil: null,
      waitReason: null,
      firstLines: { brief: firstLine(request.prompt), result: "", error: "" },
    };
  };

  /** Whether a message from `origin` may reopen `item`: {@link reopens}, its lead counting. */
  const mayReopen = (item: WorkItemRow, origin: NeutralOrigin): boolean =>
    reopens(item.parentInstanceId, origin, leadFor(item)?.id);

  /**
   * Who hears a delegated session's reports: its parent, and its project's
   * lead as well when that is another session; only the lead once the parent
   * has ended (stopped or discarded, or gone), as it adopts the orphan.
   * Without a lead, the parent alone, as before.
   */
  const reportees = (row: InstanceRow): InstanceRow[] => {
    const [parent] = row.parentInstanceId
      ? db.getInstancesByIds([row.parentInstanceId])
      : [];
    const item = itemOf(row);
    const lead = item ? leadFor(item) : undefined;
    if (!lead) {
      return parent ? [parent] : [];
    }
    if (!parent || ENDED.has(parent.status)) {
      return [lead];
    }
    return parent.id === lead.id ? [parent] : [parent, lead];
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
    parent: InstanceRow,
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
    for (const item of db.liveWorkItems()) {
      const theirs = item.owns ?? [];
      const where = theirs.length > 0 ? repoOfItem(item) : undefined;
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
    parent: InstanceRow,
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

  lifetime.every(BUDGET_SWEEP_MS, () => {
    for (const item of db.liveWorkItems()) {
      if (item.budget) {
        enforceBudget(item);
      }
    }
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
    report(
      row,
      `Group “${item.group}”: every item has ended (${tally}).\n\n${members.map(groupPart).join("\n\n")}`,
      false
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
    const repo = repoOfRequest(
      request,
      parent,
      request.task?.projectId ?? parent.projectId ?? null
    );
    if (ownsBlocker(repo, request.owns ?? [])) {
      return;
    }
    try {
      await start(request);
      db.dropQueuedWorkItem(queued.id);
    } catch (error) {
      if (error instanceof OwnsOverlap) {
        return;
      }
      unqueue(queued);
      tell(
        parent,
        `Your queued delegate “${queued.title}” could not start: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** A workspace's clone and boundary gone on its machine, its places with them, and its row archived. */
  const closeWorkspace = async (
    workspace: WorkspaceRow
  ): Promise<WorkspaceRow> => {
    await call(workspace.machineId, CONTROL_WORKSPACE_ARCHIVE, [
      refOf(workspace),
    ]);
    db.removeWorkspacePlaces(workspace.machineId, workspace.path);
    placesChanged(workspace.machineId);
    return (
      db.updateWorkspace(workspace.id, {
        state: "archived",
        boundaryPid: null,
      }) ?? workspace
    );
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
    if (workspace.state === "archived") {
      throw new WorkItemRefusal(
        409,
        `Workspace ${workspace.id} is archived: its clone and boundary are gone. Delegate without workspace to start a new one.`
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
   * starts it again when it has gone (a reboot, a sessiond restart), or says
   * why it cannot and the follow-up is refused. A workspace that is missing or
   * archived is left to {@link claim}, which refuses it in its own words.
   */
  const boundaryUp = async (needle: string): Promise<void> => {
    const [workspace] = db.workspacesNamed(needle.trim());
    if (workspace?.state !== "active") {
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
   * A new workspace: its machine cuts the clone and starts its boundary, then
   * the hub files it. `checksFor` makes it the check workspace of that one.
   */
  const openWorkspace = async (
    createdBy: string,
    cwd: string,
    machineId: string,
    checksFor?: string
  ): Promise<WorkspaceRow> => {
    const id = crypto.randomUUID();
    db.beginWorkspaceCreate(id, machineId);
    opening.add(id);
    const started = Date.now();
    try {
      const checkout = (await call(machineId, CONTROL_WORKSPACE_CREATE, [
        cwd,
        id,
      ])) as WorkspaceCheckout;
      return db.createWorkspace({
        id,
        machineId,
        repoRoot: checkout.repoRoot,
        path: checkout.path,
        branch: checkout.branch,
        base: checkout.base,
        boundaryPid: checkout.boundaryPid,
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
  const targetMachine = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): string => {
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

  const settingsOf = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): Settings => {
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
    parent: InstanceRow
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
    parent: InstanceRow,
    request: WorkItemRequest
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
    const brief = `${handoffMarker(sessionLabel(parent).name)}${request.prompt}`;
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
        `Continued ${label} as work item ${item.id} in workspace ${workspace.id} (${workspace.path}, branch ${workspace.branch}): ` +
        "the brief is its next message, in the same session and its cached transcript. " +
        "Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
        `reports, with handoff("${session.id}", ...).${extrasLine(item)}`,
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
    parent: InstanceRow
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
    const { workspace, previous } = claim(needle);
    const [session] = previous
      ? db.getInstancesByIds([previous.instanceId])
      : [];
    return previous && session?.sessionId
      ? continueIn(workspace, previous, session, parent, request)
      : workspace;
  };

  /**
   * The sessions of a workspace's items that have not ended (a failed
   * attempt's session stays up after its item fails).
   */
  const sessionsUpIn = (workspaceId: string): InstanceRow[] =>
    db
      .getInstancesByIds([
        ...new Set(db.workItemsIn(workspaceId).map((item) => item.instanceId)),
      ])
      .filter((row) => !ENDED.has(row.status));

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
   * The workspace of an earlier attempt a retry runs in again, when its clone
   * is still on its machine: its earlier sessions stopped
   * ({@link endEarlierSessions}) and its boundary started again (and the
   * workspace filed as active again, should it have been archived with the
   * clone left behind). Undefined when the clone is gone or its machine
   * cannot say, and the retry cuts a new workspace. Refused while an item
   * there is live.
   */
  const reusable = async (
    id: string,
    projectId: string | null
  ): Promise<WorkspaceRow | undefined> => {
    const [workspace] = db.workspacesNamed(id);
    if (!workspace) {
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
    try {
      const there = await command(
        workspace.machineId,
        "/",
        `test -d ${quote(`${workspace.path}/.git`)}`,
        GIT_TIMEOUT_MS
      );
      if (there.exitCode !== 0) {
        return;
      }
      await endEarlierSessions(workspace);
      const boundaryPid = (await call(
        workspace.machineId,
        CONTROL_WORKSPACE_BOUNDARY,
        [refOf(workspace)]
      )) as number;
      // Awaited above: the one-writer check again, in the step that files the item.
      busy();
      if (workspace.state === "archived" && projectId) {
        projectStands(projectId);
        db.addPlace({
          projectId,
          machineId: workspace.machineId,
          path: workspace.path,
          kind: "workspace",
        });
        placesChanged(workspace.machineId, projectId);
      }
      return (
        db.updateWorkspace(workspace.id, { boundaryPid, state: "active" }) ??
        workspace
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
    asked: WorkItemRequest
  ): {
    parent: InstanceRow;
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
    const [parent] = db.getInstancesByIds([request.parentInstanceId]);
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
    // An attempt spends the project's money: none starts past its cap.
    const capped = request.task ? pauses(request.task.projectId) : undefined;
    if (capped) {
      throw new WorkItemRefusal(409, capped);
    }
    const projectId = request.task?.projectId ?? parent.projectId;
    if (request.outputs && !projectId) {
      throw new WorkItemRefusal(
        400,
        "outputs are copied into the project's folder, and this session belongs to no project. Drop outputs, or delegate from a session in a project."
      );
    }
    return { request, parent, projectId };
  };

  /**
   * Files and spawns an item. Refused with {@link OwnsOverlap} while a live
   * item owns files it owns too; the files it owns are held from that check
   * until its item is filed, so two starts never both pass it.
   */
  const start = async (asked: WorkItemRequest): Promise<WorkItemStart> => {
    const { request, parent, projectId } = admitted(asked);
    const release = claimOwns(request, parent, projectId);
    try {
      return await startAdmitted(request, parent, projectId);
    } finally {
      release();
    }
  };

  const startAdmitted = async (
    request: WorkItemRequest,
    parent: InstanceRow,
    projectId: string | null
  ): Promise<WorkItemStart> => {
    if (request.reuse) {
      const again = await reusable(request.reuse, projectId);
      if (again) {
        return spawnIn(again, settingsOf(request, parent), parent, request);
      }
      // Its clone is gone: the retry runs in a new workspace, and the old
      // one's sessions are stopped all the same, the stop stored for a
      // machine that is away.
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
      const settings = settingsOf(request, parent);
      const workspace = await openWorkspace(
        parent.id,
        request.cwd ?? parent.cwd,
        machineId
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
      return spawnIn(workspace, settings, parent, request);
    }
    // Awaited before the claim, which files the item in the same step as
    // its one-writer check.
    await boundaryUp(request.workspace);
    const followed = followUp(request.workspace, request, parent);
    // A workspace whose last session never started has nothing to continue:
    // a session starts there the way every new delegate's does.
    return "item" in followed
      ? followed
      : spawnIn(followed, settingsOf(request, parent), parent, request);
  };

  /**
   * Where an item lands and what it hands in, and the project it works for
   * (its task's, else its parent's), as its row keeps them.
   */
  const placing = (request: WorkItemRequest, parent: InstanceRow) => {
    const projectId = request.task?.projectId ?? parent.projectId;
    const project = projectId ? db.project(projectId) : undefined;
    return {
      ...(request.task ? { taskId: request.task.id } : {}),
      ...(projectId ? { projectId } : {}),
      lands: request.lands ?? "main",
      outputs: request.outputs?.length ? request.outputs : null,
      group: request.group?.trim() || null,
      owns: request.owns?.length ? request.owns : null,
      budget: budgetFrom(request.budget, project?.budget),
    };
  };

  /** What the caller's start text adds for a group, owned files and a budget. */
  const extrasLine = (item: WorkItemRow): string =>
    [
      item.group
        ? ` It is in group “${item.group}”: its report waits until every item of the group has ended (a failure reports at once).`
        : "",
      item.owns?.length ? ` It owns ${item.owns.join(", ")}.` : "",
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

  /** A new session in `workspace`, running a new item from the request's brief. */
  const spawnIn = (
    workspace: WorkspaceRow,
    settings: Settings,
    parent: InstanceRow,
    request: WorkItemRequest
  ): WorkItemStart => {
    const { harness, canDelegate } = settings;
    // A queued delegate's session and item take the ids its chip stood under.
    const instanceId = request.queuedAs?.instanceId ?? crypto.randomUUID();
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
        unwatchedMode(db.getInstancesByIds([parent.id])[0]?.permissionMode)
      );
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          withWorkspaceLine(
            `${handoffMarker(sessionLabel(parent).name)}${fork}${request.prompt}`,
            workspace.repoRoot,
            workspace.base,
            landingOf(item)
          )
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(item.id, {
        state: "failed",
        error: message,
        endedAt: new Date(),
      });
      throw error;
    }

    return {
      item,
      workspace,
      text:
        `Started work item ${item.id} in workspace ${workspace.id} (${workspace.path}, branch ${workspace.branch}): ` +
        (settings.forkOf
          ? `a fork of this conversation on ${harness}${settings.model ? ` (${settings.model})` : ""}, ${label}. It starts with every turn of yours so far.`
          : `a fresh ${harness} session, ${label}.`) +
        " Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
        `reports, with handoff("${instanceId}", ...): the message lands in the same session and its cached transcript.` +
        (canDelegate
          ? " It may spawn delegates of its own."
          : " It is a leaf: it cannot delegate further.") +
        extrasLine(item),
    };
  };

  /** The item a session runs, when it runs one. */
  const itemOf = (row: InstanceRow): WorkItemRow | undefined =>
    row.workItemId ? db.workItem(row.workItemId) : undefined;

  /** Moves a live item to a finished state; finished work stays as it ended. */
  const finish = (
    item: WorkItemRow,
    change: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow =>
    LIVE.has(item.state)
      ? (update(item.id, { ...change, endedAt: new Date() }) ?? item)
      : item;

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
   * A turn of an item filed before checks existed: unless the session is
   * busy, it ends the item with the turn's text, and the report carries it.
   */
  const uncheckedTurn = (
    item: WorkItemRow,
    turn: { text: string; error?: string },
    busy: boolean
  ): { body: string; failed: boolean } => {
    const failed = turn.error !== undefined;
    const ended = busy
      ? item
      : finish(
          item,
          failed
            ? { state: "failed", error: turn.text }
            : { state: "done", result: turn.text }
        );
    return { body: `${turn.text}${reportLine(ended)}`, failed };
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
          : `check "${check.name}": no machine of the fleet is named "${check.machine}". The fleet: ${agents.map((agent) => machineLabel(agent.hostname)).join(", ") || "none"}.`
      );
    });
  };

  /** A machine as a check's line names it: its hostname as the fleet shows it. */
  const machineName = (machineId: string): string => {
    const agent = db.listAgents().find((each) => each.machineId === machineId);
    return agent ? machineLabel(agent.hostname) : machineId;
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
  ): string | undefined =>
    db
      .project(projectId)
      ?.places.find(
        (place) => place.machineId === machineId && place.kind === "checkout"
      )?.path ?? db.projectRepository(projectId, machineId);

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
      workspace.id
    );
    db.addPlace({ projectId, machineId, path: opened.path, kind: "workspace" });
    placesChanged(machineId, projectId);
    return opened;
  };

  /**
   * Runs `checks` in order. A check runs in the workspace's worktree, on its
   * machine, inside its boundary: it reads what its delegate wrote, at the
   * path the delegate wrote it (`$TMPDIR` is the workspace's own scratch dir there). A check
   * that names another machine runs there, in the workspace's check workspace
   * ({@link checkWorkspace}), inside that one's boundary, at the workspace's
   * last commit: the commits past its base go over as a git bundle, once per
   * run and machine. Uncommitted work stays where it is.
   */
  const runChecks = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): Promise<CheckOutcome[]> => {
    let commit: Promise<WorkspaceCommit> | undefined;
    const placed = new Map<
      string,
      Promise<{ at: WorkspaceRow; head: string }>
    >();
    /** The check workspace on `machineId`, at the workspace's commit. */
    const elsewhere = (
      machineId: string
    ): Promise<{ at: WorkspaceRow; head: string }> => {
      const ready =
        placed.get(machineId) ??
        (async () => {
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
        })();
      placed.set(machineId, ready);
      return ready;
    };
    /** One check on another machine; a machine that cannot run it fails the check in its words. */
    const runElsewhere = async (
      machineId: string,
      check: WorkItemCheck,
      limit: number
    ): Promise<{ complete: CommandResult; where: string }> => {
      const on = `on ${machineName(machineId)}`;
      try {
        const { at, head } = await elsewhere(machineId);
        return {
          where: `${on} at ${head.slice(0, 9)}`,
          complete: await command(
            machineId,
            at.path,
            check.command,
            limit,
            refOf(at)
          ),
        };
      } catch (error) {
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
    const outcomes: CheckOutcome[] = [];
    for (const check of checks) {
      const started = Date.now();
      const limit = (check.timeoutSec ?? CHECK_TIMEOUT_SEC) * 1000;
      const { complete, where } =
        check.machine && check.machine !== workspace.machineId
          ? // biome-ignore lint/performance/noAwaitInLoops: checks run in order, one at a time
            await runElsewhere(check.machine, check, limit)
          : {
              complete: await command(
                workspace.machineId,
                workspace.path,
                check.command,
                limit,
                refOf(workspace)
              ),
              where: undefined,
            };
      const result = checkTails(complete);
      outcomes.push({
        check,
        result,
        where,
        exitCode: result.exitCode,
        durationMs: Date.now() - started,
        passed:
          result.exitCode === 0 &&
          (check.expect === undefined || result.stdout.includes(check.expect)),
      });
    }
    return outcomes;
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
    const git = (cmd: string) => runIn(workspace)(cmd, GIT_TIMEOUT_MS);
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
   * wrote runs for the hub.
   */
  const runIn =
    (workspace: WorkspaceRow) =>
    (cmd: string, timeoutMs: number): Promise<CommandResult> =>
      command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}${cmd}`,
        timeoutMs,
        refOf(workspace)
      );

  /**
   * Lands a checked item's commits on its workspace's base branch
   * (landing.ts). Answers the line the report and the delegate read when the
   * item can be done; the text that hands it back to its delegate (`retry`:
   * uncommitted work, a conflict, checks that fail after a rebase); or the line
   * that says why it could not land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): Promise<Landed> => {
    const { base } = workspace;
    const outcome = await land<CheckOutcome[]>(base, {
      run: runIn(workspace),
      recheck: async () => {
        const again = await runChecks(workspace, item, checks);
        return again.some((check) => !check.passed) ? again : undefined;
      },
      queue: landings,
      skip: item.outputs ?? [],
    });
    switch (outcome.kind) {
      case "landed":
        return {
          kind: "done",
          line: `Landed on ${base} at ${outcome.sha.slice(0, 9)}${outcome.rebased ? `, rebased onto the newer ${base} with the checks run again` : ""}.`,
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
        const failing = outcome.failing.filter((check) => !check.passed);
        const passing = outcome.failing.filter((check) => check.passed);
        return {
          kind: "retry",
          text: `${base} had moved, so the hub rebased your commits onto it and ran the checks again: ${failing.length} of ${outcome.failing.length} failed. Your branch is now on top of origin/${base}. Fix the cause and call finish_item again.\n\n${[...failing, ...passing].map(checkResultLine).join("\n")}`,
        };
      }
      default:
        return {
          kind: "refused",
          line: `Not landed: the push to ${base} was refused.${fenced(outcome.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${workspace.id}.`,
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
    body: string
  ): string => {
    if (ended.state === "done" && ended.group && !ended.groupReportedAt) {
      return `; your parent hears of it with the rest of group “${ended.group}”`;
    }
    report(row, `${body}${reportLine(ended)}`, false);
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
      run: runIn(workspace),
      queue: landings,
      skip: item.outputs ?? [],
    });
    if (pushed.kind !== "pushed") {
      return unpushed(pushed, workspace, branch, item.lands);
    }
    const at = `${branch} at ${pushed.sha.slice(0, 9)}`;
    return item.lands === "pr"
      ? await pullRequestFor(workspace, item, said, at)
      : {
          kind: "done",
          line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
        };
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
      runIn(workspace)
    );
    if (pr.kind === "refused") {
      return {
        kind: "refused",
        line: `Pushed to branch ${at}, but the pull request was not opened. gh said:${fenced(pr.detail)}\nOpen it by hand from ${branch} into ${base}, or start the task again once gh can.`,
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
    outputs: string[]
  ): Promise<string | undefined> => {
    const result = await runIn(workspace)(
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
    const folder = `assets/${landingKey(item)}`;
    try {
      const files: { path: string; content: Uint8Array }[] = [];
      for (const path of outputs) {
        // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps each read under the command's output cap
        const read = await runIn(workspace)(
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
      return {
        ok: true,
        line: `\n\nOutputs, copied into the project's folder ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}:\n${written.paths.map((path) => `- ${path}`).join("\n")}`,
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
      ? await outputsProblem(workspace, item.outputs)
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
    const collected =
      landing.kind === "done"
        ? await collectOutputs(workspace, item)
        : { ok: true, line: "" };
    const body = `${submission.summary}\n\nChecks:\n${lines}\n\n${landing.line}${collected.line}${await changesSince(workspace, item)}${findingsBlock(submission.findings)}`;
    const landed = landing.kind === "done" && collected.ok;
    const ended = finish(db.workItem(item.id) ?? item, {
      state: landed ? "done" : "failed",
      result: body,
      digest: `${submission.summary.trim()}\n${landing.line}${collected.line}`,
      ...(landing.kind === "done" && landing.prUrl
        ? { prUrl: landing.prUrl }
        : {}),
      ...settled,
    });
    const held = reportOrHold(row, ended, body);
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
    checks: WorkItemCheck[],
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    const settled = { checkingSince: null, submission: null };
    finishing.add(item.id);
    try {
      const outcomes = await runChecks(workspace, item, checks);
      const failing = outcomes.filter((outcome) => !outcome.passed);
      if (failing.length > 0) {
        update(item.id, settled);
        const passing = outcomes.filter((outcome) => outcome.passed);
        return {
          done: false,
          text: `${failing.length} of ${outcomes.length} checks failed. The item is still running: fix the cause and call finish_item again.\n\n${[...failing, ...passing].map(checkResultLine).join("\n")}`,
        };
      }
      const lines = outcomes.map(checkLine).join("\n");
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
    }
  };

  return {
    start,

    /**
     * `delegate`: {@link start}, or, while a live item owns files this one
     * owns too, the request queued until no live item overlaps it, a chip in
     * its parent's tray from now on under the ids its item and session take
     * when it starts. Every other refusal is the caller's.
     */
    async delegate(
      asked: WorkItemRequest
    ): Promise<WorkItemStart | { queued: string; text: string }> {
      try {
        return await start(asked);
      } catch (error) {
        if (!(error instanceof OwnsOverlap)) {
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
        return {
          queued: queued.id,
          text: `Queued “${queued.title}” (${queued.id}): ${error.message} It waits in your delegate tray and starts when no live item owns its files any more; its report reaches you as any delegate's does.`,
        };
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

    /** An interrupt cancels the declared wait without starting another turn. */
    interrupted(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.waitUntil || item?.waitResumeBy) {
        clearWait(item);
      }
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
     * ({@link reopen}). A delegate from before work items follows the same
     * who-may rule. Every other session is not delegated work, and takes
     * messages as it always has.
     */
    refusal(row: InstanceRow, origin: NeutralOrigin): string | undefined {
      const item = itemOf(row);
      if (item) {
        if (LIVE.has(item.state)) {
          return undefined;
        }
        if (!mayReopen(item, origin)) {
          return finishedText(item);
        }
        const [workspace] = db.workspacesNamed(item.workspaceId);
        if (workspace?.state === "archived") {
          return `${item.title} (${item.id}) is ${item.state}, and its workspace ${item.workspaceId} is archived: its clone and boundary are gone.`;
        }
        const [latest] = db.workItemsIn(item.workspaceId);
        return latest.id === item.id ? undefined : supersededText(item, latest);
      }
      if (
        row.parentInstanceId &&
        !row.workflowStepId &&
        !reopens(row.parentInstanceId, origin)
      ) {
        return `${sessionLabel(row).tag} predates work items; only the reader or its parent can message it.`;
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
        update(item.id, {
          state: "running",
          result: null,
          error: null,
          endedAt: null,
          dismissedAt: null,
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
     * An item filed before checks existed, and a delegate from before work
     * items, end as they always did: on a turn nothing answers, with that
     * turn's text as the report.
     */
    turnEnded(
      row: InstanceRow,
      turn: { text: string; error?: string },
      endedAt: Date
    ): { body: string; failed: boolean } | undefined {
      const item = itemOf(row);
      if (!item) {
        return { body: turn.text, failed: turn.error !== undefined };
      }
      // The plan's completed to-do ids tick their to-dos, off the turn's path.
      syncSoon(item);
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
        quiet.delete(item.id);
        const ended = busy
          ? item
          : finish(item, { state: "failed", error: turn.error });
        return { body: `${turn.error}${reportLine(ended)}`, failed: true };
      }
      if (busy) {
        return undefined;
      }
      const turns = (quiet.get(item.id) ?? 0) + 1;
      if (turns >= QUIET_TURNS) {
        quiet.delete(item.id);
        const failed = finish(item, { state: "failed", error: QUIET_ERROR });
        return { body: `${QUIET_ERROR}${reportLine(failed)}`, failed: true };
      }
      quiet.set(item.id, turns);
      tell(
        row,
        `Your work item is still open. Its checks: ${checkNames(item.checks)}. Finish the work and call finish_item, or call it with \`blocked\` and the exact command and error. Use wait_item for a bounded wait on a command you started.`
      );
      return undefined;
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
        const failed = finish(item, { state: "failed", error });
        report(
          row,
          `${request.summary}\n\n${error}${findingsBlock(request.findings)}${reportLine(failed)}`,
          true
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
      update(item.id, { checks: machinesOf(checks) });
      tell(
        row,
        `Your work item's checks were replaced by your parent. Its checks: ${checkNames(checks)}.`
      );
      return `Replaced the checks of ${item.title} (${item.id}): ${checkNames(checks)}. Its session was told.`;
    },

    /**
     * Its session never started: a live item failed, and the report line says
     * why. An item that already ended has reported, so a session of it that
     * does not come back (a restore after an agent restart, into a workspace
     * since removed) is news for nobody: no line, and no report.
     */
    spawnFailed(row: InstanceRow, reason: string): string | undefined {
      const item = itemOf(row);
      return item && LIVE.has(item.state)
        ? reportLine(finish(item, { state: "failed", error: reason }))
        : undefined;
    },

    /**
     * A restart cut the live item's turn and nothing resumed it, and nothing
     * can (its workspace is gone, or nobody is left to hear it): the item
     * fails with `reason`, and whoever hears its reports is told.
     */
    unresumed(row: InstanceRow, reason: string): void {
      const item = itemOf(row);
      if (!(item && LIVE.has(item.state))) {
        return;
      }
      quiet.delete(item.id);
      clearWait(item);
      const failed = finish(item, { state: "failed", error: reason });
      report(row, `${reason}${reportLine(failed)}`, true);
    },

    /** Its session was stopped or archived while the work was live. */
    cancelled(row: InstanceRow): void {
      const item = itemOf(row);
      if (item) {
        quiet.delete(item.id);
        finish(item, {
          state: "cancelled",
          checkingSince: null,
          submission: null,
        });
      }
    },

    /** One item, as `stop_delegate` and its callers read it. */
    item: (id: string): WorkItemRow | undefined => db.workItem(id),

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
     * Archives a workspace: its machine kills the boundary with every process
     * in it and deletes the clone. Refused while an item there is live — stop
     * it first — and for a workspace already archived.
     */
    async archive(needle: string): Promise<WorkspaceRow> {
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
      if (workspace.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} is already archived.`
        );
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
      // Its check workspaces on other machines go first: none outlives it.
      await Promise.all(db.checkWorkspacesOf(workspace.id).map(closeWorkspace));
      return closeWorkspace(workspace);
    },

    /**
     * An agent has started: its machine's active workspaces go to it, and each
     * one still a git worktree from before workspaces were clones becomes a
     * clone in place. The machine logs each workspace it converts, skips or
     * cannot convert.
     */
    async convertWorktrees(machineId: string): Promise<void> {
      const refs = db.activeWorkspacesOn(machineId).map(refOf);
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

    /** The reader dismissed its chip: gone from the tray on every screen. */
    dismiss(id: string): WorkItemSummary | undefined {
      const item = update(id, { dismissedAt: new Date() });
      return item ? summaryOf(item) : undefined;
    },
  };
};

export type WorkItems = ReturnType<typeof createWorkItems>;
