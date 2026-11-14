/**
 * The dispatcher, part 1 (§5.3 of the Projects spec): what turns a project's
 * tasks into running work.
 *
 * - **An attempt** at a task is a work item (work-items.ts): a delegate
 *   session in a new workspace cut at the project's place for its work
 *   (work-place.ts: a checkout on a machine that is online, else, for a
 *   project with no checkout, its folder on the hub), briefed from the task file (title, description,
 *   acceptance criteria, open to-dos, checks, and where it sits among its
 *   edges), with `work_items.task_id` naming the task. It runs the task's
 *   own `type:`, else the type the stage it enters `runs:`, else the
 *   judged one (spec §5.1: "the task names one → that type; else the
 *   dispatcher asks"; {@link typeOf}). Starting one moves the task to its
 *   active stage (the stage that runs it, else the first of kind
 *   `active`), as `hub`.
 * - **Who it reports to.** A work item needs a parent session. `task_start`,
 *   or `delegate` naming the task, from any session of the project that
 *   orchestrates (`parentProblem`: a worker, or a delegate that may start
 *   any type) makes that session the parent; the
 *   project's conversation, Caw (caw.ts), takes the reports of every attempt
 *   nobody asked for, its session started for the first one while Caw is
 *   on. With Caw off there is no conversation to take them: such an attempt
 *   does not start.
 * - **The frontier** (tasks.ts `onFrontier`): the ready tasks (in a `todo`
 *   stage, every wait of theirs and their `part_of` chain settled, no live
 *   attempt, no coordinator holding them; task-waits.ts settles each) that
 *   have no parts, whose last attempt neither failed nor was stopped, in
 *   rank order.
 * - **Coordinators.** A whole (a task with parts) is never dispatched as a
 *   plain worker. Started by you or a session, its attempt is a
 *   coordinator: it may delegate, its brief lists its parts, and it starts
 *   and steers them with task_start; while it is live the hub starts none of
 *   them. The whole closes once every part is done and its coordinator has
 *   reported; one nobody coordinates closes on its own when its last part
 *   is done (tasks.ts `closeWhole`).
 * - **Witnesses.** An attempt keeps each card and pin its task waits on, its
 *   own and its chain's, with the value it settled with
 *   (`work_items.waited_on`): a card answered differently since tells its
 *   live session once, and a done task shows it was built on it. A failed or
 *   stopped attempt is its starter's business: its report goes to the
 *   session that started it, the project's conversation for the dispatcher's own (work-items
 *   `reportees`), who retries it or moves on. It never waits for the person,
 *   and only a person's own start's failure reaches his phone (push.ts).
 * - **Dispatch** starts the frontier on its own, only for a project with
 *   dispatch and Caw on, up to `max_attempts` live attempts, and not while
 *   `review_limit` tasks or more wait in `you` stages.
 * - **Hooks.** A task entering an `active` stage with `runs: <type>`, by
 *   anyone's move but the hub's own (a move the tracker sync brings from
 *   GitHub or Linear is the person's who made it there: tracker.ts holds
 *   back the issues of openers the tracker does not vouch for), or filed
 *   straight into one, starts an
 *   attempt (of the task's own type when it names one, else that type),
 *   reporting to the session that moved it or else the project's conversation. A start that
 *   cannot go, the conversation's own start among them, is remembered on the task
 *   and shown on its card. A hook obeys `max_attempts`: at the cap its start is queued
 *   (`queued_task_starts`) and runs, oldest first and before the frontier,
 *   as a slot frees. A start you or a session ask for is not capped.
 * - **Nothing on it.** No task sits in an `active` stage with nothing
 *   working on it (stages.ts `nobodyProblem`): a move or filing into one
 *   that nothing would work is refused (tasks.ts `refuseNobody`); in a
 *   project that dispatches, it starts an attempt as a hook does, not
 *   capped; and one whose start cannot go goes on to its todo stage as the
 *   hub. The tracker's moves are a person's work elsewhere, held by none of
 *   this.
 * - **Where it runs** (runs-on.ts, work-place.ts). An attempt is cut only on
 *   a machine its task's `runs_on:` names, else its project's: a machine, or
 *   a capability such as `apple`, read from the OS each agent reports. With
 *   none online holding the project's place (a checkout, or for a project
 *   with no checkout its folder on the hub), the start is refused, saying
 *   what it needs, and is never placed elsewhere; a retry's old workspace on
 *   another machine is passed over. Neither set, it starts at the project's
 *   place wherever that is online.
 * - **Landing.** An attempt lands as its task says (`lands:`), else as its
 *   delegate type says, else as the project does: `main`, `branch`, `pr` or
 *   `none` (work-items.ts). Its task's `outputs` are collected into the
 *   project's folder.
 * - **Briefed by a session.** `delegate` naming a task (`AttemptAsk`) is an
 *   attempt like any: its brief is the caller's words above the task file,
 *   its settings go over the task's, and it starts, queues, moves its task
 *   and lands as task_start's does.
 * - **The landing result.** An attempt that ends done (landed, or nothing to
 *   land) moves its task to the first `done` stage, or, when it opened a pull
 *   request, to the first `you` stage (staying put without one) until the
 *   pull request merges ({@link Dispatcher.pullRequestMerged}); one that
 *   fails or is cancelled sends it back to the first `todo` stage, marked as
 *   failed or stopped (tasks.ts `TaskFlags`). The move names the commit its
 *   work landed as (`landedAs`), so the task's history shows it.
 * - **A retry** of a task whose last attempt failed or was stopped runs a fresh session in
 *   that attempt's workspace when its clone is still there (else a new one),
 *   briefed with the failure and the to-dos as they stand; the failed
 *   attempt's session is stopped first (work-items.ts). Queued for owned
 *   files, it is still a retry when it starts.
 * - **Groups, owned files, budgets** (slice 7b). A task's `group:` puts its
 *   attempts in that group under their parent (one combined report); its
 *   `owns:` globs keep an attempt from running beside a live item that owns
 *   overlapping files — such a start is queued (`queued_task_starts`, why
 *   `owns`) and tried again as items end; its `budget:`, else the project's,
 *   is what the attempt may spend (work-items.ts).
 *
 * - **Judgments** (§5.9, jev-placement.ts), each by Jev while it is on and
 *   by the table's Jev-off rule otherwise. Ready to dispatch: a frontier
 *   task starts only when Jev scores it ready, else when the project's conversation marked it
 *   `ready: yes`; a task triaged as anything but `ready-for-agent` never.
 *   Dispatch order: Jev's three scores, else the conversation's ranks, else board
 *   order. Delegate type: a task whose stage runs none and that names none
 *   runs Jev's choice from the project's catalog, else "medium". Judged
 *   checks: an attempt that lands at a task with acceptance criteria moves
 *   it to done only when Jev shows every criterion met (else to the first
 *   `you` stage, with a comment naming what is not); Jev off, the project's conversation
 *   judges them (the task stays until it moves it), and with events off
 *   it goes to you.
 *
 * It wakes on events only: a work item ending, a task changing, a setting
 * changing, a machine with a checkout coming online. A slow timer looks
 * again as a safety net and starts nothing when nothing is ready.
 */
import { ANY_TYPE } from "@cawco/core/delegate-types";
import {
  artifactName,
  deliverableKind,
  POST_OUTPUT_RULE,
} from "@cawco/core/deliverables";
import { detach } from "@cawco/core/detach";
import type { LandsMode } from "@cawco/core/injected";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  markdownLink,
  sessionLink,
  taskLink,
  todoLink,
} from "@cawco/core/references";
import type {
  AttemptStart,
  Stage,
  TaskSummary,
  WaitWitness,
} from "@cawco/core/task-views";
import type { StageKind, TaskMover } from "@cawco/core/views";
import { judgedWords } from "@cawco/core/words/judged";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { Caw } from "./caw";
import type { DbShape } from "./db";
import type { WorkItemRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { Origin } from "./db/schema";
import type { WorkBudget } from "./db/stored-types";
import { needsDesignSystem } from "./design-offers";
import type { designSection as designSectionOf } from "./design-system";
import type { JevAccess } from "./jev";
import {
  DISPATCH_ASKED_MAX,
  type DispatchJudgement,
  JevFailed,
  jevDispatch,
  jevJudged,
  jevType,
  offLine,
  readyByRule,
  TRIAGE_FIELD,
  tailOf,
} from "./jev-placement";
import type { HubLifetimeShape } from "./lifetime";
import type { Memory } from "./memory";
import type { ProblemsOf } from "./refusal";
import { orchestrates } from "./roles";
import { fits, type MachineFacts, runsOnValue } from "./runs-on";
import { moveProblem, waitingStageOf } from "./stages";
import { criteriaOf, type TaskComment } from "./task-file";
import {
  BUDGET,
  hubActor,
  onFrontier,
  type TaskActor,
  type TaskEvent,
  type Tasks,
  type TaskView,
} from "./tasks";
import { isLive } from "./work-item-state";
import {
  type CloneRef,
  DEFAULT_DELEGATE_TYPE,
  SESSION_TITLE_MAX,
  type WorkItemRequest,
  type WorkItemStart,
  type WorkItems,
} from "./work-items";
import { budgetProblem } from "./work-limits";
import { capitalized, type WorkAsk, type WorkPlace } from "./work-place";

/** What the dispatcher needs of the hub. */
export interface DispatchDeps {
  /**
   * The fleet's briefing guidance the session that wrote an attempt's
   * brief (a `delegate` naming the task) has yet to read for the delegate
   * it starts, recorded as handed (work-items.ts `briefing`); nothing when
   * it has read it.
   */
  readonly briefing: (
    request: WorkItemRequest
  ) => ReturnType<WorkItems["briefing"]>;
  /**
   * The brief's project context for an attempt at `task` (memory.ts
   * `contextFor`): AGENTS.md and the knowledge files it needs, or "". The
   * folder's problem is passed up.
   */
  readonly context: Memory["contextFor"];
  /**
   * The project's conversation, started now if it has none (caw.ts
   * `conversationFor`): for your ask on or off, for the dispatcher's own
   * (`event`) only while its switch is on; undefined otherwise. The attempts
   * the hub starts report to it, as any delegate's do to its parent.
   */
  readonly conversationFor: (
    projectId: string,
    by: Origin
  ) => ReturnType<Caw["conversationFor"]>;
  readonly db: Pick<
    DbShape,
    | "accounts"
    | "dropQueuedTaskStart"
    | "getInstancesByIds"
    | "listAgents"
    | "listProjects"
    | "project"
    | "projectAttempts"
    | "queuedTaskStarts"
    | "queueTaskStart"
    | "markAttemptUnmet"
    | "setProjectDispatch"
    | "workItemByPrUrl"
  >;
  /**
   * The brief's `## Design system` section, read from the attempt's clone
   * (design-system.ts `designSection`): "" when the clone's design/ holds
   * no guide (SKILL.md or DESIGN.md); its problem when the clone's
   * design/ could not be read. Asked only for a task that needs the system
   * (design-offers.ts `needsDesignSystem`).
   */
  readonly designSection: (
    clone: CloneRef
  ) => Promise<string | ProblemsOf<ReturnType<typeof designSectionOf>>>;
  /** Runs the safety net until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /**
   * Why the project's attempts are held back by its spend cap now, or
   * nothing (project-caps.ts `pauses`): the dispatcher then starts none, as
   * for a paused project.
   */
  readonly pauses: (projectId: string) => string | undefined;
  /** What the dispatcher's judgments (§5.9) need of the hub. */
  readonly placement: {
    /**
     * Jev off and events on: his wake to judge a landed attempt's
     * acceptance criteria (he did not do the work).
     */
    readonly judgeByLead: (
      projectId: string,
      task: { id: string; title: string },
      item: WorkItemRow,
      text: string
    ) => void;
    /** Jev's route while Jev is on (jev.ts `jevAccess`). */
    readonly access: () => JevAccess | undefined;
    /** The delegate types a session of the project may name. */
    readonly typesFor: (
      projectId: string
    ) => { description: string; name: string }[];
  };
  /** Files and spawns a work item (work-items.ts `start`). */
  readonly start: (request: WorkItemRequest) => ReturnType<WorkItems["start"]>;
  readonly tasks: Tasks;
  /**
   * How a delegate type lands its work, when it says. Fleet delegate types
   * do not; a project's own (`delegates/*.md`, §5.1) will, through this.
   */
  readonly typeLands?: (
    projectId: string,
    type: string
  ) => LandsMode | undefined;
  /** Where the project's work runs now (work-place.ts `workPlace`). */
  readonly workPlace: (project: ProjectRow, ask?: WorkAsk) => WorkPlace;
}

/**
 * What a `delegate` call that names its task asks of the attempt over the
 * task file: its brief, which the attempt's brief carries above the task
 * file, its name, and how it runs. Where the attempt runs is the task's
 * (`runs_on`, the project's place for its work), so it names no machine, folder or
 * workspace.
 */
export type AttemptAsk = Pick<
  WorkItemRequest,
  | "prompt"
  | "title"
  | "account"
  | "budget"
  | "fork"
  | "from"
  | "group"
  | "harness"
  | "inputs"
  | "lands"
  | "mayStart"
  | "model"
  | "outputs"
  | "owns"
  | "skills"
  | "type"
>;

/** How an attempt starts ({@link Dispatcher.startAttempt}); each left out, as a plain task_start. */
export interface AttemptHow {
  /** What a `delegate` naming the task asked over its task file. */
  asked?: AttemptAsk;
  /** Whose work it is (work-items `origin`); left out, its parent's. */
  origin?: Origin;
  /** A retry of its failed or stopped last attempt. */
  retry?: boolean;
  /** The active stage a hook started it from. */
  stage?: Stage;
}

/** A project's dispatch: its settings, and what the dispatcher would do now. */
export interface DispatchView {
  /** What an attempt may spend where its task and its delegate call say nothing; null: no limit. */
  budget: WorkBudget | null;
  /** The project's Caw session, once the hub has started one. */
  conversationInstanceId: string | null;
  /** Whether the hub starts attempts at ready tasks on its own. */
  dispatch: boolean;
  /** The tasks it would start next, in order. */
  frontier: string[];
  /** Where an attempt lands when its task and type say nothing. */
  lands: LandsMode;
  /** Attempts starting or running now. */
  live: number;
  maxAttempts: number;
  /** Why it would start nothing now even with a ready task; null when it would. */
  paused: string | null;
  /** Tasks whose `runs:` hook start waits for a slot, oldest first. */
  queued: string[];
  /** Tasks waiting in `you` stages now. */
  review: number;
  reviewLimit: number;
  /** Where an attempt runs when its task says nothing (runs-on.ts); null: any machine with a checkout. */
  runsOn: string | null;
}

/** A change to a project's dispatch settings; what is left out stays. */
export interface DispatchChange {
  /** The project's default budget; null clears it. */
  budget?: WorkBudget | null;
  dispatch?: boolean;
  /** Where an attempt lands when its task and type say nothing. */
  lands?: LandsMode;
  maxAttempts?: number;
  reviewLimit?: number;
  /** Where an attempt runs when its task says nothing: a machine, or a capability like `apple`; null clears it. */
  runsOn?: string | null;
}

/** What a start nobody can take the report of says to do. */
/**
 * Whose work a hook's attempt is, by who moved its task in: yours for your
 * move or an action you approved; an event's for a routine's or the hub's;
 * a session's or Caw's, its parent's (work-items `origin`).
 */
const HOOK_ORIGIN: Record<TaskMover, Origin | undefined> = {
  you: "you",
  action: "you",
  routine: "event",
  hub: "event",
  session: undefined,
};

const NO_LEAD =
  "Turn the project's events on so its conversation takes the report, name a session of the project that orchestrates, or start it with task_start from one.";

/** How often the dispatcher looks again with no event: a safety net, not a loop. */
const SAFETY_MS = 5 * 60_000;
const MAX_ATTEMPTS_LIMIT = 20;
const REVIEW_LIMIT_LIMIT = 100;

const short = (id: string): string => id.slice(0, 8);

/** How long a commit is named in a task's history: git's own short form for a large repository. */
const SHA_SHOWN = 9;

/**
 * The commit an attempt's work landed as, as its task's move names it: on
 * its base branch, or pushed to a branch of its own; "" when nothing of it
 * landed (work_items.landed).
 */
const landedAs = (item: Pick<WorkItemRow, "landed">): string => {
  if (!item.landed) {
    return "";
  }
  const sha = item.landed.sha.slice(0, SHA_SHOWN);
  return item.landed.onto ? `; landed ${sha}` : `; pushed ${sha}`;
};

/**
 * What an attempt's acceptance criteria are judged over: its finish_item
 * report with how it landed, then its hand-in on the task (task_result: what
 * it did, what to check, what it made), last so a report cut to its end
 * keeps it. Before, Jev read the finish_item report alone and found none of
 * a design build's four criteria shown (0.07 to 0.32, nightly 3944): the
 * sourced tokens and DESIGN.md's answers were said only in its task_result.
 */
const attemptReport = (item: WorkItemRow): string => {
  const report = (item.digest ?? item.result ?? "").trim();
  const handIn = item.taskResult;
  if (!handIn) {
    return report;
  }
  return [
    report,
    `The attempt's hand-in on the task:\n\n${handIn.summary.trim()}`,
    ...(handIn.check.length > 0
      ? [
          `What to check:\n${handIn.check.map((line) => `- ${line}`).join("\n")}`,
        ]
      : []),
    ...(handIn.artifacts.length > 0
      ? [
          `What it made:\n${handIn.artifacts.map((each) => `- ${artifactName(each)}`).join("\n")}`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n\n");
};

/** How a session is named in a sentence. */
const named = (row: InstanceRow): string =>
  `“${row.title?.trim() || row.derivedTitle?.trim() || `session ${short(row.id)}`}”`;

/**
 * The one rule for who takes a project's reports: why `row` cannot take an
 * attempt's for `projectId` (as its conversation, as the session starting it
 * with task_start or `delegate` naming the task, or as the session that
 * moved its task in), or undefined when it can. It must be a session of that
 * project that orchestrates (roles.ts `orchestrates`): a worker, or a
 * delegate that may start any type, a coordinator's attempt among them. A
 * leaf's reports go to the session that started it, and it takes none.
 */
const parentProblem = (
  row: InstanceRow | undefined,
  projectId: string,
  id = ""
): string | undefined => {
  if (!row) {
    return `There is no session ${id} on this hub any more.`;
  }
  if (row.projectId !== projectId) {
    return `${named(row)} is not a session of this project.`;
  }
  if (!orchestrates(row)) {
    return `${named(row)} is a leaf (it may not start a delegate of any type), so its reports go to the session that started it; it starts no attempt and takes none of a project's reports.`;
  }
};

/**
 * A task check written to run outside every boundary: its command opens with
 * `host:`, as `host: bun x`. No attempt can run it
 * inside its workspace.
 */
const HOST_CHECK = /^host:\s*/u;

/**
 * The brief's line for one task check: the command to run and quote, or a
 * `host:` one as what the attempt lists under "Not run".
 */
const checkLine = (written: string): string => {
  const command = written.replace(HOST_CHECK, "");
  return command === written
    ? `- \`${command}\``
    : `- \`${command}\`: marked host, so it cannot run inside your boundary; list it under "Not run:" for whoever runs it on the host.`;
};

/**
 * The brief's checks section: the task's checks are commands the attempt
 * runs itself and quotes in its report (finish_item's `summary`), never
 * something the hub runs; the hub runs only its merge checks.
 */
const checksSection = (task: TaskView): string =>
  task.checks.length > 0
    ? `## Checks\n\nThe task lists these commands. Run each one and quote its real output in your finish_item summary, cut to the lines that show the result; list any you could not run inside your boundary under "Not run:", with why.\n\n${task.checks.map(checkLine).join("\n")}`
    : "## Checks\n\nThe task lists no commands. Prove the work with the commands that show it (build, lint, typecheck, the specs it touches), and quote their real output in your finish_item summary.";

/** The cards and pins a task waits on, its own and its chain's, with the value each settled with now: the attempt's witnesses. */
const witnessesOf = (task: TaskView): WaitWitness[] =>
  task.waits.flatMap((wait) =>
    (wait.kind === "card" || wait.kind === "pin") && wait.value !== null
      ? [{ target: wait.target, value: wait.value }]
      : []
  );

/** What of a task an attempt's work item carries as it is: outputs, group, owned files, budget. */
const taskLimits = (
  task: TaskView
): Pick<WorkItemRequest, "budget" | "group" | "outputs" | "owns"> => ({
  ...(task.outputs.length > 0 ? { outputs: task.outputs } : {}),
  ...(task.group ? { group: task.group } : {}),
  ...(task.owns.length > 0 ? { owns: task.owns } : {}),
  ...(task.budget ? { budget: task.budget } : {}),
});

/**
 * How an attempt runs, over what its work item's request names besides: the
 * task's limits ({@link taskLimits}) and a whole's coordinating, under what
 * a `delegate` naming the task asked where it asked.
 */
const runsAs = (
  task: TaskView,
  asked: AttemptAsk | undefined
): Omit<AttemptAsk, "lands" | "prompt" | "title" | "type"> => {
  const limits = taskLimits(task);
  return {
    // A whole's attempt coordinates its parts: it delegates.
    mayStart:
      asked?.mayStart ?? (task.parts.length > 0 ? [ANY_TYPE] : undefined),
    outputs: asked?.outputs ?? limits.outputs,
    group: asked?.group ?? limits.group,
    owns: asked?.owns ?? limits.owns,
    budget: asked?.budget ?? limits.budget,
    account: asked?.account,
    fork: asked?.fork,
    from: asked?.from,
    harness: asked?.harness,
    inputs: asked?.inputs,
    model: asked?.model,
    skills: asked?.skills,
  };
};

/**
 * The type an attempt runs before any is judged: the task's own `type:`,
 * else the `runs:` of the active stage it runs in (spec §5.1).
 */
const typeOf = (
  task: Pick<TaskView, "type">,
  active: Stage | undefined
): string | undefined => task.type ?? active?.hooks.runs;

/** What the brief says happens at finish_item, by where the attempt lands. */
const AT_FINISH: Record<LandsMode, string> = {
  main: "When the work is committed, call finish_item: the hub rebases your commits onto the default branch, runs the merge checks its project's gate.md names (for CawCo: the dependency install, `bun run check --all`, and the iOS build when you changed the app), and then pushes them to it.",
  branch:
    "When the work is committed, call finish_item: the hub runs its merge checks on your commits and pushes your branch.",
  pr: "When the work is committed, call finish_item: the hub runs its merge checks on your commits, then pushes your branch and opens a pull request.",
  none: "When the work is ready, call finish_item: nothing is pushed, and the hub collects your outputs.",
};

/** What a retry's brief adds: how the last attempt ended, and the to-dos done so far. */
interface RetryContext {
  /** What the hub reported of it: its error, or its report. */
  failure: string;
  /** Its state: failed or cancelled. */
  state: string;
  workItemId: string;
}

/** The longest stretch of a failure a retry's brief carries: its end. */
const FAILURE_TAIL = 4000;
const BACKTICKS = /`+/gu;

/** An attempt by its session's link, labelled by its task's title: what a comment or a message names it by. */
const attemptNamed = (
  item: Pick<WorkItemRow, "instanceId">,
  task: Pick<TaskView, "title">
): string => `its attempt ${sessionLink(item.instanceId, task.title)}`;

/** The work item's title: the task's title, what its session's chip reads, cut to what a session name takes. */
const titleOf = (task: TaskView): string => {
  const { title } = task;
  return title.length > SESSION_TITLE_MAX
    ? `${title.slice(0, SESSION_TITLE_MAX - 1).trimEnd()}…`
    : title;
};

/**
 * The brief: the words of the `delegate` call that named the task when one
 * did, then the task file as it stands, the open to-dos to start the plan
 * from (with their ids), the task's checks for the attempt to run and quote,
 * what finish_item does, where the task sits among its edges, the project's
 * context (memory.ts `contextFor`), and its design system when the task
 * needs it (`design`, read from the attempt's clone: design-system.ts
 * `designSection`).
 */
const briefOf = ({
  project,
  task,
  all,
  lands,
  comments,
  context,
  design,
  retry,
  asked,
}: {
  all: TaskSummary[];
  /** The brief of the `delegate` call that named the task, above the task file. */
  asked?: string;
  comments: TaskComment[];
  context: string;
  design: string;
  lands: LandsMode;
  project: ProjectRow;
  retry?: RetryContext;
  task: TaskView;
}): string => {
  const byId = new Map(all.map((each) => [each.id, each]));
  const line = (id: string): string => {
    const other = byId.get(id);
    return other
      ? `${taskLink(project.id, id, other.title)} (${other.stage})`
      : `${id} (not in the project)`;
  };
  /** A wait as the brief names it: its link, where it stands, a card's pick, whose chain it is from. */
  const waitLine = (wait: TaskView["waits"][number]): string =>
    `${markdownLink(wait.label, wait.href)}, ${wait.flag ? `blocked: ${wait.flag}` : wait.state}${wait.kind === "card" && wait.value ? `, picked ${wait.value}` : ""}${wait.via ? ` (through ${line(wait.via)})` : ""}`;
  const open = task.todos.filter((todo) => !todo.done);
  const todos =
    open.length > 0
      ? `Start your plan from these open to-dos: a step for each, its \`id\` the to-do's id (the last part of its link, \`td-3\`) and its content the to-do's words, like \`{ id: "td-3", content: "Persist the choice" }\`:\n\n${open
          .map(
            (todo) =>
              `${"  ".repeat(todo.depth)}- ${todo.id ? todoLink(project.id, task.id, todo.id, todo.text) : todo.text}`
          )
          .join(
            "\n"
          )}\n\nWhen a step whose id is a to-do's is completed, the hub ticks that to-do; you can also tick it with todo_write. Add the steps you find. finish_item lists the to-dos still open once: tick or explain each in your summary. Steps you leave open become proposed to-dos on the task.`
      : "The task has no open to-dos. Add the steps you find with todo_write as you go; plan items you leave open become proposed to-dos on the task.";
  const sits = [
    ...(task.waits.length > 0
      ? [`It waits on: ${task.waits.map(waitLine).join("; ")}.`]
      : []),
    ...(task.unblocks.length > 0
      ? [`It unblocks: ${task.unblocks.map(line).join("; ")}.`]
      : []),
    ...(task.partOf ? [`It is a part of ${line(task.partOf)}.`] : []),
    ...(task.outputs.length > 0
      ? [`It produces: ${task.outputs.join(", ")}.`]
      : []),
    ...(task.outputs.some((path) => deliverableKind(path) === "post")
      ? [POST_OUTPUT_RULE]
      : []),
    ...(task.owns.length > 0
      ? [
          `It owns: ${task.owns.join(", ")}. No other live work item writes these files while you run; stay inside them.`,
        ]
      : []),
  ];
  return [
    `Your work item is an attempt at ${taskLink(project.id, task.id, task.title)}, a task of the project ${project.name}. ${asked ? "This brief is the words of the session that started you, then the task file as it stands." : "This brief is its task file as it stands."} Name it, its to-dos and the tasks below to the person by their links.`,
    ...(asked ? [`## From the session that started you\n\n${asked}`] : []),
    ...(task.description ? [`## Description\n\n${task.description}`] : []),
    ...(task.acceptance
      ? [`## Acceptance criteria\n\n${task.acceptance}`]
      : []),
    `## To-dos\n\n${todos}`,
    `${checksSection(task)}\n\n${AT_FINISH[lands]}`,
    `## Where it sits\n\n${sits.length > 0 ? sits.join("\n") : "Nothing waits on it, and it waits on nothing."}`,
    ...(task.parts.length > 0 ? [partsSection(task.parts.map(line))] : []),
    `## Handing it in\n\n${RESULT_LINE}`,
    ...(context ? [context] : []),
    ...(design ? [design] : []),
    ...(retry ? [retrySection(project.id, task, retry)] : []),
    ...(comments.length > 0 ? [commentsSection(comments)] : []),
  ].join("\n\n");
};

/**
 * A coordinator's section of the brief: its parts, and how it runs them.
 * The hub starts none of them while it is live; the whole closes once every
 * part is done and it has reported.
 */
const partsSection = (parts: string[]): string =>
  `## Your parts\n\nThis task is a whole, and you coordinate it. Start each part with task_start when it is ready (each attempt reports to you), steer them with handoff, and read their reports. While you run, the hub starts none of them itself. The task closes once every part is done and you have called finish_item.\n\n${parts.map((part) => `- ${part}`).join("\n")}`;

/**
 * How an attempt hands in its work (task-tools.ts `task_result`): what the
 * task's review shows first, its words over the artifact it presented. The
 * review draws a presented artifact with the artifact panel's renderer and
 * never a file's format, so the brief asks for the artifact first.
 */
const RESULT_LINE =
  'Before finish_item, show your work, then hand it in. Show it with artifact_create: a page that draws what you made as its reader will meet it (the post as it will read, the report, the screen), or a preview of the app running. The review draws that artifact whole; it draws no file. Then call task_result: `summary`, what you did in a few sentences; `check`, what the reviewer should look at, one line each; `artifacts`, that artifact first (`kind: "artifact"`, its `artifactId`, `primary: true`), then each file by its path from the project folder and each link by its url. Words alone only when there is nothing to show.';

/** The most comments a brief carries: the newest. */
const BRIEF_COMMENTS_MAX = 20;

/** The comments left on the task since its last attempt started, batched into the brief (§5.3). */
const commentsSection = (comments: TaskComment[]): string => {
  const older = Math.max(0, comments.length - BRIEF_COMMENTS_MAX);
  return `## Comments since the last attempt\n\n${older > 0 ? `${judgedWords.olderComments(older)}\n\n` : ""}${comments
    .slice(-BRIEF_COMMENTS_MAX)
    .map(
      (comment) =>
        `**${comment.author.name}**, ${new Date(comment.at).toISOString()}:\n\n${comment.text}`
    )
    .join("\n\n")}`;
};

/** A retry's section of the brief: how the last attempt ended, and what of the task is done. */
const retrySection = (
  projectId: string,
  task: TaskView,
  retry: RetryContext
): string => {
  const done = task.todos.filter((todo) => todo.done);
  const failure = retry.failure.trim() || "(the hub kept no words for it)";
  const tail =
    failure.length > FAILURE_TAIL
      ? `…${failure.slice(-FAILURE_TAIL)}`
      : failure;
  // Longer than any run of backticks in the report, which fences its own.
  const longest = Math.max(
    0,
    ...(tail.match(BACKTICKS) ?? []).map((run) => run.length)
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [
    `## The last attempt\n\nThis is a retry. The last attempt (work item ${short(retry.workItemId)}) ${retry.state === "cancelled" ? "was cancelled" : "failed"}; the hub reported:\n\n${fence}\n${tail}\n${fence}`,
    done.length > 0
      ? `Done so far, by the task's to-dos: ${done.map((todo) => (todo.id ? todoLink(projectId, task.id, todo.id, todo.text) : todo.text)).join("; ")}.`
      : "None of the task's to-dos is ticked yet.",
    "When your workspace still holds the last attempt's clone, its commits and files are as it left them: read `git log` and `git status` before you start, and carry on from there rather than starting over.",
  ].join("\n\n");
};

/** Why a count setting cannot be `value`: it is a whole number from 1 to `max`. */
const countProblem = (
  name: string,
  value: number | undefined,
  max: number
): string | undefined =>
  value === undefined || (Number.isInteger(value) && value >= 1 && value <= max)
    ? undefined
    : `${name} is a whole number from 1 to ${max}.`;

/**
 * Why a dispatch change cannot be written as asked: a count out of range, or
 * a budget that does not read; nothing when it can. The dashboard's change
 * and Caw's (project-settings.ts) are checked by this one rule.
 */
export const dispatchProblem = ({
  budget,
  maxAttempts,
  reviewLimit,
}: DispatchChange): string | undefined =>
  countProblem("maxAttempts", maxAttempts, MAX_ATTEMPTS_LIMIT) ??
  countProblem("reviewLimit", reviewLimit, REVIEW_LIMIT_LIMIT) ??
  (budget ? budgetProblem(budget) : undefined);

/** `1 task waits`, `3 tasks wait`. */
const counted = (count: number, one: string, many: string): string =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** Why dispatch would start nothing now, even with a ready task; null when it would. */
const pauseOf = (
  project: ProjectRow,
  now: {
    live: number;
    review: number;
    stagesProblems: string[];
  }
): string | null => {
  if (!project.dispatch) {
    return "Dispatch is off: attempts start only when a session or you start them.";
  }
  if (!project.eventsOn) {
    return "The project's events are off, so no conversation takes the reports of the attempts the hub starts; they start only when a session or you start them.";
  }
  if (now.stagesProblems.length > 0) {
    return `stages.md does not read. ${now.stagesProblems.join(" ")}`;
  }
  if (now.review >= project.reviewLimit) {
    return `${counted(now.review, "task waits", "tasks wait")} for you in review; dispatch pauses at ${project.reviewLimit}.`;
  }
  if (now.live >= project.maxAttempts) {
    return `${counted(now.live, "attempt is", "attempts are")} live; the project runs at most ${project.maxAttempts}.`;
  }
  return null;
};

/** The columns a settings change writes: only what it names. */
const columnsOf = ({
  budget,
  dispatch,
  lands,
  maxAttempts,
  reviewLimit,
  runsOn,
}: DispatchChange) => ({
  ...(budget === undefined
    ? {}
    : { budget: budget && Object.keys(budget).length > 0 ? budget : null }),
  ...(dispatch === undefined ? {} : { dispatch }),
  ...(lands === undefined ? {} : { lands }),
  ...(maxAttempts === undefined ? {} : { maxAttempts }),
  ...(reviewLimit === undefined ? {} : { reviewLimit }),
  ...(runsOn === undefined ? {} : { runsOn }),
});

/** The stage kinds an ended attempt sends its task to: done, `you`, or back to todo. */
type AttemptLanding = Extract<StageKind, "done" | "todo" | "you">;

export const createDispatcher = ({
  briefing,
  context,
  db,
  designSection,
  conversationFor,
  lifetime,
  pauses,
  placement,
  start,
  tasks,
  typeLands,
  workPlace,
}: DispatchDeps) => {
  /**
   * Jev's readiness and order for each frontier task, by `project\0task`,
   * with the hash of the file it read: a file that did not change is not
   * asked about again.
   */
  const judgements = new Map<string, DispatchJudgement & { hash: string }>();
  /** Attempts being started now, by `project\0task`: their work item is not filed yet. */
  const starting = new Set<string>();
  /** Why the hub last could not start an attempt at a task, and the file it read then. */
  const problems = new Map<string, { hash: string; message: string }>();
  /** Projects being looked at now, and the ones to look at again after. */
  const looking = new Set<string>();
  const again = new Set<string>();
  /** Whether the safety net runs: started once, stopped with the hub. */
  let watching = false;

  const keyOf = (projectId: string, taskId: string): string =>
    `${projectId}\0${taskId}`;

  const startingIn = (projectId: string): number =>
    [...starting].filter((key) => key.startsWith(`${projectId}\0`)).length;

  const liveAttempts = (projectId: string): WorkItemRow[] =>
    db.projectAttempts(projectId).filter((item) => isLive(item.state));

  /** The project the hub keeps as `projectId`; refused when it keeps none. */
  const projectOf = (projectId: string) => {
    const project = db.project(projectId);
    return project
      ? project
      : problem(404, {
          code: "dispatch-project-unknown",
          detail: `The hub keeps no project ${projectId}.`,
        });
  };

  const instance = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  /** The project's conversation, started now when it has none; undefined while its switch is off. */
  const conversationOf = async (project: ProjectRow, by: Origin = "event") => {
    const row =
      by === "you" || project.eventsOn
        ? await conversationFor(project.id, by)
        : undefined;
    if (row instanceof ElysiaStatus) {
      return row;
    }
    return row && !parentProblem(row, project.id) ? row : undefined;
  };

  /** The machines `runsOn` names (runs-on.ts), online or not. */
  const machinesFor = (runsOn: string): MachineFacts[] =>
    db.listAgents().filter((machine) => fits(runsOn, machine));

  /**
   * Where an attempt's work item is cut, as its request says it: the
   * project's place for its work (work-place.ts), on a machine its task's
   * runs_on names (else its project's), the starting session's own checkout
   * first; and for a retry the last workspace, kept only on a machine
   * runs_on names. Refused, and the reason remembered on the task, when
   * there is nowhere to cut it.
   */
  const placementOf = (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    previous: WorkItemRow | undefined
  ) => {
    const runsOn = task.runsOn ?? project.runsOn;
    const place = workPlace(project, {
      runsOn,
      near: { machineId: parent.machineId, cwd: parent.cwd },
    });
    // A retry goes on in its last workspace, where runs_on allows it.
    if (place.kind === "none" && (runsOn || !previous)) {
      const message = `${capitalized(place.why)}, so this task's attempt starts nowhere: ${place.fix}.`;
      note(project.id, task, message);
      return problem(409, { code: "dispatch-nowhere", detail: message });
    }
    const placed: Pick<
      WorkItemRequest,
      "cwd" | "machineId" | "reuse" | "reuseOn"
    > = {
      ...(place.kind === "none"
        ? {}
        : { cwd: place.cwd, machineId: place.machineId }),
      ...(previous ? { reuse: previous.workspaceId } : {}),
      ...(previous && runsOn
        ? {
            reuseOn: machinesFor(runsOn).map((machine) => machine.machineId),
          }
        : {}),
    };
    return placed;
  };

  /** Remembers why a start failed, against the task file as it was read. */
  const note = (
    projectId: string,
    task: { hash: string; id: string },
    message: string
  ): void => {
    problems.set(keyOf(projectId, task.id), { hash: task.hash, message });
    console.warn(`[dispatch] ${task.id} in project ${projectId}: ${message}`);
  };

  /** The refusal of an attempt at a task that has a live one, or is done or dropped. */
  const startable = (projectId: string, task: TaskView) => {
    const live = liveAttempts(projectId).find(
      (item) => item.taskId === task.id
    );
    if (live) {
      return problem(409, {
        code: "dispatch-attempt-live",
        detail: `This task has a live attempt already: ${sessionLink(live.instanceId, task.title)} is ${live.state}. Message its session, or wait for its report.`,
      });
    }
    if (task.kind === "done" || task.kind === "dropped") {
      return problem(409, {
        code: "dispatch-task-closed",
        detail: `This task is in ${task.stage}, a ${task.kind} stage; move it back before starting an attempt.`,
      });
    }
  };

  /**
   * The active stage an attempt runs in: the one a hook started it from, the
   * one the task is in when that is active, else the first of kind `active`
   * (none, when the project has none).
   */
  const activeFor = async (
    projectId: string,
    task: TaskView,
    stage: Stage | undefined
  ) => {
    if (stage) {
      return stage;
    }
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    if (stages.problems.length > 0) {
      return problem(409, {
        code: "dispatch-stages-unread",
        detail: `stages.md does not read, so the hub cannot tell where an attempt moves this task. ${stages.problems.join(" ")}`,
      });
    }
    return task.kind === "active"
      ? stages.stages.find((each) => each.name === task.stage)
      : stages.stages.find((each) => each.kind === "active");
  };

  /**
   * The refusal of a session's start whose move of the task into `active`
   * the project's moves do not give a session (stages.ts `moveProblem`, its
   * own sentence): a start moves the task as its starter would. The
   * person's starts and the hub's own (dispatch, a hook) are not a
   * session's; a task already in `active` moves nowhere.
   */
  const refuseSessionMove = async (
    projectId: string,
    task: TaskView,
    active: Stage | undefined
  ) => {
    if (!active || active.name === task.stage) {
      return;
    }
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const misfit = moveProblem(
      stages,
      task.id,
      task.stage,
      active.name,
      "session"
    );
    return misfit
      ? problem(409, { code: "dispatch-move-not-session", detail: misfit })
      : undefined;
  };

  /**
   * How an attempt at `task` lands: the task's `lands:`, else its delegate
   * type's, else the project's.
   */
  const landsOf = (
    project: ProjectRow,
    task: TaskView,
    type: string | undefined
  ): LandsMode =>
    task.lands ??
    (type ? typeLands?.(project.id, type) : undefined) ??
    project.lands;

  /**
   * Delegate type (§5.9) for an attempt whose stage runs none and whose task
   * names none: Jev's choice from the project's catalog while Jev is on;
   * with Jev off nobody named one, so "medium" (undefined here: work-items'
   * default). Jev failing refuses the start with its words; the next look
   * asks again.
   */
  const chosenType = async (
    project: ProjectRow,
    task: TaskView
  ): Promise<string | undefined> => {
    const access = placement.access();
    if (!access) {
      offLine(
        "type",
        project.id,
        `${task.id} names no type and its stage runs none, so it runs "${DEFAULT_DELEGATE_TYPE}"`
      );
      return;
    }
    const types = placement.typesFor(project.id);
    if (types.length === 0) {
      return;
    }
    const type = await jevType(
      access,
      project.id,
      {
        title: task.title,
        text: [task.description, task.acceptance].filter(Boolean).join("\n\n"),
      },
      types
    );
    console.log(
      `[dispatch] ${project.name}: ${task.id} runs ${type}, Jev's choice of ${types.length} types`
    );
    return type;
  };

  /**
   * The frontier tasks to start, in the order to start them (§5.9 Ready to
   * dispatch and Dispatch order). A task triaged as anything but
   * `ready-for-agent` is not an agent's. Jev on: the ones Jev scores ready,
   * by its three order scores (ties keep board order); a Jev that does not
   * answer starts nothing this look. Jev off: the ones the project's conversation scored
   * `ready: yes` (with events off, the ones with a check), in board order,
   * which is the conversation's ranks, then the rest by number.
   */
  const readyInOrder = async (project: ProjectRow, frontier: string[]) => {
    const list = await tasks.list(project.id);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const byId = new Map(list.tasks.map((each) => [each.id, each]));
    const triaged = frontier
      .filter((id) => {
        const state = byId.get(id)?.fields[TRIAGE_FIELD];
        return !state || state === "ready-for-agent";
      })
      .slice(0, DISPATCH_ASKED_MAX);
    const read = await Promise.all(
      triaged.map((id) => tasks.get(project.id, id))
    );
    const views: TaskView[] = [];
    for (const task of read) {
      if (task instanceof ElysiaStatus) {
        return task;
      }
      views.push(task);
    }
    const access = placement.access();
    return access
      ? await readyByJev(project, access, views)
      : readyByLead(project, views, byId);
  };

  /** Ready to dispatch and Dispatch order with Jev off: the conversation's scores (else a check), in board order. */
  const readyByLead = (
    project: ProjectRow,
    views: TaskView[],
    byId: Map<string, TaskSummary>
  ): string[] => {
    const ready = views
      .filter((task) =>
        readyByRule(
          {
            checks: task.checks.length,
            fields: byId.get(task.id)?.fields ?? {},
          },
          project.eventsOn
        )
      )
      .map((task) => task.id);
    const waiting = views
      .map((task) => task.id)
      .filter((id) => !ready.includes(id));
    offLine(
      "ready",
      project.id,
      `${project.eventsOn ? "the conversation's scores" : "with events off, a check must exist"}: ready ${ready.join(", ") || "none"}${waiting.length > 0 ? `; not ready ${waiting.join(", ")}` : ""}`
    );
    if (ready.length > 0) {
      offLine(
        "order",
        project.id,
        `the conversation's ranks, else board order: ${ready.join(", ")}`
      );
    }
    return ready;
  };

  /**
   * Asks Jev about the frontier tasks it has no judgement of for the file as
   * it stands, and keeps the answers; false when Jev did not answer.
   */
  const judgeFresh = async (
    project: ProjectRow,
    access: JevAccess,
    views: TaskView[]
  ): Promise<boolean> => {
    const fresh = views.filter(
      (task) => judgements.get(keyOf(project.id, task.id))?.hash !== task.hash
    );
    if (fresh.length === 0) {
      return true;
    }
    let answered: Map<string, DispatchJudgement>;
    try {
      answered = await jevDispatch(
        access,
        project.id,
        fresh.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          acceptance: task.acceptance,
          checks: task.checks,
          todos: task.todos
            .filter((todo) => !todo.done)
            .map((todo) => todo.text),
          waiting: task.unblocks.length,
        }))
      );
    } catch (error) {
      if (error instanceof JevFailed) {
        console.warn(
          `[dispatch] ${project.name}: nothing starts this look: ${error.message}`
        );
        return false;
      }
      throw error;
    }
    for (const task of fresh) {
      const judged = answered.get(task.id);
      if (judged) {
        judgements.set(keyOf(project.id, task.id), {
          ...judged,
          hash: task.hash,
        });
      }
    }
    return true;
  };

  /** Ready to dispatch and Dispatch order with Jev on: the ones Jev scores ready, by its order scores. */
  const readyByJev = async (
    project: ProjectRow,
    access: JevAccess,
    views: TaskView[]
  ): Promise<string[]> => {
    if (!(await judgeFresh(project, access, views))) {
      return [];
    }
    const ready = views
      .map((task, index) => ({
        task,
        index,
        judged: judgements.get(keyOf(project.id, task.id)),
      }))
      .filter((each) => each.judged?.ready)
      .sort(
        (a, b) =>
          (b.judged?.order ?? 0) - (a.judged?.order ?? 0) || a.index - b.index
      )
      .map((each) => each.task.id);
    console.log(
      `[dispatch] ${project.name}: Jev scores ready, in order: ${ready.join(", ") || "none"} of ${views.length}`
    );
    return ready;
  };

  /**
   * The attempt's brief as its clone gives it its design section
   * ({@link briefOf}): the task as it stands, with the comments left since
   * its newest attempt started, a retry's last attempt, and the brief of
   * the `delegate` naming it (`asked`).
   */
  const briefFor = async (
    project: ProjectRow,
    task: TaskView,
    lands: LandsMode,
    { asked, previous }: { asked?: string; previous?: WorkItemRow }
  ) => {
    const list = await tasks.list(project.id);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const all = list.tasks;
    const retry = previous
      ? {
          workItemId: previous.id,
          state: previous.state,
          failure: previous.error ?? previous.result ?? "",
        }
      : undefined;
    // The comments left since the task's newest attempt started.
    const [last] = db
      .projectAttempts(project.id)
      .filter((item) => item.taskId === task.id);
    const comments = last
      ? task.comments.filter(
          (comment) => comment.at >= last.createdAt.getTime()
        )
      : [];
    const known = await context(project.id, task);
    if (typeof known !== "string") {
      return known;
    }
    return (design: string) =>
      briefOf({
        project,
        task,
        all,
        lands,
        comments,
        context: known,
        design,
        retry,
        ...(asked ? { asked } : {}),
      });
  };

  /**
   * Files and spawns the attempt's work item; a failure is remembered on the
   * task. A retry names the attempt before it, whose workspace it runs in
   * again when that clone is still there. `origin` is whose work it is
   * (work-items `origin`); left out, its parent's. What a `delegate` naming
   * the task `asked` goes over the task's own: its brief above the task
   * file, and each setting it gives. A brief a session wrote waits for the
   * fleet's briefing guidance it has yet to read for its delegate
   * (briefings.ts): the call answers with the guide, and the same call made
   * again goes out.
   */
  const launch = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    {
      asked,
      origin,
      previous,
    }: { asked?: AttemptAsk; origin?: Origin; previous?: WorkItemRow }
  ) => {
    const placed = placementOf(project, task, parent, previous);
    if (placed instanceof ElysiaStatus) {
      return placed;
    }
    const type =
      asked?.type ?? typeOf(task, active) ?? (await chosenType(project, task));
    const lands = asked?.lands ?? landsOf(project, task, type);
    try {
      const started = await startBriefed(project, task, parent, {
        asked,
        lands,
        origin,
        placed,
        previous,
        type,
      });
      if (started instanceof ElysiaStatus) {
        note(project.id, task, started.response.detail);
        return started;
      }
      problems.delete(keyOf(project.id, task.id));
      return started;
    } catch (error) {
      note(
        project.id,
        task,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  };

  /**
   * An attempt's work item started, briefed from its task: the request
   * built with the brief, a brief a session wrote held for the guidance it
   * has yet to read, then {@link DispatchDeps.start}; what stops it comes
   * back as its problem.
   */
  const startBriefed = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    {
      asked,
      lands,
      origin,
      placed,
      previous,
      type,
    }: {
      asked: AttemptAsk | undefined;
      lands: LandsMode;
      origin: Origin | undefined;
      placed: Exclude<ReturnType<typeof placementOf>, { "~status": true }>;
      previous: WorkItemRow | undefined;
      type: string | undefined;
    }
  ) => {
    const brief = await briefFor(project, task, lands, {
      asked: asked?.prompt,
      previous,
    });
    if (brief instanceof ElysiaStatus) {
      return brief;
    }
    const request: WorkItemRequest = {
      parentInstanceId: parent.id,
      prompt: brief(""),
      // The project's design system, as the attempt's clone holds it, for
      // a task that needs it (spec §5.7, "Use").
      ...(needsDesignSystem(project.template ?? null, task)
        ? {
            briefFromClone: async (clone: CloneRef) => {
              const section = await designSection(clone);
              return section instanceof ElysiaStatus ? section : brief(section);
            },
          }
        : {}),
      title: asked?.title ?? titleOf(task),
      type,
      lands,
      waitedOn: witnessesOf(task),
      ...runsAs(task, asked),
      ...placed,
      ...(origin ? { origin } : {}),
      // Only a start a person asked for names `you` here: his dashboard
      // start or retry, or his own move into a `runs:` stage.
      byPerson: origin === "you",
      task: { id: task.id, projectId: project.id },
    };
    // A brief a session wrote waits for the guidance it has yet to read,
    // as any delegate's does; no problem of the task's.
    const guide = asked ? briefing(request) : undefined;
    if (guide instanceof ElysiaStatus) {
      return guide;
    }
    if (guide) {
      return problem(409, { code: "dispatch-guidance-first", detail: guide });
    }
    return await start(request);
  };

  /** Moves a task whose attempt started into its active stage; answers where it is. */
  const moveIn = async (
    projectId: string,
    task: TaskView,
    active: Stage | undefined,
    item: WorkItemRow
  ): Promise<string> => {
    if (!active || active.name === task.stage) {
      return task.stage;
    }
    const unmoved = (why: string) => {
      console.warn(
        `[dispatch] ${task.id}'s attempt ${item.id} started, but the task did not move to ${active.name}: ${why}`
      );
      return task.stage;
    };
    try {
      const moved = await tasks.move(
        projectId,
        task.id,
        active.name,
        hubActor(`attempt ${short(item.id)} started`)
      );
      return moved instanceof ElysiaStatus
        ? unmoved(moved.response.detail)
        : moved.stage;
    } catch (error) {
      return unmoved(error instanceof Error ? error.message : String(error));
    }
  };

  /**
   * Starts an attempt at a task, reporting to `parent`: task_start's, a
   * `delegate` naming the task's (`asked`), a hook's and the dispatcher's
   * one path. `stage` is the active stage a hook started it from; without
   * one the task moves to the stage it is active in, or the first of kind
   * `active`. Refused while the task has a live attempt, is done or dropped,
   * a session's (no `origin`) when the project's moves do not let a session
   * make that move, or no checkout is online; a start the machine or the fleet turns down is
   * remembered on the task until it changes.
   */
  const startAttempt = async (
    projectId: string,
    ref: string,
    parent: InstanceRow,
    how: AttemptHow = {}
  ) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const unfit = parentProblem(parent, projectId, parent.id);
    if (unfit) {
      return problem(403, { code: "dispatch-parent-unfit", detail: unfit });
    }
    const task = await tasks.get(projectId, ref);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    const key = keyOf(projectId, task.id);
    if (starting.has(key)) {
      return problem(409, {
        code: "dispatch-starting",
        detail: "An attempt at this task is starting already.",
      });
    }
    // From here to its work item being filed, the start holds the task.
    starting.add(key);
    try {
      return await startHeld(project, task, parent, how);
    } finally {
      starting.delete(key);
    }
  };

  /** {@link startAttempt} once the start holds the task: checked, launched, and its task moved in. */
  const startHeld = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    { stage, retry = false, origin, asked }: AttemptHow
  ) => {
    const projectId = project.id;
    const closed = startable(projectId, task);
    if (closed) {
      return closed;
    }
    const previous = retry ? retryable(projectId, task) : undefined;
    if (previous instanceof ElysiaStatus) {
      return previous;
    }
    const active = await activeFor(projectId, task, stage);
    if (active instanceof ElysiaStatus) {
      return active;
    }
    // No origin: a session asked (task_start, task_retry, a delegate naming it).
    const moveRefused =
      origin === undefined
        ? await refuseSessionMove(projectId, task, active)
        : undefined;
    if (moveRefused) {
      return moveRefused;
    }
    const started = await launchOrQueue(project, task, parent, active, {
      asked,
      origin,
      previous,
      retry,
      stage,
    });
    if (started instanceof ElysiaStatus || "queued" in started) {
      return started;
    }
    // Asked for now: a hook's start that waited for a slot is not needed.
    db.dropQueuedTaskStart(projectId, task.id);
    const now = await moveIn(projectId, task, active, started.item);
    const opening = startedLine(
      taskLink(projectId, task.id, task.title),
      started,
      previous
    );
    console.log(
      `[dispatch] ${project.name}: ${task.id} attempt ${started.item.id} ${previous ? "retried" : "started"} (lands ${started.item.lands}), reporting to ${parent.id}`
    );
    const attempt: AttemptStart = {
      task: task.id,
      stage: now,
      queued: false,
      type: started.item.type,
      lands: started.item.lands,
      workItemId: started.item.id,
      workspaceId: started.workspace.id,
      instanceId: started.item.instanceId,
      text: `${opening} It is now in ${now || "no stage"}, and lands ${started.item.lands}. ${started.text}`,
    };
    return attempt;
  };

  /** {@link launch}, or, while a live item owns files the attempt would own too, the attempt queued for them. */
  const launchOrQueue = async (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    {
      asked,
      origin,
      previous,
      retry,
      stage,
    }: {
      asked: AttemptAsk | undefined;
      origin: Origin | undefined;
      previous: WorkItemRow | undefined;
      retry: boolean;
      stage: Stage | undefined;
    }
  ) => {
    const launched = await launch(project, task, parent, active, {
      asked,
      origin,
      previous,
    });
    return launched instanceof ElysiaStatus &&
      launched.response.code === "work-item-owns-overlap"
      ? queuedForOwns(project, task, parent, stage, launched.response.detail, {
          asked,
          retry,
          origin,
        })
      : launched;
  };

  /**
   * An attempt that waits for files a live item owns: queued, why `owns`,
   * under the stage the task is in (a hook's own), to start as items end
   * ({@link drainQueued}) while it is still there; the task stays put. A
   * retry stays a retry: it starts as one, in the last attempt's workspace;
   * a start keeps whose it is (`origin`), so yours that waited is yours; and
   * a `delegate`'s keeps what it asked.
   */
  const queuedForOwns = (
    project: ProjectRow,
    task: TaskView,
    parent: InstanceRow,
    active: Stage | undefined,
    because: string,
    {
      asked,
      retry,
      origin,
    }: {
      asked: AttemptAsk | undefined;
      origin: Origin | undefined;
      retry: boolean;
    }
  ): AttemptStart => {
    db.queueTaskStart({
      projectId: project.id,
      taskId: task.id,
      stage: task.stage,
      parentInstanceId: parent.id,
      why: "owns",
      retry,
      origin: origin ?? null,
      asked: asked ?? null,
    });
    console.log(
      `[dispatch] ${project.name}: ${task.id}${retry ? "'s retry" : ""} waits for owned files: ${because}`
    );
    return {
      task: task.id,
      stage: task.stage,
      queued: true,
      type: asked?.type ?? typeOf(task, active) ?? null,
      lands: asked?.lands ?? landsOf(project, task, typeOf(task, active)),
      workItemId: null,
      workspaceId: null,
      instanceId: null,
      text: `Queued ${retry ? "a retry of" : "an attempt at"} ${taskLink(project.id, task.id, task.title)}: ${because} The hub starts it, reporting to you, when the files are free.`,
    };
  };

  /** How an attempt's start opens, the task by its link: started, or retried in the old workspace or a new one. */
  const startedLine = (
    link: string,
    started: WorkItemStart,
    previous: WorkItemRow | undefined
  ): string => {
    if (!previous) {
      return `Started an attempt at ${link}.`;
    }
    return started.workspace.id === previous.workspaceId
      ? `Retried ${link} in the last attempt's workspace, with a fresh session.`
      : `Retried ${link} in a new workspace: the last attempt's clone is gone.`;
  };

  /** The attempt a retry follows: the task's newest, which failed or was cancelled; refused otherwise. */
  const retryable = (projectId: string, task: TaskView) => {
    const [previous] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === task.id);
    if (!previous) {
      return problem(409, {
        code: "dispatch-retry-unattempted",
        detail: "This task has no attempt to retry; start one with task_start.",
      });
    }
    return task.lastAttemptFailed || task.lastAttemptStopped
      ? previous
      : problem(409, {
          code: "dispatch-retry-not-ended",
          detail: `This task's last attempt is ${previous.state}, not failed or stopped; start a new one with task_start.`,
        });
  };

  /** What the dispatcher would do for a project now. */
  const viewOf = async (project: ProjectRow) => {
    const list = await tasks.list(project.id);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const live = liveAttempts(project.id).length + startingIn(project.id);
    const review = list.tasks.filter((task) => task.kind === "you").length;
    const frontier = list.tasks.filter(onFrontier).map((task) => task.id);
    const paused = pauseOf(project, {
      stagesProblems: list.stagesProblems,
      review,
      live,
    });
    const view: DispatchView = {
      budget: project.budget,
      dispatch: project.dispatch,
      lands: project.lands,
      conversationInstanceId: project.conversationInstanceId,
      maxAttempts: project.maxAttempts,
      reviewLimit: project.reviewLimit,
      runsOn: project.runsOn,
      live,
      review,
      paused,
      frontier,
      queued: db.queuedTaskStarts(project.id).map((each) => each.taskId),
    };
    return view;
  };

  /**
   * One look at a project: starts the frontier's first tasks up to the cap,
   * unless paused, reporting to its Caw (started for the first one).
   */
  /**
   * What one look would start: the project, how many attempts are live, and
   * its ready frontier in order; undefined for a project that does not
   * dispatch now, or has nothing ready. Judged before the project's conversation is started:
   * nothing ready wakes nobody.
   */
  const lookAt = async (projectId: string) => {
    const project = db.project(projectId);
    if (!(project?.dispatch && project.eventsOn)) {
      return;
    }
    const view = await viewOf(project);
    if (view instanceof ElysiaStatus) {
      return view;
    }
    if (view.paused || view.frontier.length === 0 || pauses(projectId)) {
      return;
    }
    const ready = await readyInOrder(project, view.frontier);
    if (ready instanceof ElysiaStatus) {
      return ready;
    }
    return ready.length > 0 ? { project, live: view.live, ready } : undefined;
  };

  const dispatchOnce = async (projectId: string) => {
    const look = await lookAt(projectId);
    if (!look || look instanceof ElysiaStatus) {
      return look;
    }
    const { project, ready } = look;
    const slots = project.maxAttempts - look.live;
    const reportsTo = await conversationOf(project);
    if (reportsTo instanceof ElysiaStatus) {
      return await unreported(
        projectId,
        ready.slice(0, slots),
        reportsTo.response.detail
      );
    }
    if (reportsTo) {
      await startReady(project, ready, slots, reportsTo);
    }
  };

  /** The tasks a look would have started, each saying why it did not: Caw, who takes their reports, did not start. */
  const unreported = async (projectId: string, ids: string[], why: string) => {
    const waiting = await Promise.all(
      ids.map((id) => tasks.get(projectId, id))
    );
    const read: TaskView[] = [];
    for (const task of waiting) {
      if (task instanceof ElysiaStatus) {
        return task;
      }
      read.push(task);
    }
    for (const task of read) {
      note(
        projectId,
        task,
        `It is ready to start, but Caw, who takes the reports of the attempts the hub starts, did not start: ${why}`
      );
    }
  };

  /** A look's ready tasks started in order, reporting to `reportsTo`, until its `slots` are taken; one that does not start says why in the log. */
  const startReady = async (
    project: ProjectRow,
    ready: string[],
    slots: number,
    reportsTo: InstanceRow
  ) => {
    let left = slots;
    for (const id of ready) {
      if (left <= 0) {
        break;
      }
      const unstarted = (why: string) =>
        console.warn(`[dispatch] ${project.name}: ${id} did not start: ${why}`);
      try {
        const started = await startAttempt(project.id, id, reportsTo, {
          origin: "event",
        });
        if (started instanceof ElysiaStatus) {
          unstarted(started.response.detail);
        } else if (!started.queued) {
          // One queued for owned files took no slot.
          left -= 1;
        }
      } catch (error) {
        unstarted(error instanceof Error ? error.message : String(error));
      }
    }
  };

  /** Live attempts in a project, counting the ones being started now. */
  const liveIn = (projectId: string): number =>
    liveAttempts(projectId).length + startingIn(projectId);

  /**
   * The session a hook's attempt reports to: the one that moved the task in
   * when it can take reports, else the project's conversation. With neither, or a conversation whose
   * session did not start (no account signed in, say), the reason is
   * remembered on the task, so its card says why it did not start; `how`
   * opens that sentence ("tsk-3 entered extract, which runs brand").
   */
  const hookParent = async (
    project: ProjectRow,
    task: TaskView,
    moverId: string | null | undefined,
    how: string
  ): Promise<InstanceRow | undefined> => {
    const mover = moverId ? instance(moverId) : undefined;
    if (mover && !parentProblem(mover, project.id)) {
      return mover;
    }
    const caw = await conversationOf(project);
    if (caw instanceof ElysiaStatus) {
      note(
        project.id,
        task,
        `${how}, but Caw, who takes its report, did not start: ${caw.response.detail}`
      );
      return;
    }
    if (!caw) {
      note(
        project.id,
        task,
        `${how}, but no session can take the attempt's report. ${NO_LEAD}`
      );
    }
    return caw;
  };

  /**
   * The hook starts that waited for a slot, oldest first, while the project
   * has slots: each one whose task is still in the stage that asked, with no
   * live attempt, and someone to report to. Each leaves the queue as it is
   * tried; a start that fails is remembered on the task, as any start is.
   */
  const drainQueued = async (projectId: string): Promise<void> => {
    const project = db.project(projectId);
    if (!project) {
      return;
    }
    for (const queued of db.queuedTaskStarts(projectId)) {
      const owns = queued.why === "owns";
      // A start that waited for owned files was asked for, so the cap does
      // not hold it back; a hook's does.
      if (!owns && liveIn(projectId) >= project.maxAttempts) {
        return;
      }
      db.dropQueuedTaskStart(projectId, queued.taskId);
      const unrun = (why: string) =>
        console.warn(
          `[dispatch] ${project.name}: ${queued.taskId}'s queued start did not run: ${why}`
        );
      try {
        const ran = await runQueued(project, queued);
        if (ran instanceof ElysiaStatus) {
          unrun(ran.response.detail);
        }
      } catch (error) {
        unrun(error instanceof Error ? error.message : String(error));
      }
    }
  };

  /**
   * One queued start, taken off the queue: run when its task is still in the
   * stage it waited in, with no live attempt, and someone to report to — a
   * hook's from its `runs:` stage, one that waited for owned files from
   * wherever it was asked, a retry as a retry, and each as whose it was
   * (`origin`). Still overlapping, it queues again.
   */
  const runQueued = async (
    project: ProjectRow,
    queued: ReturnType<DispatchDeps["db"]["queuedTaskStarts"]>[number]
  ) => {
    const owns = queued.why === "owns";
    const now = await queuedNow(project, queued);
    if (now instanceof ElysiaStatus) {
      return now;
    }
    const { stage, task } = now;
    const hook = stage?.kind === "active" && !!stage.hooks.runs;
    if (!(hook || owns) || task.stage !== queued.stage || task.liveAttempt) {
      console.log(
        `[dispatch] ${project.name}: ${task.id}'s queued start is dropped: it is in ${task.stage}${task.liveAttempt ? " with a live attempt" : ""}, not waiting in ${queued.stage}.`
      );
      return;
    }
    const parent = await hookParent(
      project,
      task,
      queued.parentInstanceId,
      `It waited in ${queued.stage} for ${owns ? "owned files" : "a slot"}`
    );
    if (!parent) {
      return;
    }
    return await startAttempt(project.id, task.id, parent, {
      ...(stage?.kind === "active" ? { stage } : {}),
      retry: queued.retry,
      ...(queued.origin ? { origin: queued.origin } : {}),
      // Written by queuedForOwns from an AttemptAsk alone.
      ...(queued.asked ? { asked: queued.asked as AttemptAsk } : {}),
    });
  };

  /** A queued start's stage as the project's stages read it now, and its task. */
  const queuedNow = async (
    project: ProjectRow,
    queued: ReturnType<DispatchDeps["db"]["queuedTaskStarts"]>[number]
  ) => {
    const stages = await tasks.stages(project.id);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const stage = stages.stages.find((each) => each.name === queued.stage);
    const task = await tasks.get(project.id, queued.taskId);
    return task instanceof ElysiaStatus ? task : { stage, task };
  };

  /**
   * Looks at a project again: the hook starts waiting for a slot first, then
   * the frontier. One look at a time per project, and a request that arrives
   * during one runs once more after it.
   */
  const evaluate = (projectId: string): void => {
    if (looking.has(projectId)) {
      again.add(projectId);
      return;
    }
    looking.add(projectId);
    const look = async (): Promise<void> => {
      do {
        again.delete(projectId);
        try {
          await drainQueued(projectId);
          const refused = await dispatchOnce(projectId);
          if (refused) {
            console.warn(`[dispatch] ${projectId}: ${refused.response.detail}`);
          }
        } catch (error) {
          console.warn(
            `[dispatch] ${projectId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } while (again.has(projectId));
    };
    detach(
      look().finally(() => {
        looking.delete(projectId);
        if (again.has(projectId)) {
          evaluate(projectId);
        }
      }),
      "dispatch look"
    );
  };

  /**
   * A task moved or filed into an active stage whose attempt did not start
   * went in only to be worked (tasks.ts `refuseNobody` refuses it otherwise):
   * it goes on to the todo stage it waits in (stages.ts `waitingStageOf`),
   * as the hub, saying why, so it is never left in an active stage with
   * nothing working on it.
   */
  const nobodyOn = async (
    projectId: string,
    id: string,
    to: string,
    why: string
  ) => {
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const waiting = waitingStageOf(stages, to);
    if (!waiting) {
      console.warn(
        `[dispatch] ${id} entered ${to} and ${why}; the project has no todo stage, so it stays.`
      );
      return;
    }
    const moved = await tasks.move(
      projectId,
      id,
      waiting.name,
      hubActor(`nothing works on it: ${why}`)
    );
    return moved instanceof ElysiaStatus ? moved : undefined;
  };

  /**
   * A hook's start, once it is asked for: reporting to the mover or the
   * project's conversation; a `runs:` start, while the project runs `max_attempts` already,
   * queued for a slot. Answers why it did not start; nothing when it
   * started or was queued.
   */
  const hookStart = async (
    project: ProjectRow,
    task: TaskView,
    stage: Stage,
    actor: TaskActor,
    how: string
  ): Promise<string | undefined> => {
    const { runs } = stage.hooks;
    const parent = await hookParent(project, task, actor.instanceId, how);
    if (!parent) {
      return "no session can take its report";
    }
    const live = liveIn(project.id);
    if (runs && live >= project.maxAttempts) {
      db.queueTaskStart({
        projectId: project.id,
        taskId: task.id,
        stage: stage.name,
        parentInstanceId: parent.id === actor.instanceId ? parent.id : null,
        origin: HOOK_ORIGIN[actor.mover] ?? null,
      });
      console.log(
        `[dispatch] ${project.name}: ${task.id} entered ${stage.name}, which runs ${runs}; ${counted(live, "attempt is", "attempts are")} live, the cap is ${project.maxAttempts}, so its start waits for a slot.`
      );
      return;
    }
    const unstarted = (why: string) => {
      console.warn(
        `[dispatch] ${task.id}: ${how}, and it did not start: ${why}`
      );
      return why;
    };
    try {
      // A move or filing in is someone's ask: not capped.
      const origin = HOOK_ORIGIN[actor.mover];
      const started = await startAttempt(project.id, task.id, parent, {
        stage,
        ...(origin ? { origin } : {}),
      });
      if (started instanceof ElysiaStatus) {
        return unstarted(started.response.detail);
      }
    } catch (error) {
      return unstarted(error instanceof Error ? error.message : String(error));
    }
  };

  /**
   * A task entered an `active` stage, by a move or filed straight into it:
   * one that runs a type starts it, and any other starts it while the
   * project dispatches ({@link hookStart}); one with a live attempt keeps
   * it. One whose start cannot go goes on to its todo stage
   * ({@link nobodyOn}). A tracker's is a person's work elsewhere: only a
   * `runs:` starts for it.
   */
  const hooked = async (event: {
    actor: TaskActor;
    id: string;
    projectId: string;
    to: string;
  }) => {
    const { projectId, id, to, actor } = event;
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const stage = stages.stages.find((each) => each.name === to);
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    // The hub's own moves never reach here but a tracker's (taskChanged).
    const held = actor.tracker === undefined;
    const { runs } = stage?.hooks ?? {};
    if (!(
      stage?.kind === "active" &&
      (runs || (held && project.dispatch && project.eventsOn))
    )) {
      return;
    }
    const task = await tasks.get(projectId, id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    if (task.liveAttempt) {
      return;
    }
    const failed = await hookStart(
      project,
      task,
      stage,
      actor,
      runs
        ? `It entered ${to}, which runs ${runs}`
        : `It entered ${to}, and ${project.name} starts attempts on its own`
    );
    if (held && failed) {
      return await nobodyOn(
        projectId,
        id,
        to,
        `its attempt in ${to} did not start (${failed})`
      );
    }
  };

  /**
   * The stage kind an attempt that ended sends its task to: done, or `you`
   * while the pull request it opened waits for review, or while the
   * follow-up of its landed work ended without landing (its `error`,
   * work-items.ts `finish`); back to todo when it failed or was cancelled.
   */
  const kindAfter = (item: WorkItemRow): AttemptLanding => {
    if (item.state !== "done") {
      return "todo";
    }
    return item.error || (item.lands === "pr" && item.prUrl) ? "you" : "done";
  };

  /**
   * Review before done (stages.ts `ruledStages`): its done stage is entered
   * by you alone, and a `you` stage stands before it, so a task whose
   * attempt landed waits there for you.
   */
  const reviewsFirst = (stages: { stages: readonly Stage[] }): boolean =>
    stages.stages.find((each) => each.kind === "done")?.hooks.by === "you" &&
    stages.stages.some((each) => each.kind === "you");

  /**
   * Landed work whose follow-up ended without landing (a done item's
   * `error`, work-items.ts `finish`): the reason, noted on its task, which
   * waits for you with it ({@link kindAfter}).
   */
  const noteFollowUp = async (
    projectId: string,
    taskId: string,
    item: WorkItemRow
  ) => {
    if (!(item.state === "done" && item.error)) {
      return;
    }
    const noted = await tasks.comment(
      projectId,
      taskId,
      `Attempt ${short(item.id)}'s work stays landed. Its follow-up ended without landing:\n\n${item.error}`,
      hubActor(`attempt ${short(item.id)}'s follow-up ended`)
    );
    return noted instanceof ElysiaStatus ? noted : undefined;
  };

  /**
   * The hub's move of a task after its attempt ended: done to the first done
   * stage, a pull request to the first `you` stage (staying put without one),
   * otherwise back to the first todo stage.
   */
  const settle = async (item: WorkItemRow) => {
    const { projectId, taskId } = item;
    if (!(projectId && taskId && db.project(projectId))) {
      return;
    }
    // Only the task's newest attempt moves it.
    const newest = db
      .projectAttempts(projectId)
      .find((each) => each.taskId === taskId);
    if (newest?.id !== item.id) {
      return;
    }
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    if (stages.problems.length > 0) {
      console.warn(
        `[dispatch] ${taskId}'s attempt ${item.id} is ${item.state}, and stages.md does not read, so the task stays where it is.`
      );
      return;
    }
    const task = await tasks.get(projectId, taskId);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    // You closed it while the attempt ran: that stands.
    if (task.kind === "done" || task.kind === "dropped") {
      return;
    }
    const noted = await noteFollowUp(projectId, taskId, item);
    if (noted) {
      return noted;
    }
    return await (task.parts.length > 0
      ? settleWhole(projectId, task, item, stages)
      : settleOne(projectId, task, item, stages));
  };

  /** {@link settle} for a task with no parts: done, review, or back to todo, as its attempt ended. */
  const settleOne = async (
    projectId: string,
    task: TaskView,
    item: WorkItemRow,
    stages: { stages: readonly Stage[] }
  ) => {
    const taskId = task.id;
    const criteria = criteriaOf(task.acceptance);
    const judged = await kindAfterJudged(projectId, task, criteria, item);
    if (judged instanceof ElysiaStatus) {
      return judged;
    }
    // The project's conversation judges, or Jev did not answer: the task
    // stays where it is.
    if (judged === "conversation" || judged === "stays") {
      return;
    }
    const kind = judged === "done" && reviewsFirst(stages) ? "you" : judged;
    const target = stages.stages.find((each) => each.kind === kind);
    // Only an approved action enters a `by: action` stage (§5.2): the task stays.
    if (target?.hooks.by === "action") {
      console.info(
        `[dispatch] ${taskId}'s attempt ${item.id} is ${item.state}; ${target.name} is entered only by an approved action, so the task stays in ${task.stage}.`
      );
      return;
    }
    if (!target || target.name === task.stage) {
      return;
    }
    // Closed because Jev showed its criteria met: the same write ticks them.
    const moved = await tasks.move(
      projectId,
      taskId,
      target.name,
      hubActor(movedBecause(item, judged, kind, criteria.length)),
      undefined,
      { tickCriteria: closedMet(judged, kind, criteria.length) }
    );
    return moved instanceof ElysiaStatus ? moved : undefined;
  };

  /**
   * A coordinator ended: its whole closes once every part is done or
   * dropped, however it ended (it has reported). With parts still open, a
   * coordinator that finished leaves the whole where it is, to close on its
   * own when its last part is done; one that failed or was stopped sends it
   * back to its first `todo` stage, marked as such, as any attempt does.
   */
  const settleWhole = async (
    projectId: string,
    task: TaskView,
    item: WorkItemRow,
    stages: { stages: readonly Stage[] }
  ) => {
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const closed = task.parts.every((id) => {
      const kind = list.tasks.find((each) => each.id === id)?.kind;
      return kind === "done" || kind === "dropped";
    });
    // A coordinator that finished with parts open leaves the whole where it is.
    if (!closed && item.state === "done") {
      return;
    }
    const kind = closed ? "done" : "todo";
    const target = stages.stages.find((each) => each.kind === kind);
    if (!target || target.name === task.stage || target.hooks.by === "action") {
      return;
    }
    const moved = await tasks.move(
      projectId,
      task.id,
      target.name,
      hubActor(
        closed
          ? `its coordinator ${short(item.id)} reported and every part is done${landedAs(item)}`
          : `its coordinator ${short(item.id)} ${item.state}`
      )
    );
    return moved instanceof ElysiaStatus ? moved : undefined;
  };

  /**
   * The stage kind an ended attempt sends its task to, once a landed one's
   * acceptance criteria are judged ({@link judgeCriteria}); `conversation` while it
   * judges them, `stays` when Jev did not answer.
   */
  const kindAfterJudged = async (
    projectId: string,
    task: TaskView,
    criteria: string[],
    item: WorkItemRow
  ) => {
    const kind = kindAfter(item);
    return kind === "done" && criteria.length > 0
      ? await judgeCriteria(projectId, task, criteria, item)
      : kind;
  };

  /**
   * A close because Jev showed every acceptance criterion met: its reason
   * says so ({@link movedBecause}) and its move ticks them (tasks.ts `move`).
   */
  const closedMet = (
    judged: AttemptLanding,
    kind: AttemptLanding,
    criteria: number
  ): boolean => judged === "done" && kind === "done" && criteria > 0;

  /**
   * Why the hub moved a task after its attempt ended, as its commit says:
   * `judged` is where its attempt sent it, `kind` where it went (review, for
   * a done in a project that reviews before done), and the commit its work
   * landed as ({@link landedAs}).
   */
  const movedBecause = (
    item: WorkItemRow,
    judged: AttemptLanding,
    kind: AttemptLanding,
    criteria: number
  ): string => `${movedFor(item, judged, kind, criteria)}${landedAs(item)}`;

  /** {@link movedBecause} but the commit. */
  const movedFor = (
    item: WorkItemRow,
    judged: AttemptLanding,
    kind: AttemptLanding,
    criteria: number
  ): string => {
    if (judged === "done" && kind === "you") {
      return `attempt ${short(item.id)} ${item.state}; this project reviews before done, so it waits for you`;
    }
    if (kind === "you" && item.state === "done" && item.error) {
      return `attempt ${short(item.id)}'s work stays landed; its follow-up ended without landing, so it waits for you`;
    }
    if (kind === "you" && item.prUrl && item.lands === "pr") {
      return `attempt ${short(item.id)} opened ${item.prUrl}`;
    }
    if (kind === "you") {
      return `attempt ${short(item.id)} ${item.state}; with Jev and events off, its acceptance criteria wait for you`;
    }
    if (kind === "todo" && item.state === "done") {
      return `attempt ${short(item.id)} ${item.state}; Jev does not show its acceptance criteria met`;
    }
    return closedMet(judged, kind, criteria)
      ? `attempt ${short(item.id)} ${item.state}; Jev shows its ${criteria} acceptance criteria met`
      : `attempt ${short(item.id)} ${item.state}`;
  };

  /**
   * Judged checks (§5.9) for an attempt that landed at a task with
   * acceptance criteria: never by the session that did the work. Jev on:
   * done when Jev shows every criterion met; else back to `todo`, as a
   * failed attempt lands, with a comment naming the ones it does not, the
   * attempt stamped unmet so the task counts it failed (tasks.ts
   * `lastAttemptFailed`) and its starter retries it or moves on. A Jev that
   * does not answer leaves the task where it is (`stays`), its work landed,
   * with a comment saying so. Jev off: the project's conversation judges
   * them (`conversation`: it is woken, the task stays); with events off,
   * shell checks passed and the rest is yours.
   */
  const judgeCriteria = async (
    projectId: string,
    task: TaskView,
    criteria: string[],
    item: WorkItemRow
  ) => {
    const report = attemptReport(item);
    const access = placement.access();
    if (access) {
      return await judgedByJev(access, projectId, task, criteria, item);
    }
    if (db.project(projectId)?.eventsOn) {
      offLine(
        "judged",
        projectId,
        `${task.id}'s attempt ${short(item.id)} passed its checks; its ${criteria.length} acceptance criteria go to the project's conversation, which did not do the work`
      );
      placement.judgeByLead(
        projectId,
        task,
        item,
        `Judge ${taskLink(projectId, task.id, task.title)}: ${attemptNamed(item, task)} passed its checks and its work is in, and its acceptance criteria wait for your judgment (Jev is off; you did not do this work). Move the task to its done stage when the report shows every criterion met; else move it back to its todo stage with a task_comment naming what is missing.\n\nCriteria:\n${criteria.map((each) => `- ${each}`).join("\n")}\n\nThe attempt's report:\n\n${tailOf(report, 4000)}`
      );
      return "conversation";
    }
    offLine(
      "judged",
      projectId,
      `${task.id}'s attempt ${short(item.id)} passed its shell checks; with events off its ${criteria.length} acceptance criteria go to you`
    );
    return "you";
  };

  /**
   * {@link judgeCriteria} with Jev on: done when Jev shows every criterion
   * met; else back to todo, with a comment naming the ones it does not and
   * the attempt stamped unmet; `stays`, with a comment, when Jev does not
   * answer.
   */
  const judgedByJev = async (
    access: JevAccess,
    projectId: string,
    task: TaskView,
    criteria: string[],
    item: WorkItemRow
  ) => {
    const about = hubActor(`attempt ${short(item.id)} judged`);
    try {
      const judged = await jevJudged(
        access,
        projectId,
        task,
        criteria,
        attemptReport(item)
      );
      const unmet = judged.filter((each) => !each.met);
      if (unmet.length === 0) {
        return "done";
      }
      const said = await tasks.comment(
        projectId,
        task.id,
        judgedWords.notShownMet(
          attemptNamed(item, task),
          unmet
            .map((each) => `- ${each.criterion} (${each.noul.toFixed(2)})`)
            .join("\n")
        ),
        about
      );
      if (said instanceof ElysiaStatus) {
        return said;
      }
      db.markAttemptUnmet(item.id);
      return "todo";
    } catch (error) {
      if (!(error instanceof JevFailed)) {
        throw error;
      }
      const said = await tasks.comment(
        projectId,
        task.id,
        judgedWords.notJudged(
          error.message,
          attemptNamed(item, task),
          task.stage
        ),
        about
      );
      return said instanceof ElysiaStatus ? said : "stays";
    }
  };

  /**
   * Who an attempt you start from the dashboard reports to: the session
   * named, or the project's Caw, started for it on or off (it is your work);
   * refused when neither can take reports.
   */
  const reporter = async (
    projectId: string,
    parentInstanceId: string | undefined
  ) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    if (!parentInstanceId) {
      const conversation = await conversationOf(project, "you");
      if (conversation instanceof ElysiaStatus) {
        return conversation;
      }
      return conversation
        ? conversation
        : problem(409, {
            code: "dispatch-no-reporter",
            detail: `Nobody can take this attempt's report. ${NO_LEAD}`,
          });
    }
    const parent = instance(parentInstanceId);
    const unfit = parentProblem(parent, projectId, parentInstanceId);
    if (!parent) {
      return problem(404, {
        code: "dispatch-parent-unknown",
        detail: unfit ?? `No session ${parentInstanceId}.`,
      });
    }
    return unfit
      ? problem(409, { code: "dispatch-parent-unfit", detail: unfit })
      : parent;
  };

  /**
   * A work item ended: its task moves, and its project is looked at again.
   * One that is no attempt may still have held files a queued start waits
   * for, so its project is looked at when it has queued starts.
   */
  const itemEnded = (item: WorkItemRow): void => {
    const { projectId } = item;
    if (!projectId) {
      return;
    }
    if (!item.taskId) {
      if (db.queuedTaskStarts(projectId).length > 0) {
        evaluate(projectId);
      }
      return;
    }
    const unmoved = (why: string) =>
      console.warn(
        `[dispatch] ${item.taskId}'s attempt ${item.id} ended ${item.state}, and the task did not move: ${why}`
      );
    settle(item)
      .then(
        (refused) => {
          if (refused) {
            unmoved(refused.response.detail);
          }
        },
        (error: unknown) =>
          unmoved(error instanceof Error ? error.message : String(error))
      )
      .finally(() => evaluate(projectId));
  };

  /**
   * A change to a project's tasks: a hook may run, and the frontier may have
   * moved. A move takes back the start its task waited for in the stage it
   * left (a move into a `runs:` stage queues one again).
   */
  /**
   * The lead's verdict that a landed attempt it was woken to judge (Jev off,
   * events on: {@link judgeCriteria}'s `conversation`) did not meet its
   * acceptance criteria is its move of the task back to a todo stage. That
   * move stamps the attempt unmet, as Jev's own verdict does, so the task
   * counts it failed and stays off the frontier until task_retry. Told by:
   * the project's conversation moving a task with acceptance criteria into
   * a todo stage while its newest attempt is done, landed whole (no
   * follow-up `error`) and not stamped yet.
   */
  const leadSentBack = async (event: Extract<TaskEvent, { kind: "moved" }>) => {
    const { actor, projectId, id, to } = event;
    if (
      actor.mover !== "session" ||
      !actor.instanceId ||
      actor.instanceId !== db.project(projectId)?.conversationInstanceId
    ) {
      return;
    }
    const [newest] = db
      .projectAttempts(projectId)
      .filter((item) => item.taskId === id);
    if (newest?.state !== "done" || newest.error || newest.unmetAt) {
      return;
    }
    const stages = await tasks.stages(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    if (stages.stages.find((each) => each.name === to)?.kind !== "todo") {
      return;
    }
    const task = await tasks.get(projectId, id);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    if (criteriaOf(task.acceptance).length === 0) {
      return;
    }
    db.markAttemptUnmet(newest.id);
    console.log(
      `[dispatch] ${id}: the project's conversation sent it back to ${to}; its attempt ${short(newest.id)} counts as unmet, and the task waits for task_retry.`
    );
  };

  const taskChanged = (event: TaskEvent): void => {
    if (event.kind === "moved") {
      db.dropQueuedTaskStart(event.projectId, event.id);
    }
    // The hub's own moves start nothing; one a tracker brings is a person's.
    if (
      event.kind !== "changed" &&
      (event.actor.mover !== "hub" || event.actor.tracker !== undefined)
    ) {
      const entered = event.kind === "moved" ? event.to : event.stage;
      const said = (how: string) => (why: string) =>
        console.warn(`[dispatch] ${event.id} ${how} ${entered}: ${why}`);
      const moved = said("moved to");
      const hookedIn = said("entered");
      // The lead's verdict is stamped before the project is looked at again.
      (event.kind === "moved" ? leadSentBack(event) : Promise.resolve())
        .then(
          (refused) => {
            if (refused) {
              moved(refused.response.detail);
            }
          },
          (error: unknown) =>
            moved(error instanceof Error ? error.message : String(error))
        )
        .then(() => hooked({ ...event, to: entered }))
        .then(
          (refused) => {
            if (refused) {
              hookedIn(refused.response.detail);
            }
          },
          (error: unknown) =>
            hookedIn(error instanceof Error ? error.message : String(error))
        )
        .finally(() => evaluate(event.projectId));
      return;
    }
    evaluate(event.projectId);
  };

  /** A runs_on as a settings change writes it: empty clears it, as null does; refused when it names no capability and no machine the hub knows. */
  const runsOnOf = (written: string | null | undefined) => {
    const runsOn =
      written?.trim() || (written === undefined ? undefined : null);
    if (!runsOn) {
      return runsOn;
    }
    const checked = runsOnValue(runsOn, db.listAgents());
    return "value" in checked
      ? checked.value
      : problem(400, {
          code: "dispatch-runs-on-unknown",
          detail: checked.problem,
        });
  };

  return {
    startAttempt,
    evaluate,
    itemEnded,
    taskChanged,

    /**
     * Retries a task whose last attempt failed or was cancelled: a fresh
     * session in that attempt's workspace when its clone is still there,
     * else in a new one, briefed with the failure and the to-dos as they
     * stand, reporting to `parent`. Not capped: a person asked for it.
     */
    retryAttempt(projectId: string, ref: string, parent: InstanceRow) {
      return startAttempt(projectId, ref, parent, { retry: true });
    },

    /** A retry you start from the dashboard: it reports to the session named, or the project's Caw. */
    async retryFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ) {
      const parent = await reporter(projectId, parentInstanceId);
      return parent instanceof ElysiaStatus
        ? parent
        : await startAttempt(projectId, ref, parent, {
            retry: true,
            origin: "you",
          });
    },

    /**
     * A pull request an attempt opened has merged: its task moves to the
     * first `done` stage, as the hub. This is what a poller of GitHub calls
     * (the PR ingress of P3); a task closed or dropped since stays where it
     * is. Answers where the task is now, or undefined when no attempt this
     * hub knows opened that pull request.
     */
    async pullRequestMerged(url: string) {
      const item = db.workItemByPrUrl(url);
      const { projectId, taskId } = item ?? {};
      if (!(item && projectId && taskId && db.project(projectId))) {
        return;
      }
      const stages = await tasks.stages(projectId);
      if (stages instanceof ElysiaStatus) {
        return stages;
      }
      if (stages.problems.length > 0) {
        return problem(409, {
          code: "dispatch-merged-stages-unread",
          detail: `${url} merged, but stages.md does not read, so ${taskId} stays where it is. ${stages.problems.join(" ")}`,
        });
      }
      const task = await tasks.get(projectId, taskId);
      if (task instanceof ElysiaStatus) {
        return task;
      }
      const target = stages.stages.find((each) => each.kind === "done");
      if (
        task.kind === "done" ||
        task.kind === "dropped" ||
        !target ||
        target.name === task.stage ||
        // Only an approved action enters a `by: action` stage (§5.2).
        target.hooks.by === "action"
      ) {
        return { projectId, task: taskId, stage: task.stage };
      }
      const moved = await tasks.move(
        projectId,
        taskId,
        target.name,
        hubActor(`pull request merged: ${url}`)
      );
      return moved instanceof ElysiaStatus
        ? moved
        : { projectId, task: taskId, stage: moved.stage };
    },

    /** Why the hub last could not start an attempt at a task, while the task file is as it was then. */
    problemOf(
      projectId: string,
      task: { hash: string; id: string }
    ): string | null {
      const misfit = problems.get(keyOf(projectId, task.id));
      return misfit?.hash === task.hash ? misfit.message : null;
    },

    /**
     * A machine connected, or its sign-ins changed: every project with a
     * checkout there, or whose work now runs there (its folder on the hub,
     * the hub's machine back), gets another look, its old start failures
     * forgotten.
     */
    machineOnline(machineId: string): void {
      for (const project of db.listProjects()) {
        const place = workPlace(project);
        if (
          project.places.some(
            (each) => each.kind === "checkout" && each.machineId === machineId
          ) ||
          (place.kind !== "none" && place.machineId === machineId)
        ) {
          for (const key of problems.keys()) {
            if (key.startsWith(`${project.id}\0`)) {
              problems.delete(key);
            }
          }
          evaluate(project.id);
        }
      }
    },

    /** The project's dispatch settings and what the dispatcher would do now. */
    async view(projectId: string) {
      const project = projectOf(projectId);
      return project instanceof ElysiaStatus ? project : await viewOf(project);
    },

    /** Changes a project's dispatch settings, then looks at it again. */
    async configure(projectId: string, change: DispatchChange) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const misfit = dispatchProblem(change);
      if (misfit) {
        return problem(400, {
          code: "dispatch-settings-unfit",
          detail: misfit,
        });
      }
      const runsOn = runsOnOf(change.runsOn);
      if (runsOn instanceof ElysiaStatus) {
        return runsOn;
      }
      db.setProjectDispatch(projectId, columnsOf({ ...change, runsOn }));
      evaluate(projectId);
      const now = projectOf(projectId);
      return now instanceof ElysiaStatus ? now : await viewOf(now);
    },

    /**
     * An attempt you start from the dashboard: it reports to the session
     * named, or the project's Caw.
     */
    async startFor(
      projectId: string,
      ref: string,
      parentInstanceId: string | undefined
    ) {
      const parent = await reporter(projectId, parentInstanceId);
      return parent instanceof ElysiaStatus
        ? parent
        : await startAttempt(projectId, ref, parent, { origin: "you" });
    },

    /** Starts the safety net: a look at every dispatching project every few minutes. */
    watch(): void {
      if (watching) {
        return;
      }
      watching = true;
      lifetime.every(SAFETY_MS, () => {
        for (const project of db.listProjects()) {
          if (
            (project.dispatch && project.eventsOn) ||
            db.queuedTaskStarts(project.id).length > 0
          ) {
            evaluate(project.id);
          }
        }
      });
    },
  };
};

export type Dispatcher = ReturnType<typeof createDispatcher>;

/** Who starts an attempt by hand: the session it reports to, when one does. */
const ATTEMPT_FROM = t.Object({ parentInstanceId: t.Optional(t.String()) });

/**
 * The dashboard's routes for a project's dispatch, and for starting an
 * attempt at a task by hand.
 */
export const dispatchRoutes = (dispatcher: Dispatcher) =>
  new Elysia()
    .get("/api/projects/:id/dispatch", ({ params }) =>
      dispatcher.view(params.id)
    )
    // Where a project's work lands is changed with its other details
    // (`PATCH /api/projects/:id`, project-edit.ts), which every dashboard hears.
    .patch(
      "/api/projects/:id/dispatch",
      {
        body: t.Object({
          budget: t.Optional(t.Nullable(BUDGET)),
          dispatch: t.Optional(t.Boolean()),
          maxAttempts: t.Optional(t.Integer()),
          reviewLimit: t.Optional(t.Integer()),
          runsOn: t.Optional(t.Nullable(t.String())),
        }),
      },
      ({ params, body }) => dispatcher.configure(params.id, body)
    )
    .post(
      "/api/projects/:id/tasks/:taskId/attempts",
      { body: ATTEMPT_FROM },
      ({ params, body, request, server }) => {
        // A workspace is cut on a machine; that can take a while.
        server?.timeout(request, 0);
        return dispatcher.startFor(
          params.id,
          params.taskId,
          body.parentInstanceId
        );
      }
    )
    // A fresh attempt at a task whose last one failed, in that attempt's
    // workspace when its clone is still there.
    .post(
      "/api/projects/:id/tasks/:taskId/retry",
      { body: ATTEMPT_FROM },
      ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        return dispatcher.retryFor(
          params.id,
          params.taskId,
          body.parentInstanceId
        );
      }
    );
