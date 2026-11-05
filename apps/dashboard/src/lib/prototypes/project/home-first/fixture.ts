/**
 * The project the prototype draws: Cawco, the hub's X and marketing project
 * (4d2f1968), with its own stages, tasks, routines and sessions as the hub
 * held them on 2026-11-05 (find, routine_list). The states each record is in
 * are set so one read shows every kind of wait, a stuck task, a failed
 * routine and recent outputs (BUSY); the same project on a quiet morning
 * with nothing waiting (QUIET); and a project just made (FRESH). Times are
 * on the person's clock, Asia/Qatar, Thursday 5 November, 12:20.
 */
import type {
  Action,
  Briefing,
  Decision,
  Need,
  Output,
  Routine,
  Session,
  Stage,
  Task,
  Upcoming,
  Work,
} from "./model";

export const PROJECT = "Cawco";
export const STALE_AT = "10:42";

const stage = (
  id: string,
  name: string,
  kind: Stage["kind"],
  count: number
): Stage => ({ id, name, kind, count });

/** Its nine stages, as "let's setup this project again" set them. */
export const STAGES: Stage[] = [
  stage("ideas", "Ideas", "todo", 4),
  stage("drafting", "Drafting", "active", 2),
  stage("making-media", "Making media", "active", 1),
  stage("building", "Building", "active", 0),
  stage("your-call", "Your call", "you", 2),
  stage("scheduled", "Scheduled", "waiting", 1),
  stage("live", "Live", "done", 1),
  stage("measured", "Measured", "done", 0),
  stage("dropped", "Dropped", "dropped", 0),
];

const POST_TEXT =
  "Six terminals, three machines, one question: does anything need me? Caw&Co puts every agent on one board, and the board answers.";

export const NEEDS: Need[] = [
  {
    id: "n-action",
    kind: "action",
    title: "Post: Claude Code hands work to OpenCode on another machine",
    asks: "Post to X at 15:00 as @CawCoDev",
    code: 'x-use.post_tweet({ account: "@CawCoDev", at: "15:00 Asia/Qatar", text: "Claude Code started it on obelisk. OpenCode finished it on the Mac mini. One task, two harnesses, one board." })',
    from: "Daily post from what shipped",
    waited: "3 h",
  },
  {
    id: "n-picks",
    kind: "picks",
    title: "Who counts as an early user",
    asks: "2 of 4 picked. Find 20 early-user candidates waits on it.",
    picked: 2,
    total: 4,
    question: 3,
    waited: "2 h 40 min",
  },
  {
    id: "n-ask",
    kind: "ask",
    title: "Make the Caw bookend kit for clips",
    asks: "Wants to run a command in its workspace",
    code: "ffmpeg -i caw-outro.mov -vf scale=1080:-2 out/caw-outro-1080.mp4",
    waited: "1 h 12 min",
  },
  {
    id: "n-review-1",
    kind: "review",
    title: "Post: one board instead of a wall of agent terminals",
    asks: "Draft ready with 2 alternates and a media plan",
    stage: "Your call",
    waited: "58 min",
  },
  {
    id: "n-review-2",
    kind: "review",
    title: "Post: answer an agent permission prompt from your phone",
    asks: "Draft ready with 1 alternate",
    stage: "Your call",
    waited: "58 min",
  },
  {
    id: "n-failed",
    kind: "failed",
    title: "Post: stop typing the same correction to every agent",
    asks: "x-use answered 429 (rate limited) while it read the thread it quotes",
    waited: "25 min",
  },
  {
    id: "n-browser",
    kind: "browser",
    title: "Prepare CawCo profile and email",
    asks: "Can't pass x.com's login check as @CawCoDev. Sign in, then hand it back.",
    waited: "12 min",
  },
];

const WORK: Work[] = [
  {
    id: "w-stuck",
    who: "attempt",
    title: "Find 20 early-user candidates and draft 10 DMs",
    state: "stuck",
    stage: "Drafting",
    type: "research",
    cause: "waits on picks in Who counts as an early user",
    todos: [1, 4],
    ran: "2 h 40 min",
  },
  {
    id: "w-failed",
    who: "attempt",
    title: "Post: stop typing the same correction to every agent",
    state: "failed",
    stage: "Drafting",
    type: "writer",
    cause: "x-use rate limited (429)",
    ran: "25 min",
  },
  {
    id: "w-media",
    who: "attempt",
    title: "Make the Caw bookend kit for clips",
    state: "asks",
    stage: "Making media",
    type: "design",
    cause: "asks to run ffmpeg",
    todos: [3, 5],
    ran: "1 h 30 min",
  },
  {
    id: "w-caw",
    who: "caw",
    title: "Caw",
    state: "working",
    cause: "drafting three posts for Thursday",
    ran: "6 min",
  },
  {
    id: "w-session",
    who: "session",
    title: "Prepare CawCo profile and email",
    state: "asks",
    type: "OpenCode",
    machine: "obelisk-of-light",
    cause: "asks you to take over the browser",
    ran: "40 min",
  },
];

const COMING: Upcoming[] = [
  {
    id: "c-reply",
    kind: "routine",
    title: "Daily reply and DM shortlist",
    when: "06:30 tomorrow",
    failed: { at: "06:30", why: "timed out after 20 min" },
  },
  {
    id: "c-post",
    kind: "task",
    title: "Post: Claude Code hands work to OpenCode on another machine",
    when: "today 15:00",
  },
  {
    id: "c-memory",
    kind: "routine",
    title: "Memory curator",
    when: "06:00 tomorrow",
  },
  {
    id: "c-shipped",
    kind: "routine",
    title: "Daily post from what shipped",
    when: "07:00 tomorrow",
  },
  {
    id: "c-measure",
    kind: "routine",
    title: "Measure posts after 48 hours",
    when: "Sat 09:00",
  },
];

export const OUTPUTS: Output[] = [
  {
    id: "o-post-board",
    kind: "post",
    title: "one-board.post.json",
    task: "Post: one board instead of a wall of agent terminals",
    stage: "Your call",
    when: "58 min ago",
    isNew: true,
    body: POST_TEXT,
    alternates: 2,
    mediaPlan: true,
  },
  {
    id: "o-picture",
    kind: "picture",
    title: "caw-outro-frame.png",
    task: "Make the Caw bookend kit for clips",
    stage: "Making media",
    when: "1 h ago",
    isNew: true,
    meta: "1080 × 1080",
  },
  {
    id: "o-post-phone",
    kind: "post",
    title: "permission-from-phone.post.json",
    task: "Post: answer an agent permission prompt from your phone",
    stage: "Your call",
    when: "58 min ago",
    isNew: true,
    body: "An agent asks to run a command. You're on the train. Approve it from the lock screen, and it carries on.",
    alternates: 1,
  },
  {
    id: "o-choices",
    kind: "choices",
    title: "Who counts as an early user",
    task: "Find 20 early-user candidates and draft 10 DMs",
    stage: "Drafting",
    when: "2 h 40 min ago",
    body: "2 of 4 picked",
  },
  {
    id: "o-markdown",
    kind: "markdown",
    title: "product-marketing.md",
    task: "Write .agents/product-marketing.md for the marketing skills",
    stage: "Ideas",
    when: "yesterday",
    body: "Caw&Co is one board for every agent on every machine you own. Who it is for: one person running Claude Code, OpenCode and pi across a desk and a phone…",
  },
  {
    id: "o-preview",
    kind: "preview",
    title: "x-profile-header",
    task: "Prepare CawCo profile and email",
    stage: "Ideas",
    when: "yesterday",
    pins: 3,
  },
  {
    id: "o-video",
    kind: "media",
    title: "caw-coconut-parody.mp4",
    task: "Make Caw coconut parody video",
    stage: "Live",
    when: "21 days ago",
    meta: "0:42",
  },
  {
    id: "o-file",
    kind: "file",
    title: "caw-intro-master.mov",
    task: "Make the Caw bookend kit for clips",
    stage: "Making media",
    when: "1 h ago",
    meta: "2.1 GB",
    unservable:
      "it is 2.1 GB, over the hub's 512 MB limit. Open it on obelisk-of-light.",
  },
  {
    id: "o-canvas",
    kind: "canvas",
    title: "launch-week-plan",
    task: "Post: Caw&Co launch announcement",
    stage: "Ideas",
    when: "3 days ago",
    pins: 1,
  },
];

export const DECISIONS: Decision[] = [
  {
    id: "d-early",
    title: "Who counts as an early user",
    group: "waits",
    picked: 2,
    total: 4,
    age: "2 h 40 min",
    after: "Find 20 early-user candidates",
    unlocks: "Draft 10 DMs",
    question: 3,
  },
  {
    id: "d-routines",
    title: "Routines for the relaunch",
    group: "waits",
    picked: 1,
    total: 2,
    age: "1 h",
    after: "Set the project up again",
    unlocks: "6 routines",
    question: 2,
  },
  {
    id: "d-stages",
    title: "Stages for the relaunch",
    group: "sent",
    picked: 9,
    total: 9,
    age: "1 h",
    unlocks: "the board's nine stages",
  },
  {
    id: "d-voice",
    title: "Caw's voice on X",
    group: "sent",
    picked: 5,
    total: 5,
    age: "yesterday",
  },
  {
    id: "d-first",
    title: "Which posts go first",
    group: "decided",
    picked: 5,
    total: 5,
    age: "2 days ago",
    made: 5,
    settled: "you",
  },
  {
    id: "d-times",
    title: "Posting times",
    group: "decided",
    picked: 2,
    total: 2,
    age: "3 days ago",
    settled: "an advisor: 13:00 and 19:00 on weekdays",
    made: 0,
  },
  {
    id: "d-handle",
    title: "The X account's handle",
    group: "decided",
    picked: 1,
    total: 1,
    age: "Oct 5",
    settled: "you: @CawCoDev",
    made: 0,
  },
];

export const ROUTINES: Routine[] = [
  {
    id: "r-reply",
    name: "Daily reply and DM shortlist",
    on: true,
    schedule: "Every day at 06:30",
    zone: "Asia/Qatar",
    last: {
      outcome: "failed",
      when: "6 h ago",
      note: "timed out after 20 min",
    },
    next: "06:30 tomorrow",
    source: "Schedule",
    instruction:
      "Build today's reply shortlist for @CawCoDev. You publish nothing: no posting, replying, liking or following. For each post worth answering, draft one reply in the project's voice and say why it is worth it.",
    runs: [
      {
        when: "today 06:30",
        outcome: "failed",
        result: "timed out after 20 min",
      },
      {
        when: "yesterday 06:30",
        outcome: "ok",
        result: "8 posts, 8 drafted replies",
      },
      {
        when: "Tue 06:30",
        outcome: "ok",
        result: "5 posts, 5 drafted replies",
      },
    ],
  },
  {
    id: "r-shipped",
    name: "Daily post from what shipped",
    on: true,
    schedule: "Every day at 07:00",
    zone: "Asia/Qatar",
    last: {
      outcome: "ok",
      when: "5 h ago",
      note: "1 draft, 1 action proposed",
    },
    next: "07:00 tomorrow",
    source: "Schedule, and pushes to bewinxed/cockpit main",
  },
  {
    id: "r-measure",
    name: "Measure posts after 48 hours",
    on: true,
    schedule: "48 hours after a post goes live",
    zone: "Asia/Qatar",
    last: { outcome: "ok", when: "2 days ago", note: "1 post measured" },
    next: "Sat 09:00",
    source: "X, delivered by the relay",
    sourceFailing: true,
  },
  {
    id: "r-memory",
    name: "Memory curator",
    on: true,
    schedule: "Every day at 06:00",
    zone: "Asia/Qatar",
    last: { outcome: "silent", when: "6 h ago", note: "no notes to curate" },
    next: "06:00 tomorrow",
    source: "Schedule",
  },
  {
    id: "r-old",
    name: "Daily reply shortlist for X",
    on: false,
    schedule: "Every day at 06:30",
    zone: "Asia/Qatar",
    source: "Schedule",
    expired: "Oct 29",
  },
];

export const ACTIONS: Action[] = [
  {
    id: "a-post",
    connection: "x-use",
    account: "@CawCoDev",
    call: 'post_tweet({ text: "Claude Code started it on obelisk. OpenCode finished it on the Mac mini. One task, two harnesses, one board." })',
    when: "today 15:00",
    from: "Daily post from what shipped",
    state: "waiting",
  },
  {
    id: "a-failed",
    connection: "x-use",
    account: "@CawCoDev",
    call: 'post_tweet({ text: "One board instead of a wall of agent terminals." })',
    when: "today 09:00",
    from: "Post: one board instead of a wall of agent terminals",
    state: "failed",
    why: "x-use answered 401: the X login on obelisk-of-light expired. Sign in again, then Try again.",
  },
];

export const SESSIONS: Session[] = [
  {
    id: "s-caw",
    group: "caw",
    title: "let's setup this project again",
    state: "working",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    age: "1 h",
  },
  {
    id: "s-caw-old",
    group: "caw",
    title: "Check marketing project setup",
    state: "idle",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    age: "22 days",
  },
  {
    id: "s-media",
    group: "attempt",
    title: "Make the Caw bookend kit for clips",
    state: "asks",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    type: "design",
    age: "1 h 30 min",
  },
  {
    id: "s-early",
    group: "attempt",
    title: "Find 20 early-user candidates and draft 10 DMs",
    state: "stuck",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    type: "research",
    age: "2 h 40 min",
  },
  {
    id: "s-correction",
    group: "attempt",
    title: "Post: stop typing the same correction to every agent",
    state: "failed",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    type: "writer",
    age: "25 min",
  },
  {
    id: "s-board",
    group: "attempt",
    title: "Post: one board instead of a wall of agent terminals",
    state: "done",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    type: "writer",
    age: "58 min",
  },
  {
    id: "s-profile",
    group: "spunOff",
    title: "Prepare CawCo profile and email",
    state: "asks",
    machine: "obelisk-of-light",
    harness: "OpenCode",
    age: "40 min",
  },
  {
    id: "s-coconut",
    group: "spunOff",
    title: "Make Caw coconut parody video",
    state: "stopped",
    machine: "obelisk-of-light",
    harness: "Claude Code",
    age: "21 days",
  },
];

export const TASKS: Task[] = [
  {
    id: "tsk-6",
    title: "Post: Caw&Co launch announcement",
    stage: "ideas",
    labels: ["post", "launch"],
    changed: "1 h",
  },
  {
    id: "tsk-7",
    title: "Founder how-to: how I run agents across my machines",
    stage: "ideas",
    labels: ["article"],
    changed: "1 h",
  },
  {
    id: "tsk-10",
    title: "Write .agents/product-marketing.md for the marketing skills",
    stage: "ideas",
    type: "writer",
    changed: "1 h",
  },
  {
    id: "tsk-11",
    title: "Add Edit to the dashboard's routine menu",
    stage: "ideas",
    labels: ["product"],
    changed: "1 h",
  },
  {
    id: "tsk-9",
    title: "Find 20 early-user candidates and draft 10 DMs",
    stage: "drafting",
    type: "research",
    state: "stuck",
    cause: "waits on picks in Who counts as an early user",
    todos: [1, 4],
    changed: "2 h",
  },
  {
    id: "tsk-5",
    title: "Post: stop typing the same correction to every agent",
    stage: "drafting",
    type: "writer",
    state: "failed",
    cause: "x-use rate limited (429)",
    needsYou: true,
    labels: ["post"],
    changed: "25 min",
  },
  {
    id: "tsk-8",
    title: "Make the Caw bookend kit for clips",
    stage: "making-media",
    type: "design",
    state: "asks",
    cause: "asks to run ffmpeg",
    todos: [3, 5],
    needsYou: true,
    changed: "1 h",
  },
  {
    id: "tsk-1",
    title: "Post: one board instead of a wall of agent terminals",
    stage: "your-call",
    type: "writer",
    needsYou: true,
    labels: ["post"],
    changed: "58 min",
  },
  {
    id: "tsk-2",
    title: "Post: answer an agent permission prompt from your phone",
    stage: "your-call",
    type: "writer",
    needsYou: true,
    labels: ["post"],
    changed: "58 min",
  },
  {
    id: "tsk-3",
    title: "Post: Claude Code hands work to OpenCode on another machine",
    stage: "scheduled",
    type: "writer",
    cause: "approved action at 15:00 waits on you",
    needsYou: true,
    labels: ["post"],
    changed: "3 h",
    due: "today 15:00",
  },
  {
    id: "tsk-4",
    title: "Post: install a skill once across the whole fleet",
    stage: "live",
    type: "writer",
    labels: ["post"],
    changed: "2 days",
  },
];

export const ARCHIVE = 3;

const SPEND_DAYS = [
  2.1, 3.4, 1.9, 2.8, 5.2, 4.4, 1.2, 0.8, 3.1, 2.6, 2.2, 3.9, 4.8, 2.4, 1.5,
  1.1, 2.9, 3.3, 2.7, 1.8, 0.9, 2.2, 3.6, 4.1, 2.3, 1.7, 0.6, 2.8, 3.0, 4.1,
];

export const BUSY: Briefing = {
  project: PROJECT,
  caw: {
    status: "working",
    sentence: "drafting three posts for Thursday from what shipped this week",
    harness: "Claude Code",
    model: "Opus 5.5",
    events: true,
  },
  needs: NEEDS,
  work: WORK,
  stages: STAGES,
  archive: ARCHIVE,
  coming: COMING,
  outputs: OUTPUTS.slice(0, 5),
  lookedAt: "09:14",
  decisions: DECISIONS.filter((d) => d.group === "waits"),
  spend: {
    today: 4.1,
    cap: 10,
    month: 61.3,
    by: { caw: 1.2, attempts: 2.45, routines: 0.45, sessions: 0 },
    stops:
      "New attempts and routine runs wait until midnight, Asia/Qatar. Running sessions finish what they're doing.",
    days: SPEND_DAYS,
  },
};

/** Its stages' counts on a quiet morning: the posts went out, nothing waits. */
const QUIET_COUNTS: Record<string, number> = {
  drafting: 0,
  "making-media": 0,
  "your-call": 0,
  scheduled: 2,
  live: 3,
  measured: 1,
};

/** The same project on a quiet morning: everything answered, the routines ran. */
export const QUIET: Briefing = {
  ...BUSY,
  caw: {
    ...BUSY.caw,
    status: "idle",
    sentence: "nothing running; Daily post from what shipped runs at 07:00",
  },
  needs: [],
  work: [],
  stages: STAGES.map((s) => ({ ...s, count: QUIET_COUNTS[s.id] ?? s.count })),
  coming: COMING.map((c) =>
    c.failed ? { id: c.id, kind: c.kind, title: c.title, when: c.when } : c
  ),
  outputs: [],
  decisions: [],
  spend: { ...BUSY.spend, today: 0.4 },
};

/** A project just made: its stages named, nothing in them yet. */
export const FRESH: Briefing = {
  ...QUIET,
  caw: {
    ...BUSY.caw,
    status: "idle",
    sentence: "waiting to hear what the project is for",
  },
  stages: STAGES.map((s) => ({ ...s, count: 0 })),
  archive: 0,
  coming: [],
  outputs: [],
  lookedAt: "",
  spend: { ...BUSY.spend, today: 0, month: 0, days: [] },
};

/** What comes along to a session spun off on the project's checkout: its skills and MCP servers. */
export const SKILLS = [
  "humanizer",
  "x-account-warmup",
  "x-twitter-growth-system",
  "clean-copy",
  "product-launch-video",
  "media-use",
];
export const SERVERS = ["x-use", "monid", "crw"];
