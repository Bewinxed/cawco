/**
 * What the decision page's frames of Caw's panel draw: one project, its
 * threads, the reply that filed three tasks, the asks waiting in other
 * projects, his question, and what the hub says when it can't start him or
 * read a thread. The panel's own words are the design's (advisor report
 * §5); everything here is the product's data, shaped as the hub keeps it.
 *
 * Two things have no hub source yet: the name Caw gives a thread
 * (`NAMED`: today a thread's title is its first message's first line, hub
 * caw.ts `titleFrom`) and why Caw filed each task (`Filed.why`). The
 * options that draw them say so in their cost.
 */
import type { PendingPermission } from "#lib/cawco/client.svelte.js";
import type { Starter } from "#lib/cawco/project-tasks.js";

export const PROJECT = "Harbour site";

/** One message in the thread: who said it and its paragraphs. */
export interface Said {
  id: string;
  /** Under a reply that filed tasks: they stand after its words. */
  tasks?: boolean;
  who: "you" | "caw";
  words: string[];
}

/** Your first message, the thread's title today (hub caw.ts `titleFrom`). */
export const FIRST = "What's left before we can ship?";

/** The name Caw gives the thread when he first answers: a few words of his own. */
export const NAMED = "Friday's ship list";

/** The project's threads as the head's menu lists them, by Caw's names. */
export const THREADS = [NAMED, "Onboarding copy", "Launch email"];

export const LONG_NAMED =
  "Pricing page, the 0.9 changelog, the hero photo swap and every piece of onboarding copy that still says workspace";

export const SHIP: Said[] = [
  { id: "s1", who: "you", words: [FIRST] },
  {
    id: "s2",
    who: "caw",
    tasks: true,
    words: [
      "Three things, filed for Friday: the pricing page copy, the 0.9 changelog and the hero photo swap. The pricing copy needs your numbers before anyone starts it.",
    ],
  },
];

/**
 * The same thread a few messages on, as it reads when you come back to it:
 * the panel opens at its latest message, so your first one is above the fold.
 */
export const SHIP_ON: Said[] = [
  ...SHIP,
  { id: "s3", who: "you", words: ["Can the changelog wait until Monday?"] },
  {
    id: "s4",
    who: "caw",
    words: [
      "Yes. The launch email only links to it, so Monday still works. I've moved its due date; nothing else changes.",
    ],
  },
  { id: "s5", who: "you", words: ["I'll send the pricing numbers tonight."] },
  {
    id: "s6",
    who: "caw",
    words: [
      "Good. The pricing copy waits for them, and I'll start it as soon as they're in.",
    ],
  },
];

/** A turn under way: his words so far at the thread's tail. */
export const WORKING: Said[] = [
  ...SHIP_ON.slice(0, 4),
  {
    id: "w1",
    who: "you",
    words: ["Check the booking page before Friday too."],
  },
  {
    id: "w2",
    who: "caw",
    words: ["Reading the booking page's last run. Three errors so far, all in"],
  },
];

/** What his turn is doing now, as the transcript's tool row says it. */
export const TOOL = "Reading src/routes/booking/+page.svelte";

/** A thread whose last message didn't wake Caw. */
export const ASKED: Said[] = [
  {
    id: "c1",
    who: "you",
    words: [
      "Can you check the onboarding copy? Something reads off in step two.",
    ],
  },
  {
    id: "c2",
    who: "caw",
    words: [
      "Read all three steps. Step two says workspace where the rest say project, and the hint under the name field repeats the label above it.",
    ],
  },
  {
    id: "c3",
    who: "you",
    words: ["Swap the hero photo for the harbour at dusk"],
  },
];

/** A task Caw filed, as his reply's block shows it. */
export interface Filed {
  id: string;
  /** Its stage on the board. */
  stage: string;
  title: string;
  /** Why Caw filed it, in his words. No hub source yet: the build adds it. */
  why: string;
}

export const FILED: Filed[] = [
  {
    id: "hb-3",
    title: "Write the pricing page copy",
    why: "Needs your numbers before anyone starts it",
    stage: "Backlog",
  },
  {
    id: "hb-4",
    title: "Changelog for 0.9",
    why: "So the launch email can link to it",
    stage: "Backlog",
  },
  {
    id: "hb-5",
    title: "Swap the hero photo for the harbour at dusk",
    why: "Friday's launch email leads with it",
    stage: "Backlog",
  },
];

/** A starter as the hub writes it, with why it is offered. */
export type Suggestion = Starter & { reason?: string };

export const SUGGESTIONS: Suggestion[] = [
  { glyph: "bug", text: "Find what's broken on the booking page" },
  { glyph: "draft", text: "Draft Friday's launch email" },
  {
    glyph: "search",
    text: "Check the site's copy for anything that reads off",
  },
];

/** An ask waiting in another project: one decision, its act on its row. */
export interface Waiting {
  /** The act on the row: a permission's two answers, else Open. */
  act: "answer" | "open";
  id: string;
  /** Where it comes from and how long it has waited. */
  source: string;
  title: string;
}

export const WAITING: Waiting[] = [
  {
    id: "w-perm",
    title: "Change knowledge/wire-check.md",
    source: "cockpit · 1h 8m",
    act: "answer",
  },
  {
    id: "w-review",
    title: "Post: one board instead of a wall of cards",
    source: "Cawco · tsk-1 · Review · 5d",
    act: "open",
  },
];

/** His question in this thread, as the hub parks it: the composer grows into it. */
export const QUESTION: PendingPermission = {
  heard: 0,
  input: {
    questions: [
      {
        question: "Which word should step two use?",
        header: "Step two",
        multiSelect: false,
        options: [
          {
            label: "Project",
            description: "Matches the sidebar and the PRD",
          },
          {
            label: "Workspace",
            description: "Matches the git worktree name",
          },
        ],
      },
    ],
  },
  instanceId: "caw-harbour-site",
  presentation: {
    asker: "Caw",
    changes: [],
    fields: [],
    summary: "Which word should step two use?",
  },
  raisedAt: Date.now() - 6 * 60_000,
  requestId: "r-step-two",
  threadId: "th-onboarding",
  toolName: "AskUserQuestion",
};

/** One row of Show details: what it is about and what it said. */
export interface DetailRow {
  name: string;
  said: string;
}

/** What blocks him, as the panel's centre says it (advisor report §5). */
export interface Block {
  /** The way out: the primary. */
  act: string;
  /** The rest of what happened, and what is safe; none where the title says it all. */
  line: string | null;
  /** The hub's own words behind Show details: an error, or rows. */
  raw: string | null;
  rows: DetailRow[];
  /** A way round, beside the way out. */
  second: string | null;
  title: string;
}

export const NO_MACHINE: Block = {
  title: "No machine is online.",
  line: "He starts on the first one back and reads what you write.",
  act: "Check machines",
  second: null,
  raw: null,
  rows: [
    { name: "obelisk", said: "offline since 14:02" },
    { name: "harbour-mac", said: "asleep, refused the wake" },
  ],
};

export const BUDGET: Block = {
  title: "Budget reached · resets in 4h",
  line: null,
  act: "Raise the cap",
  second: null,
  raw: null,
  rows: [
    { name: "spent", said: "$50.12 today" },
    { name: "cap", said: "$50.00 a day" },
  ],
};

export const CANT_READ: Block = {
  title: "This thread couldn't be read.",
  line: "The hub couldn't open its history. Your messages are kept.",
  act: "Read again",
  second: "New thread",
  raw: "hub: ENOENT: no such file or directory, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl'",
  rows: [],
};

export const CANT_READ_LONG: Block = {
  ...CANT_READ,
  raw: "hub: EACCES: permission denied, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl' (the hub runs as cawco:cawco and the file is owned by root:root after last night's restore copied it in with mode 0600)",
};

/** Why a message didn't wake Caw, at its place. */
export const NOT_WOKEN = "Not read: no machine was online.";
export const NOT_WOKEN_RAW =
  "hub: no machine can run caw-harbour-site (obelisk: offline since 14:02; harbour-mac: wake refused)";
