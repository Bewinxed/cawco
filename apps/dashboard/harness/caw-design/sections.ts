/**
 * What the page holds, in this order and nothing else: the decisions still
 * open, each a plain question with its options side by side; the one he
 * has decided, shown as decided; then what was fixed from his pins, each
 * fix once, labelled with his own words.
 *
 * Each decision changes one part of the panel; every other part of every
 * frame is drawn as recommended (the advisor's pick, filed tasks as rows).
 */
export interface Option {
  id: string;
  name: string;
  /** The advisor's pick: first in its row, marked Recommended. */
  recommended?: boolean;
}

export interface Decision {
  /** What differs between the options, in one line. */
  differs: string;
  id: string;
  options: Option[];
  /** Drawn in the phone's form whatever the page's switch says. */
  phoneOnly?: boolean;
  question: string;
}

export const DECISIONS: Decision[] = [
  {
    id: "head",
    question: "What does the panel's head say?",
    differs:
      "Whose panel it is and which thread, with the thread's name as the switcher, or Caw's name alone with the thread as the first row of the conversation. On a phone the sheet adds its grabber and Close, Close at the trailing edge.",
    options: [
      {
        id: "who-and-which",
        name: "Caw, and the thread under him",
        recommended: true,
      },
      { id: "name-only", name: "Caw alone, the thread in the body" },
    ],
  },
  {
    id: "notices",
    question: "How does the panel say what's stopping Caw?",
    differs:
      "The app's alert row with Caw beside the words, tinted by how bad it is, or Caw saying it in the conversation. Each shows a thread that can't be read and Caw unable to start.",
    options: [
      { id: "alert-row", name: "An alert row with Caw", recommended: true },
      { id: "caw-says", name: "Caw says it" },
    ],
  },
  {
    id: "suggestions",
    question: "How do the things to ask Caw stand on an empty thread?",
    differs:
      "Chips as wide as their words, wrapping above the message box, or a list of rows.",
    options: [
      { id: "chips", name: "Chips sized to their words", recommended: true },
      { id: "rows", name: "A list of rows" },
    ],
  },
  {
    id: "composer",
    question: "Where does the message box stand?",
    differs:
      "As the panel's last row, the conversation ending at it, or floating over the conversation as it scrolls under the glass. Both are scrolled a little short of the end.",
    options: [
      { id: "foot", name: "The panel's last row", recommended: true },
      { id: "overlay", name: "Floating over the conversation" },
    ],
  },
  {
    id: "phone-frame",
    phoneOnly: true,
    question: "On a phone, where does Caw's panel come from?",
    differs:
      "A sheet up from the screen's foot, as every other decision here draws it, or hanging from his tab under the top bar, as DESIGN.md has it now. Phone only: on a desk it hangs from his glass either way.",
    options: [
      { id: "sheet", name: "A sheet from the foot" },
      { id: "hang", name: "Hanging from his tab" },
    ],
  },
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
    id: "resize",
    question: "How do you make Caw's panel bigger on a desk?",
    differs:
      "A grip in the corner, a Wide panel switch in the head's … menu, or handles on its edges. On a phone the panel doesn't resize.",
    options: [
      { id: "today", name: "Today" },
      { id: "corner-grip", name: "A corner grip" },
      { id: "wide-in-menu", name: "Wide panel, in the … menu" },
      { id: "edge-handles", name: "Edge handles" },
    ],
  },
];

/**
 * Decided: the empty board as main draws it now (the project page's empty
 * board, `data-slot="caw-empty"`), with what it does in one line.
 */
export const DECIDED = {
  question: "Where do Caw's suggestions stand on an empty board?",
  now: "Caw stands on the empty board in place of his seat in the head, the line on what he does over his suggestions, which stand under him as cards from the board's start edge. A card opens his panel with its words in the message box.",
};

export interface Fix {
  /** What now stands where he pinned, in one line. */
  changed: string;
  /** His words, verbatim, one per pin it answers. */
  said: string[];
}

export const FIXES: Fix[] = [
  {
    said: [
      "this whole title bar needs to be rethought /useless-copy",
      "i haven't seen ayone design a modal like this before, are you just riffing without following HIG or established patterns?",
      "what is this title bar spposed to be, is this phone view? desktop view? i'm confused",
      "i sitll don't understand what is this headless titlebar supposed to be",
    ],
    changed:
      "The head is the panel's toolbar: Caw's mark and name, the thread you're in, and what you can do to the panel. No status words. On a phone, Close stands at the trailing edge, as DESIGN.md's sheet has it. See the first decision.",
  },
  {
    said: [
      "what the fuck is this centered text? are u building bullshit with sonnet?",
      "centering everything alignment is terrible practice",
      "stop centering bullshit, use proper layout",
      "Jesus I didn't say center the whole block! No sane ui developer does this",
      "why are you left-aligning caw",
      "this notice white rectangle isn't the used pattern here in this app nor is it the design pattern of leading apps (check mobbin)",
      "why isn't this blocking issue FRONT AND CENTER with a caw, and a way for the user to bypass or recover or see more details? THINK",
    ],
    changed:
      "What stops Caw is the app's own alert row, tinted by how bad it is, with Caw beside the words as its mark, not above them; the fix is its first button and the real error one press away. It stands where you were about to act. See the second decision.",
  },
  {
    said: [
      "the composer is obscuring the page, also each suggestion is a screen-wide card even though it takes up 20% of it sspace, and its as wide as the screen, lazy iplementation",
      "these have no silhoette, what the fuck are you doing? confusing ui",
    ],
    changed:
      "Each suggestion is a chip as wide as its own words, and the message box is the panel's last row, so the conversation ends at it. See the third and fourth decisions.",
  },
  {
    said: ["wtf is this gradient?", "why is this all the way to the left"],
    changed:
      "The message box has no glass where nothing passes under it, and the conversation, the chips and the box share the panel's start edge.",
  },
  {
    said: ["wrong pose"],
    changed:
      "When the thread can't be read or Caw can't start, he shows he needs you.",
  },
  {
    said: ["this page is completely broken, the composer is over everything"],
    changed:
      "Nothing stands under the message box unless you pick the floating one, where the conversation scrolls under it on purpose.",
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
      "Each filed task's title is the strongest line under the reply, with its id in link colour, underlined under the pointer.",
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
      "The white alert where the message box was is gone; the second decision replaces it.",
  },
  {
    said: ["wtf is this suppsoed to be?"],
    changed:
      "That bench is gone; the empty board is the decision you made above.",
  },
];
