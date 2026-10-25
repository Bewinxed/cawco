/**
 * Every option of every pick the owner makes as a frame the preview draws,
 * with the widths it shows at and one plain caption per width saying what
 * he is looking at. The proof (scripts/probe-kit/specs/project-options-preview.ts)
 * reads each at each width; capture/shots.ts captures each for the decision
 * page (captures/, manifest.json).
 *
 * A pick is drawn only at the widths where its options differ: the desk's
 * picks (the fold's step 2, D, the pane's placement, S) on the desk, P on
 * the phone. D's two options are one picture at his 1037 window, so D is
 * drawn there once. The pane and Caw's column stand under the page bar
 * (placement B) in every pick but the placement's own, so each pick reads
 * on its own (see `SIDE`); at his 1037 window a pane leaves the board its
 * phone form beside it (the window pick's recommendation).
 */
export type Width = "1440" | "1037" | "390";

export interface OptionView {
  caption: Partial<Record<Width, string>>;
  choice: Record<string, string>;
  option: string;
  part: string;
  widths: Width[];
}

const DESK: Width[] = ["1440", "1037"];
const ALL: Width[] = ["1440", "1037", "390"];
/** What a frame draws where its hash says nothing: frame.js's DEFAULTS, read by shots.ts to tell two picks' identical frames apart from their choices. */
export const FRAME_DEFAULTS: Record<string, string> = {
  today: "0",
  state: "rest",
  open: "none",
  view: "Board",
  H: "H1",
  fold: "A",
  D: "D2",
  P: "P1",
  T: "folded",
  C: "C1",
  K: "review",
  jump: "id",
  place: "B",
  narrow: "beside",
  F: "F1",
  S: "S2",
  seat: "idle",
  ask: "a",
};

/** The pane and column placement the other picks are drawn in: B, the recommendation. */
const SIDE = { place: "B" };

export const OPTION_VIEWS: OptionView[] = [
  {
    part: "H",
    option: "H1",
    widths: DESK,
    choice: { H: "H1" },
    caption: {
      1440: "H1: one bar. Title and machine on the left; the six views and the waiting hand centred on the page; New task, Filter, More and the coral Ask Caw on the right.",
      1037: "H1 at your window: the six views fold into a Board ▾ pill beside the hand, and the bar folds further to fit (fold order, below).",
    },
  },
  {
    part: "H",
    option: "H2′",
    widths: DESK,
    choice: { H: "H2" },
    caption: {
      1440: "H2′: the same bar without the views; the six views stand alone on a bare row under it, no fill and no buttons on that row.",
      1037: "H2′ at your window: all six view names stay visible on their row.",
    },
  },
  {
    part: "Fold",
    option: "A",
    widths: ["1037"],
    choice: { fold: "A" },
    caption: {
      1037: "Fold step 2, A: at your window the machine's name folds first (its mark and +50 stay), then New task and Filter go into More.",
    },
  },
  {
    part: "Fold",
    option: "B",
    widths: ["1037"],
    choice: { fold: "B" },
    caption: {
      1037: "Fold step 2, B: at your window New task and Filter go into More first, and the machine's name stays in the bar.",
    },
  },
  {
    part: "D",
    option: "D1",
    widths: ["1440"],
    choice: { D: "D1" },
    caption: {
      1440: "D1: five 224px columns side by side, no stage strip; every stage whole on screen.",
    },
  },
  {
    part: "D",
    option: "D2",
    widths: ["1440"],
    choice: { D: "D2" },
    caption: {
      1440: "D2: the stage strip with every count over 300px columns that scroll sideways; Done is cut at the edge, Dropped past it.",
    },
  },
  {
    part: "D",
    option: "D1 or D2",
    widths: ["1037"],
    choice: { D: "D2" },
    caption: {
      1037: "D at your window: both options are this picture, the strip over 300px columns, because five columns don't fit in 809px.",
    },
  },
  {
    part: "P",
    option: "P1",
    widths: ["390"],
    choice: { P: "P1", w: "390" },
    caption: {
      390: "P1: the stage strip over one stage's cards. Its cost: one stage at a time, so a stage with one card is one card and an empty screen.",
    },
  },
  {
    part: "P",
    option: "P2",
    widths: ["390"],
    choice: { P: "P2", w: "390" },
    caption: {
      390: "P2: one grouped list, Ready open, the other heads pinned above the foot bar.",
    },
  },
  {
    part: "T1",
    option: "Folded",
    widths: ALL,
    choice: { view: "Table", T: "folded" },
    caption: {
      1440: "The Table with Done and Dropped folded: their heads and counts pinned at the foot.",
      1037: "The Table with Done and Dropped folded, at your window.",
      390: "The phone's Table, folded: Ready open, the other heads pinned.",
    },
  },
  {
    part: "T1",
    option: "Open",
    widths: ALL,
    choice: { view: "Table", T: "open" },
    caption: {
      1440: "The Table with every group open, each head sticking as its rows scroll under it: all 63 rows on one scroll.",
      1037: "Every group open, at your window.",
      390: "The phone's Table with every group open.",
    },
  },
  {
    part: "C",
    option: "C1",
    widths: ALL,
    choice: { C: "C1", state: "waits" },
    caption: {
      1440: "C1: tsk-17 asks you in Working (dot, hand, asks), its question on the card; tsk-16 waits in Review. Drawn for the state, the question's words your only recorded ask (Caw's, 16 Oct).",
      1037: "C1 at your window. Drawn for the state.",
      390: "C1 on the phone: it opens on Working, the first stage where something waits. Drawn for the state.",
    },
  },
  {
    part: "C",
    option: "C2",
    widths: ALL,
    choice: { C: "C2", state: "waits" },
    caption: {
      1440: "C2: the same card with the question's own answers as plain peer buttons, to answer it on the board. Drawn for the state (no permission ask is on record).",
      1037: "C2 at your window. Drawn for the state.",
      390: "C2 on the phone. Drawn for the state.",
    },
  },
  {
    part: "K",
    option: "K1-top",
    widths: ALL,
    choice: { K: "top", state: "waits", open: "pane", ...SIDE },
    caption: {
      1440: "The task pane opened at its title: tsk-16's title, the jump strip, then its description first; Send back and Approve docked at the foot.",
      1037: "The pane opened at its title, at your window.",
      390: "The pane as its own page on the phone, opened at its title.",
    },
  },
  {
    part: "K",
    option: "K1-review",
    widths: ALL,
    choice: { K: "review", state: "waits", open: "pane", ...SIDE },
    caption: {
      1440: "The pane opened on its Result: the jump strip stuck under the bar, the Result head under it, the docked verdict; the bar keeps the stage control and no title.",
      1037: "The pane opened on its Result, at your window.",
      390: "The phone's pane opened on its Result.",
    },
  },
  {
    part: "Jump strip",
    option: "With the id",
    widths: ALL,
    choice: { jump: "id", K: "review", state: "waits", open: "pane", ...SIDE },
    caption: {
      1440: "The stuck jump strip leads with tsk-16 in mono, so the scrolled pane still says which task it is.",
      1037: "The strip with the id, at your window.",
      390: "The strip with the id, on the phone.",
    },
  },
  {
    part: "Jump strip",
    option: "No id",
    widths: ALL,
    choice: { jump: "bare", K: "review", state: "waits", open: "pane", ...SIDE },
    caption: {
      1440: "The stuck jump strip with the sections only; the id stays in the line under the title.",
      1037: "The strip without the id, at your window.",
      390: "The strip without the id, on the phone.",
    },
  },
  {
    part: "Pane placement",
    option: "B",
    widths: ["1440"],
    choice: { place: "B", K: "review", state: "waits", open: "pane" },
    caption: {
      1440: "B (recommended): the pane under the page bar, which never moves or folds; Ask Caw is his face alone while the pane holds the coral Approve; the Shell's group stays at the bar's end.",
    },
  },
  {
    part: "Pane placement",
    option: "A",
    widths: DESK,
    choice: { place: "A", K: "review", state: "waits", open: "pane" },
    caption: {
      1440: "A: the pane runs the window's full height, its bar on the page bar's line; the page bar folds into the page's column and the Shell's group stands at the window's edge over the pane's end.",
      1037: "A at your window: the page column is phone width, so it takes its phone form whole, title and More on top and a second foot dock under the board, beside the pane's Send back and Approve.",
    },
  },
  {
    part: "Window with a pane",
    option: "(i) Board beside",
    widths: ["1037"],
    choice: { narrow: "beside", K: "review", state: "waits", open: "pane", place: "B" },
    caption: {
      1037: "(i) Recommended: at your window the board beside the pane takes its phone form, every stage and count over the stage you came from; no foot dock, the page bar above is whole.",
    },
  },
  {
    part: "Window with a pane",
    option: "(ii) Pane takes the page",
    widths: ["1037"],
    choice: { narrow: "page", K: "review", state: "waits", open: "pane", place: "B" },
    caption: {
      1037: "(ii) At your window the task opens in the board's place with Back, full width; the board and its counts wait until you go back.",
    },
  },
  {
    part: "F",
    option: "F1",
    widths: ALL,
    choice: { F: "F1", state: "stale" },
    caption: {
      1440: "F1: a red alert row under the bar: the hub didn't answer, a ring emptying to the next try with its seconds, as of when, Retry now; the board behind dimmed as stale. Drawn for the state.",
      1037: "F1 at your window. Drawn for the state.",
      390: "F1 on the phone, the row wrapping over the dimmed board. Drawn for the state.",
    },
  },
  {
    part: "F",
    option: "F2",
    widths: ALL,
    choice: { F: "F2", state: "stale" },
    caption: {
      1440: "F2: a hollow red ring and 'stale' on the machine control, its popover open with the same alert; the board behind dimmed. Drawn for the state.",
      1037: "F2 at your window. Drawn for the state.",
      390: "F2 on the phone: the mark beside the title, its popover under the bar. Drawn for the state.",
    },
  },
  {
    part: "S",
    option: "S1",
    widths: DESK,
    choice: { S: "S1", open: "caw", ...SIDE },
    caption: {
      1440: "S1: Caw's column, Caw at the top on its axis, his line, then your six board starters stacked as sentences; Ask Caw wears the selected wash and Send is the one coral.",
      1037: "S1 at your window.",
    },
  },
  {
    part: "S",
    option: "S2",
    widths: DESK,
    choice: { S: "S2", open: "caw", ...SIDE },
    caption: {
      1440: "S2: Caw at the top, his line, and your six starters as chips sitting on the composer.",
      1037: "S2 at your window. On the phone the sheet draws this whichever you pick.",
    },
  },
  {
    part: "Caw's seat",
    option: "Idle",
    widths: ["1440", "390"],
    choice: { seat: "idle" },
    caption: {
      1440: "Ask Caw at rest: Caw's face as its glyph.",
      390: "Ask Caw at rest, in the phone's foot bar.",
    },
  },
  {
    part: "Caw's seat",
    option: "Working",
    widths: ["1440", "390"],
    choice: { seat: "working" },
    caption: {
      1440: "Caw working: his reading pose with the blue live dot. Drawn for the state.",
      390: "Caw working, in the phone's foot bar. Drawn for the state.",
    },
  },
  {
    part: "Caw asking",
    option: "(a)",
    widths: ["1440", "390"],
    choice: { seat: "asking", ask: "a" },
    caption: {
      1440: "Caw asking, take (a): the raised wing, with the needs-you dot. Drawn for the state.",
      390: "Caw asking (a), in the phone's foot bar. Drawn for the state.",
    },
  },
  {
    part: "Caw asking",
    option: "(b)",
    widths: ["1440", "390"],
    choice: { seat: "asking", ask: "b" },
    caption: {
      1440: "Caw asking, take (b): only the head tilt and wider eyes, the needs-you dot doing the asking. Drawn for the state.",
      390: "Caw asking (b), in the phone's foot bar. Drawn for the state.",
    },
  },
];

/** Today: the live page as captured, once per width. */
export const TODAY_WIDTHS: Width[] = ALL;

export const TODAY_CAPTION: Record<Width, string> = {
  1440: "Today at 1440: the view strip over a two-row head with the path, five columns with kind words under each name.",
  1037: "Today at your window: the strip cut at Dec…, the head's two rows, three columns in view.",
  390: "Today on the phone: Ready's cards in full and the other stages a sliver at the right edge.",
};
