/**
 * DESIGN STATES fixtures: Caw's floating panel (CawFloat > CawThread >
 * ThreadPane docked) in every state the design report touches, on the
 * Harbour site seed. Each state names its switches: Today first, then the
 * proposals, and where it lists things or says a line, a stretched twin
 * at the widths the addendum names. Throwaway: this folder is the whole
 * page, removed in one delete.
 */
import type {
  CawView,
  ProjectCap,
  ProjectStarter,
  SessionPulse,
  ThreadMessage,
  ThreadSummary,
  UserQuestion,
} from "@cawco/core";
import type {
  PendingPermission,
  ProjectRow,
} from "#lib/cawco/client.svelte.js";
import type {
  StagesView,
  StarterGlyph,
  TaskSummary,
} from "#lib/cawco/project-tasks.js";

export const PROJECT_ID = "harbour-site";
export const PROJECT_NAME = "Harbour site";
export const LEAD_ID = "caw-harbour-site";
const MACHINE = "obelisk";
const CWD = "/home/bewinxed/work/harbour-site";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** One state's data: what the store holds and what the panel's reads answer. */
export interface Fixture {
  /** The hub away: the store reads `unreachable`, the panel's reads never go. */
  away?: boolean;
  cap?: ProjectCap | null;
  caw: CawView;
  lead?: {
    blocks: { id: string; type: "user" | "assistant"; content: string }[];
    busy: boolean;
    pending: PendingPermission[];
    streaming: string;
  };
  messages: Record<string, ThreadMessage[]>;
  /** Opened on New thread, so the hero stands with the earlier threads under it. */
  newThread?: boolean;
  /** Today's ask with its first choice pressed, as a person would. */
  pickFirst?: boolean;
  /** Today's not-woken Try again pressed: the wake is held, so it stays pending. */
  pressAgain?: boolean;
  pulse?: SessionPulse;
  /** The thread read the hub refuses, in its words. */
  readFails?: string;
  stages?: StagesView;
  tasks: TaskSummary[];
  threads: ThreadSummary[];
}

// --- the project ---------------------------------------------------------------

export const project = (cap: ProjectCap | null): ProjectRow => ({
  appleGate: false,
  cap,
  caw: true,
  createdAt: new Date(Date.now() - 9 * DAY).toISOString(),
  id: PROJECT_ID,
  name: PROJECT_NAME,
  places: [],
  primaryPlaceId: null,
  lands: "main",
  remote: "github.com/bewinxed/harbour-site",
  review: false,
  upstreamPosts: null,
});

const caw = (change: Partial<CawView> = {}): CawView => ({
  answering: null,
  harness: "claude",
  leadInstanceId: LEAD_ID,
  model: null,
  on: true,
  problem: null,
  running: [],
  spendUsd: 3.42,
  ...change,
});

/**
 * The project's starters as the hub writes them for it now (core
 * `ProjectStarter`: the sentence, why it is offered, what it comes from).
 * Today draws them as chips; the proposal as Suggestions rows.
 */
export const starters: ProjectStarter[] = [
  {
    glyph: "bug",
    text: "Find what's broken on the booking page",
    reason: "The booking page had 3 errors in its last run.",
    sources: [{ kind: "path", ref: "/book" }],
  },
  {
    glyph: "draft",
    text: "Draft Friday's launch email",
    reason: "Friday's launch email hasn't had a reply in 2 days.",
    sources: [{ kind: "thread", ref: "th-launch-email" }],
  },
  {
    glyph: "tasks",
    text: "Break the launch into tasks",
    reason: "The launch is in 5 days and Backlog holds one task for it.",
    sources: [],
  },
  {
    glyph: "search",
    text: "Check the site's copy for anything that reads off",
    reason: "You asked about the onboarding copy 10 minutes ago.",
    sources: [{ kind: "thread", ref: "th-onboarding-copy" }],
  },
];

const stagesWith = (list: ProjectStarter[]): StagesView => ({
  decisionStarters: [],
  moves: [],
  problems: [],
  routineStarters: [],
  source: "template",
  stages: [
    { name: "Backlog", kind: "todo", hooks: {} },
    { name: "Doing", kind: "active", hooks: {} },
    { name: "Review", kind: "you", hooks: {} },
    { name: "Done", kind: "done", hooks: {} },
  ],
  starters: list,
  template: "launch",
  views: [],
});
export const stages = stagesWith(starters);

const task = (number: number, title: string, ago: number): TaskSummary => ({
  after: [],
  attempts: [],
  blockedBy: [],
  createdAt: Date.now() - ago,
  duplicateOf: null,
  fields: {},
  foundIn: null,
  id: `hb-${number}`,
  kind: "todo",
  labels: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: false,
  needsYou: false,
  number,
  outputs: [],
  parent: null,
  path: `tasks/hb-${number}.md`,
  problem: null,
  queuedStart: false,
  rank: null,
  related: [],
  stage: "Backlog",
  startProblem: null,
  title,
  todos: { done: 0, total: 0 },
  type: null,
  updatedAt: Date.now() - ago,
});

/** A task Caw files from an offer on the board, new in Backlog. */
export const filedFrom = (number: number, title: string): TaskSummary =>
  task(number, title, 0);

const filed: TaskSummary[] = [
  task(3, "Write the pricing page copy", 25 * HOUR),
  task(4, "Changelog for 0.9", 25 * HOUR),
  task(5, "Swap the hero photo for the harbour at dusk", 25 * HOUR),
];

/**
 * What the proposal draws on each filed card past today's title and id: the
 * task file's first body line (`summary`), Caw's reason for filing it
 * (`why`), and whether it waits on you. The hub supplies none of these yet
 * (report §13.6); the page reads them here.
 */
export interface TaskExtra {
  summary: string | null;
  waits: boolean;
  why: string | null;
}

const EXTRAS: Record<string, TaskExtra> = {
  "hb-3": {
    summary: "Prices, plans and the FAQ for /pricing",
    why: "needs your numbers before anyone starts it",
    waits: true,
  },
  "hb-4": {
    summary: "Every change since 0.8, grouped by area",
    why: null,
    waits: false,
  },
  "hb-5": {
    summary: "The dusk shot from the brand folder",
    why: null,
    waits: false,
  },
};

const LONG_TITLES = [
  "Rewrite the pricing page so every plan names what it includes, what it costs per seat each month and each year, which limits apply to teams over fifty people, and how a customer moves between plans without losing any of their booking history",
  "Changelog for 0.9 covering every change since 0.8, grouped by area, with the booking fixes first, the new harbour photography second, and a short note on the pricing move that links to the page and the FAQ entries",
  "Swap the hero photo for the harbour at dusk across the home page, the booking page and the press kit, cropped for phones and tablets, with alt text that says what the picture shows rather than what it is for",
  "Find out why the booking page drops the selected date when a guest switches between weekly and monthly views on a phone, write down every step that reproduces it, and fix it without changing how the desk layout behaves today",
  "Draft Friday's launch email with three subject lines, a short body that leads with the harbour photo, a link to the new pricing page, and a plain-text version for the readers whose mail clients refuse images entirely",
  "Check every page of the site for copy that still says workspace where the product now says project, list each place with its path and line, and change the ones that are safe to change before Friday's launch",
  "Move the three tasks that have stood in Review since Tuesday along, asking whoever owns each one what is left, and file a follow-up for anything that cannot land before the launch email goes out on Friday morning",
  "Write a README for the repository that says how to run the site locally, where the photography lives, how the booking page talks to the calendar service, and who to ask when the deploy to the harbour host fails",
];

const LONG_SUMMARY =
  "Every plan, its price per seat, its limits, and the FAQ entries that answer what changes for teams already booked under the old prices, kept to what the pricing page itself can say";
const LONG_WHY =
  "needs your numbers for the team plan and the yearly discount before anyone starts it, because the copy and the FAQ both quote them";

const stretched = (count: number): TaskSummary[] =>
  LONG_TITLES.slice(0, count).map((title, at) =>
    task(20 + at, title, 25 * HOUR)
  );
for (const [at] of LONG_TITLES.entries()) {
  EXTRAS[`hb-${20 + at}`] = {
    summary: at % 3 === 2 ? null : LONG_SUMMARY,
    why: at === 0 || at % 4 === 1 ? LONG_WHY : null,
    waits: at === 0 || at % 4 === 1,
  };
}

export const extraOf = (id: string): TaskExtra =>
  EXTRAS[id] ?? { summary: null, why: null, waits: false };

// --- the threads -----------------------------------------------------------------

const thread = (
  id: string,
  title: string,
  ago: number,
  change: Partial<ThreadSummary> = {}
): ThreadSummary => ({
  id,
  lastAt: Date.now() - ago,
  projectId: PROJECT_ID,
  setup: false,
  status: "ready",
  title,
  ...change,
});

const you = (
  threadId: string,
  id: string,
  body: string,
  ago: number
): ThreadMessage => ({
  author: "you",
  body,
  createdAt: Date.now() - ago,
  id,
  threadId,
});

const his = (
  threadId: string,
  id: string,
  body: string,
  ago: number,
  tasks?: string[]
): ThreadMessage => ({
  author: "caw",
  body,
  createdAt: Date.now() - ago,
  id,
  threadId,
  ...(tasks ? { tasks } : {}),
});

const LAUNCH = "th-launch-email";
const SHIP = "th-whats-left";
const COPY = "th-onboarding-copy";

const launch = thread(
  LAUNCH,
  "Plan the launch email for Friday",
  2 * DAY - 3 * MIN
);
const ship = thread(
  SHIP,
  "What's left before we can ship?",
  26 * HOUR - 2 * MIN
);
const copy = thread(COPY, "Can you check the onboarding copy?", 10 * MIN);

export const LONG_THREAD_TITLE =
  "Can you check the onboarding copy on the booking page, the pricing page and the three welcome emails for anything that still says workspace where the product now says project, and tell me which ones are safe to change before Friday's launch goes out";

const launchSaid: ThreadMessage[] = [
  you(LAUNCH, "m-l1", "Plan the launch email for Friday", 2 * DAY),
  his(
    LAUNCH,
    "m-l2",
    "Drafted it: three subject lines and a short body that leads with the harbour photo. Pick a subject and I'll file the send as a task for Friday morning.",
    2 * DAY - 3 * MIN
  ),
];
const shipSaid = (ids: string[]): ThreadMessage[] => [
  you(SHIP, "m-s1", "What's left before we can ship?", 26 * HOUR),
  his(
    SHIP,
    "m-s2",
    "Three things, filed for Friday: the pricing page copy, the 0.9 changelog and the hero photo swap. The pricing copy needs your numbers before anyone starts it.",
    26 * HOUR - 2 * MIN,
    ids
  ),
];
const copyAsked = you(
  COPY,
  "m-c1",
  "Can you check the onboarding copy? Something reads off in step two.",
  12 * MIN
);
const copySaid: ThreadMessage[] = [
  copyAsked,
  his(
    COPY,
    "m-c2",
    "Read all three steps. Step two says **workspace** where the rest say **project**, and the hint under the name field repeats the label above it.\n\nI'd change it to *project* and cut the hint. Want me to file both as tasks?",
    10 * MIN
  ),
];

/** The project's threads, newest first, and what each holds. */
const all = (newest: ThreadSummary, said: ThreadMessage[]) => ({
  threads: [newest, ship, launch],
  messages: {
    [newest.id]: said,
    [SHIP]: shipSaid(filed.map((one) => one.id)),
    [LAUNCH]: launchSaid,
  },
});

// --- his ask --------------------------------------------------------------------

const askThread = thread(COPY, "Can you check the onboarding copy?", 2 * MIN, {
  status: "needs-you",
});
const askOf = (question: UserQuestion): PendingPermission => ({
  heard: 1,
  input: { questions: [question] },
  instanceId: LEAD_ID,
  presentation: {
    asker: "Caw",
    changes: [],
    fields: [],
    project: PROJECT_NAME,
    summary: question.question,
  },
  raisedAt: Date.now() - 2 * MIN,
  requestId: "ask-step-two",
  threadId: COPY,
  toolName: "AskUserQuestion",
  toolUseId: "toolu-step-two",
});

const LONG_DESC =
  "Matches steps one and three, the board's own column names and every email the project sends, so a guest who reads the welcome email and then opens the booking page meets one word for one thing all the way through";

export const QUESTIONS: Record<string, UserQuestion> = {
  ask: {
    header: "Step two",
    multiSelect: false,
    question: "Which word should step two use?",
    options: [
      { label: "Project", description: "" },
      { label: "Workspace", description: "" },
      { label: "Space", description: "" },
    ],
  },
  "ask-descriptions": {
    header: "Step two",
    multiSelect: false,
    question: "Which word should step two use?",
    options: [
      {
        label: "Project",
        description: "Matches steps one and three, and the board.",
      },
      {
        label: "Workspace",
        description:
          "Keeps step two as it is; the other steps change to match.",
      },
    ],
  },
  "ask-long": {
    header: "Step two",
    multiSelect: false,
    question:
      "Step two says workspace where steps one and three say project, and the hint under the name field repeats the label right above it. Which word should step two use, and should the hint under the name field go?",
    options: [
      { label: "Project, cut the hint", description: "" },
      { label: "Project, keep it", description: "" },
    ],
  },
  "ask-many": {
    header: "Next page",
    multiSelect: false,
    question: "Which page should I check next?",
    options: [
      { label: "Pricing", description: "" },
      { label: "Booking", description: "" },
      { label: "About", description: "" },
      { label: "Careers", description: "" },
      { label: "Press kit", description: "" },
      { label: "Contact", description: "" },
    ],
  },
  "ask-stretched": {
    header: "Step two",
    multiSelect: false,
    question:
      "Step two of onboarding says workspace where steps one and three say project, the hint under the name field repeats the label above it, and the welcome email uses a third word again: which word should every one of those places use from Friday's launch on?",
    options: [
      "Project",
      "Workspace",
      "Space",
      "Harbour",
      "Account",
      "Studio",
      "Site",
      "Booking calendar for the whole team",
    ].map((label) => ({ label, description: LONG_DESC })),
  },
};

// --- your words he has not read ---------------------------------------------------

const resize = you(
  COPY,
  "m-c3",
  "Can you resize the hero photo for phones too?",
  3 * MIN
);
const notWokenNote = (
  id: string,
  message: string,
  at: number,
  words: string,
  reason: "no-machine" | "could-not-start" = "no-machine"
): ThreadMessage => ({
  author: "event",
  body: undefined,
  createdAt: at,
  event: {
    kind: "caw",
    notWoken: { message, reason, words },
    what: "not-woken",
  },
  id,
  noteTitle: "Caw · not woken",
  threadId: COPY,
});
const notWokenSaid: ThreadMessage[] = [
  ...copySaid,
  resize,
  notWokenNote(
    "m-c4",
    resize.id,
    Date.now() - 3 * MIN + 400,
    "No machine is online, so Caw can't start."
  ),
];
export const LONG_WORDS =
  "The machine Caw runs on refused to start his session because its Claude login expired overnight, and the hub could not reach the second machine either, so nothing has read your message yet and nothing will until one of them answers again";
const longAsk = you(
  COPY,
  "m-c5",
  "Can you resize the hero photo for phones too, and while you're there check that the booking page's date picker keeps the chosen day when a guest switches between the weekly and the monthly view on a small screen?",
  2 * MIN
);
const notWokenStretched: ThreadMessage[] = [
  ...copySaid,
  resize,
  notWokenNote(
    "m-c4",
    resize.id,
    Date.now() - 3 * MIN + 400,
    "No machine is online, so Caw can't start."
  ),
  longAsk,
  notWokenNote(
    "m-c6",
    longAsk.id,
    Date.now() - 2 * MIN + 400,
    LONG_WORDS,
    "could-not-start"
  ),
];

// --- what the proposals read that the hub does not give yet -------------------------

/** One row of Show details: what it is about (a machine's name) and what it said. */
export interface DetailRow {
  name: string;
  said: string;
}
/** Why Caw can't start, machine by machine: the reason the hub's sentence held. */
export const MACHINES: DetailRow[] = [
  { name: "obelisk", said: "offline since 14:02" },
  { name: "harbour-mac", said: "asleep, refused the wake" },
];
export const MANY_MACHINES: DetailRow[] = [
  ...MACHINES,
  { name: "studio-linux-workstation-2", said: "offline since Monday" },
  { name: "pi-garage", said: "offline since 3 Oct" },
  { name: "build-box", said: "updating since 13:58" },
  { name: "jude-ipad", said: "asleep since 09:40" },
  { name: "old-laptop", said: "offline since August" },
  { name: "render-node-east", said: "offline since 12:15" },
];
/** The budget's figures: a footnote under Show details, never the notice's line. */
export const BUDGET_ROWS: DetailRow[] = [
  { name: "Spent", said: "$20.40 of today's $20" },
  { name: "Resets", said: "in 4h" },
  { name: "At the cap", said: "Caw's own wakes stop; yours still go" },
];
/** The hub away: what the connection band knows. */
export const HUB_ROWS: DetailRow[] = [
  { name: "Hub", said: "unreachable since 14:02" },
  { name: "Last answer", said: "40s ago" },
  { name: "Next try", said: "in 12s" },
];
export const LONG_PROBLEM =
  "The hub found two machines that can run Caw, but obelisk is offline since 14:02 and harbour-mac is asleep and refused the wake it was sent, so Caw's session for Harbour site could not be started on either of them this time";

export const READ_PROBLEM = "The hub could not open this thread's history.";
export const READ_RAW =
  "hub: ENOENT: no such file or directory, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl'";
export const READ_RAW_LONG =
  "hub: EACCES: permission denied, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl' (the hub runs as cawco:cawco and the file is owned by root:root after the restore from last night's backup copied it in with the wrong owner and mode 0600)";

/** A suggestion is the hub's own starter (core `ProjectStarter`); an empty reason draws no line. */
export type Suggestion = ProjectStarter;
export const SUGGESTED: Suggestion[] = starters.slice(0, 3);
export const SUGGESTED_MANY: Suggestion[] = [
  ...starters,
  {
    glyph: "brief",
    text: "Write a README for the repository",
    reason: "The repository has no README yet.",
    sources: [],
  },
  {
    glyph: "stages",
    text: "Move the review tasks along",
    reason: "Three tasks have waited in Review since Tuesday.",
    sources: [],
  },
];
/** Before and after the project changed: two swap, one leaves, one arrives, a reason morphs. */
export const REFRESH_BEFORE: Suggestion[] = [
  SUGGESTED[0],
  SUGGESTED[1],
  SUGGESTED[2],
  SUGGESTED_MANY[3],
];
export const REFRESH_AFTER: Suggestion[] = [
  SUGGESTED[2],
  SUGGESTED[0],
  {
    glyph: "draft",
    text: "Write the pricing page copy",
    reason: "It has waited on your numbers in Backlog for 2 days.",
    sources: [{ kind: "task", ref: "hb-3" }],
  },
  {
    ...SUGGESTED[1],
    reason: "Friday's launch email hasn't had a reply in 3 days.",
  },
];
export const SUGGESTED_STRETCHED: Suggestion[] = LONG_TITLES.map(
  (text, at) => ({
    glyph: (
      [
        "draft",
        "brief",
        "site",
        "bug",
        "mail",
        "search",
        "stages",
        "brief",
      ] as StarterGlyph[]
    )[at],
    text,
    reason:
      at === 3
        ? ""
        : "It has waited two days in Backlog for your numbers on the team plan and the yearly discount, which the pricing copy and its FAQ both quote.",
    sources: [],
  })
);

// --- the states, in the switcher's order -----------------------------------------

export interface Choice {
  id: string;
  label: string;
}
const TODAY: Choice = { id: "today", label: "Today · main as it ships" };
const PROPOSED: Choice = { id: "proposed", label: "Proposed" };
const TP = [TODAY, PROPOSED];
/** Built and on main (b6a6b8c92): Today is the design, nothing to propose. */
const LANDED = [{ id: "today", label: "Today · landed on main" }];
const TASKS = [
  TODAY,
  { id: "a", label: "A · three-line cards" },
  { id: "b", label: "B · list rows" },
];
const READ = [
  TODAY,
  { id: "a", label: "A · Caw, ask him to look" },
  { id: "b", label: "B · Solar mark" },
];
const START = [
  TODAY,
  { id: "a", label: "A · composer gives way" },
  { id: "b", label: "B · composer stays" },
];
const START_THREAD = [...START, { id: "b-sent", label: "B · after a send" }];
const RESIZE = [
  TODAY,
  { id: "a", label: "A · corner grip" },
  { id: "b", label: "B · Wide panel in More" },
  { id: "c", label: "C · edge handles" },
];
const HEAD = TP;
/** The panel's widths a stretched twin is judged at (addendum §B). */
const WIDE = [368, 380, 720];

export interface StateDef {
  /** Item counts to pick from, where the count is the point (an odd count orphans). */
  counts?: number[];
  key: string;
  label: string;
  /** Built and on main: Today is the design. */
  landed?: boolean;
  /** The state drawn in a 390 phone frame instead. */
  phone?: string;
  /** Motion that runs once: the switcher offers Replay. */
  replay?: boolean;
  /** Panel sizes to pick from, "w×h". */
  sizes?: string[];
  variants: Choice[];
  /** Widths to pick from: the panel's, or the board's for the board hero. */
  widths?: number[];
}

export interface StateGroup {
  heading: string;
  states: StateDef[];
}

export const GROUPS: StateGroup[] = [
  {
    heading: "Filed tasks · pin 1",
    states: [
      {
        key: "reply-tasks-described",
        label: "Filed, landing live",
        variants: TASKS,
        replay: true,
      },
      {
        key: "reply-tasks-stretched",
        label: "Filed, stretched",
        variants: TASKS,
        widths: WIDE,
        counts: [8, 7, 1],
      },
    ],
  },
  {
    heading: "Not woken · pin 3",
    states: [
      { key: "not-woken", label: "Not woken", variants: LANDED, landed: true },
      {
        key: "not-woken-trying",
        label: "Not woken, trying",
        variants: LANDED,
        landed: true,
      },
      {
        key: "not-woken-stretched",
        label: "Not woken, stretched",
        variants: LANDED,
        widths: WIDE,
        landed: true,
      },
    ],
  },
  {
    heading: "Read failed · pins 4–5",
    states: [
      { key: "read-failed", label: "Can't be read", variants: READ },
      {
        key: "read-failed-details",
        label: "Can't be read, details",
        variants: READ,
      },
      {
        key: "read-failed-stretched",
        label: "Can't be read, stretched",
        variants: READ,
        widths: WIDE,
      },
    ],
  },
  {
    heading: "Can't start · pins 7–8",
    states: [
      {
        key: "cannot-start-empty",
        label: "Can't start, empty thread",
        variants: START,
      },
      {
        key: "cannot-start-thread",
        label: "Can't start, with messages",
        variants: START_THREAD,
      },
      {
        key: "cannot-start-stretched",
        label: "Can't start, stretched",
        variants: START_THREAD,
        widths: WIDE,
        counts: [8, 1],
      },
    ],
  },
  {
    heading: "Suggestions · pin 6",
    states: [
      { key: "suggestions-generating", label: "Generating", variants: TP },
      {
        key: "suggestions-generated",
        label: "Generated",
        variants: TP,
        replay: true,
      },
      { key: "suggestions-many", label: "More than four", variants: TP },
      { key: "suggestions-none", label: "None worth offering", variants: TP },
      { key: "first-thread-none", label: "First thread, none", variants: TP },
      {
        key: "suggestions-refreshed",
        label: "Refreshed",
        variants: TP,
        replay: true,
      },
      {
        key: "suggestions-stretched",
        label: "Stretched",
        variants: TP,
        widths: WIDE,
        counts: [8, 1],
      },
      {
        key: "board-suggestions",
        label: "Empty board",
        variants: [
          TODAY,
          { id: "a", label: "A · offers in Backlog" },
          { id: "b", label: "B · centred in the board" },
        ],
      },
    ],
  },
  {
    heading: "Blocking · budget, hub, off",
    states: [
      { key: "budget", label: "Budget reached", variants: TP },
      {
        key: "budget-stretched",
        label: "Budget, details open",
        variants: TP,
        widths: WIDE,
      },
      { key: "reconnecting", label: "Reconnecting", variants: TP },
      {
        key: "reconnecting-stretched",
        label: "Reconnecting, narrow",
        variants: TP,
        widths: WIDE,
      },
      { key: "off", label: "Off", variants: TP },
    ],
  },
  {
    heading: "Question · pins 9–10",
    states: [
      {
        key: "ask",
        label: "Three short choices",
        variants: LANDED,
        landed: true,
      },
      {
        key: "ask-descriptions",
        label: "Described choices",
        variants: LANDED,
        landed: true,
      },
      {
        key: "ask-long",
        label: "Long question",
        variants: LANDED,
        landed: true,
      },
      { key: "ask-many", label: "Six choices", variants: LANDED, landed: true },
      {
        key: "ask-stretched",
        label: "Stretched",
        variants: LANDED,
        widths: WIDE,
        counts: [8, 1],
        landed: true,
      },
    ],
  },
  {
    heading: "Resize · pin 11",
    states: [
      {
        key: "resizing",
        label: "Resizing",
        variants: RESIZE,
        sizes: ["380×640", "720×760"],
      },
    ],
  },
  {
    heading: "Title bar · pin 12",
    states: [
      { key: "head", label: "Title bar", variants: HEAD },
      {
        key: "head-stretched",
        label: "Title bar, long title",
        variants: HEAD,
        widths: WIDE,
      },
    ],
  },
  {
    heading: "Phone · 390",
    states: [
      ["suggestions-generated", "Suggestions", TP],
      ["suggestions-stretched", "Suggestions, stretched", TP],
      ["reply-tasks-described", "Filed tasks", TASKS],
      ["reply-tasks-stretched", "Filed tasks, stretched", TASKS],
      ["ask-descriptions", "Described choices", LANDED],
      ["ask-stretched", "Choices, stretched", LANDED],
      ["cannot-start-thread", "Can't start", START_THREAD],
      ["cannot-start-stretched", "Can't start, stretched", START_THREAD],
      ["read-failed", "Can't be read", READ],
      ["read-failed-stretched", "Can't be read, stretched", READ],
    ].map(([of, label, variants]) => ({
      key: `phone-${of as string}`,
      label: label as string,
      variants: variants as Choice[],
      phone: of as string,
    })),
  },
];

export const STATES = GROUPS.flatMap((group) => group.states);
export const KEYS = STATES.map((one) => one.key);
export const stateOf = (key: string): StateDef =>
  STATES.find((one) => one.key === key) ?? STATES[0];

/** What each proposal changes from Today, one line, said in the switcher. */
const CHANGED: Record<string, string> = {
  "reply-tasks":
    "Each task says what it holds and why Caw filed it, lands one after another, and reads as a link; no board button.",
  "not-woken":
    "Landed on main: one transcript row, a 16px clock, what happened, why, Try again. Today is the design.",
  "read-failed":
    "Caw over what happened, why, Read again, Show details with the hub's response, and Ask Caw to look.",
  "cannot-start":
    "Front and centre: Caw, Caw can't start, one short line, Check machines as the primary, details machine by machine.",
  suggestions:
    "Suggestions as rows with their reason, one width, made by the hub; a skeleton while they come.",
  "first-thread":
    "One line says when suggestions come; nothing pretends to be one.",
  "board-suggestions":
    "The empty board is the board: its real columns at their own widths, suggestions as tiles, no explainer paragraph.",
  budget:
    "Front and centre: Caw sleeping, Budget reached, Change budget; the figures only under Show details.",
  reconnecting:
    "Front and centre: Caw reconnecting, Reconnect now; the composer drawn and disabled under it.",
  off: "The hero says Caw is off, and offers suggestion rows.",
  ask: "Landed on main: described or many choices are rows, and the card is measured at its layout size. Today is the design.",
  resizing: "The panel resizes, kept per browser.",
  head: "The bar holds only its controls: New thread, Open as a tab, and which thread you're in when there's more than one, as the control that switches. No 'Caw', no status words.",
};
export const changedOf = (key: string): string => {
  const of = stateOf(key).phone ?? key;
  const [found] = Object.keys(CHANGED)
    .filter((prefix) => of.startsWith(prefix))
    .toSorted((a, b) => b.length - a.length);
  return found ? CHANGED[found] : "";
};

/** The question a state asks, with as many choices as its count says. */
export function questionOf(key: string, count: number): UserQuestion {
  const question = QUESTIONS[key];
  return key === "ask-stretched"
    ? { ...question, options: question.options.slice(0, count) }
    : question;
}

/** Where the question asks: its composer grown into it. */
const asking = (key: string, count: number): Partial<Fixture> => ({
  threads: [askThread, ship, launch],
  lead: {
    busy: false,
    pending: [askOf(questionOf(key, count))],
    blocks: [],
    streaming: "",
  },
});

/**
 * Each state's data, built when it is shown, so its ages read from now.
 * Where a proposal changes what the panel can do (the composer kept while
 * Caw can't start, the composer drawn while the hub is away), the proposal
 * reads the data that draws it, and the page draws the rest over it.
 */
export function fixtureOf(
  key: string,
  variant: string,
  count: number
): Fixture {
  const base: Fixture = { caw: caw(), tasks: filed, ...all(copy, copySaid) };
  const shipping = (tasks: TaskSummary[]): Fixture => ({
    ...base,
    tasks,
    threads: [thread(SHIP, ship.title, 2 * MIN), copy, launch],
    messages: {
      ...base.messages,
      [SHIP]: shipSaid(tasks.map((one) => one.id)),
    },
  });
  const proposedStart = variant === "b" || variant === "b-sent";
  const noMachine = caw({
    leadInstanceId: null,
    problem: "No machine is online, so Caw can't start.",
  });
  switch (key) {
    case "reply-tasks-described":
    case "resizing":
      return shipping(filed);
    case "reply-tasks-stretched":
      return shipping(stretched(count));
    case "not-woken":
      return {
        ...base,
        threads: [thread(COPY, copy.title, 3 * MIN), ship, launch],
        messages: { ...base.messages, [COPY]: notWokenSaid },
      };
    case "not-woken-trying":
      return {
        ...base,
        threads: [thread(COPY, copy.title, 3 * MIN), ship, launch],
        messages: { ...base.messages, [COPY]: notWokenSaid },
        pressAgain: variant === "today",
      };
    case "not-woken-stretched":
      return {
        ...base,
        threads: [thread(COPY, LONG_THREAD_TITLE, 2 * MIN), ship, launch],
        messages: { ...base.messages, [COPY]: notWokenStretched },
      };
    case "read-failed":
    case "read-failed-details":
      return {
        ...base,
        messages: { [SHIP]: base.messages[SHIP], [LAUNCH]: launchSaid },
        readFails: READ_PROBLEM,
      };
    case "read-failed-stretched":
      return {
        ...base,
        messages: { [SHIP]: base.messages[SHIP], [LAUNCH]: launchSaid },
        readFails: `${READ_PROBLEM} ${READ_RAW_LONG}`,
      };
    case "cannot-start-empty":
      return {
        ...base,
        newThread: true,
        caw: proposedStart ? caw({ leadInstanceId: null }) : noMachine,
      };
    case "cannot-start-thread":
    case "cannot-start-stretched": {
      const problem =
        key === "cannot-start-stretched"
          ? caw({ leadInstanceId: null, problem: LONG_PROBLEM })
          : noMachine;
      if (variant === "b-sent") {
        return {
          ...base,
          caw: caw({ leadInstanceId: null }),
          threads: [thread(COPY, copy.title, 3 * MIN), ship, launch],
          messages: { ...base.messages, [COPY]: notWokenSaid },
        };
      }
      return {
        ...base,
        caw: proposedStart ? caw({ leadInstanceId: null }) : problem,
      };
    }
    case "suggestions-generating":
    case "suggestions-generated":
    case "suggestions-many":
    case "suggestions-refreshed":
    case "suggestions-stretched":
      return { ...base, newThread: true };
    case "suggestions-none":
      return { ...base, newThread: true, stages: stagesWith([]) };
    case "first-thread-none":
      return { ...base, threads: [], messages: {}, stages: stagesWith([]) };
    case "off":
      return { ...base, newThread: true, caw: caw({ on: false }) };
    case "budget":
    case "budget-stretched":
      return {
        ...base,
        cap: {
          inherited: false,
          onCap: "pause",
          period: "day",
          reached: true,
          resetsAt: Date.now() + 4 * HOUR,
          spentUsd: 20.4,
          startsAt: Date.now() - 20 * HOUR,
          usd: 20,
        },
      };
    case "reconnecting":
    case "reconnecting-stretched":
      // Proposed draws the composer, disabled with the reason: the panel
      // only draws one over a hub it can read, so the page reads it so.
      return variant === "today" ? { ...base, away: true } : base;
    case "ask":
    case "ask-descriptions":
    case "ask-long":
    case "ask-many":
    case "ask-stretched":
      return {
        ...base,
        ...asking(key, count),
        pickFirst: variant === "today" && key === "ask-descriptions",
      };
    case "head":
      return base;
    case "head-stretched":
      return {
        ...base,
        threads: [thread(COPY, LONG_THREAD_TITLE, 10 * MIN), ship, launch],
      };
    default:
      return base;
  }
}

export { CWD, MACHINE };
