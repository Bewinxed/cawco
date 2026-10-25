/*
 * The pieces every drawing shares: the glyph helper, the reply-shortlist
 * workflow and its run 7, and the desk's and the phone's chrome as CawCo draws them.
 */
import { ICONS } from "./icons.js";

export const ic = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

export const esc = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A state's glyph, word and ink (The Glyph, Word, Hue Rule). */
export const STATE = {
  done: { icon: "done", ink: "g-done", word: "Done" },
  running: { icon: "working", ink: "g-live breathe", word: "Working" },
  needs: { icon: "needs", ink: "g-attn", word: "Needs you" },
  failed: { icon: "failed", ink: "g-fail", word: "Failed" },
  planned: { icon: "planned", ink: "g-idle", word: "Planned" },
  unplanned: { icon: "unplanned", ink: "g-new", word: "Not in the plan" },
};

export const glyph = (state, cls = "") => {
  const s = STATE[state];
  return `<span class="${s.ink}" role="img" aria-label="${s.word}">${ic(s.icon, cls)}</span>`;
};

export const KIND = {
  agent: { icon: "agent", word: "Agent" },
  call: { icon: "call", word: "Call" },
  wait: { icon: "wait", word: "Wait" },
  ask: { icon: "ask", word: "Ask me" },
};

export const kind = (k) =>
  `<span class="kind">${ic(KIND[k].icon)}${KIND[k].word}</span>`;

/*
 * The workflow every option draws is his own work: the Cawco project's
 * routine "Daily reply shortlist for X" (06:30, the x-use connection,
 * account @cawcodev, read-only), laid out as five steps. The step words
 * are its prompt's; the delegate types (research, low) are the hub's.
 */
export const PROJECT = "Cawco";
export const MACHINE = "obelisk-of-light";
export const WF = "Reply shortlist";

export const STEPS = [
  {
    n: 1,
    title: "Find 8–12 posts from the last 24 hours",
    short: "Find posts",
    kind: "agent",
    who: "research",
    after: [],
    brief:
      "Find 8–12 posts from the last 24 hours where developers talk about running Claude Code, OpenCode or pi across several sessions or machines.",
  },
  {
    n: 2,
    title: "Read @cawcodev’s recent posts",
    short: "Read our posts",
    kind: "agent",
    who: "low",
    after: [],
    brief: "search_profile on cawcodev · read-only tools only",
  },
  {
    n: 3,
    title: "Read each post through x-use",
    short: "Read via x-use",
    kind: "call",
    who: "x-use",
    after: [1, 2],
    brief: "get_tweet · approved at start",
  },
  {
    n: 4,
    title: "Which replies do you keep?",
    short: "Which replies?",
    kind: "ask",
    who: "you",
    after: [3],
    brief: "all of them or none",
  },
  {
    n: 5,
    title: "Measure posts after 48 hours",
    short: "Measure at 48h",
    kind: "agent",
    who: "low",
    after: [4],
    brief: "if you keep any · done when each kept reply has its numbers",
  },
];

/** Run 7 as it stands: three done, one asking, one planned. */
export const RUN = {
  1: { state: "done", took: "1m 3s", report: "11 posts from the last 24 hours" },
  2: { state: "done", took: "48s", report: "Read @cawcodev’s last 20 posts" },
  3: {
    state: "done",
    took: "2s",
    report: "Read 11 posts · approved at start",
  },
  4: { state: "needs", took: "1m", report: "Waiting on you" },
  5: { state: "planned", took: "", report: "Waits on 4 · if you keep any" },
};

export const RUNS = [
  {
    n: 7,
    when: "4m ago",
    v: 3,
    state: "running",
    outcome: "Running",
    took: "4m",
    steps: "3 of 5",
    score: "2 of 3 so far",
    cost: "0.41",
  },
  {
    n: 6,
    when: "Oct 21",
    v: 3,
    state: "done",
    outcome: "Delivered",
    took: "9m",
    steps: "5 of 5",
    score: "3 of 3",
    cost: "0.88",
  },
  {
    n: 5,
    when: "Oct 18",
    v: 2,
    state: "failed",
    outcome: "Failed, ran again",
    took: "6m",
    steps: "5 of 5",
    score: "1 of 3",
    cost: "0.52",
  },
  {
    n: 4,
    when: "Oct 17",
    v: 2,
    state: "done",
    outcome: "Delivered",
    took: "8m",
    steps: "5 of 5",
    score: "3 of 3",
    cost: "0.79",
  },
];

/** The checks, each with its runs as marks: 1 passed, 0 failed, null not yet. */
export const CHECKS = [
  {
    text: "The shortlist holds 8–12 posts",
    marks: [1, 1, 0, 1, 1, 1],
    pass: "5 of 6",
  },
  {
    text: "Every post is from the last 24 hours",
    marks: [1, 1, 1, 1, 1, 1],
    pass: "6 of 6",
  },
  {
    text: "Nothing was posted, liked or followed",
    marks: [1, 0, 1, 1, 1, 1, null],
    pass: "5 of 6",
  },
];

export const marks = (list) =>
  `<span class="marks" role="img" aria-label="${list.filter((m) => m === 1).length} passed of ${list.filter((m) => m !== null).length}">${list
    .map((m) => {
      if (m === null) {
        return '<i class="n"></i>';
      }
      return m === 1 ? "<i></i>" : '<i class="f"></i>';
    })
    .join("")}</span>`;

export const btn = (
  label,
  { v = "", icon = "", size = "", play = "", id = "" } = {}
) => {
  const attrs = [
    `class="btn ${v} ${size}${label ? "" : " icon"}"`,
    'type="button"',
    play ? `data-play="${play}"` : "",
    id ? `id="${id}"` : "",
    label ? "" : `aria-label="${esc(icon)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<button ${attrs}>${icon ? ic(icon) : ""}${label ? `<span>${label}</span>` : ""}</button>`;
};

export const badge = (text, tone = "", icon = "") =>
  `<span class="badge ${tone}">${icon ? ic(icon) : ""}<span>${text}</span></span>`;

export const chip = (text, { on = false, icon = "" } = {}) =>
  `<span class="chip${on ? " on" : ""}">${icon ? ic(icon) : ""}<span>${text}</span></span>`;

export const seg = (items, chosen, name) =>
  `<div class="seg" role="group" aria-label="${name}" data-seg="${name}"><span class="seg-thumb" aria-hidden="true"></span>${items
    .map(
      (item) =>
        `<button type="button" class="seg-item" data-value="${item.value}" aria-pressed="${item.value === chosen}">${item.icon ? ic(item.icon) : ""}${item.short ? `<span class="full">${item.label}</span><span class="short">${item.short}</span>` : `<span>${item.label}</span>`}${item.tag ? `<span class="tag">${item.tag}</span>` : ""}</button>`
    )
    .join("")}</div>`;

export const block = ({ icon, title, count = "", acts = "", body, cls = "" }) =>
  `<section class="block ${cls}"><header class="bhead">${ic(icon)}<h4>${title}</h4>${count ? `<span class="count num">${count}</span>` : ""}<div class="acts">${acts}</div></header>${body}</section>`;

/* ----------------------------------------------------------- the desk */

const treeRow = ({ depth = 0, mark, title, age = "", cls = "", dot = "" }) =>
  `<div class="trow ${cls}" data-depth="${depth}" style="--depth:${depth}">${mark}${dot}<span class="trunc">${title}</span><span class="age num">${age}</span></div>`;

const tile = (icon, dot = "") =>
  `<span class="tmark"${dot ? ` data-dot="${dot}"` : ""}>${ic(icon)}</span>`;

const bare = (state) => `<span class="tmark bare">${glyph(state)}</span>`;

const railRun = (extra) => {
  const rows = [
    treeRow({
      mark: tile("workflow", "attn"),
      title: `Workflow · ${WF} · run 7`,
      age: "4m",
    }),
    treeRow({
      depth: 1,
      mark: bare("done"),
      title: STEPS[0].title,
      age: "3m",
    }),
    treeRow({
      depth: 1,
      mark: bare("done"),
      title: STEPS[1].title,
      age: "3m",
    }),
    ...(extra
      ? [
          treeRow({
            depth: 1,
            mark: bare("unplanned"),
            title: "Check the DM drafts",
            age: "20s",
            cls: "unplanned",
          }),
        ]
      : []),
    treeRow({
      depth: 1,
      mark: bare("needs"),
      title: STEPS[3].title,
      age: "1m",
    }),
  ];
  return rows.join("");
};

export const rail = ({
  drift = false,
} = {}) => `<aside class="rail" aria-label="Rail">
  <div class="rail-brand"><span class="wordmark">Caw&amp;Co</span>${btn("", { v: "ghost", size: "sm", icon: "plus" })}</div>
  <nav class="rail-group" aria-label="Home">
    <span class="nav">${ic("monitor")}<span>Fleet</span><span class="count num">1</span></span>
    <span class="nav">${ic("working")}<span>Working</span><span class="count num">1</span></span>
    <span class="nav">${ic("done")}<span>Finished</span><span class="count num">4</span></span>
  </nav>
  <div class="rail-group"><p class="rail-h">${MACHINE}</p><div class="tree">${railRun(drift)}</div></div>
  <div class="rail-group"><p class="rail-h">Projects</p>
    <span class="nav on">${ic("folder")}<span class="trunc">${PROJECT}</span><span class="count num">1</span></span>
  </div>
</aside>`;

const VIEWS = ["Board", "Table", "Routines", "Workflows", "Decisions"];

export const bar = () => `<header class="bar">
  <nav class="strip" aria-label="Views">${VIEWS.map((v) => `<span class="tab${v === "Workflows" ? " on" : ""}">${v}</span>`).join("")}</nav>
  <div class="bar-end">${btn("New task", { size: "sm", icon: "plus" })}</div>
</header>`;

/** A machine drawn as a place: its OS mark and its name (The Title Bars Follow Liquid Glass Rule). */
export const place = (name = MACHINE) =>
  `<span class="place">${ic("tux")}<span>${esc(name)}</span></span>`;

/** One capsule of the panel's glass holding bare items: [icon, name] for a symbol, [ "", words ] for a word. */
export const glass = (items, cls = "") =>
  `<div class="glass ${cls}" role="group">${items
    .map(([icon, name]) =>
      icon
        ? `<button type="button" class="gi" aria-label="${esc(name)}" title="${esc(name)}">${ic(icon)}</button>`
        : `<button type="button" class="gi words">${esc(name)}</button>`
    )
    .join("")}</div>`;

/** The project's head: one row, its name leading, the machine and its acts trailing in glass. */
export const projectHead = () => `<header class="phead">
  <h3 class="phead-title"><span class="pmark">${ic("folder")}</span><span class="trunc">${PROJECT}</span></h3>
  <div class="phead-end"><div class="glass" role="group" aria-label="Machine"><span class="gi words" title="On ${MACHINE}">${place()}</span></div>${glass(
    [
      ["", "Ask Caw"],
      ["", "Spin off"],
    ],
    "acts-words"
  )}</div>
</header>`;

export const desk = ({
  pane,
  split = "",
  drift = false,
}) => `<div class="frame desk" data-frame="desk">
  ${rail({ drift })}
  <div class="main">${bar()}
    <div class="page${split ? " with-split" : ""}"><div class="pane">${projectHead()}${pane}</div>${split}</div>
  </div>
</div>`;

/**
 * A run opened in the Split beside the view. Its head is one row: the view's
 * own short name, then one glass group of bare symbols, Close last. What the
 * run is doing (`facts`) is content, the first line of its body, with the
 * machine drawn as a place.
 */
export const splitPane = ({
  title = "",
  label = title,
  facts = "",
  acts = [],
  body,
  asking = false,
}) => `<aside class="split" aria-label="${esc(label)}">
  <header class="split-head">${title ? `<h4 class="trunc">${esc(title)}</h4>` : '<span class="grow"></span>'}${glass([...acts, ["close", "Close"]])}</header>
  <div class="split-body">${facts ? `<p class="facts meta num">${facts} · ${place()}</p>` : ""}${body}</div>
  <div class="composer"><span>Message the orchestrator…</span>${btn("", { v: asking ? "secondary" : "primary", size: "sm", icon: "arrow" })}</div>
</aside>`;

/* ---------------------------------------------------------- the phone */

export const phone = ({
  title,
  back = false,
  body,
  foot = "",
}) => `<div class="frame phone" data-frame="phone">
  <header class="pbar">${back ? btn("", { v: "ghost", icon: "left" }) : btn("", { v: "ghost", icon: "sidebar" })}<span class="t">${title}</span>${btn("", { v: "ghost", icon: "more" })}</header>
  <div class="pbody">${body}</div>
  <footer class="pfoot">${foot || `${btn("Workflows", { size: "sm", icon: "down" })}${btn("", { size: "sm", icon: "plus" })}`}</footer>
</div>`;

export const composerFoot = () =>
  `<div class="composer inline"><span>Message the orchestrator…</span>${btn("", { v: "primary", size: "sm", icon: "arrow" })}</div>`;

/* ------------------------------------------------- shared run drawings */

/** A run's steps as lit tree rows: glyph, title, took; the report's first line under it. */
export const runTree = ({ ask = "", drift = false, stepsOf = STEPS } = {}) => {
  const rows = [
    `<div class="runrow"><span>${glyph("running")}</span><span class="t">Workflow · ${WF}</span><span class="r">orchestrator</span></div>`,
  ];
  for (const s of stepsOf) {
    const r = RUN[s.n];
    if (drift && s.n === 3) {
      rows.push(
        `<div class="runrow unplanned" data-depth="1" style="--depth:1"><span>${glyph("unplanned")}</span><span class="t">Check the DM drafts</span><span class="r num">${glyph("running", "sm")} 20s</span><span class="d">Not in v3 · the orchestrator added it ${btn("Keep", { v: "secondary", size: "xs" })}</span></div>`
      );
    }
    rows.push(
      `<div class="runrow ${r.state}" data-depth="1" style="--depth:1"${s.n === 4 ? ' data-ask-row=""' : ""}><span>${glyph(r.state)}</span><span class="t">${s.title}</span><span class="r num">${r.took || kind(s.kind)}</span><span class="d">${r.report}</span></div>${s.n === 4 ? ask : ""}`
    );
  }
  return `<div class="stack" style="gap:0">${rows.join("")}</div>`;
};

/** The question of step 4, opened in place under its row. */
export const askTile = ({ chosen = "" } = {}) => `<div class="ask">
  <p class="q">${STEPS[3].title}</p>
  <p class="why">Step 5 measures only the replies you keep. The orchestrator waits here.</p>
  <div class="opts"><span class="opt${chosen === "all" ? " on" : ""}"><span class="key">1</span>all 11</span><span class="opt${chosen === "none" ? " on" : ""}"><span class="key">2</span>none</span><span class="grow"></span>${btn("Answer", { v: "primary", size: "sm" })}</div>
</div>`;

export const runsLedger = ({
  compare = false,
  rows = RUNS,
} = {}) => `<div class="card"><table class="ledger">
  <colgroup><col style="width:28px"><col style="width:92px"><col style="width:36px"><col><col style="width:64px"><col style="width:72px"><col style="width:${compare ? 104 : 96}px"><col style="width:52px"></colgroup>
  <thead><tr><th class="lead"><span class="sr-only">State</span></th><th>When</th><th>v</th><th>Outcome</th><th>Took</th><th>Steps</th><th>${compare ? "vs run 7" : "Checks"}</th><th class="end">$</th></tr></thead>
  <tbody>${rows
    .map(
      (r) =>
        `<tr><td class="lead">${glyph(r.state)}</td><td class="num">${r.when}</td><td class="num">${r.v}</td><td class="name">${r.outcome}</td><td class="num">${r.took}</td><td class="num">${r.steps}</td><td class="num">${compare ? r.delta : r.score}</td><td class="num end">${r.cost}</td></tr>`
    )
    .join("")}</tbody></table></div>`;

export const checksList = ({ scope = false, extra = "" } = {}) =>
  `<div class="card checks">${CHECKS.map(
    (c, i) =>
      `<div class="check">${ic("checks", "g-idle")}<span class="t">${c.text}</span>${marks(c.marks)}<span class="s">${c.pass}</span>${scope && i === 2 ? '<span class="scope">Scored on step 3’s report alone</span>' : ""}</div>`
  ).join("")}${extra}</div>`;

/** The ⋯ menu a workflow's row opens: every way to manage it. */
export const manageMenu = ({
  style,
  extra = "",
  hot = "Delete workflow…",
}) => `<div class="menu" role="menu" style="${style}">
  ${[
    ["play", "Run now", ""],
    ["calendar", "Start on a schedule", ""],
    ["copy", "Duplicate", ""],
    ["pause", "Pause", ""],
    ["runs", "Versions", "3"],
  ]
    .map(
      ([i, t, k]) =>
        `<span class="mi${t === hot ? " hot" : ""}" role="menuitem">${ic(i)}<span>${t}</span><span class="k num">${k}</span></span>`
    )
    .join("")}${extra}
  <span class="msep" role="separator"></span>
  <span class="mi danger${hot === "Delete workflow…" ? " hot" : ""}" role="menuitem">${ic("trash")}<span>Delete workflow…</span><span></span></span>
</div>`;

/** Asking in the page before a delete: what it reaches, named. */
export const deleteAsk =
  () => `<div class="askhere" role="group" aria-label="Delete ${WF}?">
  <p class="t">Delete ${WF}?</p>
  <ul>
    <li>${ic("runs", "sm")}<span>Its 7 runs stay in Runs, read-only, with their reports and scores.</span></li>
    <li>${ic("calendar", "sm")}<span>The routine “Daily reply shortlist for X” starts it every day at 06:30; that routine stops and waits for you to point it elsewhere.</span></li>
    <li>${ic("working", "sm")}<span>Run 7 is still going: it finishes on v3 unless you stop it.</span></li>
  </ul>
  <div class="row">${btn("Cancel", { v: "ghost", size: "sm" })}${btn("Delete workflow", { v: "danger", size: "sm" })}</div>
</div>`;

/** The delete's question, unfolded in the ledger under the row that asked it. */
export const askUnder = () =>
  `<div class="well"><div style="max-inline-size:440px;margin-inline-start:28px">${deleteAsk()}</div></div>`;
