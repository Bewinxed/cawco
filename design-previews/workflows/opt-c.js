/* Option C: the canvas, nodes and edges that carry the rule (Relevance AI, Gumloop). */
import {
  askTile,
  badge,
  btn,
  checksList,
  deleteAsk,
  desk,
  glyph,
  ic,
  kind,
  phone,
  seg,
} from "./parts.js";
import { PLAN, shapeView } from "./shape.js";

export const C_START = [
  {
    n: 1,
    title: "Draft notes",
    kind: "agent",
    who: "writer",
    with: 0,
    cond: "",
    unparsed: false,
  },
];
export const C_GROWN = [
  ...C_START,
  {
    n: 2,
    title: "Check links",
    kind: "agent",
    who: "checker",
    with: 1,
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

const head = (state = "Draft") =>
  `<div class="row-wrap" style="justify-content:space-between"><span class="row">${ic("workflow")}<span class="label">Release 2.4</span>${badge(`v3 · ${state}`)}</span><span class="acts">${btn("Run now", { size: "sm", icon: "play" })}${btn("Publish", { v: "primary", size: "sm" })}</span></div>`;

const surface = (canvas, side, h = 640) =>
  `<div class="card" style="display:grid;grid-template-columns:minmax(0,1fr) 272px;block-size:${h}px">${canvas}${side}</div>`;

const edgeMenu =
  () => `<div class="menu" role="menu" style="inset-block-start:96px;inset-inline-start:calc(50% + 40px);min-inline-size:248px">
  <span class="mi hot" role="menuitem">${ic("arrow")}<span>Fixed: always next</span><span></span></span>
  <span class="mi" role="menuitem">${ic("sparkles")}<span>The orchestrator decides…</span><span></span></span>
  <span class="msep" role="separator"></span>
  <span class="meta" style="padding:var(--space-1) var(--space-2)">“Decides” takes a sentence: when the channel is beta.</span>
</div>`;

export const inspectorFor = (n) => {
  if (n === 4) {
    return `<h5>Which channel?</h5><span class="lbl">Ask me · after Post to Slack</span>${askTile()}`;
  }
  if (n === 1) {
    return `<h5>Draft notes</h5><span class="lbl">Agent · writer</span><span class="field">${ic("user")}<span class="grow">writer</span>${ic("sort")}</span><span class="lbl">Brief</span><div class="argwell" style="font:var(--type-body)">Draft the notes for {{version}} from the PRs merged since the last tag.</div><span class="lbl">Budget</span><span class="row"><span class="meter" style="--v:40%"><i></i></span><span class="meta num">$2 · 30 min</span></span>`;
  }
  return `<h5>Post to Slack</h5><span class="lbl">Call · after Draft notes, Check links</span>
    <span class="lbl">Connection</span><span class="field">${ic("link")}<span class="grow">slack-brand</span>${ic("sort")}</span>
    <span class="lbl">Tool</span><code>post</code>
    <span class="lbl">Arguments</span><div class="argwell">{ <span class="k">"text"</span>: <span class="s">"{{notes}}"</span> }</div>
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

const createDesk = () =>
  desk({
    pane: `${head()}${surface(
      `<div class="canvas" data-canvas-host>${shapeView(C_START, { start: true, caption: "New workflow · drag a node from the tray", w: 160 })}${edgeMenu()}${tray()}</div>`,
      `<aside class="inspector" aria-label="Inspector"><h5>Draft notes</h5><span class="lbl">Agent</span><span class="field">${ic("user")}<span class="grow">writer</span>${ic("sort")}</span><span class="lbl">Brief</span><span class="field"><span class="ph">What this agent does…</span></span><p class="meta">From a past run: Keep as workflow lays the finished tree out here, every edge fixed.</p></aside>`
    )}`,
  });

const createPhone = () => [
  phone({
    title: "New workflow",
    back: true,
    body: `<div class="ptitle"><h4>Edit on a desk</h4><p>A canvas is not drawn by a finger with any care. On the phone a workflow is made with the step list below, as option B’s.</p></div>
      <div class="pcard">${PLAN.slice(0, 3)
        .map(
          (s) =>
            `<div class="prow"><span class="g-idle">${ic("planned")}</span><span class="t">${s.title}</span><span class="r"></span><span class="m">${kind(s.kind)} · ${s.who}</span></div>`
        )
        .join(
          ""
        )}<div class="prow"><span class="g-idle">${ic("plus")}</span><span class="t" style="color:var(--ink-subtle)">Add a step</span></div></div>`,
  }),
];

const canvasSel = (sel, lit = false) =>
  `<div class="canvas" data-canvas-pick>${shapeView(PLAN, { start: true, sel, lit, caption: lit ? "Run 12 on the canvas" : "Click a node", w: 164 })}${lit ? "" : tray()}</div>`;

const editDesk = () =>
  desk({ pane: `${head()}${surface(canvasSel(3), inspector(3))}` });

const readOnlyPhone = (lit) =>
  phone({
    title: lit ? "Run 12" : "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>${lit ? "Release 2.4 · run 12" : "Release 2.4"}</h4><p>${lit ? "Working · 4m · 3 of 5" : "v3 · read-only here · edit on a desk"}</p></div>
      ${shapeView(PLAN, { start: true, lit, sel: lit ? 4 : 3, caption: lit ? "Tap a node" : "Read-only", w: 120 })}
      <div class="pcard">${lit ? askTile({ chosen: "beta" }) : inspectorFor(3)}</div>`,
    foot: lit
      ? btn("Stop run", { icon: "stop" })
      : `${btn("Steps", { icon: "ledger" })}${btn("Run now", { v: "primary", icon: "play" })}`,
  });

const editPhone = () => [readOnlyPhone(false)];

const runDesk = () =>
  desk({
    pane: `<div class="row-wrap" style="justify-content:space-between"><span class="row">${glyph("running")}<span class="label">Release 2.4 · run 12</span><span class="meta num">v3 · 3 of 5 · 4m · $0.41</span></span><span class="acts">${btn("Stop run", { size: "sm", icon: "stop" })}${btn("Back to the editor", { v: "ghost", size: "sm" })}</span></div>
      ${surface(canvasSel(4, true), inspector(4), 700)}`,
  });

const runPhone = () => [readOnlyPhone(true)];

const evalDesk = () =>
  desk({
    pane: `${head("Published")}${surface(
      `<div class="canvas">${shapeView(PLAN, {
        start: true,
        sel: 3,
        caption: "Checks pinned to nodes",
        w: 164,
        extraTag: `<span class="edge-tag" style="left:50%;top:199px;translate:96px -50%;border:1px solid var(--border-control);background:var(--surface-raised)">${ic("checks", "sm")} carries the version · 10 of 11</span>`,
      })}</div>`,
      `<aside class="inspector" aria-label="Checks"><h5>Checks</h5><span class="lbl">The run’s, and one pinned to Post to Slack</span>${checksList({ scope: true })}${btn("Add a check", { size: "sm", icon: "plus" })}</aside>`
    )}`,
  });

const evalPhone = () => [
  phone({
    title: "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>Checks</h4><p>One is pinned to a node</p></div>${checksList({ scope: true })}`,
  }),
];

const versions =
  () => `<aside class="inspector" aria-label="Versions"><h5>Versions</h5>
  <p class="meta">Save makes a draft to try. Publish makes it the version every run starts.</p>
  <div class="pcard" style="padding-block:0">${[
    ["pen", "Draft", "edited 2m ago · not run", ""],
    ["done", "v3", "Live · published Tue · 6 runs", "Live"],
    ["runs", "v2", "Oct 12 · 4 runs", ""],
    ["runs", "v1", "Oct 3 · 2 runs", ""],
  ]
    .map(
      ([i, t, m, b]) =>
        `<div class="prow"><span class="${i === "done" ? "g-done" : "g-idle"}">${ic(i)}</span><span class="t">${t}</span><span class="r">${b ? badge(b, "done") : ""}</span><span class="m">${m}</span></div>`
    )
    .join("")}</div>
  ${deleteAsk()}
</aside>`;

const deleteDesk = () =>
  desk({
    pane: `${head()}<div class="card" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;block-size:680px"><div class="canvas">${shapeView(PLAN, { start: true, caption: "Draft", w: 150 })}</div>${versions()}</div>`,
  });

const deletePhone = () => [
  phone({
    title: "Release 2.4",
    back: true,
    body: `<div class="ptitle"><h4>Versions</h4><p>Draft, then published</p></div>${versions()}`,
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
      note: "A blank canvas from Start; dragging from a node asks the edge’s kind. Press Agent in the tray.",
    },
    edit: {
      desk: editDesk,
      phones: editPhone,
      note: "Click a node: the inspector changes to it in place.",
    },
    run: {
      desk: runDesk,
      phones: runPhone,
      note: "The run lights the same canvas; the asking node’s question stands in the inspector.",
    },
    evaluate: {
      desk: evalDesk,
      phones: evalPhone,
      note: "A check can be pinned to a node and scored on that node’s report.",
    },
    delete: {
      desk: deleteDesk,
      phones: deletePhone,
      note: "Draft and published versions side by side with the canvas; Delete asks under them.",
    },
  },
  motions: [
    {
      id: "c-add",
      job: "create",
      name: "A node joins",
      how: "Press Agent in the tray: the node beside it slides to make room over 280ms on ease-in-out, the new node rises in from 0.96 over 260ms on ease-out and its edge draws along itself over 280ms.",
    },
    {
      id: "c-select",
      job: "edit",
      name: "The inspector follows the pick",
      how: "Click another node: the inspector’s contents cross over 180ms on the drawer curve with a 2px blur; the chosen node’s edge steps up over 120ms.",
    },
  ],
};
