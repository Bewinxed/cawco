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
  glyph,
  ic,
  manageMenu,
  phone,
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
        <div class="row"><span class="field focus grow"><span>Release</span></span></div>
        <p class="meta">Write it as numbered steps. A word in brackets is who does it; “with 1” runs beside step 1; “Post”, “Ask me” and “If” lines become a call, a question and a branch.</p>
        ${editor(BRIEF, 150)}
        ${inputsLine('<span class="meta">read from {{version}}</span>')}
        <div class="row-wrap" style="justify-content:space-between"><span class="meta">${ic("keep", "sm")} Or keep a finished run: its ⋯ › Keep as workflow writes this brief from its delegates.</span><span class="acts">${btn("Create workflow", { v: "primary", size: "sm" })}</span></div>
      </div></div>`,
    }),
  });

const createPhone = () => [
  phone({
    title: "New workflow",
    back: true,
    body: `<div class="ptitle"><h4>New workflow</h4><p>Numbered steps; the shape is read as you write.</p></div>
      <span class="field focus"><span>Release</span></span>
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
  ${versionLine(`${btn("Run now", { size: "sm", icon: "play" })}${btn("Save as v4", { v: "primary", size: "sm" })}`)}
</div>`;

const editDesk = () =>
  desk({
    pane: `${wfLedger({ open: openWell(BRIEF_SLIPPED) })}`,
  });

const editPhone = () => [
  phone({
    title: "Release app",
    body: `${wfPhoneList({
      open: `<div class="stack" style="padding-block:var(--space-2)">${briefLines(BRIEF_SLIPPED)}${shapeView(parseBrief(BRIEF_SLIPPED), { w: 120 })}</div>`,
    })}`,
    foot: `${btn("Run now", { icon: "play" })}${btn("Save as v4", { v: "primary" })}`,
  }),
];

const runSplit = () =>
  splitPane({
    title: "Release 2.4 · run 12",
    meta: "v3 · 3 of 5 steps · 4m · $0.41 · obelisk",
    asking: true,
    acts: btn("Stop run", { size: "sm", icon: "stop" }),
    body: `${shapeView(PLAN, { lit: true, caption: "Run 12, lit by its work items", w: 150 })}${askTile()}
      <p class="meta">${glyph("done", "sm")} Checks so far: 2 of 3</p>`,
  });

const runDesk = () =>
  desk({
    pane: `${wfLedger()}${block({ icon: "runs", title: "Runs", count: "12", body: runsLedger() })}`,
    split: runSplit(),
  });

const runPhone = () => [
  phone({
    title: "Release 2.4",
    body: `<div class="ptitle"><h4>Release 2.4</h4><p>v3 · 12 runs</p></div>
      <div class="pcard">${[
        ["running", "Run 12", "4m ago · 3 of 5 · needs you"],
        ["done", "Run 11", "Tue 05:12 · delivered · 9m"],
        ["failed", "Run 10", "Mon 17:40 · smoke test: 2 failed"],
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
    body: `<div class="ptitle"><h4>Release 2.4 · run 12</h4><p class="num">Working · 4m · v3 · $0.41</p></div>
      ${shapeView(PLAN, { lit: true, caption: "Lit by its work items", w: 122 })}${askTile({ chosen: "beta" })}`,
    foot: btn("Stop run", { icon: "stop" }),
  }),
];

const evalDesk = () =>
  desk({
    pane: `${wfLedger()}
      ${block({ icon: "checks", title: "Checks", count: "3", acts: btn("Add a check", { size: "sm", icon: "plus" }), body: checksList() })}
      <p class="meta">A judge reads each run’s reports against these sentences once the run ends. Each mark is one run, newest last.</p>
      ${block({ icon: "runs", title: "Runs", count: "12", body: runsLedger() })}`,
  });

const evalPhone = () => [
  phone({
    title: "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>Checks</h4><p>Scored on every run’s reports</p></div>${checksList()}
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
    title: "Release app",
    body: `<div class="ptitle"><h4>Workflows</h4><p>2 workflows</p></div>${wfPhoneList()}${deleteAsk()}`,
  }),
];

export const A = {
  key: "A",
  name: "The brief",
  long: "The written brief, its shape read off the prose",
  from: "From Lemni (an agent is a numbered brief; branches written as sentences) and Base44 (the plain description stays above the diagram).",
  fit: "He writes one numbered paragraph. The hub reads it into steps: a bracketed word is the delegate type, “with 1” runs beside step 1, Post and Ask me lines become a Call and a question, If sentences become the orchestrator’s branches. The shape beside it redraws on every pause.",
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
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Line 6 is not read as a step: it is highlighted and goes to the orchestrator as prose.",
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 12 in the Split, the shape lit by its work items; the asking node’s question opens under it.",
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "Checks are sentences under the brief; each mark is one run.",
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "The row’s ⋯ holds every way to manage it; Delete asks in place and names what it reaches.",
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
