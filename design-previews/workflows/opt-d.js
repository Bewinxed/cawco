/* Option D: keep a run. A workflow is only ever a tree that happened (Base44, Cofounder). */
import { wfLedger, wfRow } from "./ledger.js";
import {
  askTile,
  askUnder,
  badge,
  block,
  btn,
  CHECKS,
  chip,
  deleteAsk,
  desk,
  glyph,
  ic,
  kind,
  manageMenu,
  marks,
  phone,
  runsLedger,
  runTree,
  STEPS,
  splitPane,
} from "./parts.js";

const KEPT = {
  name: "Reply shortlist",
  meta: "kept from run 2 · 5 steps · research, low",
  v: 1,
  state: "done",
  last: "not run yet",
  runs: 0,
  score: "–",
};
const MILESTONE = {
  name: "Milestone check",
  meta: "kept from run 1 · 2 steps · low",
  v: 1,
  state: "failed",
  last: "Oct 19",
  runs: 1,
  score: "0 of 1",
};

const finishedTree =
  () => `<div class="card" data-keep-src style="padding:var(--space-2);transform-origin:0 0">
  <div class="runrow"><span>${glyph("done")}</span><span class="t">Daily reply shortlist for X</span><span class="r">${btn("", { v: "ghost", size: "xs", icon: "more" })}</span><span class="d">Delivered · 11m · 4 delegates · 2 approved actions · 1 answer</span></div>
  ${[
    "Find 8–12 posts from the last 24 hours",
    "Read @cawcodev’s recent posts",
    "Pick the replies to keep",
    "Measure posts after 48 hours",
  ]
    .map(
      (t) =>
        `<div class="runrow done" data-depth="1" style="--depth:1"><span>${glyph("done")}</span><span class="t">${t}</span><span class="r"></span></div>`
    )
    .join("")}
</div>`;

const keepMenu = (style) => `<div class="menu" role="menu" style="${style}">
  <span class="mi" role="menuitem">${ic("eye")}<span>Open</span><span></span></span>
  <button type="button" class="mi hot" role="menuitem" data-play="d-keep">${ic("keep")}<span>Keep as workflow</span><span></span></button>
  <span class="mi" role="menuitem">${ic("restart")}<span>Run again</span><span></span></span>
  <span class="mi" role="menuitem">${ic("close")}<span>Dismiss</span><span></span></span>
</div>`;

const keptLedger = () =>
  block({
    icon: "workflow",
    title: "Workflows",
    count: "2",
    acts: btn("Ask Caw", { v: "ghost", size: "sm" }),
    body: `<div class="card" style="overflow:visible"><table class="ledger">
      <colgroup><col style="width:28px"><col><col style="width:44px"><col style="width:132px"><col style="width:64px"><col style="width:88px"><col style="width:44px"></colgroup>
      <thead><tr><th class="lead"><span class="sr-only">State</span></th><th>Workflow</th><th>v</th><th>Last run</th><th>Runs</th><th>Checks</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody data-keep-dst style="opacity:0">${wfRow(KEPT)}</tbody><tbody>${wfRow(MILESTONE)}</tbody></table></div>`,
  });

const createDesk = () =>
  desk({
    pane: `${keptLedger()}<p class="meta">There is no blank editor. A workflow starts as a tree that went well: any finished session’s ⋯ › Keep as workflow. Caw offers it when a session delegates the same titles twice.</p>`,
    split: splitPane({
      label: "Daily reply shortlist for X",
      facts: "Finished · 11m · $0.86",
      body: `<div style="position:relative">${finishedTree()}${keepMenu("inset-block-start:40px;inset-inline-end:8px")}</div>`,
    }),
  });

const createPhone = () => [
  phone({
    title: "Finished",
    body: `<div class="ptitle"><h4>Finished</h4><p>4 sessions</p></div><div style="position:relative">${finishedTree()}${keepMenu("inset-block-start:44px;inset-inline-end:0")}</div>`,
  }),
  phone({
    title: "Reply shortlist",
    back: true,
    body: `<div class="ptitle"><h4>Reply shortlist</h4><p>Kept from run 2 · v1</p></div>${prune(false)}`,
    foot: `${btn("Start on a schedule", { icon: "calendar" })}${btn("Run now", { v: "primary", icon: "play" })}`,
  }),
];

/** The kept tree, pruned in place: each row a step with its brief and type. */
const prune = (wide = true) => {
  const rows = STEPS.map((s) => {
    const extra =
      s.kind === "call"
        ? `<span class="d">x-use · get_tweet · ${chip("approved every run", { on: true, icon: "shield" })}</span>`
        : `<span class="d">“${s.brief}”</span>`;
    const end = wide
      ? `<span class="r">${kind(s.kind)} · ${s.who}</span>`
      : '<span class="r"></span>';
    return `<div class="runrow done" data-depth="1" style="--depth:1"><span>${glyph(s.kind === "ask" ? "needs" : "done")}</span><span class="t">${s.title}</span>${end}${extra}</div>`;
  });
  const removable = `<div data-prune-row style="overflow:clip"><div class="runrow done" data-depth="1" style="--depth:1"><span>${glyph("done")}</span><span class="t">Re-run the post search</span><span class="r">${btn("Remove", { v: "ghost", size: "xs", icon: "trash", play: "d-prune" })}</span><span class="d">Ran twice in run 2; the second found nothing new</span></div></div>`;
  return `<div class="card" style="padding:var(--space-2)"><div class="runrow"><span>${glyph("done")}</span><span class="t">Brief</span><span class="r"></span><span class="d">“Build today’s reply shortlist for ${chip("@{{account}}", { on: true })}. You publish nothing.” · was “@cawcodev”</span></div>${rows.slice(0, 2).join("")}${removable}${rows.slice(2).join("")}</div>`;
};

const editDesk = () =>
  desk({
    pane: wfLedger({
      rows: [KEPT, MILESTONE],
      open: `<div class="well">${prune()}<p class="meta">Prune only: remove a step, rename it, edit its brief, turn a value into an input, mark a call approved every run. Adding a step means running it once and keeping that run.</p><div class="row-wrap" style="justify-content:space-between"><span class="meta">${ic("keep", "sm")} v1 · kept from run 2 (Oct 16)</span><span class="acts">${btn("Start on a schedule", { size: "sm", icon: "calendar" })}${btn("Run now", { v: "primary", size: "sm", icon: "play" })}</span></div></div>`,
    }),
  });

const editPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `<div class="ptitle"><h4>Reply shortlist</h4><p>Kept from run 2 · prune it</p></div>${prune(false)}`,
  }),
];

const driftLine = () =>
  `<div class="drift">${ic("keep", "sm")}<span>vs kept run 2:</span>${badge("1 step added", "", "unplanned")}<span>0 missed · 1 answer still to give</span></div>`;

const runDesk = () =>
  desk({
    drift: true,
    pane: `${wfLedger({ rows: [{ ...KEPT, state: "needs", last: "run 7 · 4m ago", runs: 7, score: "5 of 6", v: 3, meta: "kept from run 2 · 5 steps" }, MILESTONE] })}${block({ icon: "runs", title: "Runs", count: "7", body: runsLedger() })}`,
    split: splitPane({
      title: "Run 7",
      label: "Reply shortlist, run 7",
      facts: "v3 (kept from run 2) · 3 of 5 · 4m · $0.41",
      asking: true,
      acts: [["stop", "Stop run"]],
      body: `${driftLine()}${runTree({ drift: true, ask: askTile() })}`,
    }),
  });

const runPhone = () => [
  phone({
    title: "Run 7",
    back: true,
    body: `<div class="ptitle"><h4>Reply shortlist · run 7</h4><p>Working · 4m · 3 of 5</p></div>${driftLine()}${runTree({ drift: true, ask: askTile({ chosen: "all" }) })}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const compareRuns = [
  {
    n: 7,
    when: "4m ago",
    v: 3,
    state: "running",
    outcome: "Running",
    took: "4m",
    steps: "4 of 6",
    delta: "+1 step",
    cost: "0.41",
  },
  {
    n: 6,
    when: "Oct 21",
    v: 3,
    state: "done",
    outcome: "As good as run 2",
    took: "9m",
    steps: "5 of 5",
    delta: "= 3 of 3",
    cost: "0.88",
  },
  {
    n: 5,
    when: "Oct 18",
    v: 2,
    state: "failed",
    outcome: "Worse: failed, ran again",
    took: "6m",
    steps: "5 of 5",
    delta: "−2 checks",
    cost: "0.52",
  },
  {
    n: 2,
    when: "Oct 16",
    v: 1,
    state: "done",
    outcome: "The kept run",
    took: "11m",
    steps: "4 of 4",
    delta: "baseline",
    cost: "0.86",
  },
];

const baseline = () =>
  `<div class="card checks">${CHECKS.map(
    (c, i) =>
      `<div class="check">${ic("checks", "g-idle")}<span class="t">As good as run 2: ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}</span>${marks(c.marks)}<span class="s ${i === 2 ? "delta-down" : "delta-up"}">${i === 2 ? "−1 vs run 2" : "= run 2"}</span></div>`
  ).join("")}</div>`;

const evalDesk = () =>
  desk({
    pane: `${wfLedger({ rows: [{ ...KEPT, last: "run 7 · 4m ago", runs: 7, score: "5 of 6", v: 3 }, MILESTONE] })}
      ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: baseline() })}
      <p class="meta">A judge compares each run’s reports with the kept run’s. A worse run is the start of a new check.</p>
      ${block({ icon: "runs", title: "Runs", count: "7", body: runsLedger({ compare: true, rows: compareRuns }) })}`,
  });

const evalPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `<div class="ptitle"><h4>Against run 2</h4><p>The kept run is the baseline</p></div>${baseline()}`,
  }),
];

const deleteDesk = () =>
  desk({
    pane: `${wfLedger({
      rows: [
        { ...KEPT, last: "run 7 · 4m ago", runs: 7, score: "5 of 6", v: 3 },
        MILESTONE,
      ],
      open: askUnder(),
      more: manageMenu({
        style: "inset-block-start:34px;inset-inline-end:4px",
        extra: `<span class="mi" role="menuitem">${ic("keep")}<span>Keep run 6 instead</span><span></span></span>`,
      }),
    })}
`,
  });

const deletePhone = () => [
  phone({
    title: "Cawco",
    body: `<div class="ptitle"><h4>Workflows</h4><p>2 workflows</p></div>${deleteAsk()}`,
  }),
];

export const D = {
  key: "D",
  name: "Keep a run",
  long: "Keep a run: a workflow is only ever a tree that happened",
  from: "From Base44 (replay with a previous run’s data; a template is a prompt, not a graph) and Cofounder (agents suggest routines when work repeats, and ask first).",
  fit: "No blank editor. He works with a lead as today; when a tree went well its root’s ⋯ › Keep as workflow makes it one: each delegate a step, the first message the brief, approved actions Calls, answered questions Ask me, typed values inputs. Editing is pruning.",
  costs: [
    "He cannot design first: a workflow starts as something he orchestrated by hand once.",
    "A step that never ran cannot be added without running it.",
    "Branches exist only as the orchestrator’s prose.",
  ],
  keeps: ["step", "standing", "rest", "routine", "snapshot"],
  jobs: {
    create: {
      desk: createDesk,
      phones: createPhone,
      note: "Any finished tree’s ⋯ › Keep as workflow. Press it: the tree travels into the ledger and becomes the row.",
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Pruning the kept tree. Press Remove on “Re-run the post search”.",
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 7 beside what was kept: a step the orchestrator added is marked, with Keep.",
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "Every run is scored against the kept run (a pinned baseline).",
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "Manage adds “Keep run 6 instead”: a better run becomes the next version.",
    },
  },
  motions: [
    {
      id: "d-keep",
      job: "create",
      name: "Keep as workflow",
      how: "The finished tree travels from the Split into the ledger’s new row over 280ms on the drawer curve, and the row takes its place (The One Object Rule: the source is the copy in flight, never two on screen).",
    },
    {
      id: "d-prune",
      job: "edit",
      name: "Remove a step",
      how: "Press Remove: the row closes while fading over 160ms on ease-out and the rows below slide up; press Undo to bring it back over 260ms.",
    },
  ],
};
