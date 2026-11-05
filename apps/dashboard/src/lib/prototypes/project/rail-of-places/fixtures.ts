/**
 * The prototype's record sets, and the reads every screen's states take.
 *
 * - `CAWCO_IN_SWING`: the marketing project in full swing, waits of every
 *   kind (cawco-in-swing.ts).
 * - `CAWCO_DEV_BUSY`: this hub's own project, 238 tasks on five stages, two
 *   in Review waiting on the person (the busy board).
 * - `CAWCO_DEV_QUIET`: the same project on a quiet evening: the two Review
 *   tasks answered (moved to Done, composed), nothing waiting, one attempt
 *   working, its two routines on time.
 * - `JUST_MADE`: a project made a minute ago from Caw: stages named, nothing
 *   in them yet.
 */
import { CAWCO_DEV_TASKS } from "./cawco-dev-tasks";
import type { Project, Read, Stage } from "./model";


const DEV_STAGES: Stage[] = [
  { key: "ready", name: "Ready", kind: "todo" },
  { key: "working", name: "Working", kind: "active" },
  { key: "review", name: "Review", kind: "you" },
  { key: "done", name: "Done", kind: "done" },
  { key: "dropped", name: "Dropped", kind: "dropped" },
];

const DEV_CAW = {
  status: "idle" as const,
  sentence: "Waiting for your next ask; the board is current",
  harness: "Claude Code",
  model: "Opus 5.5",
  eventsReach: true,
  machine: "obelisk-of-light",
  turns: [
    {
      who: "you" as const,
      when: "yesterday 23:40",
      text: "run tonight's board: the open owner-asks first, then the defects",
    },
    {
      who: "caw" as const,
      when: "00:55",
      text: "Tonight's board ran. Five defects landed (tsk-202, tsk-204, tsk-206, tsk-207, tsk-209); the picks you made on tonight-picks are recorded in its log. Two tasks wait in Review: Let start_session choose a harness, and Make a Caw thread a target of the session send pipeline.",
    },
  ],
  starters: [
    "File the design-graph spec's open questions as one decision page",
    "Pick the next three owner-asks and start them",
    "Say what is blocking tsk-18 and who can move it",
  ],
};

export const CAWCO_DEV_BUSY: Project = {
  id: "70ac3d41",
  name: "Cawco-Dev",
  stages: DEV_STAGES,
  tasks: CAWCO_DEV_TASKS.filter((task) => task.stage !== "dropped").concat(
    CAWCO_DEV_TASKS.filter((task) => task.stage === "dropped")
  ),
  archived: 0,
  needs: [
    {
      id: "n-tsk-142",
      kind: "task",
      title:
        "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
      asks: "Its acceptance criteria wait for you: 6 of 7 not shown met by the attempt's report.",
      wait: "4 days",
      task: "tsk-142",
    },
    {
      id: "n-tsk-218",
      kind: "task",
      title: "Let start_session choose a harness",
      asks: "Its acceptance criteria wait for you: tsk-207's pi check was not shown run.",
      wait: "2 days",
      task: "tsk-218",
    },
  ],
  working: [
    {
      id: "w-tsk-27",
      kind: "attempt",
      title:
        "Finish the project page: a Caw-guided start, his pins answered, and the head picked",
      state: "stuck",
      cause:
        "waits on Settle one error-state and one placement rule for every surface",
      task: "tsk-27",
    },
    {
      id: "w-tsk-135",
      kind: "attempt",
      title: "Relaunch at boot only what was working",
      state: "working",
      type: "high",
      task: "tsk-135",
    },
  ],
  routines: [
    {
      id: "57c1fb5e",
      name: "Memory curator",
      schedule: "Every day at 03:00",
      zone: "Asia/Qatar",
      on: true,
      last: { outcome: "silent", ago: "7 h ago" },
      next: "tomorrow 03:00",
      source: { kind: "schedule", name: "Schedule" },
      instruction:
        "Read the project's memory notes from the last day, fold what still holds into knowledge/, and drop what a later note replaced.",
      runs: [
        {
          when: "today, 03:00",
          outcome: "silent",
          took: "4 min",
          produced: "No note changed",
          session: "Memory curator",
        },
      ],
    },
    {
      id: "5ded67ff",
      name: "File GitHub items as tasks",
      schedule: "When an issue or pull request opens on Bewinxed/cawco",
      zone: "Asia/Qatar",
      on: true,
      last: { outcome: "silent", ago: "10 days ago" },
      next: "on the next issue",
      source: { kind: "relay", name: "GitHub, live through the relay" },
      instruction:
        "File each new GitHub issue or pull request as a task in Ready with its link, its labels and one line on what it asks.",
      runs: [
        {
          when: "Mon 26 Oct, 14:31",
          outcome: "silent",
          took: "1 min",
          produced: "Already filed as tsk-128",
          session: "File GitHub items as tasks",
        },
      ],
    },
  ],
  proposed: [],
  decisions: [
    {
      id: "d-tonight",
      title: "Picks from tonight's fixes",
      group: "decided",
      picked: [12, 12],
      age: "2 days",
      settledBy: "you, an advisor and common practice",
      tasks: 4,
    },
    {
      id: "d-head-name",
      title: "What names the artifact at the head of its panel?",
      group: "waits",
      picked: [0, 2],
      age: "3 days",
      unlocks: "Land the Liquid Glass title bars after his two picks",
      question: 1,
    },
    {
      id: "d-design-graph",
      title: "The design graph's spec questions",
      group: "sent",
      picked: [6, 6],
      age: "4 days",
      unlocks: "Read the design graph spec back and get his yes",
    },
  ],
  outputs: [
    {
      id: "o-advice",
      kind: "markdown",
      name: "tsk-142-advice.md",
      task: "tsk-142",
      taskTitle:
        "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
      stage: "review",
      when: "10 days ago",
      excerpt:
        "A thread is addressed as a session: thread:<id> is the address a send goes to, a transcript page is read at, and a stream is followed under.",
    },
    {
      id: "o-stuck-fixes",
      kind: "preview",
      name: "caw-thread-stuck-fixes",
      task: "tsk-142",
      taskTitle:
        "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
      stage: "review",
      when: "10 days ago",
      excerpt:
        "Caw's thread queue was stuck behind an ask filed in another thread.",
    },
    {
      id: "o-harness",
      kind: "preview",
      name: "start-session-harness",
      task: "tsk-218",
      taskTitle: "Let start_session choose a harness",
      stage: "review",
      when: "2 days ago",
      excerpt:
        "The tool as a calling agent reads it, and the resolution table.",
    },
    {
      id: "o-holds",
      kind: "file",
      name: "probe-on-main-with-holds.log",
      task: "tsk-135",
      taskTitle: "Relaunch at boot only what was working",
      stage: "working",
      when: "11 days ago",
      size: "184 KB",
    },
    {
      id: "o-tonight",
      kind: "choices",
      name: "Picks from tonight's fixes",
      task: "session",
      taskTitle: "Run tonight's CawCo board",
      stage: "session",
      when: "2 days ago",
      excerpt: "12 of 12 picked",
    },
    {
      id: "o-tom",
      kind: "markdown",
      name: "project-tom.md",
      task: "session",
      taskTitle: "Redesign the project page from a clean slate",
      stage: "session",
      when: "today",
      excerpt:
        "Task & Object Model: a project in CawCo, taken whole. The top of the ranking is what the project surface is for.",
      isNew: true,
    },
    {
      id: "o-rail",
      kind: "canvas",
      name: "rail-of-places",
      task: "session",
      taskTitle: "Redesign the project page from a clean slate",
      stage: "session",
      when: "today",
      isNew: true,
    },
    {
      id: "o-ux-review",
      kind: "markdown",
      name: "task-ux-review.md",
      task: "tsk-142",
      taskTitle:
        "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
      stage: "review",
      when: "10 days ago",
      excerpt:
        "Review card Open and More are dead: virtua sets pointer-events: none while it scrolls.",
    },
  ],
  sessions: [
    {
      id: "s-tonight",
      title: "Run tonight's CawCo board",
      kind: "caw",
      state: "idle",
      machine: "obelisk-of-light",
      harness: "Claude Code",
      age: "9 h",
    },
    {
      id: "s-tsk-135",
      title: "Relaunch at boot only what was working",
      kind: "attempt",
      state: "working",
      machine: "obelisk-of-light",
      harness: "Claude Code",
      age: "4 days",
      task: "tsk-135",
    },
    {
      id: "s-continue",
      title: "Continue CawCo open tasks",
      kind: "spun",
      state: "idle",
      machine: "obelisk-of-light",
      harness: "Claude Code",
      age: "44 min",
    },
  ],
  spend: {
    today: "$27.80",
    capDay: "$60",
    share: 0.463,
    month: "$412.30",
    capMonth: "$1,500",
    monthShare: 0.275,
    sources: [
      { name: "Continue CawCo open tasks", amount: "$14.20", share: 0.51 },
      {
        name: "Relaunch at boot only what was working",
        amount: "$8.90",
        share: 0.32,
      },
      { name: "Caw", amount: "$3.95", share: 0.14 },
      { name: "Memory curator", amount: "$0.75", share: 0.03 },
    ],
  },
  caw: DEV_CAW,
  nextRun: "03:00",
  hasDates: false,
  hasEdges: true,
};

/** The same project with its two Review tasks answered: nothing waits. */
export const CAWCO_DEV_QUIET: Project = {
  ...CAWCO_DEV_BUSY,
  tasks: CAWCO_DEV_BUSY.tasks.map((task) =>
    task.stage === "review"
      ? { ...task, stage: "done", needsYou: false, changed: "just now" }
      : task
  ),
  needs: [],
  working: CAWCO_DEV_BUSY.working.filter((work) => work.state === "working"),
  decisions: CAWCO_DEV_BUSY.decisions.filter(
    (decision) => decision.group !== "waits"
  ),
  outputs: CAWCO_DEV_BUSY.outputs.map((output) => ({
    ...output,
    isNew: false,
  })),
};

/** A project Caw made a minute ago: its stages named, nothing in them. */
export const JUST_MADE: Project = {
  id: "b1e0c3aa",
  name: "Northwind onboarding",
  stages: DEV_STAGES,
  tasks: [],
  archived: 0,
  needs: [],
  working: [],
  routines: [],
  proposed: [],
  decisions: [],
  outputs: [],
  sessions: [],
  spend: null,
  caw: {
    status: "idle",
    sentence: "Ready when you say what this project is for",
    harness: "Claude Code",
    model: "Opus 5.5",
    eventsReach: true,
    machine: "obelisk-of-light",
    turns: [],
    starters: [
      "Plan the first week of onboarding fixes",
      "Read the open issues and file the real ones as tasks",
      "Draft the routines this project should run",
    ],
  },
  nextRun: null,
  hasDates: false,
  hasEdges: false,
};

/** The hub stopped answering at 10:42: every list keeps its last good rows. */
export const STALE: Read = { status: "loaded", stale: "10:42", unread: [] };

/** The first read is still out. */
export const LOADING: Read = { status: "loading", stale: null, unread: [] };
