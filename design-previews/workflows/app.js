/* The preview page: where a workflow lives, the hub's facts, then the four options by job. */
import { CRITIQUE } from "./critique.js";
import {
  addStep,
  crossSwap,
  fadeIn,
  keepFlight,
  motionOk,
  pickNode,
  pruneRow,
  redraw,
  toggleFold,
  wireBrief,
} from "./motion.js";
import { A } from "./opt-a.js";
import { B } from "./opt-b.js";
import { C, C_GROWN, C_START, inspectorFor } from "./opt-c.js";
import { D } from "./opt-d.js";
import { badge, btn, chip, glyph, ic, seg } from "./parts.js";
import { PLAN, shapeView } from "./shape.js";

const OPTIONS = { A, B, C, D };
const JOBS = [
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
  { value: "run", label: "Run and see runs", short: "Run" },
  { value: "evaluate", label: "Evaluate" },
  { value: "delete", label: "Delete" },
];

/** What each option asks the hub to keep, and what the hub can do today (report b0e2d2ac). */
const KEEPS = {
  step: {
    what: "The step field on delegate",
    today: "yes",
    how: "group makes the same trip today; one column and a pass-through",
  },
  standing: {
    what: "Standing approvals by (workflow, step, arguments)",
    today: "no",
    how: "a standing_approvals table matched in propose(), on a sorted-key hash",
  },
  rest: {
    what: "A REST connection, to POST to a webhook",
    today: "no",
    how: "a fourth transport, rest, and a fixed request tool",
  },
  ingress: {
    what: "A relay event reaching a waiting step",
    today: "no",
    how: "an event_waits table checked first in route(), waking the item",
  },
  routine: {
    what: "A routine that starts a workflow",
    today: "new",
    how: "a third “Each run starts” beside delegate and orchestrator",
  },
  parser: {
    what: "The brief’s reader and its parse",
    today: "new",
    how: "numbered lines to steps, kept with line anchors",
  },
  proposal: {
    what: "Caw’s draft as a proposal card",
    today: "new",
    how: "new UI, no new storage",
  },
  positions: {
    what: "Node positions, edge kinds, draft and published",
    today: "new",
    how: "in steps.json, beside a draft/published pair",
  },
  snapshot: {
    what: "A kept-tree snapshot per version",
    today: "new",
    how: "briefs, types, actions and answers of the kept run",
  },
};

const TODAY = {
  yes: () => badge("Yes today", "done", "done"),
  no: () => badge("Not yet", "", "planned"),
  new: () => badge("New", "", "plus"),
};

const state = { option: "B", job: "create" };

/** Each option's name as the phone's switch says it, so all four fit at 390. */
const SHORT = { A: "Brief", B: "Ledger", C: "Canvas", D: "Keep" };

/* ------------------------------------------------- where it lives */

const folder =
  () => `<div class="argwell" style="font:var(--type-code);line-height:1.9">
  <div>${ic("folder", "sm")} Cawco/</div>
  <div style="padding-inline-start:2ch">${ic("folder", "sm")} workflows/</div>
  <div style="padding-inline-start:4ch">${ic("folder", "sm")} reply-shortlist/</div>
  <div style="padding-inline-start:6ch">workflow.md <span class="g-idle">· the orchestrator’s brief</span></div>
  <div style="padding-inline-start:6ch">steps.json <span class="g-idle">· each step and what it waits for</span></div>
  <div style="padding-inline-start:6ch">checks.json <span class="g-idle">· what a judge scores</span></div>
  <div style="padding-inline-start:6ch">runs/7/ <span class="g-idle">· one folder per run</span></div>
  <div style="padding-inline-start:2ch">${ic("folder", "sm")} decisions/ <span class="g-idle">· as today</span></div>
</div>`;

const reach = (icon, title, body, foot) =>
  `<article class="pv-card"><header class="pv-card-head">${ic(icon)}<strong>${title}</strong></header>${body}<p class="pv-note">${foot}</p></article>`;

const lives = () => `<section class="pv-section pv-col" aria-labelledby="lives">
  <h2 class="pv-h2" id="lives">${ic("folder")}Where a saved workflow lives</h2>
  <p class="pv-sub">The same for every option. A routine is <em>when</em> something runs; a workflow is <em>what</em> runs and in what shape. They meet in one place, the routine form, and nowhere else.</p>
  <div class="pv-grid">
    ${reach(
      "files",
      "Kept in the project’s folder",
      folder(),
      "Beside decisions/, as decision pages are kept. The hub indexes it in a workflows table and keeps workflow_runs. Every save is a version; a run records the version it started on."
    )}
    ${reach(
      "monitor",
      "On a desk: a tab of its own",
      `<div class="bar" style="border-radius:var(--radius-md);overflow:clip"><nav class="strip">${["Board", "Table", "Routines", "Workflows", "Decisions"].map((v) => `<span class="tab${v === "Workflows" ? " on" : ""}">${v}</span>`).join("")}</nav></div><code>/project/cawco?view=workflows</code>`,
      "Between Routines and Decisions. Three blocks: Workflows, Runs, Checks. A workflow opens in place under its row; a run opens as its tree in the Split beside the view."
    )}
    ${reach(
      "workflow",
      "In the rail and the home lists",
      `<div class="tree">${[
        [0, "workflow", "Workflow · Reply shortlist · run 7", "4m", "attn"],
        [1, "done", "Find 8–12 posts from the last 24 hours", "3m", ""],
        [1, "done", "Read @cawcodev’s recent posts", "3m", ""],
        [1, "needs", "Which replies do you keep?", "1m", ""],
      ]
        .map(
          ([d, i, t, a, dot]) =>
            `<div class="trow" data-depth="${d}" style="--depth:${d}">${d ? `<span class="tmark bare">${glyph(i)}</span>` : `<span class="tmark" data-dot="${dot}">${ic(i)}</span>`}<span class="trunc">${t}</span><span class="age num">${a}</span></div>`
        )
        .join("")}</div>`,
      "A run is a session tree rooted “Workflow · …”, as “Routine · …” roots a routine’s run today; its delegates nest under it."
    )}
    ${reach(
      "phone",
      "On the phone and in the app",
      `<div class="pcard" style="padding-block:var(--space-1)">${["Board", "Table", "Routines", "Workflows", "Decisions"].map((v) => `<div class="mi${v === "Workflows" ? " hot" : ""}">${v === "Workflows" ? ic("tick") : "<span></span>"}<span>${v}</span><span></span></div>`).join("")}</div>`,
      "The view picker gains Workflows; the three blocks stack. In the iOS app: Project › Workflows; a run is the tree it already draws, and an ask arrives as the push it already answers."
    )}
    ${reach(
      "calendar",
      "Started by a routine",
      `<div class="stack"><span class="meta">Each run starts</span>${seg(
        [
          { value: "delegate", label: "A delegate" },
          { value: "orchestrator", label: "An orchestrator" },
          { value: "workflow", label: "A workflow", tag: "new" },
        ],
        "workflow",
        "Each run starts"
      )}<span class="field">${ic("workflow")}<span class="grow">Reply shortlist</span>${ic("sort")}</span></div>`,
      "The routine form’s third choice. A relay event can start one the same way, through a routine on that relay."
    )}
    ${reach(
      "runs",
      "What exists today",
      `<ul class="pv-list"><li>${ic("trash")}<span>The old engine, its editor, canvas, run view and the app’s screens were removed on Oct 23 (71a7fe215): “The delegation tree is the run.”</span></li><li>${ic("calendar")}<span>Since Oct 24 a routine can start an orchestrator that delegates (f4cb7dd4d, f9bebb6f3).</span></li><li>${ic("planned")}<span>No workflow object, list, editor, run view or evaluation exists yet.</span></li></ul>`,
      "Every option below is drawn on what the hub has now plus what it names it must keep."
    )}
  </div>
</section>`;

const facts = () => `<section class="pv-section pv-col" aria-labelledby="facts">
  <h2 class="pv-h2" id="facts">${ic("server")}What the hub can do today</h2>
  <p class="pv-sub">Settled by reading the hub’s code (report b0e2d2ac). The first is ready; the other three each name the smallest change.</p>
  <div class="pv-facts">${[
    [
      "Can delegate carry a step id to the work item and back?",
      "yes",
      "Yes. The group field already makes this exact trip, outside the gate and landing: a column, a one-line ALTER TABLE, and the field passed through delegation-tools, the route and nodeOf.",
    ],
    [
      "Can an approval stand for every run of a step?",
      "no",
      "Not today: one approval per row, by row id and the arguments’ hash. Smallest change: a standing_approvals table looked up in propose(); a match is filed approved by “standing:<id>” with no push. Hash sorted-key JSON.",
    ],
    [
      "Can a relay event reach a run waiting on it?",
      "no",
      "Not today: an event goes to a routine (a new run), the lead’s inbox, or nowhere. Smallest change: an event_waits table checked first in route(), waking the item through endWait with the event’s data.",
    ],
    [
      "Can a connection be a plain REST endpoint?",
      "no",
      "Not today: http means MCP Streamable HTTP, and every call is an MCP callTool. Smallest change: a rest transport with a base URL and the sealed key, restCall, and a fixed request tool so approved actions can name it.",
    ],
  ]
    .map(
      ([q, t, a]) =>
        `<div class="pv-fact"><span class="q">${q}</span>${TODAY[t]()}<span class="a">${a}</span></div>`
    )
    .join("")}</div>
</section>`;

/* ---------------------------------------------------------- options */

const switches = () => `<div class="pv-switches">
  <div class="pv-col" style="display:flex;flex-wrap:wrap;gap:var(--space-3) var(--space-5);align-items:center;inline-size:100%;padding:0">
  <span class="pv-switch-label">Option</span>
  ${seg(
    Object.values(OPTIONS).map((o) => ({
      value: o.key,
      label: `${o.key} · ${o.name}`,
      short: `${o.key} · ${SHORT[o.key]}`,
      tag: o.recommended ? "recommended" : "",
    })),
    state.option,
    "Option"
  )}
  <span class="pv-switch-label">Job</span>
  ${seg(JOBS, state.job, "Job")}
  </div>
</div>`;

const optionHead = (o) => `<div class="pv-option-head">
  <div>
    <h2 class="pv-option-name" id="option-name">${o.key}. ${o.long}${o.recommended ? badge("Recommended", "brand") : ""}</h2>
    <p class="pv-from">${o.from}</p>
    <p>${o.fit}</p>
  </div>
  <div class="stack" style="gap:var(--space-4)">
    <div class="stack"><p class="label">What it costs him</p><ul class="pv-list">${o.costs.map((c) => `<li>${ic("minus")}<span>${c}</span></li>`).join("")}</ul></div>
    <div class="stack"><p class="label">What the hub must keep</p><div class="pv-keeps">${o.keeps
      .map(
        (k) =>
          `<div class="pv-keep"><span>${KEEPS[k].what}<br><span class="meta">${KEEPS[k].how}</span></span>${TODAY[KEEPS[k].today]()}</div>`
      )
      .join("")}</div></div>
  </div>
</div>`;

const fit = (html, w, h, cls = "") =>
  `<div class="fit ${cls}" style="--frame-w:${w};--frame-h:${h}">${html}</div>`;

const stage = (o) => {
  const job = o.jobs[state.job];
  const phones = job.phones();
  return `<div id="stage" data-option="${o.key}" data-job="${state.job}">
    <div class="pv-col pv-stage-cap"><h3>Desk</h3><p>1440 × 900 · ${job.note}</p></div>
    ${fit(job.desk(), 1440, 900, "desk-fit")}
    <div class="pv-col pv-stage-cap"><h3>Phone</h3><p>390 × 844${phones.length > 1 ? " · two screens of one journey" : ""}</p></div>
    <div class="phones">${phones.map((p) => `<div class="phone-fit">${fit(p, 390, 844)}</div>`).join("")}</div>
  </div>`;
};

const motionsPanel = (o) => `<div class="pv-col pv-motion" aria-label="Motion">
  <p class="label">Its motion</p>
  ${o.motions
    .map(
      (m) =>
        `<div class="pv-motion-row"><div class="what"><strong>${m.name}</strong><p class="how">${m.how}</p></div><span class="meta">${JOBS.find((j) => j.value === m.job).label}</span>${btn("Play", { size: "sm", icon: "play", play: `run:${m.id}` })}</div>`
    )
    .join("")}
</div>`;

/** Mended in these drawings (“Was: …”), working as drawn, or the option's own cost left standing. */
const markOf = (it) => {
  if (it.text.startsWith("Was:")) {
    return "fixed";
  }
  return it.fixed ? "good" : "open";
};
const MARK_ICON = { fixed: "done", good: "tick", open: "minus" };

const critiquePanel = (o) => {
  const c = CRITIQUE[o.key];
  const list = (title, icon, items) =>
    `<article class="pv-card crit"><h4>${ic(icon)}${title}</h4><ul class="stack">${items.map((it) => `<li class="${markOf(it)}">${ic(MARK_ICON[markOf(it)])}<span>${it.text}</span></li>`).join("")}</ul></article>`;
  return `<div class="pv-col"><p class="label" style="margin-block-start:var(--space-6)">Critiques of option ${o.key}</p><p class="pv-note">${ic("done", "sm")} mended in these drawings · ${ic("tick", "sm")} works as drawn · ${ic("minus", "sm")} the option's own cost, left for you to weigh</p><div class="pv-critique">${list("Design Critique (interface-craft)", "eye", c.craft)}${list("impeccable critique", "checks", c.impeccable)}${list("Family Values", "keep", c.family)}</div></div>`;
};

/* ------------------------------------------------------ the wiring */

function placeThumb(group, instant = false) {
  const thumb = group.querySelector(".seg-thumb");
  const on = group.querySelector('[aria-pressed="true"]');
  if (!(thumb && on)) {
    return;
  }
  if (instant) {
    group.removeAttribute("data-ready");
  }
  thumb.style.setProperty("--thumb-x", `${on.offsetLeft}px`);
  thumb.style.setProperty("--thumb-w", `${on.offsetWidth}px`);
  if (instant) {
    thumb.getBoundingClientRect();
    requestAnimationFrame(() => group.setAttribute("data-ready", ""));
  }
}

function placeAll(root, instant = true) {
  for (const group of root.querySelectorAll(".seg")) {
    placeThumb(group, instant);
  }
}

const fitObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const box = entry.target;
    const w = Number(box.style.getPropertyValue("--frame-w"));
    const scale = Math.min(1, entry.contentRect.width / w);
    box.firstElementChild.style.setProperty("--fit", String(scale));
  }
});

function fitAll(root) {
  for (const box of root.querySelectorAll(".fit")) {
    fitObserver.observe(box);
  }
}

function wireStage(el) {
  wireBrief(el);
  const swap = el.querySelector("[data-swap]");
  if (swap) {
    el.ledgerHtml = swap.innerHTML;
  }
  if (el.dataset.option === "C" && el.dataset.job === "create") {
    el.playC = () => {
      const host = el.querySelector("[data-canvas-host]");
      const grown = host.querySelectorAll("[data-node]").length > 2;
      const shape = host.querySelector("[data-shape]");
      const holder = document.createElement("div");
      shape.replaceWith(holder);
      holder.style.display = "contents";
      holder.innerHTML = shape.outerHTML;
      redraw(
        holder,
        shapeView(grown ? C_START : C_GROWN, {
          start: true,
          caption: "New workflow · drag a node from the tray",
          w: 160,
        })
      );
    };
  }
}

function renderOption() {
  const o = OPTIONS[state.option];
  const host = document.querySelector("#option");
  host.innerHTML = `${optionHead(o)}${stage(o)}${motionsPanel(o)}${critiquePanel(o)}`;
  const el = host.querySelector("#stage");
  fitAll(host);
  placeAll(host);
  wireStage(el);
  return el;
}

function choose(name, value) {
  if (name === "Option") {
    state.option = value;
  } else {
    state.job = value;
  }
  const el = renderOption();
  fadeIn(el);
}

function playIn(el, id) {
  const plays = {
    "a-redraw": () => el.playA?.(),
    "b-add": () => addStep(el),
    "b-unfold": () => toggleFold(el),
    "b-shape": () => {
      const box = el.querySelector("[data-swap]");
      const group = el.querySelector('[data-seg="Steps as"]');
      const toShape = Boolean(box.querySelector("[data-steps]"));
      for (const item of group.querySelectorAll(".seg-item")) {
        item.setAttribute(
          "aria-pressed",
          String((item.dataset.value === "shape") === toShape)
        );
      }
      placeThumb(group);
      crossSwap(
        box,
        toShape
          ? shapeView(PLAN, { caption: "Drawn from the rows", w: 150 })
          : el.ledgerHtml
      );
    },
    "c-add": () => el.playC?.(),
    "c-select": () => {
      const current = Number(
        el.querySelector("[data-canvas-pick] .node.sel")?.dataset.node ?? 3
      );
      const next = current === 3 ? 1 : 3;
      pickNode(
        el,
        el.querySelector(`[data-canvas-pick] [data-node="${next}"]`),
        inspectorFor(next)
      );
    },
    "d-keep": () => keepFlight(el),
    "d-prune": () => pruneRow(el),
  };
  plays[id]?.();
}

function runMotion(id) {
  const o = OPTIONS[state.option];
  const m = o.motions.find((each) => each.id === id);
  let el = document.querySelector("#stage");
  if (m && state.job !== m.job) {
    state.job = m.job;
    el = renderOption();
    el.scrollIntoView({
      behavior: motionOk() ? "smooth" : "auto",
      block: "start",
    });
  }
  playIn(el, id);
}

function onClick(event) {
  const segItem = event.target.closest(".seg-item");
  if (segItem) {
    const group = segItem.closest(".seg");
    const name = group.dataset.seg;
    if (name === "Steps as") {
      if (segItem.getAttribute("aria-pressed") !== "true") {
        playIn(document.querySelector("#stage"), "b-shape");
      }
      return;
    }
    for (const item of group.querySelectorAll(".seg-item")) {
      item.setAttribute("aria-pressed", String(item === segItem));
    }
    placeThumb(group);
    if (name === "Option" || name === "Job") {
      choose(name, segItem.dataset.value);
    }
    if (name === "Theme") {
      document.documentElement.classList.toggle(
        "dark",
        segItem.dataset.value === "dark"
      );
    }
    return;
  }
  const play = event.target.closest("[data-play]");
  if (play) {
    const id = play.dataset.play;
    if (id.startsWith("run:")) {
      runMotion(id.slice(4));
    } else {
      playIn(play.closest("#stage") ?? document.querySelector("#stage"), id);
    }
    return;
  }
  const node = event.target.closest("[data-canvas-pick] [data-node]");
  if (node && Number(node.dataset.node) > 0) {
    const n = Number(node.dataset.node);
    pickNode(document.querySelector("#stage"), node, inspectorFor(n));
  }
}

function onKey(event) {
  const row = event.target.closest?.('[data-play="b-unfold"]');
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    toggleFold(document.querySelector("#stage"));
  }
}

function page() {
  const root = document.querySelector("#app");
  root.innerHTML = `<header class="pv-col pv-head">
      <div><p class="pv-mark"><span class="wordmark">Caw&amp;Co</span><span>· design preview</span></p>
      <h1 class="pv-title">Workflows: four ways to make one</h1>
      <p class="pv-lede">“A Workflows feature where you create, edit, design and visualise, delete, run and see the runs of, and evaluate workflows. Routines are not part of it. It runs on the delegation tree.” Each option is drawn at Desk 1440 and Phone 390, for every one of those jobs, on one workflow made of his own work: the Cawco project’s routine “Daily reply shortlist for X”, through x-use, as five steps.</p></div>
      ${seg(
        [
          { value: "light", label: "Day", icon: "sun" },
          { value: "dark", label: "Night", icon: "moon" },
        ],
        document.documentElement.classList.contains("dark") ? "dark" : "light",
        "Theme"
      )}
    </header>
    ${lives()}
    ${facts()}
    <section class="pv-section" aria-labelledby="options-h">
      <div class="pv-col"><h2 class="pv-h2" id="options-h">${ic("workflow")}The four options</h2>
      <p class="pv-sub">All four share the Workflows tab, the run drawn as its delegation tree, the Start sheet, Checks and Runs. They differ in the thing he writes and the picture he edits. Shared legend: ${glyph("done", "sm")} done, ${glyph("running", "sm")} working, ${glyph("needs", "sm")} needs you, ${glyph("failed", "sm")} failed, ${glyph("planned", "sm")} planned, ${glyph("unplanned", "sm")} not in the plan. ${chip("Call")} steps run through an approved action, never a model.</p></div>
      ${switches()}
      <div id="option"></div>
    </section>`;
  placeAll(root);
  renderOption();
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => placeAll(root));
  document.fonts.ready.then(() => placeAll(root));
}

page();
