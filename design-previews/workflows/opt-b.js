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
  phone,
  RUN12,
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
  `<div class="step${sel ? " sel" : ""}" data-step="${s.n}"><span class="grip" aria-label="Drag to reorder">${ic("grip")}</span><span class="g-idle">${ic("planned")}</span><span class="title trunc">${s.title}</span><span>${kind(s.kind)}</span><span class="col trunc">${s.who}</span><span class="chips">${after(s)}</span>${btn("", { v: "ghost", size: "xs", icon: "more" })}${s.n === 5 && !sel5quiet ? '<span class="sub">if the channel is beta · done when 0 failed</span>' : ""}${s.n === 3 && !open ? '<span class="sub">slack-brand · post · {"text": "{{notes}}"} · approved at start</span>' : ""}</div>${open}`;

const ghost = () =>
  `<button type="button" class="step ghost" data-play="b-add" style="inline-size:100%;text-align:start"><span></span><span>${ic("plus")}</span><span class="title">Add a step</span></button>`;

const stepsHead = () =>
  '<div class="step" style="min-block-size:28px;background:var(--surface-band)"><span></span><span></span><span class="col">STEP</span><span class="col">KIND</span><span class="col">WHO</span><span class="col">AFTER</span><span></span></div>';

const callEditor = () => `<div class="well" style="padding-inline-start:52px">
  <dl class="kv">
    <dt>Connection</dt><dd class="row"><span class="field" style="inline-size:220px">${ic("link")}<span class="grow">slack-brand</span>${ic("sort")}</span><span class="meta">tool</span><code>post</code></dd>
    <dt>Arguments</dt><dd><div class="argwell">{ <span class="k">"channel"</span>: <span class="s">"#releases"</span>, <span class="k">"text"</span>: <span class="s">"{{notes}}"</span> }</div></dd>
    <dt>Approve</dt><dd>${seg(
      [
        { value: "start", label: "At Start run" },
        { value: "every", label: "Every run" },
      ],
      "start",
      "Approve"
    )}<span class="meta" style="margin-inline-start:var(--space-3)">{{notes}} comes from step 1: you see the exact call at Start run.</span></dd>
  </dl>
</div>`;

const ledgerWell = ({ open = "", view = "ledger" } = {}) => `<div class="well">
  <div class="row-wrap"><span class="meta">Brief</span><span class="grow trunc">Release {{version}} from main. Post the notes once both checks pass.</span>${inputsLine()}</div>
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
  ${versionLine(`${btn("Run now", { size: "sm", icon: "play" })}${btn("Save as v4", { v: "primary", size: "sm" })}`)}
</div>`;

const proposal =
  () => `<div class="card"><div class="well" style="background:var(--surface-raised);border:0">
  <div class="row">${ic("sparkles", "g-brand")}<span class="label grow">Drafted from your sentence: 5 steps</span>${btn("Dismiss", { v: "ghost", size: "sm" })}${btn("Use all 5", { v: "primary", size: "sm" })}</div>
  <p class="meta">“release 2.4: notes and link check together, post to #releases, ask me the channel, smoke test if beta”. Nothing runs on a proposal; each row is yours to keep or drop.</p>
  <div class="steps">${STEPS.slice(0, 2)
    .map(
      (s) =>
        `<div class="step" style="grid-template-columns:var(--c-row-mark) minmax(0,1fr) 88px 96px auto"><span class="g-idle">${ic("planned")}</span><span class="title trunc">${s.title}</span>${kind(s.kind)}<span class="col">${s.who}</span><span class="acts">${btn("Drop", { v: "ghost", size: "xs" })}${btn("Keep", { size: "xs" })}</span></div>`
    )
    .join(
      ""
    )}<div class="step" style="grid-template-columns:minmax(0,1fr)"><span class="meta">3 more rows: Post to Slack (Call), Which channel? (Ask me), Run the smoke test (Agent · runner)</span></div></div>
</div></div>`;

const createDesk = () =>
  desk({
    pane: `${block({
      icon: "workflow",
      title: "New workflow",
      acts: `${btn("Ask Caw to draft it", { v: "ghost", size: "sm", icon: "sparkles" })}${btn("Cancel", { v: "ghost", size: "sm" })}`,
      body: `<div class="card">${ledgerWell()}</div>`,
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
    body: `<span class="field focus"><span>Release</span></span>
      <span class="field"><span class="ph">The orchestrator’s brief…</span></span>
      ${inputsLine()}<p class="label">Steps</p>${phoneSteps()}`,
    foot: `${btn("Ask Caw to draft it", { icon: "sparkles" })}${btn("Create", { v: "primary" })}`,
  }),
];

const editDesk = () =>
  desk({ pane: wfLedger({ open: ledgerWell({ open: callEditor() }) }) });

const editPhone = () => [
  phone({
    title: "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>Release 2.4</h4><p>v3 · 5 steps · 12 runs</p></div>
      ${phoneSteps(
        `<div class="stack" style="padding-block:var(--space-2)"><span class="field">${ic("link")}<span class="grow">slack-brand · post</span>${ic("sort")}</span><div class="argwell">{ <span class="k">"text"</span>: <span class="s">"{{notes}}"</span> }</div>${seg(
          [
            { value: "start", label: "At Start run" },
            { value: "every", label: "Every run" },
          ],
          "start",
          "Approve on phone"
        )}</div>`
      )}`,
    foot: `${btn("Shape", { icon: "shape" })}${btn("Save as v4", { v: "primary" })}`,
  }),
];

const runRows = ({ open = true } = {}) => {
  const rows = STEPS.map((s) => {
    const r = RUN12[s.n];
    const ask =
      s.n === 4
        ? `<div class="fold" data-fold${open ? " data-open" : ""}><div><div style="padding:0 var(--space-2) var(--space-2) 40px">${askTile()}</div></div></div>`
        : "";
    const press =
      s.n === 4
        ? ' data-play="b-unfold" role="button" tabindex="0" aria-expanded="true"'
        : "";
    return `<div class="runrow ${r.state}" data-depth="1" style="--depth:1"${press}><span>${glyph(r.state)}</span><span class="t">${s.title}</span><span class="r num">${r.took || kind(s.kind)}</span><span class="d">${s.kind === "call" ? "slack-brand · post · approved at start" : r.report}</span></div>${ask}`;
  });
  return `<div class="stack" style="gap:0"><div class="runrow"><span>${glyph("running")}</span><span class="t">Workflow · Release 2.4</span><span class="r">orchestrator</span></div>${rows.join("")}</div>`;
};

const runDesk = () =>
  desk({
    pane: `${wfLedger()}${block({ icon: "runs", title: "Runs", count: "12", body: runsLedger() })}`,
    split: splitPane({
      title: "Release 2.4 · run 12",
      meta: "v3 · 3 of 5 steps · 4m · $0.41 · obelisk",
      acts: btn("Stop run", { size: "sm", icon: "stop" }),
      body: `${runRows()}<div class="hr"></div><p class="meta">${glyph("done", "sm")} Checks so far: 2 of 3 · “The Slack post carries the version” scores when the run ends.</p>`,
    }),
  });

const runPhone = () => [
  phone({
    title: "Release app",
    body: `<div class="ptitle"><h4>Workflows</h4><p>2 workflows · 1 run going</p></div>${wfPhoneList()}
      <p class="label">Runs</p><div class="pcard">${[
        ["running", "Run 12", "4m ago · 3 of 5 · needs you"],
        ["done", "Run 11", "Tue 05:12 · delivered · 9m"],
      ]
        .map(
          ([s, t, m]) =>
            `<div class="prow">${glyph(s)}<span class="t">${t}</span><span class="r">${ic("right")}</span><span class="m">${m}</span></div>`
        )
        .join("")}</div>`,
  }),
  phone({
    title: "Run 12",
    back: true,
    body: `<div class="ptitle"><h4>Release 2.4 · run 12</h4><p class="num">Working · 4m · 3 of 5 · $0.41</p></div>${runRows()}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const doneWhen = () =>
  `<div class="card checks"><div class="check">${ic("checks", "g-idle")}<span class="t">Step 5 · Run the smoke test: done when 0 failed</span><span class="marks" role="img" aria-label="9 passed of 10"><i></i><i></i><i class="f"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="s">9 of 10</span><span class="scope">Scored on that step’s report alone</span></div></div>`;

const evalDesk = () =>
  desk({
    pane: `${wfLedger()}
      <div class="blocks-2">
        ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: checksList() })}
        ${block({ icon: "checks", title: "Step checks", count: "1", body: doneWhen() })}
      </div>
      ${block({ icon: "runs", title: "Runs", count: "12", body: runsLedger() })}`,
  });

const evalPhone = () => [
  phone({
    title: "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>Checks</h4><p>The run’s, and one step’s</p></div>${checksList()}${doneWhen()}`,
  }),
];

const deleteDesk = () =>
  desk({
    pane: `${wfLedger({ open: askUnder(), more: manageMenu({ style: "inset-block-start:34px;inset-inline-end:4px" }) })}
`,
  });

const deletePhone = () => [
  phone({
    title: "Release app",
    body: `<div class="ptitle"><h4>Workflows</h4><p>2 workflows</p></div>${wfPhoneList()}${deleteAsk()}`,
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
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "A Call row opened in place: its connection, tool, arguments and when it is approved. Ledger | Shape swaps the rows for their picture.",
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 12 is the same ledger, lit. Press the asking row: its question folds and unfolds in place.",
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "The run’s checks, plus a step’s own “Done when”, scored on that step’s report alone.",
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "The row’s ⋯ and the delete asked in place, naming the runs and the routine it reaches.",
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
