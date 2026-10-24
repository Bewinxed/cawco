/*
 * The critiques the owner reads beside each option: interface-craft's Design
 * Critique, impeccable's critique (Nielsen's ten, scored 0–4) and a Family
 * Values check (benji.org/family-values: simplicity, fluidity, delight).
 * “fixed” marks what was wrong in these drawings and is mended here; the rest
 * is the option's own cost, left standing for him to weigh.
 */
export const CRITIQUE = {
  A: {
    craft: [
      {
        text: "Strength: the first view is one Name field and one text area; nothing to learn before writing.",
        fixed: true,
      },
      {
        text: "Structural: a line the reader misses vanishes from the shape. Line 6 is marked in the text, but the shape shows five nodes and no sign of a sixth thing the orchestrator will still be told.",
        fixed: false,
      },
      {
        text: "The run lights the derived shape, but the question sits under the picture, a node away from the node that asks it; only the node’s edge links them.",
        fixed: false,
      },
      {
        text: "Was: the unread line wore the spark yellow of Needs you, the one colour that asks for a person. Now a recessed line with a dotted underline and “Goes as prose”.",
        fixed: true,
      },
    ],
    impeccable: [
      {
        text: "Heuristics 24/40: status 3, real-world match 3, control 2, consistency 3, error prevention 1, recognition 2, efficiency 3, minimalism 3, recovery 2, help 2.",
        fixed: false,
      },
      {
        text: "P1 error prevention: the grammar fails silently. “If I say beta” parses; “when it’s beta” does not, and the shape only drops a branch.",
        fixed: false,
      },
      {
        text: "P2 recognition over recall: (writer), “with 1”, Post, Ask me and If are words he must remember; on a phone he types them.",
        fixed: false,
      },
      {
        text: "Detector: cream palette flagged on the page ground (false positive: DESIGN.md’s warm paper, a locked token).",
        fixed: true,
      },
    ],
    family: [
      {
        text: "Simplicity: the strongest first view of the four; complexity hides in the grammar rather than being revealed when needed.",
        fixed: false,
      },
      {
        text: "Fluidity: nodes that stay slide to their new place and only changed steps arrive, so the shape never redraws whole (Shape redraw).",
        fixed: true,
      },
      {
        text: "Delight: the picture assembling as he writes is the rare moment, creating, given the emphasis.",
        fixed: true,
      },
    ],
  },
  B: {
    craft: [
      {
        text: "Strength: the editor and the run are one picture. The same five rows go from planned glyphs to lit ones; run 12 needs nothing new to learn.",
        fixed: true,
      },
      {
        text: "Create carries 19 buttons on the desk: the hand-built rows and Caw’s five-row draft stand side by side. Once he asks Caw, the draft could fill the rows in place instead of standing beside them.",
        fixed: false,
      },
      {
        text: "Parallel steps read only as “after 1, 2” chips; the Shape toggle is the one place they are drawn side by side.",
        fixed: false,
      },
      {
        text: "Was: column heads at 12px, under the 13px column-head role. Now 13px caps, with Runs, Steps and Checks columns widened so every head fits.",
        fixed: true,
      },
    ],
    impeccable: [
      {
        text: "Heuristics 31/40: status 4, real-world match 3, control 3, consistency 4, error prevention 3, recognition 4, efficiency 3, minimalism 3, recovery 2, help 2.",
        fixed: false,
      },
      {
        text: "P2 recovery: run 10 failed at the smoke test, but its Retry from the failed step is not drawn in these screens.",
        fixed: false,
      },
      {
        text: "P2 error prevention done well: a Call whose arguments a step fills shows its exact call at Start run before it is approved.",
        fixed: true,
      },
      {
        text: "P3: the Shape view is read-only; editing stays in rows.",
        fixed: false,
      },
    ],
    family: [
      {
        text: "Simplicity: a row shows its title, kind, who and after; its fields unfold only when it is opened (the Call row).",
        fixed: true,
      },
      {
        text: "Fluidity: the asking row unfolds its question under itself and folds back; a new step uncovers while what follows makes room.",
        fixed: true,
      },
      {
        text: "Fluidity, open: Ledger → Shape is a cross-fade. Each row travelling into its node would keep one object across the switch.",
        fixed: false,
      },
      {
        text: "Delight: keeping Caw’s draft row by row turns the rare create into a short conversation.",
        fixed: true,
      },
    ],
  },
  C: {
    craft: [
      {
        text: "Structural: the phone cannot edit a canvas, so it is drawn read-only and falls back to B’s step list: two editors to keep in step.",
        fixed: false,
      },
      {
        text: "At 1440 six nodes sit in a dotted field taking most of the pane; the inspector carries the real work in a 272px column.",
        fixed: false,
      },
      {
        text: "Was: the phone inspector’s heading fell to the browser’s default bold (700), past the 500 ceiling. Now the label role.",
        fixed: true,
      },
      {
        text: "Was: the pinned check wore the done status pair at 10 of 11. Now a neutral tag; status colour stays for status.",
        fixed: true,
      },
    ],
    impeccable: [
      {
        text: "Heuristics 23/40: status 3, real-world match 2, control 3, consistency 2, error prevention 2, recognition 3, efficiency 2, minimalism 2, recovery 2, help 2.",
        fixed: false,
      },
      {
        text: "P1 match: a run is a tree of delegates; the canvas is a free graph, so “the orchestrator decides” is a dashed line that says less than a sentence.",
        fixed: false,
      },
      {
        text: "P2 consistency: draft and published, plus the routine’s and the run’s versions, are a third state to track.",
        fixed: false,
      },
    ],
    family: [
      {
        text: "Simplicity: the weakest. Tray, canvas, inspector and versions are all on screen at once.",
        fixed: false,
      },
      {
        text: "Fluidity: a node joining slides its neighbour aside and draws its edge; the canvas persists from edit to run.",
        fixed: true,
      },
      {
        text: "Delight: dragging nodes and wiring edges is work at the rare moment, not reward.",
        fixed: false,
      },
    ],
  },
  D: {
    craft: [
      {
        text: "Structural: there is no blank editor, so “design” only ever means pruning what already ran.",
        fixed: false,
      },
      {
        text: "Strength: Keep as workflow moves the finished tree into the ledger, where it becomes the row; nothing appears from nowhere.",
        fixed: true,
      },
      {
        text: "Was: the step the orchestrator added was coral, the action colour, drawn as a state. Now its glyph and words say it, with Keep as the action.",
        fixed: true,
      },
    ],
    impeccable: [
      {
        text: "Heuristics 30/40: status 4, real-world match 4, control 3, consistency 3, error prevention 3, recognition 4, efficiency 1, minimalism 3, recovery 3, help 2.",
        fixed: false,
      },
      {
        text: "P1 efficiency: a step that never ran cannot be added without running it once and keeping that run.",
        fixed: false,
      },
      {
        text: "P3: Caw proposing Keep after the same titles are delegated twice is described, not drawn.",
        fixed: false,
      },
    ],
    family: [
      {
        text: "Simplicity: nothing to learn; a workflow is something he already did.",
        fixed: true,
      },
      {
        text: "Fluidity: the strongest moment of the four, the tree travelling into its row (Keep as workflow); removal folds a row to its struck title with Undo.",
        fixed: true,
      },
      {
        text: "Delight: turning work that went well into a workflow is rare and rewarded by that flight.",
        fixed: true,
      },
    ],
  },
};
