/**
 * One real request, as the three decision-page prototypes draw it: the four
 * calls the owner was asked on decision-fresh-pick (how the fleet's
 * decisions reach him), in their own words, with what the prototypes must
 * also carry: a question that only opens once an earlier pick unlocks it, a
 * question common practice settled for him, and the agent's next round
 * after he sends. Every answer's demonstration is the same live design, the
 * fleet's decisions list (NeedsList.svelte), drawn with the values that
 * answer sets, so an answer is seen as the real thing at its real width.
 */

/** The values of the decisions list an answer sets (NeedsList's props). */
export interface ListLook {
  /** What an answered row does. */
  answered: "leave" | "undo";
  /** What a phone opens on: the list, or the decision that has waited longest. */
  entry: "list" | "urgent";
  /** A session holding one decision: its own heading, or one row. */
  fold: "heading" | "folded";
  /** One layout, or Deck beside it. */
  layouts: "one" | "two";
  /** Which sessions name their machine. */
  machine: "every" | "news";
  /** Where Next goes from an open decision. */
  next: "urgent" | "session";
  /** The order the list stands in. */
  order: "longest" | "newest";
}

/** The list as it stands before any answer sets it. */
export const TODAY_LOOK: ListLook = {
  entry: "list",
  next: "urgent",
  fold: "heading",
  machine: "every",
  layouts: "two",
  order: "longest",
  answered: "leave",
};

/** A device a demonstration is drawn for, by its word. */
export type Size = "phone" | "tablet" | "desk" | "wider";

/** Each device's real width in CSS px, and the height its screen stands at. */
export const SIZES: Record<Size, { w: number; h: number; word: string }> = {
  phone: { w: 390, h: 844, word: "Phone" },
  tablet: { w: 680, h: 900, word: "Tablet" },
  desk: { w: 1440, h: 900, word: "Desk" },
  wider: { w: 2560, h: 1080, word: "Wider" },
};

export const SIZE_ORDER: Size[] = ["phone", "tablet", "desk", "wider"];

export interface Answer {
  /** What picking it builds or changes. */
  builds: string;
  /** What it costs him, one sentence. */
  cost: string;
  /** Added in this round. */
  fresh?: boolean;
  id: string;
  /** What it gets him, one sentence. */
  line: string;
  name: string;
  recommended?: boolean;
  /** What ships now. */
  today?: boolean;
  /** The value it sets on the list. */
  value: string;
}

interface Settlement {
  answer: string;
  by: string;
  sources: string[];
  why: string;
}

export interface Question {
  /** An earlier pick that opens it: the question and the answer. */
  after?: { question: string; answer: string };
  answers: Answer[];
  /** In a later round: what changed since he sent. */
  changed?: string;
  /** In a later round: asked for the first time. */
  fresh?: boolean;
  id: string;
  question: string;
  /** The recommendation sentence, its fact included. */
  recommends: string;
  /** The value of the list this question sets. */
  sets: keyof ListLook;
  settled?: Settlement;
  /** The size the agent named for it. */
  size: Size;
  waiting?: string[];
}

export interface Request {
  asker: { name: string; doing: string; machine: string };
  questions: Question[];
  restsOn: string;
  situation: string;
  title: string;
  waiting: string[];
}

const shape: Question = {
  id: "shape",
  question:
    "On a phone, what do you see first: the list, or the most urgent decision?",
  recommends:
    "Recommended: Deck's entry. Opening on the decision that has held up work longest gets you answering in one tap.",
  sets: "entry",
  size: "phone",
  waiting: ["Draw the phone's decisions list"],
  answers: [
    {
      id: "list",
      name: "By work",
      line: "You see every session and its decisions first; tap one to answer, Back returns to the list.",
      cost: "One extra tap to reach the first decision.",
      builds: "Nothing new: the phone opens on the list as it does now.",
      today: true,
      value: "list",
    },
    {
      id: "deck",
      name: "By work, Deck's entry",
      line: "It opens straight on the decision blocking work longest, with Next beside Answer and Back to the list.",
      cost: "To scan everything you open the list on purpose.",
      builds:
        "The phone opens on one decision, with Next and Back to the list.",
      recommended: true,
      value: "urgent",
    },
  ],
};

const next: Question = {
  id: "next",
  question: "With Deck's entry, where does Next take you?",
  recommends:
    "Recommended: The next most urgent. A decision that blocks work loses the most while it waits, wherever it was asked.",
  sets: "next",
  size: "phone",
  after: { question: "shape", answer: "deck" },
  answers: [
    {
      id: "urgent",
      name: "The next most urgent",
      line: "Next always goes to the decision that has waited longest of those left.",
      cost: "Two decisions from one session can be answered apart.",
      builds: "Next reads the whole list's order.",
      recommended: true,
      value: "urgent",
    },
    {
      id: "session",
      name: "The next in the same session",
      line: "Next stays inside the session until its decisions are done.",
      cost: "A long-waiting decision in another session waits behind them.",
      builds: "Next reads the session's own decisions first.",
      value: "session",
    },
  ],
};

const fold: Question = {
  id: "fold",
  question:
    "A session with only one decision waiting: its own heading, or one row?",
  recommends:
    "Recommended: Folded. Most sessions hold one decision, so a heading over each spends a line on nearly every one.",
  sets: "fold",
  size: "phone",
  answers: [
    {
      id: "a",
      name: "Heading",
      line: "Every session looks the same, whatever it holds.",
      cost: "A line of heading over each single row; the list runs longer.",
      builds: "Nothing new: every session keeps its heading.",
      today: true,
      value: "heading",
    },
    {
      id: "b",
      name: "Folded",
      line: "The question you answer leads; the session's name moves to the line under it, and the list is shorter.",
      cost: "Sessions show in two shapes, heading or row.",
      builds: "A folded row for a session with one decision.",
      recommended: true,
      value: "folded",
    },
  ],
};

const machine: Question = {
  id: "machine",
  question: "Name the machine under every session, or only when it's news?",
  recommends:
    "Recommended: Only when it's news. Most of your work runs on obelisk-of-light, so its name would repeat under nearly every session.",
  sets: "machine",
  size: "phone",
  answers: [
    {
      id: "a",
      name: "Every session",
      line: "Where each session runs is always in view.",
      cost: "The same machine name repeats down the list.",
      builds: "Nothing new: every session names its machine.",
      today: true,
      value: "every",
    },
    {
      id: "b",
      name: "Only when it's news",
      line: "A machine is named only when it's offline or isn't the one most work runs on.",
      cost: "To see a session's usual machine you open it.",
      builds: "The list reads which machine most work runs on.",
      recommended: true,
      value: "news",
    },
  ],
};

const deck: Question = {
  id: "deck",
  question:
    "Keep Deck, the layout grouped by blocks work / work goes on, as a second layout?",
  recommends:
    "Recommended: Retire Deck. Each row's pause mark already says whether it blocks work, and the phone already answers one decision at a time.",
  sets: "layouts",
  size: "desk",
  waiting: ["Wire the desk's decisions list"],
  answers: [
    {
      id: "retire",
      name: "Retire Deck",
      line: "One layout to build and keep up.",
      cost: "No view grouped by blocks work / work goes on; the pause mark on each row carries it.",
      builds: "Deck and its switch go.",
      recommended: true,
      value: "one",
    },
    {
      id: "keep",
      name: "Keep Deck",
      line: "You can switch to a view grouped by kind.",
      cost: "Two layouts of the same list to build, keep in step and choose between.",
      builds: "Nothing new: Deck stays beside By work.",
      today: true,
      value: "two",
    },
  ],
};

const order: Question = {
  id: "order",
  question: "Which decision stands first in the list?",
  recommends:
    "Recommended: Longest waiting first. Work behind a decision stays stopped until it is answered.",
  sets: "order",
  size: "phone",
  settled: {
    by: "common practice",
    answer: "longest",
    why: "The list follows Caw's panel, which puts what needs you first, longest wait first.",
    sources: ["DESIGN.md, Caw's panel"],
  },
  answers: [
    {
      id: "longest",
      name: "Longest waiting first",
      line: "The decision that has held work up longest is at the top.",
      cost: "A question that just came in sits under older ones.",
      builds: "Nothing new: the list sorts by wait.",
      recommended: true,
      today: true,
      value: "longest",
    },
    {
      id: "newest",
      name: "Newest first",
      line: "A question that just came in is at the top.",
      cost: "A decision that has held work up for hours sinks.",
      builds: "The list sorts by when each was asked.",
      value: "newest",
    },
  ],
};

/** The request as the owner first meets it. */
export const REQUEST: Request = {
  title: "How decisions reach you",
  situation:
    "The fleet's decisions are moving into one list, grouped by the session that asked. Four things about how it reads are open, and the list waits on them before it is wired.",
  asker: {
    name: "Run the ready CawCo tasks",
    doing: "building the Needs you list",
    machine: "obelisk-of-light",
  },
  waiting: [
    "Draw the phone's decisions list",
    "Wire the desk's decisions list",
  ],
  restsOn: "By work, the layout you picked on Oct 28",
  questions: [shape, next, fold, machine, deck, order],
};

/** The question round two adds once the list is drawn with his picks. */
const answered: Question = {
  id: "answered",
  question: "When you answer from the list, does the row leave at once?",
  recommends:
    "Recommended: Stays with Undo. A pick made by a slip on a phone is taken back where it was made.",
  sets: "answered",
  size: "phone",
  fresh: true,
  answers: [
    {
      id: "leave",
      name: "Leaves at once",
      line: "An answered row goes, and the list closes up under it.",
      cost: "A wrong pick is taken back from the decision's own page.",
      builds: "Nothing new: an answered row leaves.",
      today: true,
      value: "leave",
    },
    {
      id: "undo",
      name: "Stays with Undo",
      line: "An answered row stays struck through with Undo until you leave the list.",
      cost: "The list holds answered rows until you leave it.",
      builds: "A struck row with Undo.",
      recommended: true,
      value: "undo",
    },
  ],
};

/** The agent's reply under a note he sent, in its own thread. */
export const REPLY =
  "Read. I've redrawn the list with this in mind; the rest of your picks stand.";

/**
 * Round two: what the agent sends back once it has read his Send. The
 * machine question is reworded, Deck leaves the open set once it is
 * built as he picked, and a question his picks unlocked is asked.
 */
export function roundTwo(sent: Record<string, string[]>): Question[] {
  const built = takenOff(sent).length > 0;
  const reworded: Question = {
    ...machine,
    question:
      "Under a session, name its machine every time, or only when it's news?",
    changed: "Reworded since you sent",
  };
  return [
    shape,
    next,
    fold,
    reworded,
    ...(built ? [] : [deck]),
    order,
    answered,
  ];
}

/** Whether a question is taken off in round two (built as he picked). */
export const takenOff = (sent: Record<string, string[]>): string[] =>
  Object.entries(sent).some(([id, picks]) => id === "deck" && picks.length > 0)
    ? ["deck"]
    : [];
