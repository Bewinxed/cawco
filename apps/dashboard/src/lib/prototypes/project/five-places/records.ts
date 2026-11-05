/**
 * The records the "Five places" prototype draws: the shapes a project's
 * screens read, and two record sets copied from the hub on 2026-11-05.
 *
 * - `SWING`, project Cawco-Dev in full swing: its tasks, stage totals,
 *   decision pages, sessions and outputs as the hub held them that morning,
 *   with Cawco's routines, its proposed X reply and its post drafts folded
 *   in so one project shows every kind of wait (a task in Review, a failed
 *   attempt, a session's ask, picks not sent, an approved action), a stuck
 *   task, a failed routine and recent outputs. A few of Cawco-Dev's open
 *   tasks stand in Working with live attempts so the Working filter has
 *   rows.
 * - `QUIET`, project Cawco with nothing waiting: its ideas, its two routines
 *   that are on, and Caw idle.
 */

import type { StageKind } from "@cawco/core/views";

export type Place = "tasks" | "routines" | "decisions" | "outputs" | "caw";

export interface Stage {
  id: string;
  kind: StageKind;
  name: string;
  /** How many tasks the stage holds, whether or not each is drawn. */
  total: number;
}

export type AttemptState =
  "working" | "queued" | "needs" | "failed" | "blocked" | "landed";

export interface Task {
  attempt?: {
    state: AttemptState;
    /** Why it is stuck or what it asks, in the hub's words. */
    cause?: string;
    machine?: string;
  };
  changed: string;
  id: string;
  labels: string[];
  stage: string;
  title: string;
  todos?: [done: number, total: number];
  type?: string;
  waitsOn?: string[];
}

export interface Routine {
  id: string;
  instruction: string;
  last?: {
    outcome: "ran" | "silent" | "failed" | "delivered";
    ago: string;
    reason?: string;
  };
  name: string;
  next?: string;
  on: boolean;
  runs: { when: string; outcome: string; result: string; session: string }[];
  /** The schedule in words on the person's clock. */
  schedule: string;
  source: string;
  sourceFailing?: string;
  zone: string;
}

export interface ApprovedAction {
  account: string;
  arguments: string;
  /** The exact call, as the hub will make it. */
  call: string;
  connection: string;
  from: string;
  id: string;
  reason?: string;
  state: "waiting" | "failed";
  when: string;
}

export interface Decision {
  after?: string;
  group: "waits" | "sent" | "decided";
  id: string;
  picked: number;
  settled?: string;
  tasks: number;
  title: string;
  total: number;
  unlocks?: string;
  unsent: number;
  waited: string;
}

export type OutputKind =
  | "post"
  | "markdown"
  | "picture"
  | "media"
  | "file"
  | "preview"
  | "canvas"
  | "choices";

export interface Output {
  alternates?: number;
  /** What it shows drawn small: the post's words, the file's first lines. */
  body?: string;
  id: string;
  isNew: boolean;
  kind: OutputKind;
  stage: string;
  task: string;
  taskTitle: string;
  title: string;
  unservable?: string;
  when: string;
}

interface Session {
  ago: string;
  harness: string;
  id: string;
  kind: "attempt" | "spun-off";
  machine: string;
  status: "working" | "needs" | "idle" | "failed";
  task?: string;
  title: string;
}

interface SessionAsk {
  asks: string;
  session: string;
  waited: string;
}

interface CawRecord {
  events: boolean;
  harness: string;
  model: string;
  sentence: string;
  starters: string[];
  status: "working" | "needs" | "idle" | "off" | "unreachable";
  turns: { who: "person" | "caw"; text: string; at: string }[];
}

interface Spend {
  atCap: boolean;
  cap: number;
  month: number;
  today: number;
}

export interface ProjectRecords {
  actions: ApprovedAction[];
  archived: number;
  asks: SessionAsk[];
  caw: CawRecord;
  decisions: Decision[];
  /** When the hub last answered, on the person's clock. */
  lastGood: string;
  name: string;
  outputs: Output[];
  routines: Routine[];
  sessions: Session[];
  spend: Spend;
  stages: Stage[];
  tasks: Task[];
}

const CAWCO_DEV_STAGES: Stage[] = [
  { id: "ready", name: "Ready", kind: "todo", total: 97 },
  { id: "working", name: "Working", kind: "active", total: 5 },
  { id: "review", name: "Review", kind: "you", total: 2 },
  { id: "done", name: "Done", kind: "done", total: 109 },
  { id: "dropped", name: "Dropped", kind: "dropped", total: 24 },
];

const SWING_TASKS: Task[] = [
  // Review: the stage meant for the person.
  {
    id: "tsk-142",
    title:
      "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
    stage: "review",
    labels: ["caw", "threads", "bug"],
    changed: "4 days ago",
    attempt: { state: "needs", cause: "handed in, waits on your review" },
  },
  {
    id: "tsk-218",
    title: "Let start_session choose a harness",
    stage: "review",
    type: "medium",
    labels: ["bug", "fleet"],
    changed: "2 days ago",
    attempt: { state: "needs", cause: "handed in, waits on your review" },
  },
  // Working: live, queued, failed and stuck attempts.
  {
    id: "tsk-225",
    title:
      "Find why niftybot's session is refused after a move to the second Ultra",
    stage: "working",
    labels: ["bug", "accounts"],
    changed: "38 min ago",
    attempt: {
      state: "failed",
      cause: "niftybot.art refused the session (401) after the account moved",
      machine: "niftybot.art",
    },
  },
  {
    id: "tsk-135",
    title: "Relaunch at boot only what was working",
    stage: "working",
    labels: ["bug", "needs-discussion"],
    changed: "4 days ago",
    attempt: {
      state: "blocked",
      cause: "no attempt for 4 days: waits on a choice in Who decides",
    },
  },
  {
    id: "tsk-141",
    title:
      "Turn the person's rambles on a task into edits: a fast pass applies them, deeper asks go to research",
    stage: "working",
    labels: ["caw", "tasks"],
    changed: "45 min ago",
    attempt: { state: "working", machine: "obelisk-of-light" },
    todos: [0, 2],
  },
  {
    id: "tsk-224",
    title: "Cut previews over to one source of truth",
    stage: "working",
    labels: ["previews", "bug"],
    changed: "yesterday",
    attempt: { state: "working", machine: "obelisk-of-light" },
  },
  {
    id: "tsk-237",
    title:
      "Cut a checkout place from the hub for a delegate on a machine without one",
    stage: "working",
    labels: ["prd-5.1"],
    changed: "13 h ago",
    attempt: { state: "queued" },
  },
  // Ready: the first rows of 97, newest change first.
  {
    id: "tsk-240",
    title: "Show the new build's release notes in the update toast",
    stage: "ready",
    type: "design",
    labels: ["design", "updates"],
    changed: "1 h ago",
    waitsOn: ["tsk-18"],
  },
  {
    id: "tsk-236",
    title: "Research how to build a real Caw rig",
    stage: "ready",
    labels: ["needs-discussion"],
    changed: "15 h ago",
  },
  {
    id: "tsk-18",
    title:
      "Replace the component canvas's grid of frames with the design graph",
    stage: "ready",
    labels: ["canvas/artifacts", "partial"],
    changed: "22 h ago",
  },
  {
    id: "tsk-74",
    title:
      "Run the compaction benchmark to a report and make the method configurable",
    stage: "ready",
    labels: ["promise"],
    changed: "yesterday",
  },
  {
    id: "tsk-108",
    title: "Advisor review of the preview pass security model",
    stage: "ready",
    labels: ["promise"],
    changed: "21 h ago",
  },
  {
    id: "tsk-231",
    title:
      "Nudge a session to file its open items before its harness compacts it",
    stage: "ready",
    labels: ["compaction", "needs-discussion"],
    changed: "yesterday",
  },
  {
    id: "tsk-230",
    title: "Time the design graph in iPhone Safari on the Mac",
    stage: "ready",
    labels: ["design-graph", "performance"],
    changed: "yesterday",
    waitsOn: ["tsk-18"],
  },
  {
    id: "tsk-229",
    title: "Clear superseded design artifacts and held workspaces on his word",
    stage: "ready",
    labels: ["cleanup"],
    changed: "yesterday",
  },
  {
    id: "tsk-226",
    title: "Land the Liquid Glass title bars after his two picks",
    stage: "ready",
    labels: ["design"],
    changed: "yesterday",
    waitsOn: ["dec-title-bars"],
  },
  {
    id: "tsk-221",
    title: "Move a second repository from the phone",
    stage: "ready",
    labels: ["ios", "app-hold", "moves"],
    changed: "2 days ago",
  },
  {
    id: "tsk-211",
    title: "Keep the routine form's week strip labels apart at 390",
    stage: "ready",
    type: "medium",
    labels: ["defect"],
    changed: "3 days ago",
  },
  {
    id: "tsk-24",
    title:
      "Redesign the comment surfaces: card, thread popover, author row and tablet panel, with one goo-out morph",
    stage: "ready",
    labels: ["comments", "owner-ask", "pin"],
    changed: "4 days ago",
    waitsOn: ["tsk-18"],
  },
  // Done: the newest of 109.
  {
    id: "tsk-239",
    title:
      "The list of slash commands in the composer before a session starts differs from the list after it started",
    stage: "done",
    labels: [],
    changed: "38 min ago",
    attempt: { state: "landed" },
  },
  {
    id: "tsk-238",
    title:
      "One shared mock reads a tool's answer even when Claude Code moves the call to the background",
    stage: "done",
    labels: ["probe-kit"],
    changed: "10 h ago",
    attempt: { state: "landed" },
  },
  {
    id: "tsk-233",
    title: "Give the tooltip's 2px rise a token",
    stage: "done",
    type: "low",
    labels: ["design-tokens"],
    changed: "yesterday",
    attempt: { state: "landed" },
  },
  {
    id: "tsk-232",
    title: "Delete the mocks scripts nothing runs",
    stage: "done",
    type: "low",
    labels: ["cleanup"],
    changed: "yesterday",
    attempt: { state: "landed" },
  },
  {
    id: "tsk-217",
    title: "Close a task when the fix for it lands",
    stage: "done",
    type: "high",
    labels: ["bug", "tasks", "fleet"],
    changed: "2 days ago",
    attempt: { state: "landed" },
  },
  // Dropped: the newest of 24.
  {
    id: "tsk-235",
    title:
      "Add image provider settings to Configure: agy sign-in cell and default provider block",
    stage: "dropped",
    type: "design",
    labels: ["image-generation"],
    changed: "yesterday",
  },
  {
    id: "tsk-223",
    title: "Judge the product's at-limit summary against the benchmark's",
    stage: "dropped",
    labels: ["compaction"],
    changed: "2 days ago",
  },
  {
    id: "tsk-185",
    title: "Make the component canvas fast in iPhone Safari",
    stage: "dropped",
    labels: ["bug", "performance"],
    changed: "2 days ago",
  },
];

const X_ROUTINES: Routine[] = [
  {
    id: "d86be128",
    name: "Weekly X milestone check",
    schedule: "Mondays at 16:00",
    zone: "Asia/Riyadh",
    on: true,
    last: {
      outcome: "failed",
      ago: "2 h ago",
      reason:
        "The x-use MCP isn't connected in this session, so no @CawCoDev numbers could be read.",
    },
    next: "Mon 16:00",
    source: "Schedule",
    sourceFailing: "x-use isn't connected",
    instruction:
      "Read @CawCoDev's followers, impressions and replies for the week, compare them with the warm-up milestones, and say which milestone is next.",
    runs: [
      {
        when: "Today 16:00",
        outcome: "Failed",
        result: "The x-use MCP isn't connected in this session.",
        session: "Weekly X milestone check",
      },
      {
        when: "Mon 27 Oct 16:00",
        outcome: "Failed",
        result: "The x-use MCP isn't connected in this session.",
        session: "Weekly X milestone check",
      },
    ],
  },
  {
    id: "3a86179c",
    name: "Daily reply shortlist for X",
    schedule: "Every day at 13:30",
    zone: "Asia/Riyadh",
    on: true,
    last: { outcome: "delivered", ago: "yesterday" },
    next: "Today 13:30",
    source: "Schedule",
    instruction:
      "Search the last day's posts about agents, terminals and fleets; shortlist the ones worth a reply from @CawCoDev, draft each reply and three DMs. Post nothing.",
    runs: [
      {
        when: "Yesterday 13:41",
        outcome: "Delivered",
        result:
          "12 posts from the last 24 hours, 4 with a cawco.dev link, plus 3 DM drafts.",
        session: "Build daily X reply shortlist",
      },
      {
        when: "Mon 13:30",
        outcome: "Delivered",
        result: "10 posts with draft replies and 3 DM drafts.",
        session: "Daily reply shortlist for X",
      },
    ],
  },
  {
    id: "f28fefff",
    name: "Watch x-use releases and migrate",
    schedule: "Every day at 09:00",
    zone: "Asia/Riyadh",
    on: true,
    last: { outcome: "silent", ago: "3 h ago" },
    next: "Tomorrow 09:00",
    source: "GitHub releases, polled hourly",
    instruction:
      "When x-use ships a release, read its notes and move this project's calls to the new tools.",
    runs: [
      {
        when: "Today 09:00",
        outcome: "Nothing new",
        result: "No x-use release since 1 Nov.",
        session: "Watch x-use releases and migrate",
      },
    ],
  },
];

const MEMORY_CURATOR: Routine = {
  id: "57c1fb5e",
  name: "Memory curator",
  schedule: "Every day at 06:00",
  zone: "Asia/Riyadh",
  on: true,
  last: { outcome: "silent", ago: "6 h ago" },
  next: "Tomorrow 06:00",
  source: "Schedule",
  instruction:
    "Read the day's sessions, propose the facts worth keeping in the project's knowledge, and drop the ones that went stale.",
  runs: [
    {
      when: "Today 06:00",
      outcome: "Nothing to keep",
      result: "No new fact today.",
      session: "Memory curator",
    },
    {
      when: "16 Oct 06:00",
      outcome: "Proposed",
      result:
        "A knowledge/brand.md update: the native app is 7 days free, then $29.99 once.",
      session: "Memory curator",
    },
  ],
};

const SWING_ROUTINES: Routine[] = [
  ...X_ROUTINES,
  MEMORY_CURATOR,
  {
    id: "5ded67ff",
    name: "File GitHub items as tasks",
    schedule: "Sundays at 04:00",
    zone: "Asia/Riyadh",
    on: false,
    last: { outcome: "silent", ago: "10 days ago" },
    source: "GitHub issues, polled",
    instruction:
      "File each new issue and pull request on bewinxed/cockpit as a task in Ready, linked to its item.",
    runs: [
      {
        when: "26 Oct 04:00",
        outcome: "Nothing new",
        result: "No new issue or pull request.",
        session: "File GitHub items as tasks",
      },
    ],
  },
];

const SWING_ACTIONS: ApprovedAction[] = [
  {
    id: "act-1",
    connection: "x-use",
    account: "@CawCoDev",
    call: "Reply to a post",
    arguments:
      "to @thdxr's post on agent terminals: \"One board for every agent on every machine, answered from the phone. That's the bit we built CawCo for.\"",
    when: "Today 14:00",
    from: "Daily reply shortlist for X",
    state: "waiting",
  },
];

const SWING_DECISIONS: Decision[] = [
  {
    id: "dec-graph-cutover",
    title:
      "Answer three questions before the design graph replaces the component canvas",
    group: "waits",
    picked: 3,
    total: 3,
    unsent: 3,
    waited: "14 h",
    after: "Write the design graph spec",
    unlocks:
      "Replace the component canvas's grid of frames with the design graph",
    tasks: 0,
  },
  {
    id: "dec-title-bars",
    title:
      "Pick where Close stands where Apple's guidelines and DESIGN.md disagree",
    group: "waits",
    picked: 2,
    total: 4,
    unsent: 2,
    waited: "2 min",
    unlocks: "Land the Liquid Glass title bars after his two picks",
    tasks: 0,
  },
  {
    id: "dec-areas",
    title:
      "Pick how the Areas page moves projects and where an area gets its rules",
    group: "waits",
    picked: 1,
    total: 2,
    unsent: 1,
    waited: "3 h",
    tasks: 0,
  },
  {
    id: "dec-phone-presence",
    title: "Pick what Caw's panel asks of a phone",
    group: "waits",
    picked: 0,
    total: 1,
    unsent: 0,
    waited: "11 h",
    after: "Settle presence across devices and the away notes",
    tasks: 0,
  },
  {
    id: "dec-ellipsis",
    title: "Pick what an ellipsis means in CawCo's words",
    group: "waits",
    picked: 1,
    total: 1,
    unsent: 1,
    waited: "11 h",
    tasks: 0,
  },
  {
    id: "dec-filing",
    title: "Pick how a session files and compacts when its context fills",
    group: "sent",
    picked: 2,
    total: 2,
    unsent: 0,
    waited: "yesterday",
    unlocks:
      "Nudge a session to file its open items before its harness compacts it",
    tasks: 1,
  },
  {
    id: "dec-step-slider",
    title: "Pick the step slider's form and what a drag between stops does",
    group: "sent",
    picked: 2,
    total: 2,
    unsent: 0,
    waited: "4 days",
    unlocks: "Read the design graph spec back and get his yes",
    tasks: 0,
  },
  {
    id: "dec-release-cadence",
    title: "Pick how often CawCo ships a release, and what a release says",
    group: "decided",
    picked: 3,
    total: 3,
    unsent: 0,
    waited: "10 days",
    tasks: 2,
    settled: "you picked 2, an advisor settled 1",
  },
  {
    id: "dec-handle",
    title: "Pick the handle at rest",
    group: "decided",
    picked: 1,
    total: 1,
    unsent: 0,
    waited: "4 days",
    tasks: 0,
    settled: "you picked it",
  },
  {
    id: "dec-np-shapes",
    title: "Pick New project's shapes and what Code starts with",
    group: "decided",
    picked: 4,
    total: 4,
    unsent: 0,
    waited: "yesterday",
    tasks: 3,
    settled: "you picked 3, common practice settled 1",
  },
];

const SWING_OUTPUTS: Output[] = [
  {
    id: "out-post-board",
    kind: "post",
    title: "Post: one board instead of a wall of agent terminals",
    body: "Eight agents, four machines, one board. I stopped tabbing through terminals to find the one that's waiting on me. cawco.dev",
    alternates: 3,
    task: "tsk-1",
    taskTitle: "Post: one board instead of a wall of agent terminals",
    stage: "Your call",
    when: "2 h ago",
    isNew: true,
  },
  {
    id: "out-post-phone",
    kind: "post",
    title: "Post: answer an agent permission prompt from your phone",
    body: "Claude Code asked to run `bun test` while I was out. I said yes from the lock screen. That's it, that's the post.",
    alternates: 2,
    task: "tsk-2",
    taskTitle: "Post: answer an agent permission prompt from your phone",
    stage: "Your call",
    when: "2 h ago",
    isNew: true,
  },
  {
    id: "out-shortlist",
    kind: "markdown",
    title: "reply-shortlist-2026-11-04.md",
    body: "Reply shortlist for @CawCoDev: 12 posts from the last 24 hours, 4 of them with a cawco.dev link, plus 3 DM drafts. Nothing was posted.",
    task: "rtn-3a86179c",
    taskTitle: "Daily reply shortlist for X",
    stage: "Routine",
    when: "yesterday",
    isNew: false,
  },
  {
    id: "out-slash",
    kind: "preview",
    title: "tsk-239-slash-commands",
    body: "Judge the one-source slash-command menu",
    task: "tsk-239",
    taskTitle:
      "The list of slash commands in the composer before a session starts differs from the list after it started",
    stage: "Done",
    when: "57 min ago",
    isNew: false,
  },
  {
    id: "out-tip",
    kind: "preview",
    title: "tip-rise-token",
    body: "Check the tooltip's rise now reads the --tip-rise token",
    task: "tsk-233",
    taskTitle: "Give the tooltip's 2px rise a token",
    stage: "Done",
    when: "yesterday",
    isNew: false,
  },
  {
    id: "out-mocks",
    kind: "markdown",
    title: "mocks-cleanup.md",
    body: "Which mocks scripts were deleted and which were kept, with the caller each kept one has.",
    task: "tsk-232",
    taskTitle: "Delete the mocks scripts nothing runs",
    stage: "Done",
    when: "yesterday",
    isNew: false,
  },
  {
    id: "out-ends",
    kind: "canvas",
    title: "project-ends",
    body: "Ending a project and bringing one back",
    task: "tsk-141",
    taskTitle:
      "Turn the person's rambles on a task into edits: a fast pass applies them, deeper asks go to research",
    stage: "Working",
    when: "11 h ago",
    isNew: false,
  },
  {
    id: "out-trace",
    kind: "file",
    title: "boot-relaunch-trace.json",
    task: "tsk-135",
    taskTitle: "Relaunch at boot only what was working",
    stage: "Working",
    when: "4 days ago",
    isNew: false,
    unservable: "its workspace was released, so the file went with it",
  },
  {
    id: "out-filing",
    kind: "choices",
    title: "filing-nudge",
    body: "Pick how a session files and compacts when its context fills · 2 of 2 picked",
    task: "tsk-231",
    taskTitle:
      "Nudge a session to file its open items before its harness compacts it",
    stage: "Ready",
    when: "yesterday",
    isNew: false,
  },
];

const SWING_SESSIONS: Session[] = [
  {
    id: "s-141",
    title: "Turn rambles into task edits",
    kind: "attempt",
    status: "working",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    task: "tsk-141",
    ago: "now",
  },
  {
    id: "s-224",
    title: "Cut previews over to one source",
    kind: "attempt",
    status: "needs",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    task: "tsk-224",
    ago: "12 min",
  },
  {
    id: "s-225",
    title: "Find why niftybot is refused",
    kind: "attempt",
    status: "failed",
    machine: "niftybot.art",
    harness: "Claude Code",
    task: "tsk-225",
    ago: "38 min",
  },
  {
    id: "s-perf",
    title: "Perf: memory growth open and close",
    kind: "spun-off",
    status: "working",
    machine: "obelisk-of-light",
    harness: "OpenCode",
    ago: "now",
  },
  {
    id: "s-find",
    title: "Fix find timing out on obelisk",
    kind: "spun-off",
    status: "idle",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    ago: "18 min",
  },
];

export const SWING: ProjectRecords = {
  name: "Cawco-Dev",
  stages: CAWCO_DEV_STAGES,
  tasks: SWING_TASKS,
  archived: 41,
  routines: SWING_ROUTINES,
  actions: SWING_ACTIONS,
  decisions: SWING_DECISIONS,
  outputs: SWING_OUTPUTS,
  sessions: SWING_SESSIONS,
  asks: [
    {
      session: "Cut previews over to one source",
      asks: "wants to run `bun run check --all`",
      waited: "12 min",
    },
  ],
  caw: {
    status: "working",
    sentence: "Filing the preview cutover's follow-ups as tasks",
    harness: "Claude Code",
    model: "Opus 5.5",
    events: true,
    turns: [
      {
        who: "person",
        at: "09:02",
        text: "the preview cutover keeps finding stragglers. file whatever's left as tasks and start the obvious ones",
      },
      {
        who: "caw",
        at: "09:04",
        text: "Three stragglers are left: the canvas stage still reads the old port map, `artifact_browse` opens the stale origin, and the phone preview keeps its first token. I'm filing each in Ready and starting the first two on obelisk-of-light.",
      },
      {
        who: "caw",
        at: "09:11",
        text: "Filed 3 tasks. Cut previews over to one source of truth is asking to run `bun run check --all`; that waits on you.",
      },
    ],
    starters: [
      "Plan the next release from what's in Review and Done",
      "Why is Relaunch at boot only what was working stuck?",
      "Turn the unsent picks into tasks once I send them",
    ],
  },
  spend: { today: 41.8, month: 612.4, cap: 60, atCap: false },
  lastGood: "10:42",
};

const QUIET_STAGES: Stage[] = [
  { id: "ideas", name: "Ideas", kind: "todo", total: 6 },
  { id: "drafting", name: "Drafting", kind: "active", total: 0 },
  { id: "your-call", name: "Your call", kind: "you", total: 0 },
  { id: "scheduled", name: "Scheduled", kind: "waiting", total: 0 },
  { id: "posted", name: "Posted", kind: "done", total: 5 },
  { id: "dropped", name: "Dropped", kind: "dropped", total: 0 },
];

export const QUIET: ProjectRecords = {
  name: "Cawco",
  stages: QUIET_STAGES,
  tasks: [
    {
      id: "tsk-11",
      title: "Add Edit to the dashboard's routine menu",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-10",
      title: "Write .agents/product-marketing.md for the marketing skills",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-9",
      title: "Find 20 early-user candidates and draft 10 DMs",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-8",
      title: "Make the Caw bookend kit for clips",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-7",
      title: "Founder how-to: how I run agents across my machines",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-6",
      title: "Post: Caw&Co launch announcement",
      stage: "ideas",
      labels: [],
      changed: "1 h ago",
    },
    {
      id: "tsk-5",
      title: "Post: stop typing the same correction to every agent",
      stage: "posted",
      labels: [],
      changed: "2 days ago",
      attempt: { state: "landed" },
    },
    {
      id: "tsk-4",
      title: "Post: install a skill once across the whole fleet",
      stage: "posted",
      labels: [],
      changed: "3 days ago",
      attempt: { state: "landed" },
    },
    {
      id: "tsk-3",
      title: "Post: Claude Code hands work to OpenCode on another machine",
      stage: "posted",
      labels: [],
      changed: "4 days ago",
      attempt: { state: "landed" },
    },
  ],
  archived: 0,
  routines: [X_ROUTINES[2] as Routine, { ...MEMORY_CURATOR, id: "1e473a7a" }],
  actions: [],
  decisions: [],
  outputs: [],
  sessions: [],
  asks: [],
  caw: {
    status: "idle",
    sentence: "Nothing running; the last post went out on Monday",
    harness: "Claude Code",
    model: "Opus 5.5",
    events: true,
    turns: [],
    starters: [
      "Draft the launch announcement from the ideas",
      "Find 20 early-user candidates and draft 10 DMs",
      "Plan this week's posts around the release",
    ],
  },
  spend: { today: 0.4, month: 38.2, cap: 10, atCap: false },
  lastGood: "10:42",
};

/** The empty project: stages named, nothing in them. */
export const EMPTY: ProjectRecords = {
  ...QUIET,
  stages: QUIET_STAGES.map((stage) => ({ ...stage, total: 0 })),
  tasks: [],
  routines: [],
  caw: { ...QUIET.caw, sentence: "Ready when you are", turns: [] },
  spend: { today: 0, month: 0, cap: 10, atCap: false },
};
