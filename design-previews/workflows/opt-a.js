/* Option A: the written brief, its shape read off the prose (Lemni, Base44). */
import { inputsLine, versionLine, wfLedger, wfPhoneList } from "./ledger.js";
import {
  askTile,
  askUnder,
  block,
  btn,
  checksList,
  deleteAsk,
  desk,
  esc,
  facts,
  glyph,
  ic,
  LIVE,
  liveFacts,
  manageMenu,
  phone,
  RUNS,
  runsLedger,
  splitPane,
} from "./parts.js";
import { BRIEF, BRIEF_SLIPPED, PLAN, parseBrief, shapeView } from "./shape.js";

const NUMBERED_LINE = /^(\d+)\.\s+(.*)$/;

const briefLines = (text) => {
  const read = new Map(parseBrief(text).map((s) => [s.n, s]));
  return `<div class="brief-lines" aria-label="Brief">${text
    .split("\n")
    .map((line) => {
      const m = NUMBERED_LINE.exec(line);
      if (!m) {
        return `<div class="ln"><span class="n"></span><span>${esc(line)}</span><span></span></div>`;
      }
      const s = read.get(Number(m[1]));
      const tag = s.kind === "call" ? '<span class="badge">Call</span>' : "";
      return `<div class="ln${s.unparsed ? " unparsed" : ""}"><span class="n num">${m[1]}</span><span>${esc(m[2])}</span>${s.unparsed ? '<span class="meta">Goes as prose</span>' : tag}</div>`;
    })
    .join("")}</div>`;
};

const editor = (text, w) => `<div class="brief">
  <label class="brief-text"><span class="sr-only">The brief</span><textarea data-brief spellcheck="false">${esc(text)}</textarea></label>
  <div data-shape-host>${shapeView(parseBrief(text), { w })}</div>
</div>`;

const createDesk = () =>
  desk({
    pane: block({
      icon: "workflow",
      title: "New workflow",
      acts: btn("Cancel", { v: "ghost", size: "sm" }),
      body: `<div class="card"><div class="well" style="background:var(--surface-raised);border:0">
        <div class="row"><span class="field focus grow"><span>Reply shortlist</span></span></div>
        <p class="meta">Write it as numbered steps. A word in brackets is who does it; “with 1” runs beside step 1; “Call”, “Ask me” and “If” lines become a call, a question and a branch.</p>
        ${editor(BRIEF, 150)}
        ${inputsLine('<span class="meta">read from {{account}}</span>')}
        <div class="row-wrap" style="justify-content:space-between"><span class="meta">${ic("keep", "sm")} Or keep a finished run: its ⋯ › Keep as workflow writes this brief from its delegates.</span><span class="acts">${btn("Create workflow", { v: "primary", size: "sm" })}</span></div>
      </div></div>`,
    }),
  });

const createPhone = () => [
  phone({
    title: "New workflow",
    back: true,
    body: `<span class="field focus"><span>Reply shortlist</span></span>
      <div class="brief-text"><textarea spellcheck="false" aria-label="The brief">${esc(BRIEF)}</textarea></div>
      ${shapeView(parseBrief(BRIEF), { w: 128 })}`,
    foot: `${btn("Cancel", { v: "ghost" })}${btn("Create workflow", { v: "primary" })}`,
  }),
];

const openWell = (text) => `<div class="well">
  <div class="brief" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)">
    <div class="brief-text" data-brief-host>${briefLines(text)}</div>
    <div data-shape-host>${shapeView(parseBrief(text), { w: 140 })}</div>
  </div>
  ${inputsLine(`<span class="grow"></span><span class="meta">${ic("checks", "sm")} 3 checks</span>${btn("Add a check", { v: "ghost", size: "xs" })}`)}
  ${versionLine(`${btn("Run now", { size: "sm", icon: "play" })}${btn("Save as v2", { v: "primary", size: "sm" })}`)}
</div>`;

const editDesk = () =>
  desk({
    pane: `${wfLedger({ open: openWell(BRIEF_SLIPPED) })}`,
  });

const editPhone = () => [
  phone({
    title: "Workflows",
    body: `${wfPhoneList({
      open: `<div class="stack" style="padding-block:var(--space-2)">${briefLines(BRIEF_SLIPPED)}${shapeView(parseBrief(BRIEF_SLIPPED), { w: 120 })}</div>`,
    })}`,
    foot: `${btn("Run now", { icon: "play" })}${btn("Save as v2", { v: "primary" })}`,
  }),
];

const runSplit = () =>
  splitPane({
    title: "Reply shortlist",
    label: `Reply shortlist, run ${LIVE}`,
    facts: liveFacts(),
    acts: [["stop", "Stop run"]],
    body: `${shapeView(PLAN, { lit: true, caption: "Lit by its work items", w: 150 })}${askTile()}`,
  });

const runDesk = () =>
  desk({
    pane: `${wfLedger()}${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger() })}`,
    split: runSplit(),
  });

const runList = () =>
  `<div class="pcard">${RUNS.slice(0, 4)
    .map(
      (r) =>
        `<div class="prow">${glyph(r.state)}<span class="t">Run ${r.n}</span><span class="r">${ic("right")}</span><span class="m">${r.when} · ${r.outcome}</span></div>`
    )
    .join("")}</div>`;

const runPhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(["v1", "8 runs"])}${runList()}`,
  }),
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(liveFacts())}
      ${shapeView(PLAN, { lit: true, caption: "Lit by its work items", w: 122 })}${askTile({ chosen: "all" })}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const evalDesk = () =>
  desk({
    pane: `${wfLedger()}
      ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: checksList() })}
      <p class="meta">A judge reads each run’s reports against these sentences once the run ends. Each mark is one run, oldest first; run 8 is still going.</p>
      ${block({ icon: "runs", title: "Runs", count: "8", body: runsLedger() })}`,
  });

const evalPhone = () => [
  phone({
    title: "Checks",
    back: true,
    body: `${checksList()}
      ${btn("Add a check", { icon: "plus" })}`,
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
    body: wfPhoneList({
      menu: manageMenu({ style: "inset-block-start:40px;inset-inline-end:var(--space-2)" }),
    }),
  }),
  phone({
    title: "Workflows",
    body: wfPhoneList({ open: `<div style="padding-block:var(--space-2)">${deleteAsk()}</div>` }),
  }),
];

export const A = {
  key: "A",
  name: "The brief",
  long: "The written brief, its shape read off the prose",
  from: "From Lemni (an agent is a numbered brief; branches written as sentences) and Base44 (the plain description stays above the diagram).",
  fit: "He writes one numbered paragraph. The hub reads it into steps: a bracketed word is the delegate type, “with 1” runs beside step 1, Call and Ask me lines become a Call and a question, If sentences become the orchestrator’s branches. The shape beside it redraws on every pause.",
  costs: [
    "A loose grammar to learn; a line the reader misses is invisible in the shape.",
    "Parallel steps and branches are only as clear as his sentences.",
    "No per-step fields (budget, owned files) unless written inline; typing grammar on a phone.",
  ],
  keeps: ["parser", "step", "standing", "rest", "ingress", "routine"],
  jobs: {
    create: {
      desk: createDesk,
      phones: createPhone,
      note: "Type in the brief: the shape redraws on the pause.",
      phoneNotes: ["The brief typed on the phone, its shape read under it."],
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Line 6 is not read as a step: it is highlighted and goes to the orchestrator as prose.",
      phoneNotes: ["The workflow opened under its row: line 6 goes as prose, the shape under it."],
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 8 in the Split, the shape lit by its work items; the asking node’s question opens under it.",
      phoneNotes: [
        "The workflow's runs: run 8 needs you, then the routine's runs before it.",
        "Run 8 opened: the shape lit, and step 4's question under it.",
      ],
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "Checks are sentences scored on each run’s reports; each mark is one run.",
      phoneNotes: ["The checks, each mark one run."],
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "The row’s ⋯ holds every way to manage it; Delete asks in place and names what it reaches.",
      phoneNotes: [
        "The row's ⋯ open: every way to manage the workflow.",
        "Delete asks in place under its row, naming its runs, its routine and the run still going.",
      ],
    },
  },
  motions: [
    {
      id: "a-redraw",
      job: "create",
      name: "Shape redraw",
      how: "Type in the brief, or press Play: steps that changed rise in from 0.96 with a 2px blur over 260ms on ease-out, 60ms apart; their edges draw along themselves over 280ms on ease-in-out.",
    },
  ],
};
