/* The preview page: what the list is for, the list in every state at Desk 1440 and Phone 390, its motion, and the critiques. */
import { CRITIQUE } from "./critique.js";
import { badgeOf, clearMoves, moves, pagesFor, pane, seen } from "./list.js";
import {
  deliver,
  filterTo,
  motionOk,
  openPage,
  reflow,
  reveal,
  toggleFold,
} from "./motion.js";
import { chips, desk, esc, ic, phone, seg } from "./parts.js";

const STATES = [
  { value: "open2", label: "Needs you, 2" },
  { value: "alldone", label: "All done" },
  { value: "many", label: "Many waiting" },
  { value: "closed", label: "Closed unfolded" },
  { value: "replaced", label: "A replaced page, opened" },
  { value: "removed", label: "Removed pictures, opened" },
  { value: "search", label: "Search with matches" },
  { value: "nomatch", label: "Search, no match" },
  { value: "loading", label: "Loading" },
  { value: "failure", label: "Failure" },
  { value: "first", label: "First use" },
];

/** The states that are a page opened from its row. */
const OPENED = { replaced: "address-setup", removed: "caw-pairing-picks" };

const state = { state: "open2", page: null, canvas: null };

/** The live query typed into a frame's field, or null. */
let query = null;

/* ------------------------------------------------------------ the page */

const FACTS = [
  {
    fig: "6 → 2",
    title: "The badge counts the wrong thing",
    body: "“Decisions 6” counts pages not yet sent. Four of them are stale; two are fully picked and wait only for Send. No page needs a pick today. The list's Needs you group is the badge.",
  },
  {
    fig: "20 of 24",
    title: "“Sent · working” is one session being busy",
    body: "The pill asks whether the writer session is working, and one orchestrator wrote 23 of 25 pages. Here a sent page says what the hub knows of it: read, working on it, not read yet, or its session ended.",
  },
  {
    fig: "0",
    title: "Nothing ever reached Decided",
    body: "Agents build from sent pages and Make tasks was never pressed, so no page says what got built. Here it is one press from a read Sent row or its page's foot, and a decided page shows its tasks done.",
  },
];

const JOBS = [
  ["Catch up on what moved while I was away", "The tab", "Needs you first, then Sent newest first by when you sent it, each with what the agent did with it."],
  ["Find the page behind something being built", "The tab", "One field over every question, option, pick and note; the matched card lines under each row."],
  ["Recall what I decided and why", "The tab", "Decided rows with their tasks; the page keeps its record."],
  ["Put a question aside, or close it", "The tab", "Not now moves a row to Not now; a replaced, withdrawn or dropped page goes to Closed and says who closed it."],
  ["Pick now, on a page an agent just wrote", "Needs you", "The tab agrees with Caw's Needs you and never competes: the same count, the same Not now."],
  ["Drag a map of how decisions depend", "Nowhere", "Never observed. The graph goes."],
];

const purpose = () => `<section class="pv-section pv-col" aria-labelledby="for">
  <h2 class="pv-h2" id="for">${ic("decisions")}What the list is for</h2>
  <p class="pv-sub">From the tab as it stands on Cawco-Dev (report 7932615d §0 and §1). The list is a ledger with a small inbox on top.</p>
  <div class="pv-grid">${FACTS.map((f) => `<article class="pv-card"><span class="fig num">${f.fig}</span><h3>${f.title}</h3><p>${f.body}</p></article>`).join("")}</div>
  <ul class="pv-jobs" style="margin-block-start:var(--space-group)">${JOBS.map(([j, w, why]) => `<li><span class="j">${j}</span><span class="w">${w}</span><span class="why">${why}</span></li>`).join("")}</ul>
</section>`;

const switches = () => `<div class="pv-switches">
  <div class="pv-switch"><span class="pv-switch-label"><strong>State</strong> · every state the list and its pages reach; inside the frames every row opens its page</span>${chips(STATES, state.state, "State")}</div>
</div>`;

const fit = (html, w) =>
  `<div class="fit" style="--frame-w:${w}">${html}</div>`;

function stageHtml() {
  const badge = badgeOf(state);
  return `<div class="pv-col pv-stage-cap"><h3>Desk</h3><p>1440 × 900 and taller as the list grows · inside the project page's head and its view strip</p></div>
    <div class="pv-col">${fit(desk(pane(state, false, query), badge), 1440)}</div>
    <div class="pv-col pv-stage-cap"><h3>Phone</h3><p>390 × 844 and taller · the head with ⋯ alone, the views bar docked at its foot</p></div>
    <div class="pv-col"><div class="phone-fit">${fit(phone(pane(state, true, query)), 390)}</div></div>
    <p class="pv-col pv-data">Titles, cards, options and recommendations are the project's 25 pages as their sources hold them; the four you called stale and the page whose cards were withdrawn stand under Closed. Dates, picks and notes are drawn for shape. On the desk hover or focus a row for its one act (the first row it is offered on is drawn held); on a phone it is in the row's long-press menu.</p>`;
}

const MOTIONS = [
  {
    id: "send",
    name: "A row changing group",
    how: "Send on “How CawCo knows you're here”: the row slides from Needs you to the head of Sent while the rows it passes make room; its fact cross-blurs to “not read yet”; the counts and the badge pop to their new figures.",
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
    how: "“pairing” lands: rows that don't match close while fading, the ones that do slide up to their places, and their matched card lines grow open under them.",
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
    how: "The replaced page opens from its row: its title flies into the page's head; the banner and cards fade in under it.",
    recipe: "House shared-element flight (FLIP)",
    tokens: "--dur-panel 280ms on --ease-drawer; the rest --dur-fade 200ms",
  },
];

const motionPanel = () => `<section class="pv-section pv-col" aria-labelledby="motion">
  <h2 class="pv-h2" id="motion">${ic("play")}Its motion</h2>
  <p class="pv-sub">Each plays on the desk and the phone at once. Reduced motion keeps only the fades. The live dot beside “working on it” breathes on the house breath (2s), as every live dot does, only while that turn runs.</p>
  <div class="pv-motion">${MOTIONS.map(
    (m) =>
      `<div class="pv-motion-row"><div class="what"><strong>${m.name}</strong><p class="how">${m.how}</p><p class="recipe">${m.recipe}</p><p class="how">${m.tokens}</p></div><button class="btn sm" type="button" data-play="${m.id}">${ic("play")}<span>Play</span></button></div>`
  ).join("")}</div>
</section>`;

const SETTLED = [
  ["Groups", "Five", "Needs you, Not now, Sent, Decided, Closed folded (report 068af135, answer 7)."],
  ["What a sent page says", "The hub's facts", "read, working on it, not read yet, or its session ended; today's “Sent · working” pill goes."],
  ["A page waiting 7 days or more", "Its ring greys", "No word; the figure is the wait (“Waiting since 15 Oct”), and the badge still counts it."],
  ["Make tasks", "Row and page", "On a Sent row whose send was read or whose session ended, and as the one act at a sent page's foot."],
  ["Who marks a page replaced; search on the tab", "No switch", "Both draw the same: the Closed row and the old page's banner; one field over Find's index."],
  ["Whether the badge stops counting past N days", "Yours", "The one line the designer leaves to you: today the badge counts every page that waits."],
];

const settled = () => `<section class="pv-section pv-col" aria-labelledby="settled">
  <h2 class="pv-h2" id="settled">${ic("eye")}Settled, and the one line left to you</h2>
  <ul class="pv-jobs">${SETTLED.map(([j, w, why]) => `<li><span class="j">${j}</span><span class="w">${w}</span><span class="why">${why}</span></li>`).join("")}</ul>
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

function stamp() {
  const stage = document.querySelector("#stage");
  stage.dataset.state = state.state;
  stage.dataset.page = state.page ?? "";
  stage.dataset.canvas = state.canvas ?? "";
}

function renderStage() {
  const stage = document.querySelector("#stage");
  stamp();
  stage.innerHTML = stageHtml();
  fitAll(stage);
  return stage;
}

const frames = () => [...document.querySelectorAll("#stage [data-frame]")];

/** Draws one frame's pane again for the state, the open page or a query, and the tab's badge with it. */
function drawPaneIn(frame) {
  const isPhone = frame.dataset.frame === "phone";
  const at = frame.querySelector("[data-pane]");
  at.innerHTML = pane(state, isPhone, query);
  at.style.removeProperty("position");
  const tab = frame.querySelector(".tab.on");
  if (tab) {
    tab.querySelector("[data-badge]")?.remove();
    const badge = badgeOf(state);
    if (badge > 0) {
      tab.insertAdjacentHTML(
        "beforeend",
        `<span class="tab-num num" data-badge>${badge}</span>`
      );
    }
  }
}

function drawAll() {
  stamp();
  for (const f of frames()) {
    drawPaneIn(f);
  }
}

function pressChip(value) {
  for (const item of document.querySelectorAll('[data-seg="State"] .opt')) {
    item.setAttribute("aria-pressed", String(item.dataset.value === value));
  }
}

/** Puts the stage in a state, without motion, clearing what was done. */
function standIn(value) {
  state.state = value;
  state.page = OPENED[value] ?? null;
  state.canvas = null;
  query = null;
  clearMoves();
  pressChip(value);
  renderStage();
}

/** Opens a page in both frames: from its row the title flies; the press lands on its first pending stop. */
function openIn(name, from = null, cardAt = null) {
  closeMenus();
  seen.add(name);
  state.page = name;
  state.canvas = null;
  query = null;
  for (const f of frames()) {
    openPage(f, name, () => drawPaneIn(f));
  }
  stamp();
  const frame = from ?? frames()[0];
  const page = pagesFor(state.state).find((p) => p.name === name);
  let stop = null;
  if (cardAt !== null) {
    stop = frame.querySelector(`[data-card="${cardAt}"]`);
  } else if (page?.standing === "open") {
    // A fully picked page's first pending stop is its Send (report 068af135, answer 2).
    stop =
      frame.querySelector("[data-card][data-pending]") ??
      frame.querySelector('[data-page-act="send"]');
  }
  stop?.focus({ preventScroll: !motionOk() });
}

const ACTS = {
  "not-now": () => ({ standing: "later", age: "now" }),
  reopen: () => ({ standing: "open", age: "now" }),
  "make-tasks": (page) => ({
    standing: "decided",
    making: true,
    decided: page.picked,
    tasks: 0,
    tasksDone: 0,
    age: "now",
  }),
  send: () => ({
    standing: "sent",
    heard: "unread",
    notSent: false,
    quietDays: undefined,
    age: "now",
  }),
};

/** One of a row's acts, or the page's: the model moves, and the list reflows to it. */
function act(kind, name) {
  closeMenus();
  const page = pagesFor(state.state).find((p) => p.name === name);
  if (!(page && ACTS[kind])) {
    return;
  }
  moves[name] = { ...(moves[name] ?? {}), ...ACTS[kind](page) };
  if (state.page) {
    if (kind === "send") {
      state.page = null;
    }
    drawAll();
    return;
  }
  stamp();
  for (const f of frames()) {
    reflow(f, () => drawPaneIn(f));
  }
}

/* ------------------------------------------------- a phone's long press */

function closeMenus() {
  for (const menu of document.querySelectorAll("[data-rowmenu]")) {
    menu.closest("[data-row]")?.classList.remove("menu-open");
    menu.remove();
  }
}

/** The row's long-press menu under a finger: its one act, as the desk's hover shows it. */
function openMenu(row) {
  closeMenus();
  const source = row.querySelector(".act [data-act]");
  const items = [
    `<button class="mi" type="button" role="menuitem" data-open-page="${row.dataset.page}">${ic("decisions")}<span>Open page</span></button>`,
  ];
  if (source) {
    items.push(
      `<button class="mi" type="button" role="menuitem" data-act="${source.dataset.act}" data-for="${source.dataset.for}">${source.dataset.act === "not-now" ? ic("close") : ic("checks")}<span>${esc(source.textContent.trim())}</span></button>`
    );
  }
  row.classList.add("menu-open");
  row.insertAdjacentHTML(
    "beforeend",
    `<div class="rowmenu" role="menu" data-rowmenu aria-label="${esc(row.querySelector("[data-title]").title)}">${items.join("")}</div>`
  );
}

let holding = 0;
function onPointerDown(event) {
  const row = event.target.closest('#stage [data-frame="phone"] [data-row]');
  if (!row || event.pointerType !== "touch") {
    return;
  }
  holding = setTimeout(() => openMenu(row), 500);
}
const cancelHold = () => clearTimeout(holding);

function onContextMenu(event) {
  const row = event.target.closest('#stage [data-frame="phone"] [data-row]');
  if (row) {
    event.preventDefault();
    openMenu(row);
  }
}

/* ------------------------------------------------------------ the plays */

const PLAYS = {
  send: () => {
    standIn("open2");
    act("send", "owner-presence");
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
    state.state = "search";
    pressChip("search");
    stamp();
    for (const f of frames()) {
      filterTo(f, () => drawPaneIn(f));
    }
  },
  delight: () => {
    standIn("open2");
    for (const f of frames()) {
      deliver(f, { prime: true });
    }
    for (const f of frames()) {
      f.getBoundingClientRect();
      deliver(f);
    }
  },
  reveal: () => {
    standIn("loading");
    state.state = "open2";
    pressChip("open2");
    stamp();
    for (const f of frames()) {
      reveal(f, () => drawPaneIn(f));
    }
  },
  open: () => {
    standIn("closed");
    openIn("address-setup");
    state.state = "replaced";
    pressChip("replaced");
    stamp();
  },
};

/* ------------------------------------------------------------ the clicks */

function onFrameClick(event, frame) {
  const target = event.target;
  if (target.closest("a")) {
    event.preventDefault();
  }
  if (!target.closest("[data-rowmenu]")) {
    closeMenus();
  }
  const fold = target.closest("[data-fold-toggle], [data-more]");
  if (fold) {
    toggleFold(frame, fold.dataset.foldToggle ?? fold.dataset.more);
    return;
  }
  const rowAct = target.closest("[data-act]");
  if (rowAct) {
    act(rowAct.dataset.act, rowAct.dataset.for);
    return;
  }
  const pageAct = target.closest("[data-page-act]");
  if (pageAct) {
    if (pageAct.getAttribute("aria-disabled") !== "true") {
      act(pageAct.dataset.pageAct, pageAct.dataset.for);
    }
    return;
  }
  const chip = target.closest("[data-chip]");
  if (chip) {
    if (chip.dataset.kind === "page") {
      openIn(chip.dataset.target, frame);
    } else if (chip.dataset.kind === "canvas") {
      state.canvas = chip.dataset.target;
      drawAll();
    }
    return;
  }
  const successor = target.closest("[data-successor]");
  if (successor) {
    openIn(successor.dataset.successor, frame);
    return;
  }
  if (target.closest("[data-back]")) {
    const was = pagesFor(state.state).find((p) => p.name === state.page);
    state.page = null;
    if (OPENED[state.state]) {
      state.state = was?.standing === "closed" ? "closed" : "open2";
      pressChip(state.state);
    }
    drawAll();
    return;
  }
  const backTo = target.closest("[data-back-to]");
  if (backTo) {
    state.canvas = null;
    state.page = backTo.dataset.backTo;
    drawAll();
    return;
  }
  if (target.closest("[data-clear]")) {
    standIn("open2");
    return;
  }
  if (target.closest("[data-retry]")) {
    standIn("loading");
    state.state = "open2";
    pressChip("open2");
    stamp();
    for (const f of frames()) {
      reveal(f, () => drawPaneIn(f));
    }
    return;
  }
  const open = target.closest("[data-open-page]");
  if (open) {
    openIn(
      open.dataset.openPage,
      frame,
      open.dataset.cardAt === undefined ? null : Number(open.dataset.cardAt)
    );
  }
}

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
    for (const each of group.querySelectorAll(".seg-item")) {
      each.setAttribute("aria-pressed", String(each === item));
    }
    placeThumb(group);
    document.documentElement.classList.toggle(
      "dark",
      item.dataset.value === "dark"
    );
    return;
  }
  const play = target.closest("[data-play]");
  if (play) {
    PLAYS[play.dataset.play]?.();
    if (motionOk()) {
      document.querySelector("#stage").scrollIntoView({ block: "nearest" });
    }
    return;
  }
  const frame = target.closest("#stage [data-frame]");
  if (frame) {
    onFrameClick(event, frame);
  }
}

function onInput(event) {
  const input = event.target.closest("#stage [data-search] input");
  if (!input) {
    return;
  }
  const kind = input.closest("[data-frame]").dataset.frame;
  const caret = input.selectionStart;
  query = input.value;
  for (const f of frames()) {
    drawPaneIn(f);
  }
  const again = document.querySelector(
    `#stage [data-frame="${kind}"] [data-search] input`
  );
  again?.focus();
  again?.setSelectionRange(caret, caret);
}

function onKey(event) {
  if (event.key === "Escape") {
    closeMenus();
    if (event.target.closest?.("#stage [data-search] input")) {
      standIn("open2");
    }
  }
  const field = document.querySelector(
    "#stage [data-frame='desk'] [data-search] input"
  );
  if (event.key === "/" && !event.target.closest?.("input, textarea") && field) {
    event.preventDefault();
    field.focus();
  }
}

function page() {
  const root = document.querySelector("#app");
  root.innerHTML = `<header class="pv-col pv-head">
      <div><p class="pv-mark"><span class="wordmark">Caw&amp;Co</span><span>· design preview</span></p>
      <h1 class="pv-title">Decisions, as a list made from what it is for</h1>
      <p class="pv-quote">“check what is the user's purpose form the list, how to make it sueful, show what matters, do a user journey using /interface-craft ux critique, allow discovery, etc... i don't want u to make the list only to find out it's just as useless, or link to stale or removed artifacts”</p>
      <p class="pv-lede">The project's Decisions tab as one list grouped by where each page stands, with a search over every card, drawn at Desk 1440 and Phone 390 on the project's real pages, with the designer's answers to its critiques (report 068af135). Every state is below, and every row opens its page.</p></div>
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
      <p class="pv-sub">Needs you is what waits on you, and its count is the badge on the tab. Not now is what you set aside. Sent is with the agents. Decided holds the record and its tasks. Closed is folded: pages replaced, withdrawn or dropped, each saying who closed it. Every row's figure is the date that put it in its group.</p>
      ${switches()}</div>
      <div id="stage"></div>
    </section>
    ${motionPanel()}
    ${settled()}
    ${critique()}`;
  renderStage();
  placeAll(root);
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("contextmenu", onContextMenu);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointerup", cancelHold);
  root.addEventListener("pointercancel", cancelHold);
  root.addEventListener("pointermove", cancelHold);
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
