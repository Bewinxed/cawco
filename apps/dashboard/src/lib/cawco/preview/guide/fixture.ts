/**
 * The advisor's example, as the hub would hold it after the agent answered
 * (report 1e8d7199, "Design guidance after a reply"): the landing-hero page,
 * the person's pins ① (the headline) and ② (the screenshot block), and the
 * revision that changed three elements. Pins are core's shape; the change
 * rows carry the fields each option asks the hub to keep (`before`,
 * `answers`, `times`).
 */
import type { Pin } from "@cawco/core/comments";

/** Today, 11:44: when revision 7 landed. */
const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const PAGE = {
  name: "landing-hero",
  ask: "Pin what reads wrong on the hero",
  revision: 7,
};

export const AGENT = "Claude Code";

export const OLD_HEADLINE =
  "A self-hosted control plane that puts every AI coding agent on every machine on one board";
export const NEW_HEADLINE = "One board for every agent";

export const REPLY =
  "Shortened to “One board for every agent” and moved Connect a machine under it.";

/** Pin ①: on the headline, answered by the agent. Its anchor keeps the text it had when pinned. */
export const PIN_1: Pin = {
  id: "pin-1",
  number: 1,
  kind: "comment",
  by: "person",
  at: at(34),
  sentAt: at(34),
  seenAt: at(30),
  anchor: { selector: "#headline", source: null, text: OLD_HEADLINE },
  elements: [],
  thread: [
    {
      id: "e1",
      by: "person",
      at: at(34),
      sentAt: at(34),
      text: "Too long. Say what it does in six words, and put the button right under it.",
    },
    {
      id: "e2",
      by: "agent",
      at: at(2),
      text: REPLY,
      files: ["src/lib/Hero.svelte"],
    },
  ],
};

/** Pin ②: on the screenshot block; its element changed, no answer came. */
export const PIN_2: Pin = {
  id: "pin-2",
  number: 2,
  kind: "comment",
  by: "person",
  at: at(31),
  sentAt: at(31),
  seenAt: at(30),
  anchor: {
    selector: "#shot",
    source: null,
    text: "Board screenshot at 50%",
  },
  elements: [],
  thread: [
    {
      id: "e3",
      by: "person",
      at: at(31),
      sentAt: at(31),
      text: "Can this show one real session instead of the whole board?",
    },
  ],
};

export const PINS = [PIN_1, PIN_2];

/** Where a change stands: answers a pin, changed under a pin with no answer, or asked by no one. */
export type ChangeKind = "answers" | "unanswered" | "unasked";

/** One stop: one element, from when he last looked to now. */
export interface GuideChange {
  after: string;
  /** The element, by its page anchor. */
  anchor: string;
  /** For a move: where it stood and where it stands. */
  at?: { after: string; before: string };
  before: string;
  /** What the element is, in words. */
  element: string;
  kind: ChangeKind;
  /** The pin it answers, or the pin standing on it with no answer. */
  pin: number | null;
  /** How many revisions changed it since he looked, and when the last did. */
  times?: { count: number; last: string };
}

/** Revision 7's three changes, in the check order: answers first, then unanswered, then unasked. */
export const CHANGES: GuideChange[] = [
  {
    anchor: "#headline",
    element: "Headline",
    before: OLD_HEADLINE,
    after: NEW_HEADLINE,
    kind: "answers",
    pin: 1,
  },
  {
    anchor: "#cta",
    element: "Button",
    before: "Get started",
    after: "Connect a machine",
    at: { before: "after the paragraph", after: "under the headline" },
    kind: "answers",
    pin: 1,
  },
  {
    anchor: "#shot",
    element: "Screenshot block",
    before: "Board screenshot at 50%",
    after: "Session list at 100%",
    kind: "unanswered",
    pin: 2,
  },
];

/** A 30-minute run: four revisions, seven elements, grouped per element. */
export const RUN: GuideChange[] = [
  {
    ...CHANGES[0],
    times: { count: 4, last: "2m" },
  } as GuideChange,
  { ...CHANGES[1], times: { count: 2, last: "2m" } } as GuideChange,
  { ...CHANGES[2], times: { count: 3, last: "9m" } } as GuideChange,
  {
    anchor: "#sub",
    element: "Paragraph",
    before: "Run Claude Code, OpenCode and pi from one place.",
    after: "Claude Code, OpenCode and pi sessions across every machine.",
    kind: "unasked",
    pin: null,
    times: { count: 2, last: "14m" },
  },
  {
    anchor: "#nav-docs",
    element: "Nav link",
    before: "Documentation",
    after: "Docs",
    kind: "unasked",
    pin: null,
    times: { count: 1, last: "21m" },
  },
  {
    anchor: "#nav-pricing",
    element: "Nav link",
    before: "Pricing",
    after: "Removed",
    kind: "unasked",
    pin: null,
    times: { count: 1, last: "21m" },
  },
  {
    anchor: "#foot",
    element: "Footnote",
    before: "Free while in beta",
    after: "Self-hosted. Free.",
    kind: "unasked",
    pin: null,
    times: { count: 1, last: "26m" },
  },
];

/** The agent's turns of the run, oldest first: when each revision landed, and what the agent said. */
export const TURNS = [
  {
    at: at(26),
    revision: 4,
    text: "Tightened the footnote and the paragraph under the headline.",
    changes: 2,
  },
  {
    at: at(21),
    revision: 5,
    text: "Trimmed the nav to Docs and dropped Pricing until it has a page.",
    changes: 2,
  },
  {
    at: at(9),
    revision: 6,
    text: "Swapped the board screenshot for a closer crop.",
    changes: 2,
  },
  {
    at: at(2),
    revision: 7,
    text: "Shortened the headline as you asked and moved the button under it. Pinned the change on your comment.",
    changes: 3,
  },
];

export const ANSWERED_AT = at(2);

/** The conversation when he comes back: the agent's last turn is revision 7's. */
export const CAME_BACK_TURNS = [
  {
    id: "t-shown",
    by: "agent" as const,
    at: at(40),
    text: "The hero is up in the preview. Pin anything that reads wrong and I'll take it from there.",
  },
  {
    id: "t-asked",
    by: "person" as const,
    at: at(31),
    text: "Left you two pins on the hero.",
  },
  {
    id: "t-rev-7",
    by: "agent" as const,
    at: TURNS[3].at,
    text: TURNS[3].text,
  },
];

/** The conversation after a 30-minute run: one agent turn per revision. */
export const RUN_TURNS = [
  CAME_BACK_TURNS[1],
  ...TURNS.map((turn) => ({
    id: `t-rev-${turn.revision}`,
    by: "agent" as const,
    at: turn.at,
    text: turn.text,
  })),
];

/** A line of a comment's activity: one element's change in one revision. */
export type ActivityLine = GuideChange & { revision: number };

/** Revision 7's lines, by the pin they stand under. */
export const LINES: Record<string, ActivityLine[]> = {
  "pin-1": [
    { ...CHANGES[0], revision: 7 },
    { ...CHANGES[1], revision: 7 },
  ] as ActivityLine[],
  "pin-2": [{ ...CHANGES[2], revision: 7 }] as ActivityLine[],
};

/** The 30-minute run's lines, newest first: each revision that touched an element under a pin. */
export const RUN_LINES: Record<string, ActivityLine[]> = {
  "pin-1": [
    { ...CHANGES[0], before: "Every coding agent on one board", revision: 7 },
    { ...CHANGES[1], before: "Connect your machines", revision: 7 },
    {
      ...CHANGES[0],
      before: "Every AI coding agent, on one board you host",
      after: "Every coding agent on one board",
      revision: 6,
    },
    {
      ...CHANGES[1],
      at: undefined,
      before: "Get started",
      after: "Connect your machines",
      revision: 6,
    },
    {
      ...CHANGES[0],
      before: "Every AI coding agent on every machine, on one board you host",
      after: "Every AI coding agent, on one board you host",
      revision: 5,
    },
    {
      ...CHANGES[0],
      after: "Every AI coding agent on every machine, on one board you host",
      revision: 4,
    },
  ] as ActivityLine[],
  "pin-2": [
    { ...CHANGES[2], before: "Board screenshot, cropped", revision: 7 },
    {
      ...CHANGES[2],
      before: "Board screenshot at 75%",
      after: "Board screenshot, cropped",
      revision: 6,
    },
    {
      ...CHANGES[2],
      after: "Board screenshot at 75%",
      revision: 5,
    },
  ] as ActivityLine[],
};

/** What changed under no comment in the run, newest first. */
export const UNASKED_LINES: ActivityLine[] = RUN.filter(
  (change) => change.kind === "unasked"
).map((change, index) => ({
  ...change,
  revision: [4, 5, 5, 4][index] ?? 4,
}));
