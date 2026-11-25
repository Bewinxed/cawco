import type { PlanStep, TaskTodo } from "@cawco/core/plan";
import type {
  DelegateSessionRecord,
  PlanTaskRecord,
  PlanViewDataset,
} from "./types.js";

const ARTIFACT_ROLLOUT = "c8f41d20-7b1a-4e92-9c31-0f8a4b219011";
const ARTIFACT_CONTRAST = "91e04b12-3c88-47a1-b122-5541a9e302c4";
const DELEGATE_STREAM_UUID = "4a82f109-62be-419c-8133-9f22c8104a12";

const td = (
  id: string,
  path: string,
  text: string,
  done: boolean,
  extra?: { depth?: number; promoted?: string; proposed?: boolean }
): TaskTodo => ({
  id,
  path,
  text,
  done,
  depth: extra?.depth ?? 0,
  promoted: extra?.promoted ?? null,
  proposed: extra?.proposed ?? false,
});

const REALISTIC_DELEGATES: DelegateSessionRecord[] = [
  {
    id: "del-resync",
    title: "Harden delta gap recovery",
    harness: "claude",
    machine: "obelisk",
    identity: 6,
    state: "running",
    assignedTaskIds: ["tsk-504"],
    liveLine:
      "Checking that reconnect bursts send a single resync request per session",
    plan: {
      source: "cawco",
      taskId: "tsk-504",
      steps: [
        {
          id: "tsk-504:td-1",
          task: "tsk-504",
          todo: "td-1",
          depth: 0,
          status: "completed",
          content: "Copy held plan state before applying incoming patches",
        },
        {
          id: "tsk-504:td-2",
          task: "tsk-504",
          todo: "td-2",
          depth: 0,
          status: "completed",
          content: "Ignore out-of-date frames whose revision already landed",
        },
        {
          id: "tsk-504:td-3",
          task: "tsk-504",
          todo: "td-3",
          depth: 0,
          status: "in_progress",
          content:
            "Coalesce missed revisions into one resync request per session",
        },
        {
          id: "tsk-504:td-4",
          task: "tsk-504",
          todo: "td-4",
          depth: 0,
          status: "pending",
          content: "Run the reconnect interleaving sweep across handovers",
        },
      ],
    },
  },
  {
    id: "del-sheet",
    title: "Polish mobile sheet and touch fields",
    harness: "opencode",
    machine: "studio.local",
    identity: 2,
    state: "running",
    assignedTaskIds: ["tsk-505"],
    liveLine:
      "Verifying text selection inside 44px touch targets at 390px phone width",
    plan: {
      source: "cawco",
      taskId: "tsk-505",
      steps: [
        {
          id: "tsk-505:td-1",
          task: "tsk-505",
          todo: "td-1",
          depth: 0,
          status: "completed",
          content:
            "Open the bottom task sheet with a 100×6 grabber below 900px",
        },
        {
          id: "tsk-505:td-2",
          task: "tsk-505",
          todo: "td-2",
          depth: 0,
          status: "in_progress",
          content:
            "Keep text selection working inside touch-target rows on iOS Safari",
        },
        {
          id: "tsk-505:td-3",
          task: "tsk-505",
          todo: "td-3",
          depth: 0,
          status: "pending",
          content:
            "Keep the note composer clear of the bottom safe area when the keyboard opens",
        },
      ],
    },
  },
  {
    id: "del-swift",
    title: "Regenerate iOS plan strings",
    harness: "pi",
    machine: "mini.local",
    identity: 4,
    state: "done",
    assignedTaskIds: ["tsk-502"],
    plan: {
      source: "cawco",
      taskId: "tsk-502",
      steps: [
        {
          id: "tsk-502:td-1",
          task: "tsk-502",
          todo: "td-1",
          depth: 0,
          status: "completed",
          content: "Add shared off-board step wording to core plan words",
        },
        {
          id: "tsk-502:td-2",
          task: "tsk-502",
          todo: "td-2",
          depth: 0,
          status: "completed",
          content: "Regenerate Swift bindings and confirm zero diff",
        },
      ],
    },
  },
];

const REALISTIC_TASKS: Record<string, PlanTaskRecord> = {
  "tsk-501": {
    id: "tsk-501",
    title: "Turn off built-in harness todo lists when CawCo starts a session",
    stage: "Done",
    stageKind: "done",
    summary:
      "Every session uses CawCo's single plan list so edits from the operator and steps written by the harness never drift apart.",
    acceptance: [
      "Claude Code built-in todo tools denied in spawn options without touching personal CLI settings",
      "OpenCode built-in plan agent turned off on launched servers",
    ],
    labels: ["agent", "harnesses"],
    after: [],
    unblocks: ["tsk-504", "tsk-505"],
    todos: [
      td(
        "td-1",
        "1",
        "Deny built-in todo tools in session start options",
        true
      ),
      td(
        "td-2",
        "2",
        "Turn off built-in plan mode in OpenCode server launch config",
        true
      ),
      td(
        "td-3",
        "3",
        "Confirm standalone CLI sessions started by hand keep their default tools",
        true
      ),
    ],
  },
  "tsk-502": {
    id: "tsk-502",
    title: "Keep shared plan wording in sync across web and iOS builds",
    stage: "Done",
    stageKind: "done",
    delegateId: "del-swift",
    summary:
      "Generates web dashboard strings and iOS Swift strings from one shared source so labels never diverge.",
    acceptance: ["Generated Swift strings match shared core plan words"],
    labels: ["words", "ios"],
    after: ["tsk-501"],
    unblocks: ["tsk-505"],
    todos: [
      td("td-1", "1", "Add off-board step wording to core plan words", true),
      td("td-2", "2", "Regenerate Swift bindings and verify zero diff", true),
    ],
  },
  "tsk-503": {
    id: "tsk-503",
    title: "Keep operator notes attached when a session rewrites its plan",
    stage: "Done",
    stageKind: "done",
    summary:
      "When an agent updates its session plan, notes from the operator stay attached to the same task or to-do instead of getting wiped.",
    acceptance: [
      "Preserved notes stay ordered chronologically",
      "Refuses a write once if it would silently drop an unread operator edit",
    ],
    labels: ["hub", "plans"],
    after: ["tsk-501"],
    unblocks: ["tsk-504"],
    todos: [
      td("td-1", "1", "Match existing notes by task and to-do handle", true),
      td(
        "td-2",
        "2",
        "Refuse overwrites once when unread operator edits would be lost",
        true
      ),
      td("td-3", "3", "Split mobile sheet polish into its own task", true, {
        promoted: "tsk-505",
      }),
    ],
  },
  "tsk-504": {
    id: "tsk-504",
    title: "Keep live plan updates in sync across reconnects",
    stage: "Working",
    stageKind: "active",
    delegateId: "del-resync",
    summary:
      "Applies sequential plan patches by revision and requests a single fresh snapshot whenever a reconnect skips a revision.",
    acceptance: [
      "Out-of-order patches never leave plan state half-applied",
      "At most one resync request is sent per session during a gap",
    ],
    labels: ["hub", "stream"],
    after: ["tsk-501", "tsk-503"],
    unblocks: ["tsk-507", "tsk-508"],
    todos: [
      td(
        "td-1",
        "1",
        "Copy held plan state before applying incoming patches",
        true
      ),
      td(
        "td-2",
        "2",
        "Ignore out-of-date frames whose revision already landed",
        true
      ),
      td(
        "td-3",
        "3",
        "Coalesce missed revisions into one resync request per session",
        false
      ),
      td(
        "td-3a",
        "3.1",
        "Clear the pending resync flag only when the fresh snapshot arrives",
        false,
        { depth: 1 }
      ),
      td(
        "td-3b",
        "3.2",
        "Send a full snapshot when a patch changes more than half the plan",
        false,
        { depth: 1 }
      ),
      td(
        "td-4",
        "4",
        "Run the reconnect interleaving sweep across handovers",
        false
      ),
    ],
  },
  "tsk-505": {
    id: "tsk-505",
    title: "Build the nested session plan view for desk and phone",
    stage: "Working",
    stageKind: "active",
    delegateId: "del-sheet",
    summary:
      "Shows the plan, its tasks, and active to-dos as three calm nested levels at 1440px and 390px, disclosing full details and editing when a task is opened.",
    acceptance: [
      "Plan, task, and to-do read as three nested levels at a glance",
      "Every action is named by what it does and works by keyboard and touch",
    ],
    labels: ["dashboard", "ui"],
    after: ["tsk-502"],
    unblocks: ["tsk-509"],
    todos: [
      td(
        "td-1",
        "1",
        "Open the bottom task sheet with a 100×6 grabber below 900px",
        true
      ),
      td(
        "td-2",
        "2",
        "Keep text selection working inside touch-target rows on iOS Safari",
        false
      ),
      td(
        "td-3",
        "3",
        "Keep the note composer clear of the bottom safe area when the keyboard opens",
        false
      ),
      td(
        "td-4",
        "4",
        "Add keyboard up and down shortcuts across plan tasks",
        false,
        { proposed: true }
      ),
    ],
  },
  "tsk-506": {
    id: "tsk-506",
    title: "Move task and plan screens onto the 4px spacing grid",
    stage: "Waiting",
    stageKind: "you",
    summary:
      "Applies 4px spacing tokens to task and plan screens once you choose the rollout boundary on the decision page and the contrast baseline pull request merges.",
    acceptance: [
      "Every derived spacing token is redeclared cleanly inside the 4px grid scope",
      "Subtle text holds 4.5:1 contrast on recessed wells in both light and dark themes",
    ],
    labels: ["tokens", "design"],
    after: ["tsk-501"],
    unblocks: ["tsk-509"],
    todos: [
      td(
        "td-1",
        "1",
        "Audit derived spacing tokens inside the 4px grid scope",
        true
      ),
      td(
        "td-2",
        "2",
        "Pick the rollout boundary on the 4px Grid Rollout decision page",
        false
      ),
      td(
        "td-3",
        "3",
        "Merge pull request #614 with the updated contrast table",
        false
      ),
    ],
  },
  "tsk-507": {
    id: "tsk-507",
    title:
      "Batch rapid plan edits over three seconds before waking an idle session",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Rewords, additions, removals, and notes wait 3 seconds after the last edit so a burst of changes wakes an idle session once with one consolidated summary.",
    acceptance: [
      "Four edits within 3 seconds send a single wake message",
      "Ticking or reordering steps never wakes an idle session on its own",
    ],
    labels: ["hub", "triggers"],
    after: ["tsk-504"],
    unblocks: ["tsk-508"],
    todos: [
      td(
        "td-1",
        "1",
        "Group waking plan edits over a 3-second quiet window",
        false
      ),
      td(
        "td-2",
        "2",
        "Deliver delegate plan edits through the parent session",
        false
      ),
      td(
        "td-3",
        "3",
        "Reopen ended sessions with their open tasks when edited",
        false
      ),
    ],
  },
  "tsk-508": {
    id: "tsk-508",
    title: "Clear settled pull request and task holds automatically",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Watches open waits so a merged pull request or finished blocking task clears the hold and resumes the plan without manual cleanup.",
    acceptance: [
      "Merged pull requests clear their wait and broadcast an immediate update",
    ],
    labels: ["hub", "waits"],
    after: ["tsk-504", "tsk-507"],
    unblocks: ["tsk-509"],
    todos: [
      td(
        "td-1",
        "1",
        "Connect plan holds to the shared wait settlement watcher",
        false
      ),
      td(
        "td-2",
        "2",
        "Broadcast a live patch removing the hold as soon as it settles",
        false
      ),
    ],
  },
  "tsk-509": {
    id: "tsk-509",
    title: "Run the full repository check suite across light and dark themes",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Final verification pass across type-checking, design rules, contrast floors, unused exports, and copy-paste detection.",
    acceptance: [
      "bun run check passes with zero warnings or errors",
      "Phone (390px) and desk (1440px) views hold clean alignment in light and dark",
    ],
    labels: ["release", "check"],
    after: ["tsk-505", "tsk-506", "tsk-508"],
    unblocks: [],
    todos: [
      td("td-1", "1", "Pass full type-checking and house design lints", false),
      td(
        "td-2",
        "2",
        "Verify 390px phone and 1440px desk stories in light and dark",
        false
      ),
    ],
  },
};

const REALISTIC_STEPS: PlanStep[] = [
  {
    id: "tsk-501",
    task: "tsk-501",
    depth: 0,
    status: "completed",
    content: REALISTIC_TASKS["tsk-501"].title,
  },
  {
    id: "tsk-502",
    task: "tsk-502",
    depth: 0,
    status: "completed",
    content: REALISTIC_TASKS["tsk-502"].title,
  },
  {
    id: "tsk-503",
    task: "tsk-503",
    depth: 0,
    status: "completed",
    content: REALISTIC_TASKS["tsk-503"].title,
  },
  {
    id: "tsk-498",
    task: "tsk-498",
    depth: 0,
    status: "pending",
    gone: true,
    content: "Prototype standalone plan drawer",
    comments: [
      {
        at: "2026-11-24T13:18:00.000Z",
        text: "Folded this early prototype spike into the main plan view task — safe to remove from the plan.",
      },
    ],
  },
  {
    id: "tsk-504",
    task: "tsk-504",
    depth: 0,
    status: "in_progress",
    content: REALISTIC_TASKS["tsk-504"].title,
    comments: [
      {
        at: "2026-11-24T13:42:00.000Z",
        text: "Key the pending resync set by session alone so switching tabs quickly never sends duplicate requests.",
      },
    ],
  },
  {
    id: "tsk-504:td-3",
    task: "tsk-504",
    todo: "td-3",
    depth: 1,
    status: "in_progress",
    content: "Coalesce missed revisions into one resync request per session",
  },
  {
    id: "tsk-505",
    task: "tsk-505",
    depth: 0,
    status: "in_progress",
    content: REALISTIC_TASKS["tsk-505"].title,
  },
  {
    id: "tsk-505:td-2",
    task: "tsk-505",
    todo: "td-2",
    depth: 1,
    status: "in_progress",
    content:
      "Keep text selection working inside touch-target rows on iOS Safari",
  },
  {
    id: "tsk-506",
    task: "tsk-506",
    depth: 0,
    status: "pending",
    waitsOn: `${ARTIFACT_ROLLOUT}#grid-rollout`,
    content: REALISTIC_TASKS["tsk-506"].title,
    comments: [
      {
        at: "2026-11-24T13:55:00.000Z",
        text: "Leave Settings screen overrides untouched until Option B is confirmed on the rollout page.",
      },
    ],
  },
  {
    id: "tsk-506:td-3",
    task: "tsk-506",
    todo: "td-3",
    depth: 1,
    status: "pending",
    waitsOn: "https://github.com/bewinxed/cawco/pull/614",
    content: "Merge pull request #614 with the updated contrast table",
  },
  {
    id: "tsk-507",
    task: "tsk-507",
    depth: 0,
    status: "pending",
    content: REALISTIC_TASKS["tsk-507"].title,
  },
  {
    id: "tsk-508",
    task: "tsk-508",
    depth: 0,
    status: "pending",
    waitsOn: "tsk-504",
    content: REALISTIC_TASKS["tsk-508"].title,
  },
  {
    id: "tsk-509",
    task: "tsk-509",
    depth: 0,
    status: "pending",
    content: REALISTIC_TASKS["tsk-509"].title,
  },
];

const SHARED_WAIT_META: PlanViewDataset["waitMeta"] = {
  [`${ARTIFACT_ROLLOUT}#grid-rollout`]: {
    label: "Waiting on your choice on the 4px Grid Rollout decision page",
    detail:
      "Card “Where the 4px spacing grid lands this week” on 4px Grid Rollout needs your pick before token changes run.",
    actionLabel: "Open decision page",
  },
  [`${ARTIFACT_CONTRAST}/7`]: {
    label: "Waiting on your reply to comment #7 on Surface Contrast Audit",
    detail:
      "Comment #7 on Surface Contrast Audit asks whether dark-mode recessed wells keep their current border step.",
    actionLabel: "Open comment #7",
  },
  "https://github.com/bewinxed/cawco/pull/614": {
    label: "Waiting for pull request #614 to merge",
    detail:
      "Pull request #614 updates measured contrast figures for recessed wells and picked rows.",
    actionLabel: "Open pull request #614",
  },
  [`cawco#${DELEGATE_STREAM_UUID}`]: {
    label: "Waiting for delegate Harden delta gap recovery to finish",
    detail:
      "Settles automatically once the delegate session finishes the reconnect sync task.",
    actionLabel: "Inspect delegate",
  },
};

const BACKLOG_TASKS: PlanTaskRecord[] = [
  {
    id: "tsk-510",
    title:
      "Restore live plan subscriptions automatically after iPad split-view reconnects",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Re-sends active session subscriptions after a socket drop so side-by-side panes stay live without refreshing.",
    acceptance: ["Reconnect sends one consolidated subscription frame"],
    labels: ["stream", "ipad"],
    after: ["tsk-504"],
    unblocks: [],
    todos: [
      td("td-1", "1", "Compare subscribed sessions against open panes", false),
      td("td-2", "2", "Drop closed pane subscriptions cleanly", false),
    ],
  },
  {
    id: "tsk-511",
    title: "Summarize tasks finished and newly held while you were away",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Shows a one-line recap of tasks finished and steps that hit a hold while operator presence was away.",
    acceptance: ["Recap derives directly from task history"],
    labels: ["presence", "plans"],
    after: ["tsk-507"],
    unblocks: [],
    todos: [
      td(
        "td-1",
        "1",
        "Read task transitions since last active presence",
        false
      ),
    ],
  },
];

/** Main realistic dataset: 9 board tasks + 1 off-board step, 3 delegates, done/moving/held/ahead. */
export const REALISTIC_PLAN_DATA: PlanViewDataset = {
  session: {
    id: "ses-orchestrate-plan",
    title: "Ship live session plan sync and 4px spacing pass",
    project: "cawco",
    machine: "obelisk",
    harness: "claude",
    identity: 1,
    liveState: "working",
    liveActivity:
      "Coordinating two active delegates and preparing wake batching",
  },
  delegates: REALISTIC_DELEGATES,
  tasks: REALISTIC_TASKS,
  waitMeta: SHARED_WAIT_META,
  boardBacklog: BACKLOG_TASKS,
  plan: {
    source: "cawco",
    steps: REALISTIC_STEPS,
    changes: [
      {
        id: "chg-1",
        kind: "comment",
        step: "tsk-504",
        was: REALISTIC_TASKS["tsk-504"].title,
        words:
          "Key the pending resync set by session alone so switching tabs quickly never sends duplicate requests.",
        at: "2026-11-24T13:42:00.000Z",
        toldAt: "2026-11-24T13:42:04.000Z",
        to: { kind: "session", instanceId: "ses-orchestrate-plan" },
      },
      {
        id: "chg-2",
        kind: "reword",
        step: "tsk-506",
        was: "Migrate plan view onto 4px grid",
        words: REALISTIC_TASKS["tsk-506"].title,
        at: "2026-11-24T13:56:12.000Z",
        to: { kind: "session", instanceId: "ses-orchestrate-plan" },
      },
    ],
  },
};

/** Held-task dataset: foregrounds a step needing the person alongside scheduled and delegate waits. */
export const HELD_PLAN_DATA: PlanViewDataset = {
  ...REALISTIC_PLAN_DATA,
  session: {
    ...REALISTIC_PLAN_DATA.session,
    liveState: "waiting",
    liveActivity:
      "Waiting on your 4px Grid Rollout choice and pull request #614",
  },
  tasks: {
    ...REALISTIC_TASKS,
    "tsk-507": {
      ...REALISTIC_TASKS["tsk-507"],
      stage: "Waiting",
      stageKind: "waiting",
    },
  },
  plan: {
    ...REALISTIC_PLAN_DATA.plan,
    steps: REALISTIC_STEPS.map((s) => {
      if (s.id === "tsk-507") {
        return {
          ...s,
          waitsOn: "2026-11-25T09:00:00Z",
        };
      }
      if (s.id === "tsk-508") {
        return {
          ...s,
          waitsOn: `cawco#${DELEGATE_STREAM_UUID}`,
        };
      }
      return s;
    }),
  },
};

interface LongTaskSpec {
  area: string;
  delegateId?: string;
  phase: "done" | "moving" | "held" | "ahead";
  title: string;
  todoTexts: string[];
  waitsOn?: string;
}

const LONG_STAGE_BY_PHASE: Record<
  LongTaskSpec["phase"],
  {
    stage: string;
    stageKind: PlanTaskRecord["stageKind"];
    stepStatus: PlanStep["status"];
  }
> = {
  done: { stage: "Done", stageKind: "done", stepStatus: "completed" },
  moving: { stage: "Working", stageKind: "active", stepStatus: "in_progress" },
  held: { stage: "Waiting", stageKind: "you", stepStatus: "pending" },
  ahead: { stage: "Ready", stageKind: "todo", stepStatus: "pending" },
};

function appendLongSpec(
  spec: LongTaskSpec,
  index: number,
  total: number,
  tasks: Record<string, PlanTaskRecord>,
  steps: PlanStep[]
): void {
  const id = `tsk-${410 + index}`;
  const prevId = index > 0 ? `tsk-${410 + index - 1}` : undefined;
  const nextId = index < total - 1 ? `tsk-${410 + index + 1}` : undefined;
  const meta = LONG_STAGE_BY_PHASE[spec.phase];
  const todos: TaskTodo[] = spec.todoTexts.map((tText, tIdx) =>
    td(
      `td-${tIdx + 1}`,
      String(tIdx + 1),
      tText,
      spec.phase === "done" || (spec.phase === "moving" && tIdx === 0)
    )
  );

  tasks[id] = {
    id,
    title: spec.title,
    stage: meta.stage,
    stageKind: meta.stageKind,
    summary: `Part of the Q4 session plans and 4px spacing release train (${spec.area}).`,
    acceptance: [
      `All ${todos.length} to-dos verified and repository checks green`,
    ],
    labels: [spec.area],
    ...(spec.delegateId ? { delegateId: spec.delegateId } : {}),
    after: prevId ? [prevId] : [],
    unblocks: nextId ? [nextId] : [],
    todos,
  };

  steps.push({
    id,
    task: id,
    depth: 0,
    status: meta.stepStatus,
    content: spec.title,
    ...(spec.waitsOn ? { waitsOn: spec.waitsOn } : {}),
  });

  if (spec.phase === "moving" && todos[1]) {
    steps.push({
      id: `${id}:td-2`,
      task: id,
      todo: "td-2",
      depth: 1,
      status: "in_progress",
      content: todos[1].text,
    });
  }
}

/** Builds a realistic 34-task release train plan to stress-test overview calm and progressive disclosure. */
function buildLongPlanData(): PlanViewDataset {
  const specs: LongTaskSpec[] = [
    {
      title: "Add database tables for session plans and operator edit history",
      area: "db",
      phase: "done",
      todoTexts: [
        "Create session plans table with ordered steps",
        "Record operator plan edits with delivery timestamps",
        "Verify migration compatibility against shipped baseline",
      ],
    },
    {
      title: "Parse task markdown checklists into agreed and proposed to-dos",
      area: "core",
      phase: "done",
      todoTexts: [
        "Preserve nested indentation depth and to-do handles",
        "Separate proposed offers from agreed to-dos",
        "Count progress across agreed items only",
      ],
    },
    {
      title:
        "Parse wait targets for tasks, decision pages, comments, pull requests, and dates",
      area: "core",
      phase: "done",
      todoTexts: [
        "Reject invalid calendar dates",
        "Normalize GitHub pull request and check-run links",
        "Distinguish decision cards from workspace sessions cleanly",
      ],
    },
    {
      title:
        "Hydrate session plan reads with live project task titles and stages",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Read live task title and completion stage on every fetch",
        "Mark steps whose task left the board",
      ],
    },
    {
      title:
        "Order plan snapshots and live patches per session so frames never cross",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Serialize compute and broadcast steps per session",
        "Clean up idle session queues when turns finish",
      ],
    },
    {
      title:
        "Add plan edit endpoint for rewording, ticking, moving, and noting",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Support reword, add, remove, comment, tick, and move",
        "Explain clearly that task completion follows its stage",
      ],
    },
    {
      title: "Send task-attempt plan edits to the project coordinator",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Route attempt plan edits to the project coordinator",
        "Format step-by-step summary of operator changes",
      ],
    },
    {
      title: "Route delegate plan edits through the parent session",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Walk parent session chain when resolving edit recipient",
        "Name the delegate clearly in the parent notice",
      ],
    },
    {
      title:
        "Turn off Claude Code built-in todo lists at spawn without altering personal CLI settings",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Pass denied built-in list tools in session start options",
        "Confirm standalone CLI sessions keep their default tools",
      ],
    },
    {
      title: "Turn off OpenCode built-in plan agent on managed servers",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Disable built-in plan mode in generated server config",
        "Confirm CawCo plan tool registers cleanly",
      ],
    },
    {
      title: "Validate every written plan step against project task records",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Check step handles against current project tasks",
        "Return unread operator edits in tool responses",
      ],
    },
    {
      title:
        "File standalone session tasks under the Fleet project automatically",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Fall back to Fleet project when a session has no project",
        "Let ad-hoc sessions build structured plans seamlessly",
      ],
    },
    {
      title: "Generate iOS Swift plan strings and verify parity in CI",
      area: "ios",
      phase: "done",
      delegateId: "del-swift",
      todoTexts: [
        "Export shared progress and off-board strings",
        "Verify generated Swift file matches core words",
      ],
    },
    {
      title:
        "Attach open decision and comment waits directly to the steps they block",
      area: "core",
      phase: "done",
      todoTexts: [
        "Link unparked questions to the open step naming them",
        "Drop settled questions immediately",
      ],
    },
    {
      title:
        "Verify stored schema backwards compatibility against shipped builds",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Keep wire compatibility with active TestFlight builds",
        "Pass stored-shapes check across hub and dashboard",
      ],
    },
    {
      title: "Keep live plan updates in sync across reconnects",
      area: "stream",
      phase: "moving",
      delegateId: "del-resync",
      todoTexts: [
        "Copy held plan state before applying incoming patches",
        "Coalesce missed revisions into one resync request per session",
        "Run the reconnect interleaving sweep across handovers",
      ],
    },
    {
      title: "Build the nested session plan view for desk and phone",
      area: "dashboard",
      phase: "moving",
      delegateId: "del-sheet",
      todoTexts: [
        "Open the bottom task sheet with a 100×6 grabber below 900px",
        "Keep text selection working inside touch-target rows on iOS Safari",
        "Keep details and editing controls inside the opened task",
      ],
    },
    {
      title: "Move task and plan screens onto the 4px spacing grid",
      area: "tokens",
      phase: "held",
      waitsOn: `${ARTIFACT_ROLLOUT}#grid-rollout`,
      todoTexts: [
        "Audit derived spacing tokens inside the 4px grid scope",
        "Pick the rollout boundary on the 4px Grid Rollout decision page",
        "Merge pull request #614 with the updated contrast table",
      ],
    },
    {
      title:
        "Confirm dark-mode recessed well border contrast under Increase Contrast",
      area: "tokens",
      phase: "held",
      waitsOn: `${ARTIFACT_CONTRAST}/7`,
      todoTexts: [
        "Measure recessed well border contrast in light and dark",
        "Reply to comment #7 on Surface Contrast Audit",
      ],
    },
    {
      title: "Keep composer progress ring synchronized with agreed task to-dos",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Calculate progress over agreed to-dos only",
        "Hold tabular digit width steady as counts change",
      ],
    },
    {
      title: "Check text alignment edges across opened task sheets",
      area: "agent",
      phase: "ahead",
      todoTexts: [
        "Verify left-edge alignment between header, summary, and checklist well",
        "Confirm zero spacing near-misses against house tokens",
      ],
    },
    {
      title:
        "Batch rapid plan edits over three seconds before waking an idle session",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Group waking edits over a 3-second quiet window",
        "Send one consolidated change summary when waking",
      ],
    },
    {
      title: "Reopen ended sessions with preserved open tasks when edited",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Start a continuation session in the same workspace when needed",
        "Seed the continuation brief with open tasks and operator notes",
      ],
    },
    {
      title: "Clear settled pull request and check-run holds automatically",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Connect GitHub webhook updates to the shared wait watcher",
        "Broadcast live patch removing settled holds",
      ],
    },
    {
      title: "Promote overgrown to-dos into full board tasks with back-links",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Create linked board task from a complex to-do",
        "Tick the original to-do automatically when the new task finishes",
      ],
    },
    {
      title: "Draw delegate handoff links on the project canvas",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Draw parent-to-delegate edges at crisp device-pixel width",
        "Highlight active delegate nodes calmly",
      ],
    },
    {
      title: "Share live plan subscriptions across split workspace panes",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Combine followed session sets across open panes",
        "Clean up closed panes without dropping shared streams",
      ],
    },
    {
      title: "Summarize tasks finished and newly held while you were away",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "List tasks completed and holds hit since presence went away",
        "Dismiss the recap cleanly once read",
      ],
    },
    {
      title: "Add terminal command for inspecting and ticking session plans",
      area: "cli",
      phase: "ahead",
      todoTexts: [
        "Print nested task and to-do status in plain text",
        "Support adding notes and ticking to-dos from the terminal",
      ],
    },
    {
      title:
        "Verify right-to-left layout mirroring across spine connectors and wells",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Use logical inline borders and padding throughout plan-view",
        "Confirm nested elbows mirror cleanly in RTL",
      ],
    },
    {
      title: "Keep reduced-motion mode completely still across live indicators",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Gate breathing animations behind motion-safe preferences",
        "Use instant opacity fades when switching states",
      ],
    },
    {
      title: "Audit keyboard focus order and 44×44 touch targets on phone",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Verify focus rings across overview items and sheet controls",
        "Confirm touch targets never overlap in compact rows",
      ],
    },
    {
      title: "Retire legacy TestFlight wire field once older builds expire",
      area: "core",
      phase: "ahead",
      todoTexts: [
        "Update wire schema baseline after build expiry",
        "Remove deprecated compatibility field",
      ],
    },
    {
      title: "Run the full repository check gate across every package",
      area: "release",
      phase: "ahead",
      todoTexts: [
        "Pass type-checking, design lints, biome, knip, and jscpd",
        "Confirm zero uncommitted generated diffs",
      ],
    },
  ];

  const tasks: Record<string, PlanTaskRecord> = {};
  const steps: PlanStep[] = [];

  for (const [index, spec] of specs.entries()) {
    appendLongSpec(spec, index, specs.length, tasks, steps);
  }

  const longDelegates: DelegateSessionRecord[] = REALISTIC_DELEGATES.map(
    (d) => {
      if (d.id === "del-resync") {
        return { ...d, assignedTaskIds: ["tsk-425"] };
      }
      if (d.id === "del-sheet") {
        return { ...d, assignedTaskIds: ["tsk-426"] };
      }
      return { ...d, assignedTaskIds: ["tsk-422"] };
    }
  );

  return {
    session: {
      id: "ses-q4-release-train",
      title: "Ship Q4 session plans, wait resolver, and 4px spacing pass",
      project: "cawco",
      machine: "obelisk",
      harness: "claude",
      identity: 6,
      liveState: "working",
      liveActivity:
        "15 of 34 tasks finished · 2 in progress across obelisk and studio.local",
    },
    delegates: longDelegates,
    tasks,
    waitMeta: SHARED_WAIT_META,
    boardBacklog: BACKLOG_TASKS,
    plan: {
      source: "cawco",
      steps,
      changes: REALISTIC_PLAN_DATA.plan.changes,
    },
  };
}

export const LONG_PLAN_DATA: PlanViewDataset = buildLongPlanData();
