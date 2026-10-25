/* Option C: the canvas, nodes and edges that carry the rule (Relevance AI, Gumloop). */
import {
  askTile,
  badge,
  btn,
  checksList,
  deleteAsk,
  desk,
  facts,
  ic,
  kind,
  liveFacts,
  paneHead,
  phone,
  STEPS,
  seg,
} from "./parts.js";
import { PLAN, shapeView } from "./shape.js";

/** A new canvas holds only its Start node; pressing Agent in the tray adds the first step. */
export const C_START = [];
export const C_GROWN = [
  {
    n: 1,
    title: "Find posts",
    kind: "agent",
    who: "research",
    with: 0,
    cond: "",
    unparsed: false,
  },
];

const tray = () =>
  `<div class="tray" role="toolbar" aria-label="Add a node">${[
    ["agent", "Agent", "c-add"],
    ["call", "Call", ""],
    ["wait", "Wait", ""],
    ["ask", "Ask me", ""],
    ["workflow", "Workflow", ""],
  ]
    .map(([i, t, p]) => btn(t, { v: "ghost", size: "sm", icon: i, play: p }))
    .join("")}</div>`;

/** The canvas's head: one row, its name, Run now in glass and Publish as the one prominent act. */
const head = (title = "Reply shortlist") =>
  paneHead({
    title,
    acts: [["play", "Run now"]],
    prominent: btn("Publish", { v: "primary", size: "sm" }),
  });

/** The canvas and its side panel; the canvas fills its box. */
const surface = (canvas, side, h = 640) =>
  `<div class="card surface" style="display:grid;grid-template-columns:minmax(0,1fr) 272px;block-size:${h}px">${canvas}${side}</div>`;

export const inspectorFor = (n) => {
  if (n === 4) {
    return `<h5>Which replies?</h5><span class="lbl">Ask me · after Read via x-use</span>${askTile()}`;
  }
  if (n === 1) {
    return `<h5>Find posts</h5><span class="lbl">Agent · research</span><span class="field">${ic("user")}<span class="grow">research</span>${ic("sort")}</span><span class="lbl">Brief</span><div class="argwell" style="font:var(--type-body)">${STEPS[0].brief}</div>`;
  }
  return `<h5>Read via x-use</h5><span class="lbl">Call · after Find posts, Read our posts</span>
    <span class="lbl">Connection</span><span class="field">${ic("link")}<span class="grow">x-use</span>${ic("sort")}</span>
    <span class="lbl">Tool</span><code>get_tweet</code>
    <span class="lbl">Arguments</span><div class="argwell">{ <span class="k">"id"</span>: <span class="s">"{{post}}"</span> }</div>
    <span class="lbl">Approve</span>${seg(
      [
        { value: "start", label: "At start" },
        { value: "every", label: "Every run" },
      ],
      "start",
      "Approve in inspector"
    )}`;
};

export const inspector = (n) =>
  `<aside class="inspector" aria-label="Inspector"><div class="stack" data-inspector style="gap:var(--space-3)">${inspectorFor(n)}</div></aside>`;

const startInspector = () =>
  `<aside class="inspector" aria-label="Inspector"><h5>Start</h5><span class="lbl">Inputs</span><span class="field"><span class="mono">account</span><span class="grow ph">cawcodev</span></span><span class="lbl">Starts by</span><span class="field"><span class="grow">Run now, or a routine</span>${ic("sort")}</span><p class="meta">From a past run: Keep as workflow lays the finished tree out here, every edge fixed.</p></aside>`;

const createDesk = () =>
  desk({
    pane: `${head("New workflow")}${surface(
      `<div class="canvas" data-canvas-host>${shapeView(C_START, { start: true, caption: "Draft · drag a node from the tray", w: 160 })}${tray()}</div>`,
      startInspector()
    )}`,
  });

/** On the phone the canvas is a picture; steps are added as a list under it. */
const phoneStepList = (steps) =>
  `<div class="pcard">${steps
    .map(
      (s) =>
        `<div class="prow"><span class="g-idle">${ic("planned")}</span><span class="t">${s.title}</span><span class="r"></span><span class="m">${kind(s.kind)} · ${s.who}</span></div>`
    )
    .join(
      ""
    )}<div class="prow"><span class="g-idle">${ic("plus")}</span><span class="t" style="color:var(--ink-subtle)">Add a step</span></div></div>`;

const createPhone = () => [
  phone({
    title: "New workflow",
    back: true,
    body: `${shapeView(C_START, { start: true, caption: "Draft", w: 120 })}${phoneStepList([])}`,
    foot: `${btn("Cancel", { v: "ghost" })}${btn("Create", { v: "primary" })}`,
  }),
];

const canvasSel = (sel, lit = false) =>
  `<div class="canvas" data-canvas-pick>${shapeView(PLAN, { start: true, sel, lit, caption: lit ? "Lit by its work items" : "Draft · click a node", w: 164 })}${lit ? "" : tray()}</div>`;

const editDesk = () =>
  desk({ pane: `${head()}${surface(canvasSel(3), inspector(3))}` });

const readOnlyPhone = (lit) =>
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${facts(lit ? liveFacts() : [`${ic("eye", "sm")}<span>Read-only on the phone</span>`, "v1"])}
      ${shapeView(PLAN, { start: true, lit, sel: lit ? 4 : 3, caption: lit ? "Tap a node" : "Read-only", w: 120 })}
      <div class="pcard">${lit ? askTile({ chosen: "all" }) : inspectorFor(3)}</div>`,
    foot: lit
      ? btn("Stop run", { icon: "stop" })
      : `${btn("Steps", { icon: "ledger" })}${btn("Run now", { v: "primary", icon: "play" })}`,
  });

const editPhone = () => [readOnlyPhone(false)];

const runDesk = () =>
  desk({
    pane: `${paneHead({ title: "Reply shortlist", back: "Back to the editor", acts: [["stop", "Stop run"]] })}
      ${facts(liveFacts())}
      ${surface(canvasSel(4, true), inspector(4), 660)}`,
  });

const runPhone = () => [readOnlyPhone(true)];

const evalDesk = () =>
  desk({
    pane: `${head()}${surface(
      `<div class="canvas">${shapeView(PLAN, {
        start: true,
        sel: 3,
        caption: "Published · checks pinned to nodes",
        w: 164,
        extraTag: `<span class="edge-tag" style="left:50%;top:199px;translate:96px -50%;border:1px solid var(--border-control);background:var(--surface-raised)">${ic("checks", "sm")} nothing posted · 7 of 7</span>`,
      })}</div>`,
      `<aside class="inspector" aria-label="Checks"><h5>Checks</h5><span class="lbl">The run’s, and one pinned to Read via x-use</span>${checksList({ scope: true })}${btn("Add a check", { size: "sm", icon: "plus" })}</aside>`
    )}`,
  });

const evalPhone = () => [
  phone({
    title: "Checks",
    back: true,
    body: `${checksList({ scope: true })}`,
  }),
];

const VERSIONS = [
  ["pen", "Draft", "edited, not run", ""],
  ["done", "v1", "Live · 8 runs", "Live"],
];

const versionRows = () =>
  VERSIONS.map(
    ([i, t, m, b]) =>
      `<div class="prow"><span class="${i === "done" ? "g-done" : "g-idle"}">${ic(i)}</span><span class="t">${t}</span><span class="r">${b ? badge(b, "done") : ""}</span><span class="m">${m}</span></div>`
  ).join("");

const versions =
  () => `<aside class="inspector" aria-label="Versions"><h5>Versions</h5>
  <p class="meta">Save makes a draft to try. Publish makes it the version every run starts.</p>
  <div class="pcard" style="padding-block:0">${versionRows()}</div>
  ${deleteAsk()}
</aside>`;

const deleteDesk = () =>
  desk({
    pane: `${head()}<div class="card surface" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;block-size:680px"><div class="canvas">${shapeView(PLAN, { start: true, caption: "Draft", w: 150 })}</div>${versions()}</div>`,
  });

const deletePhone = () => [
  phone({
    title: "Reply shortlist",
    back: true,
    body: `${shapeView(PLAN, { start: true, caption: "Draft", w: 120 })}<div class="pcard">${versionRows()}</div>${deleteAsk()}`,
  }),
];

export const C = {
  key: "C",
  name: "Canvas",
  long: "The canvas: nodes, and edges that carry the rule",
  from: "From Relevance AI (a Workforce canvas of Trigger, Agent, Tool and Condition nodes; the delegation rule is stored on the edge in words; dashed for “the orchestrator decides”) and Gumloop (any workflow becomes a node in another).",
  fit: "A free canvas: a Start node, a tray of Agent, Call, Wait, Ask me and Workflow nodes, edges that are fixed or the orchestrator’s choice with a sentence, and an inspector for the chosen node. A run lights the same canvas.",
  costs: [
    "The most to build and the most to operate: tray, inspector, edge dialog, positions.",
    "Not editable by a finger: the phone falls back to a read-only picture and a second editor.",
    "A dashed “decides” edge is the only honest drawing of a model’s choice, and says less than a sentence.",
  ],
  keeps: ["step", "standing", "rest", "ingress", "routine", "positions"],
  jobs: {
    create: {
      desk: createDesk,
      phones: createPhone,
      note: "A blank canvas from its Start node, with the tray. Press Agent in the tray: the first node joins under Start.",
      phoneNotes: [
        "On the phone the new canvas is a picture of its Start node; steps are added as a list under it.",
      ],
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Click a node: the inspector changes to it in place.",
      phoneNotes: [
        "Read-only on the phone: the canvas with Read via x-use chosen, its settings under it.",
      ],
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "Run 8 lights the same canvas; the asking node’s question stands in the inspector.",
      phoneNotes: ["Run 8 on the phone: the canvas lit, step 4's question under it."],
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "A check can be pinned to a node and scored on that node’s report.",
      phoneNotes: ["The checks, one of them pinned to Read via x-use."],
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "Draft and published versions beside the canvas; Delete asks under them.",
      phoneNotes: [
        "The canvas, its draft and live versions, then Delete asking what it reaches.",
      ],
    },
  },
  motions: [
    {
      id: "c-add",
      job: "create",
      name: "A node joins",
      how: "Press Agent in the tray: the new node rises in under Start from 0.96 over 260ms on ease-out and its edge draws along itself over 280ms; press it again and the node leaves.",
    },
    {
      id: "c-select",
      job: "edit",
      name: "The inspector follows the pick",
      how: "Click another node: the inspector’s contents cross over 180ms on the drawer curve with a 2px blur; the chosen node’s edge steps up over 120ms.",
    },
  ],
};
