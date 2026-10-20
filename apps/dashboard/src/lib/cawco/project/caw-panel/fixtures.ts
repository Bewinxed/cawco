/**
 * What the panel options on the decision page draw (Caw's panel, round
 * three's words): one project, its threads, the reply that filed three
 * tasks, the things to ask Caw on an empty thread, and what the hub says
 * when it can't read a thread or start Caw. Each part also has a stretched
 * copy (many items, 40-word lines) so every option is drawn at one item,
 * many items, a short line and a long one.
 *
 * A filed task's `description` is the task file's own (the text between its
 * title and its first section, packages/hub task-file.ts; the dashboard's
 * `readTask` answers it as TaskView.description; `task_create` takes it).
 * Two things here have no source in the hub yet: why Caw filed each task
 * (`why`: task_create takes no reason, and his reply names only the tasks'
 * ids), and a suggestion's short label (`LABELS`). The options that draw
 * them say so in their cost.
 */
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

export const THREAD = "What's left before we can ship?";
export const LONG_THREAD =
  "Can you check the onboarding copy on the booking page, the pricing page and the three welcome emails for anything that still says workspace where the product now says project";
export const THREADS = [
  THREAD,
  "Can you check the onboarding copy?",
  "Plan the launch email for Friday",
];

export const SHIP: Said[] = [
  { id: "s1", who: "you", words: [THREAD] },
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
 * the panel opens at its latest message, so your first one (the thread's
 * name) is above the fold.
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
      "I'd change it to project and cut the hint. Want me to file both as tasks?",
    ],
  },
  {
    id: "c3",
    who: "you",
    words: [
      "Yes, file both. And can you resize the hero photo for phones too?",
    ],
  },
];

export const LONG_ASK: Said = {
  id: "c4",
  who: "you",
  words: [
    "Can you resize the hero photo for phones too, and while you're there check that the booking page's date picker keeps the chosen day when a guest switches between the weekly and the monthly view on a small screen?",
  ],
};

/** A task Caw filed, as his reply's block shows it. */
export interface Filed {
  /** The task file's description (TaskView.description), its first line drawn. */
  description: string | null;
  id: string;
  title: string;
  /** Waits on you: its why is marked with the needs-you glyph. */
  waits: boolean;
  /** Why Caw filed it, in his words. No hub source yet: the build adds it. */
  why: string | null;
}

export const FILED: Filed[] = [
  {
    id: "hb-3",
    title: "Write the pricing page copy",
    description: "Prices, plans and the FAQ for /pricing",
    why: "Needs your numbers before anyone starts it",
    waits: true,
  },
  {
    id: "hb-4",
    title: "Changelog for 0.9",
    description: "Every change since 0.8, grouped by area",
    why: "So the launch email can link to it",
    waits: false,
  },
  {
    id: "hb-5",
    title: "Swap the hero photo for the harbour at dusk",
    description: "The dusk shot from the brand folder",
    why: "Friday's launch email leads with it",
    waits: false,
  },
];

const LONG_TITLES = [
  "Rewrite the pricing page so every plan names what it includes, what it costs per seat each month and each year, which limits apply to teams over fifty people, and how a customer moves between plans without losing any history",
  "Changelog for 0.9 covering every change since 0.8, grouped by area, with the booking fixes first, the new harbour photography second, and a short note on the pricing move that links to the page and the FAQ",
  "Swap the hero photo for the harbour at dusk across the home page, the booking page and the press kit, cropped for phones and tablets, with alt text that says what the picture shows rather than what it is for",
  "Find out why the booking page drops the selected date when a guest switches between weekly and monthly views on a phone, write down every step that reproduces it, and fix it without changing the desk layout",
  "Draft Friday's launch email with three subject lines, a short body that leads with the harbour photo, a link to the new pricing page, and a plain-text version for the readers whose mail refuses images",
];
const LONG_DESCRIPTION =
  "Every plan, its price per seat, its limits, and the FAQ entries that answer what changes for teams already booked under the old prices, kept to what the pricing page itself can say";
const LONG_WHY =
  "Needs your numbers for the team plan and the yearly discount before anyone starts it, because the copy and the FAQ both quote them and nobody else has them";

/** Five filed tasks, every line at its longest. */
export const FILED_LONG: Filed[] = LONG_TITLES.map((title, at) => ({
  id: `hb-${20 + at}`,
  title,
  description: at % 3 === 2 ? null : LONG_DESCRIPTION,
  why: at % 2 === 0 ? LONG_WHY : null,
  waits: at === 0,
}));

/** A starter as the hub writes it, with why it is offered. */
export type Suggestion = Starter & { reason?: string };

export const SUGGESTIONS: Suggestion[] = [
  {
    glyph: "bug",
    text: "Find what's broken on the booking page",
    reason: "The booking page had 3 errors in its last run.",
  },
  {
    glyph: "draft",
    text: "Draft Friday's launch email",
    reason: "Friday's launch email hasn't had a reply in 2 days.",
  },
  {
    glyph: "tasks",
    text: "Break the launch into tasks",
    reason: "The launch is in 5 days and Backlog holds one task for it.",
  },
  {
    glyph: "search",
    text: "Check the site's copy for anything that reads off",
  },
];

export const SUGGESTIONS_LONG: Suggestion[] = [
  ...SUGGESTIONS,
  {
    glyph: "brief",
    text: "Write a README that says how to run the site locally, where the photography lives, how the booking page talks to the calendar service and who to ask when the deploy to the harbour host fails",
    reason:
      "The repository has no README, and two sessions this week asked how to run the site before they could start on their tasks.",
  },
  {
    glyph: "rocket",
    text: "Plan the launch",
  },
];

/**
 * A suggestion's short label, three to five words, for the chips option.
 * The hub writes no such label yet.
 */
export const LABELS: Record<string, string> = {
  "Find what's broken on the booking page": "Fix the booking page",
  "Draft Friday's launch email": "Draft the launch email",
  "Break the launch into tasks": "Break down the launch",
  "Check the site's copy for anything that reads off": "Check the site's copy",
  "Plan the launch": "Plan the launch",
};

/** One row of Show details: what it is about and what it said. */
export interface DetailRow {
  name: string;
  said: string;
}

export const MACHINES: DetailRow[] = [
  { name: "obelisk", said: "offline since 14:02" },
  { name: "harbour-mac", said: "asleep, refused the wake" },
];

export const MACHINES_LONG: DetailRow[] = [
  ...MACHINES,
  { name: "studio-linux-workstation-2", said: "offline since Monday" },
  { name: "pi-garage", said: "offline since 3 Oct" },
  { name: "build-box", said: "updating since 13:58" },
];

export const READ_RAW =
  "hub: ENOENT: no such file or directory, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl'";
export const READ_RAW_LONG =
  "hub: EACCES: permission denied, open '/var/lib/cawco/projects/harbour-site/threads/th-whats-left.jsonl' (the hub runs as cawco:cawco and the file is owned by root:root after last night's restore copied it in with mode 0600)";

/** What each blocking state says: what happened, then why and what is safe. */
export const CANT_READ = {
  title: "This thread couldn't be read",
  line: "The hub couldn't open its history. Your messages are kept.",
  act: "Try again",
  second: "New thread",
};
export const CANT_READ_LONG = {
  ...CANT_READ,
  line: "The hub couldn't open its history because the file it keeps the thread in is owned by another user since last night's restore. Your messages are kept, and nothing in the thread was changed.",
};
export const CANT_START = {
  title: "Caw can't start",
  line: "No machine is online to run him. What you write now waits for him.",
  act: "Check machines",
  second: null,
};

/** Why a message didn't wake Caw. */
export const NOT_WOKEN = "Not read: no machine is online, so Caw can't start.";
export const NOT_WOKEN_LONG =
  "Not read: the machine Caw runs on refused to start his session because its Claude login expired overnight, and the hub couldn't reach the second machine either, so nothing has read this yet.";
export const NOT_WOKEN_RAW =
  "hub: no machine can run caw-harbour-site (obelisk: offline since 14:02; harbour-mac: wake refused)";
