/*
 * The pieces every drawing shares: the glyph helper, the reply-shortlist
 * workflow and its runs, and the desk's and the phone's chrome as CawCo draws them.
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

/*
 * One state of the world for every option, from his records. The routine's
 * seven runs are real (each one's session and report on the hub): the test
 * run and the first run on Oct 15 delivered, Oct 16–19 failed twice a day
 * because no x-use was connected, Oct 21 delivered. Run 8 is the one this
 * preview draws going, as the workflow would run it: it asks at step 4. No
 * cost or duration is drawn, because none is on record.
 */
export const LIVE = 8;
export const KEPT_RUN = 7;

/** Run 8 as it stands: three done, one asking, one planned. */
export const RUN = {
  1: { state: "done", report: "Posts found, each with a draft reply" },
  2: { state: "done", report: "x-use reads no follower counts, so picks go by views" },
  3: { state: "done", report: "Read through x-use · nothing posted" },
  4: { state: "needs", report: "Waiting on you" },
  5: { state: "planned", report: "Waits on 4 · if you keep any" },
};

/** The runs, newest first: run 8 going, then the routine's real runs. */
export const RUNS = [
  { n: 8, when: "Now", state: "needs", outcome: "Needs you at step 4", score: "when it ends" },
  { n: 7, when: "Oct 21", state: "done", outcome: "Delivered: 12 posts, 3 DM drafts", score: "3 of 3" },
  { n: 6, when: "Oct 19", state: "failed", outcome: "Failed twice: x-use not connected", score: "1 of 3" },
  { n: 5, when: "Oct 18", state: "failed", outcome: "Failed twice: x-use not connected", score: "1 of 3" },
  { n: 4, when: "Oct 17", state: "failed", outcome: "Failed twice: x-use not connected", score: "1 of 3" },
  { n: 3, when: "Oct 16", state: "failed", outcome: "Failed twice: x-use not connected", score: "1 of 3" },
  { n: 2, when: "Oct 15", state: "done", outcome: "Delivered: 10 posts, 3 DM drafts", score: "3 of 3" },
  { n: 1, when: "Oct 15", state: "done", outcome: "Test run: 11 posts, 3 DM drafts", score: "3 of 3" },
];

/** The checks, each with its runs as marks, oldest first: 1 passed, 0 failed, null not yet (run 8). */
export const CHECKS = [
  {
    text: "The shortlist holds 8–12 posts",
    marks: [1, 1, 0, 0, 0, 0, 1, null],
    pass: "3 of 7",
  },
  {
    text: "It drafts up to 3 DMs",
    marks: [1, 1, 0, 0, 0, 0, 1, null],
    pass: "3 of 7",
  },
  {
    text: "Nothing was posted, liked or followed",
    marks: [1, 1, 1, 1, 1, 1, 1, null],
    pass: "7 of 7",
  },
];

/** Facts about a surface, drawn as content under its bar (The Title Bars Follow Liquid Glass Rule). */
export const facts = (items) =>
  `<div class="facts">${items.map((i) => `<span class="fact">${i}</span>`).join("")}</div>`;

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

const treeRow = ({ depth = 0, mark, title, cls = "", dot = "" }) =>
  `<div class="trow ${cls}" data-depth="${depth}" style="--depth:${depth}">${mark}${dot}<span class="trunc">${title}</span><span class="age num"></span></div>`;

const tile = (icon, dot = "") =>
  `<span class="tmark"${dot ? ` data-dot="${dot}"` : ""}>${ic(icon)}</span>`;

const bare = (state) => `<span class="tmark bare">${glyph(state)}</span>`;

const railRun = (extra) => {
  const rows = [
    treeRow({ mark: tile("workflow", "attn"), title: `Workflow · ${WF}` }),
    treeRow({ depth: 1, mark: bare("done"), title: STEPS[0].title }),
    treeRow({ depth: 1, mark: bare("done"), title: STEPS[1].title }),
    ...(extra
      ? [
          treeRow({
            depth: 1,
            mark: bare("unplanned"),
            title: "Check the DM drafts",
            cls: "unplanned",
          }),
        ]
      : []),
    treeRow({ depth: 1, mark: bare("needs"), title: STEPS[3].title }),
  ];
  return rows.join("");
};

/** The rail: the fleet's four machines are his (obelisk-of-light, Omars-MacBook-Pro, niftybot.art, uwucloud). */
export const rail = ({
  drift = false,
} = {}) => `<aside class="rail" aria-label="Rail">
  <div class="rail-brand"><span class="wordmark">Caw&amp;Co</span>${btn("", { v: "ghost", size: "sm", icon: "plus" })}</div>
  <nav class="rail-group" aria-label="Home">
    <span class="nav">${ic("monitor")}<span>Fleet</span><span class="count num">4</span></span>
    <span class="nav">${ic("working")}<span>Working</span><span class="count num">1</span></span>
    <span class="nav">${ic("done")}<span>Finished</span><span class="count num"></span></span>
  </nav>
  <div class="rail-group"><p class="rail-h">${MACHINE}</p><div class="tree">${railRun(drift)}</div></div>
  <div class="rail-group"><p class="rail-h">Projects</p>
    <span class="nav on">${ic("folder")}<span class="trunc">${PROJECT}</span><span class="count num">1</span></span>
  </div>
</aside>`;

const VIEWS = ["Board", "Table", "Routines", "Workflows", "Decisions"];

/** The project's views as folder tabs on their shelf, the chosen one a sheet of the page (DESIGN.md, Folder tabs). */
export const viewStrip = () =>
  `<nav class="strip" aria-label="Views">${VIEWS.map((v) => `<span class="tab${v === "Workflows" ? " on" : ""}"${v === "Workflows" ? ' aria-current="page"' : ""}>${v}</span>`).join("")}</nav>`;

/*
 * The desk's top bar draws no ground, hairline or shadow of its own (The
 * Title Bars Follow Liquid Glass Rule). The folder tabs stand on their
 * shelf, the strip's own ground ("The folder tabs' shelf is the tab strip's
 * own ground, not a bar's"); New task floats in glass at the trailing end.
 * Its name is the rail's chosen project, so the page has no head of its own.
 */
export const bar = () => `<header class="bar"><span class="edge" aria-hidden="true"></span>
  ${viewStrip()}
  <div class="bar-end">${glass([["", "New task"]])}</div>
</header>`;

/** A machine drawn as a place: its OS mark and its name (The Title Bars Follow Liquid Glass Rule). */
export const place = (name = MACHINE) =>
  `<span class="place">${ic("tux")}<span>${esc(name)}</span></span>`;

/** One capsule of the panel's glass holding bare items: [icon, name] for a symbol, ["", words] for a word. */
export const glass = (items, cls = "") =>
  `<div class="glass ${cls}" role="group">${items
    .map(([icon, name]) =>
      icon
        ? `<button type="button" class="gi" aria-label="${esc(name)}" title="${esc(name)}">${ic(icon)}</button>`
        : `<button type="button" class="gi words">${esc(name)}</button>`
    )
    .join("")}</div>`;

/**
 * A pane's head as a bar: one row, the view's short name, then the trailing
 * glass and at most one prominent act. `back` leads it with the Back symbol
 * alone, named by where it goes.
 */
export const paneHead = ({ title, back = "", acts = [], prominent = "" }) =>
  `<header class="vhead">${back ? group([["left", back]]) : ""}<h3 class="trunc">${esc(title)}</h3><span class="grow"></span>${acts.length ? group(acts) : ""}${prominent}</header>`;

/**
 * A head's group in the page's flow (a pane's head, the Split's): two or
 * more symbols share one capsule of glass; a lone symbol stands bare, the
 * glyph alone, with no capsule drawn round it.
 */
const group = (items) => glass(items, items.length === 1 ? "lone" : "");

export const desk = ({
  pane,
  split = "",
  drift = false,
}) => `<div class="frame desk" data-frame="desk">
  ${rail({ drift })}
  <div class="main">${bar()}
    <div class="page${split ? " with-split" : ""}"><div class="pane">${pane}</div>${split}</div>
  </div>
</div>`;

/**
 * A run opened in the Split beside the view. Its head is one row: the
 * workflow's name, then one glass group of bare symbols, Close last. What
 * the run is doing (`facts`) is content, drawn under the head.
 */
export const splitPane = ({
  title = "",
  label = title,
  facts: list = [],
  acts = [],
  body,
  asking = false,
}) => `<aside class="split" aria-label="${esc(label)}">
  <header class="split-head">${title ? `<h4 class="trunc">${esc(title)}</h4>` : '<span class="grow"></span>'}${group([...acts, ["close", "Close"]])}</header>
  <div class="split-body">${list.length ? facts(list) : ""}${body}</div>
  <div class="composer"><span>Message the orchestrator…</span>${btn("", { v: asking ? "secondary" : "primary", size: "sm", icon: "arrow" })}</div>
</aside>`;

/* ---------------------------------------------------------- the phone */

/** The phone's foot when a screen names none: the view picker and New workflow, each in glass. */
const defaultFoot = () =>
  `<div class="glass" role="group"><button type="button" class="gi words">Workflows ${ic("down")}</button></div>${glass([["plus", "New workflow"]])}`;

/**
 * A phone screen. Its bar and its foot draw no ground: their controls float
 * in glass over the page, which runs under both and fades at each while
 * content passes under it.
 */
export const phone = ({
  title,
  back = false,
  body,
  foot = "",
}) => `<div class="frame phone" data-frame="phone">
  <header class="pbar"><span class="edge" aria-hidden="true"></span>${glass([back ? ["left", "Back to Workflows"] : ["sidebar", "Open the sidebar"]])}<span class="t">${title}</span>${glass([["more", "More"]])}</header>
  <div class="pbody">${body}</div>
  <footer class="pfoot">${foot || defaultFoot()}</footer>
</div>`;

/* ------------------------------------------------- shared run drawings */

/** The live run as a fact line: its glyph, its number and where it stands. */
export const liveFacts = (extra = []) => [
  `${glyph("needs", "sm")}<span>Run ${LIVE} · needs you at step 4</span>`,
  "3 of 5 steps",
  ...extra,
];

/**
 * A run's steps as lit tree rows: glyph, title, kind; the report's first line
 * under it. `against` is what the root row says of the run beside another.
 */
export const runTree = ({ ask = "", drift = false, stepsOf = STEPS, against = "" } = {}) => {
  const rows = [
    `<div class="runrow"><span>${glyph("needs")}</span><span class="t">Workflow · ${WF}</span><span class="r">orchestrator</span>${against ? `<span class="d">${against}</span>` : ""}</div>`,
  ];
  for (const s of stepsOf) {
    const r = RUN[s.n];
    if (drift && s.n === 3) {
      rows.push(
        `<div class="runrow unplanned" data-depth="1" style="--depth:1"><span>${glyph("unplanned")}</span><span class="t">Check the DM drafts</span><span class="r">Working</span><span class="d">Not in v1 · the orchestrator added it ${btn("Keep", { v: "secondary", size: "xs" })}</span></div>`
      );
    }
    rows.push(
      `<div class="runrow ${r.state}" data-depth="1" style="--depth:1"${s.n === 4 ? ' data-ask-row=""' : ""}><span>${glyph(r.state)}</span><span class="t">${s.title}</span><span class="r num">${kind(s.kind)}</span><span class="d">${r.report}</span></div>${s.n === 4 ? ask : ""}`
    );
  }
  return `<div class="stack" style="gap:0">${rows.join("")}</div>`;
};

/** The question of step 4, opened in place under its row. */
export const askTile = ({ chosen = "" } = {}) => `<div class="ask">
  <p class="q">${STEPS[3].title}</p>
  <p class="why">Step 5 measures only the replies you keep. The orchestrator waits here.</p>
  <div class="opts"><span class="opt${chosen === "all" ? " on" : ""}"><span class="key">1</span>keep all</span><span class="opt${chosen === "none" ? " on" : ""}"><span class="key">2</span>keep none</span><span class="grow"></span>${btn("Answer", { v: "primary", size: "sm" })}</div>
</div>`;

/** The runs ledger: when, outcome and checks, from the records; no cost or duration is on record. */
export const runsLedger = ({
  compare = false,
  rows = RUNS.slice(0, 5),
} = {}) => `<div class="card"><table class="ledger">
  <colgroup><col style="width:28px"><col style="width:84px"><col><col style="width:${compare ? 128 : 112}px"></colgroup>
  <thead><tr><th class="lead"><span class="sr-only">State</span></th><th>When</th><th>Outcome</th><th>${compare ? `vs run ${KEPT_RUN}` : "Checks"}</th></tr></thead>
  <tbody>${rows
    .map(
      (r) =>
        `<tr><td class="lead">${glyph(r.state)}</td><td class="num">${r.when}</td><td class="name">Run ${r.n} · ${r.outcome}</td><td class="num">${compare ? r.delta : r.score}</td></tr>`
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
    ["runs", "Versions", "1"],
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
    <li>${ic("runs", "sm")}<span>Its 8 runs stay in Runs, read-only, with their reports and scores.</span></li>
    <li>${ic("calendar", "sm")}<span>The routine “Daily reply shortlist for X” is set to start it at 06:30 each day (it is paused now); it stops and waits for you to point it elsewhere.</span></li>
    <li>${ic("working", "sm")}<span>Run 8 is still going: it finishes on v1 unless you stop it.</span></li>
  </ul>
  <div class="row">${btn("Cancel", { v: "ghost", size: "sm" })}${btn("Delete workflow", { v: "danger", size: "sm" })}</div>
</div>`;

/** The delete's question, unfolded in the ledger under the row that asked it. */
export const askUnder = () =>
  `<div class="well"><div style="max-inline-size:440px;margin-inline-start:28px">${deleteAsk()}</div></div>`;
