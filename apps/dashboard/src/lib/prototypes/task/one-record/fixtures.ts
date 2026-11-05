/**
 * The records the "One record" states files draw: tasks of the project
 * Cawco-Dev (70ac3d41) as the hub read them on 5 Nov 2026 (task_read with
 * `history`), their commits, attempts, comments and waits copied as the hub
 * wrote them. Each task is read at a moment of its own life (`now`), so a
 * state the board holds today stands at the time it held it: tsk-142 while
 * its first attempt ran, tsk-15 just after its attempt was stopped.
 *
 * Three things the board does not hold today are drawn on real tasks and
 * said so where they are made: a session's ask (the words of parked ask
 * 60612449, which tsk-142's report quotes), a failed attempt (tsk-15's,
 * ended in the hub's own sentence for a failure with no reason), and a hub
 * that does not answer a move (the hub's own words for a 502).
 */
import type { StageKind } from "@cawco/core/views";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import type {
  Actor,
  Check,
  Entry,
  OtherTask,
  TaskFile,
  TaskView,
  Wait,
} from "./model";

/** The project's stages (stages.md), in order. */
const STAGES: { name: string; kind: StageKind }[] = [
  { name: "ready", kind: "todo" },
  { name: "working", kind: "active" },
  { name: "review", kind: "you" },
  { name: "done", kind: "done" },
  { name: "dropped", kind: "dropped" },
];

/** When the hub was read: Thursday 5 November 2026, 08:54 UTC. */
export const READ_AT = 1_793_868_858_000;

const you: Actor = { kind: "you", name: "you" };
const hub: Actor = { kind: "hub", name: "hub" };
const caw: Actor = { kind: "caw", name: "Caw" };
const session = (name: string): Actor => ({ kind: "session", name });

const continueOpen = session("Continue CawCo open tasks");
const fleetWork = session("Orchestrate cockpit fleet work");
const afterHandover = session("Orchestrate CawCo after handover");

const noFile = (over: Partial<TaskFile> = {}): TaskFile => ({
  description: "",
  acceptance: [],
  todos: [],
  type: null,
  lands: null,
  runsOn: null,
  labels: [],
  fields: [],
  ready: { inTodo: false, settled: true, free: true },
  refused: null,
  ...over,
});

/** What a task waiting on you in review reads, in this project: Pass on to done, Send back to ready with nobody on it there. */
const WAITING_ON_YOU = {
  stage: "review",
  kind: "you",
  live: "needsYou",
  review: { passOn: "done", sendBack: "ready", sendBackBy: "nobody" },
  why: null,
  waits: [],
  unblocks: 0,
  liveSession: null,
} satisfies Partial<TaskView>;

/* ---- tsk-142: two attempts, the second handed in, waiting on you ------- */

const T142_TITLE =
  "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript";

const T142_ACCEPTANCE = [
  "`git grep -l threadBlockOf; git grep -l '\"thread.message\"'; git grep -l 'threads/:threadId/messages'; test -e apps/dashboard/src/lib/cawco/thread-blocks.ts` all find nothing; ThreadPane holds no `$state<SessionState>` and reads `cawco.session(viewId)`",
  "`sent_messages` has `thread_id`, `read_at` and nullable `instance_id`; `bun run --cwd packages/hub migrations:check` passes; after one boot on a database with thread history, every former row is a `sent_messages` row with its `thread_id`, `state='read'` and `read_at`",
  "a thread send and its wake to Caw share one uuid: the `sent_messages` row goes `pending` → `read` with `instance_id` the lead's, and the same uuid is the user message in his transcript",
  "the person's scenario, live on web and on iOS: send a message, send a second while Caw is thinking, scroll to the bottom. The second is its own row saying \"queued\" at the list's end while his turn runs, and his reply to it lands after it. The last row scrolls clear of the bottom fade at 1440 and 390",
  "a send Caw cannot take is a failed row in the thread with the hub's sentence and Try again; Try again resends under `replaces`, and the thread holds no not-woken event",
  "a Caw reply pushes once per thread and not when the thread was looked at since; `find` returns a thread send written after the cutover",
  "`bun run check`, `bun run --cwd packages/hub openapi:check`, `bun packages/hub/scripts/wire-compat.ts` and `bash apps/apple/scripts/build-both.sh ios --compile-only` pass",
];

/** Jev's second judgement, against attempt fd8fbee7's report: every criterion not shown met. */
const T142_JUDGED = [0.03, 0.04, 0.03, 0.02, 0.04, 0.09, 0.04];

const T142_CHECKS: Check[] = [
  ...[
    "In the thread, Caw's waiting ask is on the composer. Answering it sends your 3 queued messages",
    "Open and More on a review card in a thread respond while Caw is replying",
    "The tsk-142 review page reads light in dark mode",
  ].map((text): Check => ({
    source: "session",
    state: "toCheck",
    text,
    confidence: null,
  })),
  ...T142_ACCEPTANCE.map((text, i): Check => ({
    source: "acceptance",
    state: "notShown",
    text,
    confidence: T142_JUDGED[i] ?? null,
  })),
  ...[
    "bun run check",
    "bun run --cwd packages/hub openapi:check",
    "bun run --cwd packages/hub migrations:check",
  ].map((text): Check => ({
    source: "merge",
    state: "notRun",
    text,
    confidence: null,
  })),
];

const T142_REPORT = `Two commits on ws: 86fbf7f68 and 50af56da2.

**The line that left the sends pending.** apps/dashboard/src/lib/cawco/ThreadPane.svelte, on main:
\`cawco.blocked.filter((row) => row.request.threadId === threadId)\`

- At 11:30:56Z Caw's Bash (\`git cat-file …; git -C <worktree> log …\`) went to his lead gate, which raised the Approve card: \`-C\` is a risky global option, so the line isn't a read.
- That ask is parked_asks 60612449, filed under the thread its turn answered (253e9989).
- Fix: a thread shows every ask of the project's lead as well as its own, on web and iOS.
- The 3 pending sends go once the ask is answered on the composer after deploy. I left the answer to the owner.

**Other fixes**
- Plans: the stream's \`planSnapshot\` port now skips a \`thread:\` id (server.ts).
- find \`around\` a thread now merges the person's sends with the thread's rows.
- Open and More dead: virtua 0.53.x puts \`pointer-events: none\` on its container while \`isScrolling\`; the listing sets \`*:pointer-events-auto!\`.
- The review page is unreadable: the overlay \`themed()\` forced \`color-scheme: dark\` on every page artifact. A page with no dark rule now stays light.
- The review card names a handed-in artifact by its title, not its uuid.

**Proof**
- \`bun run check --all\`: "check: 31 checks passed in 22.1s (14 more unchanged since their last pass)", exit 0.

**Not run**
- iOS build: the Mac isn't reachable from here.
- No live click test of Open and More after the fix. It needs a deployed build.`;

const t142Filed: Entry[] = [
  {
    kind: "filed",
    id: "c-3398ce5",
    at: 1_793_005_769_000,
    actor: caw,
    stage: "ready",
    from: null,
  },
  {
    kind: "changed",
    id: "c-529bda3",
    at: 1_793_005_770_000,
    actor: hub,
    what: "update triage",
    reason: "Jev triaged it ready-for-agent",
  },
  {
    kind: "changed",
    id: "c-50643f3",
    at: 1_793_007_764_000,
    actor: caw,
    what: "update description, acceptance criteria",
    reason: null,
  },
  {
    kind: "comment",
    id: "c-faf061b",
    at: 1_793_007_998_000,
    actor: caw,
    text: "The trace he asked for, read from git on origin/main: intentional, from the start. c23399e8d (7 Oct) drew a thread on the transcript's own components by shaping its messages into a stand-in SessionState. Only the drawing was reused, not a send's lifecycle, so a message sent while Caw works is just the next \"you\" row. So for the build: keep the projection, and give a thread message a send record with the same lifecycle.",
    went: { to: "file" },
  },
  {
    kind: "changed",
    id: "c-bba887c",
    at: 1_793_010_071_000,
    actor: caw,
    what: "update title, description, acceptance criteria, checks, context",
    reason: null,
  },
  {
    kind: "moved",
    id: "c-7cc818f",
    at: 1_793_010_080_000,
    actor: hub,
    from: "ready",
    to: "working",
    reason: "attempt 5b80ecec started",
  },
];

const T142_FIRST_HEADLINE =
  "A Caw thread is now a session target: your thread messages are send records under the same uuid as Caw's wake. The hub serves the thread as a transcript, so web and iOS draw it with the real session rows. The iOS build hasn't run here.";

const t142Attempt1Done: Entry = {
  kind: "attempt",
  id: "w-5b80ecec",
  at: 1_793_010_080_040,
  actor: hub,
  n: 1,
  workItem: "5b80ecec",
  session: {
    id: "8d256c29",
    title: T142_TITLE,
    state: "done",
    type: null,
    lines: [],
  },
  endedAt: 1_793_014_671_631,
  todos: { done: 0, total: 0, offered: 10 },
  entries: [
    {
      kind: "handed",
      id: "r-5b80ecec",
      at: 1_793_014_671_631,
      actor: session(T142_TITLE),
      result: {
        headline: T142_FIRST_HEADLINE,
        presented: { name: "caw-thread-target", kind: "page" },
        report: "",
        commits: [{ sha: "10b106808", subject: "" }],
        checks: [],
        file: null,
      },
    },
    {
      kind: "comment",
      id: "c-447de0b",
      at: 1_793_014_672_844,
      actor: hub,
      text: "Jev judged the acceptance criteria against the report of its attempt. Not shown met: 6 of 7.",
      went: null,
    },
    {
      kind: "moved",
      id: "c-8273bb4",
      at: 1_793_014_672_000,
      actor: hub,
      from: "working",
      to: "review",
      reason: "attempt 5b80ecec done; its acceptance criteria wait for you",
    },
  ],
};

const t142SentBack: Entry[] = [
  {
    kind: "comment",
    id: "c-96dbf96",
    at: 1_793_028_165_000,
    actor: you,
    text: "too many words, did this get implemented according to our discussion? i am unable to grok the evidence, and the mockup here is useless and too obvious and didn't need to be said, in all this brief i don't know what got done and what the details and implementation is, just walls of t ext",
    went: { to: "file" },
  },
  {
    kind: "moved",
    id: "c-c053fce",
    at: 1_793_028_165_000,
    actor: you,
    from: "review",
    to: "working",
    reason: null,
  },
];

const T142_HEADLINE =
  "Caw's thread queue was stuck behind an ask filed in another thread. His asks now show in every thread of his, and the review card's dead buttons, the unreadable review page and the plans lookup are fixed. The full check passes.";

const t142Attempt2: Entry = {
  kind: "attempt",
  id: "w-fd8fbee7",
  at: 1_793_028_174_040,
  actor: hub,
  n: 2,
  workItem: "fd8fbee7",
  session: {
    id: "504317bd",
    title: T142_TITLE,
    state: "done",
    type: null,
    lines: [
      {
        who: "you",
        at: 1_793_028_174_040,
        text: "too many words, did this get implemented according to our discussion?",
      },
      {
        who: "tool",
        at: 1_793_028_420_000,
        text: "Read apps/dashboard/src/lib/cawco/ThreadPane.svelte",
      },
      {
        who: "session",
        at: 1_793_029_310_000,
        text: "The sends sat pending because Caw's turn was waiting on an ask filed under a different thread, and this thread only shows its own asks.",
      },
      {
        who: "tool",
        at: 1_793_030_380_000,
        text: "bun run check --all · 31 checks passed in 22.1s",
      },
      {
        who: "session",
        at: 1_793_030_687_835,
        text: T142_HEADLINE,
      },
    ],
  },
  endedAt: 1_793_030_687_835,
  todos: { done: 0, total: 0, offered: 2 },
  entries: [
    {
      kind: "handed",
      id: "r-fd8fbee7",
      at: 1_793_030_687_835,
      actor: session(T142_TITLE),
      result: {
        headline: T142_HEADLINE,
        presented: { name: "caw-thread-stuck-fixes", kind: "page" },
        report: T142_REPORT,
        commits: [
          { sha: "86fbf7f68", subject: "" },
          { sha: "50af56da2", subject: "" },
        ],
        checks: T142_CHECKS,
        file: null,
      },
    },
    {
      kind: "comment",
      id: "c-4878e89",
      at: 1_793_030_689_232,
      actor: hub,
      text: "Jev judged the acceptance criteria against the report of its attempt. Not shown met: all 7.",
      went: null,
    },
    {
      kind: "moved",
      id: "c-ba8e558",
      at: 1_793_030_691_000,
      actor: hub,
      from: "working",
      to: "review",
      reason: "attempt fd8fbee7 done; its acceptance criteria wait for you",
    },
  ],
};

const t142After: Entry[] = [
  {
    kind: "comment",
    id: "c-4b53d91",
    at: 1_793_032_194_000,
    actor: afterHandover,
    text: 'Yes, it was built the way we discussed. A message you send in a Caw thread works like a message to any session: while Caw is working it gets its own row marked "queued", moves to read when Caw takes it, and Caw\'s reply comes after it. Live since nightly 5947, today at 16:26 UTC. Not checked yet: tapping Open and More on the review card in the live dashboard, and the iPhone app.',
    went: { to: "file" },
  },
  {
    kind: "changed",
    id: "c-ff7e42d",
    at: 1_793_526_670_000,
    actor: hub,
    what: "comments written by Continue CawCo open tasks put back",
    reason: "comments are added only as task comments",
  },
];

const T142_FILE = noFile({
  description:
    "A Caw thread is addressed as a session: `thread:<id>` is the address a send goes to, a transcript page is read at and a stream is followed under. One table for the person's words; the hub builds the thread's page; the dashboard and the app show a thread through the real session state. Nothing stays behind a fallback.",
  acceptance: T142_ACCEPTANCE,
  todos: [
    "Core types: SendRecord threadId/readAt/nullable instanceId",
    "Hub schema + drizzle 0326 + data migration of you rows",
    "Hub thread-transcript.ts page builder + stream events",
    "Hub deliverSend thread target, caw.ts sent()",
    "Push threadReply + find threadWords union",
    "Dashboard: ThreadPane on cawco.session(viewId)",
    "Fade: FootFade publishes --fade-foot",
    "iOS: Threads.swift / ThreadViewController on sessions store",
    "Checks: bun run check, openapi:check, migrations:check, wire-compat",
    "Artifact, task_result, commit, finish_item",
  ].map((text, i) => ({
    id: `td-${i + 1}`,
    text,
    done: false,
    offered: true,
  })),
  labels: ["caw", "threads", "bug", "owner-ask"],
  ready: { inTodo: false, settled: true, free: true },
});

/** tsk-142 waiting on you: its second attempt handed in; the first folded to one line. */
export const t142Review: TaskView = {
  id: "tsk-142",
  title: T142_TITLE,
  ...WAITING_ON_YOU,
  entries: [
    ...t142Filed,
    t142Attempt1Done,
    ...t142SentBack,
    t142Attempt2,
    ...t142After,
  ],
  opensAt: "r-fd8fbee7",
  file: T142_FILE,
  stages: STAGES,
};

/* ---- tsk-142 while its first attempt ran ------------------------------ */

/** 27 Oct, 15:10 UTC: attempt 5b80ecec 50 minutes in. */
export const T142_RUNNING_AT = 1_793_013_000_000;

const t142Running: Entry = {
  ...t142Attempt1Done,
  session: {
    id: "8d256c29",
    title: T142_TITLE,
    state: "working",
    type: null,
    lines: [
      {
        who: "session",
        at: 1_793_010_200_000,
        text: "Reading assets/10d0b2d5/tsk-142-advice.md whole first; it is the spec.",
      },
      {
        who: "tool",
        at: 1_793_011_400_000,
        text: "Edit packages/hub/src/thread-transcript.ts",
      },
      {
        who: "tool",
        at: 1_793_012_700_000,
        text: "Bash bun run --cwd packages/hub migrations:check",
      },
    ],
  },
  endedAt: null,
  entries: [],
};

/** tsk-142 at work: its first attempt's session working, its to-dos only offered. */
export const t142Working: TaskView = {
  ...t142Review,
  stage: "working",
  kind: "active",
  live: "working",
  review: null,
  liveSession: T142_TITLE,
  entries: [...t142Filed, t142Running],
  opensAt: "w-5b80ecec",
};

/**
 * The ask its session raises, in parked ask 60612449's words (tsk-142's
 * report: "Caw's Bash (`git cat-file …; git -C <worktree> log …`) went to
 * his lead gate, which raised the Approve card"), drawn on this attempt.
 */
const t142Ask: Entry = {
  kind: "ask",
  id: "a-60612449",
  at: T142_RUNNING_AT - 2 * 60_000,
  actor: session(T142_TITLE),
  words: "Run Bash: -C is a risky global option, so this line isn't a read.",
  detail:
    "git cat-file -p HEAD; git -C /home/bewinxed/cockpit log --oneline -5",
  answer: null,
  notCarried: null,
};

/** tsk-142 with its session asking: the ask entry waits for your answer. */
export const t142Asking: TaskView = {
  ...t142Working,
  live: "asking",
  entries: [
    ...t142Filed,
    {
      ...t142Running,
      session: { ...t142Running.session, state: "asking" },
      entries: [t142Ask],
    },
  ],
  opensAt: "a-60612449",
};

/** The ask answered: Approve by you, and the session working again. */
export const t142Answered: TaskView = {
  ...t142Working,
  entries: [
    ...t142Filed,
    {
      ...t142Running,
      entries: [
        {
          ...t142Ask,
          answer: { answer: "approved", by: "you", at: T142_RUNNING_AT },
        },
      ],
    },
  ],
  opensAt: "a-60612449",
};

/** The ask answered, and the hub could not carry the answer. */
export const t142AnswerNotCarried: TaskView = {
  ...t142Asking,
  entries: [
    ...t142Filed,
    {
      ...t142Running,
      session: { ...t142Running.session, state: "asking" },
      entries: [
        {
          ...t142Ask,
          notCarried: `${hubFailureWords.noAnswer(502)}. The session still waits on it; answer again once the hub answers.`,
        },
      ],
    },
  ],
};

/* ---- tsk-218: one attempt, handed in, waiting on you ------------------ */

const T218_TITLE = "Let start_session choose a harness";

const T218_REPORT = `Deliverable: commit 96be89d53 "start_session takes a harness, resolved as delegate's".

- packages/hub/src/delegation-tools.ts: start_session's shape gains \`harness: z.enum(HARNESSES).optional()\` ("Overrides the type's. Without a type, a harness other than the 'medium' type's needs a model."). It is passed to actions.startSession.
- packages/hub/src/delegation-actions.ts: the startSession options gain \`harness?: HarnessKind\`, which goes to \`resolveSpawnType(types, {type, harness, model})\`. This is the same resolver delegate uses, so there is no second rule. A harness with no type must come with a model, unless it is the 'medium' type's own harness; otherwise it is refused with "Name a type, or a model for pi."
- tsk-207's pi check: a start_session session has no workItemId, so it is offered no_reply_needed. The check can now be started with start_session({harness:"pi", model:<pi model>, cwd, prompt, title}). I did not run it live: that is tsk-207's work.

Proof:
- \`bun install\` → "1350 packages installed"
- \`bun run check --base origin/main\` → exit 0. Last line: "check: 60 checks passed in 27.5s".
- The repo has no unit test files, so there is no spec to extend.`;

const T218_HEADLINE =
  "start_session now takes the same harness choice as delegate (Claude Code, OpenCode or pi), resolved by the same rule. The repo checks pass.";

const t218FiledEntries: Entry[] = [
  {
    kind: "filed",
    id: "c-04719a4",
    at: 1_793_668_785_000,
    actor: continueOpen,
    stage: "ready",
    from: null,
  },
  {
    kind: "changed",
    id: "c-ea30b0f",
    at: 1_793_668_785_000,
    actor: hub,
    what: "update triage",
    reason: "Jev triaged it ready-for-agent",
  },
];

const t218Run: Entry[] = [
  {
    kind: "changed",
    id: "c-95d5015",
    at: 1_793_681_799_000,
    actor: continueOpen,
    what: "update type",
    reason: null,
  },
  {
    kind: "moved",
    id: "c-1479060",
    at: 1_793_681_825_000,
    actor: hub,
    from: "ready",
    to: "working",
    reason: "attempt 67533cef started",
  },
  {
    kind: "attempt",
    id: "w-67533cef",
    at: 1_793_681_825_482,
    actor: hub,
    n: 1,
    workItem: "67533cef",
    session: {
      id: "7f87d8f5",
      title: T218_TITLE,
      state: "done",
      type: "medium",
      lines: [
        {
          who: "tool",
          at: 1_793_681_900_000,
          text: "Edit packages/hub/src/delegation-tools.ts",
        },
        {
          who: "tool",
          at: 1_793_681_990_000,
          text: "bun run check --base origin/main · 60 checks passed in 27.5s",
        },
        { who: "session", at: 1_793_682_042_413, text: T218_HEADLINE },
      ],
    },
    endedAt: 1_793_682_042_413,
    todos: null,
    entries: [
      {
        kind: "handed",
        id: "r-67533cef",
        at: 1_793_682_042_413,
        actor: session(T218_TITLE),
        result: {
          headline: T218_HEADLINE,
          presented: { name: "start-session-harness", kind: "page" },
          report: T218_REPORT,
          commits: [
            {
              sha: "96be89d53",
              subject: "start_session takes a harness, resolved as delegate's",
            },
          ],
          checks: [
            {
              source: "session",
              state: "toCheck",
              text: "delegation-tools.ts: start_session has a new `harness` parameter (enum HARNESSES) that is passed through to actions.startSession",
              confidence: null,
            },
            {
              source: "session",
              state: "toCheck",
              text: "delegation-actions.ts startSession: harness goes to resolveSpawnType, the same call delegate's settingsOf makes",
              confidence: null,
            },
            {
              source: "session",
              state: "passed",
              text: "bun run check --base origin/main: 60 checks passed",
              confidence: null,
            },
            {
              source: "acceptance",
              state: "passed",
              text: "start_session can start a session on Claude Code, OpenCode or pi",
              confidence: null,
            },
            {
              source: "acceptance",
              state: "notShown",
              text: "tsk-207's pi check can be run from it",
              confidence: 0.53,
            },
          ],
          file: null,
        },
      },
      {
        kind: "comment",
        id: "c-958309d",
        at: 1_793_682_044_614,
        actor: hub,
        text: "Jev judged the acceptance criteria against the report of its attempt. Not shown met: tsk-207's pi check can be run from it (0.53)",
        went: null,
      },
    ],
  },
  {
    kind: "moved",
    id: "c-b6859b0",
    at: 1_793_682_044_000,
    actor: hub,
    from: "working",
    to: "review",
    reason: "attempt 67533cef done; its acceptance criteria wait for you",
  },
];

const T218_FILE = noFile({
  description:
    "start_session takes a `type` but no `harness`, so a live check on pi (or OpenCode) can't be started from it. delegate takes `harness`, but a delegate isn't offered no_reply_needed, which is what tsk-207's pi check needs. Give start_session the same `harness` choice delegate has, resolved the same way.",
  acceptance: [
    "start_session can start a session on Claude Code, OpenCode or pi",
    "tsk-207's pi check can be run from it",
  ],
  type: "medium",
  labels: ["bug", "fleet"],
  fields: [{ name: "triage", value: "ready-for-agent" }],
});

/** tsk-218 waiting on you: one attempt handed in. */
export const t218Review: TaskView = {
  id: "tsk-218",
  title: T218_TITLE,
  ...WAITING_ON_YOU,
  entries: [...t218FiledEntries, ...t218Run],
  opensAt: "r-67533cef",
  file: T218_FILE,
  stages: STAGES,
};

/** Pass on pressed: the hub took the move; the record shows it, and the task is landing. */
export const t218Passed: TaskView = {
  ...t218Review,
  stage: "done",
  kind: "done",
  live: "landing",
  review: null,
  entries: [
    ...t218Review.entries,
    {
      kind: "moved",
      id: "c-passed",
      at: READ_AT,
      actor: you,
      from: "review",
      to: "done",
      reason: null,
    },
  ],
  opensAt: "c-passed",
};

/** Pass on pressed and the hub didn't answer: the refusal stands under the entry that asked. */
export const t218Refused: TaskView = {
  ...t218Review,
  entries: [
    ...t218Review.entries,
    {
      kind: "refused",
      id: "c-refused",
      at: READ_AT,
      actor: hub,
      words: `${hubFailureWords.noAnswer(502)}. The task stays in review. Pass it on again once the hub answers.`,
    },
  ],
  opensAt: "c-refused",
};

/** Send back pressed: it goes back to ready with your note, nobody on it until someone starts it. */
export const t218SentBack: TaskView = {
  ...t218Review,
  stage: "ready",
  kind: "todo",
  live: "ready",
  review: null,
  why: null,
  entries: [
    ...t218Review.entries,
    {
      kind: "comment",
      id: "c-note",
      at: READ_AT,
      actor: you,
      text: "Run tsk-207's pi check from start_session before handing in: the acceptance asks for it to be shown, not argued.",
      went: { to: "file" },
    },
    {
      kind: "moved",
      id: "c-sentback",
      at: READ_AT,
      actor: you,
      from: "review",
      to: "ready",
      reason: null,
    },
  ],
  opensAt: "c-sentback",
  file: { ...T218_FILE, ready: { inTodo: true, settled: true, free: true } },
};

/** tsk-218 as filed, before dispatch picked it up: one entry and its triage. */
export const T218_FILED_AT = 1_793_669_000_000;

export const t218Filed: TaskView = {
  ...t218Review,
  stage: "ready",
  kind: "todo",
  live: "ready",
  review: null,
  why: "waitsForDispatch",
  entries: t218FiledEntries,
  opensAt: "c-ea30b0f",
  file: {
    ...T218_FILE,
    ready: { inTodo: true, settled: true, free: true },
  },
};

/** The brief saved: one more entry, by you, in the commit's words. */
export const t218BriefChanged: TaskView = {
  ...t218Filed,
  entries: [
    ...t218Filed.entries,
    {
      kind: "changed",
      id: "c-brief",
      at: T218_FILED_AT + 5 * 60_000,
      actor: you,
      what: "update acceptance criteria",
      reason: null,
    },
  ],
  opensAt: "c-brief",
  file: {
    ...t218Filed.file,
    acceptance: [
      ...T218_FILE.acceptance,
      "tsk-207's pi check is started with start_session and its transcript is linked here",
    ],
  },
};

/** The brief's save refused, the refusal beside the field. */
export const t218BriefRefused: TaskView = {
  ...t218Filed,
  file: {
    ...t218Filed.file,
    refused: `${hubFailureWords.noAnswer(502)}. Your words are still in the field. Save again once the hub answers.`,
  },
};

/* ---- tsk-226: waits on two decisions and a task ---------------------- */

const T226_WAITS: Wait[] = [
  {
    kind: "card",
    label: "What names the artifact at the head of its panel?",
    state: "open",
    settled: false,
    flag: null,
    value: null,
    via: null,
    task: null,
  },
  {
    kind: "card",
    label:
      "On a phone, does the Comments sheet's Close share a group with Search, Sort and Comment on the whole page?",
    state: "open",
    settled: false,
    flag: null,
    value: null,
    via: null,
    task: null,
  },
  {
    kind: "task",
    label:
      "Replace the component canvas's grid of frames with the design graph",
    state: "ready",
    settled: false,
    flag: null,
    value: null,
    via: null,
    task: "tsk-18",
  },
];

/** tsk-226: in ready, held by three waits, none settled. */
export const t226Blocked: TaskView = {
  id: "tsk-226",
  title: "Land the Liquid Glass title bars after his two picks",
  stage: "ready",
  kind: "todo",
  live: "blocked",
  review: null,
  why: null,
  waits: T226_WAITS,
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-0a5c1de",
      at: 1_793_770_841_000,
      actor: continueOpen,
      stage: "ready",
      from: null,
    },
    {
      kind: "changed",
      id: "c-92387df",
      at: 1_793_770_842_000,
      actor: hub,
      what: "update triage",
      reason: "Jev triaged it ready-for-agent",
    },
    {
      kind: "comment",
      id: "c-4b848b7",
      at: 1_793_772_771_000,
      actor: continueOpen,
      text: "The DESIGN.md cut landed on main at 854292fb9 with his approval. Three commits on these branches edit DESIGN.md and will conflict on rebase: cawco/842df988 b1c6f47b5; cawco/f2b16f38 16329e130 and a85a2e568. The landing brief must keep main's DESIGN.md and move what each of those commits decided into the screen's surface brief.",
      went: { to: "file" },
    },
    {
      kind: "comment",
      id: "c-8d019f9",
      at: 1_793_803_341_000,
      actor: continueOpen,
      text: "Rendered checks found four defects in the side card's head (lib/cawco/side/SideSurface.svelte). This task's title-bar cutover owns them, so they're left for it. Check each once this task's branches rebase.",
      went: { to: "file" },
    },
  ],
  opensAt: "c-8d019f9",
  file: noFile({
    description:
      "Every bar heading a surface is cut over to DESIGN.md's Title Bars Follow Liquid Glass Rule, checked against Apple's HIG for its kind. The work is on branches cawco/842df988 and cawco/f2b16f38 on top of it. Still open on the decision page title-bars-close: whether the phone Comments sheet's Close gets its own group, and what names the artifact at the head of its panel.",
    acceptance: [
      "His two remaining picks are applied",
      "The edited probes and the sidebar contrast read pass",
      "Both branches land on main after the design graph, and ship in a nightly",
    ],
    labels: ["design", "owner-ask", "title-bars"],
    fields: [{ name: "triage", value: "ready-for-agent" }],
    ready: { inTodo: true, settled: false, free: true },
  }),
  stages: STAGES,
};

/** The task a wait opens in its place: tsk-18, as the hub reads it. */
export const t18: OtherTask = {
  id: "tsk-18",
  title: "Replace the component canvas's grid of frames with the design graph",
  stage: "ready",
  kind: "todo",
  description:
    "The component canvas's grid of frames is replaced by the design graph: the surface where the owner judges what an agent built (a real component or screen in each of its states, the moves between them and their timing) and leaves remarks the agent reads back.",
  missing: false,
};

/** A wait's task that is not in the project any more. */
export const t18Missing: OtherTask = { ...t18, missing: true };

/* ---- tsk-15: its attempt stopped, or failed -------------------------- */

/** 13 Oct, 08:13 UTC: a minute after attempt 1b2685e5 was stopped. */
export const T15_STOPPED_AT = 1_792_053_850_000;

const t15Base = (how: "failed" | "stopped"): TaskView => ({
  id: "tsk-15",
  title: "Let Maestro and XCUITest run inside a Mac workspace",
  stage: "working",
  kind: "active",
  live: how,
  review: null,
  why: null,
  waits: [],
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-15-made",
      at: 1_791_952_829_000,
      actor: fleetWork,
      stage: "ready",
      from: null,
    },
    {
      kind: "moved",
      id: "c-15-start",
      at: 1_792_053_550_000,
      actor: hub,
      from: "ready",
      to: "working",
      reason: "attempt 1b2685e5 started",
    },
    {
      kind: "attempt",
      id: "w-1b2685e5",
      at: 1_792_053_550_935,
      actor: hub,
      n: 1,
      workItem: "1b2685e5",
      session: {
        id: "a13d15ae",
        title: "Let Maestro and XCUITest run inside a Mac workspace",
        state: how,
        type: null,
        lines: [],
      },
      endedAt: 1_792_053_789_871,
      todos: null,
      entries: [
        {
          kind: "ended",
          id: "e-1b2685e5",
          at: 1_792_053_789_871,
          actor: hub,
          how,
          words:
            how === "stopped"
              ? "Stopped by Orchestrate cockpit fleet work"
              : "It failed without a reason.",
          reportedTo: "Orchestrate cockpit fleet work",
        },
      ],
    },
  ],
  opensAt: "e-1b2685e5",
  file: noFile({
    labels: ["infra", "ios"],
    ready: { inTodo: false, settled: true, free: true },
  }),
  stages: STAGES,
});

/** tsk-15: its attempt was stopped by the session that started it. */
export const t15Stopped = t15Base("stopped");
/** tsk-15 with its attempt failed, in the hub's sentence for a failure with no reason. */
export const t15Failed = t15Base("failed");

/** Retry pressed: a fresh attempt in the same workspace, carrying the last failure. */
export const t15Retried: TaskView = {
  ...t15Failed,
  live: "working",
  liveSession: "Let Maestro and XCUITest run inside a Mac workspace",
  entries: [
    ...t15Failed.entries,
    {
      kind: "attempt",
      id: "w-retry",
      at: T15_STOPPED_AT,
      actor: you,
      n: 2,
      workItem: "c41e0a72",
      session: {
        id: "a13d15ae",
        title: "Let Maestro and XCUITest run inside a Mac workspace",
        state: "working",
        type: null,
        lines: [],
      },
      endedAt: null,
      todos: null,
      entries: [],
    },
  ],
  opensAt: "w-retry",
};

/* ---- tsk-112: dropped as a duplicate ------------------------------- */

/** tsk-112: dropped as folded into tsk-27; Reopen puts it back in ready. */
export const t112Dropped: TaskView = {
  id: "tsk-112",
  title: "Pick the project page's head (decision page ready)",
  stage: "dropped",
  kind: "dropped",
  live: "dropped",
  review: null,
  why: null,
  waits: [
    {
      kind: "task",
      label: "Settle one error-state and one placement rule for every surface",
      state: "ready",
      settled: false,
      flag: null,
      value: null,
      via: "tsk-27",
      task: "tsk-82",
    },
  ],
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-dc126b0",
      at: 1_792_951_143_000,
      actor: fleetWork,
      stage: "ready",
      from: null,
    },
    {
      kind: "comment",
      id: "c-62beeea",
      at: 1_792_954_600_000,
      actor: session("Retro on orchestrator complaints"),
      text: "Folded into Finish the project page: a Caw-guided start, his pins answered, and the head picked during the backlog consolidation. tsk-27 lists project-head (37c15ce6) as its open pick; this task is that pick's page.",
      went: { to: "file" },
    },
    {
      kind: "changed",
      id: "c-8271b55",
      at: 1_792_987_221_000,
      actor: session("Retro on orchestrator complaints"),
      what: "parent tsk-27",
      reason: null,
    },
    {
      kind: "changed",
      id: "c-9c99eb0",
      at: 1_793_006_562_000,
      actor: hub,
      what: "links: 26 after → waits_on, 14 parent → part_of, 53 related → See also",
      reason:
        "task links are one blocking edge: after is waits_on, parent is part_of, related is a See also comment",
    },
    {
      kind: "dropped",
      id: "c-ef7649a",
      at: 1_793_032_188_000,
      actor: afterHandover,
      reason: "duplicate of tsk-27",
      reopenInto: "ready",
    },
  ],
  opensAt: "c-ef7649a",
  file: noFile({
    description:
      "Folded into tsk-27 during the 10-25 backlog consolidation. Its ask, acceptance and open items are carried there; work on that task.",
    acceptance: ["Dropped by the owner as folded into tsk-27."],
    labels: ["projects", "waiting-on-pick", "owner-ask", "decision"],
    fields: [
      { name: "priority", value: "high" },
      { name: "triage", value: "ready-for-human" },
    ],
  }),
  stages: STAGES,
};

/* ---- tsk-233: done, landed on main ---------------------------------- */

// golar-ignore-next-line house/no-raw-motion -- a session's report as the hub holds it: "12.5s" is a check run's time, never motion
const T233_REPORT = `Work for Give the tooltip's 2px rise a token, commit 10c3d0842.

- **New token:** \`tip-rise\` (dimension, 2px) is in design/tokens/cawco.tokens.json, next to \`pop-rise\`.
- **Rebuilt tokens:** \`bun run tokens\` gave "tokens: 229 outputs written".
- **Tooltip:** tooltip-content.svelte sets \`--kit-tip-from\` from \`var(--tip-rise)\`.

Proof: \`bun run check --all\` ended with "check: 28 checks passed in 12.5s".`;

const T233_HEADLINE =
  "The tooltip's 2px rise now comes from a new --tip-rise token, and the tooltip looks and moves exactly as before. The full check passes.";

/** tsk-233: handed in, judged met by Jev and landed on main as 54760d9cb. */
export const t233Landed: TaskView = {
  id: "tsk-233",
  title: "Give the tooltip's 2px rise a token",
  stage: "done",
  kind: "done",
  live: "landed",
  review: null,
  why: null,
  waits: [],
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-0f23a24",
      at: 1_793_772_598_000,
      actor: session("Retro: fix piecemeal design runs"),
      stage: "ready",
      from: null,
    },
    {
      kind: "moved",
      id: "c-0d835a7",
      at: 1_793_773_125_000,
      actor: hub,
      from: "ready",
      to: "working",
      reason: "attempt ca1fc588 started",
    },
    {
      kind: "attempt",
      id: "w-ca1fc588",
      at: 1_793_773_125_486,
      actor: hub,
      n: 1,
      workItem: "ca1fc588",
      session: {
        id: "2950c95a",
        title: "Give the tooltip's 2px rise a token",
        state: "done",
        type: "low",
        lines: [],
      },
      endedAt: 1_793_773_336_545,
      todos: null,
      entries: [
        {
          kind: "handed",
          id: "r-ca1fc588",
          at: 1_793_773_336_545,
          actor: session("Give the tooltip's 2px rise a token"),
          result: {
            headline: T233_HEADLINE,
            presented: { name: "tip-rise-token", kind: "page" },
            report: T233_REPORT,
            commits: [{ sha: "10c3d0842", subject: "" }],
            checks: [
              {
                source: "acceptance",
                state: "passed",
                text: "`tooltip-content.svelte` holds no raw length for its motion",
                confidence: null,
              },
              {
                source: "acceptance",
                state: "passed",
                text: "`bun run check --all` passes",
                confidence: null,
              },
            ],
            file: null,
          },
        },
      ],
    },
    {
      kind: "moved",
      id: "c-cfacda0",
      at: 1_793_773_337_000,
      actor: hub,
      from: "working",
      to: "done",
      reason:
        "attempt ca1fc588 done; Jev shows its 2 acceptance criteria met; landed 54760d9cb",
    },
    {
      kind: "landed",
      id: "l-54760d9",
      at: 1_793_773_337_000,
      actor: hub,
      commit: "54760d9cb",
      where: "main",
    },
  ],
  opensAt: "l-54760d9",
  file: noFile({ labels: ["design-tokens"], lands: "main", type: "low" }),
  stages: STAGES,
};

/* ---- tsk-135: a result known only by a comment ------------------------ */

/** tsk-135: in working with no attempt; a session's comment names the commit that landed its work. */
export const t135Partial: TaskView = {
  id: "tsk-135",
  title: "Relaunch at boot only what was working",
  stage: "working",
  kind: "active",
  live: "idle",
  review: null,
  why: null,
  waits: [],
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-b7ed413",
      at: 1_792_954_721_000,
      actor: session("Fix agent main-thread search hang"),
      stage: "review",
      from: null,
    },
    {
      kind: "comment",
      id: "c-2755c94",
      at: 1_793_002_710_000,
      actor: you,
      text: "sounds like the opened older sessions is only due to a one-off event, as these sessions weren't stopped",
      went: { to: "file" },
    },
    {
      kind: "moved",
      id: "c-989b38a",
      at: 1_793_002_710_000,
      actor: you,
      from: "review",
      to: "working",
      reason: null,
    },
    {
      kind: "comment",
      id: "c-49e2d7c",
      at: 1_793_032_916_000,
      actor: session("Fix agent main-thread search hang"),
      text: 'The owner\'s pick on overnight-calls: "Not after a day". Built and landed as 903dc22e9. A hold is stale when now - (reset ?? since) > staleAfterHours; the default is 24 h. A stale hold gets no send, wake or move.',
      names: { commit: "903dc22e9" },
      went: { to: "file" },
    },
    {
      kind: "comment",
      id: "c-c62482c",
      at: 1_793_033_614_000,
      actor: session("Fix agent main-thread search hang"),
      text: "Shipped: obelisk runs 0.1.12-nightly.5958 (903dc22e9).",
      went: { to: "file" },
    },
  ],
  opensAt: "c-49e2d7c",
  file: noFile({ labels: ["owner-ask", "bug", "needs-discussion"] }),
  stages: STAGES,
};

/* ---- tsk-239: the longest title on the board, done today ------------- */

const T239_TITLE =
  "the list of slash commands that are available in the composer before a session is started, vs after it started, is different, why are there multiple paths for this?";

const T239_HEADLINE =
  "The composer's slash-command menu now comes from one source, the harness in the folder, before and after a session starts. A probe on a real Claude Code fleet shows the same 153 commands both ways, and the full check passes.";

/** tsk-239: filed by you in your own words, done and landed this morning. */
export const t239LongTitle: TaskView = {
  id: "tsk-239",
  title: T239_TITLE,
  stage: "done",
  kind: "done",
  live: "landed",
  review: null,
  why: null,
  waits: [],
  unblocks: 0,
  liveSession: null,
  entries: [
    {
      kind: "filed",
      id: "c-982eac7",
      at: 1_793_865_204_000,
      actor: you,
      stage: "ready",
      from: null,
    },
    {
      kind: "changed",
      id: "c-746b70e",
      at: 1_793_865_206_000,
      actor: hub,
      what: "update triage",
      reason: "Jev triaged it needs-info",
    },
    {
      kind: "moved",
      id: "c-1fa2b9b",
      at: 1_793_865_502_000,
      actor: hub,
      from: "ready",
      to: "working",
      reason: "attempt 4d161358 started",
    },
    {
      kind: "attempt",
      id: "w-4d161358",
      at: 1_793_865_501_823,
      actor: hub,
      n: 1,
      workItem: "4d161358",
      session: {
        id: "9a4d141d",
        title: T239_TITLE,
        state: "done",
        type: null,
        lines: [],
      },
      endedAt: 1_793_868_348_995,
      todos: null,
      entries: [
        {
          kind: "handed",
          id: "r-4d161358",
          at: 1_793_868_348_995,
          actor: session(T239_TITLE),
          result: {
            headline: T239_HEADLINE,
            presented: { name: "tsk-239-slash-commands", kind: "page" },
            report: "",
            commits: [{ sha: "fb76b154e", subject: "" }],
            checks: [],
            file: null,
          },
        },
      ],
    },
    {
      kind: "moved",
      id: "c-c1dae72",
      at: 1_793_868_379_000,
      actor: hub,
      from: "working",
      to: "done",
      reason: "attempt 4d161358 done; landed 5e2518cb3",
    },
    {
      kind: "landed",
      id: "l-5e2518c",
      at: 1_793_868_379_000,
      actor: hub,
      commit: "5e2518cb3",
      where: "main",
    },
  ],
  opensAt: "l-5e2518c",
  file: noFile({ fields: [{ name: "triage", value: "needs-info" }] }),
  stages: STAGES,
};

/** Say something sent on tsk-218 as filed: no session yet, so the words wait in the file. */
export const t218Commented: TaskView = {
  ...t218Filed,
  entries: [
    ...t218Filed.entries,
    {
      kind: "comment",
      id: "c-said",
      at: T218_FILED_AT + 3 * 60_000,
      actor: { kind: "you", name: "you" },
      text: "Resolve the harness the same way delegate does; no second rule.",
      went: { to: "file" },
    },
  ],
  opensAt: "c-said",
};
