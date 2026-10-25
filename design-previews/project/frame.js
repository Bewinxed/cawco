/*
 * The project page's behaviour for the preview: one data model drawn into
 * the board (four columns on a desk; on a phone the grouped list or the
 * columns sideways), the task pane, Caw's column and the empty and failed
 * reads, with every motion on the house curves and durations as Web
 * Animations, each named by its `id` so a probe can find, hold and seek it.
 * The preview page (index.html) picks the state, the phone fork and the
 * scheme by postMessage; `?state=…&layout=…&scheme=…` does the same alone.
 */

const ROOT = document.documentElement;
const APP = document.querySelector(".app");
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [
  ...scope.querySelectorAll(selector),
];

const token = (name) => getComputedStyle(ROOT).getPropertyValue(name).trim();
const ms = (name) => {
  let value = token(name);
  /* A duration worked out from others (calc) is read as the engine resolves it. */
  if (value.startsWith("calc(")) {
    const probe = document.createElement("i");
    probe.style.transitionDuration = `var(${name})`;
    document.body.append(probe);
    value = getComputedStyle(probe).transitionDuration;
    probe.remove();
  }
  return value.endsWith("ms")
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000;
};
const motionOk = () =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;
const PHONE = matchMedia("(width < 901px)");

/** One Web Animation on the house tokens, named for the probe. */
const run = (element, keyframes, { dur, ease, id, delay = 0, fill }) => {
  const animation = element.animate(keyframes, {
    duration: ms(dur),
    easing: token(ease),
    delay,
    fill: fill ?? "backwards",
  });
  animation.id = id;
  /* Its end, or nothing when it is cancelled (a state picked mid-way). */
  animation.ended = (then) => animation.finished.then(then, () => undefined);
  return animation;
};
const frame = () =>
  new Promise((done) => requestAnimationFrame(() => done(undefined)));

/**
 * Caw's calm loops (live work breathing: the Working glyph, his running
 * note's dot) move only while something waits on the person. Once nothing
 * does, each finishes the breath it is in and settles at full ink, so the
 * page comes to rest; under reduced motion none starts.
 */
const syncBreath = () => {
  const attend = Object.keys(S.needs).length > 0 && motionOk();
  for (const glyph of $$(".breathe")) {
    const breath = glyph.getAnimations().find((each) => each.id === "breath");
    if (attend && breath) {
      breath.effect.updateTiming({ iterations: Number.POSITIVE_INFINITY });
    } else if (attend) {
      const ease = token("--ease-in-out");
      const loop = glyph.animate(
        [
          { opacity: 1, easing: ease },
          { opacity: Number(token("--breath-floor")), offset: 0.5, easing: ease },
          { opacity: 1 },
        ],
        { duration: ms("--breath"), iterations: Number.POSITIVE_INFINITY }
      );
      loop.id = "breath";
    } else if (breath) {
      const { currentIteration } = breath.effect.getComputedTiming();
      breath.effect.updateTiming({ iterations: (currentIteration ?? 0) + 1 });
    }
  }
};

const use = (id, cls = "glyph") =>
  `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/* ---------- The data ---------- */

const AGENTS = {
  code: { mark: "--mark-6", glyph: "code-2" },
  "fix-tide": { mark: "--mark-4", glyph: "bug" },
  vouchers: { mark: "--mark-2", glyph: "gift" },
  calendar: { mark: "--mark-5", glyph: "calendar-mark" },
  rota: { mark: "--mark-7", glyph: "users-group-rounded" },
};

const READY = [
  ["tsk-58", "Run Apple's production test suite on the Mac before each release"],
  ["tsk-57", "Move the macOS workspace boundary to Seatbelt profiles", { after: "tsk-14" }],
  ["tsk-56", "Preview tool rework: one origin per session"],
  ["tsk-55", "Send a booking confirmation with the course's kit list", { after: "tsk-21", when: "Thu 09:30" }],
  ["tsk-54", "Rebuild the harbour map tiles at 2x", { cant: "no machine for this project is online" }],
  ["tsk-53", "Show the next three high tides on the home page"],
  ["tsk-52", "Archive last season's courses", { when: "Mon 08:00" }],
  ["tsk-51", "Price the taster sessions by the hour"],
  ["tsk-50", "Let instructors swap shifts on the rota", { after: "tsk-20" }],
  ["tsk-49", "Add a waiting list to full courses"],
  ["tsk-48", "Read the weather warning feed for the launch slipway"],
  ["tsk-47", "Split the delegate log by machine"],
  ["tsk-46", "Keep the hub's job list under 2,000 rows"],
  ["tsk-45", "Refund a deposit from the booking page"],
  ["tsk-44", "Name each place by its branch, not its path"],
  ["tsk-43", "Export the season's bookings as a spreadsheet"],
  ["tsk-42", "Teach the composer to paste a screenshot"],
  ["tsk-41", "Mark a course as cancelled for weather", { after: "tsk-48" }],
  ["tsk-40", "Translate the booking page into Welsh"],
  ["tsk-39", "Show who taught each session on the receipt"],
  ["tsk-38", "Draw the plan ring on the phone's task row"],
  ["tsk-37", "Move the instructor photos to the media store"],
  ["tsk-36", "Add a parent's second phone number"],
  ["tsk-35", "Check the Stripe webhook signature twice", { after: "tsk-21" }],
  ["tsk-34", "Stop the usage strip reading every account at once"],
  ["tsk-33", "Write the season's opening email", { when: "Fri 10:00" }],
  ["tsk-32", "Let a routine run on the Mac only"],
  ["tsk-31", "Tidy the old course URLs into redirects"],
  ["tsk-30", "Show the tide height on each session's card"],
];

const DONE = [
  ["tsk-15", "Let a parent withdraw a queued delegate", "Landed on main · 3d"],
  ["tsk-14", "Share the Mac between leaves", "Landed as PR #38 · 5d"],
  ["tsk-13", "Show the course capacity on the booking page", "Landed on main · 5d"],
  ["tsk-11", "Keep a draft when the composer loses focus", "Landed as PR #36 · 6d"],
  ["tsk-10", "Send a reminder the day before a course", "Landed on main · 1w"],
  ["tsk-9", "Read the tide table from the harbour's feed", "Landed as PR #33 · 1w"],
  ["tsk-8", "Fold a long draft to one line", "Landed on main · 1w"],
  ["tsk-7", "Add the instructors' page", "Landed as PR #31 · 2w"],
  ["tsk-6", "Hold a seat for ten minutes at checkout", "Landed on main · 2w"],
  ["tsk-5", "Show spend per project", "Landed as PR #28 · 2w"],
  ["tsk-4", "Draw the board's skeleton at its real size", "Landed on main · 2w"],
  ["tsk-3", "Move the booking form to one page", "Landed as PR #24 · 3w"],
  ["tsk-2", "Start the project's folder on the hub", "Landed on main · 3w"],
  ["tsk-1", "Write the course list's first page", "Landed as PR #20 · 3w"],
  ["tsk-0a", "Rename sessions from their first message", "Landed on main · 3w"],
  ["tsk-0b", "Keep the booking total in pounds and pence", "Landed on main · 4w"],
  ["tsk-0c", "Stop a session from the phone", "Landed as PR #17 · 4w"],
  ["tsk-0d", "Add the season's dates to the home page", "Landed on main · 4w"],
  ["tsk-0e", "Remember the last machine a project ran on", "Landed on main · 1mo"],
  ["tsk-0f", "Show the sunset time beside evening sessions", "Landed as PR #14 · 1mo"],
  ["tsk-0g", "Keep sessions running through a daemon update", "Landed on main · 1mo"],
  ["tsk-0h", "List a course's instructors", "Landed on main · 1mo"],
  ["tsk-0i", "Answer a permission from the lock screen", "Landed as PR #11 · 1mo"],
  ["tsk-0j", "Write the privacy page", "Landed on main · 1mo"],
  ["tsk-0k", "Group sessions by project in the rail", "Landed on main · 1mo"],
  ["tsk-0l", "Add the cancellation policy", "Landed as PR #9 · 1mo"],
  ["tsk-0m", "Draw the machines in the top bar's glass", "Landed on main · 1mo"],
  ["tsk-0n", "Take card payments at the desk", "Landed on main · 2mo"],
  ["tsk-0o", "Find a session by what was said", "Landed as PR #6 · 2mo"],
  ["tsk-0p", "Show the course's age range", "Landed on main · 2mo"],
  ["tsk-0q", "Pair the phone with one scan", "Landed on main · 2mo"],
  ["tsk-0r", "Put the club's address in the footer", "Landed as PR #3 · 2mo"],
  ["tsk-0s", "Start the dashboard", "Landed on main · 2mo"],
];

const DROPPED = [
  ["tsk-d1", "Sell gift cards in the shop", "Dropped · 2d"],
  ["tsk-d2", "Try a second tide feed", "Dropped · 4d"],
  ["tsk-d3", "Add a chat bubble to the booking page", "Dropped · 1w"],
  ["tsk-d4", "Move the hub to a container", "Dropped · 2w"],
];

const TIDE = {
  id: "tsk-16",
  title: "Tide table is an hour out after the clocks change",
  stage: "review",
  agent: "fix-tide",
  age: "2h",
  handed: "Handed in 2h ago · PR #41 · 1 file",
  check: "Check: 30 Mar 04:12 · tests green",
  labels: "a11y · bug",
};
const VOUCHERS = {
  id: "tsk-19",
  title: "Gift vouchers for taster sessions",
  stage: "review",
  agent: "vouchers",
  age: "40m",
  handed: "Handed in 40m ago · PR #42 · 3 files",
  check: "Check: a £25 voucher pays for a taster",
  labels: "shop",
};
const CALENDAR = {
  id: "tsk-12",
  title: "Course calendar export to iCal",
  stage: "review",
  agent: "calendar",
  age: "4h",
  handed: "Handed in 4h ago · PR #39 · 2 files",
  check: "Check: Apple Calendar shows all 14 sessions",
  labels: "courses",
};

const WORKING = [
  {
    id: "tsk-21",
    title: "Take course deposits with Stripe Checkout",
    stage: "working",
    agent: "code",
    step: "Writing the balance reminder email",
    ring: [3, 7],
    age: "12m",
    labels: "payments",
  },
  {
    id: "tsk-20",
    title: "Instructor rota page",
    stage: "working",
    agent: "rota",
    retry: 2,
    ring: [1, 4],
    age: "3m",
    labels: "staff",
  },
];

const ASKS = {
  "tsk-16": {
    kind: "ask",
    agent: "fix-tide",
    line: "what should I do with the stored tide times?",
    wait: 34,
  },
  "tsk-19": {
    kind: "permission",
    agent: "vouchers",
    command: "git push",
    consequence: "Pushes 3 commits to bewinxed/tidewater",
    wait: 12,
  },
};

/** Caw's own notes on each project's thread, newest last; `when` keeps a note to the ask it speaks of. */
const CAW_NOTES = {
  "cawco-dev": [
    { words: "Filed 3 tasks from your note", age: "2h" },
    { words: "fix-tide handed in PR #41", age: "2h" },
    { words: "Asked you about the stored tide times", age: "34m", when: "tsk-16" },
    { words: "Reading your note to rota", age: "now", live: true },
  ],
};

/** A project with tasks filed by hand and no thread with Caw yet: his first-thread recipe. */
const SITE = [
  ["os-5", "Write the club's about page"],
  ["os-4", "Add a map to the launch slipway", { after: "os-5" }],
  ["os-3", "Set up the contact form"],
];
const SITE_DONE = [
  ["os-2", "Pick the site's domain", "Landed on main · 4d"],
  ["os-1", "Start the site's folder", "Landed on main · 6d"],
];
const FIRST_STARTERS = {
  "obelisk-site": [
    "What's left before the site goes live?",
    "Review what landed this week",
    "Plan the next three tasks",
  ],
};

const FILED = [
  {
    id: "tw-1",
    title: "Map the booking steps a parent goes through",
    stage: "ready",
  },
  {
    id: "tw-2",
    title: "Take course deposits with Stripe Checkout",
    stage: "ready",
    after: "tw-1",
  },
  {
    id: "tw-3",
    title: "Email the balance reminder before the course",
    stage: "ready",
    after: "tw-2",
  },
];

const fromRows = (rows, stage) =>
  rows.map(([id, title, extra]) =>
    typeof extra === "string"
      ? { id, title, stage, line: extra }
      : { id, title, stage, ...(extra ?? {}) }
  );

const boardTasks = (review) => [
  ...fromRows(READY, "ready"),
  ...WORKING.map((task) => ({ ...task })),
  ...review.map((task) => ({ ...task })),
  ...fromRows(DONE, "done"),
  ...fromRows(DROPPED, "dropped"),
];

/* ---------- State ---------- */

const S = {
  state: "rest",
  layout: "list",
  project: "cawco-dev",
  tasks: boardTasks([TIDE]),
  needs: {},
  selected: null,
  filter: false,
  dropped: false,
  tab: "changes",
  answered: null,
  approved: false,
  boardKind: "",
  /** The hub's answers arrive by themselves; a probe turns this off and calls them. */
  auto: true,
  timer: 0,
  cawRow: null,
  ringDrawn: false,
  tabWas: null,
};
const nodes = new Map();
/** Cards whose band changes in this draw, with the fill they had. */
const banded = new Map();

const PROJECTS = {
  "cawco-dev": {
    name: "Cawco-Dev",
    place: "obelisk-of-light · ~/cockpit · 43 places",
    where: "obelisk-of-light · ~/cockpit",
    decisions: "8",
  },
  tidewater: {
    name: "tidewater",
    place: "obelisk-of-light · ~/tidewater",
    where: "obelisk-of-light · ~/tidewater",
    decisions: "",
  },
  "obelisk-site": {
    name: "obelisk-site",
    place: "obelisk-of-light · ~/obelisk-site · 5 places",
    where: "obelisk-of-light · ~/obelisk-site",
    decisions: "",
  },
};

const without = (map, id) =>
  Object.fromEntries(Object.entries(map).filter(([key]) => key !== id));

const say = (words) => {
  $('[data-slot="said"]').textContent = words;
};

/* ---------- Cards ---------- */

const agentMark = (name) => {
  const agent = AGENTS[name];
  return `<span class="agent" style="--m: var(${agent.mark})" aria-hidden="true">${use(agent.glyph)}</span>`;
};

const ring = ([done, total]) => {
  const r = 4.75;
  const whole = 2 * Math.PI * r;
  const arc = (whole * done) / total;
  return `<svg class="ring" viewBox="0 0 12 12" aria-hidden="true"><circle class="track" cx="6" cy="6" r="${r}"/><circle cx="6" cy="6" r="${r}" stroke-dasharray="${arc.toFixed(2)} ${whole.toFixed(2)}"/></svg>`;
};

/** What the agent waits on him for, in its own verb: the band and the hand-shake are the status. */
const askWords = (ask) =>
  ask.kind === "permission"
    ? `${ask.agent} asks to run <code>${ask.command}</code>`
    : `${ask.agent} asks · ${ask.line}`;

const metaLine = (task) => {
  const ask = S.needs[task.id];
  if (ask) {
    return `<span class="card-meta mark-line"><span class="visually-hidden">Needs you: </span><span class="mark-cell">${use("hand-shake")}</span><span class="words">${askWords(ask)}</span></span>`;
  }
  if (task.cant) {
    return `<span class="card-meta mark-line">${use("close-circle", "glyph st-fail")}<span class="words">Can't start · ${task.cant}</span></span>`;
  }
  if (task.stage === "ready") {
    if (!(task.after || task.when)) {
      return "";
    }
    const glyph = task.after ? "lock-keyhole-minimalistic" : "calendar";
    const words = [task.after && `After ${task.after}`, task.when]
      .filter(Boolean)
      .join(" · ");
    return `<span class="card-meta mark-line">${use(glyph, "glyph sm")}<span class="words">${words}</span></span>`;
  }
  if (task.stage === "working" && task.retry) {
    return `<span class="card-meta mark-line">${use("refresh-circle", "glyph st-live breathe")}<span class="words">Retrying · attempt ${task.retry}</span></span>`;
  }
  if (task.stage === "working") {
    return `<span class="card-meta mark-line">${agentMark(task.agent)}<span class="words">${task.agent} · ${task.step}</span></span>`;
  }
  if (task.stage === "review") {
    return `<span class="card-meta mark-line">${agentMark(task.agent)}<span class="words">${task.agent} · ${task.handed}</span></span>`;
  }
  if (task.stage === "done") {
    return `<span class="card-meta mark-line">${use("tick-l", "glyph st-done")}<span class="words">${task.line}</span></span>`;
  }
  return `<span class="card-meta mark-line"><span class="words">${task.line}</span></span>`;
};

/** The Peer Rule's list form: Deny then Approve, together at the trailing edge, each tinted by what it does. */
const peerPair = (id) =>
  `<span class="peer card-acts"><button class="btn sm deny" type="button" data-card-perm="deny" data-id="${id}">${use("close-l")}<span>Deny</span></button><button class="btn sm approve" type="button" data-card-perm="approve" data-id="${id}">${use("tick-l")}<span>Approve</span></button></span>`;

/** The act on a card waiting on him: a permission's consequence, or the wait and Answer. */
const needsLine = (task, ask) =>
  ask.kind === "permission"
    ? `<span class="card-third mark-line"><span class="words">${ask.consequence}</span></span>`
    : `<span class="card-third mark-line"><span class="words num">waiting ${ask.wait}m</span><button class="btn outline sm" type="button" data-card-answer="${task.id}">Answer</button></span>`;

const thirdLine = (task) => {
  const ask = S.needs[task.id];
  if (ask) {
    return needsLine(task, ask);
  }
  if (task.stage === "working") {
    return `<span class="card-third mark-line">${ring(task.ring)}<span class="words num">${task.ring[0]}/${task.ring[1]} · ${task.age}</span></span>`;
  }
  if (task.stage === "review") {
    return `<span class="card-third mark-line"><span class="words">${task.check}</span></span>`;
  }
  return "";
};

/** The card is an article; its title is the link (no control inside an anchor). */
const cardHTML = (task) => {
  const ask = S.needs[task.id];
  const pair = ask?.kind === "permission" ? peerPair(task.id) : "";
  return `<a class="card-title card-link" href="#${task.id}">${task.title}</a>${metaLine(task)}${thirdLine(task)}${pair}`;
};

const cardNode = (task) => {
  let node = nodes.get(task.id);
  if (!node) {
    node = document.createElement("article");
    node.className = "card";
    node.dataset.id = task.id;
    nodes.set(task.id, node);
  }
  const html = cardHTML(task);
  if (node.dataset.html !== html) {
    node.innerHTML = html;
    node.dataset.html = html;
  }
  node.dataset.stage = task.stage;
  const needs = Boolean(S.needs[task.id]);
  if (node.isConnected && node.hasAttribute("data-needs") !== needs) {
    banded.set(node, getComputedStyle(node).backgroundColor);
  }
  node.toggleAttribute("data-needs", needs);
  if (S.selected === task.id) {
    node.setAttribute("aria-current", "true");
  } else {
    node.removeAttribute("aria-current");
  }
  return node;
};

/* ---------- The board ---------- */

const COLUMNS = [
  ["ready", "Ready"],
  ["working", "Working"],
  ["review", "Review"],
  ["done", "Done"],
];

/** The desk's columns; under the drawer's line the grouped list, or the columns sideways led by the Needs-you lane. */
const boardKind = () => {
  if (!PHONE.matches) {
    return "columns";
  }
  return S.layout === "list" ? "list" : "lane";
};

const colHTML = (key, name) => `
  <div class="col" data-col="${key}">
    <h2 class="col-head">${key === "needs" ? use("hand-shake", "glyph col-glyph") : ""}<span class="col-name">${name}</span><span class="col-count num"></span></h2>
    <div class="col-cards"></div>
    ${key === "ready" ? `<button class="btn ghost sm col-foot" type="button">${use("plus-l")}<span>Add task</span></button>` : ""}
  </div>`;

const buildBoard = () => {
  const board = $('[data-slot="board"]');
  const kind = boardKind();
  S.boardKind = kind;
  const order = {
    list: [
      ["needs", "Needs you"],
      ["working", "Working"],
      ["review", "Review"],
      ["ready", "Ready"],
      ["done", "Done"],
    ],
    lane: [["needs", "Needs you"], ...COLUMNS],
    columns: COLUMNS,
  }[kind];
  const dropped = S.dropped
    ? colHTML("dropped", "Dropped")
    : `<button class="dropped-rail" type="button" data-act="dropped" aria-label="Show 4 dropped tasks"><span>Dropped</span><span class="num">4</span></button>`;
  board.innerHTML = order.map(([key, name]) => colHTML(key, name)).join("") + dropped;
  board.toggleAttribute("data-dropped", S.dropped);
  if (S.dropped) {
    board.dataset.dropped = "open";
  }
};

const waitOf = (task) => S.needs[task.id]?.wait ?? 0;

/** Each group's tasks in order: waiting on him first, longest wait first. */
const groups = () => {
  const kind = S.boardKind;
  const out = new Map();
  for (const [key] of [...COLUMNS, ["needs"], ["dropped"]]) {
    out.set(key, []);
  }
  for (const task of S.tasks) {
    let key = task.stage;
    if (kind !== "columns" && S.needs[task.id]) {
      key = "needs";
    }
    out.get(key)?.push(task);
  }
  for (const list of out.values()) {
    list.sort((a, b) => waitOf(b) - waitOf(a));
  }
  return out;
};

const needCount = () => Object.keys(S.needs).length;
const needWords = (count) =>
  count === 1 ? "1 needs you" : `${count} need you`;

const place = () => {
  if (S.boardKind !== boardKind()) {
    buildBoard();
  }
  const board = $('[data-slot="board"]');
  const seen = new Set();
  let laneArrives = false;
  for (const [key, list] of groups()) {
    const col = $(`.col[data-col="${key}"]`, board);
    if (!col) {
      continue;
    }
    laneArrives ||= key === "needs" && col.hidden && list.length > 0;
    col.hidden = key === "needs" && list.length === 0;
    $(".col-count", col).textContent = list.length > 0 ? String(list.length) : "";
    const cards = $(".col-cards", col);
    for (const task of list) {
      const node = cardNode(task);
      seen.add(task.id);
      cards.append(node);
    }
    col.toggleAttribute(
      "data-dim",
      S.filter && !list.some((task) => S.needs[task.id])
    );
  }
  /* A card moved in the DOM drops a CSS transition, so its band turns by a
     Web Animation: in over --dur-panel on ease-out, and out the same. */
  for (const [node, from] of banded) {
    const to = getComputedStyle(node).backgroundColor;
    run(node, [{ backgroundColor: from }, { backgroundColor: to }], {
      dur: "--dur-panel",
      ease: "--ease-out",
      id: node.hasAttribute("data-needs") ? "band-tint" : "band-fade",
    });
  }
  banded.clear();
  for (const [id, node] of nodes) {
    if (seen.has(id)) {
      node.toggleAttribute("data-filtered-out", S.filter && !S.needs[id]);
    } else {
      node.remove();
    }
  }
  /* The sideways columns hold the column they were snapped to; the lane,
     arriving at their start, is shown instead (the cards' FLIP carries the move). */
  if (laneArrives && S.boardKind === "lane") {
    board.scrollLeft = 0;
  }
  markEdges();
  syncBreath();
};

/**
 * The house edge fade on the board's sides while more of it lies past them
 * (the pane or Caw's column narrows it): a column cut at an edge fades out
 * there rather than being sliced.
 */
const markEdges = () => {
  const board = $('[data-slot="board"]');
  const more = board.scrollWidth - board.clientWidth;
  board.toggleAttribute("data-more-start", more > 1 && board.scrollLeft > 1);
  board.toggleAttribute(
    "data-more-end",
    more > 1 && board.scrollLeft < more - 1
  );
};

const rects = () => {
  const map = new Map();
  for (const node of $$(".card[data-id]")) {
    map.set(node.dataset.id, node.getBoundingClientRect());
  }
  return map;
};

/**
 * The Nothing Jumps Rule: cards that stay slide to their new places, cards
 * that arrive fade in; all on one frame.
 */
const flip = (before, { id, dur = "--dur-panel", ease = "--ease-in-out" }) => {
  if (!motionOk()) {
    return;
  }
  for (const node of $$(".card[data-id]")) {
    const was = before.get(node.dataset.id);
    const now = node.getBoundingClientRect();
    if (!was) {
      run(node, [{ opacity: 0 }, { opacity: 1 }], {
        dur: "--dur-pop",
        ease: "--ease-out",
        id: `${id}-arrive`,
      });
      continue;
    }
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      continue;
    }
    run(node, [{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
      dur,
      ease,
      id,
    });
  }
};

/* ---------- MorphText, the Steady Swap Rule (words cross in a held cell) ---------- */

const morph = (cell, words, id) => {
  const old = cell.textContent;
  if (old === words) {
    return;
  }
  const next = document.createElement("span");
  next.textContent = words;
  if (!old) {
    cell.replaceChildren(next);
    const keys = motionOk()
      ? [
          { opacity: 0, scale: 0.95 },
          { opacity: 1, scale: 1 },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    run(next, keys, { dur: "--dur-morph", ease: "--ease-out", id });
    return;
  }
  const gone = document.createElement("span");
  gone.textContent = old;
  gone.setAttribute("aria-hidden", "true");
  cell.replaceChildren(gone, next);
  const shrink = motionOk() ? 0.95 : 1;
  run(
    gone,
    [
      { opacity: 1, scale: 1 },
      { opacity: 0, scale: shrink },
    ],
    { dur: "--dur-morph", ease: "--ease-out", id: `${id}-out`, fill: "forwards" }
  ).ended(() => gone.remove());
  run(
    next,
    [
      { opacity: 0, scale: shrink },
      { opacity: 1, scale: 1 },
    ],
    { dur: "--dur-morph", ease: "--ease-out", id }
  );
};

/* ---------- The head ---------- */

const drawHead = (animate) => {
  const project = PROJECTS[S.project];
  for (const slot of $$('[data-slot="project-name"]')) {
    slot.textContent = project.name;
  }
  /* A read the hub refused claims nothing it read: the place, no counts. */
  $('[data-slot="place"]').textContent =
    S.state === "fault" ? project.where : project.place;
  $('[data-slot="decisions"]').textContent = project.decisions;
  for (const row of $$(".rail-row[data-project]")) {
    if (row.dataset.project === S.project) {
      row.setAttribute("aria-current", "page");
    } else {
      row.removeAttribute("aria-current");
    }
  }
  document.title = `${project.name} · Caw&Co`;
  const slot = $('[data-slot="needs"]');
  const count = needCount();
  if (count === 0) {
    slot.replaceChildren();
  } else {
    let link = $(".needs-link", slot);
    if (!link) {
      slot.innerHTML =
        '<span aria-hidden="true">· </span><button class="needs-link" type="button" data-act="filter-needs" aria-pressed="false"></button>';
      link = $(".needs-link", slot);
    }
    link.setAttribute("aria-pressed", String(S.filter));
    if (animate) {
      morph(link, needWords(count), "needs-morph");
    } else {
      link.textContent = needWords(count);
    }
  }
  const chip = $(".viewbar-needs");
  chip.hidden = count === 0;
  chip.setAttribute("aria-pressed", String(S.filter));
  $('[data-slot="needs-count"]').textContent = String(count);
  drawRing(count);
  if (!$(".caw-col").hidden) {
    drawCaw();
  }
};

/**
 * Caw's arcs: one 30° arc per item, 8° apart, from 12 o'clock clockwise,
 * each drawing in and out along itself over --dur-panel on ease-out.
 */
const drawRing = (count) => {
  const svg = $(".caw-ring");
  const r = 15;
  const point = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return `${(16 + r * Math.sin(rad)).toFixed(2)} ${(16 - r * Math.cos(rad)).toFixed(2)}`;
  };
  const shown = Math.min(count, 9);
  const arcs = [...svg.querySelectorAll("path:not([data-leaving])")];
  for (let i = arcs.length; i < shown; i += 1) {
    const start = i * 38 + 4;
    const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arc.setAttribute("d", `M ${point(start)} A ${r} ${r} 0 0 1 ${point(start + 30)}`);
    arc.setAttribute("pathLength", "1");
    svg.append(arc);
    if (S.ringDrawn) {
      run(arc, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        dur: "--dur-panel",
        ease: "--ease-out",
        id: "arc-in",
      });
    }
  }
  for (const arc of arcs.slice(shown)) {
    arc.dataset.leaving = "";
    if (!motionOk()) {
      arc.remove();
      continue;
    }
    run(arc, [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }], {
      dur: "--dur-panel",
      ease: "--ease-out",
      id: "arc-out",
      fill: "forwards",
    }).ended(() => arc.remove());
  }
  S.ringDrawn = true;
  $(".glass-caw").setAttribute(
    "aria-label",
    count > 0 ? `Caw. Needs you, ${count}` : "Caw"
  );
};

/* ---------- The task pane ---------- */

const TABS = ["Task", "Session", "Changes", "History"];

const FILES = {
  "tsk-16": {
    pr: "PR #41",
    rows: [
      ["src/lib/tide.ts", 14, 3],
      ["src/lib/tide.test.ts", 22, 0],
    ],
  },
  "tsk-19": {
    pr: "PR #42",
    rows: [
      ["src/routes/shop/vouchers/+page.svelte", 61, 0],
      ["src/lib/vouchers.ts", 38, 0],
      ["src/lib/checkout.ts", 9, 2],
    ],
  },
  "tsk-12": {
    pr: "PR #39",
    rows: [
      ["src/routes/courses/calendar.ics/+server.ts", 44, 0],
      ["src/lib/courses.ts", 6, 1],
    ],
  },
};

const defaultTab = (task) => {
  if (task.stage === "working") {
    return "session";
  }
  if (task.stage === "review") {
    return "changes";
  }
  return "task";
};

const stagePill = (task) => {
  const tone = { working: "live", done: "done" }[task.stage] ?? "";
  const word = {
    ready: "Ready",
    working: "Working",
    review: "Review",
    done: "Done",
    dropped: "Dropped",
  }[task.stage];
  return `<span class="pill" data-tone="${tone}" data-slot="pill"><span>${word}</span></span>`;
};

const askSection = (task) => {
  const ask = S.needs[task.id];
  if (!ask) {
    return "";
  }
  if (ask.kind === "permission") {
    return `<div class="ask-sec" role="group" aria-labelledby="ask-q" data-slot="ask">
      <p class="ask-who" id="ask-q">${task.agent} asks to run a command</p>
      <pre class="cmd"><code>git push origin vouchers/taster-sessions</code></pre>
      <p class="review-check">Pushes 3 commits to github.com/bewinxed/tidewater.</p>
      <div class="peer">
        <button class="btn sm deny" type="button" data-answer="Denied: git push">${use("close-l")}<span>Deny</span></button>
        <button class="btn sm approve" type="button" data-answer="Approved: git push">${use("tick-l")}<span>Approve</span></button>
      </div>
    </div>`;
  }
  const options = [
    "Correct them in place",
    "Fetch the whole season again",
    "Leave them, and say so on the page",
  ];
  const chips = options
    .map(
      (words, i) =>
        `<button class="chip" type="button" aria-pressed="false" data-answer="${words}"><span class="keycap" data-box>${i + 1}</span><span>${words}</span></button>`
    )
    .join("");
  return `<div class="ask-sec" role="group" aria-labelledby="ask-q" data-slot="ask">
    <p class="ask-who">${task.agent} asks</p>
    <p class="ask-q" id="ask-q">The tide times stored before the fix are still an hour out from late March. What should I do with them?</p>
    <div class="chips" role="group" aria-label="Answers">${chips}<button class="chip" type="button" data-act="other"><span class="keycap" data-box>4</span><span>Other…</span></button></div>
  </div>`;
};

const tideStage = `<figure class="stage">
  <figcaption class="stage-cap">tide-table.png · Portsmouth, high water, BST</figcaption>
  <table class="tide">
    <thead><tr><th scope="col">Date</th><th scope="col">High water</th><th scope="col">Height</th></tr></thead>
    <tbody>
      <tr><td>29 Mar</td><td>03:31</td><td>4.6 m</td></tr>
      <tr data-checked><td>${use("tick-l", "glyph sm st-done")}30 Mar</td><td>04:12</td><td>4.7 m</td></tr>
      <tr><td>31 Mar</td><td>04:55</td><td>4.7 m</td></tr>
    </tbody>
  </table>
</figure>`;

/**
 * One raised card, read top to bottom: the ask first (a 2px spark rule on
 * its leading edge), then the handoff, then the decision at its foot.
 */
const reviewCard = (task) => {
  if (task.stage !== "review" && !(S.approved && task.id === TIDE.id)) {
    const ask = askSection(task);
    return ask ? `<section class="pcard review" data-slot="review">${ask}</section>` : "";
  }
  if (S.approved && task.id === TIDE.id) {
    return `<section class="pcard review" data-slot="review"><p class="review-result">${use("tick-l", "glyph st-done")}<span>Approved · landing as PR #41</span></p></section>`;
  }
  const words =
    task.id === TIDE.id
      ? "Fixed the DST offset in tide.ts; the table now matches BST from 29 March. Rows stored before the fix still read GMT, which is why I asked."
      : `Handed in for review: ${task.title.toLowerCase()}.`;
  const shown = task.id === TIDE.id ? tideStage : "";
  const files =
    task.id === TIDE.id
      ? `<p class="attachments"><span class="mark-line">${use("gallery", "glyph sm")}<span>tide-table.png</span></span><a class="mark-line" href="#pr-41">${use("link-minimalistic-2", "glyph sm")}<span>PR #41 · github.com</span></a></p>`
      : "";
  return `<section class="pcard review" data-slot="review">
    ${askSection(task)}
    <p class="review-who mark-line">${agentMark(task.agent)}<span><span class="who">${task.agent}</span> handed in · ${task.age} ago</span><a class="btn ghost sm open" href="#session"><span>Open</span>${use("square-top-down", "glyph sm")}</a></p>
    <p class="review-words">${words} <button class="more" type="button">More</button></p>
    <p class="review-check">${task.check.replace("Check:", "<b>Check:</b>")}</p>
    ${files}
    ${shown}
    <div class="decision" data-slot="decision">
      <button class="btn outline" type="button" data-act="approve">Approve → Done</button>
      <button class="btn outline" type="button" data-act="send-back">Send back</button>
    </div>
  </section>`;
};

const tabPanel = (task, tab) => {
  if (tab === "changes") {
    const { pr, rows } = FILES[task.id] ?? FILES[TIDE.id];
    const fileRows = rows
      .map(
        ([path, add, del]) =>
          `<p class="prow"><code class="what">${path}</code><span class="num add">+${add}</span><span class="num del">−${del}</span></p>`
      )
      .join("");
    return `<div class="ppanel" role="tabpanel" aria-label="Changes">
      <h3>Merge checks · 3 of 3 passed</h3>
      <div class="prows">
        <p class="prow">${use("tick-l", "glyph st-done")}<code class="what">bun install</code><button class="btn ghost sm" type="button">Logs</button></p>
        <p class="prow">${use("tick-l", "glyph st-done")}<code class="what">bun run check --all</code><button class="btn ghost sm" type="button">Logs</button></p>
        <p class="prow">${use("tick-l", "glyph st-done")}<code class="what">iOS build</code><button class="btn ghost sm" type="button">Logs</button></p>
      </div>
      <h3>${rows.length} ${rows.length === 1 ? "file" : "files"} · 1 commit · ${pr}</h3>
      <div class="prows">${fileRows}</div>
    </div>`;
  }
  if (tab === "session") {
    return `<div class="ppanel" role="tabpanel" aria-label="Session">
      <h3 class="mark-line">${ring(task.ring ?? [7, 7])}<span>Plan · ${(task.ring ?? [7, 7]).join(" of ")} done</span></h3>
      <ol class="steps">
        <li>Read the tide feed's offsets</li>
        <li>Find where BST is applied</li>
        <li data-now>${task.step ?? "Write the fix and its test"}</li>
        <li>Run the checks</li>
      </ol>
      <a class="btn outline sm" href="#session"><span>Open session</span>${use("square-top-down", "glyph sm")}</a>
    </div>`;
  }
  if (tab === "history") {
    return `<div class="ppanel" role="tabpanel" aria-label="History">
      <div class="prows">
        <p class="prow"><span class="what">Attempt 1 by ${task.agent ?? "Caw"}</span><span>3h ago</span></p>
        <p class="prow"><span class="what">Moved to Working</span><span>3h ago</span></p>
        <p class="prow"><span class="what">Handed in</span><span>2h ago</span></p>
        <p class="prow"><span class="what">Asked about the stored times</span><span>34m ago</span></p>
      </div>
    </div>`;
  }
  return `<div class="ppanel" role="tabpanel" aria-label="Task">
    <p>${task.title}. The table reads the harbour's feed in GMT and adds an hour from the last Sunday in March.</p>
    <h3>Done when</h3>
    <ul class="steps"><li>Every row after 29 March matches the harbour's own BST table</li><li>A test covers both clock changes</li></ul>
    <h3>Labels</h3>
    <p class="review-check">${task.labels ?? "none"}</p>
  </div>`;
};

const tabsHTML = (tab) =>
  `<div class="ptabs" role="tablist" aria-label="Task sections"><span class="ptabs-thumb" aria-hidden="true"></span>${TABS.map(
    (name) =>
      `<button class="ptab" type="button" role="tab" data-tab="${name.toLowerCase()}" aria-selected="${name.toLowerCase() === tab}">${name}</button>`
  ).join("")}</div>`;

const paneHTML = (task) => `
  <div class="pane-scroll">
    <header class="pane-head">
      <div class="pane-top">
        <button class="btn ghost sm" type="button" data-act="close-pane">${use("alt-arrow-left-l")}<span>Board</span></button>
        <code>${task.id}</code>
      </div>
      <h2 class="pane-title" data-slot="pane-title">${task.title}</h2>
      <p class="pane-facts mark-line">${stagePill(task)}${task.agent ? `${agentMark(task.agent)}<span class="who">${task.agent}</span>` : ""}<span>${task.age ? `${task.age} ago` : ""}</span><span class="labels">${task.labels ?? ""}</span></p>
    </header>
    ${reviewCard(task)}
  </div>
  <section class="pane-tabs" aria-label="Task sections">
    ${tabsHTML(S.tab)}
    <div data-slot="panel">${tabPanel(task, S.tab)}</div>
  </section>
  <footer class="pane-foot">
    <form class="composer" data-composer="pane">
      <label class="composer-field"><span class="visually-hidden">Message ${task.agent ?? "Caw"}</span>
        <textarea rows="1" placeholder="Message ${task.agent ?? "Caw"}…" data-slot="pane-field"></textarea></label>
      <button class="composer-send" type="submit" aria-label="Send">${use("plain-2")}<span class="send-word">Send</span></button>
    </form>
  </footer>`;

const placeThumb = (track, animate) => {
  const thumb = $(".ptabs-thumb, .views-thumb", track);
  const chosen = $('[aria-selected="true"]', track);
  if (!(thumb && chosen)) {
    return;
  }
  if (!animate) {
    thumb.style.transition = "none";
  }
  thumb.style.translate = `${chosen.offsetLeft}px 0`;
  thumb.style.width = `${chosen.offsetWidth}px`;
  if (!animate) {
    thumb.getBoundingClientRect();
    thumb.style.transition = "";
  }
};

const taskOf = (id) => S.tasks.find((task) => task.id === id);

/**
 * The pane's scroller wears the house edge fade where more of it lies past
 * an edge: its head once scrolled away, and its foot while the card runs on
 * under the verdict bar, which holds there (the bar stands above its own
 * place in the card).
 */
const markPane = () => {
  const scroll = $(".pane-scroll");
  if (!scroll) {
    return;
  }
  scroll.toggleAttribute("data-more-start", scroll.scrollTop > 1);
  const bar = $('[data-slot="decision"]', scroll);
  const card = bar?.closest(".pcard");
  if (bar && card) {
    bar.toggleAttribute(
      "data-stuck",
      card.getBoundingClientRect().bottom > bar.getBoundingClientRect().bottom + 1.5
    );
  }
};
const paneSizes = new ResizeObserver(markPane);

const drawPane = () => {
  const pane = $('[data-slot="pane"]');
  const task = taskOf(S.selected);
  if (!task) {
    return;
  }
  pane.innerHTML = paneHTML(task);
  placeThumb($(".ptabs", pane), false);
  const scroll = $(".pane-scroll", pane);
  scroll.addEventListener("scroll", markPane, { passive: true });
  paneSizes.disconnect();
  paneSizes.observe(scroll);
  for (const part of scroll.children) {
    paneSizes.observe(part);
  }
  markPane();
};

/** The pane's title flown from the card's (The One Object Rule). */
const flyTitle = (from, to) => {
  if (!(motionOk() && from && to)) {
    return;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const copy = to.cloneNode(true);
  copy.removeAttribute("data-slot");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${b.left}px`,
    top: `${b.top}px`,
    width: `${b.width}px`,
    margin: "0",
    transformOrigin: "0 0",
    zIndex: token("--layer-flight"),
    pointerEvents: "none",
  });
  document.body.append(copy);
  to.style.visibility = "hidden";
  const scale = a.width / b.width;
  run(
    copy,
    [
      { translate: `${a.left - b.left}px ${a.top - b.top}px`, scale: `${scale}` },
      { translate: "0 0", scale: "1" },
    ],
    { dur: "--dur-panel", ease: "--ease-drawer", id: "title-flight" }
  ).ended(() => {
    copy.remove();
    to.style.visibility = "";
  });
};

const openPane = (id, { animate = true } = {}) => {
  const task = taskOf(id);
  if (!task) {
    return;
  }
  S.selected = id;
  S.tab = defaultTab(task);
  S.tabWas = S.tab;
  APP.dataset.pane = "open";
  const pane = $('[data-slot="pane"]');
  const wasOpen = !pane.hidden;
  pane.hidden = false;
  drawPane();
  place();
  const card = nodes.get(id);
  if (!PHONE.matches) {
    card?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (!(animate && motionOk()) || wasOpen) {
    if (PHONE.matches) {
      $("#page").style.visibility = "hidden";
    }
    return;
  }
  if (PHONE.matches) {
    const page = $("#page");
    run(pane, [{ translate: "100% 0" }, { translate: "0 0" }], {
      dur: "--dur-panel",
      ease: "--ease-drawer",
      id: "pane-push",
    });
    run(
      page,
      [
        { translate: "0 0", opacity: 1 },
        { translate: "-30% 0", opacity: 0.6 },
      ],
      { dur: "--dur-panel", ease: "--ease-drawer", id: "page-fall", fill: "forwards" }
    ).ended((done) => {
      done.cancel();
      if (S.selected) {
        page.style.visibility = "hidden";
      }
    });
    return;
  }
  run(
    pane,
    [
      { opacity: 0, translate: "16px 0" },
      { opacity: 1, translate: "0 0" },
    ],
    { dur: "--dur-panel", ease: "--ease-drawer", id: "pane-in" }
  );
  flyTitle($(".card-title", card), $('[data-slot="pane-title"]', pane));
  say(`${task.title} is open beside the board`);
};

const closePane = () => {
  const pane = $('[data-slot="pane"]');
  if (pane.hidden) {
    return;
  }
  const id = S.selected;
  S.selected = null;
  delete APP.dataset.pane;
  place();
  const page = $("#page");
  page.style.visibility = "";
  const finish = () => {
    pane.hidden = true;
    pane.replaceChildren();
    $(".card-link", nodes.get(id))?.focus({ preventScroll: true });
    paintActs();
  };
  if (!motionOk()) {
    finish();
    return;
  }
  if (PHONE.matches) {
    run(
      page,
      [
        { translate: "-30% 0", opacity: 0.6 },
        { translate: "0 0", opacity: 1 },
      ],
      { dur: "--dur-pop", ease: "--ease-drawer", id: "page-back" }
    );
    run(pane, [{ translate: "0 0" }, { translate: "100% 0" }], {
      dur: "--dur-pop",
      ease: "--ease-drawer",
      id: "pane-pop",
      fill: "forwards",
    }).ended(finish);
    return;
  }
  run(
    pane,
    [
      { opacity: 1, translate: "0 0" },
      { opacity: 0, translate: "8px 0" },
    ],
    { dur: "--dur-exit", ease: "--ease-out", id: "pane-out", fill: "forwards" }
  ).ended(finish);
};

/** A height change in place: the fold `unfold` makes (out over --dur-exit). */
const foldTo = (element, html, id) => {
  const from = element.getBoundingClientRect().height;
  element.innerHTML = html;
  const to = element.getBoundingClientRect().height;
  if (!motionOk()) {
    return;
  }
  run(element, [{ height: `${from}px` }, { height: `${to}px` }], {
    dur: "--dur-exit",
    ease: "--ease-out",
    id,
  });
  for (const child of element.children) {
    run(
      child,
      [
        { opacity: 0, filter: `blur(${token("--fold-blur")})` },
        { opacity: 1, filter: "blur(0)" },
      ],
      { dur: "--dur-exit", ease: "--ease-out", id: `${id}-words` }
    );
  }
};

/** A card folding shut where it stands, then gone. */
const foldAway = (element, id) => {
  if (!motionOk()) {
    element.remove();
    return;
  }
  run(
    element,
    [
      { height: `${element.getBoundingClientRect().height}px`, opacity: 1 },
      { height: "0px", opacity: 0, paddingBlock: "0px", borderWidth: "0px" },
    ],
    { dur: "--dur-exit", ease: "--ease-out", id, fill: "forwards" }
  ).ended(() => element.remove());
};

const answer = (button, words) => {
  const id = S.selected;
  const ask = $('[data-slot="ask"]');
  if (!(id && ask && S.needs[id])) {
    return;
  }
  button.setAttribute("aria-pressed", "true");
  for (const other of $$("button", ask)) {
    other.setAttribute("aria-disabled", "true");
  }
  const before = rects();
  S.needs = without(S.needs, id);
  S.answered = words;
  place();
  flip(before, { id: "card-settle" });
  drawHead(true);
  const label = words.includes(":")
    ? `<b>${words}</b> · just now`
    : `Answered: <b>${words}</b> · just now`;
  foldTo(ask, `<p class="ask-answered">${label}</p>`, "ask-fold");
  ask.classList.add("is-answered");
  hideTray();
  say(`Answered ${taskOf(id)?.agent}: ${words}`);
};

const approve = () => {
  const id = S.selected;
  const task = taskOf(id);
  if (!task || task.stage !== "review") {
    return;
  }
  const before = rects();
  task.stage = "done";
  task.line = id === TIDE.id ? "Landed as PR #41 · just now" : "Landed on main · just now";
  S.tasks = [task, ...S.tasks.filter((other) => other.id !== id)];
  const hadAsk = Boolean(S.needs[id]);
  S.needs = without(S.needs, id);
  S.approved = id === TIDE.id;
  place();
  flip(before, { id: "card-land", ease: "--ease-drawer" });
  drawHead(hadAsk);
  const pill = $('[data-slot="pill"]');
  pill.dataset.tone = "done";
  morph(pill, "Done", "pill-morph");
  const review = $('[data-slot="review"]');
  if (review) {
    foldTo(
      review,
      `<p class="review-result">${use("tick-l", "glyph st-done")}<span>Approved · landing as ${id === TIDE.id ? "PR #41" : "PR #42"}</span></p>`,
      "review-fold"
    );
  }
  say(`${task.title} approved and moved to Done`);
};

/** Send back with its note: the card flies back to Working, the pill turns, the review folds. */
const sendBackGo = () => {
  const id = S.selected;
  const task = taskOf(id);
  if (!task || task.stage !== "review") {
    return;
  }
  const before = rects();
  task.stage = "working";
  task.step = "Reading your note";
  task.ring = [0, 3];
  task.age = "now";
  S.needs = without(S.needs, id);
  place();
  flip(before, { id: "card-back", ease: "--ease-drawer" });
  drawHead(false);
  const pill = $('[data-slot="pill"]');
  pill.dataset.tone = "live";
  morph(pill, "Working", "pill-morph");
  const review = $('[data-slot="review"]');
  if (review) {
    foldTo(
      review,
      `<p class="review-result"><span>Sent back to ${task.agent} · just now</span></p>`,
      "review-fold"
    );
  }
  say(`${task.title} sent back to ${task.agent}`);
};

/**
 * Send back opens its note where Approve stood: Approve folds away, the
 * field unfolds in its cell with Cancel at its end, and Send back, which
 * never moves, becomes the act on the same clock.
 */
const sendBack = () => {
  const bar = $('[data-slot="decision"]');
  const approveButton = $('[data-act="approve"]', bar ?? document);
  const back = $('[data-act="send-back"]', bar ?? document);
  if (!(bar && approveButton && back)) {
    return;
  }
  const cell = document.createElement("div");
  cell.className = "note-cell";
  cell.innerHTML = `<label class="note-field"><span class="visually-hidden">What should change?</span><textarea rows="1" placeholder="What should change?"></textarea></label><button class="btn ghost sm" type="button" data-act="send-back-cancel">Cancel</button>`;
  bar.prepend(cell);
  back.dataset.act = "send-back-go";
  if (motionOk()) {
    run(
      cell,
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { dur: "--dur-exit", ease: "--ease-out", id: "note-unfold" }
    );
    run(approveButton, [{ opacity: 1 }, { opacity: 0 }], {
      dur: "--dur-exit",
      ease: "--ease-out",
      id: "approve-fold",
      fill: "forwards",
    }).ended(() => approveButton.remove());
  } else {
    approveButton.remove();
  }
  $("textarea", cell).focus();
};

const sendBackCancel = () => {
  const bar = $('[data-slot="decision"]');
  const cell = $(".note-cell", bar ?? document);
  const back = $('[data-act="send-back-go"]', bar ?? document);
  if (!(bar && cell && back)) {
    return;
  }
  cell.remove();
  back.dataset.act = "send-back";
  const approveButton = document.createElement("button");
  approveButton.className = "btn outline";
  approveButton.type = "button";
  approveButton.dataset.act = "approve";
  approveButton.textContent = "Approve → Done";
  bar.prepend(approveButton);
  if (motionOk()) {
    run(approveButton, [{ opacity: 0 }, { opacity: 1 }], {
      dur: "--dur-pop",
      ease: "--ease-out",
      id: "approve-back",
    });
  }
};

/* The composer as a question: Other… hands the field the question. */
const showTray = () => {
  const foot = $(".pane-foot");
  const field = $('[data-slot="pane-field"]');
  if (!(foot && field)) {
    return;
  }
  field.placeholder = "Your answer…";
  if (motionOk()) {
    run(
      field,
      [
        { opacity: 0.4, translate: "0 3px" },
        { opacity: 1, translate: "0 0" },
      ],
      { dur: "--dur-morph", ease: "--ease-out", id: "placeholder-morph" }
    );
  }
  if (!$(".composer-tray", foot)) {
    const tray = document.createElement("div");
    tray.className = "composer-tray";
    tray.setAttribute("role", "group");
    tray.setAttribute("aria-label", "Answers");
    for (const chip of $$('[data-slot="ask"] .chip[data-answer]')) {
      tray.append(chip.cloneNode(true));
    }
    foot.prepend(tray);
    run(
      tray,
      [
        { opacity: 0, translate: `0 ${token("--pop-rise")}` },
        { opacity: 1, translate: "0 0" },
      ],
      { dur: "--dur-pop", ease: "--ease-drawer", id: "tray-in" }
    );
  }
  field.focus();
};

const hideTray = () => {
  const tray = $(".composer-tray");
  tray?.remove();
  const field = $('[data-slot="pane-field"]');
  if (field) {
    field.placeholder = `Message ${taskOf(S.selected)?.agent ?? "Caw"}…`;
  }
};

const chooseTab = (name, animate = true) => {
  const task = taskOf(S.selected);
  if (!task) {
    return;
  }
  S.tab = name;
  const tabs = $(".ptabs");
  for (const tab of $$(".ptab", tabs)) {
    tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
  }
  const names = TABS.map((each) => each.toLowerCase());
  const step = Math.sign(names.indexOf(name) - names.indexOf(S.tabWas ?? name));
  S.tabWas = name;
  placeThumb(tabs, animate && motionOk());
  const panel = $('[data-slot="panel"]');
  panel.innerHTML = tabPanel(task, name);
  /* We fly instead of teleport: the panel comes in from the side of the tab chosen. */
  if (animate && step !== 0) {
    const keys = motionOk()
      ? [
          { opacity: 0, translate: `${step * 8}px 0` },
          { opacity: 1, translate: "0 0" },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    run(panel, keys, { dur: "--dur-toggle", ease: "--ease-out", id: "panel-in" });
  }
};

/* ---------- Caw ---------- */

const threadRow = (html, cls) => {
  const row = document.createElement("li");
  row.className = cls;
  row.innerHTML = html;
  $('[data-slot="thread"]').append(row);
  return row;
};

const markSrc = () => "caw/mark-light.png";

const openCaw = ({ focus = true, animate = true } = {}) => {
  const col = $(".caw-col");
  if (!col.hidden) {
    return col;
  }
  col.hidden = false;
  drawCaw();
  if (animate && motionOk()) {
    const keys = PHONE.matches
      ? [{ translate: "0 100%" }, { translate: "0 0" }]
      : [
          { opacity: 0, translate: "16px 0" },
          { opacity: 1, translate: "0 0" },
        ];
    run(col, keys, {
      dur: "--dur-panel",
      ease: "--ease-drawer",
      id: PHONE.matches ? "sheet-in" : "caw-col-in",
    });
  }
  if (focus) {
    $('[data-slot="caw-field"]').focus({ preventScroll: true });
  }
  return col;
};

const closeCaw = () => {
  const col = $(".caw-col");
  if (col.hidden) {
    return;
  }
  const finish = () => {
    col.hidden = true;
    paintActs();
  };
  if (!motionOk()) {
    finish();
    return;
  }
  const keys = PHONE.matches
    ? [{ translate: "0 0" }, { translate: "0 100%" }]
    : [{ opacity: 1 }, { opacity: 0 }];
  run(col, keys, {
    dur: "--dur-exit",
    ease: "--ease-out",
    id: "caw-out",
    fill: "forwards",
  }).ended(finish);
};

/** One of Caw's notes: his mark in the lead column, his words, its age; a live dot while it runs. */
const noteHTML = ({ words, age, live }) =>
  `<img class="caw-mark" src="${markSrc()}" alt="" width="28" height="28"/><span class="said">${live ? '<span class="live-dot breathe" aria-hidden="true"></span>' : ""}<span data-slot="caw-said">${words}</span>${age ? `<span class="note-age"> · ${age}</span>` : ""}</span>`;

const cawRow = (words) =>
  threadRow(noteHTML({ words, live: true }), "msg-caw");

/** A Needs-you row in Caw's column: the hand-shake in the lead column, the ask, its act. */
const needRow = (id, ask) => {
  const act =
    ask.kind === "permission"
      ? peerPair(id)
      : `<button class="btn outline sm" type="button" data-card-answer="${id}">Answer</button>`;
  return `<li class="need-row"><span class="need-lead">${use("hand-shake")}</span><span class="need-words"><span class="visually-hidden">Needs you: </span>${askWords(ask)}</span><span class="need-meta num">waiting ${ask.wait}m</span>${act}</li>`;
};

/**
 * What Caw's column holds at rest: the asks first, a brand-solid rule, then
 * his thread (his notes, newest at the foot). A project with no thread yet
 * takes the empty recipe: Caw still on the axis, the title and one line at
 * the start, three starters from the project's own work, then the composer.
 */
const drawCaw = () => {
  const thread = $('[data-slot="thread"]');
  if (thread.children.length === 0) {
    const notes = (CAW_NOTES[S.project] ?? []).filter(
      (note) => !note.when || S.needs[note.when]
    );
    for (const note of notes) {
      threadRow(noteHTML(note), "msg-caw");
    }
  }
  const asks = Object.entries(S.needs);
  $('[data-slot="caw-needs"]').innerHTML = asks
    .map(([id, ask]) => needRow(id, ask))
    .join("");
  const first = thread.children.length === 0;
  $('[data-slot="caw-rule"]').hidden = asks.length === 0 || first;
  const start = $('[data-slot="caw-first"]');
  start.hidden = !first;
  $('[data-slot="caw-first-title"]').textContent =
    `Talk to Caw about ${PROJECTS[S.project].name}`;
  $('[data-slot="caw-starters"]').innerHTML = (FIRST_STARTERS[S.project] ?? [])
    .map(
      (words) =>
        `<button class="caw-starter" type="button" data-words="${words}">${words}</button>`
    )
    .join("");
  syncBreath();
};

/** Deny or Approve on a card or a row of Caw's column: the band goes and the card settles. */
const answerPermission = (id, verb) => {
  const ask = S.needs[id];
  if (!ask) {
    return;
  }
  const before = rects();
  S.needs = without(S.needs, id);
  place();
  flip(before, { id: "card-settle" });
  drawHead(true);
  const section = S.selected === id ? $('[data-slot="ask"]') : null;
  const said = `${verb === "approve" ? "Approved" : "Denied"}: ${ask.command}`;
  if (section) {
    foldTo(section, `<p class="ask-answered"><b>${said}</b> · just now</p>`, "ask-fold");
    section.classList.add("is-answered");
  }
  say(`${said} for ${ask.agent}`);
};

const putCawWords = (words) => {
  const field = $('[data-slot="caw-field"]');
  field.value = words;
  autosize(field);
  field.focus();
  field.setSelectionRange(words.length, words.length);
  if (motionOk()) {
    run(
      field,
      [
        { opacity: 0, translate: "8px 0" },
        { opacity: 1, translate: "0 0" },
      ],
      { dur: "--dur-control", ease: "--ease-out", id: "draft-in" }
    );
  }
};

/**
 * Lifts a block out of the page's flow where it stands, so what replaces it
 * takes its place underneath while it fades (the two trade places on one clock).
 */
const liftOut = (element, id) => {
  const page = $("#page");
  const box = element.getBoundingClientRect();
  const frameBox = page.getBoundingClientRect();
  Object.assign(element.style, {
    position: "absolute",
    left: `${box.left - frameBox.left + page.scrollLeft}px`,
    top: `${box.top - frameBox.top + page.scrollTop}px`,
    width: `${box.width}px`,
    pointerEvents: "none",
  });
  const finish = () => {
    element.hidden = true;
    element.removeAttribute("style");
    paintActs();
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.cancel();
    }
  };
  if (!motionOk()) {
    finish();
    return;
  }
  run(element, [{ opacity: 1 }, { opacity: 0 }], {
    dur: "--dur-fade",
    ease: "--ease-out",
    id,
    fill: "forwards",
  }).ended(finish);
};

/** The board, shown in the skeleton's reveal (400ms cross-fade, 2px cross-blur). */
const revealBoard = (tasks, skeleton) => {
  const board = $('[data-slot="board"]');
  S.tasks = tasks;
  board.hidden = false;
  S.boardKind = "";
  place();
  if (skeleton) {
    for (const col of $$(".col", board)) {
      const cards = $(".col-cards", col);
      const count = col.dataset.col === "ready" ? 3 : 1;
      for (let i = 0; i < count; i += 1) {
        const skel = document.createElement("div");
        skel.className = "skel";
        skel.setAttribute("aria-hidden", "true");
        cards.append(skel);
      }
    }
  }
  if (motionOk()) {
    run(
      board,
      [
        { opacity: 0, filter: `blur(${token("--skeleton-reveal-blur")})` },
        { opacity: 1, filter: "blur(0)" },
      ],
      {
        dur: "--dur-skeleton-reveal",
        ease: "--ease-crossfade",
        id: "board-reveal",
      }
    );
  }
};

/** Send from the empty project: the field flies to Caw's column, the board stands up behind it. */
const sendFromEmpty = (words) => {
  const hero = $(".composer-hero");
  const heroCaw = $(".caw-hero");
  const from = hero.getBoundingClientRect();
  liftOut($(".empty"), "empty-out");
  revealBoard([], true);
  const col = openCaw({ focus: false, animate: false });
  const target = $(".composer-caw", col);
  const to = target.getBoundingClientRect();
  $('[data-slot="thread"]').replaceChildren();
  $('[data-slot="caw-first"]').hidden = true;
  const mine = threadRow(words, "msg-you");
  const row = cawRow(`Reading ${PROJECTS[S.project].name}'s folder`);
  S.cawRow = row;
  if (motionOk()) {
    const keys = PHONE.matches
      ? [{ translate: "0 100%" }, { translate: "0 0" }]
      : [
          { opacity: 0, translate: "16px 0" },
          { opacity: 1, translate: "0 0" },
        ];
    run(col, keys, {
      dur: "--dur-panel",
      ease: "--ease-drawer",
      id: PHONE.matches ? "sheet-in" : "caw-col-in",
    });
    const copy = hero.cloneNode(true);
    Object.assign(copy.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: "0",
      visibility: "visible",
      transformOrigin: "0 0",
      zIndex: token("--layer-flight"),
      pointerEvents: "none",
    });
    $("textarea", copy).value = words;
    document.body.append(copy);
    hero.style.visibility = "hidden";
    target.style.visibility = "hidden";
    run(
      copy,
      [
        {
          translate: `${from.left - to.left}px ${from.top - to.top}px`,
          scale: `${from.width / to.width} ${from.height / to.height}`,
        },
        { translate: "0 0", scale: "1 1" },
      ],
      { dur: "--dur-panel", ease: "--ease-drawer", id: "field-flight" }
    ).ended(() => {
      copy.remove();
      target.style.visibility = "";
    });
    run($("textarea", copy), [{ opacity: 1 }, { opacity: 0 }], {
      dur: "--dur-exit",
      ease: "--ease-out",
      id: "field-words-out",
      fill: "forwards",
    });
    run(
      heroCaw,
      [
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: Number(token("--leave-scale")) },
      ],
      {
        dur: "--dur-fade",
        ease: "--ease-out",
        id: "caw-leave",
        fill: "forwards",
      }
    );
    run(mine, [{ opacity: 0 }, { opacity: 1 }], {
      dur: "--dur-pop",
      ease: "--ease-out",
      id: "thread-arrive",
    });
    run(
      $(".caw-mark", row),
      [
        { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1 },
      ],
      {
        dur: "--dur-pop",
        ease: "--ease-out",
        id: "caw-mark-in",
        delay: ms("--dur-fade"),
      }
    );
  }
  say("Sent to Caw");
  if (S.auto) {
    S.timer = setTimeout(fileTasks, 1400);
  }
};

/** The hub says Caw filed his tasks: they arrive top to bottom where the skeleton stood. */
const fileTasks = () => {
  const board = $('[data-slot="board"]');
  for (const skel of $$(".skel", board)) {
    skel.remove();
  }
  let i = 0;
  for (const task of FILED) {
    S.tasks.push({ ...task });
    place();
    const node = nodes.get(task.id);
    if (node && motionOk()) {
      run(
        node,
        [
          { opacity: 0, translate: "0 -4px" },
          { opacity: 1, translate: "0 0" },
        ],
        {
          dur: "--dur-pop",
          ease: "--ease-out",
          id: "filed-arrive",
          delay: i * ms("--dur-stagger"),
        }
      );
    }
    i += 1;
  }
  const row = S.cawRow;
  if (row) {
    morph($('[data-slot="caw-said"]', row), "Filed 3 tasks in Ready", "caw-said-morph");
    $(".live-dot", row)?.remove();
  }
  say("Caw filed 3 tasks in Ready");
};

/* ---------- Failure ---------- */

const retry = (button) => {
  if (button.getAttribute("aria-disabled") === "true") {
    return;
  }
  button.setAttribute("aria-disabled", "true");
  say("Retrying");
  if (S.auto) {
    S.timer = setTimeout(hubAnswers, 900);
  }
};

/** The hub answers the read: the fault gives way to the board in the skeleton's reveal. */
const hubAnswers = () => {
  const fault = $(".fault");
  $('[data-act="retry"]').removeAttribute("aria-disabled");
  liftOut(fault, "fault-out");
  revealBoard(boardTasks([TIDE]), false);
  S.state = "rest";
  APP.dataset.state = "rest";
  drawHead(false);
  paintActs();
  say("The board for Cawco-Dev was read");
};

const toggleDetails = (button) => {
  const box = $(".fault-details");
  const open = box.hidden;
  button.setAttribute("aria-expanded", String(open));
  morph(button, open ? "Hide details" : "Show details", "details-label");
  if (open) {
    box.hidden = false;
    if (motionOk()) {
      const to = box.getBoundingClientRect().height;
      const pad = getComputedStyle(box).paddingBlockStart;
      run(
        box,
        [
          { height: "0px", paddingBlock: "0px", opacity: 0 },
          { height: `${to}px`, paddingBlock: pad, opacity: 1 },
        ],
        { dur: "--dur-pop", ease: "--ease-out", id: "details-unfold" }
      );
    }
    return;
  }
  if (!motionOk()) {
    box.hidden = true;
    return;
  }
  run(
    box,
    [
      { height: `${box.getBoundingClientRect().height}px`, opacity: 1 },
      { height: "0px", paddingBlock: "0px", opacity: 0 },
    ],
    { dur: "--dur-exit", ease: "--ease-out", id: "details-fold", fill: "forwards" }
  ).ended((done) => {
    box.hidden = true;
    done.cancel();
  });
};

/* ---------- States ---------- */

const resetSurfaces = () => {
  clearTimeout(S.timer);
  S.cawRow = null;
  S.ringDrawn = false;
  $(".caw-ring").replaceChildren();
  for (const animation of document.getAnimations()) {
    if (animation.id) {
      animation.cancel();
    }
  }
  for (const flight of $$("body > .pane-title, body > .composer")) {
    flight.remove();
  }
  const pane = $('[data-slot="pane"]');
  pane.hidden = true;
  pane.replaceChildren();
  $(".caw-col").hidden = true;
  $('[data-slot="thread"]').replaceChildren();
  for (const block of [$(".empty"), $(".fault")]) {
    block.hidden = true;
    block.removeAttribute("style");
  }
  $(".fault-details").hidden = true;
  $('[data-slot="board"]').hidden = false;
  $("#page").style.visibility = "";
  $(".caw-hero").style.visibility = "";
  $(".composer-hero").style.visibility = "";
  $('[data-slot="hero-field"]').value = "";
  const details = $('[data-act="details"]');
  details.textContent = "Show details";
  details.setAttribute("aria-expanded", "false");
  $('[data-act="retry"]').removeAttribute("aria-disabled");
  closeMenu(false);
  S.selected = null;
  delete APP.dataset.pane;
  S.filter = false;
  S.dropped = false;
  S.answered = null;
  S.approved = false;
  S.needs = {};
  S.project = "cawco-dev";
  S.boardKind = "";
  nodes.clear();
};

const setState = async (state) => {
  await enter(state);
  paintActs();
};

const enter = async (state) => {
  S.state = state;
  APP.dataset.state = state;
  resetSurfaces();
  if (state === "empty") {
    S.project = "tidewater";
    S.tasks = [];
    $('[data-slot="board"]').hidden = true;
    $(".empty").hidden = false;
    drawHead(false);
    return;
  }
  if (state === "fault") {
    S.tasks = [];
    $('[data-slot="board"]').hidden = true;
    $(".fault").hidden = false;
    drawHead(false);
    return;
  }
  if (state === "rest") {
    S.tasks = boardTasks([TIDE]);
    place();
    drawHead(false);
    return;
  }
  if (state === "first") {
    S.project = "obelisk-site";
    S.tasks = [...fromRows(SITE, "ready"), ...fromRows(SITE_DONE, "done")];
    place();
    drawHead(false);
    openCaw({ focus: false, animate: false });
    return;
  }
  S.tasks = boardTasks([CALENDAR, TIDE, VOUCHERS]);
  if (state === "open") {
    S.needs = { ...ASKS };
    place();
    drawHead(false);
    await frame();
    openPane(TIDE.id);
    return;
  }
  place();
  drawHead(false);
  await frame();
  await frame();
  if (S.state !== "waiting") {
    return;
  }
  const before = rects();
  S.needs = { ...ASKS };
  place();
  flip(before, { id: "needs-reflow" });
  drawHead(true);
  say("2 tasks need you");
};

/* ---------- One act per view ---------- */

/**
 * Coral marks the one place he acts, so each view has one coral control:
 * the pane's decision while a result waits on him (Approve, or Send back
 * once its note is open), else the pane's composer; Caw's composer while
 * his column is open; the empty project's field; Retry over a refused read;
 * and otherwise Ask Caw. The rest take the outline, or a glyph alone.
 * Ask Caw stands down while Caw is open or a field is already the way in.
 */
const paintActs = () => {
  const pane = $('[data-slot="pane"]');
  const settled = (block) => !(block.hidden || block.style.position);
  const paneOpen = !pane.hidden;
  const cawOpen = !$(".caw-col").hidden;
  const heroOpen = settled($(".empty"));
  const faultOpen = settled($(".fault"));
  /* While an ask stands its answer is the entry point, never coral (the
     Peer Rule's pair, or chips): the verdict waits, outline, beside it. */
  const asking = paneOpen && Boolean(S.needs[S.selected]);
  const decision =
    paneOpen && !asking
      ? ($('[data-act="send-back-go"]', pane) ??
        $('[data-act="approve"]', pane))
      : null;
  let act = null;
  if (decision) {
    act = decision;
  } else if (paneOpen && !asking) {
    act = $(".composer-send", pane);
  } else if (cawOpen) {
    act = $(".composer-caw .composer-send");
  } else if (heroOpen) {
    act = $(".composer-hero .composer-send");
  } else if (faultOpen) {
    act = $('[data-act="retry"]');
  }
  for (const send of $$(".composer-send")) {
    send.classList.toggle("act", send === act);
  }
  for (const button of $$(
    '[data-act="approve"], [data-act="send-back"], [data-act="send-back-go"], [data-act="retry"]'
  )) {
    const becomes = button === act && !button.classList.contains("primary");
    button.classList.toggle("primary", button === act);
    button.classList.toggle("outline", button !== act);
    if (becomes && motionOk()) {
      run(button, [{ opacity: 0.55 }, { opacity: 1 }], {
        dur: "--dur-exit",
        ease: "--ease-out",
        id: "act-coral",
      });
    }
  }
  for (const ask of $$('[data-act="ask-caw"]')) {
    const returning = ask.hidden && !(cawOpen || heroOpen);
    ask.hidden = cawOpen || heroOpen;
    /* Back once Caw's column shuts: it fades in where it stood, never pops. */
    if (returning && S.ringDrawn) {
      run(ask, [{ opacity: 0 }, { opacity: 1 }], {
        dur: "--dur-fade",
        ease: "--ease-out",
        id: "ask-back",
      });
    }
    ask.classList.toggle("primary", !act);
    ask.classList.toggle("outline", Boolean(act));
  }
  markPane();
  syncBreath();
};

/* ---------- The ⋯ menu ---------- */

const closeMenu = (refocus = true) => {
  const pop = $(".pop");
  const trigger = $('[data-act="more"]');
  if (pop.dataset.state !== "open") {
    return;
  }
  pop.dataset.state = "closed";
  trigger.setAttribute("aria-expanded", "false");
  if (refocus) {
    trigger.focus();
  }
};

const toggleMenu = () => {
  const pop = $(".pop");
  const trigger = $('[data-act="more"]');
  if (pop.dataset.state === "open") {
    closeMenu();
    return;
  }
  pop.dataset.state = "open";
  trigger.setAttribute("aria-expanded", "true");
};

/* ---------- Wiring ---------- */

const autosize = (field) => {
  field.style.height = "auto";
  const floor = Number.parseFloat(token("--c-composer-field"));
  field.style.height = `${Math.min(200, Math.max(floor, field.scrollHeight))}px`;
};

const putWords = (words) => {
  const field = $('[data-slot="hero-field"]');
  field.value = words;
  autosize(field);
  field.focus();
  field.setSelectionRange(words.length, words.length);
  if (motionOk()) {
    run(
      field,
      [
        { opacity: 0, translate: "8px 0" },
        { opacity: 1, translate: "0 0" },
      ],
      { dur: "--dur-control", ease: "--ease-out", id: "draft-in" }
    );
  }
};

const ACTS = {
  "ask-caw": () => {
    openCaw();
  },
  "close-caw": closeCaw,
  "close-pane": closePane,
  more: toggleMenu,
  approve,
  "send-back": sendBack,
  "send-back-go": () => sendBackGo(),
  "send-back-cancel": sendBackCancel,
  other: showTray,
  "filter-needs": () => {
    S.filter = !S.filter;
    place();
    drawHead(false);
  },
  dropped: () => {
    S.dropped = !S.dropped;
    S.boardKind = "";
    place();
    const col = $('.col[data-col="dropped"]');
    if (col) {
      run(col, [{ opacity: 0 }, { opacity: 1 }], {
        dur: "--dur-pop",
        ease: "--ease-out",
        id: "dropped-in",
      });
    }
  },
  retry: (button) => retry(button),
  details: (button) => toggleDetails(button),
};

document.addEventListener("click", (event) => {
  pressed(event);
  paintActs();
});

const pressed = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }
  if (!target.closest(".menu-anchor")) {
    closeMenu(false);
  }
  const acted = target.closest("[data-act]");
  if (acted && ACTS[acted.dataset.act]) {
    event.preventDefault();
    ACTS[acted.dataset.act](acted);
    return;
  }
  const answerHere = target.closest("[data-card-answer]");
  if (answerHere) {
    openPane(answerHere.dataset.cardAnswer);
    $('[data-slot="ask"] .chip, [data-slot="ask"] .btn')?.focus();
    return;
  }
  const perm = target.closest("[data-card-perm]");
  if (perm) {
    answerPermission(perm.dataset.id, perm.dataset.cardPerm);
    return;
  }
  const cawStarter = target.closest(".caw-starter");
  if (cawStarter) {
    putCawWords(cawStarter.dataset.words);
    return;
  }
  const answerChip = target.closest("[data-answer]");
  if (answerChip) {
    answer(answerChip, answerChip.dataset.answer);
    return;
  }
  const starter = target.closest(".starter");
  if (starter) {
    putWords(starter.dataset.words);
    return;
  }
  const tab = target.closest(".ptab");
  if (tab) {
    chooseTab(tab.dataset.tab);
    return;
  }
  const view = target.closest(".view");
  if (view) {
    for (const other of $$(".view")) {
      other.setAttribute("aria-selected", String(other === view));
    }
    placeThumb($(".views-track"), motionOk());
    return;
  }
  const link = target.closest(".card-link");
  if (link) {
    event.preventDefault();
    openPane(link.closest(".card").dataset.id);
    return;
  }
  if (target.closest("a[href^='#']")) {
    event.preventDefault();
  }
};

document.addEventListener("submit", (event) => {
  event.preventDefault();
  sent(event.target);
  paintActs();
});

const sent = (form) => {
  const field = $("textarea", form);
  const words = field.value.trim();
  if (!words) {
    field.focus();
    return;
  }
  if (form.dataset.composer === "hero") {
    sendFromEmpty(words);
    return;
  }
  if (form.dataset.composer === "caw") {
    field.value = "";
    autosize(field);
    $('[data-slot="caw-first"]').hidden = true;
    threadRow(words, "msg-you");
    cawRow("Reading what you sent");
    return;
  }
  field.value = "";
  autosize(field);
  hideTray();
  say("Sent");
};

document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLTextAreaElement) {
    autosize(event.target);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if ($(".pop").dataset.state === "open") {
      closeMenu();
      return;
    }
    if (S.selected) {
      closePane();
    }
    return;
  }
  const tab = event.target instanceof Element && event.target.closest(".ptab");
  if (tab && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    const names = TABS.map((name) => name.toLowerCase());
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = names[(names.indexOf(S.tab) + step + names.length) % names.length];
    chooseTab(next, false);
    $(`.ptab[data-tab="${next}"]`)?.focus();
  }
});

PHONE.addEventListener("change", () => {
  S.boardKind = "";
  if (!$('[data-slot="board"]').hidden) {
    place();
  }
  placeThumb($(".views-track"), false);
});

const applyScheme = (scheme) => {
  ROOT.classList.toggle("dark", scheme === "dark");
  ROOT.classList.toggle("light", scheme !== "dark");
};

const applyLayout = (layout) => {
  S.layout = layout === "columns" ? "columns" : "list";
  APP.dataset.layout = S.layout;
  S.boardKind = "";
  if (!$('[data-slot="board"]').hidden) {
    place();
  }
};

window.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.scheme) {
    applyScheme(data.scheme);
  }
  if (data.layout) {
    applyLayout(data.layout);
  }
  if (data.state) {
    setState(data.state);
  }
});

window.preview = {
  setState,
  applyLayout,
  applyScheme,
  fileTasks,
  hubAnswers,
  state: S,
};

/* The board's edge fade follows its scroll and its width (the pane and Caw's column narrow it). */
const BOARD = $('[data-slot="board"]');
BOARD.addEventListener("scroll", markEdges, { passive: true });
new ResizeObserver(markEdges).observe(BOARD);

const params = new URLSearchParams(location.search);
applyScheme(params.get("scheme") ?? "light");
applyLayout(params.get("layout") ?? "list");
document.fonts.ready.then(() => {
  placeThumb($(".views-track"), false);
  setState(params.get("state") ?? "rest").then(() => {
    ROOT.dataset.ready = "true";
  });
});
