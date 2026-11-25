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
 *   on a `both` binding tasks filed after it become issues; nothing older
 *   is copied either way.
 *   A routine (a task with a trigger, §5.5) never becomes an issue: it
 *   stays a CawCo file whatever the tracker.
 *   Linear's own GitHub sync does the same: "This will only sync issues
 *   *going forward*" (linear.app/docs/github).
 * - **Direction.** A binding syncs `both` ways, as the rest of this says,
 *   or `inbound`: issues opened after it come in as tasks, and their
 *   fields, state, Status and comments reach their tasks as below, the
 *   tracker the record, while nothing is written to the tracker. No issue
 *   is opened for a task, and no field, state, label, comment, Status or
 *   Status option goes out; a task's own changes stay in CawCo. Every
 *   write the sync makes is a member of the binding's {@link Outbound},
 *   made in one place from its direction (`outboundOf`), which an inbound
 *   binding does not have. Linear's GitHub sync offers the same choice:
 *   "One-way: issues created in GitHub will create a synced copy in
 *   Linear" (linear.app/docs/github). An inbound binding through a GitHub
 *   App needs only to read issues. A binding turned `both` sends only what
 *   is filed and written from then: tasks filed and comments written while
 *   it was inbound stay in CawCo, and on the switch each linked task is
 *   settled as one linked again (below): wherever it and its issue differ,
 *   in a field, state or Status, the tracker's value stands and becomes
 *   what they agree on (`settleTurned`). An edit made while inbound never
 *   reaches the tracker; one made after the switch does.
 * - **The link** is the task file's `issue:` (the issue's URL; files are the
 *   truth), the task's record link as the issue holds it (`task_links`,
 *   mode `record`, db task-links.ts), and a row of what the two last agreed
 *   on (`tracker_links`). A side whose value moved off the agreed one
 *   changed that field. A task whose file names an issue the hub keeps no
 *   link for is linked again, the tracker the record of every field that
 *   differs.
 * - **What syncs**, as Linear's GitHub sync does, less what CawCo keeps:
 *   "title, description, status, … labels, … comments"
 *   (linear.app/docs/github). Stages map onto states through their kinds
 *   (`stateFor`, `stageFor` below); with GitHub, a stage is open or closed. Comments
 *   go once each way, from the link on, a CawCo comment saying who wrote it;
 *   one from the tracker is filed as data through links.ts (its
 *   author, source and URL), and an edit there rewrites it in place.
 * - **Who opened it.** On a public repository anyone may open an issue, and
 *   a task in a `todo` stage is the dispatcher's to start. So, while the
 *   project holds outsiders (its `outsiders` rule, core outsiders.ts; the
 *   default), an issue whose opener the tracker does not vouch for (GitHub: no owner, member or
 *   collaborator of the repository; Linear: an integration's, no member
 *   behind it) is filed in the first stage of kind `you`, and every later
 *   pull that would put its task where an agent takes it, or rewrite its
 *   words while it stands there, puts it back: your move takes it on. Such
 *   a person's comment is carried and its task, standing where an agent
 *   takes it, waits there too. A project binds only with a `you` stage.
 *   claude-code-action likewise runs only for "users with write access to
 *   the repository" (its docs/security.md). Linear's Triage is a `you`
 *   stage's kind for the same reason (`TYPE_KINDS` below). A move made on
 *   the tracker is the person's who made it there: it starts what a
 *   stage's `runs:` starts (dispatch.ts).
 * - **When: through the door.** The sync polls nothing of its own. The
 *   watch it syncs is read by the one poll (clock.ts), and a webhook is a
 *   faster way into the same door (relay.ts); the door hands the sync what
 *   it stored, in the project's turn, after links and before lifecycle and
 *   routing (intake.ts, provider spec §2.5 step 2): a revision of an issue
 *   no task links, opened at or after the binding, is filed as a task
 *   ({@link IntakeSubscribers} `sync.revision`, `fileTask`); a revision of a
 *   linked issue is reconciled with its task, fed the revision; a board
 *   read lands its Status. Each mirror row's `synced_version` records what
 *   the sync took in, and a row past it (a hub that stopped mid-way, a sync
 *   that stopped short) runs again at the hub's start and after the
 *   project's next read, the issue read now. A comment on a linked issue is
 *   filed on its task by the door's links step (links.ts), as on any linked
 *   item; who wrote it is the outsider rule's (outsiders.ts). A task
 *   changed in CawCo syncs half a second later, in the same turn: its own
 *   writes go through tasks.ts as an actor marked `tracker`, never sent
 *   back. What the sync reads or writes of an issue itself reaches the
 *   mirror through the door's store (db/intake.ts `own`).
 * - **Stages on a GitHub Project.** GitHub's open stands for every open
 *   stage, so a GitHub binding may name a Project (v2): each stage puts its
 *   issue's item in a Status option (the one set in the binding's form, else
 *   the option named as the stage), and a Status moved on GitHub moves the
 *   task, with the same last-agreed rule as every field
 *   (tracker-github-project.ts). The Project is read as the watch's board
 *   stream (providers github/board.ts) through its connection, and each
 *   read lands here; one the connection may not read leaves Status alone,
 *   the binding saying GitHub's words, and issues sync as before. Sync now
 *   asks again at once, the poll every ten minutes: given the permission
 *   since, the binding takes its Project and Status starts.
 * - **Status options.** A stage takes the option named as it. Binding adds
 *   one for each stage the Project lacks, and every sync after does the
 *   same for a stage the hub has not yet made sure of on that Project (a
 *   column added to the board since, or every stage of a binding made
 *   before the hub added options): each stage once, so an option the
 *   person removes or renames on GitHub stays as they left it, and no
 *   option is ever removed or renamed. The options last added are kept on
 *   the binding and shown under its row in the project's settings, never
 *   in the Caw chat (the owner's "Where triggers go", 2026-11-23: what the
 *   hub does goes on its thing). GitHub's refusal stays on
 *   the binding in its words, the other stages' Status syncing meanwhile;
 *   Sync now asks again at once, the poll every ten minutes.
 * - **No fallbacks.** A refused write leaves both sides as they are and says
 *   the tracker's words on the task's link, and on the binding when the
 *   connection's sign-in or scope is what refused: a sign-in refused marks
 *   the connection too. The next sync tries again.
 */

import { detach } from "@cawco/core/detach";
import type { ExternalActor, ExternalState } from "@cawco/core/external-items";
import { isFleetProject } from "@cawco/core/fleet-project";
import { outsideFences } from "@cawco/core/markdown-code";
import type { OutsiderRule } from "@cawco/core/outsiders";
import type { Stage, TaskSummary } from "@cawco/core/task-views";
import { secondsOf } from "@cawco/core/time";
import {
  type GithubProject,
  type GithubProjectsView,
  type GithubStatusesAdded,
  type GithubStatusStages,
  type IssueTracker,
  statusOptionFor,
  TRACKER_NAMES,
  type Tracker,
  type TrackerDirection,
  type TrackerSyncState,
  type TrackerTarget,
  type TrackerView,
} from "@cawco/core/trackers";
import { unhandled } from "@cawco/core/unhandled";
import type { StageKind } from "@cawco/core/views";
import { connectionsWords } from "@cawco/core/words/connections";
import { githubProjects as listProjects } from "@cawco/providers/github/board";
import type { GitHubClient } from "@cawco/providers/github/client";
import { githubIssueState, githubSync } from "@cawco/providers/github/sync";
import type { LinearClientFor } from "@cawco/providers/linear/client";
import { linearSync } from "@cawco/providers/linear/sync";
import type {
  BoardItem,
  BoardRead,
  IssueState,
  ItemRevision,
  MadeComment,
  StateType,
} from "@cawco/providers/provider";
import type { ProviderFailure } from "@cawco/providers/read-stop";
import { itemOfUrl } from "@cawco/providers/registry";
import { Effect } from "effect";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { appServiceOf, type Connections } from "./connections";
import type { ItemRow } from "./db/external-items";
import type { IntakeDb } from "./db/intake";
import type { TaskLinksDb } from "./db/task-links";
import type {
  TrackerAgreement,
  TrackerBindingRow,
  TrackerLinkRow,
  TrackerSynced,
  TrackersDb,
} from "./db/trackers";
import type { Intake, Synced } from "./intake";
import type { HubLifetimeShape } from "./lifetime";
import type { AnyProblem } from "./refusal";

import type { TaskActor, TaskPatch, Tasks, TaskView } from "./tasks";
import { WriteRefused, type Writes } from "./writes";

/** An issue as the sync reads it. */
export interface Issue {
  /** Who opened it, as the source names them; null when it names no one. */
  author: ExternalActor | null;
  createdAt: number;
  /** Its body, as the tracker holds it (markdown), trimmed. */
  description: string;
  /** The source's own id: GitHub's node id, Linear's uuid. */
  id: string;
  /** GitHub: its number; Linear: its id. */
  key: string;
  /** Its labels' names, sorted. */
  labels: string[];
  /** GitHub's #12; null on Linear. */
  number: number | null;
  /**
   * Who opened it: their name, and, when the tracker does not vouch for
   * them, who they are in words (GitHub: no owner, member or collaborator
   * of the repository; Linear: an integration's, no member behind it).
   * Their issue's task waits for a person before any agent takes it.
   */
  opener: { name: string; unvouched: string | null };
  /** `#12`, `ENG-123`. */
  ref: string;
  state: IssueState;
  title: string;
  updatedAt: number;
  url: string;
}

/** What a new issue is made of. */
export interface IssueDraft {
  description: string;
  labels: string[];
  state: IssueState;
  title: string;
}

/** What a change to an issue sets; what it leaves out stays. */
export type IssuePatch = Partial<IssueDraft>;

/** A 400 the person reads, under the tracker's own `code`. */
type Said<Code extends string> = ReturnType<
  typeof problem<400, { code: Code; detail: string }>
>;

/**
 * Why a tracker would not do what the sync asked, in its own words with
 * what the person can do: a provider's refusal or the write door's, read
 * at the sync's edge ({@link settle}); the code says what the sync reads
 * of it:
 *
 * - `tracker-sign-in`: the connection's key or app was not taken.
 * - `tracker-scope`: the connection reaches the service but may not do this.
 * - `tracker-rate`: the service's rate limit holds calls back until
 *   `resumeAt` (ms).
 * - `tracker-unreachable`: no answer.
 * - `tracker-input`: the tracker would not take what was sent.
 */
export type TrackerProblem =
  | Said<"tracker-sign-in">
  | Said<"tracker-scope">
  | ReturnType<
      typeof problem<
        400,
        { code: "tracker-rate"; detail: string; resumeAt: number }
      >
    >
  | Said<"tracker-unreachable">
  | Said<"tracker-input">;

/** Whether the tracker's rate limit holds the calls back. */
const heldByRate = (misfit: AnyProblem): boolean =>
  misfit.response.code === "tracker-rate";

/** Whether a problem stops a whole sync, rather than one task's part of it: a rate limit, or a sign-in the tracker did not take. */
const stopsSync = (misfit: AnyProblem): boolean =>
  heldByRate(misfit) || misfit.response.code === "tracker-sign-in";

/** Whether the connection itself is what the tracker would not take: its sign-in or its scope. The binding says it. */
const deniesConnection = (misfit: AnyProblem): boolean =>
  misfit.response.code === "tracker-sign-in" ||
  misfit.response.code === "tracker-scope";

/** The categories a kind's stage puts its issue in, the first the tracker has. */
const KIND_TYPES: Readonly<Record<StageKind, readonly StateType[]>> = {
  todo: ["unstarted", "backlog", "triage"],
  active: ["started", "unstarted"],
  waiting: ["started", "unstarted"],
  you: ["started", "unstarted"],
  done: ["completed"],
  dropped: ["canceled"],
};

/**
 * The kind of stage a category puts its task in. Triage waits for you:
 * Linear's issues there are "before they are added to your team's
 * workflow" (linear.app/docs/triage), and a `todo` stage is the
 * dispatcher's to start.
 */
const TYPE_KINDS: Readonly<Record<StateType, StageKind>> = {
  triage: "you",
  backlog: "todo",
  unstarted: "todo",
  started: "active",
  completed: "done",
  canceled: "dropped",
};

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The state a stage puts its issue in; undefined when the tracker has none for its kind. */
const stateFor = (
  stage: Pick<Stage, "kind" | "name">,
  states: readonly IssueState[]
): IssueState | undefined =>
  states.find((state) => same(state.name, stage.name)) ??
  KIND_TYPES[stage.kind]
    .map((type) => states.find((state) => state.type === type))
    .find((state) => state !== undefined);

/**
 * The stage an issue's state puts its task in: `current` when they agree
 * (the state is the one `current` puts its issue in, or is named as it),
 * else the stage named as the state, else the first stage of its category's
 * kind; undefined when the project has none.
 */
const stageFor = (
  state: IssueState,
  current: Pick<Stage, "kind" | "name"> | undefined,
  stages: readonly Stage[],
  states: readonly IssueState[]
): Pick<Stage, "kind" | "name"> | undefined => {
  if (
    current &&
    (same(current.name, state.name) ||
      stateFor(current, states)?.token === state.token)
  ) {
    return current;
  }
  return (
    stages.find((stage) => same(stage.name, state.name)) ??
    stages.find((stage) => stage.kind === TYPE_KINDS[state.type])
  );
};

const HEADING = /^(#{2,})(?=\s|$)/u;

/** Each heading line outside fenced code, its #s counted and changed by `change`. */
const headings = (text: string, change: (level: number) => number): string =>
  outsideFences(text, (line) => {
    const found = HEADING.exec(line);
    return found
      ? `${"#".repeat(change(found[1].length))}${line.slice(found[1].length)}`
      : line;
  });

/** Text from a tracker as a task file holds it: every heading below H1 `by` levels deeper. */
export const intoFile = (text: string, by: 1 | 2): string =>
  headings(text.replaceAll("\r\n", "\n").trim(), (level) => level + by);

/** A task file's text as its tracker holds it: each heading `by` levels back up. */
const outOfFile = (text: string, by: 1 | 2): string =>
  headings(text.trim(), (level) => (level >= 2 + by ? level - by : level));

/** An issue's state in the five words every source maps onto (core external-items.ts). */
const externalStateOf = (state: IssueState): ExternalState => {
  if (state.type === "completed") {
    return "closed";
  }
  return state.type === "canceled" ? "canceled" : "open";
};

/** Labels as the sync compares them: each once, sorted. */
const labelSet = (labels: readonly string[]): string[] =>
  [...new Set(labels.map((label) => label.trim()).filter(Boolean))].sort();

/** How long one request the sync sends may take. Our choice, as the poll's (clock.ts). */
const REQUEST_MS = 30_000;

/** A provider's failure, or the write door's refusal, as the tracker's problem. */
const problemOf = (failure: ProviderFailure | WriteRefused): TrackerProblem => {
  if (failure._tag === "ProviderUnanswered") {
    return problem(400, {
      code: "tracker-unreachable",
      detail: `${failure.service} did not answer within ${secondsOf(failure.after)} s.`,
    });
  }
  const kind =
    failure._tag === "ProviderRefused" ? failure.kind : failure.reason;
  switch (kind) {
    case "rate":
      return problem(400, {
        code: "tracker-rate",
        detail: failure.words,
        resumeAt: failure.resumeAt ?? Date.now(),
      });
    case "sign-in":
      return problem(400, { code: "tracker-sign-in", detail: failure.words });
    case "scope":
      return problem(400, { code: "tracker-scope", detail: failure.words });
    case "unreachable":
    case "unanswered":
      return problem(400, {
        code: "tracker-unreachable",
        detail: failure.words,
      });
    case "input":
    case "direction":
    case "machine":
      return problem(400, { code: "tracker-input", detail: failure.words });
    default:
      return unhandled("refusal", kind);
  }
};

/** What a write answered, when it holds what was asked for; refused in words when it does not. */
const answered = <A>(
  value: A | undefined,
  what: string
): Effect.Effect<A, WriteRefused> =>
  value === undefined
    ? Effect.fail(
        new WriteRefused({
          reason: "input",
          words: `The tracker's answer named no ${what}.`,
          resumeAt: null,
        })
      )
    : Effect.succeed(value);

/** The promise edge of a provider's read or the write door's write: its answer, or its failure as the tracker's problem. */
const settle = <A>(
  effect: Effect.Effect<A, ProviderFailure | WriteRefused>
): Promise<A | TrackerProblem> =>
  Effect.runPromise(
    Effect.match(effect, { onFailure: problemOf, onSuccess: (value) => value })
  );

/** A Project item as a sync reads it: its id, and the Status option it stands in (null: none). */
type StatusItem = BoardItem;

/** A Project as the sync reads it off its board's last read: its Status field, and each of the repository's issues on it by number. */
interface ProjectRead {
  /** Every item was read; false when the read stopped short, so an issue missing from `items` may be on it still. */
  complete: boolean;
  fieldId: string | null;
  items: Map<string, StatusItem>;
  options: { id: string; name: string }[];
  title: string;
  url: string;
}

/**
 * The open Projects a GitHub connection reaches for a repository, for the
 * binding's choice (providers github/board.ts `githubProjects`): those
 * linked to it first, then the rest of its owner's. A connection that may
 * not read them answers GitHub's words instead.
 */
const githubProjects = (
  octokit: GitHubClient,
  repo: string
): Promise<GithubProjectsView | TrackerProblem> =>
  settle(listProjects(octokit, REQUEST_MS, repo));

/** How often a binding whose Status options were refused asks again on its own; Sync now asks at once. Our choice. */
const RECHECK_MS = 10 * 60_000;
/** How long after a task change its project syncs, so a burst of changes is one sync. Our choice. */
const SOON_MS = 500;
/** How long a team's states, read once, serve the sync's runs: a burst of revisions is one read. Our choice. */
const STATES_MS = 60_000;
/** A task changed this close before its last sync is looked at again: commit times are whole seconds. */
const CLOCK_MARGIN_MS = 2000;
/** How far a description's headings go, and a comment's ({@link intoFile}). */
const DESCRIPTION_DEPTH = 1;
const COMMENT_DEPTH = 2;

export interface TrackersDeps {
  readonly connections: Pick<
    Connections,
    | "get"
    | "githubAppPermissions"
    | "githubClient"
    | "linearClient"
    | "refusedBy"
  >;
  readonly db: {
    readonly intake: Pick<IntakeDb, "item" | "own" | "synced">;
    readonly project: (
      id: string
    ) => { id: string; outsiders: OutsiderRule } | undefined;
    readonly taskLinks: Pick<TaskLinksDb, "byItem">;
    readonly writes: {
      readonly carried: (projectId: string, taskId: string) => number[];
    };
    readonly trackers: TrackersDb;
  };
  readonly lifetime: HubLifetimeShape;
  /** The door's moves of items the sync read or wrote itself: the tasks that link them look again (links.ts `moved`). */
  readonly linksMoved: (projectId: string, items: readonly ItemRow[]) => void;
  /** Reads the project's syncing watch now (clock.ts `pollSyncNow`), a refused board asked again: Sync now. */
  readonly pollNow: (projectId: string) => Promise<void>;
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
  /** The project's turn (intake.ts `turn`): the door's subscribers and the sync's own runs, one at a time. */
  readonly turn: Intake["turn"];
  /** The write door: every write the sync makes goes through it, as the watch's (writes.ts). */
  readonly writes: Pick<Writes, "post">;
}

/** What a project binds to, as a person gives it. */
export interface BindInput {
  /** The connection's name: GitHub Issues and Linear need one. */
  connection?: string;
  /** Which way it syncs; left out, `both`. */
  direction?: TrackerDirection;
  /**
   * GitHub: the Project whose Status carries its stages, each stage on the
   * option named as it; null for none. Left out, the first Project linked
   * to the repository.
   */
  githubProject?: { id: string } | null;
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target?: string;
  tracker: Tracker;
}

/** A binding to GitHub Issues or Linear as asked, its connection and target named; refused in words when one is missing. */
const askedOf = (input: BindInput & { tracker: IssueTracker }) => {
  const name = TRACKER_NAMES[input.tracker];
  const where = input.tracker === "github" ? "repository" : "team";
  const connection = input.connection?.trim();
  if (!connection) {
    return problem(400, {
      code: "tracker-connection-missing",
      detail: `${name} needs a connection: pick the one that reaches its ${where}.`,
    });
  }
  const target = input.target?.trim();
  if (!target) {
    return problem(400, {
      code: "tracker-target-missing",
      detail: `${name} needs its ${where}: pick one ${connection} reaches.`,
    });
  }
  return {
    connection,
    target,
    tracker: input.tracker,
    direction: input.direction ?? "both",
  };
};

/** What the connections hand a tracker (a client, a connection's view), or the words they threw as the sign-in that could not be made. */
const signedIn = async <T>(
  connect: () => T | Promise<T>
): Promise<T | TrackerProblem> => {
  try {
    return await connect();
  } catch (error) {
    return problem(400, { code: "tracker-sign-in", detail: wordsOf(error) });
  }
};

/** The fields the sync compares, as a task file holds them. */
type Fields = Pick<TrackerSynced, "description" | "labels" | "title">;
const FIELDS = ["title", "description", "labels"] as const;
type Field = (typeof FIELDS)[number];

/**
 * What stops a sync, passed up from each step as it came: the adapter's
 * problem, the sync's own, or one a project's tasks or stages answered.
 */
type Stopped =
  | TrackerProblem
  | Said<
      | "tracker-github-project-unknown"
      | "tracker-github-statuses"
      | "tracker-issue-unseen"
      | "tracker-no-hold"
      | "tracker-stages-unread"
      | "tracker-state-none"
    >
  | Extract<
      Awaited<
        ReturnType<
          TrackersDeps["tasks"][
            "get" | "list" | "setIssue" | "stages" | "update"]
        >
      >,
      { readonly "~status": true }
    >;

/** One task's problem in a sync: the tracker's problem, or words of the hub's own. */
type Problem = AnyProblem | string;

/** What the sync reads of its tracker through the binding's connection (providers github/sync.ts, linear/sync.ts): a failure is the tracker's problem. */
interface Reads {
  describe: () => Promise<TrackerTarget | TrackerProblem>;
  /** One issue of the target read now; null when it is gone from it. */
  issue: (key: string) => Promise<ItemRevision | null | TrackerProblem>;
  keyOf: (url: string) => Promise<string | undefined | TrackerProblem>;
  states: () => Promise<IssueState[] | TrackerProblem>;
}

/**
 * Every write a sync makes to the tracker, each sent through the write door
 * (writes.ts) as the watch's, which refuses any on a watch that does not
 * sync both ways; an inbound binding has none (`writerOf`), so its sync
 * asks the door for nothing.
 */
interface Outbound {
  /** Comments on an issue, as `author` where the tracker lets the app say so; recorded with the task entry it carries. */
  comment: (
    key: string,
    author: string,
    body: string,
    taskId: string,
    entryAt: number
  ) => Promise<MadeComment | TrackerProblem>;
  /** Opens an issue for a task. */
  create: (
    draft: IssueDraft,
    taskId: string
  ) => Promise<ItemRevision | TrackerProblem>;
  /** GitHub: adds to a Project's Status field an option for each of `stages` it lacks. */
  options: (
    project: Pick<GithubProject, "id" | "title">,
    fieldId: string,
    stages: readonly string[]
  ) => Promise<
    | { added: string[]; options: { id: string; name: string }[] }
    | TrackerProblem
  >;
  /** From when tasks filed and comments written go to the tracker, ms: when the binding turned `both`; 0 for one bound so. */
  since: number;
  /** GitHub: puts an issue's item in a Status option on the binding's Project, added to it first when it is not on it. */
  status: (
    project: Pick<GithubProject, "id" | "title">,
    key: string,
    item: StatusItem | undefined,
    fieldId: string,
    optionId: string
  ) => Promise<StatusItem | TrackerProblem>;
  /** Changes an issue's fields and state. */
  update: (
    key: string,
    patch: IssuePatch,
    taskId: string
  ) => Promise<ItemRevision | TrackerProblem>;
}

/** One project's sync: its binding, its reads, states, stages, and each task's problem. */
interface Sync {
  binding: TrackerBindingRow;
  /** GitHub: the sync set a Status on the Project this run: the board it keeps is written back. */
  boardChanged?: boolean;
  /** Where what the tracker does not vouch for waits for you: the first stage of kind `you`. */
  hold: Stage;
  /** GitHub: the Project its stages show on, as this sync read it; unset while there is none or it does not run. */
  onProject?: {
    fieldId: string;
    project: GithubProject;
    read: ProjectRead;
  };
  /** What it writes to the tracker; unset for an inbound binding, which writes nothing. */
  out: Outbound | undefined;
  /** What the project does with what someone the tracker does not vouch for opens or writes (core outsiders.ts). */
  outsiders: OutsiderRule;
  /** Each task's problem this sync, by task (or `issue:<key>`): the binding says the first the connection caused. */
  problems: Map<string, Problem>;
  projectId: string;
  /** GitHub: the Project with the Status options this sync added, kept on the binding. */
  projectRead?: GithubProject;
  /** What it reads of the tracker. */
  reads: Reads;
  stages: Stage[];
  states: IssueState[];
  /** GitHub: the Status options this sync added to the Project. */
  statusesAdded?: GithubStatusesAdded;
  /** GitHub: its words when it refused adding a stage's option this sync; null when the options went through. */
  statusesRefused?: string | null;
  /** GitHub's words when this sync found the connection may not read or write the Project: Status stops. */
  statusRefused?: string;
  /** GitHub: the stages made sure of a Status option on the Project, when this sync made sure of more. */
  statusStages?: GithubStatusStages;
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
  /** What they last agreed on: the link's baseline, read whole. */
  synced: TrackerSynced;
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

/** An issue the sync read or wrote itself, as the door stores a revision of it (db/intake.ts `own`); none for a URL no provider names. */
const revisionOf = (issue: Issue): ItemRevision[] => {
  const item = itemOfUrl(issue.url);
  return item
    ? [
        {
          item,
          version: String(issue.updatedAt),
          snapshot: {
            externalId: issue.id,
            title: issue.title,
            state: externalStateOf(issue.state),
            stateName: issue.state.name,
            stateToken: issue.state.token,
            author: issue.author,
            labels: issue.labels,
            body: issue.description,
            createdAt: issue.createdAt,
            unvouched: issue.opener.unvouched,
          },
        },
      ]
    : [];
};

/** The state a revision's token names among the tracker's, else one made of what the revision says of it. */
const stateOfRevision = (
  sync: Sync,
  { snapshot }: ItemRevision
): IssueState => {
  const token = snapshot.stateToken ?? "";
  const known = sync.states.find((state) => state.token === token);
  if (known) {
    return known;
  }
  if (sync.binding.provider === "github") {
    return githubIssueState(token);
  }
  // A state the team made since its states were read: its category as the mirror reads it.
  return {
    token,
    name: snapshot.stateName || token,
    type: SHUT_TYPES[snapshot.state ?? ""] ?? "started",
  };
};

/** The category a shut mirror state reads as. */
const SHUT_TYPES: Readonly<Record<string, IssueState["type"]>> = {
  closed: "completed",
  canceled: "canceled",
};

/** An issue as the door stored a revision of it (provider spec §2.5): the sync reads it as it reads one it asked for. */
const issueOfRevision = (sync: Sync, revision: ItemRevision): Issue => {
  const { item, snapshot, version } = revision;
  const github = sync.binding.provider === "github";
  return {
    id: snapshot.externalId,
    key: github ? item.key : snapshot.externalId,
    number: github ? Number(item.key) : null,
    author: snapshot.author,
    ref: item.ref,
    url: item.url ?? "",
    title: snapshot.title,
    description: (snapshot.body ?? "").replaceAll("\r\n", "\n").trim(),
    labels: labelSet(snapshot.labels),
    state: stateOfRevision(sync, revision),
    opener: {
      name: snapshot.author?.login ?? "someone",
      unvouched: snapshot.unvouched ?? null,
    },
    createdAt: snapshot.createdAt ?? 0,
    updatedAt: Number(version),
  };
};

/** A binding's GitHub Project columns: the Project, why there is none, the stages made sure of on it, GitHub's words on the options it refused, and the options last added. */
type OnProject = Pick<
  TrackerBindingRow,
  | "githubProject"
  | "githubProjectReason"
  | "githubStatusStages"
  | "githubStatusesAdded"
  | "githubStatusesRefused"
>;

/**
 * The Project a binding asks for among those listed (left out: the first
 * linked to the repository); null when it asks none and none is linked,
 * undefined when the one it names is not listed.
 */
const projectChosen = (
  listed: GithubProjectsView,
  asked: BindInput["githubProject"]
) => {
  if (asked) {
    return listed.projects.find((each) => each.id === asked.id);
  }
  return listed.projects.find((each) => each.linked) ?? null;
};

/** A binding with no GitHub Project: Linear's, or GitHub's with none picked. */
const NO_PROJECT: OnProject = {
  githubProject: null,
  githubProjectReason: null,
  githubStatusStages: null,
  githubStatusesAdded: null,
  githubStatusesRefused: null,
};

const wordsOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const problemWords = (misfit: Problem): string =>
  typeof misfit === "string" ? misfit : misfit.response.detail;

/** Keeps a task's problem for the binding's word; answers its words. */
const fail = (sync: Sync, taskId: string, misfit: Problem): string => {
  if (!sync.problems.has(taskId)) {
    sync.problems.set(taskId, misfit);
  }
  return problemWords(misfit);
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
 * An unvouched opener's issue (its link's `unvouched`), while the project
 * holds outsiders: a pull that would put its task where an agent takes it,
 * or rewrite its words while it stands there, puts it in the hold stage
 * instead. Your own move takes it on; the next such pull holds it again.
 */
const holdPulls = (round: Round): void => {
  const { link, sync, task, issue } = round;
  if (!link.unvouched || sync.outsiders !== "hold") {
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
  const { remote, file, synced } = round;
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
  const { sync, issue, task, link, synced } = round;
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
  agreed: string | null
): string | null => {
  const item = read.items.get(issueKey);
  if (item) {
    return item.optionId;
  }
  return read.complete ? null : agreed;
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
  const { sync, link, task, issue, synced } = round;
  const { onProject } = sync;
  if (!onProject) {
    return;
  }
  const remote = remoteStatus(onProject.read, link.issueKey, synced.status);
  if (remote === synced.status) {
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
      `${link.ref} is “${optionName(onProject.project, remote)}” on ${onProject.project.title}, and the board has no column of that name, so the task stays where it is.`
    );
    return;
  }
  const state = stateFor(to, sync.states);
  if (
    issue.state.token !== synced.state &&
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
  const { sync, link, task, synced } = round;
  if (!sync.onProject || round.statusMoved) {
    return;
  }
  const remote = remoteStatus(
    sync.onProject.read,
    link.issueKey,
    synced.status
  );
  const ends = round.moveTo ?? task.stage;
  if (ends === synced.stage) {
    return;
  }
  const want = statusOptionFor(ends, sync.onProject.project);
  if (want !== null && want !== remote) {
    round.pushStatus = want;
  } else {
    round.next.status = remote;
  }
};

/**
 * The Status a held link's task and issue agree on: null where the binding
 * has no Project; undefined while they differ, or the item or the Project
 * was not read this sync.
 */
const agreedStatus = (
  sync: Sync,
  link: TrackerLinkRow,
  task: TaskView
): string | null | undefined => {
  const { onProject } = sync;
  if (!onProject) {
    return sync.binding.githubProject ? undefined : null;
  }
  const item = onProject.read.items.get(link.issueKey);
  if (!(item || onProject.read.complete)) {
    return;
  }
  const remote = item?.optionId ?? null;
  return statusOptionFor(task.stage, onProject.project) === remote
    ? remote
    : undefined;
};

/**
 * A held link's fresh baseline: its task and issue agreeing on every field
 * the merge compares (title, description and labels; the issue's state the
 * one the task's stage puts it in; on a Project, the Status that stage maps
 * to). Every baseline merges that to nothing, so it is what they agree on.
 * Undefined while they differ, or a part was not read: the hold stands.
 */
const agreedOf = (
  sync: Sync,
  link: TrackerLinkRow,
  task: TaskView,
  issue: Issue
): TrackerSynced | undefined => {
  const file = fileFields(task);
  const remote = remoteFields(issue);
  const current = stageOf(sync, task.stage);
  const agrees =
    FIELDS.every((field) => sameField(file[field], remote[field])) &&
    current !== undefined &&
    stateFor(current, sync.states)?.token === issue.state.token;
  const status = agreedStatus(sync, link, task);
  if (!agrees || status === undefined) {
    return;
  }
  return { ...remote, stage: task.stage, state: issue.state.token, status };
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

/** The task's changes, sent to its issue in one write (none on an inbound binding); a problem leaves them unagreed, to go again, and a rate limit stops the sync. */
const applyPush = async (round: Round): Promise<Stopped | undefined> => {
  const { push, sync, link } = round;
  if (!sync.out || Object.keys(push).length === 0) {
    return;
  }
  const updated = await sync.out.update(link.issueKey, push, link.taskId);
  if (updated instanceof ElysiaStatus) {
    if (heldByRate(updated)) {
      return updated;
    }
    round.said.push(fail(sync, link.taskId, updated));
    return;
  }
  round.issue = issueOfRevision(sync, updated);
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
const outcomeOf = (
  sync: Sync
): Pick<TrackerBindingRow, "problem" | "state"> => {
  const problems = [...sync.problems.values()];
  const denied = problems.find(
    (misfit) => typeof misfit !== "string" && deniesConnection(misfit)
  );
  if (denied) {
    return { state: "refused", problem: problemWords(denied) };
  }
  const [first] = problems;
  return {
    state: "synced",
    problem: first === undefined ? null : problemWords(first),
  };
};

/** The binding's Project as the sync left it: the options it added, and the board with the Status it set. */
const projectAfter = (sync: Sync): Partial<TrackerBindingRow> => ({
  ...(sync.projectRead ? { githubProject: sync.projectRead } : {}),
  ...(sync.statusRefused ? { githubProjectReason: sync.statusRefused } : {}),
  ...(sync.statusStages ? { githubStatusStages: sync.statusStages } : {}),
  ...(sync.statusesAdded ? { githubStatusesAdded: sync.statusesAdded } : {}),
  ...(sync.statusesRefused === undefined
    ? {}
    : { githubStatusesRefused: sync.statusesRefused }),
  ...(sync.boardChanged && sync.onProject
    ? {
        githubBoard: {
          projectId: sync.onProject.project.id,
          complete: sync.onProject.read.complete,
          items: Object.fromEntries(sync.onProject.read.items),
        },
      }
    : {}),
});

/** How a stage's name and an option's are compared: ignoring case, as core `statusOptionFor` does. */
const stageKey = (name: string): string => name.trim().toLowerCase();

/** The stages `made` names on Project `projectId`; none when it names another Project, or nothing yet. */
const madeOn = (
  made: GithubStatusStages | null,
  projectId: string
): string[] => (made?.projectId === projectId ? made.stages : []);

/**
 * The Status options just added to `project`, kept on the binding to be
 * shown beside it (never a note in the Caw chat); null when none were.
 * `who` names the project or repository in the log.
 */
const addedNow = (
  who: string,
  project: Pick<GithubProject, "id" | "title">,
  options: readonly string[]
): GithubStatusesAdded | null => {
  if (options.length === 0) {
    return null;
  }
  console.info(
    `[tracker] ${who}: added the Status ${options.length === 1 ? "option" : "options"} ${options.join(", ")} to ${project.title}`
  );
  return { projectId: project.id, options: [...options], at: Date.now() };
};

/** What a binding bound again keeps of the options last added: those added now, else, on the same Project, those added before. */
const addedKept = (
  was: TrackerBindingRow | undefined,
  now: OnProject
): GithubStatusesAdded | null => {
  if (now.githubStatusesAdded) {
    return now.githubStatusesAdded;
  }
  return was?.githubProject?.id === now.githubProject?.id
    ? (was?.githubStatusesAdded ?? null)
    : null;
};

/**
 * What a binding bound again keeps of the stages made sure of: those named
 * now, else, on the same Project, those named before: an inbound binding
 * names none, so a binding turned inbound keeps what it had made sure of.
 */
const stagesKept = (
  was: TrackerBindingRow | undefined,
  now: OnProject
): GithubStatusStages | null => {
  if (now.githubStatusStages) {
    return now.githubStatusStages;
  }
  return was?.githubProject?.id === now.githubProject?.id
    ? (was?.githubStatusStages ?? null)
    : null;
};

/**
 * What the same target bound again (another connection, another
 * direction) keeps of where it stood (its watch, so its streams' marks,
 * and its board), so nothing is missed or copied twice; nothing for
 * another target. A direction changed is dated, so a binding
 * turned `both` sends only what is filed and written after.
 */
const keptOf = (
  was: TrackerBindingRow | undefined,
  draft: TrackerBindingRow
): Partial<
  Pick<TrackerBindingRow, "boundAt" | "directionAt" | "githubBoard" | "watchId">
> => {
  if (!(was?.provider === draft.provider && was.target === draft.target)) {
    return {};
  }
  return {
    watchId: was.watchId,
    boundAt: was.boundAt,
    directionAt:
      was.direction === draft.direction ? was.directionAt : draft.boundAt,
    githubBoard: was.githubBoard,
  };
};

/** The options last added to the binding's Project, as the view shows them; none for another Project. */
const addedOn = (
  binding: Pick<TrackerBindingRow, "githubProject" | "githubStatusesAdded">
): Pick<GithubStatusesAdded, "at" | "options"> | null => {
  const added = binding.githubStatusesAdded;
  return added && added.projectId === binding.githubProject?.id
    ? { at: added.at, options: added.options }
    : null;
};

/** Where a binding stands after a sync that stopped: refused for a sign-in or scope, else as it stood. */
const stateAfter = (
  misfit: AnyProblem,
  binding: TrackerBindingRow
): TrackerSyncState => (deniesConnection(misfit) ? "refused" : binding.state);

export const createTrackers = (deps: TrackersDeps) => {
  const { db, tasks, lifetime, turn } = deps;
  /** A sync asked for soon, by project. */
  const soon = new Map<string, ReturnType<HubLifetimeShape["after"]>>();
  /** Each project's tracker states as last read, and when (ms): a burst of revisions is one read. */
  const statesRead = new Map<string, { at: number; states: IssueState[] }>();
  /** When each project's refused Status options were last asked for, ms. */
  const statusesAskedAt = new Map<string, number>();
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

  /** Issues the sync read or wrote itself, into the mirror through the door's store, each taken in as it is written; the tasks that link one whose state or title moved look again. */
  const storeOwn = (projectId: string, issues: readonly Issue[]): void => {
    const moved = db.intake.own(projectId, issues.flatMap(revisionOf));
    if (moved.length > 0) {
      deps.linksMoved(projectId, moved);
    }
  };

  /** The binding's reads, through its connection's client; a sign-in that cannot be made, in words, at each read. */
  const readsOf = (
    binding: Pick<TrackerBindingRow, "connection" | "provider" | "target">
  ): Reads => {
    const { target } = binding;
    if (binding.provider === "github") {
      const client = () =>
        signedIn(() => deps.connections.githubClient(binding.connection));
      const read =
        <A>(
          ask: (octokit: GitHubClient) => Effect.Effect<A, ProviderFailure>
        ) =>
        async () => {
          const octokit = await client();
          return octokit instanceof ElysiaStatus
            ? octokit
            : await settle(ask(octokit));
        };
      return {
        describe: read((octokit) =>
          githubSync.describe(octokit, target, REQUEST_MS)
        ),
        states: read((octokit) =>
          githubSync.states(octokit, target, REQUEST_MS)
        ),
        issue: (key) =>
          read((octokit) =>
            githubSync.issue(octokit, target, key, REQUEST_MS)
          )(),
        keyOf: (url) =>
          read((octokit) =>
            githubSync.keyOf(octokit, target, url, REQUEST_MS)
          )(),
      };
    }
    const client = () =>
      signedIn(() => deps.connections.linearClient(binding.connection));
    const read =
      <A>(
        ask: (linear: LinearClientFor) => Effect.Effect<A, ProviderFailure>
      ) =>
      async () => {
        const linear = await client();
        return linear instanceof ElysiaStatus
          ? linear
          : await settle(ask(linear));
      };
    return {
      describe: read((linear) =>
        linearSync.describe(linear, target, REQUEST_MS)
      ),
      states: read((linear) => linearSync.states(linear, target, REQUEST_MS)),
      issue: (key) =>
        read((linear) => linearSync.issue(linear, target, key, REQUEST_MS))(),
      keyOf: (url) =>
        read((linear) => linearSync.keyOf(linear, target, url, REQUEST_MS))(),
    };
  };

  /**
   * What a binding writes to the tracker, each write through the write
   * door as its watch's (writes.ts), which refuses any on a watch that does
   * not sync both ways. An inbound binding has none, so its sync opens no
   * issue and sends no field, state, label, comment, Status or Status
   * option, and binding it adds no Status option.
   */
  const writerOf = (
    binding: Pick<
      TrackerBindingRow,
      | "connection"
      | "direction"
      | "directionAt"
      | "projectId"
      | "provider"
      | "target"
      | "watchId"
    >
  ): Outbound | undefined => {
    if (binding.direction === "inbound") {
      return;
    }
    const { projectId, watchId } = binding;
    const by = { sync: watchId };
    // A watch not made yet (a binding being made) is named by its connection, its direction the binding's.
    const bound = db.trackers.binding(projectId)?.watchId === watchId;
    const target = bound
      ? { watch: watchId }
      : {
          connection: binding.connection,
          provider: binding.provider,
          host: binding.provider === "github" ? "github.com" : "linear.app",
          container: binding.target,
          sync: binding.direction,
        };
    return {
      create: (draft, taskId) =>
        settle(
          deps.writes
            .post({
              by,
              target,
              projectId,
              taskId,
              op: {
                op: "issue.create",
                title: draft.title,
                body: draft.description,
                labels: draft.labels,
                stateToken: draft.state.token,
              },
            })
            .pipe(Effect.flatMap((made) => answered(made.revision, "issue")))
        ),
      update: (key, patch, taskId) =>
        settle(
          deps.writes
            .post({
              by,
              target,
              projectId,
              taskId,
              op: {
                op: "issue.update",
                key,
                ...(patch.title === undefined ? {} : { title: patch.title }),
                ...(patch.description === undefined
                  ? {}
                  : { body: patch.description }),
                ...(patch.labels === undefined ? {} : { labels: patch.labels }),
                ...(patch.state === undefined
                  ? {}
                  : { stateToken: patch.state.token }),
              },
            })
            .pipe(Effect.flatMap((made) => answered(made.revision, "issue")))
        ),
      comment: (key, author, body, taskId, entryAt) =>
        settle(
          deps.writes
            .post({
              by,
              target,
              projectId,
              taskId,
              entryAt,
              op: {
                op: "comment.create",
                on: { kind: "issue", key },
                body,
                saidBy: author,
              },
            })
            .pipe(Effect.flatMap((made) => answered(made.comment, "comment")))
        ),
      options: (project, fieldId, stages) =>
        settle(
          deps.writes
            .post({
              by,
              target,
              projectId,
              op: {
                op: "board.columns",
                board: { id: project.id, field: fieldId, title: project.title },
                names: stages,
              },
            })
            .pipe(
              Effect.flatMap((made) =>
                answered(
                  made.options && {
                    added: made.added ?? [],
                    options: made.options,
                  },
                  "Status options"
                )
              )
            )
        ),
      status: (project, key, item, fieldId, optionId) =>
        settle(
          deps.writes
            .post({
              by,
              target,
              projectId,
              op: {
                op: "board.place",
                board: { id: project.id, field: fieldId, title: project.title },
                key,
                boardItem: item?.itemId ?? null,
                option: optionId,
              },
            })
            .pipe(
              Effect.flatMap((made) => answered(made.placed, "Project item"))
            )
        ),
      since: binding.directionAt?.getTime() ?? 0,
    };
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
        direction: binding.direction,
        target: binding.target,
        targetName: binding.targetName,
        targetUrl: binding.targetUrl,
        boundAt: binding.boundAt.getTime(),
        state: binding.state,
        reason: binding.reason ?? binding.problem,
        polledAt: binding.polledAt?.getTime() ?? null,
        linked: db.trackers.linkedCount(projectId),
        githubProject: binding.githubProject ?? null,
        githubProjectReason: binding.githubProjectReason ?? null,
        githubStatusesRefused: binding.githubStatusesRefused ?? null,
        githubStatusesAdded: addedOn(binding),
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
    const unwritten = (why: string) =>
      round.said.push(
        fail(
          sync,
          link.taskId,
          `${link.ref}'s change on ${TRACKER_NAMES[provider]} could not be written into ${link.taskId}: ${why}`
        )
      );
    try {
      const updated = await own(sync.projectId, link.taskId, () =>
        tasks.update(
          sync.projectId,
          link.taskId,
          pull,
          actorOf(provider, `${link.ref} changed on ${TRACKER_NAMES[provider]}`)
        )
      );
      if (updated instanceof ElysiaStatus) {
        unwritten(updated.response.detail);
        return;
      }
      Object.assign(round.next, pull);
    } catch (error) {
      unwritten(wordsOf(error));
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
    const unmoved = (why: string) =>
      round.said.push(
        fail(
          sync,
          link.taskId,
          `${where}, and ${link.taskId} could not move to ${moveTo}: ${why}`
        )
      );
    try {
      const moved = await own(sync.projectId, link.taskId, () =>
        tasks.move(
          sync.projectId,
          link.taskId,
          moveTo,
          actorOf(provider, where)
        )
      );
      if (moved instanceof ElysiaStatus) {
        unmoved(moved.response.detail);
        return;
      }
      round.next.state = issue.state.token;
      round.next.stage = moveTo;
    } catch (error) {
      unmoved(wordsOf(error));
    }
  };

  /**
   * The Project stops for this sync and every later one: GitHub's words go
   * on the binding, and issues keep syncing. Answers the words.
   */
  const statusStopped = (sync: Sync, misfit: AnyProblem): string => {
    if (deniesConnection(misfit)) {
      sync.statusRefused = misfit.response.detail;
      sync.onProject = undefined;
    }
    return misfit.response.detail;
  };

  /** The task's move put on its item: added to the Project when it is not on it, its Status set; nothing on an inbound binding. */
  const applyStatus = async (round: Round): Promise<Stopped | undefined> => {
    const { sync, link, task, pushStatus } = round;
    const { onProject } = sync;
    const put = sync.out?.status;
    if (
      !(onProject && put) ||
      pushStatus === undefined ||
      // The move did not go through: its Status waits for it.
      round.next.stage !== (round.moveTo ?? task.stage)
    ) {
      return;
    }
    const item = await put(
      onProject.project,
      link.issueKey,
      round.item,
      onProject.fieldId,
      pushStatus
    );
    if (item instanceof ElysiaStatus) {
      if (heldByRate(item)) {
        return item;
      }
      round.next.stage = round.synced.stage;
      round.said.push(statusStopped(sync, item));
      return;
    }
    onProject.read.items.set(link.issueKey, item);
    sync.boardChanged = true;
    round.next.status = item.optionId;
  };

  /** A linked task's issue: the revision the door handed over, or read now (into the mirror through the door); null, its problem kept, when it cannot be, and the problem that stops the sync when it is one. */
  const issueFor = async (
    sync: Sync,
    link: TrackerLinkRow,
    given: Issue | undefined
  ): Promise<Issue | null | Stopped> => {
    if (given) {
      return given;
    }
    const read = await sync.reads.issue(link.issueKey);
    if (read instanceof ElysiaStatus) {
      if (stopsSync(read)) {
        return read;
      }
      db.trackers.updateLink(sync.projectId, link.taskId, {
        problem: fail(sync, link.taskId, read),
      });
      return null;
    }
    const issue = read && issueOfRevision(sync, read);
    if (!issue) {
      db.trackers.updateLink(sync.projectId, link.taskId, {
        problem: fail(
          sync,
          link.taskId,
          `${link.ref} is gone from ${sync.binding.targetName}: deleted, moved, or no longer one the connection can see.`
        ),
      });
      return null;
    }
    storeOwn(sync.projectId, [issue]);
    return issue;
  };

  /** A task's comments written in CawCo since its link (and since the binding turned `both`), posted once each to its issue; none on an inbound binding. */
  const carryOut = async (round: Round): Promise<Stopped | undefined> => {
    const { sync, link, task } = round;
    const { out } = sync;
    if (!out) {
      return;
    }
    const from = Math.max(link.linkedAt.getTime(), out.since);
    const carried = new Set(db.writes.carried(sync.projectId, link.taskId));
    const due = task.comments.filter(
      (comment) =>
        comment.via === null &&
        comment.at >= from &&
        !carried.has(comment.at) &&
        comment.author.mover !== "hub"
    );
    for (const comment of due) {
      // Recorded by the write door with the entry it carries.
      const posted = await out.comment(
        link.issueKey,
        comment.author.name,
        outOfFile(comment.text, COMMENT_DEPTH),
        link.taskId,
        comment.at
      );
      if (posted instanceof ElysiaStatus) {
        if (heldByRate(posted)) {
          return posted;
        }
        round.said.push(fail(sync, link.taskId, posted));
        return;
      }
    }
  };

  /**
   * One linked task and its issue made one record again: per field, the
   * side that moved off what they last agreed wins, the tracker's where
   * both did; the state and stage likewise. Its outbound comments go after.
   * A held link (its baseline does not read) merges nothing and posts no
   * comment (one written on the issue is still filed, by the door's links
   * step), until the task and the issue agree, which is written as their
   * baseline and the round runs.
   */
  const reconcile = async (
    sync: Sync,
    link: TrackerLinkRow,
    given: Issue | undefined
  ): Promise<Stopped | undefined> => {
    const issue = await issueFor(sync, link, given);
    if (issue instanceof ElysiaStatus) {
      return issue;
    }
    if (!issue) {
      return;
    }
    const task = await tasks.get(sync.projectId, link.taskId);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const synced = link.baseline.held
      ? agreedOf(sync, link, task, issue)
      : link.baseline.synced;
    if (!synced) {
      db.trackers.updateLink(sync.projectId, link.taskId, { problem: null });
      return;
    }
    if (link.baseline.held) {
      db.trackers.updateLink(sync.projectId, link.taskId, { synced });
      console.info(
        `[tracker] ${sync.projectId} ${link.taskId}: held sync resumes, its task and ${link.ref} agreeing`
      );
    }
    const round: Round = {
      sync,
      link,
      task,
      issue,
      file: fileFields(task),
      remote: remoteFields(issue),
      synced,
      next: { ...synced },
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
    const stoppedBy = await applyRound(round);
    if (stoppedBy) {
      return stoppedBy;
    }
    if (round.issue !== issue) {
      // What the tracker answered to the task's changes reaches the mirror through the door.
      storeOwn(sync.projectId, [round.issue]);
    }
    db.trackers.updateLink(sync.projectId, link.taskId, {
      synced: round.next,
      problem: round.said.length > 0 ? round.said.join(" ") : null,
    });
  };

  /** A planned round applied: the task's changes to the issue first (what the tracker answers is what they agree on), then the issue's to the task, its move, its Status and its comments out. */
  const applyRound = async (round: Round): Promise<Stopped | undefined> => {
    const pushed = await applyPush(round);
    if (pushed) {
      return pushed;
    }
    await applyPull(round);
    await applyMove(round);
    return (await applyStatus(round)) ?? (await carryOut(round));
  };

  /** The sync's link of a mirror row's issue; undefined while no task, archived or not, holds it as its record with the sync. */
  const linkOfItem = (
    projectId: string,
    itemId: string
  ): TrackerLinkRow | undefined => {
    const record = db.taskLinks
      .byItem(projectId, { itemId }, "any")
      .find((row) => row.link.mode === "record");
    return record && db.trackers.link(projectId, record.link.taskId);
  };

  /** Links a task to its issue: what they agree on from now, and its record link to the issue's mirror row, which the door keeps. */
  const putLink = (
    sync: Sync,
    task: TaskView,
    issue: Issue,
    agreed: Fields &
      Pick<TrackerSynced, "state"> &
      Partial<Pick<TrackerSynced, "status">>,
    /** Comments written after it, on either side, are carried to the other. */
    linkedAt: Date,
    /** Its opener, when the tracker does not vouch for them: its pulls wait for you. */
    unvouched: string | null = null
  ): void => {
    const agreement: TrackerAgreement = {
      projectId: sync.projectId,
      taskId: task.id,
      synced: { ...agreed, stage: task.stage, status: agreed.status ?? null },
      linkedAt,
      unvouched,
    };
    db.trackers.putLink(agreement, issue.url);
  };

  /**
   * A task whose file names an issue the hub keeps no link for: linked
   * again as the task stands, so every field the issue holds otherwise is
   * the tracker's, and synced.
   */
  const relink = async (
    sync: Sync,
    task: TaskView,
    named: string
  ): Promise<Stopped | undefined> => {
    const key = await sync.reads.keyOf(named);
    if (key instanceof ElysiaStatus) {
      return key;
    }
    const read = key ? await sync.reads.issue(key) : null;
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const issue = read && issueOfRevision(sync, read);
    if (!issue) {
      return problem(400, {
        code: "tracker-issue-unseen",
        detail: `${task.id} names ${named}, which is not an issue of ${sync.binding.targetName} the connection can see.`,
      });
    }
    storeOwn(sync.projectId, [issue]);
    db.trackers.dropLink(sync.projectId, task.id);
    // Linked again from now: comments either side wrote before are not carried twice.
    putLink(sync, task, issue, { ...fileFields(task), state: "" }, new Date());
    const link = db.trackers.link(sync.projectId, task.id);
    if (link) {
      return await reconcile(sync, link, issue);
    }
  };

  /**
   * A binding turned from inbound to `both`: each linked task settled as a
   * task linked again, so nothing its task took on while inbound reaches the
   * tracker. Its baseline becomes the task as it stands, the state and
   * Status unagreed, so every field, state and Status where the task and
   * its issue differ is the tracker's on the sync the binding runs next,
   * the baseline then the tracker's value; each task is marked so that
   * sync reconciles it. Only what changes after the switch goes out.
   */
  const settleTurned = async (projectId: string): Promise<void> => {
    for (const link of db.trackers.links(projectId)) {
      const task = await tasks.get(projectId, link.taskId);
      if (task instanceof ElysiaStatus) {
        console.info(
          `[tracker] ${projectId} ${link.taskId}: not settled on the turn to both: ${task.response.detail}`
        );
        continue;
      }
      db.trackers.updateLink(projectId, link.taskId, {
        synced: {
          ...fileFields(task),
          stage: task.stage,
          state: "",
          status: null,
        },
      });
      dirtyOf(projectId).add(link.taskId);
    }
  };

  /**
   * A new issue on the binding's Project in its task's stage's Status, when
   * the stage maps to one; the Status agreed on, or nothing when there is no
   * Project or it would not (its words kept). A rate limit stops the sync.
   */
  const placeOnProject = async (
    sync: Sync,
    out: Outbound,
    task: TaskView,
    issue: Issue
  ): Promise<Partial<Pick<TrackerSynced, "status">> | Stopped> => {
    const { onProject } = sync;
    const want = onProject
      ? statusOptionFor(task.stage, onProject.project)
      : null;
    if (!onProject || want === null) {
      return onProject ? { status: null } : {};
    }
    const item = await out.status(
      onProject.project,
      issue.key,
      undefined,
      onProject.fieldId,
      want
    );
    if (item instanceof ElysiaStatus) {
      if (heldByRate(item)) {
        return item;
      }
      fail(sync, task.id, statusStopped(sync, item));
      return {};
    }
    onProject.read.items.set(issue.key, item);
    sync.boardChanged = true;
    return { status: item.optionId };
  };

  /** A task with no issue: one made for it, linked, and what the tracker made of its words taken back. */
  const fileIssue = async (
    sync: Sync,
    out: Outbound,
    task: TaskView
  ): Promise<Stopped | undefined> => {
    const { provider, targetName } = sync.binding;
    const current = stageOf(sync, task.stage);
    const state = current ? stateFor(current, sync.states) : undefined;
    if (!state) {
      return problem(400, {
        code: "tracker-state-none",
        detail: `${targetName} has no state for ${task.id}'s stage “${task.stage}”.`,
      });
    }
    const fields = fileFields(task);
    const made = await out.create(
      {
        title: fields.title,
        description: outOfFile(fields.description, DESCRIPTION_DEPTH),
        labels: fields.labels,
        state,
      },
      task.id
    );
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const issue = issueOfRevision(sync, made);
    storeOwn(sync.projectId, [issue]);
    const remote = remoteFields(issue);
    const placed = await placeOnProject(sync, out, task, issue);
    if (placed instanceof ElysiaStatus) {
      return placed;
    }
    db.trackers.dropLink(sync.projectId, task.id);
    // Linked from the task's making: what was said on it before its issue was made goes too.
    putLink(
      sync,
      task,
      issue,
      { ...remote, state: issue.state.token, ...placed },
      new Date(task.createdAt)
    );
    const back: TaskPatch = {
      ...(sameField(remote.title, fields.title) ? {} : { title: remote.title }),
      ...(sameField(remote.description, fields.description)
        ? {}
        : { description: remote.description }),
      ...(sameField(remote.labels, fields.labels)
        ? {}
        : { labels: remote.labels }),
    };
    const written = await own(sync.projectId, task.id, async () => {
      const named = await tasks.setIssue(
        sync.projectId,
        task.id,
        issue.url,
        actorOf(provider, `${issue.ref} made on ${TRACKER_NAMES[provider]}`)
      );
      if (named instanceof ElysiaStatus || Object.keys(back).length === 0) {
        return named;
      }
      return await tasks.update(
        sync.projectId,
        task.id,
        back,
        actorOf(provider, `${issue.ref} as ${TRACKER_NAMES[provider]} keeps it`)
      );
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    console.info(
      `[tracker] ${sync.projectId} ${task.id} → ${issue.ref} on ${targetName}`
    );
  };

  /** A task with no issue yet: the issue its file names, linked, or one made; a problem is the binding's to say and the next sync tries again, unless it stops the sync. */
  const fileOrRelink = async (
    sync: Sync,
    out: Outbound,
    taskId: string
  ): Promise<Stopped | undefined> => {
    const task = await tasks.get(sync.projectId, taskId);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const named = task.links.find((link) => link.mode === "record")?.url;
    const misfit = await (named
      ? relink(sync, task, named)
      : fileIssue(sync, out, task));
    if (!misfit) {
      return;
    }
    if (stopsSync(misfit)) {
      return misfit;
    }
    fail(sync, taskId, misfit);
  };

  /** The stage an issue is filed in: its Project status's, while that agrees with its state; else its state's. */
  const issueStage = (
    sync: Sync,
    issue: Issue,
    optionId: string | null | undefined
  ) => {
    const byStatus =
      sync.onProject && optionId
        ? stageForStatus(sync, sync.onProject.project, optionId, "")
        : undefined;
    return byStatus &&
      stateFor(byStatus, sync.states)?.token === issue.state.token
      ? byStatus
      : stageFor(issue.state, undefined, sync.stages, sync.states);
  };

  /**
   * An issue opened on the target after the binding, filed as a task and
   * linked; answers the task. While the project holds outsiders, one whose
   * opener the tracker does not vouch for is filed in the hold stage, where
   * an agent takes it only once you move it on: on a public repository
   * anyone may open an issue.
   */
  const fileTask = async (
    sync: Sync,
    issue: Issue
  ): Promise<string | undefined> => {
    const { provider, targetName } = sync.binding;
    const { unvouched } = issue.opener;
    const item = sync.onProject?.read.items.get(issue.key);
    const placed = issueStage(sync, issue, item?.optionId);
    if (!placed) {
      sync.problems.set(
        `issue:${issue.key}`,
        `${issue.ref} on ${targetName} is “${issue.state.name}”, and this project has no stage of its kind to file it in.`
      );
      return;
    }
    const held =
      sync.outsiders === "hold" &&
      unvouched !== null &&
      unattended(sync, placed.name);
    const stage = held ? sync.hold : placed;
    const fields = remoteFields(issue);
    const actor = actorOf(
      provider,
      held && unvouched
        ? heldWords(issue.ref, unvouched, stage.name)
        : `${issue.ref} opened on ${TRACKER_NAMES[provider]} by ${issue.opener.name}`
    );
    const unfiled = (why: string) =>
      sync.problems.set(
        `issue:${issue.key}`,
        `${issue.ref} on ${targetName} could not be filed as a task: ${why}`
      );
    try {
      const task = await tasks.create(
        sync.projectId,
        { ...fields, stage: stage.name },
        actor
      );
      if (task instanceof ElysiaStatus) {
        unfiled(task.response.detail);
        return;
      }
      putLink(
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
      );
      const named = await own(sync.projectId, task.id, () =>
        tasks.setIssue(sync.projectId, task.id, issue.url, actor)
      );
      if (named instanceof ElysiaStatus) {
        unfiled(named.response.detail);
        return;
      }
      console.info(
        `[tracker] ${sync.projectId} ${issue.ref} on ${targetName} → ${task.id}`
      );
      return task.id;
    } catch (error) {
      unfiled(wordsOf(error));
    }
  };

  /**
   * A sync's adapter, states and stages; stages that do not read stop it.
   * The problem of the project's folder here and in the sync's other steps
   * passes up as it is, with the adapter's: the binding says it in its words.
   */
  const openSync = async (
    binding: TrackerBindingRow
  ): Promise<Sync | Stopped> => {
    const reads = readsOf(binding);
    const [states, stagesView] = await Promise.all([
      statesOf(binding, reads),
      tasks.stages(binding.projectId),
    ]);
    if (states instanceof ElysiaStatus) {
      return states;
    }
    if (stagesView instanceof ElysiaStatus) {
      return stagesView;
    }
    if (stagesView.problems.length > 0) {
      return problem(400, {
        code: "tracker-stages-unread",
        detail: `stages.md does not read, so no stage can follow its issue: ${stagesView.problems.join(" ")}`,
      });
    }
    const hold = holdOf(stagesView.stages);
    if (!hold) {
      return problem(400, {
        code: "tracker-no-hold",
        detail: noHoldWords(binding.provider),
      });
    }
    return {
      reads,
      binding,
      out: writerOf(binding),
      hold,
      outsiders: db.project(binding.projectId)?.outsiders ?? "hold",
      projectId: binding.projectId,
      states,
      stages: stagesView.stages,
      problems: new Map(),
    };
  };

  /** The tracker's states, as read within {@link STATES_MS} or read now. */
  const statesOf = async (
    binding: TrackerBindingRow,
    reads: Reads
  ): Promise<IssueState[] | TrackerProblem> => {
    const key = `${binding.projectId}\0${binding.watchId}`;
    const kept = statesRead.get(key);
    if (kept && Date.now() - kept.at < STATES_MS) {
      return kept.states;
    }
    const states = await reads.states();
    if (!(states instanceof ElysiaStatus)) {
      statesRead.set(key, { at: Date.now(), states });
    }
    return states;
  };

  /**
   * GitHub: the binding's Project as its board stream last read it (each
   * of the repository's issues on it, its Status field): the Status the
   * sync reads and writes. A Project not read yet, or one the connection
   * may not read, leaves Status alone; issues sync either way.
   */
  const openStatus = async (
    sync: Sync,
    retry: boolean
  ): Promise<Stopped | undefined> => {
    const { binding } = sync;
    const project = binding.githubProject;
    const board = binding.githubBoard;
    if (
      binding.provider !== "github" ||
      binding.githubProjectReason ||
      !project
    ) {
      return;
    }
    if (!project.fieldId) {
      sync.problems.set(
        "status",
        `${project.title} has no single-select field named Status: stages show on GitHub only as open and closed.`
      );
      return;
    }
    if (board?.projectId !== project.id) {
      return;
    }
    const read: ProjectRead = {
      complete: board.complete,
      fieldId: project.fieldId,
      items: new Map(Object.entries(board.items)),
      options: project.options,
      title: project.title,
      url: project.url,
    };
    sync.onProject = { fieldId: project.fieldId, project, read };
    return await statusesOwed(sync, retry);
  };

  /**
   * GitHub: each stage the hub has not yet made sure of a Status option for
   * on the binding's Project given one, as binding gives them
   * (tracker-github-project.ts `statusOptionsAdded`), the options it has
   * kept as they are; then named made, so it is never given one again. A
   * stage that has one by its name is named made with no call. GitHub's
   * refusal goes on the binding in its words, the other stages' Status
   * syncing, and is asked again on Sync now or after {@link RECHECK_MS}.
   * An inbound binding adds none.
   */
  const statusesOwed = async (
    sync: Sync,
    retry: boolean
  ): Promise<Stopped | undefined> => {
    const { binding, onProject, out } = sync;
    if (!(onProject && out)) {
      return;
    }
    const { project } = onProject;
    const made = madeOn(binding.githubStatusStages, project.id);
    const known = new Set(made.map(stageKey));
    const owed = sync.stages
      .map((stage) => stage.name)
      .filter((name) => !known.has(stageKey(name)));
    if (owed.length === 0) {
      return;
    }
    const madeNow: GithubStatusStages = {
      projectId: project.id,
      stages: [...made, ...owed],
    };
    const lacking = owed.filter(
      (name) => statusOptionFor(name, project) === null
    );
    if (lacking.length === 0) {
      sync.statusStages = madeNow;
      return;
    }
    const last = statusesAskedAt.get(binding.projectId) ?? 0;
    if (
      binding.githubStatusesRefused &&
      !retry &&
      Date.now() - last < RECHECK_MS
    ) {
      return;
    }
    statusesAskedAt.set(binding.projectId, Date.now());
    const added = await out.options(project, onProject.fieldId, lacking);
    if (added instanceof ElysiaStatus) {
      if (stopsSync(added)) {
        return added;
      }
      console.warn(
        `[tracker] ${binding.projectId}: ${project.title} kept no Status option for ${lacking.join(", ")}: ${added.response.detail}`
      );
      sync.statusesRefused = added.response.detail;
      return;
    }
    const withOptions: GithubProject = { ...project, options: added.options };
    onProject.project = withOptions;
    sync.projectRead = withOptions;
    sync.statusStages = madeNow;
    sync.statusesRefused = null;
    sync.statusesAdded =
      addedNow(binding.projectId, project, added.added) ?? undefined;
  };

  /** Each linked task on the board whose Status moved, that moved itself (on a binding that writes), or whose last round has a problem, made one record. */
  const reconcileLinks = async (
    sync: Sync,
    board: TaskSummary[],
    marked: Set<string>
  ): Promise<Stopped | undefined> => {
    const onBoard = new Map(board.map((task) => [task.id, task]));
    for (const link of db.trackers.links(sync.projectId)) {
      const task = onBoard.get(link.taskId);
      // An archived or deleted task stays as it was, and so does its issue.
      // GitHub moved its item's Status: the issue itself does not say so.
      const statusMoved =
        sync.onProject !== undefined &&
        !link.baseline.held &&
        remoteStatus(
          sync.onProject.read,
          link.issueKey,
          link.baseline.synced.status
        ) !== link.baseline.synced.status;
      // A change in CawCo has somewhere to go only when the binding writes.
      const touched =
        task !== undefined &&
        (link.problem !== null ||
          statusMoved ||
          (sync.out !== undefined &&
            (marked.has(link.taskId) ||
              task.updatedAt >
                (link.syncedAt?.getTime() ?? 0) - CLOCK_MARGIN_MS)));
      if (touched) {
        const stoppedBy = await reconcile(sync, link, undefined);
        if (stoppedBy) {
          return stoppedBy;
        }
      }
    }
  };

  /** Tasks filed since the binding (and since it turned `both`) with no issue yet (or one refused before), given theirs. */
  const fileNewIssues = async (
    sync: Sync,
    out: Outbound,
    board: TaskSummary[]
  ): Promise<Stopped | undefined> => {
    const bound = Math.max(
      sync.binding.boundAt.getTime() - CLOCK_MARGIN_MS,
      out.since
    );
    for (const task of board) {
      // A routine stays a CawCo file whatever the tracker (§5.2): never an issue.
      if (task.routine) {
        continue;
      }
      const link = db.trackers.link(sync.projectId, task.id);
      if (task.createdAt >= bound && !link) {
        const stoppedBy = await fileOrRelink(sync, out, task.id);
        if (stoppedBy) {
          return stoppedBy;
        }
      }
    }
  };

  /** A sync that stopped: the binding says why, and the tasks marked wait for the next. */
  const stopped = (
    binding: TrackerBindingRow,
    marked: ReadonlySet<string>,
    misfit: AnyProblem
  ): void => {
    const { code, detail } = misfit.response;
    if (code === "tracker-sign-in") {
      deps.connections.refusedBy(binding.connection, detail);
    }
    for (const id of marked) {
      dirtyOf(binding.projectId).add(id);
    }
    console.warn(`[tracker] ${binding.projectId}: ${detail}`);
    db.trackers.updateBinding(binding.projectId, {
      state: stateAfter(misfit, binding),
      problem: detail,
    });
  };

  /** A sync run's end: where the binding stands from its tasks' problems, and its Project as the run left it. */
  const finish = (sync: Sync): void => {
    db.trackers.updateBinding(sync.projectId, {
      ...outcomeOf(sync),
      ...projectAfter(sync),
    });
  };

  /**
   * One run of the sync's own, inside the project's turn: its sync opened,
   * `steps` run on it, and the binding written as it ended; answers the
   * problem that stopped it, said on the binding. A step that throws what
   * it was not written to answer stops the run in the error's words.
   */
  const run = async (
    binding: TrackerBindingRow,
    marked: ReadonlySet<string>,
    retry: boolean,
    steps: (sync: Sync) => Promise<Stopped | undefined>
  ): Promise<AnyProblem | undefined> => {
    try {
      const sync = await openSync(binding);
      if (sync instanceof ElysiaStatus) {
        stopped(binding, marked, sync);
        return sync;
      }
      const stoppedBy = (await openStatus(sync, retry)) ?? (await steps(sync));
      if (stoppedBy) {
        stopped(binding, marked, stoppedBy);
        return stoppedBy;
      }
      finish(sync);
    } catch (error) {
      const broke = problem(400, {
        code: "tracker-sync-broke",
        detail: wordsOf(error),
      });
      stopped(binding, marked, broke);
      return broke;
    }
  };

  /** Whether a mirror row is an issue of the binding's target. */
  const ofTarget = (binding: TrackerBindingRow, item: ItemRow): boolean =>
    item.kind === "issue" &&
    item.provider === binding.provider &&
    (binding.provider === "linear"
      ? item.host === "linear.app"
      : item.container === binding.target.toLowerCase());

  /** Whether a mirror row is an issue of the project's syncing watch (the door's routing table reads it). */
  const syncs = (projectId: string, itemId: string | null): boolean => {
    const binding = db.trackers.binding(projectId);
    const item = itemId ? db.intake.item(itemId) : undefined;
    return (
      binding !== undefined && item !== undefined && ofTarget(binding, item)
    );
  };

  /** The task that links a mirror row's item (its record task first); null when none does. */
  const taskOfItem = (projectId: string, itemId: string): string | null =>
    db.taskLinks.byItem(projectId, { itemId }, "any")[0]?.link.taskId ?? null;

  /**
   * Step 2 of the door's subscribers (intake.ts, provider spec §2.5): a
   * mirror row past what the sync took in. An issue of the syncing watch's
   * target that a task holds with the sync is reconciled with it, fed the
   * revision; one no task links, opened at or after the binding, is filed
   * as a task and linked; anything else is taken in as it is. With no
   * revision in hand (a hub that stopped mid-way), the issue is read now.
   * A run that stops short leaves the row to run again.
   */
  const revision = async (
    projectId: string,
    item: ItemRow,
    given: ItemRevision | undefined
  ): Promise<Synced | AnyProblem> => {
    const binding = db.trackers.binding(projectId);
    const row = db.intake.item(item.id) ?? item;
    const { version } = row;
    if (!(binding && ofTarget(binding, row)) || lifetime.closed()) {
      db.intake.synced(row.id, version);
      return { syncs: false, taskId: null, took: false };
    }
    if (version === null || row.syncedVersion === version) {
      return {
        syncs: true,
        taskId: taskOfItem(projectId, row.id),
        took: false,
      };
    }
    const done: { taskId: string | null } = { taskId: null };
    const stoppedBy = await run(binding, new Set(), false, (sync) =>
      takeIssue(
        sync,
        row,
        given?.version === version ? issueOfRevision(sync, given) : undefined,
        done
      )
    );
    if (stoppedBy) {
      return stoppedBy;
    }
    db.intake.synced(row.id, version);
    return { syncs: true, taskId: done.taskId, took: true };
  };

  /**
   * One issue of the syncing watch's target taken in: reconciled with the
   * task that holds it with the sync, else, when no task links it and it
   * was opened at or after the binding, filed as a task. `done` says the
   * task it is about.
   */
  const takeIssue = async (
    sync: Sync,
    row: ItemRow,
    fed: Issue | undefined,
    done: { taskId: string | null }
  ): Promise<Stopped | undefined> => {
    const { projectId, binding } = sync;
    const link = linkOfItem(projectId, row.id);
    if (link) {
      done.taskId = link.taskId;
      return await reconcile(sync, link, fed);
    }
    done.taskId = taskOfItem(projectId, row.id);
    if (done.taskId !== null) {
      // A task links it already (its record outside the sync, or a related link): no task is filed.
      return;
    }
    const issue = fed ?? (await readIssue(sync, row));
    if (issue instanceof ElysiaStatus) {
      return issue;
    }
    if (issue && issue.createdAt >= binding.boundAt.getTime()) {
      done.taskId = (await fileTask(sync, issue)) ?? null;
    }
  };

  /** A mirror row's issue read now, into the mirror through the door; null when it is gone or cannot be read, the problem when it stops the sync. */
  const readIssue = async (
    sync: Sync,
    row: ItemRow
  ): Promise<Issue | null | Stopped> => {
    const key = sync.binding.provider === "github" ? row.key : row.externalId;
    const read = key ? await sync.reads.issue(key) : null;
    if (read instanceof ElysiaStatus) {
      return stopsSync(read) ? read : null;
    }
    const issue = read && issueOfRevision(sync, read);
    if (issue) {
      storeOwn(sync.projectId, [issue]);
    }
    return issue;
  };

  /**
   * A board read of the project's syncing watch (its `board:` stream,
   * providers github/board.ts), in the project's turn: a Project read
   * takes its title, field and options and every issue's Status, the
   * connection's refusal its words, a refused binding that reads now its
   * Project; then each linked task whose Status moved is reconciled.
   */
  const boardRead = (
    projectId: string,
    watchId: string,
    read: BoardRead
  ): Promise<void> => {
    const binding = db.trackers.binding(projectId);
    if (binding?.watchId !== watchId || binding.provider !== "github") {
      return Promise.resolve();
    }
    const bound = binding.githubProject;
    switch (read.kind) {
      case "refused":
        db.trackers.updateBinding(projectId, {
          githubProjectReason: read.words,
        });
        return Promise.resolve();
      case "none":
        db.trackers.updateBinding(projectId, {
          githubProject: null,
          githubProjectReason: null,
          githubBoard: null,
        });
        return Promise.resolve();
      case "read":
        break;
    }
    if (bound && bound.id !== read.id) {
      // A read of a Project the binding no longer names.
      return Promise.resolve();
    }
    const project: GithubProject = {
      id: read.id,
      number: read.number,
      title: read.title,
      url: read.url || bound?.url || "",
      fieldId: read.fieldId,
      options: read.options,
    };
    db.trackers.updateBinding(projectId, {
      githubProject: project,
      githubProjectReason: null,
      githubBoard: {
        projectId: read.id,
        complete: read.complete,
        items: read.items,
      },
    });
    const fresh = db.trackers.binding(projectId);
    return fresh
      ? run(fresh, new Set(), false, async (sync) => {
          const list = await tasks.list(projectId);
          return list instanceof ElysiaStatus
            ? list
            : await reconcileLinks(sync, list.tasks, new Set());
        }).then(() => undefined)
      : Promise.resolve();
  };

  /**
   * The sync's own pass over the project, in its turn: each linked task
   * changed in CawCo (on a binding that writes), whose Status moved, or
   * whose last round had a problem, made one record with its issue; then,
   * on a binding that writes, each task filed since with no issue given
   * one. Runs on a task change and on Sync now (`retry`, which asks
   * refused Status options again at once).
   */
  const syncProject = (projectId: string, retry = false): Promise<void> =>
    turn(projectId, async () => {
      const binding = db.trackers.binding(projectId);
      if (!binding || lifetime.closed()) {
        return;
      }
      const marked = dirty.get(projectId) ?? new Set<string>();
      dirty.delete(projectId);
      const stoppedBy = await run(binding, marked, retry, async (sync) => {
        const list = await tasks.list(projectId);
        if (list instanceof ElysiaStatus) {
          return list;
        }
        const reconciled = await reconcileLinks(sync, list.tasks, marked);
        if (reconciled) {
          return reconciled;
        }
        // An inbound binding files no issue: its tasks stay in CawCo.
        return sync.out
          ? await fileNewIssues(sync, sync.out, list.tasks)
          : undefined;
      });
      if (stoppedBy) {
        console.info(
          `[tracker] ${projectId}: its pass stopped short (said on the binding); ${marked.size} task${marked.size === 1 ? "" : "s"} changed wait for the next`
        );
      }
    });

  /** A sync of the project half a second from now: a burst of changes is one. */
  const syncSoon = (projectId: string): void => {
    if (soon.has(projectId) || lifetime.closed()) {
      return;
    }
    soon.set(
      projectId,
      lifetime.after("tracker sync soon", SOON_MS, () => {
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

  // A task changed in CawCo: its project syncs soon. The sync's own writes
  // are not sent back, and an inbound binding sends nothing: the door alone
  // brings the tracker's changes in.
  tasks.listen((event) => {
    const binding = db.trackers.binding(event.projectId);
    if (!binding || binding.direction === "inbound" || ownEvent(event)) {
      return;
    }
    if (event.id) {
      dirtyOf(event.projectId).add(event.id);
    }
    syncSoon(event.projectId);
  });

  /** A connection by its name, or the route's refusal in its words (tracker-connection-unknown). */
  const connectionNamed = (name: string) => {
    try {
      return deps.connections.get(name);
    } catch (error) {
      return problem(400, {
        code: "tracker-connection-unknown",
        detail: wordsOf(error),
      });
    }
  };

  /**
   * Binds a project: the target read first through the connection (its
   * refusal in words, nothing bound), then a first sync. The same target
   * bound again keeps its links. `cawco` lets the binding go: the files stay,
   * each naming its issue, and nothing syncs.
   */
  /** Why a project takes no binding: the hub keeps none such, or it is the Fleet project, which holds work tied to no one project (D31). */
  const unbindable = (projectId: string) => {
    if (!db.project(projectId)) {
      return problem(400, {
        code: "tracker-project-unknown",
        detail: `The hub keeps no project ${projectId}.`,
      });
    }
    if (isFleetProject(projectId)) {
      return problem(400, {
        code: "tracker-fleet-project",
        detail:
          "The Fleet project holds work tied to no one project, so it is bound to no tracker.",
      });
    }
  };

  const bind = async (projectId: string, input: BindInput) => {
    const unfit = unbindable(projectId);
    if (unfit) {
      return unfit;
    }
    if (input.tracker === "cawco") {
      await turn(projectId, () => {
        db.trackers.unbind(projectId);
        return Promise.resolve();
      });
      console.info(`[tracker] ${projectId}: back to CawCo's files alone`);
      return view(projectId);
    }
    const asked = askedOf({ ...input, tracker: input.tracker });
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    // Nothing is bound where the tracker's unvouched issues could not wait for you.
    const staged = await tasks.stages(projectId);
    if (staged instanceof ElysiaStatus) {
      return staged;
    }
    if (!holdOf(staged.stages)) {
      return problem(400, {
        code: "tracker-no-hold",
        detail: noHoldWords(asked.tracker),
      });
    }
    const connection = connectionNamed(asked.connection);
    if (connection instanceof ElysiaStatus) {
      return connection;
    }
    if (appServiceOf(connection.service) !== asked.tracker) {
      return problem(400, {
        code: "tracker-connection-kind",
        detail: `${asked.connection} is a ${connection.service} connection; ${TRACKER_NAMES[asked.tracker]} needs a ${asked.tracker} one.`,
      });
    }
    const now = new Date();
    const draft: TrackerBindingRow = {
      watchId: crypto.randomUUID(),
      projectId,
      provider: asked.tracker,
      connection: asked.connection,
      target: asked.target,
      targetName: asked.target,
      targetUrl: "",
      boundAt: now,
      direction: asked.direction,
      directionAt: null,
      state: "syncing",
      reason: null,
      problem: null,
      polledAt: null,
      resumeAt: null,
      githubBoard: null,
      githubProject: null,
      githubProjectReason: null,
      githubStatusStages: null,
      githubStatusesAdded: null,
      githubStatusesRefused: null,
    };
    const read = await targetOf(
      draft,
      connection.auth === "app",
      input.githubProject,
      staged.stages.map((stage) => stage.name)
    );
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const { target, onProject } = read;
    const was = db.trackers.binding(projectId);
    const kept = keptOf(was, { ...draft, target: target.id });
    // The same target's direction changed just now, dated: from inbound to both.
    const turnedBoth =
      asked.direction === "both" &&
      kept.directionAt !== undefined &&
      kept.directionAt !== was?.directionAt;
    await turn(projectId, async () => {
      db.trackers.bind({
        ...draft,
        target: target.id,
        targetName: target.name,
        targetUrl: target.url,
        ...onProject,
        githubStatusStages: stagesKept(was, onProject),
        githubStatusesAdded: addedKept(was, onProject),
        ...kept,
      });
      // Another Project's options are other ids: what the links agreed on Status starts again.
      if (was?.githubProject?.id !== onProject.githubProject?.id) {
        db.trackers.forgetStatus(projectId);
      }
      if (turnedBoth) {
        await settleTurned(projectId);
      }
    });
    console.info(
      `[tracker] ${projectId} bound to ${target.name} through ${asked.connection}`
    );
    await syncProject(projectId);
    return view(projectId);
  };

  /** A binding's target as its connection reads it, and on GitHub its Project; a problem in words. */
  const targetOf = async (
    draft: TrackerBindingRow,
    asApp: boolean,
    asked: BindInput["githubProject"],
    stages: readonly string[]
  ) => {
    const reads = readsOf(draft);
    const out = writerOf(draft);
    // A GitHub App that may only read issues would be refused on every
    // sync that writes: it is refused here, with what to grant on GitHub.
    // An inbound binding only reads.
    if (draft.provider === "github" && asApp && out) {
      const granted = await signedIn(() =>
        deps.connections.githubAppPermissions(draft.connection)
      );
      if (granted instanceof ElysiaStatus) {
        return granted;
      }
      if (granted.permissions.issues !== "write") {
        return problem(400, {
          code: "tracker-app-reads-only",
          detail: connectionsWords.appReadsIssuesOnly(granted.slug),
        });
      }
    }
    const target = await reads.describe();
    if (target instanceof ElysiaStatus) {
      return target;
    }
    const onProject =
      draft.provider === "github"
        ? await projectOf(draft.connection, target.id, asked, stages, out)
        : NO_PROJECT;
    return onProject instanceof ElysiaStatus
      ? onProject
      : { target, onProject };
  };

  /**
   * The Project a GitHub binding's stages show on: the one asked for, else
   * (left out) the first linked to the repository, each stage on the Status
   * option named as it, ignoring case (core `statusOptionFor`). A stage
   * whose name no option carries has one added on GitHub as it binds
   * (tracker-github-project.ts `statusOptionsAdded`), every option it had
   * kept with its items, and every stage is named made on it
   * (`statusesOwed`); GitHub's refusal of that refuses the binding in its
   * words, so the person can pick no Project or grant what it needs. A
   * connection that may not read the owner's Projects binds with none,
   * GitHub's words kept. Answers the binding's Project columns, the
   * options it added among them. With no `out` (an inbound binding, or a
   * permission asked again) it adds none and names no stage made.
   */
  const projectOf = async (
    connection: string,
    repo: string,
    asked: BindInput["githubProject"],
    stages: readonly string[],
    out: Outbound | undefined
  ) => {
    const octokit = await signedIn(() =>
      deps.connections.githubClient(connection)
    );
    if (octokit instanceof ElysiaStatus) {
      return octokit;
    }
    const listed = await githubProjects(octokit, repo);
    if (listed instanceof ElysiaStatus) {
      return listed;
    }
    const none: OnProject = {
      ...NO_PROJECT,
      githubProjectReason: listed.refused ?? null,
    };
    if (listed.refused || asked === null) {
      return none;
    }
    const chosen = projectChosen(listed, asked);
    if (chosen === undefined) {
      return problem(400, {
        code: "tracker-github-project-unknown",
        detail: `${connection} reaches no open GitHub Project ${asked?.id} for ${repo}: pick one it lists.`,
      });
    }
    if (!chosen) {
      return none;
    }
    const statuses =
      out && chosen.fieldId
        ? await out.options(chosen, chosen.fieldId, stages)
        : { added: [], options: chosen.options };
    if (statuses instanceof ElysiaStatus) {
      return problem(400, {
        code: "tracker-github-statuses",
        detail: statuses.response.detail,
      });
    }
    const onProject: OnProject = {
      githubProject: {
        id: chosen.id,
        number: chosen.number,
        title: chosen.title,
        url: chosen.url,
        fieldId: chosen.fieldId,
        options: statuses.options,
      },
      githubProjectReason: null,
      // With no Status field there is nothing made: the sync says so, and
      // a field made since takes every stage's option.
      githubStatusStages:
        out && chosen.fieldId
          ? { projectId: chosen.id, stages: [...stages] }
          : null,
      githubStatusesAdded: addedNow(repo, chosen, statuses.added),
      githubStatusesRefused: null,
    };
    return onProject;
  };

  /** The Projects a GitHub connection reaches for a repository, for the binding's choice; GitHub's words when it may not read them. */
  const githubProjectsOf = async (name: string, repo: string) => {
    const connection = connectionNamed(name);
    if (connection instanceof ElysiaStatus) {
      return connection;
    }
    if (appServiceOf(connection.service) !== "github") {
      return problem(400, {
        code: "tracker-connection-kind",
        detail: `${name} is a ${connection.service} connection: GitHub Projects need a GitHub one.`,
      });
    }
    const octokit = await signedIn(() => deps.connections.githubClient(name));
    if (octokit instanceof ElysiaStatus) {
      return octokit;
    }
    const reachable: GithubProjectsView | TrackerProblem = await githubProjects(
      octokit,
      repo
    );
    return reachable;
  };

  /** The repositories or teams a connection reaches, for the binding's choice. */
  const targets = async (name: string, search?: string) => {
    const connection = connectionNamed(name);
    if (connection instanceof ElysiaStatus) {
      return connection;
    }
    const service = appServiceOf(connection.service);
    if (!service) {
      return problem(400, {
        code: "tracker-connection-kind",
        detail: `${name} is a ${connection.service} connection: a tracker is GitHub Issues or Linear.`,
      });
    }
    if (service === "github") {
      const octokit = await signedIn(() => deps.connections.githubClient(name));
      return octokit instanceof ElysiaStatus
        ? octokit
        : await settle(
            githubSync.targets(octokit, REQUEST_MS, {
              app: connection.auth === "app",
              ...(search === undefined ? {} : { search }),
            })
          );
    }
    const client = await signedIn(() => deps.connections.linearClient(name));
    return client instanceof ElysiaStatus
      ? client
      : await settle(linearSync.targets(client, REQUEST_MS, { app: false }));
  };

  lifetime.onClose(() => {
    for (const timer of soon.values()) {
      lifetime.cancel(timer);
    }
  });

  return {
    bind,
    githubProjects: githubProjectsOf,
    targets,
    view,
    /** The door's step 2 (intake.ts): a revision, a board read, and whether an item is the syncing watch's. */
    subscriber: { board: boardRead, revision, syncs },
    /**
     * Syncs a project now: its syncing watch read at once through the door
     * (a refused board asked again), what that read brought taken in, then
     * the sync's own pass in its turn; answers where it stands after.
     */
    sync: async (projectId: string) => {
      if (!db.project(projectId)) {
        return problem(400, {
          code: "tracker-project-unknown",
          detail: `The hub keeps no project ${projectId}.`,
        });
      }
      await deps.pollNow(projectId);
      await syncProject(projectId, true);
      return view(projectId);
    },
  };
};

export type Trackers = ReturnType<typeof createTrackers>;

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
          /** Which way it syncs: `inbound` brings issues in as tasks and writes nothing to the tracker; left out, `both`. */
          direction: t.Optional(
            t.Union([t.Literal("both"), t.Literal("inbound")])
          ),
          /** GitHub: the Project whose Status carries the stages, each on the option named as it (one added where none is); null for none; left out, the first linked to the repository. */
          githubProject: t.Optional(
            t.Union([t.Null(), t.Object({ id: t.String() })])
          ),
        }),
      },
      ({ params, body }) => trackers.bind(params.id, body)
    )
    .post("/api/projects/:id/tracker/sync", ({ params }) =>
      trackers.sync(params.id)
    )
    .get(
      "/api/connections/:name/targets",
      { query: t.Object({ search: t.Optional(t.String()) }) },
      ({ params, query }) => trackers.targets(params.name, query.search)
    )
    .get(
      "/api/connections/:name/github-projects",
      { query: t.Object({ repo: t.String() }) },
      ({ params, query }) => trackers.githubProjects(params.name, query.repo)
    );
