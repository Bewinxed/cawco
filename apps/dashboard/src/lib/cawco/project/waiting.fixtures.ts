/**
 * Private office as its page stood on 2026-11-05 while its setup page
 * waited on the person's picks and two tasks waited on its cards: the
 * hub's own records (GET /api/projects/:id/stages, /tasks, /decisions),
 * read from the live hub after the picks, set back to before them. What
 * the two tasks share is written once (`SHARED`).
 */
import type { DecisionPageSummary } from "@cawco/core/decisions";
import type { StagesView, TaskSummary } from "#lib/cawco/project-tasks.js";

export const PO_ID = "ffb5d15a-a509-43ce-b94e-cd8bf20b48e9";
export const PO_NAME = "Private office";

export const PO_STAGES = {
  source: "file",
  starters: [
    {
      text: "Walk me through what “Fix his public profiles to the record” needs from me",
      glyph: "reply",
      reason: "It waits on you in your-call.",
      sources: [
        {
          kind: "task",
          ref: "tsk-2",
        },
      ],
    },
  ],
  routineStarters: [],
  decisionStarters: [
    {
      text: "Write a decision page for “Fix his public profiles to the record”",
      glyph: "brief",
      reason: "It waits on your pick in your-call.",
      sources: [
        {
          kind: "task",
          ref: "tsk-2",
        },
      ],
    },
  ],
  template: null,
  stages: [
    {
      name: "inbox",
      kind: "todo",
      hooks: {},
      icon: "inbox",
      color: "cyan",
    },
    {
      name: "scouting",
      kind: "active",
      hooks: {
        runs: "scout",
      },
      icon: "search",
      color: "cyan",
    },
    {
      name: "drafting",
      kind: "active",
      hooks: {
        runs: "writer",
      },
      icon: "pen",
      color: "amber",
    },
    {
      name: "your-call",
      kind: "you",
      hooks: {},
      icon: "eye",
    },
    {
      name: "sending",
      kind: "active",
      hooks: {
        runs: "sender",
      },
      icon: "send",
      color: "amber",
    },
    {
      name: "sent",
      kind: "waiting",
      hooks: {
        after: "14d",
        afterMs: 1_209_600_000,
      },
      icon: "clock",
      color: "amber",
    },
    {
      name: "follow-up",
      kind: "active",
      hooks: {
        runs: "writer",
      },
      icon: "chat",
      color: "amber",
    },
    {
      name: "won",
      kind: "done",
      hooks: {},
      icon: "rocket",
      color: "green",
    },
    {
      name: "dropped",
      kind: "dropped",
      hooks: {},
      icon: "trash",
    },
  ],
  moves: [
    {
      from: "*",
      to: "*",
      who: ["you", "session"],
    },
  ],
  views: [],
  problems: [],
} as unknown as StagesView;

/** What tsk-1 and tsk-2 share in the hub's list. */
const SHARED = {
  attempts: [],
  liveAttempt: false,
  heldBy: null,
  ready: false,
  parts: [],
  unblocks: [],
  builtOn: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  queuedStart: false,
  startProblem: null,
  type: "writer",
  partOf: null,
  foundIn: null,
  duplicateOf: null,
  rank: null,
  labels: [],
  links: [],
  outputs: [],
  todos: {
    done: 0,
    total: 0,
  },
  createdBy: {
    mover: "session",
    id: "1c27ffab-bf1d-430c-942c-064345c164bf",
    name: "Caw",
  },
  updatedBy: {
    mover: "session",
    id: "1c27ffab-bf1d-430c-942c-064345c164bf",
    name: "Caw",
  },
  archivedAt: null,
  completedAt: null,
  problem: null,
};

const TSK2 = {
  ...SHARED,
  ...{
    id: "tsk-2",
    number: 2,
    path: "tasks/tsk-2-fix-his-public-profiles-to-the-record.md",
    title: "Fix his public profiles to the record",
    stage: "your-call",
    kind: "you",
    needsYou: true,
    waits: [
      {
        target: "a1f4932b-cd80-41dd-9349-4623e2d9b372#record",
        kind: "card",
        href: "cawco:decision/a1f4932b-cd80-41dd-9349-4623e2d9b372/record",
        label: "What happens to the claims on his public profiles?",
        settled: true,
        state: "picked",
        flag: null,
        value: "fix",
        dropped: false,
        via: null,
      },
    ],
    waitsOn: ["a1f4932b-cd80-41dd-9349-4623e2d9b372#record"],
    fields: {
      triage: "needs-info",
    },
    createdAt: 1_793_853_064_000,
    updatedAt: 1_793_854_454_000,
    startedAt: 1_793_854_208_000,
    droppedAt: null,
    closeReason: null,
  },
};

/** The tasks as the hub listed them, their waits settled (after the picks). */
export const PO_TASKS = [
  {
    ...SHARED,
    ...{
      id: "tsk-1",
      number: 1,
      path: "tasks/tsk-1-prepare-the-anthropic-fellows-assessment.md",
      title: "Prepare the Anthropic Fellows assessment",
      stage: "dropped",
      kind: "dropped",
      needsYou: false,
      waits: [
        {
          target: "a1f4932b-cd80-41dd-9349-4623e2d9b372#fellows",
          kind: "card",
          href: "cawco:decision/a1f4932b-cd80-41dd-9349-4623e2d9b372/fellows",
          label:
            "Does the office prepare the Anthropic Fellows assessment now?",
          settled: true,
          state: "picked",
          flag: null,
          value: "skip",
          dropped: false,
          via: null,
        },
      ],
      waitsOn: ["a1f4932b-cd80-41dd-9349-4623e2d9b372#fellows"],
      fields: {
        triage: "ready-for-human",
      },
      createdAt: 1_793_853_054_000,
      updatedAt: 1_793_854_199_000,
      startedAt: null,
      droppedAt: 1_793_854_199_000,
      closeReason:
        'He picked "Let it go" on the Fellows card and wrote to hold for now: the programme requires US, UK or Canadian work authorisation with no sponsorship.',
    },
  },
  TSK2,
] as unknown as TaskSummary[];

/** The setup page as the Decisions tab lists it (after the picks). */
export const PO_SETUP_PAGE = {
  name: "setup",
  title: "Private office",
  artifactId: "a1f4932b-cd80-41dd-9349-4623e2d9b372",
  writer: {
    instanceId: "1c27ffab-bf1d-430c-942c-064345c164bf",
    title: "Caw",
    ended: false,
  },
  cards: 8,
  picked: 8,
  notes: 3,
  decided: 8,
  tasks: 0,
  state: "picking",
  updatedAt: 1_793_856_365_159,
  after: [],
  unlocks: [],
  questions: [
    "What does the office go after first?",
    "What happens to the claims on his public profiles?",
    "Who sends what the office drafts?",
    "Does the office prepare the Anthropic Fellows assessment now?",
    "What runs on its own?",
    "Which account do the office's sessions start on?",
    "Where do the office's tasks and routines run?",
    "What does the office take from career-ops?",
  ],
  answers: [
    "Remote roles, paid in dollars",
    "Don't just stick to AD, you're biased cause it's in my history, not because you actually took a look",
    "Fix them with his corrections",
    "elaborate?",
    "The office sends after his pick",
    "Let it go",
    "hold for now",
    "The weekly scan and a monthly expiry pass",
    "The fleet's routing",
    "Usage limits are per account (a five-hour session limit plus a weekly limit), so pinning all office sessions to one account concentrates them on one budget, while zele already reads mail from any account and makes the connectors unnecessary.",
    "obelisk-of-light, in ~/private-office",
    "Scheduled automation is run on the machine that holds the tools and sessions the job needs, and only obelisk-of-light has both the Brave browser and the LinkedIn session, so the other two places would still send the browser work back there.",
    "Its scripts, as command-line tools",
    "The four tools the office lacks (scan.mjs, check-liveness.mjs, verify-ats.mjs, generate-pdf.mjs) are plain Node commands in career-ops's own package.json that run with \"no AI tokens\", while the skill's 77,000-token prompt stack only restates the scout's six-step brief and would plant a second tracker beside a board whose stages, weekly scan and sender are already settled.",
  ],
} as unknown as DecisionPageSummary;

/**
 * What Project details reads of it (GET /api/projects/:id/decides, /gate,
 * /tracker), as the hub answered: Who decides from the fleet's, no merge
 * checks, tasks kept in CawCo.
 */
export const PO_DETAILS = {
  decides: {
    file: "decides.md",
    decides: {
      routes: {
        look: "you",
        behaviour: "you",
        scope: "you",
        approach: "advisor",
        rules: "advisor",
        tools: "practice",
      },
      from: {
        look: "fleet",
        behaviour: "fleet",
        scope: "fleet",
        approach: "fleet",
        rules: "fleet",
        tools: "fleet",
      },
      yours: [],
      problems: [],
    },
  },
  gate: {
    file: "gate.md",
    gate: {
      kind: "none",
    },
  },
  tracker: {
    tracker: "cawco",
    binding: null,
  },
};

/** Private office as the hub lists it among the projects (GET /api/projects). */
export const PO_ROW = {
  id: PO_ID,
  name: PO_NAME,
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: "2026-11-05T09:00:00.000Z",
  eventsOn: true,
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: [],
  places: [],
  primaryPlaceId: null,
  review: false,
};
