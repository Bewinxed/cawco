/* The preview page: what the list is for, the list in every state at Desk 1440 and Phone 390, its motion, and the critiques. */
import { CRITIQUE } from "./critique.js";
import { badgeOf, pane } from "./list.js";
import {
  deliver,
  filterTo,
  motionOk,
  openPage,
  reveal,
  sendRow,
  toggleFold,
} from "./motion.js";
import { chips, desk, ic, phone, seg } from "./parts.js";

const STATES = [
  { value: "open2", label: "Open with 2" },
  { value: "alldone", label: "All done" },
  { value: "many", label: "Many open" },
  { value: "closed", label: "Closed unfolded" },
  { value: "replaced", label: "A replaced page, opened" },
  { value: "removed", label: "A removed picture" },
  { value: "search", label: "Search with matches" },
  { value: "nomatch", label: "Search, no match" },
  { value: "loading", label: "Loading" },
  { value: "failure", label: "Failure" },
  { value: "first", label: "First use" },
];

/** The four picks in the report's §8 that draw differently: the recommended one first. */
const PICKS = [
  {
    name: "Groups",
    key: "groups",
    items: [
      { value: "five", label: "Five", tag: "recommended" },
      { value: "two", label: "Two" },
    ],
    note: "Open, Later, Sent, Decided, Closed folded; or Open and Everything else, the fact carrying the state.",
  },
  {
    name: "Heard",
    key: "heard",
    items: [
      { value: "facts", label: "read / working on it / not read yet", tag: "recommended" },
      { value: "pill", label: "Sent · working" },
    ],
    note: "What a sent page says: the hub's own record of it, or today's pill, which is the writer session's busyness.",
  },
  {
    name: "Quiet greying",
    key: "quiet",
    items: [
      { value: "on", label: "On", tag: "recommended" },
      { value: "off", label: "Off" },
    ],
    note: "An Open row untouched for 7 days greys its ring and says “quiet 9d”; nothing closes by itself.",
  },
  {
    name: "Make tasks",
    key: "tasks",
    items: [
      { value: "row", label: "On the row", tag: "recommended" },
      { value: "page", label: "On the page only" },
    ],
    note: "The Sent row's act on hover or focus (drawn held on the first Sent row), or none on the row.",
  },
];

const state = {
  state: "open2",
  groups: "five",
  heard: "facts",
  quiet: "on",
  tasks: "row",
};

/** The live query typed into a frame's field, or null. */
let query = null;

/* ------------------------------------------------------------ the page */

const FACTS = [
  {
    fig: "6 → 2",
    title: "The badge counts the wrong thing",
    body: "“Decisions 6” counts pages not yet sent. Four of them are stale; two are fully picked and wait only for Send. No page needs a pick today. The list's Open group is the badge.",
  },
  {
    fig: "20 of 24",
    title: "“Sent · working” is one session being busy",
    body: "The pill asks whether the writer session is working, and one orchestrator wrote 23 of 25 pages. Here a sent page says what the hub knows of it: read, working on it, or not read yet.",
  },
  {
    fig: "0",
    title: "Nothing ever reached Decided",
    body: "Agents build from sent pages and Make tasks was never pressed, so no page says what got built. Here it is one press from a Sent row, and a decided page shows its tasks done.",
  },
];

const JOBS = [
  ["Catch up on what moved while I was away", "The tab", "Open first, then Sent by last movement, each with what the agent did with it."],
  ["Find the page behind something being built", "The tab", "One field over every question, option, pick and note; the matched card lines under each row."],
  ["Recall what I decided and why", "The tab", "Decided rows with their tasks; the page keeps its record."],
  ["Put a question aside, or close it", "The tab", "Not now moves a row to Later; a replaced or withdrawn page goes to Closed and says where it went."],
  ["Pick now, on a page an agent just wrote", "Needs you", "The tab agrees with Needs you and never competes: the same count, the same Not now."],
  ["Drag a map of how decisions depend", "Nowhere", "Never observed. The graph goes."],
];

const purpose = () => `<section class="pv-section pv-col" aria-labelledby="for">
  <h2 class="pv-h2" id="for">${ic("decisions")}What the list is for</h2>
  <p class="pv-sub">From the tab as it stands on Cawco-Dev (report 7932615d §0 and §1). The list is a ledger with a small inbox on top.</p>
  <div class="pv-grid">${FACTS.map((f) => `<article class="pv-card"><span class="fig num">${f.fig}</span><h3>${f.title}</h3><p>${f.body}</p></article>`).join("")}</div>
  <ul class="pv-jobs" style="margin-block-start:var(--space-group)">${JOBS.map(([j, w, why]) => `<li><span class="j">${j}</span><span class="w">${w}</span><span class="why">${why}</span></li>`).join("")}</ul>
</section>`;

const switches = () => `<div class="pv-switches">
  <div class="pv-switch"><span class="pv-switch-label"><strong>State</strong> · every state the list and its pages reach</span>${chips(STATES, state.state, "State")}</div>
  <div class="pv-picks">${PICKS.map(
    (p) =>
      `<div class="pv-switch"><span class="pv-switch-label"><strong>${p.name}</strong> · ${p.note}</span>${seg(p.items, state[p.key], p.name, p.key)}</div>`
  ).join("")}</div>
</div>`;

const fit = (html, w) =>
  `<div class="fit" style="--frame-w:${w}">${html}</div>`;

function stageHtml() {
  const badge = badgeOf(state);
  return `<div class="pv-col pv-stage-cap"><h3>Desk</h3><p>1440 × 900 and taller as the list grows · inside the project page's head and its view strip</p></div>
    <div class="pv-col">${fit(desk(pane(state, false, query), badge), 1440)}</div>
    <div class="pv-col pv-stage-cap"><h3>Phone</h3><p>390 × 844 and taller · the head with ⋯ alone, the views bar docked at its foot</p></div>
    <div class="pv-col"><div class="phone-fit">${fit(phone(pane(state, true, query)), 390)}</div></div>
    <p class="pv-col pv-data">Titles and standings are the project's 25 pages as the hub listed them; the four you called stale and the page whose cards were withdrawn stand under Closed. Ages, and the pick figures the report doesn't count, are drawn for shape. Hover or focus a row on the desk for its one act; the first Sent row (the first Open row under Many open) is drawn held. On a phone the act is in the row's long-press menu.</p>`;
}

const MOTIONS = [
  {
    id: "send",
    name: "A row changing group",
    how: "Send on “How CawCo knows you're here”: the row slides from Open to the head of Sent while the rows it passes make room; its fact cross-blurs to “not read yet”; Open's count and the badge pop to 1.",
    recipe: "House reflow (FLIP) · Text swap soft · Number pop-in",
    tokens: "--dur-panel 280ms on --ease-in-out; fact --dur-fade 200ms; figures --dur-morph 180ms",
  },
  {
    id: "fold",
    name: "A group folding",
    how: "Closed opens under its head and shuts again; the chevron flips with it.",
    recipe: "Accordion expand (grid rows 0fr to 1fr, chevron scaleY)",
    tokens: "open --dur-reveal 240ms, shut --dur-exit 160ms, --ease-out",
  },
  {
    id: "search",
    name: "Search filtering",
    how: "“pairing” lands: rows that don't match close while fading, the three that do slide up to their places, and their matched card lines grow open under them.",
    recipe: "House reflow (FLIP) · Accordion expand for the card lines",
    tokens: "departures --dur-exit 160ms; survivors --dur-panel 280ms; lines --dur-reveal 240ms",
  },
  {
    id: "delight",
    name: "The one delight",
    how: "The last task of “Commenting” lands: the ring closes, its mark becomes the done glyph and “4 of 5” gives way to “5”, all on one start.",
    recipe: "Donut chart ring morph · Icon swap · Number pop-in",
    tokens: "--dur-morph 180ms on --ease-out (The Steady Swap Rule)",
  },
  {
    id: "reveal",
    name: "The first read",
    how: "The skeleton gives way to the list in place.",
    recipe: "Skeleton loader and reveal",
    tokens: "--dur-skeleton-reveal 400ms on --ease-crossfade, 2px cross-blur",
  },
  {
    id: "open",
    name: "Opening a page",
    how: "The replaced page opens: its title flies from the row into the page's head; the banner and cards fade in under it.",
    recipe: "House shared-element flight (FLIP)",
    tokens: "--dur-panel 280ms on --ease-drawer; the rest --dur-fade 200ms",
  },
];

const motionPanel = () => `<section class="pv-section pv-col" aria-labelledby="motion">
  <h2 class="pv-h2" id="motion">${ic("play")}Its motion</h2>
  <p class="pv-sub">Each plays on the desk and the phone at once. Reduced motion keeps only the fades. The live dot beside “working on it” breathes on the house breath (2s), as every live dot does, only while that turn runs; the report's 1.2s loop is the spinner's clock, not a dot's.</p>
  <div class="pv-motion">${MOTIONS.map(
    (m) =>
      `<div class="pv-motion-row"><div class="what"><strong>${m.name}</strong><p class="how">${m.how}</p><p class="recipe">${m.recipe}</p><p class="how">${m.tokens}</p></div><button class="btn sm" type="button" data-play="${m.id}">${ic("play")}<span>Play</span></button></div>`
  ).join("")}</div>
</section>`;

const sameDrawing = () => `<section class="pv-section pv-col" aria-labelledby="same">
  <h2 class="pv-h2" id="same">${ic("eye")}Two picks that draw the same</h2>
  <ul class="pv-jobs">
    <li><span class="j">Who marks a page replaced</span><span class="w">no switch</span><span class="why">The writer's supersedes or your “Replace with…” both end in the same Closed row and the same banner on the old page.</span></li>
    <li><span class="j">Search on the tab, or Find only</span><span class="w">no switch</span><span class="why">The field here and Find read the same index; without the field the list draws as above with no search row.</span></li>
  </ul>
</section>`;

const MARK = { fixed: "done", good: "tick", open: "minus" };

const critique = () => `<section class="pv-section pv-col" aria-labelledby="crit">
  <h2 class="pv-h2" id="crit">${ic("checks")}Critiques of these screens</h2>
  <p class="pv-note">${ic("done", "sm")} mended in these drawings · ${ic("tick", "sm")} works as drawn · ${ic("minus", "sm")} left for you to weigh</p>
  <div class="pv-critique" style="margin-block-start:var(--space-4)">${CRITIQUE.map(
    (c) =>
      `<article class="pv-card crit"><h4>${ic(c.icon)}${c.title}</h4><ul class="stack" style="display:grid;gap:var(--space-2)">${c.items.map((it) => `<li class="${it.mark}">${ic(MARK[it.mark])}<span>${it.text}</span></li>`).join("")}</ul></article>`
  ).join("")}</div>
</section>`;

/* ------------------------------------------------------------ the wiring */

function placeThumb(group) {
  const thumb = group.querySelector(".seg-thumb");
  const on = group.querySelector('[aria-pressed="true"]');
  if (!(thumb && on)) {
    return;
  }
  thumb.style.setProperty("--thumb-x", `${on.offsetLeft}px`);
  thumb.style.setProperty("--thumb-w", `${on.offsetWidth}px`);
}

function placeAll(root) {
  for (const group of root.querySelectorAll(".seg")) {
    group.removeAttribute("data-ready");
    placeThumb(group);
    group.getBoundingClientRect();
    requestAnimationFrame(() => group.setAttribute("data-ready", ""));
  }
}

/** A frame drawn at its own width, scaled to the width it is given; the box takes its scaled height. */
const fits = new Set();
function fitOne(box) {
  const frame = box.firstElementChild;
  if (!frame) {
    return;
  }
  const w = Number(box.style.getPropertyValue("--frame-w"));
  const scale = String(Math.min(1, box.clientWidth / w));
  const height = `${frame.offsetHeight * Number(scale)}px`;
  if (frame.style.getPropertyValue("--fit") !== scale) {
    frame.style.setProperty("--fit", scale);
  }
  if (box.style.getPropertyValue("--fit-h") !== height) {
    box.style.setProperty("--fit-h", height);
  }
}
/** Fitting writes the box's height, which the observer sees: it runs on the next frame, never inside the observer's loop. */
const due = new Set();
let scheduled = 0;
const fitObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    due.add(
      entry.target.classList.contains("fit")
        ? entry.target
        : entry.target.parentElement
    );
  }
  scheduled ||= requestAnimationFrame(() => {
    scheduled = 0;
    for (const box of due) {
      fitOne(box);
    }
    due.clear();
  });
});

function fitAll(root) {
  for (const box of fits) {
    fitObserver.unobserve(box);
    fitObserver.unobserve(box.firstElementChild);
  }
  fits.clear();
  for (const box of root.querySelectorAll(".fit")) {
    fits.add(box);
    fitOne(box);
    fitObserver.observe(box);
    fitObserver.observe(box.firstElementChild);
  }
}

function stamp(stage) {
  for (const [k, v] of Object.entries(state)) {
    stage.dataset[k] = v;
  }
}

function renderStage() {
  const stage = document.querySelector("#stage");
  stamp(stage);
  stage.innerHTML = stageHtml();
  fitAll(stage);
  return stage;
}

/** Draws one frame's pane again for the state or a query, leaving the rest of the frame as it stands. */
function drawPaneIn(frame) {
  const isPhone = frame.dataset.frame === "phone";
  frame.querySelector("[data-pane]").innerHTML = pane(state, isPhone, query);
  const badge = badgeOf(state);
  const tab = frame.querySelector('.tab.on');
  if (tab) {
    tab.querySelector("[data-badge]")?.remove();
    if (badge > 0) {
      tab.insertAdjacentHTML("beforeend", `<span class="tab-num num" data-badge>${badge}</span>`);
    }
  }
  frame.querySelector("[data-pane]").style.removeProperty("position");
}

const frames = () => [...document.querySelectorAll("#stage [data-frame]")];

function setState(value) {
  state.state = value;
  query = null;
  const group = document.querySelector('[data-seg="State"]');
  for (const item of group.querySelectorAll(".opt")) {
    item.setAttribute("aria-pressed", String(item.dataset.value === value));
  }
}

/** Puts the stage in `value` without motion, so a Play starts from it. */
function standIn(value) {
  setState(value);
  renderStage();
}

const PLAYS = {
  send: () => {
    standIn("open2");
    for (const f of frames()) {
      sendRow(f);
    }
  },
  fold: () => {
    if (state.state !== "open2" && state.state !== "closed") {
      standIn("open2");
    }
    for (const f of frames()) {
      toggleFold(f, "closed");
    }
  },
  search: () => {
    standIn("open2");
    setState("search");
    for (const f of frames()) {
      filterTo(f, () => drawPaneIn(f));
    }
    stamp(document.querySelector("#stage"));
  },
  delight: () => {
    standIn("open2");
    for (const f of frames()) {
      deliver(f, { prime: true });
    }
    // The primed figures stand for a frame, then the last task lands.
    for (const f of frames()) {
      f.getBoundingClientRect();
      deliver(f);
    }
  },
  reveal: () => {
    standIn("loading");
    setState("open2");
    for (const f of frames()) {
      reveal(f, () => drawPaneIn(f));
    }
    stamp(document.querySelector("#stage"));
  },
  open: () => {
    standIn("closed");
    setState("replaced");
    for (const f of frames()) {
      openPage(f, "address-setup", () => drawPaneIn(f));
    }
    stamp(document.querySelector("#stage"));
  },
};

function onClick(event) {
  const target = event.target;
  const opt = target.closest('[data-seg="State"] .opt');
  if (opt) {
    standIn(opt.dataset.value);
    return;
  }
  const item = target.closest(".seg-item");
  if (item) {
    const group = item.closest(".seg");
    const name = group.dataset.seg;
    for (const each of group.querySelectorAll(".seg-item")) {
      each.setAttribute("aria-pressed", String(each === item));
    }
    placeThumb(group);
    if (name === "Theme") {
      document.documentElement.classList.toggle("dark", item.dataset.value === "dark");
      return;
    }
    const pick = PICKS.find((p) => p.key === name);
    if (pick) {
      state[pick.key] = item.dataset.value;
      renderStage();
    }
    return;
  }
  const play = target.closest("[data-play]");
  if (play) {
    const stage = document.querySelector("#stage");
    PLAYS[play.dataset.play]?.();
    if (motionOk()) {
      stage.scrollIntoView({ block: "nearest" });
    }
    return;
  }
  const frame = target.closest("#stage [data-frame]");
  if (!frame) {
    return;
  }
  // Inside a frame the drawing works as the tab would.
  const foldToggle = target.closest("[data-fold-toggle], [data-more]");
  if (foldToggle) {
    toggleFold(frame, foldToggle.dataset.foldToggle ?? foldToggle.dataset.more);
    return;
  }
  if (target.closest("[data-back]")) {
    event.preventDefault();
    standIn("open2");
    return;
  }
  if (target.closest("[data-clear]")) {
    event.preventDefault();
    standIn("open2");
    return;
  }
  const title = target.closest("[data-open-page]");
  if (title || target.closest("a")) {
    event.preventDefault();
  }
  if (title?.dataset.openPage === "address-setup") {
    setState("replaced");
    for (const f of frames()) {
      openPage(f, "address-setup", () => drawPaneIn(f));
    }
    stamp(document.querySelector("#stage"));
  }
}

function onInput(event) {
  const input = event.target.closest("#stage [data-search] input");
  if (!input) {
    return;
  }
  const frame = input.closest("[data-frame]");
  const kind = frame.dataset.frame;
  const caret = input.selectionStart;
  query = input.value;
  for (const f of frames()) {
    drawPaneIn(f);
  }
  const again = document.querySelector(`#stage [data-frame="${kind}"] [data-search] input`);
  again?.focus();
  again?.setSelectionRange(caret, caret);
}

function onKey(event) {
  if (event.key === "Escape" && event.target.closest?.("#stage [data-search] input")) {
    standIn("open2");
  }
  if (
    event.key === "/" &&
    !event.target.closest?.("input, textarea") &&
    document.querySelector("#stage [data-frame='desk'] [data-search] input")
  ) {
    event.preventDefault();
    document.querySelector("#stage [data-frame='desk'] [data-search] input").focus();
  }
}

function page() {
  const root = document.querySelector("#app");
  root.innerHTML = `<header class="pv-col pv-head">
      <div><p class="pv-mark"><span class="wordmark">Caw&amp;Co</span><span>· design preview</span></p>
      <h1 class="pv-title">Decisions, as a list made from what it is for</h1>
      <p class="pv-quote">“check what is the user's purpose form the list, how to make it sueful, show what matters, do a user journey using /interface-craft ux critique, allow discovery, etc... i don't want u to make the list only to find out it's just as useless, or link to stale or removed artifacts”</p>
      <p class="pv-lede">The project's Decisions tab as one list grouped by where each page stands, with a search over every card, drawn at Desk 1440 and Phone 390 on the project's real pages. Every state is below; the four picks that draw differently each have a switch.</p></div>
      ${seg(
        [
          { value: "light", label: "Day" },
          { value: "dark", label: "Night" },
        ],
        "light",
        "Theme"
      )}
    </header>
    ${purpose()}
    <section class="pv-section" aria-labelledby="list-h">
      <div class="pv-col"><h2 class="pv-h2" id="list-h">${ic("decisions")}The list</h2>
      <p class="pv-sub">Open is what waits on you, and its count is the badge on the tab. Later is what you put aside. Sent is with the agents. Decided holds the record and its tasks. Closed is folded: pages replaced or withdrawn, each saying where it went.</p>
      ${switches()}</div>
      <div id="stage"></div>
    </section>
    ${motionPanel()}
    ${sameDrawing()}
    ${critique()}`;
  renderStage();
  placeAll(root);
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => {
    for (const group of root.querySelectorAll(".seg")) {
      placeThumb(group);
    }
  });
  document.fonts.ready.then(() => {
    placeAll(root);
    for (const box of fits) {
      fitOne(box);
    }
  });
}

page();
