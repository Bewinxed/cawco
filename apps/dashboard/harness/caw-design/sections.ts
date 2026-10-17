/**
 * What the page holds, in this order and nothing else: the decisions still
 * open, each a plain question with its options side by side; the one he
 * has decided, shown as decided; then what was fixed from his pins, each
 * fix once, labelled with his own words.
 */
export interface Option {
  id: string;
  name: string;
}

export interface Decision {
  /** What differs between the options, in one line. */
  differs: string;
  id: string;
  options: Option[];
  question: string;
}

export const DECISIONS: Decision[] = [
  {
    id: "filed-tasks",
    question: "How should the tasks Caw files show under his reply?",
    differs:
      "Each a raised card, or one plain list. Either way each task opens itself; nothing leads to the board.",
    options: [
      { id: "today", name: "Today" },
      { id: "cards", name: "Cards" },
      { id: "rows", name: "Rows" },
    ],
  },
  {
    id: "read-failed",
    question: "When a thread can't be read, what leads the message?",
    differs:
      "Caw, with a way to ask him to look into it, or a history glyph.",
    options: [
      { id: "today", name: "Today" },
      { id: "caw", name: "Caw, and Ask Caw to look" },
      { id: "glyph", name: "A history glyph" },
    ],
  },
  {
    id: "cannot-start",
    question: "When Caw can't start, can you still write to him?",
    differs:
      "The message box gives way to why he can't start, or stays and your words wait for a machine.",
    options: [
      { id: "today", name: "Today" },
      { id: "box-gives-way", name: "The message box gives way" },
      { id: "box-stays", name: "Your words still go in" },
    ],
  },
  {
    id: "resize",
    question: "How do you make Caw's panel bigger on a desk?",
    differs:
      "A grip in the corner, a Wide panel switch in the bar's … menu, or handles on its edges. On a phone the panel is a sheet and doesn't resize.",
    options: [
      { id: "today", name: "Today" },
      { id: "corner-grip", name: "A corner grip" },
      { id: "wide-in-menu", name: "Wide panel, in the … menu" },
      { id: "edge-handles", name: "Edge handles" },
    ],
  },
];

/** Decided: shown with his pick, the others still there to change it. */
export const DECIDED: Decision & { picked: string } = {
  id: "empty-board",
  question: "Where do Caw's suggestions stand on an empty board?",
  differs: "",
  options: [
    { id: "today", name: "Today" },
    { id: "offers-in-backlog", name: "Waiting in Backlog" },
    { id: "centred", name: "Centred on the board" },
  ],
  picked: "centred",
};

export interface Fix {
  /** What now stands where he pinned, in one line. */
  changed: string;
  /** The state drawn for it; none where a decision above already shows it. */
  shows?: "suggestions" | "title-bar" | "off" | "why-cannot-start";
  /** His words, verbatim, one per pin it answers. */
  said: string[];
}

export const FIXES: Fix[] = [
  {
    said: [
      "what the fuck is this centered text? are u building bullshit with sonnet?",
      "centering everything alignment is terrible practice",
      "stop centering bullshit, use proper layout",
      "wrong pose",
    ],
    changed:
      "Caw, what happened, why, the way out and the details stand on one start edge, and Caw shows he needs you. The shared empty state does this across the app.",
    shows: "why-cannot-start",
  },
  {
    said: [
      "these have no silhoette, what the fuck are you doing? confusing ui",
      "/useless-copy, the subtitle is the same weight and no way to understand what's going on, is this just a text or am i supposed to read sth here?",
    ],
    changed:
      "Each suggestion is a raised tile you press: the sentence strong, why it's offered under it, smaller and lighter.",
    shows: "suggestions",
  },
  {
    said: [
      "this whole title bar needs to be rethought /useless-copy",
      "i haven't seen ayone design a modal like this before, are you just riffing without following HIG or established patterns?",
    ],
    changed:
      "On a desk it's a popover bar: the thread's name, New thread and More; a press outside closes it, so it has no Close. On a phone it's a sheet: grabber, Close leading, the name centred.",
    shows: "title-bar",
  },
  {
    said: ["wtf is this gradient?", "why is this all the way to the left"],
    changed:
      "The message box has its own place at the panel's foot, so nothing shows through it, and the line stands on the same edge as Caw, the suggestions and the box.",
    shows: "off",
  },
  {
    said: ["wrong pose"],
    changed:
      "When the thread can't be read, Caw shows he needs you (the decision above).",
  },
  {
    said: ["this page is completely broken, the composer is over everything"],
    changed:
      "Every panel keeps the message box's place clear, as the real panel does.",
  },
  {
    said: ["these look terrible on wide screen"],
    changed:
      "Each panel stays its real 380px wide at any screen width; wide screens fit more of them on a row.",
  },
  {
    said: [
      "i don't understand what the fuck am i supposed to look at, rethink your structure",
    ],
    changed: "This page: the open decisions, then these fixes. Nothing else.",
  },
  {
    said: ["no typographic weight to indicate this does anything"],
    changed:
      "Each filed task's title is the strongest line under the reply, with its id in link colour, underlined under the pointer (the decision above).",
  },
  {
    said: [
      "didn't u hear what i said before about this button? wtf is it doing here?",
    ],
    changed:
      "Open the board is gone from both proposals: each task opens itself. Only Today still has it.",
  },
  {
    said: ["wtf is this"],
    changed:
      "The alert where the message box was is replaced by Caw and why he can't start (the decision above). Only Today still has it.",
  },
  {
    said: ["wtf is this suppsoed to be?"],
    changed:
      "That bench is gone; the empty board is the decision you made above.",
  },
];
