/*
 * The critiques of these screens, run on the drawings themselves (their
 * source and the engine's reads of them: boxes, columns, counts):
 * interface-craft's Design Critique, impeccable's critique and Family Values.
 * `fixed`: mended in these drawings (it says what it was); `good`: works as
 * drawn, and why; `open`: a trade-off left for the owner to weigh.
 */
export const CRITIQUE = [
  {
    title: "Design Critique (interface-craft)",
    icon: "eye",
    items: [
      {
        mark: "good",
        text: "Focus: the eye lands on Open, the one group with a yellow glyph, and on the one strong word in it, “Not sent”. Under it 15 Sent rows read as one quiet block, so the two pages that wait are found without reading the rest.",
      },
      {
        mark: "good",
        text: "No word repeats for nothing: the writer (the same session on 23 of 25 pages) and the state pill are gone from the rows; the group head says the state once and each row says only what differs.",
      },
      {
        mark: "fixed",
        text: "Was: Closed's “Show closed” stood in the age column, so that column was 105px on every row and a phone's titles had 184px. It stands beside the head's title now: the column is the age or the act (82px on the desk, 24px on the phone) and phone titles have 265px.",
      },
      {
        mark: "fixed",
        text: "Was: the all-done line started 7px inside the titles' edge. It starts on it, as every title, card line and “Show 9 more sent” does.",
      },
      {
        mark: "good",
        text: "Desk facts stand in one column across every group, so “read”, “working on it” and “not read yet” scan top to bottom like a departure board; the hover fill runs the whole row, tying title to fact across the gap between them.",
      },
      {
        mark: "open",
        text: "“read” stands on 12 of 15 Sent rows. It is true and quiet, and the two rows that differ carry the news; drawn the other way (only the exceptions said) a blank would claim nothing and read as unknown.",
      },
    ],
  },
  {
    title: "impeccable critique",
    icon: "checks",
    items: [
      {
        mark: "open",
        text: "Degraded: single context (a leaf session has no sub-agent tool). Detector: impeccable detect over the folder gave 2 findings, both house rules read as faults: the warm paper ground (DESIGN.md's surface) and the 16px search field on a phone (The 16px Field Rule).",
      },
      {
        mark: "good",
        text: "Health, Nielsen's ten on these screens: status 3, real world 4, control 3, consistency 4, error prevention 3, recognition 4, flexibility 3, minimalism 3, recovery 3, help 3: 33 of 40, against 19 for today's grid. The 3s are what only a build proves: that the hub's read and working-on-it records are kept.",
      },
      {
        mark: "fixed",
        text: "Was: TaskRing draws its finish check at 7 of 7, so a page fully picked but not sent would wear the done mark. Here a full ring means picked; the done glyph is kept for a decided page whose tasks are all done.",
      },
      {
        mark: "fixed",
        text: "Was: the report's “Search everything” and “Open <title>”. WORDS.md's button verbs make them “Open Find” and “Open the new page” (“Open Open CawCo at cawco” read twice).",
      },
      {
        mark: "fixed",
        text: "Was: “Open · 0” at all done. A count of none says nothing (The Earned Count Rule): the head stands alone over “Nothing waits on you. Agents have 17 pages; 2 are decided.”, and the badge is gone, not 0.",
      },
      {
        mark: "good",
        text: "Cognitive load: one decision point on the list (which row), the Open group never folds, and no control past the field and a fold toggle is visible until a row is pointed at.",
      },
    ],
  },
  {
    title: "Family Values",
    icon: "stars",
    items: [
      {
        mark: "good",
        text: "Simplicity, “everything else would appear as it became most relevant”: Open stands open, Sent folds past six, Closed is folded, and a row's one act shows on hover or focus only.",
      },
      {
        mark: "good",
        text: "Fluidity, “if a component … will persist in the next phase … it should remain consistent”: a sent row travels to Sent rather than vanishing, a search keeps its survivors and slides them, and a page's title flies from its row into the page's head.",
      },
      {
        mark: "good",
        text: "Delight, where frequency is low: one moment, the last task of a decided page landing (its ring closes into the done glyph). Nothing else moves for its own sake.",
      },
      {
        mark: "fixed",
        text: "Was: a 1.2s pulse on the working dot (the report). Every live dot breathes on the house breath (2s), on one clock, so this one does too.",
      },
    ],
  },
];
