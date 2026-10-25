/* Option B: the step ledger, rows that are work items (Twenty, hilos). */
import { inputsLine, versionLine, wfLedger, wfPhoneList } from "./ledger.js";
import {
  askTile,
  askUnder,
  block,
  btn,
  checksList,
  chip,
  deleteAsk,
  desk,
  glyph,
  ic,
  kind,
  manageMenu,
  facts,
  LIVE,
  liveFacts,
  phone,
  RUN,
  RUNS,
  runsLedger,
  STEPS,
  seg,
  splitPane,
} from "./parts.js";
import { PLAN, shapeView } from "./shape.js";

const after = (s) =>
  s.after.length
    ? s.after.map((n) => chip(String(n))).join("")
    : '<span class="meta">start</span>';

const stepRow = (s, { open = "", sel = false, sel5quiet = false } = {}) =>
  `<div class="step${sel ? " sel" : ""}" data-step="${s.n}"><span class="grip" aria-label="Drag to reorder">${ic("grip")}</span><span class="g-idle">${ic("planned")}</span><span class="title trunc">${s.title}</span><span>${kind(s.kind)}</span><span class="col trunc">${s.who}</span><span class="chips">${after(s)}</span>${btn("", { v: "ghost", size: "xs", icon: "more" })}${s.n === 5 && !sel5quiet ? '<span class="sub">if you keep any · done when each kept reply has its numbers</span>' : ""}${s.n === 3 && !open ? '<span class="sub">x-use · get_tweet · {"id": "{{post}}"} · approved at start</span>' : ""}</div>${open}`;

const ghost = () =>
  `<button type="button" class="step ghost" data-play="b-add" style="inline-size:100%;text-align:start"><span></span><span>${ic("plus")}</span><span class="title">Add a step</span></button>`;

const stepsHead = () =>
  '<div class="step" style="min-block-size:28px;background:var(--surface-band)"><span></span><span></span><span class="col">STEP</span><span class="col">KIND</span><span class="col">WHO</span><span class="col">AFTER</span><span></span></div>';

const callEditor = () => `<div class="well" style="padding-inline-start:52px">
  <dl class="kv">
    <dt>Connection</dt><dd class="row"><span class="field" style="inline-size:220px">${ic("link")}<span class="grow">x-use</span>${ic("sort")}</span><span class="meta">tool</span><code>get_tweet</code></dd>
    <dt>Arguments</dt><dd><div class="argwell">{ <span class="k">"id"</span>: <span class="s">"{{post}}"</span> }</div></dd>
    <dt>Approve</dt><dd>${seg(
      [
        { value: "start", label: "At Start run" },
        { value: "every", label: "Every run" },
      ],
      "start",
      "Approve"
    )}<span class="meta" style="margin-inline-start:var(--space-3)">{{post}} comes from step 1: you see the exact call at Start run.</span></dd>
  </dl>
</div>`;

const ledgerWell = ({ open = "", view = "ledger", create = false } = {}) => `<div class="well">
  <div class="row-wrap"><span class="meta">Brief</span><span class="grow trunc">Build today’s reply shortlist for @{{account}}. You publish nothing.</span>${inputsLine()}</div>
  <div class="row" style="justify-content:space-between"><span class="label">Steps</span>${seg(
    [
      { value: "ledger", label: "Ledger", icon: "ledger" },
      { value: "shape", label: "Shape", icon: "shape" },
    ],
    view,
    "Steps as"
  )}</div>
  <div data-swap>${
    view === "shape"
      ? shapeView(PLAN, { caption: "Drawn from the rows", w: 150 })
      : `<div class="card steps" data-steps>${stepsHead()}${STEPS.map((s) => stepRow(s, { open: s.n === 3 ? open : "", sel: s.n === 3 && Boolean(open), sel5quiet: Boolean(open) })).join("")}${ghost()}</div>`
  }</div>
  ${
    create
      ? `<div class="row-wrap" style="justify-content:space-between"><span class="meta">${ic("pen", "sm")} New · not saved yet · its first save is v1</span><span class="acts">${btn("Cancel", { v: "ghost", size: "sm" })}${btn("Create workflow", { v: "primary", size: "sm" })}</span></div>`
      : versionLine(`${btn("Run now", { size: "sm", icon: "play" })}${btn("Save as v2", { v: "primary", size: "sm" })}`)
  }
</div>`;

const proposal =
  () => `<div class="card"><div class="well" style="background:var(--surface-raised);border:0">
  <div class="row">${ic("sparkles", "g-brand")}<span class="label grow">Drafted from your sentence: 5 steps</span>${btn("Dismiss", { v: "ghost", size: "sm" })}${btn("Use all 5", { size: "sm" })}</div>
  <p class="meta">“reply shortlist: find posts and read ours together, read each through x-use, ask me which to keep, measure at 48 hours if any”. Nothing runs on a proposal; each row is yours to keep or drop.</p>
  <div class="steps">${STEPS.slice(0, 2)
    .map(
      (s) =>
        `<div class="step" style="grid-template-columns:var(--c-row-mark) minmax(0,1fr) 88px 96px auto"><span class="g-idle">${ic("planned")}</span><span class="title trunc">${s.title}</span>${kind(s.kind)}<span class="col">${s.who}</span><span class="acts">${btn("Drop", { v: "ghost", size: "xs" })}${btn("Keep", { size: "xs" })}</span></div>`
    )
    .join(
      ""
    )}<div class="step" style="grid-template-columns:minmax(0,1fr)"><span class="meta">3 more rows: Read via x-use (Call), Which replies? (Ask me), Measure posts after 48 hours (Agent · low)</span></div></div>
</div></div>`;

const createDesk = () =>
  desk({
    pane: `${block({
      icon: "workflow",
      title: "New workflow",
      acts: btn("Ask Caw to draft it", { v: "ghost", size: "sm", icon: "sparkles" }),
      body: `<div class="card">${ledgerWell({ create: true })}</div>`,
    })}${proposal()}`,
  });

const phoneSteps = (open = "") =>
  `<div class="pcard">${STEPS.map(
    (s) =>
      `<div class="prow"><span class="g-idle">${ic("planned")}</span><span class="t trunc">${s.title}</span><span class="r">${ic("grip")}</span><span class="m">${kind(s.kind)} · ${s.who}${s.after.length ? ` · after ${s.after.join(", ")}` : ""}</span></div>${s.n === 3 ? open : ""}`
  ).join(
    ""
  )}<div class="prow"><span class="g-idle">${ic("plus")}</span><span class="t" style="color:var(--ink-subtle)">Add a step</span></div></div>`;

const createPhone = () => [
  phone({
    title: "New workflow",
    back: true,
    body: `<span class="field focus"><span>Reply shortlist</span></span>
      <span class="field"><span>Build today’s reply shortlist for @{{account}}. You publish nothing.</span></span>
      ${inputsLine()}<p class="label">Steps</p>${phoneSteps()}`,
    foot: `${btn("Ask Caw to draft it", { icon: "sparkles" })}${btn("Create", { v: "primary" })}`,
  }),
];

const editDesk = () =>
  desk({ pane: wfLedger({ open: ledgerWell({ open: callEditor() }) }) });

const editPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(["v1", "5 steps", "8 runs"])}
      ${phoneSteps(
        `<div class="stack" style="padding-block:var(--space-2)"><span class="field">${ic("link")}<span class="grow">x-use · get_tweet</span>${ic("sort")}</span><div class="argwell">{ <span class="k">"id"</span>: <span class="s">"{{post}}"</span> }</div>${seg(
          [
            { value: "start", label: "At Start run" },
            { value: "every", label: "Every run" },
          ],
          "start",
          "Approve on phone"
        )}</div>`
      )}`,
    foot: `${btn("Shape", { icon: "shape" })}${btn("Save as v2", { v: "primary" })}`,
  }),
];

const runRows = ({ open = true } = {}) => {
  const rows = STEPS.map((s) => {
    const r = RUN[s.n];
    const ask =
      s.n === 4
        ? `<div class="fold" data-fold${open ? " data-open" : ""}><div><div style="padding:0 var(--space-2) var(--space-2) 40px">${askTile()}</div></div></div>`
        : "";
    const press =
      s.n === 4
        ? ' data-play="b-unfold" role="button" tabindex="0" aria-expanded="true"'
        : "";
    return `<div class="runrow ${r.state}" data-depth="1" style="--depth:1"${press}><span>${glyph(r.state)}</span><span class="t">${s.title}</span><span class="r num">${kind(s.kind)}</span><span class="d">${s.kind === "call" ? "x-use · get_tweet · approved at start" : r.report}</span></div>${ask}`;
  });
  return `<div class="stack" style="gap:0"><div class="runrow"><span>${glyph("needs")}</span><span class="t">Workflow · Reply shortlist</span><span class="r">orchestrator</span></div>${rows.join("")}</div>`;
};

const runDesk = () =>
  desk({
    pane: `${wfLedger()}${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger() })}`,
    split: splitPane({
      title: "Reply shortlist",
      label: `Reply shortlist, run ${LIVE}`,
      facts: liveFacts(),
      asking: true,
      acts: [["stop", "Stop run"]],
      body: `${runRows()}<div class="hr"></div><p class="meta">The checks score when the run ends.</p>`,
    }),
  });

const runPhone = () => [
  phone({
    title: "Workflows",
    body: `${wfPhoneList()}
      <p class="label">Runs</p><div class="pcard">${RUNS.slice(0, 2)
        .map(
          (r) =>
            `<div class="prow">${glyph(r.state)}<span class="t">Run ${r.n}</span><span class="r">${ic("right")}</span><span class="m">${r.when} · ${r.outcome}</span></div>`
        )
        .join("")}</div>`,
  }),
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(liveFacts())}${runRows()}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const doneWhen = () =>
  `<div class="card checks"><div class="check">${ic("checks", "g-idle")}<span class="t">Step 5 · Measure posts after 48 hours: done when each kept reply has its numbers</span><span class="marks" role="img" aria-label="Not run yet"><i class="n"></i></span><span class="s">not run yet</span><span class="scope">Scored on that step’s report alone</span></div></div>`;

const evalDesk = () =>
  desk({
    pane: `${wfLedger()}
      <div class="blocks-2">
        ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: checksList() })}
        ${block({ icon: "checks", title: "Step checks", count: "1", body: doneWhen() })}
      </div>
      ${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger() })}`,
  });

const evalPhone = () => [
  phone({
    title: "Checks",
    back: true,
    body: `${checksList()}<p class="label">Step 5’s own check</p>${doneWhen()}`,
  }),
];

const deleteDesk = () =>
  desk({
    pane: `${wfLedger({ open: askUnder(), more: manageMenu({ style: "inset-block-start:34px;inset-inline-end:4px" }) })}
`,
  });

const deletePhone = () => [
  phone({
    title: "Workflows",
    body: wfPhoneList({ open: `<div style="padding-block:var(--space-2)">${deleteAsk()}</div>` }),
  }),
];

export const B = {
  key: "B",
  name: "Step ledger",
  recommended: true,
  long: "The step ledger: rows that are work items",
  from: "From Twenty (a vertical flow of step cards with ghost “add a step” slots; overview and run share one picture) and hilos (propose_plan writes up to eight rows; the person approves the rows; nothing runs on the proposal).",
  fit: "One row per step: title, kind (Agent, Call, Wait, Ask me), who, its brief, and the steps it waits for. A row is a work item before it runs, so the run is the same ledger lit, joined by a step id. Caw drafts the rows from a sentence as a proposal he keeps row by row, and any finished tree seeds them.",
  costs: [
    "One row per step is more taps than one paragraph.",
    "Parallel steps are a chip, not a drawing (the Shape toggle draws them).",
    "A long workflow is a long list.",
  ],
  keeps: ["step", "standing", "rest", "ingress", "routine", "proposal"],
  jobs: {
    create: {
      desk: createDesk,
      phones: createPhone,
      note: "Rows by hand, or Caw’s draft kept row by row. Press Add a step.",
      phoneNotes: ["On the phone: the name, the brief and the rows by hand; Ask Caw to draft it is in the foot."],
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "A Call row opened in place: its connection, tool, arguments and when it is approved. Ledger | Shape swaps the rows for their picture.",
      phoneNotes: ["The Call row opened in place: x-use, get_tweet, its argument and when it is approved."],
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 8 is the same ledger, lit. Press the asking row: its question folds and unfolds in place.",
      phoneNotes: [
        "The workflows, then their runs: run 8 needs you.",
        "Run 8 opened: the step rows lit, step 4's question unfolded under its row.",
      ],
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "The run’s checks, plus a step’s own “Done when”, scored on that step’s report alone.",
      phoneNotes: ["The run's checks, then step 5's own check, not run yet."],
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "The row’s ⋯ and the delete asked in place, naming the runs and the routine it reaches.",
      phoneNotes: ["Delete asked in place under the workflow's row, each row keeping its ⋯."],
    },
  },
  motions: [
    {
      id: "b-add",
      job: "create",
      name: "Add a step",
      how: "Press Add a step: the new row uncovers top to bottom while what follows makes room, height over 260ms on ease-out and its fade with it (The Nothing Jumps Rule).",
    },
    {
      id: "b-shape",
      job: "edit",
      name: "Ledger | Shape",
      how: "The thumb glides 260ms on ease-in-out; the rows leave over 160ms and the picture rises in over 260ms, both on ease-out.",
    },
    {
      id: "b-unfold",
      job: "run",
      name: "The asking row unfolds",
      how: "Press the asking row: its question unfolds under it over 260ms and folds back over 160ms, ease-out, what sits below sliding with it (the house unfold).",
    },
  ],
};
