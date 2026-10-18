/**
 * Tracker sync (Projects spec D2, §5.2): a project's tasks with GitHub
 * Issues or Linear as the record of their issue fields.
 *
 * THE INVARIANT: each field has one record. A task linked to its issue
 * keeps its title, description, labels, stage and comments one with the
 * issue: a change on either side reaches the other, and where both changed
 * one field since they last agreed, the tracker's stands ("the tracker owns
 * issue fields"). CawCo keeps what the tracker has no field for: rank,
 * edges, attempts, checks, to-dos and acceptance criteria. Nothing is
 * merged within a field, and nothing is two records.
 *
 * - **A binding** is one connection (connections.ts) and one target on it:
 *   a GitHub repository or a Linear team. Binding reads the target first,
 *   so a connection that cannot see it is refused in its words and nothing
 *   is bound. Letting the binding go lets its links go; each task file
 *   still names its issue, which the task's view shows.
 * - **Going forward.** Issues opened after the binding become tasks, and
 *   tasks filed after it become issues; nothing older is copied either way.
 *   Linear's own GitHub sync does the same: "This will only sync issues
 *   *going forward*" (linear.app/docs/github).
 * - **The link** is the task file's `issue:` (the issue's URL; files are the
 *   truth) and a row of what the two last agreed on (`tracker_links`). A
 *   side whose value moved off the agreed one changed that field. A task
 *   whose file names an issue the hub keeps no link for is linked again, the
 *   tracker the record of every field that differs.
 * - **What syncs**, as Linear's GitHub sync does, less what CawCo keeps:
 *   "title, description, status, … labels, … comments"
 *   (linear.app/docs/github). Stages map onto states through their kinds
 *   (tracker-adapter.ts); with GitHub, a stage is open or closed. Comments
 *   go once each way, from the link on, a CawCo comment saying who wrote it.
 * - **Who opened it.** On a public repository anyone may open an issue, and
 *   a task in a `todo` stage is the dispatcher's to start. So an issue
 *   whose opener the tracker does not vouch for (GitHub: no owner, member or
 *   collaborator of the repository; Linear: an integration's, no member
 *   behind it) is filed in the first stage of kind `you`, and every later
 *   pull that would put its task where an agent takes it, or rewrite its
 *   words while it stands there, puts it back: your move takes it on. Such
 *   a person's comment is carried and its task, standing where an agent
 *   takes it, waits there too. A project binds only with a `you` stage.
 *   claude-code-action likewise runs only for "users with write access to
 *   the repository" (its docs/security.md). Linear's Triage is a `you`
 *   stage's kind for the same reason (tracker-adapter.ts). A move made on
 *   the tracker is the person's who made it there: it starts what a
 *   stage's `runs:` starts (dispatch.ts).
 * - **When.** Every 60 s, as the GitHub poller ("GitHub every 60 s with an
 *   ETag; a 304 is free", §5.5), and half a second after a task change:
 *   its own writes go through tasks.ts as an actor marked `tracker`, never
 *   sent back. One sync of a project at a time.
 * - **Stages on a GitHub Project.** GitHub's open stands for every open
 *   stage, so a GitHub binding may name a Project (v2): each stage puts its
 *   issue's item in a Status option (the one set in the binding's form, else
 *   the option named as the stage), and a Status moved on GitHub moves the
 *   task, with the same last-agreed rule as every field
 *   (tracker-github-project.ts). The binding's Projects are read through its
 *   connection; one that may not read or write them leaves Status alone, the
 *   binding saying GitHub's words, and issues sync as before. Sync now asks
 *   again at once, the poll every ten minutes: given the permission since,
 *   the binding takes its Project and Status starts.
 * - **No fallbacks.** A refused write leaves both sides as they are and says
 *   the tracker's words on the task's link, and on the binding when the
 *   connection's sign-in or scope is what refused: a sign-in refused marks
 *   the connection too. The next sync tries again.
 */
import {
  type GithubProject,
  type GithubProjectsView,
  type IssueTracker,
  statusOptionFor,
  type TaskIssueLink,
  TRACKER_NAMES,
  type Tracker,
  type TrackerSyncState,
  type TrackerTarget,
  type TrackerView,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, status, t } from "elysia";
import { appServiceOf, type Connections } from "./connections";
import type { TrackerCursor, TrackerSynced } from "./db/schema";
import type {
  TrackerBindingRow,
  TrackerLinkRow,
  TrackersDb,
} from "./db/trackers";
import type { HubLifetimeShape } from "./lifetime";
import { turnTaker } from "./project-folder";
import type { Stage } from "./stages";
import type {
  TaskActor,
  TaskPatch,
  TaskSummary,
  Tasks,
  TaskView,
} from "./tasks";
import {
  type Issue,
  type IssueComment,
  type IssuePatch,
  type IssueState,
  intoFile,
  type Listed,
  labelSet,
  outOfFile,
  stageFor,
  stateFor,
  type TrackerAdapter,
  TrackerRefusal,
} from "./tracker-adapter";
import { githubAdapter, githubTargets } from "./tracker-github";
import {
  type GithubProjectStatus,
  githubProjectStatus,
  githubProjects,
  type ProjectRead,
  type StatusItem,
} from "./tracker-github-project";
import { linearAdapter, linearTargets } from "./tracker-linear";

/** How often every binding polls. The GitHub poller's 60 s (§5.5). */
const POLL_MS = 60_000;
/** How often a binding whose GitHub Projects were refused asks again on its own; Sync now asks at once. Our choice. */
const RECHECK_MS = 10 * 60_000;
/** How long after a task change its project syncs, so a burst of changes is one sync. Our choice. */
const SOON_MS = 500;
/** A task changed this close before its last sync is looked at again: commit times are whole seconds. */
const CLOCK_MARGIN_MS = 2000;
/** A link's issue key while the issue could not be made yet. */
const PENDING = "pending:";
/** How far a description's headings go, and a comment's (tracker-adapter.ts). */
const DESCRIPTION_DEPTH = 1;
const COMMENT_DEPTH = 2;
const GITHUB_ISSUE_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/i;
const LINEAR_ISSUE_URL =
  /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z0-9]+-\d+)/i;

export interface TrackersDeps {
  readonly connections: Pick<
    Connections,
    "get" | "githubClient" | "linearClient" | "refusedBy"
  >;
  readonly db: {
    readonly project: (
      id: string
    ) => { id: string; remote: string | null } | undefined;
    readonly trackers: TrackersDb;
  };
  readonly lifetime: HubLifetimeShape;
  readonly tasks: Pick<
    Tasks,
    | "comment"
    | "create"
    | "get"
    | "list"
    | "listen"
    | "move"
    | "setIssue"
    | "stages"
    | "update"
  >;
}

/** A refusal for a route: a 400 in words. */
export class TrackerProblem extends Error {}

/** What a project binds to, as a person gives it. */
export interface BindInput {
  /** The connection's name: GitHub Issues and Linear need one. */
  connection?: string;
  /**
   * GitHub: the Project whose Status carries its stages, and each stage's
   * option; null for none. Left out, the first Project linked to the
   * repository, each stage on the option named as it.
   */
  githubProject?: { id: string; map: Record<string, string | null> } | null;
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target?: string;
  tracker: Tracker;
}

/** A binding to GitHub Issues or Linear as asked, its connection and target named; refused in words when one is missing. */
const askedOf = (
  input: BindInput & { tracker: IssueTracker }
): { connection: string; target: string; tracker: IssueTracker } => {
  const name = TRACKER_NAMES[input.tracker];
  const where = input.tracker === "github" ? "repository" : "team";
  const connection = input.connection?.trim();
  if (!connection) {
    throw new TrackerProblem(
      `${name} needs a connection: pick the one that reaches its ${where}.`
    );
  }
  const target = input.target?.trim();
  if (!target) {
    throw new TrackerProblem(
      `${name} needs its ${where}: pick one ${connection} reaches.`
    );
  }
  return { connection, target, tracker: input.tracker };
};

/** The fields the sync compares, as a task file holds them. */
type Fields = Pick<TrackerSynced, "description" | "labels" | "title">;
const FIELDS = ["title", "description", "labels"] as const;
type Field = (typeof FIELDS)[number];

/** One task's problem in a sync: the tracker's refusal, or words of the hub's own. */
type Problem = TrackerRefusal | string;

/** One project's sync: its binding, signed-in adapter, states, stages, and each task's problem. */
interface Sync {
  adapter: TrackerAdapter;
  binding: TrackerBindingRow;
  /** Where what the tracker does not vouch for waits for you: the first stage of kind `you`. */
  hold: Stage;
  /** GitHub: the Project its stages show on, as this sync read it; unset while there is none or it does not run. */
  onProject?: {
    client: GithubProjectStatus;
    fieldId: string;
    project: GithubProject;
    read: ProjectRead;
  };
  /** Each task's problem this sync, by task (or `issue:<key>`): the binding says the first the connection caused. */
  problems: Map<string, Problem>;
  projectId: string;
  /** GitHub: the binding's Project and its words as a permission check found them again after a refusal. */
  projectProbe?: Pick<
    TrackerBindingRow,
    "githubProject" | "githubProjectReason"
  >;
  /** GitHub: the Project as this sync read it (its title, Status field and options), kept on the binding. */
  projectRead?: GithubProject;
  stages: Stage[];
  states: IssueState[];
  /** GitHub's words when this sync found the connection may not read or write the Project: Status stops. */
  statusRefused?: string;
}

/** One linked task made one record with its issue again: what each side moved, and where they agree after. */
interface Round {
  file: Fields;
  /** Why its move goes to the hold stage, when it does (`holdPulls`). */
  held: string | undefined;
  issue: Issue;
  /** The issue's item on the binding's Project; undefined when it is not on it. */
  item: StatusItem | undefined;
  link: TrackerLinkRow;
  /** The stage the issue's state puts the task in, when that is a move. */
  moveTo: string | undefined;
  /** What they agree on once the round is through. */
  next: TrackerSynced;
  /** The issue's changes, for the task. */
  pull: TaskPatch;
  /** The task's changes, for the issue. */
  push: IssuePatch;
  /** The Status option the task's move puts its item in. */
  pushStatus: string | undefined;
  remote: Fields;
  /** Why a part of the round stopped short, in words. */
  said: string[];
  /** GitHub moved its item's Status off what they agreed. */
  statusMoved: boolean;
  /** Why the task moves, when its item's Status moved it. */
  statusWhy: string | undefined;
  sync: Sync;
  task: TaskView;
}

const sameField = (a: Fields[Field], b: Fields[Field]): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.join("\n") === b.join("\n")
    : a === b;

/** An issue's fields as a task file holds them. */
const remoteFields = (issue: Issue): Fields => ({
  title: issue.title,
  description: intoFile(issue.description, DESCRIPTION_DEPTH),
  labels: labelSet(issue.labels),
});

/** A task's fields, as the sync compares them. */
const fileFields = (view: TaskView): Fields => ({
  title: view.title,
  description: view.description.trim(),
  labels: labelSet(view.labels),
});

/** An issue's URL on its host: which tracker it is on, and its ref. */
const namedIssue = (
  url: string
): Pick<TaskIssueLink, "provider" | "ref"> | undefined => {
  const github = GITHUB_ISSUE_URL.exec(url)?.[1];
  if (github) {
    return { provider: "github", ref: `#${github}` };
  }
  const linear = LINEAR_ISSUE_URL.exec(url)?.[1];
  return linear ? { provider: "linear", ref: linear } : undefined;
};

const wordsOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const problemWords = (problem: Problem): string =>
  typeof problem === "string" ? problem : problem.message;

/** A failure as a task's problem: the tracker's refusal, or the error's words. */
const problemOf = (error: unknown): Problem =>
  error instanceof TrackerRefusal ? error : wordsOf(error);

/** Whether a refusal stops the whole sync (a rate limit, a refused sign-in) rather than one task's part. */
const stopsSync = (error: unknown): error is TrackerRefusal =>
  error instanceof TrackerRefusal &&
  (error.kind === "rate" || error.kind === "sign-in");

/** Keeps a task's problem for the binding's word; answers its words. */
const fail = (sync: Sync, taskId: string, problem: Problem): string => {
  if (!sync.problems.has(taskId)) {
    sync.problems.set(taskId, problem);
  }
  return problemWords(problem);
};

const stageOf = (sync: Sync, name: string): Stage | undefined =>
  sync.stages.find((stage) => stage.name === name);

/**
 * The kinds of stage a task goes on from with no person: the dispatcher
 * starts a `todo` one, an `active` one's `runs:` starts on entering, a
 * routine moves a `waiting` one on (stages.ts).
 */
const UNATTENDED: ReadonlySet<Stage["kind"]> = new Set([
  "todo",
  "active",
  "waiting",
]);

const unattended = (sync: Sync, name: string | undefined): boolean => {
  const stage = name === undefined ? undefined : stageOf(sync, name);
  return stage !== undefined && UNATTENDED.has(stage.kind);
};

/** Where what the tracker does not vouch for waits for you (Needs you, and the phone); a sync needs one. */
const holdOf = (stages: readonly Stage[]): Stage | undefined =>
  stages.find((stage) => stage.kind === "you");

/** A binding's refusal for a project with no stage to hold what its tracker does not vouch for. */
const noHoldWords = (tracker: IssueTracker): string =>
  `stages.md has no stage of kind you, where an issue or a comment from someone ${TRACKER_NAMES[tracker]} does not vouch for waits for you before any agent takes it: add one, like “review  you”.`;

const heldWords = (ref: string, unvouched: string, hold: string): string =>
  `${ref} opened by ${unvouched}: it waits in ${hold} for you before any agent takes it`;

/**
 * An unvouched opener's issue (its link's `unvouched`): a pull that would
 * put its task where an agent takes it, or rewrite its words while it
 * stands there, puts it in the hold stage instead. Your own move takes it
 * on; the next such pull holds it again.
 */
const holdPulls = (round: Round): void => {
  const { link, sync, task, issue } = round;
  if (!link.unvouched) {
    return;
  }
  const moves = round.moveTo !== undefined && unattended(sync, round.moveTo);
  const rewrites =
    round.moveTo === undefined &&
    (round.pull.title !== undefined || round.pull.description !== undefined) &&
    unattended(sync, task.stage);
  if (!(moves || rewrites)) {
    return;
  }
  const { hold } = sync;
  round.held = heldWords(link.ref, link.unvouched, hold.name);
  if (hold.name === task.stage) {
    round.moveTo = undefined;
    round.next.state = issue.state.token;
    round.next.stage = task.stage;
  } else {
    round.moveTo = hold.name;
  }
};

/** Per field, the side that moved off what they agreed wins, the tracker's where both did. */
const planFields = (round: Round): void => {
  const { remote, file, link } = round;
  const { synced } = link;
  for (const field of FIELDS) {
    if (sameField(remote[field], synced[field])) {
      if (!sameField(file[field], synced[field])) {
        Object.assign(round.push, {
          [field]:
            field === "description"
              ? outOfFile(file.description, DESCRIPTION_DEPTH)
              : file[field],
        });
      }
    } else if (sameField(remote[field], file[field])) {
      // Both made the same change: they agree already.
      Object.assign(round.next, { [field]: remote[field] });
    } else {
      Object.assign(round.pull, { [field]: remote[field] });
    }
  }
};

/** The issue's state moved: the stage it puts the task in. The stage moved: the state it puts the issue in. */
const planState = (round: Round): void => {
  const { sync, issue, task, link } = round;
  const { synced } = link;
  const { targetName } = sync.binding;
  const current = stageOf(sync, task.stage);
  if (issue.state.token !== synced.state) {
    const to = stageFor(issue.state, current, sync.stages, sync.states);
    if (!to) {
      round.said.push(
        `${targetName} put ${link.ref} in “${issue.state.name}”, and this project has no stage of its kind.`
      );
    } else if (to.name === task.stage) {
      round.next.state = issue.state.token;
      round.next.stage = task.stage;
    } else {
      round.moveTo = to.name;
    }
    return;
  }
  if (task.stage === synced.stage || !current) {
    return;
  }
  const want = stateFor(current, sync.states);
  if (!want) {
    round.said.push(
      `${targetName} has no state for a ${current.kind} stage like “${current.name}”.`
    );
  } else if (want.token === issue.state.token) {
    // The issue is in that stage's state already (GitHub's open is every open stage's).
    round.next.stage = task.stage;
  } else {
    round.push.state = want;
  }
};

/**
 * The Status option an issue's item stands in on the Project as this sync
 * read it; null when it is not on it. An issue a partial read did not reach
 * stands where they agreed: nothing is moved on what was not read.
 */
const remoteStatus = (
  read: ProjectRead,
  issueKey: string,
  agreed: string | null | undefined
): string | null => {
  const item = read.items.get(issueKey);
  if (item) {
    return item.optionId;
  }
  return read.complete ? null : (agreed ?? null);
};

/** The stage a Status option puts its task in: `current` when it maps there, else the first stage that does. */
const stageForStatus = (
  sync: Sync,
  project: GithubProject,
  optionId: string,
  current: string
): Stage | undefined => {
  const onIt = (stage: Stage) =>
    statusOptionFor(stage.name, project) === optionId;
  const here = stageOf(sync, current);
  return here && onIt(here) ? here : sync.stages.find(onIt);
};

const optionName = (project: GithubProject, id: string): string =>
  project.options.find((option) => option.id === id)?.name ?? id;

/**
 * GitHub moved the item's Status: the task goes to the stage it maps to, as
 * the tracker's side of any field stands. The issue's state follows that
 * stage (a Status mapped to done closes it). Where the issue's own state
 * moved too, to another kind of stage, the state stands.
 */
const planStatus = (round: Round): void => {
  const { sync, link, task, issue } = round;
  const { onProject } = sync;
  if (!onProject) {
    return;
  }
  const remote = remoteStatus(
    onProject.read,
    link.issueKey,
    link.synced.status
  );
  if (remote === (link.synced.status ?? null)) {
    return;
  }
  round.statusMoved = true;
  round.next.status = remote;
  if (remote === null) {
    // Taken off the Project, or its Status cleared: nothing says where to go.
    return;
  }
  const to = stageForStatus(sync, onProject.project, remote, task.stage);
  if (!to) {
    round.said.push(
      `${link.ref} is “${optionName(onProject.project, remote)}” on ${onProject.project.title}, and no stage maps to it: map one in the project's details.`
    );
    return;
  }
  const state = stateFor(to, sync.states);
  if (
    issue.state.token !== link.synced.state &&
    state?.token !== issue.state.token
  ) {
    return;
  }
  // GitHub's Status stands over a stage moved in CawCo meanwhile.
  const { state: _moved, ...rest } = round.push;
  round.push = rest;
  if (state && state.token !== issue.state.token) {
    round.push.state = state;
  } else {
    round.next.state = issue.state.token;
  }
  if (to.name === task.stage) {
    round.moveTo = undefined;
    round.next.stage = task.stage;
  } else {
    round.moveTo = to.name;
    round.statusWhy = `${link.ref} is “${optionName(onProject.project, remote)}” on ${onProject.project.title}`;
  }
};

/** The task moved, here or by its issue's state: its item's Status follows the stage it ends in. */
const planStatusPush = (round: Round): void => {
  const { sync, link, task } = round;
  if (!sync.onProject || round.statusMoved) {
    return;
  }
  const remote = remoteStatus(
    sync.onProject.read,
    link.issueKey,
    link.synced.status
  );
  const ends = round.moveTo ?? task.stage;
  if (ends === link.synced.stage) {
    return;
  }
  const want = statusOptionFor(ends, sync.onProject.project);
  if (want !== null && want !== remote) {
    round.pushStatus = want;
  } else {
    round.next.status = remote;
  }
};

/** A field the task sent to its issue: agreed as the tracker took it, its own form brought back. */
const agreePushed = (round: Round, field: Field): void => {
  const { remote, file, link, sync } = round;
  if (sameField(remote[field], file[field])) {
    Object.assign(round.next, { [field]: remote[field] });
  } else if (field === "labels") {
    // GitHub drops labels a connection may not set, and says nothing.
    round.said.push(
      `${sync.binding.targetName} kept ${link.ref}'s labels as ${remote.labels.join(", ") || "none"}: the connection may not set labels there.`
    );
    round.next.labels = file.labels;
  } else {
    // The tracker's own form of what was sent (Linear rewrites markdown) comes back.
    Object.assign(round.pull, { [field]: remote[field] });
  }
};

/** The task's changes, sent to its issue in one write; a refusal leaves them unagreed, to go again. */
const applyPush = async (round: Round): Promise<void> => {
  const { push, sync, link } = round;
  if (Object.keys(push).length === 0) {
    return;
  }
  try {
    round.issue = await sync.adapter.update(
      { key: link.issueKey, ref: link.ref },
      push
    );
  } catch (error) {
    if (error instanceof TrackerRefusal && error.kind === "rate") {
      throw error;
    }
    round.said.push(fail(sync, link.taskId, problemOf(error)));
    return;
  }
  round.remote = remoteFields(round.issue);
  for (const field of FIELDS) {
    if (push[field] !== undefined) {
      agreePushed(round, field);
    }
  }
  if (push.state) {
    round.next.state = round.issue.state.token;
    round.next.stage = round.task.stage;
  }
};

/** What the sync answers when it ran: where the binding stands from its tasks' problems. */
const outcomeOf = (sync: Sync): Pick<TrackerBindingRow, "reason" | "state"> => {
  const problems = [...sync.problems.values()];
  const refused = problems.find(
    (problem): problem is TrackerRefusal =>
      problem instanceof TrackerRefusal &&
      (problem.kind === "scope" || problem.kind === "sign-in")
  );
  if (refused) {
    return { state: "refused", reason: refused.message };
  }
  const [first] = problems;
  return {
    state: "synced",
    reason: first === undefined ? null : problemWords(first),
  };
};

/** The binding's Project as the sync read it, and GitHub's words when it refused it. */
const projectAfter = (
  sync: Sync
): Partial<
  Pick<TrackerBindingRow, "githubProject" | "githubProjectReason">
> => ({
  ...sync.projectProbe,
  ...(sync.projectRead ? { githubProject: sync.projectRead } : {}),
  ...(sync.statusRefused ? { githubProjectReason: sync.statusRefused } : {}),
});

/** Where a binding stands after a sync that stopped: refused for a sign-in or scope, else as it stood. */
const stateAfter = (
  refusal: TrackerRefusal,
  binding: TrackerBindingRow
): TrackerSyncState =>
  refusal.kind === "scope" || refusal.kind === "sign-in"
    ? "refused"
    : binding.state;

export const createTrackers = (deps: TrackersDeps) => {
  const { db, tasks, lifetime } = deps;
  const inTurn = turnTaker();
  /** A sync asked for soon, by project. */
  const soon = new Map<string, ReturnType<HubLifetimeShape["after"]>>();
  /** When each project's refused GitHub Projects were last asked (binding asks too), ms. */
  const checkedAt = new Map<string, number>();
  /** Tasks changed since their project's last sync, by project. */
  const dirty = new Map<string, Set<string>>();
  /** The tasks the sync is writing now (`<project>\0<task>`): their events are its own. */
  const writing = new Set<string>();

  const actorOf = (provider: IssueTracker, reason: string): TaskActor => ({
    mover: "hub",
    author: { name: provider === "github" ? "GitHub" : "Linear" },
    reason,
    tracker: provider,
  });

  /** Runs one of the sync's own writes to a task, its events known as the sync's. */
  const own = async <T>(
    projectId: string,
    taskId: string,
    write: () => Promise<T>
  ): Promise<T> => {
    const key = `${projectId}\0${taskId}`;
    writing.add(key);
    try {
      return await write();
    } finally {
      writing.delete(key);
    }
  };

  const dirtyOf = (projectId: string): Set<string> => {
    const held = dirty.get(projectId);
    if (held) {
      return held;
    }
    const made = new Set<string>();
    dirty.set(projectId, made);
    return made;
  };

  /** The binding's adapter, signed in by its connection; a refused sign-in in words. */
  const adapterOf = async (
    binding: TrackerBindingRow
  ): Promise<TrackerAdapter> => {
    try {
      if (binding.provider === "github") {
        return githubAdapter(
          deps.connections.githubClient(binding.connection),
          binding.target
        );
      }
      const client = await deps.connections.linearClient(binding.connection);
      return linearAdapter(
        client,
        binding.target,
        deps.connections.get(binding.connection).auth === "app"
      );
    } catch (error) {
      throw error instanceof TrackerRefusal
        ? error
        : new TrackerRefusal("sign-in", wordsOf(error));
    }
  };

  const view = (projectId: string): TrackerView => {
    const binding = db.trackers.binding(projectId);
    if (!binding) {
      return { tracker: "cawco", binding: null };
    }
    return {
      tracker: binding.provider,
      binding: {
        provider: binding.provider,
        connection: binding.connection,
        target: binding.target,
        targetName: binding.targetName,
        targetUrl: binding.targetUrl,
        boundAt: binding.boundAt.getTime(),
        state: binding.state,
        reason: binding.reason,
        polledAt: binding.polledAt?.getTime() ?? null,
        linked: db.trackers.linkedCount(projectId),
        githubProject: binding.githubProject ?? null,
        githubProjectReason: binding.githubProjectReason ?? null,
      },
    };
  };

  /** The issue's changes written into its task; a refusal leaves them unagreed, to go again. */
  const applyPull = async (round: Round): Promise<void> => {
    const { pull, sync, link } = round;
    if (Object.keys(pull).length === 0) {
      return;
    }
    const { provider } = sync.binding;
    try {
      await own(sync.projectId, link.taskId, () =>
        tasks.update(
          sync.projectId,
          link.taskId,
          pull,
          actorOf(provider, `${link.ref} changed on ${TRACKER_NAMES[provider]}`)
        )
      );
      Object.assign(round.next, pull);
    } catch (error) {
      round.said.push(
        fail(
          sync,
          link.taskId,
          `${link.ref}'s change on ${TRACKER_NAMES[provider]} could not be written into ${link.taskId}: ${wordsOf(error)}`
        )
      );
    }
  };

  /** The task moved to the stage its issue's state puts it in; a refusal leaves them unagreed, to go again. */
  const applyMove = async (round: Round): Promise<void> => {
    const { moveTo, sync, link, issue } = round;
    if (!moveTo) {
      return;
    }
    const { provider } = sync.binding;
    const where =
      round.held ??
      round.statusWhy ??
      `${link.ref} is “${issue.state.name}” on ${TRACKER_NAMES[provider]}`;
    try {
      await own(sync.projectId, link.taskId, () =>
        tasks.move(
          sync.projectId,
          link.taskId,
          moveTo,
          actorOf(provider, where)
        )
      );
      round.next.state = issue.state.token;
      round.next.stage = moveTo;
    } catch (error) {
      round.said.push(
        fail(
          sync,
          link.taskId,
          `${where}, and ${link.taskId} could not move to ${moveTo}: ${wordsOf(error)}`
        )
      );
    }
  };

  /**
   * The Project stops for this sync and every later one: GitHub's words go
   * on the binding, and issues keep syncing. Answers the words.
   */
  const statusStopped = (sync: Sync, error: unknown): string => {
    const refusal = problemOf(error);
    if (
      refusal instanceof TrackerRefusal &&
      (refusal.kind === "scope" || refusal.kind === "sign-in")
    ) {
      sync.statusRefused = refusal.message;
      sync.onProject = undefined;
    }
    return problemWords(refusal);
  };

  /** The task's move put on its item: added to the Project when it is not on it, its Status set. */
  const applyStatus = async (round: Round): Promise<void> => {
    const { sync, link, task, pushStatus } = round;
    const { onProject } = sync;
    if (
      !onProject ||
      pushStatus === undefined ||
      // The move did not go through: its Status waits for it.
      round.next.stage !== (round.moveTo ?? task.stage)
    ) {
      return;
    }
    try {
      const item = await onProject.client.put(
        link.issueKey,
        round.item,
        onProject.fieldId,
        pushStatus
      );
      onProject.read.items.set(link.issueKey, item);
      round.next.status = item.optionId;
    } catch (error) {
      if (error instanceof TrackerRefusal && error.kind === "rate") {
        throw error;
      }
      round.next.stage = link.synced.stage;
      round.said.push(statusStopped(sync, error));
    }
  };

  /** A linked task's issue: the one a list read, or read now; null, its problem kept, when it cannot be. */
  const issueFor = async (
    sync: Sync,
    link: TrackerLinkRow,
    given: Issue | undefined
  ): Promise<Issue | null> => {
    let issue: Issue | null;
    try {
      issue = given ?? (await sync.adapter.issue(link.issueKey));
    } catch (error) {
      if (stopsSync(error)) {
        throw error;
      }
      db.trackers.updateLink(sync.projectId, link.taskId, {
        problem: fail(sync, link.taskId, problemOf(error)),
      });
      return null;
    }
    if (!issue) {
      db.trackers.updateLink(sync.projectId, link.taskId, {
        problem: fail(
          sync,
          link.taskId,
          `${link.ref} is gone from ${sync.binding.targetName}: deleted, moved, or no longer one the connection can see.`
        ),
      });
    }
    return issue;
  };

  /** A task's comments written in CawCo since its link, posted once each to its issue. */
  const carryOut = async (round: Round): Promise<void> => {
    const { sync, link, task } = round;
    const carried = db.trackers.carriedAt(sync.projectId, link.taskId);
    const due = task.comments.filter(
      (comment) =>
        comment.at >= link.linkedAt.getTime() &&
        !carried.has(comment.at) &&
        comment.author.mover !== "hub"
    );
    for (const comment of due) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: comments go in the order they were written
        const posted = await sync.adapter.comment(
          { key: link.issueKey, ref: link.ref },
          comment.author.name,
          outOfFile(comment.text, COMMENT_DEPTH)
        );
        db.trackers.carry({
          projectId: sync.projectId,
          taskId: link.taskId,
          remoteId: posted.id,
          origin: "cawco",
          at: comment.at,
        });
      } catch (error) {
        if (error instanceof TrackerRefusal && error.kind === "rate") {
          throw error;
        }
        round.said.push(fail(sync, link.taskId, problemOf(error)));
        return;
      }
    }
  };

  /**
   * One linked task and its issue made one record again: per field, the
   * side that moved off what they last agreed wins, the tracker's where
   * both did; the state and stage likewise. Its outbound comments go after.
   */
  const reconcile = async (
    sync: Sync,
    link: TrackerLinkRow,
    given: Issue | undefined
  ): Promise<void> => {
    const issue = await issueFor(sync, link, given);
    if (!issue) {
      return;
    }
    const task = await tasks.get(sync.projectId, link.taskId);
    const round: Round = {
      sync,
      link,
      task,
      issue,
      file: fileFields(task),
      remote: remoteFields(issue),
      next: { ...link.synced },
      item: sync.onProject?.read.items.get(link.issueKey),
      pull: {},
      push: {},
      pushStatus: undefined,
      statusMoved: false,
      statusWhy: undefined,
      moveTo: undefined,
      held: undefined,
      said: [],
    };
    planFields(round);
    planState(round);
    planStatus(round);
    holdPulls(round);
    planStatusPush(round);
    // The task's changes go to the issue first: what the tracker answers is what they agree on.
    await applyPush(round);
    await applyPull(round);
    await applyMove(round);
    await applyStatus(round);
    await carryOut(round);
    db.trackers.updateLink(sync.projectId, link.taskId, {
      synced: round.next,
      ref: round.issue.ref,
      url: round.issue.url,
      remoteUpdatedAt: round.issue.updatedAt,
      syncedAt: new Date(),
      problem: round.said.length > 0 ? round.said.join(" ") : null,
    });
  };

  /** One comment on a linked issue, added to its task once. */
  const carryInOne = async (
    sync: Sync,
    comment: IssueComment,
    link: TrackerLinkRow
  ): Promise<void> => {
    const text = intoFile(comment.body, COMMENT_DEPTH);
    if (
      !text ||
      comment.createdAt < link.linkedAt.getTime() ||
      db.trackers.carried(sync.projectId, comment.id)
    ) {
      return;
    }
    const { provider } = sync.binding;
    try {
      const task = await own(sync.projectId, link.taskId, () =>
        tasks.comment(sync.projectId, link.taskId, text, {
          mover: "hub",
          author: {
            name: `${comment.author} on ${provider === "github" ? "GitHub" : "Linear"}`,
          },
          reason: `a comment on ${link.ref}`,
          tracker: provider,
        })
      );
      db.trackers.carry({
        projectId: sync.projectId,
        taskId: link.taskId,
        remoteId: comment.id,
        origin: "tracker",
        at: task.comments.at(-1)?.at ?? Date.now(),
      });
      // Their words are in its file now: an agent reads them only once you say so.
      if (comment.unvouched && unattended(sync, task.stage)) {
        await own(sync.projectId, link.taskId, () =>
          tasks.move(
            sync.projectId,
            link.taskId,
            sync.hold.name,
            actorOf(
              provider,
              `${link.ref} has a comment by ${comment.unvouched}: it waits in ${sync.hold.name} for you before any agent takes it`
            )
          )
        );
      }
    } catch (error) {
      db.trackers.updateLink(sync.projectId, link.taskId, {
        problem: fail(
          sync,
          link.taskId,
          `A comment on ${link.ref} could not be added to ${link.taskId}, or its task held for you: ${wordsOf(error)}`
        ),
      });
    }
  };

  /** Comments written on the target's issues since the cursor, added once each to their tasks. */
  const carryIn = async (
    sync: Sync,
    cursor: TrackerCursor
  ): Promise<Pick<TrackerCursor, "commentsEtag" | "commentsSince">> => {
    const listed = await sync.adapter.comments({
      since: cursor.commentsSince,
      etag: cursor.commentsEtag,
    });
    if (listed.kind === "unchanged") {
      return {
        commentsSince: cursor.commentsSince,
        commentsEtag: cursor.commentsEtag,
      };
    }
    for (const comment of listed.items) {
      const link = db.trackers.linkByIssue(sync.projectId, comment.issueKey);
      if (link) {
        // biome-ignore lint/performance/noAwaitInLoops: comments land in the order they were written
        await carryInOne(sync, comment, link);
      }
    }
    return {
      commentsSince: listed.cursor.since,
      commentsEtag: listed.cursor.etag,
    };
  };

  /** The link a task gets with its issue: what they agree on, from now. */
  const linkRow = (
    sync: Sync,
    task: TaskView,
    issue: Issue,
    agreed: Fields & Pick<TrackerSynced, "state" | "status">,
    /** Comments written after it, on either side, are carried to the other. */
    linkedAt: Date,
    /** Its opener, when the tracker does not vouch for them: its pulls wait for you. */
    unvouched: string | null = null
  ): TrackerLinkRow => ({
    projectId: sync.projectId,
    taskId: task.id,
    provider: sync.binding.provider,
    issueKey: issue.key,
    ref: issue.ref,
    url: issue.url,
    synced: { ...agreed, stage: task.stage },
    remoteUpdatedAt: issue.updatedAt,
    problem: null,
    syncedAt: new Date(),
    linkedAt,
    unvouched,
  });

  /**
   * A task whose file names an issue the hub keeps no link for: linked
   * again as the task stands, so every field the issue holds otherwise is
   * the tracker's, and synced.
   */
  const relink = async (
    sync: Sync,
    task: TaskView,
    named: string
  ): Promise<void> => {
    const key = await sync.adapter.keyOf(named);
    const issue = key ? await sync.adapter.issue(key) : null;
    if (!issue) {
      throw new TrackerRefusal(
        "input",
        `${task.id} names ${named}, which is not an issue of ${sync.binding.targetName} the connection can see.`
      );
    }
    db.trackers.dropLink(sync.projectId, task.id);
    // Linked again from now: comments either side wrote before are not carried twice.
    db.trackers.putLink(
      linkRow(sync, task, issue, { ...fileFields(task), state: "" }, new Date())
    );
    const link = db.trackers.link(sync.projectId, task.id);
    if (link) {
      await reconcile(sync, link, issue);
    }
  };

  /**
   * A new issue on the binding's Project in its task's stage's Status, when
   * the stage maps to one; the Status agreed on, or nothing when there is no
   * Project or it refused (its words kept).
   */
  const placeOnProject = async (
    sync: Sync,
    task: TaskView,
    issue: Issue
  ): Promise<Pick<TrackerSynced, "status">> => {
    const { onProject } = sync;
    const want = onProject
      ? statusOptionFor(task.stage, onProject.project)
      : null;
    if (!onProject || want === null) {
      return onProject ? { status: null } : {};
    }
    try {
      const item = await onProject.client.put(
        issue.key,
        undefined,
        onProject.fieldId,
        want
      );
      onProject.read.items.set(issue.key, item);
      return { status: item.optionId };
    } catch (error) {
      if (error instanceof TrackerRefusal && error.kind === "rate") {
        throw error;
      }
      fail(sync, task.id, statusStopped(sync, error));
      return {};
    }
  };

  /** A task with no issue: one made for it, linked, and what the tracker made of its words taken back. */
  const fileIssue = async (sync: Sync, task: TaskView): Promise<void> => {
    const { provider, targetName } = sync.binding;
    const current = stageOf(sync, task.stage);
    const state = current ? stateFor(current, sync.states) : undefined;
    if (!state) {
      throw new TrackerRefusal(
        "input",
        `${targetName} has no state for ${task.id}'s stage “${task.stage}”.`
      );
    }
    const fields = fileFields(task);
    const issue = await sync.adapter.create({
      title: fields.title,
      description: outOfFile(fields.description, DESCRIPTION_DEPTH),
      labels: fields.labels,
      state,
    });
    const remote = remoteFields(issue);
    const placed = await placeOnProject(sync, task, issue);
    db.trackers.dropLink(sync.projectId, task.id);
    // Linked from the task's making: what was said on it before its issue was made goes too.
    db.trackers.putLink(
      linkRow(
        sync,
        task,
        issue,
        { ...remote, state: issue.state.token, ...placed },
        new Date(task.createdAt)
      )
    );
    const back = Object.fromEntries(
      FIELDS.filter((field) => !sameField(remote[field], fields[field])).map(
        (field) => [field, remote[field]]
      )
    ) as TaskPatch;
    await own(sync.projectId, task.id, async () => {
      await tasks.setIssue(
        sync.projectId,
        task.id,
        issue.url,
        actorOf(provider, `${issue.ref} made on ${TRACKER_NAMES[provider]}`)
      );
      if (Object.keys(back).length > 0) {
        await tasks.update(
          sync.projectId,
          task.id,
          back,
          actorOf(
            provider,
            `${issue.ref} as ${TRACKER_NAMES[provider]} keeps it`
          )
        );
      }
    });
    console.info(
      `[tracker] ${sync.projectId} ${task.id} → ${issue.ref} on ${targetName}`
    );
  };

  /** A task with no issue yet: the issue its file names, linked, or one made; a refusal kept on a pending link. */
  const fileOrRelink = async (sync: Sync, taskId: string): Promise<void> => {
    const task = await tasks.get(sync.projectId, taskId);
    try {
      const named = task.issue?.url;
      await (named ? relink(sync, task, named) : fileIssue(sync, task));
    } catch (error) {
      if (stopsSync(error)) {
        throw error;
      }
      db.trackers.putLink({
        projectId: sync.projectId,
        taskId,
        provider: sync.binding.provider,
        issueKey: `${PENDING}${taskId}`,
        ref: "",
        url: "",
        synced: { ...fileFields(task), state: "", stage: task.stage },
        remoteUpdatedAt: 0,
        problem: fail(sync, taskId, problemOf(error)),
        syncedAt: null,
        linkedAt: new Date(),
        unvouched: null,
      });
    }
  };

  /**
   * An issue opened on the target after the binding, filed as a task and
   * linked. One whose opener the tracker does not vouch for is filed in the
   * hold stage, where an agent takes it only once you move it on: on a
   * public repository anyone may open an issue.
   */
  const fileTask = async (sync: Sync, issue: Issue): Promise<void> => {
    const { provider, targetName } = sync.binding;
    const { unvouched } = issue.opener;
    const item = sync.onProject?.read.items.get(issue.key);
    const byStatus =
      sync.onProject && item?.optionId
        ? stageForStatus(sync, sync.onProject.project, item.optionId, "")
        : undefined;
    const placed =
      byStatus && stateFor(byStatus, sync.states)?.token === issue.state.token
        ? byStatus
        : stageFor(issue.state, undefined, sync.stages, sync.states);
    if (!placed) {
      sync.problems.set(
        `issue:${issue.key}`,
        `${issue.ref} on ${targetName} is “${issue.state.name}”, and this project has no stage of its kind to file it in.`
      );
      return;
    }
    const held = unvouched !== null && unattended(sync, placed.name);
    const stage = held ? sync.hold : placed;
    const fields = remoteFields(issue);
    const actor = actorOf(
      provider,
      held && unvouched
        ? heldWords(issue.ref, unvouched, stage.name)
        : `${issue.ref} opened on ${TRACKER_NAMES[provider]} by ${issue.opener.name}`
    );
    try {
      const task = await tasks.create(
        sync.projectId,
        { ...fields, stage: stage.name },
        actor
      );
      db.trackers.putLink(
        linkRow(
          sync,
          task,
          issue,
          {
            ...fields,
            state: issue.state.token,
            ...(sync.onProject ? { status: item?.optionId ?? null } : {}),
          },
          new Date(issue.createdAt),
          unvouched
        )
      );
      await own(sync.projectId, task.id, () =>
        tasks.setIssue(sync.projectId, task.id, issue.url, actor)
      );
      console.info(
        `[tracker] ${sync.projectId} ${issue.ref} on ${targetName} → ${task.id}`
      );
    } catch (error) {
      sync.problems.set(
        `issue:${issue.key}`,
        `${issue.ref} on ${targetName} could not be filed as a task: ${wordsOf(error)}`
      );
    }
  };

  /** A sync's adapter, states and stages; stages that do not read refuse it. */
  const openSync = async (binding: TrackerBindingRow): Promise<Sync> => {
    const adapter = await adapterOf(binding);
    const [states, stagesView] = await Promise.all([
      adapter.states(),
      tasks.stages(binding.projectId),
    ]);
    if (stagesView.problems.length > 0) {
      throw new TrackerRefusal(
        "input",
        `stages.md does not read, so no stage can follow its issue: ${stagesView.problems.join(" ")}`
      );
    }
    const hold = holdOf(stagesView.stages);
    if (!hold) {
      throw new TrackerRefusal("input", noHoldWords(binding.provider));
    }
    return {
      adapter,
      binding,
      hold,
      projectId: binding.projectId,
      states,
      stages: stagesView.stages,
      problems: new Map(),
    };
  };

  /**
   * After a refusal, GitHub's Projects asked again (Sync now, else every
   * {@link RECHECK_MS}): a connection given the permission since takes its
   * Project as binding would (the one bound, else the first linked to the
   * repository), GitHub's words gone. Answers the Project to read now; null
   * while it is still refused, or not asked yet.
   */
  const checkAgain = async (
    sync: Sync,
    retry: boolean
  ): Promise<GithubProject | null> => {
    const { binding } = sync;
    const last = checkedAt.get(binding.projectId) ?? 0;
    if (!retry && Date.now() - last < RECHECK_MS) {
      return null;
    }
    checkedAt.set(binding.projectId, Date.now());
    const bound = binding.githubProject;
    try {
      sync.projectProbe = await projectOf(
        binding.connection,
        binding.target,
        bound ? { id: bound.id, map: bound.map } : undefined
      );
    } catch (error) {
      if (stopsSync(error)) {
        throw error;
      }
      // The bound Project gone, or GitHub not answering: its words stand.
      sync.statusRefused = wordsOf(error);
      return null;
    }
    const { githubProject, githubProjectReason } = sync.projectProbe;
    return githubProjectReason ? null : githubProject;
  };

  /**
   * GitHub: the binding's Project read for this sync, its Status field and
   * each of the repository's issues on it. A connection that may not read it
   * stops Status, GitHub's words on the binding; issues sync either way.
   */
  const openStatus = async (sync: Sync, retry: boolean): Promise<void> => {
    const { binding } = sync;
    if (binding.provider !== "github") {
      return;
    }
    const project = binding.githubProjectReason
      ? await checkAgain(sync, retry)
      : binding.githubProject;
    if (!project) {
      return;
    }
    const client = githubProjectStatus(
      deps.connections.githubClient(binding.connection),
      binding.target,
      project
    );
    let read: ProjectRead;
    try {
      read = await client.read();
    } catch (error) {
      if (stopsSync(error)) {
        throw error;
      }
      const words = statusStopped(sync, error);
      if (!sync.statusRefused) {
        sync.problems.set("status", words);
      }
      return;
    }
    const fresh: GithubProject = {
      ...project,
      title: read.title,
      url: read.url || project.url,
      fieldId: read.fieldId,
      options: read.options,
    };
    sync.projectRead = fresh;
    if (!read.fieldId) {
      sync.problems.set(
        "status",
        `${fresh.title} has no single-select field named Status: stages show on GitHub only as open and closed.`
      );
      return;
    }
    sync.onProject = { client, fieldId: read.fieldId, project: fresh, read };
  };

  /** Each linked task on the board whose issue moved, or that moved itself or has a problem, made one record. */
  const reconcileLinks = async (
    sync: Sync,
    board: TaskSummary[],
    moved: Map<string, Issue>,
    marked: Set<string>
  ): Promise<void> => {
    const onBoard = new Map(board.map((task) => [task.id, task]));
    for (const link of db.trackers.links(sync.projectId)) {
      const task = onBoard.get(link.taskId);
      const issue = moved.get(link.issueKey);
      moved.delete(link.issueKey);
      // An archived or deleted task stays as it was, and so does its issue.
      // GitHub moved its item's Status: the issue's own list does not say so.
      const statusMoved =
        sync.onProject !== undefined &&
        remoteStatus(sync.onProject.read, link.issueKey, link.synced.status) !==
          (link.synced.status ?? null);
      const touched =
        task !== undefined &&
        (marked.has(link.taskId) ||
          link.problem !== null ||
          statusMoved ||
          task.updatedAt > (link.syncedAt?.getTime() ?? 0) - CLOCK_MARGIN_MS);
      if (task && !link.issueKey.startsWith(PENDING) && (issue || touched)) {
        // biome-ignore lint/performance/noAwaitInLoops: one task's sync at a time, inside one rate limit
        await reconcile(sync, link, issue);
      }
    }
  };

  /** Issues opened on the target since the binding that no task links yet, filed as tasks. */
  const fileNewTasks = async (
    sync: Sync,
    moved: Map<string, Issue>
  ): Promise<void> => {
    const bound = sync.binding.boundAt.getTime();
    for (const issue of moved.values()) {
      if (
        issue.createdAt >= bound &&
        !db.trackers.linkByIssue(sync.projectId, issue.key)
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: tasks are numbered in the order their issues came
        await fileTask(sync, issue);
      }
    }
  };

  /** Tasks filed since the binding with no issue yet (or one refused before), given theirs. */
  const fileNewIssues = async (
    sync: Sync,
    board: TaskSummary[]
  ): Promise<void> => {
    const bound = sync.binding.boundAt.getTime() - CLOCK_MARGIN_MS;
    for (const task of board) {
      const link = db.trackers.link(sync.projectId, task.id);
      if (
        task.createdAt >= bound &&
        (!link || link.issueKey.startsWith(PENDING))
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: issues are made in the order their tasks came
        await fileOrRelink(sync, task.id);
      }
    }
  };

  /** A sync that stopped: the binding says why, and the tasks marked wait for the next. */
  const stopped = (
    binding: TrackerBindingRow,
    marked: Set<string>,
    error: unknown
  ): void => {
    const refusal =
      error instanceof TrackerRefusal
        ? error
        : new TrackerRefusal("input", wordsOf(error));
    if (refusal.kind === "sign-in") {
      deps.connections.refusedBy(binding.connection, refusal.message);
    }
    for (const id of marked) {
      dirtyOf(binding.projectId).add(id);
    }
    console.warn(`[tracker] ${binding.projectId}: ${refusal.message}`);
    db.trackers.updateBinding(binding.projectId, {
      state: stateAfter(refusal, binding),
      reason: refusal.message,
      polledAt: new Date(),
      resumeAt: refusal.resumeAt ? new Date(refusal.resumeAt) : null,
    });
  };

  /**
   * One sync of a project, in its turn: every step in order, its cursor kept
   * when all went through. `retry` (Sync now) asks refused GitHub Projects
   * again at once.
   */
  const syncProject = (projectId: string, retry = false): Promise<void> =>
    inTurn(projectId, async () => {
      const binding = db.trackers.binding(projectId);
      if (
        !binding ||
        lifetime.closed() ||
        (binding.resumeAt?.getTime() ?? 0) > Date.now()
      ) {
        return;
      }
      const marked = dirty.get(projectId) ?? new Set<string>();
      dirty.delete(projectId);
      try {
        const sync = await openSync(binding);
        await openStatus(sync, retry);
        const { cursor } = binding;
        const changed: Listed<Issue> = await sync.adapter.changed({
          since: cursor.since,
          etag: cursor.etag,
        });
        const moved = new Map<string, Issue>(
          changed.kind === "read"
            ? changed.items.map((issue) => [issue.key, issue])
            : []
        );
        const comments = await carryIn(sync, cursor);
        const { tasks: board } = await tasks.list(projectId);
        await reconcileLinks(sync, board, moved, marked);
        await fileNewTasks(sync, moved);
        await fileNewIssues(sync, board);
        const issues =
          changed.kind === "read"
            ? changed.cursor
            : { since: cursor.since, etag: cursor.etag };
        db.trackers.updateBinding(projectId, {
          cursor: { ...comments, since: issues.since, etag: issues.etag },
          ...outcomeOf(sync),
          ...projectAfter(sync),
          polledAt: new Date(),
          resumeAt: null,
        });
      } catch (error) {
        stopped(binding, marked, error);
      }
    });

  /** A sync of the project half a second from now: a burst of changes is one. */
  const syncSoon = (projectId: string): void => {
    if (soon.has(projectId) || lifetime.closed()) {
      return;
    }
    soon.set(
      projectId,
      lifetime.after(SOON_MS, () => {
        soon.delete(projectId);
        detach(syncProject(projectId), `tracker sync of ${projectId}`);
      })
    );
  };

  /** Whether a task event is the sync's own write, never sent back. */
  const ownEvent = (event: Parameters<Parameters<Tasks["listen"]>[0]>[0]) => {
    if (event.kind === "changed") {
      return (
        event.comment?.actor.tracker !== undefined ||
        (event.id !== undefined &&
          writing.has(`${event.projectId}\0${event.id}`))
      );
    }
    return (
      event.actor.tracker !== undefined ||
      writing.has(`${event.projectId}\0${event.id}`)
    );
  };

  // A task changed in CawCo: its project syncs soon. The sync's own writes are not sent back.
  tasks.listen((event) => {
    if (!db.trackers.binding(event.projectId) || ownEvent(event)) {
      return;
    }
    if (event.id) {
      dirtyOf(event.projectId).add(event.id);
    }
    syncSoon(event.projectId);
  });

  /** A connection by its name, or the route's refusal in its words. */
  const connectionNamed = (name: string) => {
    try {
      return deps.connections.get(name);
    } catch (error) {
      throw new TrackerProblem(wordsOf(error), { cause: error });
    }
  };

  /**
   * Binds a project: the target read first through the connection (its
   * refusal in words, nothing bound), then a first sync. The same target
   * bound again keeps its links. `cawco` lets the binding go: the files stay,
   * each naming its issue, and nothing syncs.
   */
  const bind = async (
    projectId: string,
    input: BindInput
  ): Promise<TrackerView> => {
    if (!db.project(projectId)) {
      throw new TrackerProblem(`The hub keeps no project ${projectId}.`);
    }
    if (input.tracker === "cawco") {
      await inTurn(projectId, () => {
        db.trackers.unbind(projectId);
        return Promise.resolve();
      });
      console.info(`[tracker] ${projectId}: back to CawCo's files alone`);
      return view(projectId);
    }
    const asked = askedOf({ ...input, tracker: input.tracker });
    // Nothing is bound where the tracker's unvouched issues could not wait for you.
    if (!holdOf((await tasks.stages(projectId)).stages)) {
      throw new TrackerProblem(noHoldWords(asked.tracker));
    }
    const connection = connectionNamed(asked.connection);
    if (appServiceOf(connection.service) !== asked.tracker) {
      throw new TrackerProblem(
        `${asked.connection} is a ${connection.service} connection; ${TRACKER_NAMES[asked.tracker]} needs a ${asked.tracker} one.`
      );
    }
    const now = new Date();
    const draft: TrackerBindingRow = {
      projectId,
      provider: asked.tracker,
      connection: asked.connection,
      target: asked.target,
      targetName: asked.target,
      targetUrl: "",
      boundAt: now,
      cursor: {
        since: now.getTime(),
        etag: null,
        commentsSince: now.getTime(),
        commentsEtag: null,
      },
      state: "syncing",
      reason: null,
      polledAt: null,
      resumeAt: null,
      githubProject: null,
      githubProjectReason: null,
    };
    const { target, onProject } = await targetOf(draft, input.githubProject);
    checkedAt.set(projectId, Date.now());
    const was = db.trackers.binding(projectId);
    // The same target bound again (another connection) keeps where it stood: nothing is missed or copied twice.
    const kept =
      was?.provider === draft.provider && was.target === target.id
        ? { boundAt: was.boundAt, cursor: was.cursor }
        : {};
    await inTurn(projectId, () => {
      db.trackers.bind({
        ...draft,
        target: target.id,
        targetName: target.name,
        targetUrl: target.url,
        ...onProject,
        ...kept,
      });
      // Another Project's options are other ids: what the links agreed on Status starts again.
      if (was?.githubProject?.id !== onProject.githubProject?.id) {
        db.trackers.forgetStatus(projectId);
      }
      return Promise.resolve();
    });
    console.info(
      `[tracker] ${projectId} bound to ${target.name} through ${asked.connection}`
    );
    await syncProject(projectId);
    return view(projectId);
  };

  /** A binding's target as its connection reads it, and on GitHub its Project; a refusal in words. */
  const targetOf = async (
    draft: TrackerBindingRow,
    asked: BindInput["githubProject"]
  ): Promise<{
    onProject: Pick<TrackerBindingRow, "githubProject" | "githubProjectReason">;
    target: TrackerTarget;
  }> => {
    try {
      const target = await (await adapterOf(draft)).describe();
      return {
        target,
        onProject:
          draft.provider === "github"
            ? await projectOf(draft.connection, target.id, asked)
            : { githubProject: null, githubProjectReason: null },
      };
    } catch (error) {
      throw error instanceof TrackerProblem
        ? error
        : new TrackerProblem(wordsOf(error), { cause: error });
    }
  };

  /**
   * The Project a GitHub binding's stages show on: the one asked for, else
   * (left out) the first linked to the repository, each stage on the option
   * named as it unless the form set another. A connection that may not read
   * the owner's Projects binds with none, GitHub's words kept.
   */
  const projectOf = async (
    connection: string,
    repo: string,
    asked: BindInput["githubProject"]
  ): Promise<
    Pick<TrackerBindingRow, "githubProject" | "githubProjectReason">
  > => {
    const listed = await githubProjects(
      deps.connections.githubClient(connection),
      repo
    );
    if (listed.refused) {
      return { githubProject: null, githubProjectReason: listed.refused };
    }
    if (asked === null) {
      return { githubProject: null, githubProjectReason: null };
    }
    const chosen = asked
      ? listed.projects.find((each) => each.id === asked.id)
      : listed.projects.find((each) => each.linked);
    if (asked && !chosen) {
      throw new TrackerProblem(
        `${connection} reaches no open GitHub Project ${asked.id} for ${repo}: pick one it lists.`
      );
    }
    return {
      githubProject: chosen
        ? {
            id: chosen.id,
            number: chosen.number,
            title: chosen.title,
            url: chosen.url,
            fieldId: chosen.fieldId,
            options: chosen.options,
            map: asked?.map ?? {},
          }
        : null,
      githubProjectReason: null,
    };
  };

  /** The Projects a GitHub connection reaches for a repository, for the binding's choice; GitHub's words when it may not read them. */
  const githubProjectsOf = async (
    name: string,
    repo: string
  ): Promise<GithubProjectsView> => {
    const connection = connectionNamed(name);
    if (appServiceOf(connection.service) !== "github") {
      throw new TrackerProblem(
        `${name} is a ${connection.service} connection: GitHub Projects need a GitHub one.`
      );
    }
    try {
      return await githubProjects(deps.connections.githubClient(name), repo);
    } catch (error) {
      throw new TrackerProblem(wordsOf(error), { cause: error });
    }
  };

  /** The repositories or teams a connection reaches, for the binding's choice. */
  const targets = async (name: string): Promise<TrackerTarget[]> => {
    const connection = connectionNamed(name);
    const service = appServiceOf(connection.service);
    if (!service) {
      throw new TrackerProblem(
        `${name} is a ${connection.service} connection: a tracker is GitHub Issues or Linear.`
      );
    }
    try {
      return service === "github"
        ? await githubTargets(
            deps.connections.githubClient(name),
            connection.auth === "app"
          )
        : await linearTargets(await deps.connections.linearClient(name));
    } catch (error) {
      throw new TrackerProblem(wordsOf(error), { cause: error });
    }
  };

  /** A task's issue, as its view shows it (tasks.ts `TaskStore.issueOf`). */
  const issueOf = (
    projectId: string,
    taskId: string,
    named: string | null
  ): TaskIssueLink | null => {
    const link = db.trackers.link(projectId, taskId);
    if (link) {
      return {
        provider: link.provider,
        ref: link.ref,
        url: link.url,
        problem: link.problem,
        syncedAt: link.syncedAt?.getTime() ?? null,
      };
    }
    const host = named ? namedIssue(named) : undefined;
    return host && named
      ? { ...host, url: named, problem: null, syncedAt: null }
      : null;
  };

  const poller = lifetime.every(POLL_MS, () => {
    for (const binding of db.trackers.bindings()) {
      detach(
        syncProject(binding.projectId),
        `tracker poll of ${binding.projectId}`
      );
    }
  });
  lifetime.onClose(() => {
    lifetime.cancel(poller);
    for (const timer of soon.values()) {
      lifetime.cancel(timer);
    }
  });

  return {
    bind,
    githubProjects: githubProjectsOf,
    issueOf,
    targets,
    view,
    /** Syncs a project now, in its turn; answers where it stands after. */
    sync: async (projectId: string): Promise<TrackerView> => {
      if (!db.project(projectId)) {
        throw new TrackerProblem(`The hub keeps no project ${projectId}.`);
      }
      await syncProject(projectId, true);
      return view(projectId);
    },
  };
};

export type Trackers = ReturnType<typeof createTrackers>;

const refused = (error: unknown) => {
  if (error instanceof TrackerProblem) {
    return status(400, error.message);
  }
  throw error;
};

/**
 * `/api/projects/:id/tracker`: where a project's tasks live, its binding
 * set or let go, and a sync now; `/api/connections/:name/targets`: what a
 * connection reaches, for the binding's choice;
 * `/api/connections/:name/github-projects?repo=`: the GitHub Projects it
 * reaches for a repository, or GitHub's words when it may not.
 */
export const trackerRoutes = (trackers: Trackers) =>
  new Elysia()
    .get("/api/projects/:id/tracker", ({ params }) => trackers.view(params.id))
    .put(
      "/api/projects/:id/tracker",
      {
        body: t.Object({
          tracker: t.Union([
            t.Literal("cawco"),
            t.Literal("github"),
            t.Literal("linear"),
          ]),
          /** The connection's name: GitHub Issues and Linear need one. */
          connection: t.Optional(t.String()),
          /** GitHub: `owner/repo`; Linear: the team's id. */
          target: t.Optional(t.String()),
          /** GitHub: the Project whose Status carries the stages, and each stage's option (null leaves Status alone); null for none; left out, the first linked to the repository. */
          githubProject: t.Optional(
            t.Union([
              t.Null(),
              t.Object({
                id: t.String(),
                map: t.Record(t.String(), t.Union([t.String(), t.Null()])),
              }),
            ])
          ),
        }),
      },
      async ({ params, body }) => {
        try {
          return await trackers.bind(params.id, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post("/api/projects/:id/tracker/sync", async ({ params }) => {
      try {
        return await trackers.sync(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .get("/api/connections/:name/targets", async ({ params }) => {
      try {
        return { targets: await trackers.targets(params.name) };
      } catch (error) {
        return refused(error);
      }
    })
    .get(
      "/api/connections/:name/github-projects",
      { query: t.Object({ repo: t.String() }) },
      async ({ params, query }) => {
        try {
          return await trackers.githubProjects(params.name, query.repo);
        } catch (error) {
          return refused(error);
        }
      }
    );
