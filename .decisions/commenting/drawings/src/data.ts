/**
 * The drawings' fixtures: one review of an agent's page holding the
 * dashboard's own routine form (RoutineForm), the comments a person really
 * leaves on such a page, newest first, and what they attached.
 */

export type PinState = "provisional" | "unsent" | "sent" | "resolved";

/** One attachment on a comment's entry (attachments-design §1: by reference). */
export interface Attached {
  kind: "image" | "file";
  name: string;
  /** Bytes, for a file; what DocThumb says under its name. */
  size?: number;
}

/** A thread's last entry, as its row's third line says it: who, and their words. */
export interface Last {
  by: "agent" | "you";
  text: string;
  /** Not yet read: the line steps to the strong ink until the thread is opened. */
  unread?: boolean;
}

export interface Comment {
  /** The last activity's age, as the thread's turns say it ("2m"). */
  age: string;
  /** What the entry carries (attachments-design §1). */
  attachments?: Attached[];
  /** The thread's last entry once it has more than one. */
  last?: Last;
  /** The agent is working on it now. */
  live?: boolean;
  n: number;
  /** The element's name, or "Whole page". */
  on: string;
  state: PinState;
  /** Its words; empty when the entry is attachments alone (pick 6's B). */
  words: string;
}

export const AGENT = "Orchestrate cockpit";

/** The form's elements a comment stands on, by the drawings' names: the element's own words, and where it is in the form. */
export const ELEMENTS = {
  name: { words: "Name", find: "[data-slot='field-field']:has(#routine-name)" },
  prompt: { words: "What each run does", find: "[data-slot='field-field']:has(#routine-prompt)" },
  when: { words: "When", find: "[data-slot='field-field']:has(#routine-repeat)" },
  time: { words: "At", find: "[data-slot='field-field']:has(#routine-time)" },
  zone: { words: "Time zone", find: "[data-slot='field-field']:has(#routine-zone)" },
  type: { words: "Delegate type", find: "[data-slot='field-field']:has(#routine-type)" },
  create: { words: "Create routine", find: "[data-slot='commit'] button[type='submit']" },
} as const;

export type ElementName = keyof typeof ELEMENTS;

const REF: Attached = { kind: "image", name: "ref.png" };
const SPEC: Attached = { kind: "file", name: "spec.csv", size: 12_288 };

export const COMMENTS: Comment[] = [
  {
    n: 14,
    on: "Create routine",
    age: "2m",
    words: "Create should sit right under the fields, like the reference.",
    attachments: [REF, SPEC],
    last: { by: "agent", text: "Moved it up under the fields." },
    state: "sent",
  },
  {
    n: 13,
    on: "Whole page",
    age: "20m",
    words: "Too much air between the fields; it reads as a long scroll.",
    state: "sent",
    live: true,
  },
  {
    n: 12,
    on: "When",
    age: "1h",
    words: "Say when it runs next, under the field.",
    last: { by: "agent", text: "Added the next run under it.", unread: true },
    state: "sent",
  },
];

/** The same three, not yet heard by the session (pick 3's unsent state). */
export const UNSENT: Comment[] = COMMENTS.map((comment, at) => ({
  ...comment,
  age: ["now", "1m", "3m"][at] ?? comment.age,
  last: undefined,
  live: false,
  state: "unsent" as const,
}));

/** Pick 7's rows: one comment with two attachments, one with five pictures (a strip shows four, then +1), one with none. */
export const WITH_ATTACHMENTS: Comment[] = [
  COMMENTS[0],
  {
    ...COMMENTS[1],
    words: "Every field is a different width; line them up like these.",
    live: false,
    last: { by: "you", text: "The same width as Name, please." },
    attachments: ["one.png", "two.png", "three.png", "four.png", "five.png"].map((name) => ({ kind: "image" as const, name })),
  },
  COMMENTS[2],
];

const MINUTE = 60_000;

/**
 * The thread of comment 14, as the transcript's turns draw it, attachments
 * under the words. Its times are set back from the page's own clock, so each
 * turn's age reads as the row's does: the reply is the row's last activity,
 * "2m".
 */
export const THREAD = [
  {
    by: "you" as const,
    at: new Date(Date.now() - 60 * MINUTE).toISOString(),
    text: COMMENTS[0].words,
    attachments: [REF, SPEC],
  },
  {
    by: "agent" as const,
    at: new Date(Date.now() - 2 * MINUTE).toISOString(),
    text: "Moved Create up under the fields.",
    file: "RoutineForm.svelte",
  },
];

/**
 * A picture a person attaches: a small screenshot of a form, drawn once on a
 * canvas, so every picture of it is the same bytes. `hue` tints its
 * accent, so a strip of several reads as several pictures.
 */
export const screenshot = (hue = 250): string => {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  const pen = canvas.getContext("2d");
  if (!pen) {
    return "";
  }
  pen.fillStyle = "#f6f4ef";
  pen.fillRect(0, 0, 160, 120);
  pen.fillStyle = "#d9d5cc";
  for (const y of [18, 46, 74]) {
    pen.fillRect(14, y, 60, 6);
    pen.fillRect(14, y + 10, 132, 12);
  }
  pen.fillStyle = `hsl(${hue} 60% 50%)`;
  pen.fillRect(98, 100, 48, 12);
  return canvas.toDataURL("image/png");
};

const DATA_URL_HEAD = /^data:image\/png;base64,/;

/** The same picture's base64 alone, as a draft's picture chip holds it. */
export const screenshotData = (hue = 250): string => screenshot(hue).replace(DATA_URL_HEAD, "");
