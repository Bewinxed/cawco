/**
 * One plan for all three variants: a session's real CawCo task (drawing a
 * step's wait in the plan), 12 steps written as `todo_write` writes them,
 * flat with a depth, as the hub keeps them (core plan.ts `PlanStep`). Four
 * done, one under way, one waiting on a pick (its `waitsOn`: the decision
 * page and its card, PRD §5.2:243-244), six to do, one of those with two
 * sub-steps.
 */
import type { StepNode } from "./StepTree.svelte";

interface Row {
  content: string;
  depth: number;
  id: string;
  status: StepNode["status"];
  waitsOn?: { card: string; href: string };
}

/** The decision card step 7 waits on. */
export const CARD = {
  title: "When the plan opens over the conversation, what comes first?",
  href: "#card-plan-first",
};

export const ROWS: Row[] = [
  {
    id: "s1",
    depth: 0,
    status: "completed",
    content:
      "Read how a step's wait is kept (PlanStep.waitsOn in core plan.ts)",
  },
  {
    id: "s2",
    depth: 0,
    status: "completed",
    content: "Trace where the hub sets a wait when a pick page opens",
  },
  {
    id: "s3",
    depth: 0,
    status: "completed",
    content: "Carry waitsOn through stepsTree into each plan row",
  },
  {
    id: "s4",
    depth: 0,
    status: "completed",
    content:
      "Name the card a waiting step links to, from its page and card ids",
  },
  {
    id: "s5",
    depth: 0,
    status: "in_progress",
    content: "Draw Waiting on you on its step, linked to the card",
  },
  {
    id: "s6",
    depth: 0,
    status: "pending",
    content: "Bring a linked step into view when its chip opens the plan",
  },
  {
    id: "s7",
    depth: 0,
    status: "pending",
    content: "Pick what the plan shows first when it opens",
    waitsOn: { card: CARD.title, href: CARD.href },
  },
  {
    id: "s8",
    depth: 0,
    status: "pending",
    content: "Fold finished steps into one row that opens in place",
  },
  {
    id: "s8a",
    depth: 1,
    status: "pending",
    content: "Open and shut it with unfold, on the pop's length",
  },
  {
    id: "s8b",
    depth: 1,
    status: "pending",
    content: "Keep its count live as steps finish",
  },
  {
    id: "s9",
    depth: 0,
    status: "pending",
    content: "Open the layer at the step under way",
  },
  {
    id: "s10",
    depth: 0,
    status: "pending",
    content: "Draw the same plan in the iOS app's plan view",
  },
  {
    id: "s11",
    depth: 0,
    status: "pending",
    content: "Run composer-layers at Desk and Phone",
  },
  {
    id: "s12",
    depth: 0,
    status: "pending",
    content: "Build, lint and type-check",
  },
];

/** PlanTree's `treeOf`, with each step's wait carried on its node. */
export function treeOf(rows: Row[]): StepNode[] {
  const roots: StepNode[] = [];
  const open: { depth: number; node: StepNode }[] = [];
  for (const row of rows) {
    const node: StepNode = {
      id: row.id,
      status: row.status,
      text: row.content,
      waits: row.waitsOn,
      children: [],
    };
    while (open.length > 0 && (open.at(-1)?.depth ?? 0) >= row.depth) {
      open.pop();
    }
    const parent = open.at(-1);
    (parent ? parent.node.children : roots).push(node);
    open.push({ depth: row.depth, node });
  }
  return roots;
}

export const STEPS = treeOf(ROWS);
/** planProgress: every step written, sub-steps included. */
export const DONE = ROWS.filter((row) => row.status === "completed").length;
export const TOTAL = ROWS.length;
/** The step under way. */
export const UNDER_WAY = "s5";

/**
 * The session's spec (`todo_write`'s `spec`), shown read-only under the
 * steps as MessageBody draws it: paragraphs, and a list as an array.
 */
export const SPEC: (string | string[])[] = [
  "A step waiting on your pick says so where the plan is. The hub already keeps the wait on the step (waitsOn: the decision page and its card, set by the session as it asks, or by the hub on the current step when a pick page opens) and keeps it across the session's writes by id. The plan has never drawn it, so a waiting step looks like any other step to do.",
  "What changes:",
  [
    "PlanTree reads a row's wait and ends its words with Waiting on you, a link to the card. The step keeps its place, its mark and its words.",
    "A wait on a whole page, with no card, links to the page.",
    "The board's peek draws a plan with the same tree, so it shows the wait too.",
    "The iOS app's plan view says the same words, from Words.Plan.",
  ],
  "When the wait goes: the page's Send carries a pick for that card, the hub clears waitsOn, and the link leaves the step with the next delta. Nothing else in the plan moves for it.",
  "How the plan reads when it opens waits on your pick (step 7). Until then the layer keeps today's order; the fold and the place it opens at are built after that answer, on the house's unfold and nothing new.",
  "Editing the plan from the layer (§5.2, the person's own edits) is a task of its own. This one only draws what the hub already holds.",
  "Proof: composer-layers at Desk and Phone holds the transcript still while the layer opens and shuts; the build, lint and type-check pass.",
];
