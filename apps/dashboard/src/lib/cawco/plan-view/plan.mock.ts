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
    title: "Harden RFC 6902 delta gap recovery",
    harness: "claude",
    machine: "obelisk",
    identity: 6,
    state: "running",
    assignedTaskIds: ["tsk-504"],
    liveLine:
      "Verifying duplicate plan.resync suppression when reconnect frames interleave",
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
          content: "Clone proxy-held plan state before applying RFC 6902 patch",
        },
        {
          id: "tsk-504:td-2",
          task: "tsk-504",
          todo: "td-2",
          depth: 0,
          status: "completed",
          content: "Drop stale delta frames whose revision trails held.rev",
        },
        {
          id: "tsk-504:td-3",
          task: "tsk-504",
          todo: "td-3",
          depth: 0,
          status: "in_progress",
          content:
            "Coalesce concurrent gap detections to one plan.resync per instanceId",
        },
        {
          id: "tsk-504:td-4",
          task: "tsk-504",
          todo: "td-4",
          depth: 0,
          status: "pending",
          content: "Sweep handover interleavings in scripts/protocol-sweep.ts",
        },
      ],
    },
  },
  {
    id: "del-sheet",
    title: "Mobile sheet & 16px inline reword floor",
    harness: "opencode",
    machine: "studio.local",
    identity: 2,
    state: "running",
    assignedTaskIds: ["tsk-505"],
    liveLine:
      "Checking hit-under touch targets on inline reword fields at 390px width",
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
            "Mount bottom task sheet with 100×6 grabber under the 900px desk line",
        },
        {
          id: "tsk-505:td-2",
          task: "tsk-505",
          todo: "td-2",
          depth: 0,
          status: "in_progress",
          content:
            "Keep caret selection live inside touch-hit rows on iOS Safari",
        },
        {
          id: "tsk-505:td-3",
          task: "tsk-505",
          todo: "td-3",
          depth: 0,
          status: "pending",
          content:
            "Verify keyboard lift keeps Save note above safe-area-inset-bottom",
        },
      ],
    },
  },
  {
    id: "del-swift",
    title: "Regenerate Words.Plan for iOS TestFlight",
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
          content: "Add off-board step copy to packages/core/src/words/plan.ts",
        },
        {
          id: "tsk-502:td-2",
          task: "tsk-502",
          todo: "td-2",
          depth: 0,
          status: "completed",
          content:
            "Run bun run words and confirm Words.generated.swift matches",
        },
      ],
    },
  },
];

const REALISTIC_TASKS: Record<string, PlanTaskRecord> = {
  "tsk-501": {
    id: "tsk-501",
    title:
      "Deny harness-native todo tools at session spawn across all adapters",
    stage: "Done",
    stageKind: "done",
    summary:
      "Every session uses CawCo's single plan list so edits from the operator and steps written by the harness never drift apart.",
    acceptance: [
      "Claude Code TaskCreate/TodoWrite and EnterPlanMode denied in spawn options without touching user settings",
      "OpenCode plan agent disabled on launched servers",
    ],
    labels: ["agent", "harnesses"],
    after: [],
    unblocks: ["tsk-504", "tsk-505"],
    todos: [
      td(
        "td-1",
        "1",
        "Pass OWN_LIST_DENIED in session start options beside fleet baseline",
        true
      ),
      td(
        "td-2",
        "2",
        "Disable built-in plan mode in OpenCode server launch config",
        true
      ),
      td(
        "td-3",
        "3",
        "Confirm standalone claude started by hand keeps its own tools",
        true
      ),
    ],
  },
  "tsk-502": {
    id: "tsk-502",
    title: "Sync shared plan words and off-board handle copy with Words.Plan",
    stage: "Done",
    stageKind: "done",
    delegateId: "del-swift",
    summary:
      "Keeps web dashboard strings and CawCoCore Swift strings generated from one canonical source.",
    acceptance: ["bun run words:check passes with zero diff"],
    labels: ["words", "ios"],
    after: ["tsk-501"],
    unblocks: ["tsk-505"],
    todos: [
      td(
        "td-1",
        "1",
        "Add off-board step copy to packages/core/src/words/plan.ts",
        true
      ),
      td(
        "td-2",
        "2",
        "Run bun run words and confirm Words.generated.swift matches",
        true
      ),
    ],
  },
  "tsk-503": {
    id: "tsk-503",
    title:
      "Preserve person comments across session todo_write replacements and track orphaned steps",
    stage: "Done",
    stageKind: "done",
    summary:
      "When an agent rewrites its session plan, comments stay attached to the same task or to-do handle, or move to orphanedComments if omitted.",
    acceptance: [
      "keepComments sorts preserved notes chronologically by ISO timestamp",
      "Refuses a write once when it would silently undo an unsettled add, remove, or untick",
    ],
    labels: ["hub", "plans"],
    after: ["tsk-501"],
    unblocks: ["tsk-504"],
    todos: [
      td("td-1", "1", "Key kept comments by step record handle on write", true),
      td(
        "td-2",
        "2",
        "Refuse unsettled person edits once with changeLine summary",
        true
      ),
      td("td-3", "3", "Promote mobile sheet follow-up to its own task", true, {
        promoted: "tsk-505",
      }),
    ],
  },
  "tsk-504": {
    id: "tsk-504",
    title:
      "Stream AG-UI plan.snapshot and RFC 6902 plan.delta frames with single-flight gap resync",
    stage: "Working",
    stageKind: "active",
    delegateId: "del-resync",
    summary:
      "Followers subscribe once and apply sequential JSON patches by revision; any skipped revision triggers a single plan.resync request until the fresh snapshot lands.",
    acceptance: [
      "Out-of-order delta never mutates store proxy state partially",
      "At most one in-flight plan.resync per instanceId per gap",
    ],
    labels: ["hub", "stream"],
    after: ["tsk-501", "tsk-503"],
    unblocks: ["tsk-507", "tsk-508"],
    todos: [
      td(
        "td-1",
        "1",
        "Clone proxy-held plan state before applying RFC 6902 patch",
        true
      ),
      td(
        "td-2",
        "2",
        "Drop stale delta frames whose revision trails held.rev",
        true
      ),
      td(
        "td-3",
        "3",
        "Coalesce concurrent gap detections to one plan.resync per instanceId",
        false
      ),
      td(
        "td-3a",
        "3.1",
        "Clear asked set only when matching plan.snapshot arrives",
        false,
        { depth: 1 }
      ),
      td(
        "td-3b",
        "3.2",
        "Re-emit snapshot when patch exceeds half the step list",
        false,
        { depth: 1 }
      ),
      td(
        "td-4",
        "4",
        "Sweep handover interleavings in scripts/protocol-sweep.ts",
        false
      ),
    ],
  },
  "tsk-505": {
    id: "tsk-505",
    title:
      "Build nested session plan view with recessed to-do wells, desk inspector, and phone sheet",
    stage: "Working",
    stageKind: "active",
    delegateId: "del-sheet",
    summary:
      "Presents the plan, its tasks, and each task's to-dos as three unmistakable levels at 1440px and 390px in both schemes.",
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
        "Mount bottom task sheet with 100×6 grabber under the 900px desk line",
        true
      ),
      td(
        "td-2",
        "2",
        "Keep caret selection live inside touch-hit rows on iOS Safari",
        false
      ),
      td(
        "td-3",
        "3",
        "Verify keyboard lift keeps Save note above safe-area-inset-bottom",
        false
      ),
      td(
        "td-4",
        "4",
        "Add keyboard shortcut J/K traversal across spine tasks",
        false,
        { proposed: true }
      ),
    ],
  },
  "tsk-506": {
    id: "tsk-506",
    title:
      "Switch task & plan surfaces onto the 4px spacing base without breaking non-migrated routes",
    stage: "Waiting",
    stageKind: "you",
    summary:
      "Applies data-grid='4px' token formulas to the plan surface once the operator picks the rollout boundary on the decision page and the contrast check PR merges.",
    acceptance: [
      "scripts/grid-scope-check.ts passes with every derived spacing token redeclared",
      "Measured contrast holds 4.5:1 for subtle ink on well and hover in light and dark",
    ],
    labels: ["tokens", "design"],
    after: ["tsk-501"],
    unblocks: ["tsk-509"],
    todos: [
      td(
        "td-1",
        "1",
        "Audit derived --spacing-c-* formulas inside theme.css [data-grid='4px']",
        true
      ),
      td(
        "td-2",
        "2",
        "Settle rollout scope card on the 4px spacing decision page",
        false
      ),
      td(
        "td-3",
        "3",
        "Land token-contrast-check baseline update in PR #614",
        false
      ),
    ],
  },
  "tsk-507": {
    id: "tsk-507",
    title:
      "Batch waking plan edits over the 3-second quiet window before starting an idle session",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Rewords, adds, removals, and comments wake an idle session 3 seconds after the last edit as one consolidated message; ticks and moves wait for the next turn.",
    acceptance: [
      "Burst of 4 edits within 3s dispatches exactly one wake message",
      "Tick and move edits never wake an idle or archived session on their own",
    ],
    labels: ["hub", "triggers"],
    after: ["tsk-504"],
    unblocks: ["tsk-508"],
    todos: [
      td(
        "td-1",
        "1",
        "Debounce PLAN_WAKING_EDITS per receiver key using PLAN_WAKE_QUIET_MS",
        false
      ),
      td(
        "td-2",
        "2",
        "Route delegate plan edits to parent session rather than straight to delegate",
        false
      ),
      td(
        "td-3",
        "3",
        "Reopen archived session with preserved open records when transcript is gone",
        false
      ),
    ],
  },
  "tsk-508": {
    id: "tsk-508",
    title:
      "Wire task_waits resolver to drop settled PR, task, and date holds from plan steps automatically",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Uses the hub's single wait resolver so a merged GitHub PR or landed upstream task clears waitsOn and publishes a plan.delta immediately.",
    acceptance: [
      "Settled GitHub PR drops waitsOn and broadcasts RFC 6902 remove patch",
    ],
    labels: ["hub", "waits"],
    after: ["tsk-504", "tsk-507"],
    unblocks: ["tsk-509"],
    todos: [
      td(
        "td-1",
        "1",
        "Subscribe planwaits table to task-waits settled hook",
        false
      ),
      td(
        "td-2",
        "2",
        "Publish plan.delta removing /steps/i/waitsOn on settle",
        false
      ),
    ],
  },
  "tsk-509": {
    id: "tsk-509",
    title:
      "Run full repository check gate and verify zero layout near-misses across light and dark frames",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Final verification pass across golar tsc, golar lint, mark-line-check, token-contrast-check, knip, and jscpd.",
    acceptance: [
      "bun run check exits 0 from repository root",
      "Both 390px phone and 1440px desk frames hold clean alignment edges",
    ],
    labels: ["release", "check"],
    after: ["tsk-505", "tsk-506", "tsk-508"],
    unblocks: [],
    todos: [
      td("td-1", "1", "Verify golar tsc -b and design lint rules pass", false),
      td(
        "td-2",
        "2",
        "Inspect 390px and 1440px stories in light and dark",
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
    content: "tsk-498 is no longer on the board",
    comments: [
      {
        at: "2026-11-24T13:18:00.000Z",
        text: "Folded this old prototype spike into tsk-505 — safe to remove from plan.",
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
        text: "Keep the asked Set keyed by instanceId alone so rapid tab switches never double-send plan.resync.",
      },
    ],
  },
  {
    id: "tsk-504:td-3",
    task: "tsk-504",
    todo: "td-3",
    depth: 1,
    status: "in_progress",
    content:
      "Coalesce concurrent gap detections to one plan.resync per instanceId",
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
    content: "Keep caret selection live inside touch-hit rows on iOS Safari",
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
        text: "Hold off touching SettingsView's existing 4px overrides until you pick Option B on the rollout card.",
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
    content: "Land token-contrast-check baseline update in PR #614",
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
    label: "Waiting on your pick · 4px grid rollout",
    detail:
      "Decision card “Where data-grid='4px' lands this week” on page 4px Grid Rollout needs your answer.",
    actionLabel: "Open decision card",
  },
  [`${ARTIFACT_CONTRAST}/7`]: {
    label: "Waiting on pin #7 · Night well contrast",
    detail:
      "Pin #7 on Surface Contrast Audit asks whether border-well stays neutral-6 in dark mode.",
    actionLabel: "Open pin #7",
  },
  "https://github.com/bewinxed/cawco/pull/614": {
    label: "Waiting on PR #614 · Token contrast table",
    detail:
      "bewinxed/cawco#614 updates measured contrast figures for surface-well and option-picked.",
    actionLabel: "Open PR #614",
  },
  [`cawco#${DELEGATE_STREAM_UUID}`]: {
    label: "Waiting on delegate · Harden RFC 6902 delta gap recovery",
    detail:
      "Settles automatically once delegate session obelisk#4a82f109 lands tsk-504.",
    actionLabel: "Inspect delegate",
  },
};

const BACKLOG_TASKS: PlanTaskRecord[] = [
  {
    id: "tsk-510",
    title:
      "Expose plan.follow subscription list on reconnect for multi-project iPad split view",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Re-sends the active instanceIds set after socket transport recovery so side-by-side panes stay live.",
    acceptance: ["Reconnect sends one consolidated plan.follow frame"],
    labels: ["stream", "ipad"],
    after: ["tsk-504"],
    unblocks: [],
    todos: [
      td("td-1", "1", "Diff followed instanceIds against live panes", false),
      td("td-2", "2", "Drop unmounted pane ids on close", false),
    ],
  },
  {
    id: "tsk-511",
    title:
      "Add return recap summary line for plans modified while operator presence was away",
    stage: "Ready",
    stageKind: "todo",
    summary:
      "Summarizes tasks completed and steps newly held while the operator's presence stood at away.",
    acceptance: ["Recap reads from durable task history, never stored flags"],
    labels: ["presence", "plans"],
    after: ["tsk-507"],
    unblocks: [],
    todos: [td("td-1", "1", "Query task events since away timestamp", false)],
  },
];

/** Main realistic dataset: 9 board tasks + 1 off-board step, 3 delegates, done/moving/held/ahead. */
export const REALISTIC_PLAN_DATA: PlanViewDataset = {
  session: {
    id: "ses-orchestrate-plan",
    title: "Ship live session plan sync & 4px token pass",
    project: "cawco",
    machine: "obelisk",
    harness: "claude",
    identity: 1,
    liveState: "working",
    liveActivity: "Coordinating 2 active delegates and preparing wake batching",
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
          "Keep the asked Set keyed by instanceId alone so rapid tab switches never double-send plan.resync.",
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

/** Held-task dataset: foregrounds multiple hold kinds (decision card, PR, upstream session, and scheduled window). */
export const HELD_PLAN_DATA: PlanViewDataset = {
  ...REALISTIC_PLAN_DATA,
  session: {
    ...REALISTIC_PLAN_DATA.session,
    liveState: "waiting",
    liveActivity: "Paused on tsk-506 decision card pick and PR #614 merge",
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
    summary: `Part of the Q4 session plans & 4px grid release train (${spec.area}).`,
    acceptance: [`All ${todos.length} to-dos verified and bun run check green`],
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

/** Builds a realistic 34-task release train plan to stress-test density, folding, and horizon navigation. */
function buildLongPlanData(): PlanViewDataset {
  const specs: LongTaskSpec[] = [
    {
      title: "Freeze SQLite session_plans and plan_changes migration baseline",
      area: "db",
      phase: "done",
      todoTexts: [
        "Add session_plans table with ordered step JSON",
        "Add plan_changes audit columns with toldAt",
        "Verify migrations:check against shipped tag",
      ],
    },
    {
      title:
        "Parse task markdown ## To-dos into nested agreed and proposed trees",
      area: "core",
      phase: "done",
      todoTexts: [
        "Preserve 2-space indent depth and td-N markers",
        "Parse (proposed) prefix and -> #N promoted task links",
        "Compute todoProgress over agreed items only",
      ],
    },
    {
      title:
        "Implement wait-targets grammar for tasks, cards, pins, PRs, runs, sessions, and UTC dates",
      area: "core",
      phase: "done",
      todoTexts: [
        "Reject calendar-invalid dates such as 2026-02-30",
        "Normalize GitHub pull and Actions run URLs",
        "Distinguish uuid#card from dir#uuid unambiguously",
      ],
    },
    {
      title:
        "Wire hub GET /api/instances/:id/plan with live task record hydration",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Read task title and done/dropped stage at every read",
        "Mark steps naming deleted tasks with gone: true",
      ],
    },
    {
      title:
        "Enforce per-session serialization queue so snapshots and deltas never cross",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Order compute and publish calls in inTurn queue",
        "Clean up idle queue promises on completion",
      ],
    },
    {
      title:
        "Add POST /api/instances/:id/plan/edits endpoint for owner-only mutations",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Support reword, add, remove, comment, tick, and move",
        "Refuse ticking a task step directly with clear stage message",
      ],
    },
    {
      title:
        "Route task attempt plan edits to project Caw rather than worker session",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Resolve receiverKey to caw:<projectId> on task attempts",
        "Format verbatim step-by-step changeLine block",
      ],
    },
    {
      title: "Route delegate session plan edits to parent session",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Walk parentInstanceId when computing PlanReceiver",
        "Include delegate handle in parent notification",
      ],
    },
    {
      title:
        "Deny Claude Code Builtin TodoWrite and TaskList at spawn without altering personal CLI settings",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Append OWN_LIST_DENIED in SDK start options",
        "Verify user-launched CLI keeps default tools",
      ],
    },
    {
      title:
        "Disable OpenCode 2.0 native plan agent across daemon-spawned servers",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Set plan agent off in generated opencode plugin module",
        "Confirm session-scoped todo_write registers cleanly",
      ],
    },
    {
      title: "Expose MCP todo_write session scope alongside task attempt scope",
      area: "agent",
      phase: "done",
      todoTexts: [
        "Validate every step handle against project board records",
        "Return current unsettled person edits in tool answer",
      ],
    },
    {
      title:
        "File non-project session tasks under the Fleet project automatically",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Resolve recordsProjectOf fallback to Fleet project",
        "Allow ad-hoc sessions to build structured plans",
      ],
    },
    {
      title: "Generate Swift Words.Plan bindings and verify words:check in CI",
      area: "ios",
      phase: "done",
      delegateId: "del-swift",
      todoTexts: [
        "Export ringLabel, figure, and gone copy",
        "Run scripts/words-swift.ts --check",
      ],
    },
    {
      title:
        "Derive planNeedsOf from unparked Needs you items without storing flags",
      area: "core",
      phase: "done",
      todoTexts: [
        "Attach artifact waits directly to open step naming card or pin",
        "Omit settled or withdrawn questions immediately",
      ],
    },
    {
      title:
        "Verify stored-shapes Zod schema compatibility against shipped nightly",
      area: "hub",
      phase: "done",
      todoTexts: [
        "Keep source: 'cawco' wire field for TestFlight builds 20261015–20261018",
        "Pass packages/hub stored-shapes:check",
      ],
    },
    {
      title:
        "Stream AG-UI plan.snapshot and RFC 6902 plan.delta frames with single-flight gap resync",
      area: "stream",
      phase: "moving",
      delegateId: "del-resync",
      todoTexts: [
        "Clone proxy-held plan state before applying patch",
        "Coalesce gap resync requests per instanceId",
        "Sweep reconnect interleavings in protocol-sweep.ts",
      ],
    },
    {
      title:
        "Build nested session plan view with recessed to-do wells, desk inspector, and phone sheet",
      area: "dashboard",
      phase: "moving",
      delegateId: "del-sheet",
      todoTexts: [
        "Render 34-segment horizon bar for zero-scroll overview",
        "Mount responsive task inspector beside spine at 1440px and sheet at 390px",
        "Wire inline reword, tick, move, add, remove, and note controls",
      ],
    },
    {
      title: "Synchronize composer plan ring progress with agreed task to-dos",
      area: "dashboard",
      phase: "moving",
      todoTexts: [
        "Compute ring fraction via planProgress helper",
        "Exclude offered (proposed) to-dos until agreed",
        "Hold tabular-nums width as figures increment",
      ],
    },
    {
      title:
        "Instrument stage-measure layout checks on opened task inspector edges",
      area: "agent",
      phase: "moving",
      todoTexts: [
        "Check text left-edge alignment across task header and well",
        "Confirm zero spacing near-misses against house tokens",
      ],
    },
    {
      title:
        "Switch task & plan surfaces onto the 4px spacing base without breaking non-migrated routes",
      area: "tokens",
      phase: "held",
      waitsOn: `${ARTIFACT_ROLLOUT}#grid-rollout`,
      todoTexts: [
        "Audit derived --spacing-c-* formulas in theme.css",
        "Settle rollout scope card on 4px Grid Rollout decision page",
        "Merge PR #614 token contrast table update",
      ],
    },
    {
      title:
        "Calibrate dark-mode surface-well border contrast under Increase Contrast",
      area: "tokens",
      phase: "held",
      waitsOn: `${ARTIFACT_CONTRAST}/7`,
      todoTexts: [
        "Measure border-well against neutral-1 and neutral-3 in oklch",
        "Answer pin #7 on Surface Contrast Audit",
      ],
    },
    {
      title:
        "Batch waking plan edits over the 3-second quiet window before starting an idle session",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Debounce reword, add, remove, and comment per receiver",
        "Send consolidated change summary in one turn wake",
      ],
    },
    {
      title:
        "Reopen archived or ended sessions with preserved plan records when edited",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Spawn replacement session in same place when transcript is gone",
        "Seed brief with open plan steps, notes, and filed tasks",
      ],
    },
    {
      title:
        "Drop settled GitHub PR and check-run holds automatically from plan_waits",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Hook GitHub webhook poller into task-waits settled",
        "Broadcast RFC 6902 remove patch to followers",
      ],
    },
    {
      title:
        "Promote overgrown to-dos to full board tasks with -> #id back-links",
      area: "hub",
      phase: "ahead",
      todoTexts: [
        "Create linked task with parent edge",
        "Auto-tick source to-do when promoted task reaches Done",
      ],
    },
    {
      title: "Render delegate tree handoffs inside project canvas view",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Draw part-of edges at --tree-line device pixel width",
        "Highlight active delegate node with breathing live glyph",
      ],
    },
    {
      title:
        "Add multi-pane plan.follow coalescing across split workspace tabs",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Union followed session ids across open leaves",
        "Prune closed session ids without dropping shared streams",
      ],
    },
    {
      title:
        "Buildaway-presence return recap banner from durable plan & task history",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "List tasks landed and holds encountered while away",
        "Dismiss recap cleanly once glanced at",
      ],
    },
    {
      title:
        "Expose cawco plan CLI subcommand for terminal inspection and scripting",
      area: "cli",
      phase: "ahead",
      todoTexts: [
        "Format nested [x] / [~] / [ ] tree with wait targets",
        "Support cawco plan comment and cawco plan tick",
      ],
    },
    {
      title:
        "Verify RTL logical properties across spine connectors and nested wells",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Use inset-inline-start and border-s throughout plan-view",
        "Check elbow rounding in dir='rtl' preview",
      ],
    },
    {
      title: "Enforce prefers-reduced-motion stillness on live breathing marks",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Gate breath animation behind motion-safe / breathe utility",
        "Keep state switches instant opacity cross-fades",
      ],
    },
    {
      title: "Audit keyboard focus order and 44×44 coarse pointer touch areas",
      area: "dashboard",
      phase: "ahead",
      todoTexts: [
        "Verify focus-ring visibility on spine cards and well checkboxes",
        "Check touch-hit midpoint gaps on compact action rows",
      ],
    },
    {
      title:
        "Prune legacy TestFlight 20261015 source field once build window expires",
      area: "core",
      phase: "ahead",
      todoTexts: [
        "Update openapi wire baseline after TestFlight expiry",
        "Remove deprecated source literal from SessionPlan",
      ],
    },
    {
      title:
        "Run full bun run check release gate across all workspace packages",
      area: "release",
      phase: "ahead",
      todoTexts: [
        "Pass golar tsc -b, golar lint, biome, knip, and jscpd",
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
      title: "Q4 Session Plans, Wait Resolver & 4px Grid Release Train",
      project: "cawco",
      machine: "obelisk",
      harness: "claude",
      identity: 6,
      liveState: "working",
      liveActivity:
        "15 of 34 tasks landed · 4 moving across obelisk and studio.local",
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
