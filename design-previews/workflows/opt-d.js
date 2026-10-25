/* Option D: keep a run. A workflow is only ever a tree that happened (Base44, Cofounder). */
import { MILESTONE, REPLY, wfLedger, wfPhoneList, wfRow } from "./ledger.js";
import {
  askTile,
  askUnder,
  block,
  btn,
  CHECKS,
  chip,
  deleteAsk,
  desk,
  facts,
  glyph,
  ic,
  KEPT_RUN,
  kind,
  LIVE,
  liveFacts,
  manageMenu,
  marks,
  phone,
  runsLedger,
  runTree,
  STEPS,
  splitPane,
} from "./parts.js";

/** The workflow D keeps: the Reply shortlist, kept from run 7, his Oct 21 run that delivered. */
const KEPT = { ...REPLY, meta: `kept from run ${KEPT_RUN} · 5 steps · research, low` };

/** Run 7 as the hub keeps it; its rows are the steps Keep as workflow makes of it. */
const finishedTree =
  () => `<div class="card" data-keep-src style="padding:var(--space-2);transform-origin:0 0">
  <div class="runrow"><span>${glyph("done")}</span><span class="t">Daily reply shortlist for X</span><span class="r">${btn("", { v: "ghost", size: "xs", icon: "more" })}</span><span class="d">Delivered Oct 21: 12 posts from the last 24 hours, 3 DM drafts, nothing posted</span></div>
  ${[
    "Find 8–12 posts from the last 24 hours",
    "Read @cawcodev’s recent posts",
    "Draft up to 3 DMs",
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

/** Before Keep: the ledger holds the other workflow; the kept row is not drawn until it lands. */
const keptLedger = () =>
  block({
    icon: "workflow",
    title: "Workflows",
    count: "1",
    acts: btn("Ask Caw", { v: "ghost", size: "sm" }),
    body: `<div class="card" style="overflow:visible"><table class="ledger">
      <colgroup><col style="width:28px"><col><col style="width:44px"><col style="width:112px"><col style="width:64px"><col style="width:72px"><col style="width:44px"></colgroup>
      <thead><tr><th class="lead"><span class="sr-only">State</span></th><th>Workflow</th><th>v</th><th>Last run</th><th>Runs</th><th>Checks</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody data-keep-dst hidden>${wfRow({ ...KEPT, state: "done", last: "not run yet", runs: 0, score: "–" })}</tbody><tbody>${wfRow(MILESTONE)}</tbody></table></div>`,
  });

const createDesk = () =>
  desk({
    pane: `${keptLedger()}<p class="meta">There is no blank editor. A workflow starts as a tree that went well: any finished session’s ⋯ › Keep as workflow. Caw offers it when a session delegates the same titles twice.</p>`,
    split: splitPane({
      label: "Daily reply shortlist for X",
      facts: [`${glyph("done", "sm")}<span>Finished Oct 21</span>`, `run ${KEPT_RUN} of the routine`],
      body: `<div style="position:relative">${finishedTree()}${keepMenu("inset-block-start:40px;inset-inline-end:8px")}</div>`,
    }),
  });

const createPhone = () => [
  phone({
    title: "Finished",
    body: `<div style="position:relative">${finishedTree()}${keepMenu("inset-block-start:44px;inset-inline-end:0")}</div>`,
  }),
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts([`${ic("keep", "sm")}<span>Kept from run ${KEPT_RUN}</span>`, "v1"])}${prune(false)}`,
    foot: `${btn("Start on a schedule", { icon: "calendar" })}${btn("Run now", { v: "primary", icon: "play" })}`,
  }),
];

/** The kept tree, pruned in place: each row a step with its brief and type. */
const prune = (wide = true) => {
  const rows = STEPS.map((s) => {
    const extra =
      s.kind === "call"
        ? `<span class="d">x-use · get_tweet · ${chip("approved every run", { icon: "shield" })}</span>`
        : `<span class="d">“${s.brief}”</span>`;
    const end = wide
      ? `<span class="r">${kind(s.kind)} · ${s.who}</span>`
      : '<span class="r"></span>';
    return `<div class="runrow done" data-depth="1" style="--depth:1"><span>${glyph(s.kind === "ask" ? "needs" : "done")}</span><span class="t">${s.title}</span>${end}${extra}</div>`;
  });
  const removable = `<div data-prune-row style="overflow:clip"><div class="runrow done" data-depth="1" style="--depth:1"><span>${glyph("done")}</span><span class="t">Draft up to 3 DMs</span><span class="r">${btn("Remove", { v: "ghost", size: "xs", icon: "trash", play: "d-prune" })}</span><span class="d">Run 7 drafted 3; remove it to keep the replies alone</span></div></div>`;
  return `<div class="card" style="padding:var(--space-2)"><div class="runrow"><span>${glyph("done")}</span><span class="t">Brief</span><span class="r"></span><span class="d">“Build today’s reply shortlist for ${chip("@{{account}}")}. You publish nothing.” · was “@cawcodev”</span></div>${rows.slice(0, 2).join("")}${removable}${rows.slice(2).join("")}</div>`;
};

const editDesk = () =>
  desk({
    pane: wfLedger({
      rows: [KEPT, MILESTONE],
      open: `<div class="well">${prune()}<p class="meta">Prune only: remove a step, rename it, edit its brief, turn a value into an input, mark a call approved every run. Adding a step means running it once and keeping that run.</p><div class="row-wrap" style="justify-content:space-between"><span class="meta">${ic("keep", "sm")} v1 · kept from run ${KEPT_RUN} (Oct 21)</span><span class="acts">${btn("Start on a schedule", { size: "sm", icon: "calendar" })}${btn("Run now", { v: "primary", size: "sm", icon: "play" })}</span></div></div>`,
    }),
  });

const editPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts([`${ic("keep", "sm")}<span>Kept from run ${KEPT_RUN}</span>`, "v1", "8 runs"])}${prune(false)}`,
  }),
];

/** Run 8 beside the kept run, said on the run's own root row. */
const against = `vs kept run ${KEPT_RUN}: 1 step added, 0 missed, 1 answer still to give`;

const runDesk = () =>
  desk({
    drift: true,
    pane: `${wfLedger({ rows: [KEPT, MILESTONE] })}${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger() })}`,
    split: splitPane({
      title: "Reply shortlist",
      label: `Reply shortlist, run ${LIVE}`,
      facts: liveFacts(),
      asking: true,
      acts: [["stop", "Stop run"]],
      body: runTree({ drift: true, ask: askTile(), against }),
    }),
  });

const runPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(liveFacts())}${runTree({ drift: true, ask: askTile({ chosen: "all" }), against })}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const compareRuns = [
  { n: 8, when: "Now", state: "needs", outcome: "Needs you at step 4", delta: "+1 step so far" },
  { n: 7, when: "Oct 21", state: "done", outcome: "The kept run: 12 posts, 3 DM drafts", delta: "baseline" },
  { n: 6, when: "Oct 19", state: "failed", outcome: "Worse: x-use not connected", delta: "−2 checks" },
  { n: 2, when: "Oct 15", state: "done", outcome: "As good: 10 posts, 3 DM drafts", delta: "= 3 of 3" },
];

const baseline = () =>
  `<div class="card checks">${CHECKS.map(
    (c) =>
      `<div class="check">${ic("checks", "g-idle")}<span class="t">As good as run ${KEPT_RUN}: ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}</span>${marks(c.marks)}<span class="s">${c.pass}</span></div>`
  ).join("")}</div>`;

const evalDesk = () =>
  desk({
    pane: `${wfLedger({ rows: [KEPT, MILESTONE] })}
      ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: baseline() })}
      <p class="meta">A judge compares each run’s reports with the kept run’s. A worse run is the start of a new check.</p>
      ${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger({ compare: true, rows: compareRuns }) })}`,
  });

const evalPhone = () => [
  phone({
    title: "Checks",
    back: true,
    body: `${facts([`${ic("keep", "sm")}<span>Against run ${KEPT_RUN}, the kept run</span>`])}${baseline()}`,
  }),
];

const keepInstead = `<span class="mi" role="menuitem">${ic("keep")}<span>Keep run 2 instead</span><span></span></span>`;

const deleteDesk = () =>
  desk({
    pane: `${wfLedger({
      rows: [KEPT, MILESTONE],
      open: askUnder(),
      more: manageMenu({
        style: "inset-block-start:34px;inset-inline-end:4px",
        extra: keepInstead,
      }),
    })}
`,
  });

const deletePhone = () => [
  phone({
    title: "Workflows",
    body: wfPhoneList({
      rows: [KEPT, MILESTONE],
      menu: manageMenu({ style: "inset-block-start:40px;inset-inline-end:var(--space-2)", extra: keepInstead }),
    }),
  }),
  phone({
    title: "Workflows",
    body: wfPhoneList({
      rows: [KEPT, MILESTONE],
      open: `<div style="padding-block:var(--space-2)">${deleteAsk()}</div>`,
    }),
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
      note: "Run 7’s finished tree and its ⋯ › Keep as workflow. Press it: the tree travels into the ledger and becomes the row.",
      phoneNotes: [
        "A finished run, Oct 21's, with its ⋯ open on Keep as workflow.",
        "Kept: the tree is now the workflow's steps and brief, ready to prune or run.",
      ],
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Pruning the kept tree. Press Remove on “Draft up to 3 DMs”.",
      phoneNotes: ["The kept tree on the phone, pruned the same way."],
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 8 beside what was kept: a step the orchestrator added is marked, with Keep.",
      phoneNotes: ["Run 8 against the kept run: the added step marked, step 4's question open."],
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "Every run is scored against the kept run (a pinned baseline).",
      phoneNotes: ["The checks, each scored against run 7, the kept run."],
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "Manage adds “Keep run 2 instead”: another good run becomes the next version.",
      phoneNotes: [
        "The row's ⋯ open, with Keep run 2 instead.",
        "Delete asks in place under its row, naming what it reaches.",
      ],
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
