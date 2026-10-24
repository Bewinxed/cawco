/*
 * Caw's panel, the design preview: one panel drawn twice (Desk, Phone),
 * driven by the switches above them. Every motion is a Web Animation with
 * an `id` (the plan's §5 moment it is), on the house's curves and
 * durations read from tokens.css, started from where it is drawn, and a
 * cross-fade over --dur-fade under reduced motion.
 */

const root = document.documentElement;
const style = getComputedStyle(root);
const token = (name) => style.getPropertyValue(name).trim();
const ms = (name) => Number.parseFloat(token(name));

const D = {
  control: ms("--dur-control"),
  exit: ms("--dur-exit"),
  morph: ms("--dur-morph"),
  fade: ms("--dur-fade"),
  pop: ms("--dur-pop"),
  panel: ms("--dur-panel"),
  grow: ms("--dur-grow"),
};
const E = {
  out: token("--ease-out"),
  inOut: token("--ease-in-out"),
  drawer: token("--ease-drawer"),
};
/** The dock's hysteresis (plan §5, Card docks): 8px past the floor either way. */
const HYSTERESIS = 8;
/** How long after the last wheel event a carried move waits before it is handed to the scroll offset, ms. */
const WHEEL_QUIET = 120;
/** The scroll-linked runs (plan §5): the last 24px of the title's travel, the first 24px of scroll. */
const LINKED = 24;

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
const motionOk = () =>
  root.dataset.motion !== "reduced" && !reducedQuery.matches;

/** One run, named, on the house clock. */
function run(node, keyframes, { id, dur, ease = E.out, fill = "none" }) {
  // What is not drawn (a frame the Show switch hides) lands at once: nothing animates out of sight.
  const duration = node.getClientRects().length > 0 ? dur : 0;
  return node.animate(keyframes, { id, duration, easing: ease, fill });
}

/** Lets a run's end land and gives the element back its own style. */
async function settle(animation) {
  try {
    await animation.finished;
  } catch {
    return false;
  }
  return true;
}

/* ── What the panel says ─────────────────────────────────────────── */

const TITLE = "Nightly check ready";

const CAUSES = {
  machine: {
    still: "machine",
    title: "No machine is online",
    body: "What you write is kept. Caw reads it once a machine is back.",
    way: "Open machines",
    hint: "Kept until a machine is back",
    note: "Not read · no machine was online",
    details:
      "obelisk-of-light last answered at 13:52 and studio-mac at 11:07. Caw starts on the first one that comes back.",
  },
  budget: {
    still: "budget",
    title: "This week’s budget is spent",
    body: "Caw used the $40 set for Cawco-Dev. What you write is kept; he reads it when the budget resets on Monday or you raise it.",
    way: "Raise the budget",
    hint: "Kept until the budget resets",
    note: "Not read · the budget was spent",
    details: "$40.00 of $40.00 this week, reset Monday at 00:00.",
  },
  thread: {
    still: "thread",
    title: "This thread won’t read",
    body: "Its record on the hub is damaged, so Caw can’t pick it up. What you write is kept with it; a new thread goes on now.",
    way: "Start a new thread",
    hint: "Kept with this thread",
    note: "Not read · the thread won’t read",
    details:
      "threads/9f2c.jsonl, line 214: the record ends mid-entry (unexpected end of JSON).",
  },
  hub: {
    still: "hub",
    title: "The hub is updating",
    body: "It is installing 0.42.1 and is back in about a minute. What you write is kept, and Caw reads it once the hub is up.",
    way: "See the update",
    hint: "Kept until the hub is back",
    note: "Not read · the hub was updating",
    details: "0.42.0 → 0.42.1 on obelisk-of-light, step 3 of 4: migrating.",
  },
};

const PERMISSION = {
  id: "perm-1",
  what: "Run <code>bun run check</code>",
  why: "in cockpit on obelisk-of-light",
  wait: "2m",
  waitDocked: "4m",
};

const DELEGATES = [
  {
    id: "del-1",
    mark: "var(--mark-3)",
    what: "Run <code>bun test apps/agent</code>",
    why: "tray-chip · a delegate on studio-mac",
    wait: "1m",
  },
  {
    id: "del-2",
    mark: "var(--mark-5)",
    what: "Write <code>design/tokens/cawco.resolver.json</code>",
    why: "glass-join · a delegate on obelisk-of-light",
    wait: "40s",
  },
  {
    id: "del-3",
    mark: "var(--mark-6)",
    what: "Pick the head for the phone project page",
    why: "A decision page waits on you · 2 cards",
    wait: "20s",
  },
  {
    id: "del-4",
    mark: "var(--mark-2)",
    what: "Run <code>gh pr merge 412</code>",
    why: "nightly-tag · a delegate on studio-mac",
    wait: "5s",
  },
];

const you = (text, clock, extra = {}) => ({
  who: "you",
  text,
  clock,
  ...extra,
});
const caw = (paras, extra = {}) => ({ who: "caw", paras, ...extra });

const M = {
  check: you("Live check of nightly 5529: reply with the word ready.", "14:00"),
  ready: caw(["ready"]),
  full: you("Now run the full check before I tag it.", "14:01"),
  ask: caw(["I’ll run it. One thing first:"], { card: PERMISSION }),
  ios: you("Yes, and check the iOS build too.", "14:03"),
  waits: caw(
    [
      "Waiting on the approve above before I go on. While it waits, the nightly’s notes list three fixes:",
    ],
    {
      list: [
        "The tray chip no longer overflows on a phone.",
        "A heavy canvas draws inside its limit.",
        "The project page has no Pipeline view.",
      ],
    }
  ),
  draft: you("Draft the release note from those.", "14:04"),
  drafted: caw([
    "Drafted. I’ll attach it to the tag once the check passes and the iOS build is green.",
  ]),
  build: you("Put the iOS build number in it too.", "14:05"),
  added: caw(["Added. The note now opens with the build:"], {
    list: [
      "Nightly 5529, iOS build 41.",
      "Three fixes, each with its task.",
      "No migration; the hub updates in place.",
    ],
  }),
  ping: you("Good. Tell me when the check is done.", "14:06"),
  will: caw([
    "I will. It starts the moment you approve the run above, and the iOS build follows it on studio-mac.",
  ]),
  pass: caw(["Both pass. The nightly is ready to tag."]),
  tag: you("Tag it.", "14:09"),
  again: you("Run it again at 9.", "14:11", { kept: true }),
};

const THREADS = {
  rest: [M.check, M.ready],
  needs: [
    M.check,
    M.ready,
    M.full,
    M.ask,
    M.ios,
    M.waits,
    M.draft,
    M.drafted,
    M.build,
    M.added,
    M.ping,
    M.will,
  ],
  scrolled: [
    M.check,
    M.ready,
    M.full,
    { ...M.ask, answered: "Approved · 14:02" },
    M.ios,
    M.waits,
    M.draft,
    M.drafted,
    M.build,
    M.added,
    M.ping,
    M.will,
    M.pass,
    M.tag,
  ],
  // A full thread, so the fork of where the block stands is read where it matters.
  cant: [
    M.check,
    M.ready,
    M.full,
    { ...M.ask, answered: "Approved · 14:02" },
    M.ios,
    M.waits,
    M.draft,
    M.drafted,
    M.pass,
    M.tag,
    M.again,
  ],
  fresh: [],
};
THREADS.docked = THREADS.needs;

/* ── The preview's state ─────────────────────────────────────────── */

const S = {
  state: "rest",
  cause: "machine",
  arcs: "A",
  block: "A",
  answered: new Set(),
  delegates: 0,
};

/** Caw's switch (the ⋯ menu): on, or off and answering only when written to. */
let cawOn = true;
const idleHint = () =>
  cawOn ? "Message Caw" : "Caw is off · answers when you write";

/** What needs you in this page's scope, and the fleet past it (fork 1). */
function needsCount() {
  const waiting = ["needs", "docked"].includes(S.state);
  const here =
    (waiting && !S.answered.has(PERMISSION.id) ? 1 : 0) + S.delegates;
  return S.arcs === "B" ? here + 3 : here;
}

/* ── Small builders ──────────────────────────────────────────────── */

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (html !== undefined) {
    node.innerHTML = html;
  }
  return node;
}

const glyph = (name) =>
  `<svg class="glyph" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const head = '<img src="stills/caw-head.png" alt="">';

function rowGrid(item, { docked = false } = {}) {
  const mark = item.mark
    ? `<span class="mark" style="background:${item.mark}"></span>`
    : head;
  return `<div class="row${docked ? " docked" : ""}">
    <span class="lead">${mark}<span class="ping"></span></span>
    <p class="what">${item.what}</p><span class="wait">${docked && item.waitDocked ? item.waitDocked : item.wait}</span>
    <p class="why">${item.why}</p>
    <div class="pair">
      <button class="peer deny" type="button" data-answer="deny">${glyph("close")}<span>Deny</span></button>
      <button class="peer approve" type="button" data-answer="approve">${glyph("tick")}<span>Approve</span></button>
    </div>
  </div>`;
}

function turnNode(msg) {
  const li = el("li", "turn");
  li.dataset.who = msg.who;
  if (msg.who === "you") {
    li.innerHTML = `<h3 class="who"><span class="mark you">${glyph("user")}</span><span class="role">You</span><span class="clock">${msg.clock}</span></h3>
      <div class="well"><p>${msg.text}</p></div>`;
    if (msg.kept) {
      const note = el("p", "note");
      note.innerHTML = `<span class="morph" data-slot="kept-note">${CAUSES[S.cause].note}</span>`;
      li.append(note);
    }
    return li;
  }
  const paras = msg.paras.map((p) => `<p>${p}</p>`).join("");
  const list = msg.list
    ? `<ul>${msg.list.map((x) => `<li>${x}</li>`).join("")}</ul>`
    : "";
  li.innerHTML = `<h3 class="who"><span class="mark">${head}</span><span class="role">Caw</span></h3><div class="prose">${paras}${list}</div>`;
  if (msg.card) {
    const card = el("article", "card");
    card.dataset.card = msg.card.id;
    const answered = msg.answered ?? null;
    if (answered) {
      card.innerHTML = outcomeHtml(answered, false);
    } else {
      card.dataset.open = "";
      card.innerHTML = rowGrid(msg.card);
      card.setAttribute("aria-label", "Caw asks to run bun run check");
    }
    li.append(card);
  }
  return li;
}

const outcomeHtml = (words, denied) =>
  `<p class="outcome"${denied ? " data-denied" : ""}>${glyph(denied ? "close" : "tick")}<span class="morph">${words}</span></p>`;

/* ── MorphText, the preview's form (The Steady Swap Rule) ────────── */

function morphText(node, text) {
  const now = node.dataset.text ?? node.textContent;
  if (now === text) {
    return Promise.resolve();
  }
  node.dataset.text = text;
  for (const old of node.querySelectorAll(".morph-old")) {
    old.remove();
  }
  if (node.getClientRects().length === 0) {
    node.textContent = text;
    return Promise.resolve();
  }
  const w0 = node.offsetWidth;
  const h0 = node.offsetHeight;
  const old = el("span", "morph-old", "");
  old.textContent = now;
  old.setAttribute("aria-hidden", "true");
  const fresh = el("span", "morph-now");
  fresh.textContent = text;
  node.replaceChildren(fresh);
  const w1 = node.offsetWidth;
  const h1 = node.offsetHeight;
  node.style.minWidth = `${Math.max(w0, w1)}px`;
  node.style.minHeight = `${Math.max(h0, h1)}px`;
  node.append(old);
  const moving = motionOk();
  const out = run(
    old,
    moving
      ? [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.95 },
        ]
      : [{ opacity: 1 }, { opacity: 0 }],
    { id: "morph-out", dur: D.morph, fill: "forwards" }
  );
  run(
    fresh,
    moving
      ? [
          { opacity: 0, scale: 0.95 },
          { opacity: 1, scale: 1 },
        ]
      : [{ opacity: 0 }, { opacity: 1 }],
    { id: "morph-in", dur: D.morph }
  );
  return settle(out).then((done) => {
    if (done && old.isConnected) {
      old.remove();
      node.style.minWidth = "";
      node.style.minHeight = "";
    }
  });
}

/* ── The arcs on Caw's circle ────────────────────────────────────── */

function arcPath(i) {
  const r = 12.5;
  const a0 = ((i * 38 - 90) * Math.PI) / 180;
  const a1 = ((i * 38 + 30 - 90) * Math.PI) / 180;
  const p = (a) =>
    `${(14 + r * Math.cos(a)).toFixed(3)} ${(14 + r * Math.sin(a)).toFixed(3)}`;
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
}

/** An arc draws in along itself (a fade with less motion). */
function arcIn(svg, i) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", arcPath(i));
  path.setAttribute("pathLength", "1");
  path.setAttribute("stroke-dasharray", "1 1");
  svg.append(path);
  const moving = motionOk();
  run(
    path,
    moving
      ? [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }]
      : [{ opacity: 0 }, { opacity: 1 }],
    { id: "arc-in", dur: moving ? D.panel : D.fade }
  );
}

/** An arc draws out along itself, and goes. */
function arcOut(path) {
  path.dataset.leaving = "";
  const moving = motionOk();
  const out = run(
    path,
    moving
      ? [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }]
      : [{ opacity: 1 }, { opacity: 0 }],
    { id: "arc-out", dur: moving ? D.panel : D.fade, fill: "forwards" }
  );
  settle(out).then(() => path.remove());
}

/** Caw's arcs: one per item that needs you in the bar's count (fork 1), on both of his glasses; his label says the number. */
function drawArcs() {
  const count = needsCount();
  const n = Math.min(count, 9);
  for (const svg of document.querySelectorAll(".arcs")) {
    const standing = [...svg.querySelectorAll("path:not([data-leaving])")];
    for (let i = standing.length; i < n; i += 1) {
      arcIn(svg, i);
    }
    for (const path of standing.slice(n)) {
      arcOut(path);
    }
    const door = svg.closest("[data-caw-door]");
    door?.setAttribute(
      "aria-label",
      count === 0 ? "Caw" : `Caw, needs you, ${count}`
    );
    door?.setAttribute("title", count === 0 ? "Caw" : `${count} need you`);
  }
}

/* ── One panel ───────────────────────────────────────────────────── */

const panels = [];

class Panel {
  constructor(host, device) {
    this.device = device;
    this.host = host;
    const frag = document.getElementById("panel").content.cloneNode(true);
    this.root = frag.querySelector(".panel");
    this.root.dataset.device = device;
    host.append(frag);
    this.slot = (name) => this.root.querySelector(`[data-slot="${name}"]`);
    this.stack = this.slot("stack");
    this.rows = this.slot("rows");
    this.scroller = this.slot("scroller");
    this.thread = this.slot("thread");
    this.block = this.slot("block");
    this.dock = this.slot("dock");
    this.peek = this.slot("peek-caw");
    this.field = this.slot("field");
    this.menu = this.slot("menu");
    this.docked = new Map();
    this.open = true;
    this.holding = false;
    this.carry = 0;
    this.titleId = `title-${device}`;
    this.slot("large-title").id = this.titleId;
    this.root.setAttribute("aria-labelledby", this.titleId);
    this.wire();
  }

  wire() {
    // A frame drawn while hidden (the Show switch under 900px) reads no
    // boxes; its scroll-linked title and edge are drawn once it has one.
    new ResizeObserver(() => this.onScroll()).observe(this.scroller);
    let ticking = false;
    this.scroller.addEventListener(
      "wheel",
      () => {
        this.lastWheel = performance.now();
      },
      { passive: true }
    );
    this.scroller.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          this.onScroll();
        });
      }
    });
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.slot("composer").addEventListener("submit", (event) => {
      event.preventDefault();
      this.send();
    });
    this.field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.send();
      }
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (this.menu.hidden) {
        this.close();
      } else {
        this.toggleMenu(false);
      }
    });
  }

  onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const act = target.closest("[data-act]")?.dataset.act;
    if (act) {
      this.act(act);
      return;
    }
    if (!this.pressInside(target)) {
      const row = target.closest("li[data-row]");
      if (row?.dataset.card) {
        this.goToCard(row.dataset.card);
      }
    }
    if (!(this.menu.hidden || target.closest(".menu"))) {
      this.toggleMenu(false);
    }
  }

  /** A press on one of the panel's own controls: whether one took it. */
  pressInside(target) {
    const answer = target.closest("[data-answer]");
    if (answer) {
      this.answer(
        answer.closest("[data-card], [data-row]"),
        answer.dataset.answer
      );
      return true;
    }
    const starter = target.closest(".starter");
    if (starter) {
      this.startFrom(starter);
      return true;
    }
    if (target.closest('[data-slot="more"]')) {
      this.toggleMore();
      return true;
    }
    if (target.closest('[data-slot="details-toggle"]')) {
      this.toggleDetails();
      return true;
    }
    return false;
  }

  act(act) {
    if (act === "close") {
      this.close();
    } else if (act === "more") {
      this.toggleMenu(this.menu.hidden);
    } else if (act === "new") {
      setState("fresh");
    } else if (act === "switch") {
      cawOn = !cawOn;
      for (const panel of panels) {
        panel.slot("switch-state").textContent = cawOn ? "On" : "Off";
        panel.paintCaw();
        panel.paintHint();
      }
      this.toggleMenu(false);
    }
  }

  /* — the frame: what is open, how it is drawn — */

  /** Where the conversation's top stands: under the stack, or under the top zone's controls. */
  floorY() {
    const zone = this.root.querySelector(".top-zone").getBoundingClientRect();
    return Math.max(this.stack.getBoundingClientRect().bottom, zone.bottom);
  }

  /** The content's origin as layout places it: the stack's foot plus the scroller's padding. */
  origin() {
    return (
      this.stack.getBoundingClientRect().bottom +
      Number.parseFloat(getComputedStyle(this.scroller).paddingTop)
    );
  }

  /**
   * Holds what the reader is reading still while the stack (or the block)
   * changes size: each frame the scroller's scrollTop moves by what the
   * layout moved the content, so the rows under it stay put (plan §5,
   * Card docks). `tail`: the scroller rides its foot instead.
   */
  hold(mode = "anchor", before = this.origin()) {
    this.holdMode = mode;
    if (this.holding) {
      this.compensate();
      return;
    }
    this.holding = true;
    this.lastOrigin = before;
    const tick = () => {
      this.compensate();
      // Still moving: a run that has not finished (one that ended and fills forwards is done).
      const moving = (runs) => runs.some((r) => r.playState !== "finished");
      const busy =
        moving(this.stack.getAnimations({ subtree: true })) ||
        moving(this.block.getAnimations()) ||
        moving(this.slot("title-slot").getAnimations());
      if (busy) {
        requestAnimationFrame(tick);
      } else {
        this.holding = false;
        this.commit();
      }
    };
    this.compensate();
    requestAnimationFrame(tick);
  }

  compensate() {
    const s = this.scroller;
    if (this.holdMode === "tail") {
      s.scrollTop = s.scrollHeight;
      this.dropCarry();
      this.lastOrigin = this.origin();
      return;
    }
    const now = this.origin();
    const moved = (now - this.lastOrigin) / this.zoom();
    this.lastOrigin = now;
    if (moved !== 0) {
      this.nudge(moved);
    }
  }

  /**
   * Holds the conversation still while the layout moves it by `delta`: the
   * content's translate takes the move at once, and the scroll offset is
   * left to the reader, so a wheel turned meanwhile lands whole (WebKit
   * drops the rest of a wheel's scroll when a script sets scrollTop under
   * it). Once the layout is still, `commit` hands the carried move to the
   * live scrollTop.
   */
  nudge(delta) {
    this.carry += delta;
    this.scroller.style.setProperty("--scroll-rem", `${-this.carry}px`);
  }

  /**
   * Hands the carried move to the scroll offset, read live: what the
   * reader scrolled meanwhile stays theirs. The fraction of a device pixel
   * the offset snaps away stays carried, so the rows stand still to the
   * pixel. Waits out a wheel still turning (`lastWheel`).
   */
  commit() {
    const s = this.scroller;
    clearTimeout(this.commitTimer);
    const quiet = performance.now() - (this.lastWheel ?? 0);
    if (quiet < WHEEL_QUIET) {
      this.commitTimer = setTimeout(() => this.commit(), WHEEL_QUIET - quiet);
      return;
    }
    const want = s.scrollTop + this.carry;
    s.scrollTop = want;
    this.carry = want - s.scrollTop;
    s.style.setProperty("--scroll-rem", `${-this.carry}px`);
    this.ownTop = s.scrollTop;
  }

  /** Whether a carried move waits to be handed to the scroll offset. */
  carrying() {
    return Math.abs(this.carry) >= 1;
  }

  dropCarry() {
    clearTimeout(this.commitTimer);
    this.carry = 0;
    this.ownTop = undefined;
    this.scroller.style.removeProperty("--scroll-rem");
  }

  /** A change to the stack's size, unfolding or folding from the size it is drawn at. */
  resizeStack(change, { grow, id, dur }) {
    const before = this.origin();
    const pad = () => Number.parseFloat(getComputedStyle(this.scroller).paddingTop);
    const padBefore = pad();
    const drawn = this.stack.getBoundingClientRect().height / this.zoom();
    for (const a of this.stack.getAnimations()) {
      a.cancel();
    }
    change();
    this.fillStack();
    // The scroller's top room and the stack's own swap as the stack fills or
    // empties: the stack starts from where that leaves the conversation, so
    // the content's origin never jumps and the scroller is never clamped.
    const from = Math.max(0, drawn + padBefore - pad());
    const to = this.stack.offsetHeight;
    let a = null;
    if (motionOk() && Math.abs(from - to) > 0.5) {
      a = run(this.stack, [{ height: `${from}px` }, { height: `${to}px` }], {
        id,
        dur: dur ?? (grow ? D.pop : D.exit),
        ease: E.out,
      });
    }
    this.hold("anchor", before);
    return a;
  }

  /** Whether the panel's frame is drawn at all (the Show switch hides one under 900px). */
  drawn() {
    return this.root.getClientRects().length > 0 && this.root.offsetWidth > 0;
  }

  zoom() {
    return this.root.getBoundingClientRect().width / this.root.offsetWidth || 1;
  }

  fillStack() {
    const shown =
      this.rows.querySelectorAll("li:not([data-leaving])").length > 0 ||
      S.arcs === "B";
    this.stack.toggleAttribute("data-filled", shown);
    this.slot("signpost").hidden = S.arcs !== "B";
    const asks = this.rows.querySelectorAll("li:not([data-leaving])").length;
    this.slot("stack-head").textContent = `Needs you, ${asks}`;
    this.paintMoreLine();
  }

  paintMoreLine() {
    const items = [...this.rows.querySelectorAll("li:not([data-leaving])")];
    const more = this.slot("more");
    more.hidden = items.length <= 3;
    for (const [i, li] of items.entries()) {
      li.hidden = i >= 3 && !this.expanded;
    }
    // Expanded, the rows stand three and a half deep and scroll inside;
    // the half row says there is more.
    if (this.expanded && items.length > 3) {
      const [a, b, c, d] = items.map((li) => li.offsetHeight);
      this.rows.style.setProperty("--rows-cap", `${a + b + c + d / 2}px`);
    } else {
      this.rows.style.removeProperty("--rows-cap");
    }
    if (!more.hidden) {
      const words = this.expanded
        ? "Show fewer"
        : `and ${items.length - 3} more`;
      if (more.querySelector(".morph")) {
        morphText(more.querySelector(".morph"), words);
      } else {
        more.innerHTML = `<span class="morph">${words}</span>`;
      }
      more.setAttribute("aria-expanded", String(Boolean(this.expanded)));
    }
  }

  /* — states — */

  render() {
    for (const a of this.root.getAnimations({ subtree: true })) {
      a.cancel();
    }
    this.root.querySelector(".flyer")?.remove();
    for (const node of this.root.querySelectorAll("[data-hidden-for-flight]")) {
      node.removeAttribute("data-hidden-for-flight");
    }
    this.toggleMenu(false, true);
    this.rows.replaceChildren();
    this.docked.clear();
    this.dropCarry();
    this.expanded = false;
    this.root.dataset.block = S.block;
    this.root.toggleAttribute("data-blocked", S.state === "cant");
    const named = S.state !== "fresh";
    this.slot("title-slot").hidden = !named;
    this.slot("large-title").textContent = named ? TITLE : "";
    this.slot("small-title").firstElementChild.textContent = named ? TITLE : "";
    this.thread.replaceChildren(
      ...THREADS[S.state].map((m) => {
        const answered =
          m.card && S.answered.has(m.card.id)
            ? (m.answered ?? "Approved · 14:02")
            : m.answered;
        return turnNode({ ...m, answered });
      })
    );
    this.thread.hidden = S.state === "fresh";
    this.slot("fresh").hidden = S.state !== "fresh";
    this.block.hidden = S.state !== "cant";
    this.paintBlock(false);
    this.fillStack();
    this.paintCaw();
    this.paintHint();
    this.measureDock();
    this.place();
  }

  /** The thread's place on arriving at a state. */
  place() {
    const s = this.scroller;
    if (S.state === "needs" || S.state === "docked") {
      // The card in view, clear of the foot's fade.
      const card = this.thread.querySelector(".card");
      const room = s.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      const z = this.zoom();
      const clear = ms("--c-edge-fade-len") + ms("--space-3");
      s.scrollTop += (r.bottom - (room.bottom - clear * z)) / z;
    } else if (S.state === "scrolled" || S.state === "cant") {
      s.scrollTop = s.scrollHeight;
    } else {
      s.scrollTop = 0;
    }
    this.onScroll();
  }

  measureDock() {
    this.root.style.setProperty("--dock-h", `${this.dock.offsetHeight}px`);
  }

  /** Caw over the composer: his state, or no one while the hero or a new thread holds him. */
  paintCaw() {
    const away = S.state === "cant" || S.state === "fresh";
    this.peek.hidden = away;
    const waiting =
      ["needs", "docked"].includes(S.state) && !S.answered.has(PERMISSION.id);
    const file = waiting ? "needs-you" : "idle";
    this.setPeek(file);
  }

  setPeek(file, breathing = false) {
    const [day, night] = this.peek.querySelectorAll("img");
    day.src = `stills/caw-${file}-day.png`;
    night.src = `stills/caw-${file}-night.png`;
    this.peek.toggleAttribute("data-breathing", breathing && motionOk());
  }

  hintWords() {
    if (S.state === "cant") {
      return CAUSES[S.cause].hint;
    }
    if (this.working) {
      return "Caw is working…";
    }
    return idleHint();
  }

  paintHint() {
    const words = this.hintWords();
    morphText(this.slot("hint"), words);
    this.field.setAttribute("aria-label", words);
    this.slot("status").textContent =
      S.state === "cant" ? `Caw can’t start. ${CAUSES[S.cause].title}.` : words;
  }

  paintBlock(animate) {
    const s = this.scroller;
    // Read at its foot, the thread stays at its foot as the block's words
    // change size: once as the morph holds the larger box, once as it lets go.
    const atFoot = s.scrollTop >= s.scrollHeight - s.clientHeight - 1;
    const keepFoot = () => {
      if (atFoot) {
        s.scrollTop = s.scrollHeight;
        this.dropCarry();
        this.onScroll();
      }
    };
    const morphs = [];
    const cause = CAUSES[S.cause];
    const set = animate
      ? (node, text) => morphs.push(morphText(node, text))
      : (node, text) => {
          node.dataset.text = text;
          node.textContent = text;
        };
    set(this.slot("block-title"), cause.title);
    set(this.slot("block-body"), cause.body);
    set(this.slot("block-way"), cause.way);
    this.slot("details").textContent = cause.details;
    const day = this.slot("hero-day");
    const night = this.slot("hero-night");
    const next = `stills/hero-${cause.still}`;
    if (animate && !day.src.endsWith(`${next}-day.png`)) {
      this.crossFadeStill([day, night], next);
    } else {
      day.src = `${next}-day.png`;
      night.src = `${next}-night.png`;
    }
    for (const note of this.root.querySelectorAll('[data-slot="kept-note"]')) {
      set(note, cause.note);
    }
    if (animate) {
      keepFoot();
      Promise.all(morphs).then(keepFoot);
    }
  }

  /** Cause changes: the still cross-fades in place; nothing else moves. */
  crossFadeStill(imgs, next) {
    for (const img of imgs) {
      const ghost = img.cloneNode();
      ghost.removeAttribute("data-slot");
      img.after(ghost);
      img.src = `${next}-${img.classList.contains("day") ? "day" : "night"}.png`;
      run(img, [{ opacity: 0 }, { opacity: 1 }], {
        id: "still-in",
        dur: D.fade,
      });
      const out = run(ghost, [{ opacity: 1 }, { opacity: 0 }], {
        id: "still-out",
        dur: D.fade,
        fill: "forwards",
      });
      settle(out).then(() => ghost.remove());
    }
  }

  /* — scroll: the floating title, the edge effect, docking — */

  onScroll() {
    const s = this.scroller;
    if (!this.drawn()) {
      return;
    }
    const z = this.zoom();
    // A scroll that is none of the panel's own gives back the fraction it held.
    if (
      !(this.holding || this.carrying()) &&
      this.ownTop !== undefined &&
      Math.abs(s.scrollTop - this.ownTop) > 0.01
    ) {
      this.dropCarry();
    }
    const t = this.slot("large-title");
    const shown = !this.slot("title-slot").hidden && t.textContent !== "";
    let p = 0;
    if (shown) {
      const travel = (t.getBoundingClientRect().bottom - this.floorY()) / z;
      p = Math.min(1, Math.max(0, 1 - travel / LINKED));
    }
    t.style.opacity = String(1 - p);
    const small = this.slot("small-title");
    small.style.opacity = String(p);
    small.style.translate = `0 ${4 * (1 - p)}px`;
    const edge = this.stack.hasAttribute("data-filled")
      ? 0
      : Math.min(1, s.scrollTop / LINKED);
    this.slot("edge").style.opacity = String(edge);
    s.toggleAttribute(
      "data-more-below",
      s.scrollTop < s.scrollHeight - s.clientHeight - 1
    );
    this.checkDock();
  }

  checkDock() {
    const floor = this.floorY();
    const z = this.zoom();
    for (const card of this.thread.querySelectorAll(".card[data-open]")) {
      const r = card.getBoundingClientRect();
      const id = card.dataset.card;
      if (!this.docked.has(id) && r.bottom < floor - HYSTERESIS * z) {
        this.dockCard(card);
      } else if (this.docked.has(id) && r.top > floor + HYSTERESIS * z) {
        this.undock(id);
      }
    }
  }

  /** Card docks: its row unfolds at the stack's foot; the conversation under it stays put. */
  dockCard(card) {
    const id = card.dataset.card;
    const li = el("li", "", rowGrid(PERMISSION, { docked: true }));
    li.dataset.row = id;
    li.dataset.card = id;
    li.querySelector(".what").setAttribute("role", "link");
    li.querySelector(".what").tabIndex = 0;
    this.docked.set(id, li);
    this.resizeStack(() => this.rows.prepend(li), {
      grow: true,
      id: "card-dock",
    });
    this.arrive(li, D.pop);
  }

  undock(id, then) {
    const li = this.docked.get(id);
    if (!li) {
      return;
    }
    this.docked.delete(id);
    this.leaveRow(li, "card-undock", then);
  }

  /** A row folds out of the stack; the conversation under it stays put. */
  leaveRow(li, id, then) {
    li.dataset.leaving = "";
    const fade = run(li, [{ opacity: 1 }, { opacity: 0 }], {
      id: `${id}-fade`,
      dur: D.exit,
      fill: "forwards",
    });
    const fold = this.resizeStack(
      () => {
        li.style.position = "absolute";
        li.style.visibility = "hidden";
      },
      { grow: false, id }
    );
    const done = () => {
      const before = this.origin();
      li.remove();
      this.fillStack();
      const after = this.origin();
      this.nudge((after - before) / this.zoom());
      if (!this.holding) {
        this.commit();
      }
      this.onScroll();
      then?.();
    };
    if (fold) {
      settle(fold).then(done);
    } else {
      settle(fade).then(done);
    }
  }

  /** A row arriving: uncovered top to bottom, on the unfold's clock. */
  arrive(node, dur) {
    run(
      node,
      motionOk()
        ? [
            { clipPath: "inset(0 0 100% 0)", opacity: 0 },
            { clipPath: "inset(0 0 0 0)", opacity: 1 },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { id: "row-arrive", dur: motionOk() ? dur : D.fade }
    );
  }

  /** Press on a docked row: the thread scrolls to the card; the row folds once it is in view; the card's ring pings. */
  goToCard(id) {
    const card = this.thread.querySelector(`[data-card="${id}"]`);
    if (!card) {
      return;
    }
    const z = this.zoom();
    const r = card.getBoundingClientRect();
    const distance = (r.top - (this.floorY() + 18 * z)) / z;
    const ping = () => this.ping(card);
    if (!motionOk()) {
      this.scroller.scrollTop += distance;
      this.onScroll();
      ping();
      return;
    }
    this.scrollBy(distance, "scroll-to-card", D.panel, E.inOut).then(ping);
  }

  /**
   * A scroll on the house clock: a Web Animation runs `--scroll-t` 0 → 1
   * on the curve, and each frame moves scrollTop by what the clock moved,
   * so a stack resizing meanwhile still holds the rows.
   */
  scrollBy(distance, id, dur, ease) {
    const s = this.scroller;
    const clock = run(s, [{ "--scroll-t": 0 }, { "--scroll-t": 1 }], {
      id,
      dur,
      ease,
      fill: "forwards",
    });
    let last = 0;
    const step = () => {
      if (clock.playState === "idle") {
        return;
      }
      const t =
        Number.parseFloat(getComputedStyle(s).getPropertyValue("--scroll-t")) ||
        0;
      const now = clock.playState === "finished" ? 1 : t;
      const delta = (now - last) * distance;
      last = now;
      if (delta !== 0) {
        s.scrollTop += delta;
      }
      if (clock.playState === "running" || clock.playState === "paused") {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
    return settle(clock).then(() => {
      step();
      this.onScroll();
    });
  }

  ping(card) {
    const ring = card.querySelector(".ping");
    if (!ring) {
      return;
    }
    run(
      ring,
      motionOk()
        ? [
            { opacity: 0.9, scale: 1 },
            { opacity: 0, scale: 1.9 },
          ]
        : [{ opacity: 0.9 }, { opacity: 0 }],
      { id: "card-ping", dur: ms("--dur-loop") }
    );
  }

  /* — answering — */

  answer(host, verdict) {
    if (!host) {
      return;
    }
    const id = host.dataset.card ?? host.dataset.row;
    if (S.answered.has(id)) {
      return;
    }
    S.answered.add(id);
    if (!host.dataset.card) {
      S.delegates = Math.max(0, S.delegates - 1);
    }
    for (const panel of panels) {
      panel.applyAnswer(id, verdict);
    }
    drawArcs();
  }

  applyAnswer(id, verdict) {
    const words = verdict === "approve" ? "Approved · 14:05" : "Denied · 14:05";
    const card = this.thread.querySelector(`.card[data-card="${id}"]`);
    if (card) {
      this.morphCard(card, words, verdict !== "approve");
    }
    if (this.docked.has(id)) {
      this.undock(id);
    }
    const row = this.rows.querySelector(
      `li[data-row="${id}"]:not([data-card])`
    );
    if (row) {
      this.leaveRow(row, "row-answered");
    }
    if (verdict === "approve" && card) {
      this.working = true;
      this.setPeek("working", true);
      this.paintHint();
    } else {
      this.paintCaw();
    }
  }

  /** Answered: the card morphs in place to its outcome line (height on the drawer curve, words through MorphText). */
  morphCard(card, words, denied) {
    const from = card.offsetHeight;
    card.removeAttribute("data-open");
    card.innerHTML = outcomeHtml(words, denied);
    const to = card.offsetHeight;
    if (!motionOk()) {
      run(card.firstElementChild, [{ opacity: 0 }, { opacity: 1 }], {
        id: "card-answered",
        dur: D.morph,
      });
      return;
    }
    run(card, [{ height: `${from}px` }, { height: `${to}px` }], {
      id: "card-answered",
      dur: D.morph,
      ease: E.drawer,
    });
    run(
      card.firstElementChild,
      [
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1 },
      ],
      { id: "card-answered-words", dur: D.morph }
    );
  }

  /* — moments — */

  /** A needs-you card lands: uncovered top to bottom while what follows makes room; its mark pings once. */
  landCard() {
    const card = this.thread.querySelector(".card[data-open]");
    if (!card) {
      return;
    }
    const h = card.offsetHeight;
    if (motionOk()) {
      run(card, [{ height: "0px", marginTop: "0px" }, { height: `${h}px` }], {
        id: "card-land",
        dur: D.pop,
      });
    }
    this.arrive(card, D.pop);
    this.ping(card);
  }

  /** Stack gains a row from elsewhere: it unfolds at its place in wait order; rows below slide down. */
  delegateAsks() {
    const item = DELEGATES[(S.delegates - 1) % DELEGATES.length];
    const li = el("li", "", rowGrid({ ...item, id: undefined }));
    li.dataset.row = item.id;
    const before = new Map(
      [...this.rows.children].map((n) => [n, n.getBoundingClientRect().top])
    );
    this.resizeStack(() => this.rows.append(li), {
      grow: true,
      id: "row-from-elsewhere",
    });
    this.arrive(li, D.pop);
    if (motionOk()) {
      for (const [node, top] of before) {
        const dy = (top - node.getBoundingClientRect().top) / this.zoom();
        if (dy !== 0 && !node.hidden) {
          run(node, [{ translate: `0 ${dy}px` }, { translate: "0 0" }], {
            id: "row-slide",
            dur: D.panel,
            ease: E.inOut,
          });
        }
      }
    }
  }

  /** "and N more": the hidden rows unfold under the third; the words morph to "Show fewer". */
  toggleMore() {
    this.expanded = !this.expanded;
    const grow = this.expanded;
    this.resizeStack(() => this.paintMoreLine(), {
      grow,
      id: grow ? "more-unfold" : "more-fold",
      dur: grow ? D.grow : D.exit,
    });
  }

  toggleDetails() {
    const toggle = this.slot("details-toggle");
    const details = this.slot("details");
    const open = details.hidden;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide details" : "Show details";
    const from = this.block.offsetHeight;
    details.hidden = !open;
    const to = this.block.offsetHeight;
    if (S.block === "A") {
      this.hold("tail");
    }
    if (motionOk() && S.block === "A") {
      run(this.block, [{ height: `${from}px` }, { height: `${to}px` }], {
        id: open ? "details-unfold" : "details-fold",
        dur: open ? D.pop : D.exit,
      });
    }
    if (open) {
      run(details, [{ opacity: 0 }, { opacity: 1 }], {
        id: "details-words",
        dur: D.fade,
      });
    }
  }

  /** Caw names the thread: the title's slot unfolds at the content's start, the words fade in, the tail held. */
  nameThread() {
    const slot = this.slot("title-slot");
    const t = this.slot("large-title");
    slot.hidden = false;
    t.textContent = TITLE;
    this.slot("small-title").firstElementChild.textContent = TITLE;
    const h = slot.offsetHeight;
    this.hold("tail");
    if (motionOk()) {
      run(slot, [{ height: "0px" }, { height: `${h}px` }], {
        id: "title-unfold",
        dur: D.pop,
      });
    }
    run(t, [{ opacity: 0 }, { opacity: 1 }], {
      id: "title-words",
      dur: D.fade,
    });
    this.onScroll();
  }

  /** A FLIP of one Caw between two places (The One Object Rule); the source hidden while its copy flies. */
  fly(from, to, toImgs, id) {
    if (!this.drawn()) {
      return Promise.resolve(true);
    }
    const pr = this.root.getBoundingClientRect();
    const z = this.zoom();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const box = (r) => ({
      x: (r.left - pr.left) / z,
      y: (r.top - pr.top) / z,
      w: r.width / z,
      h: r.height / z,
    });
    const A = box(a);
    const B = box(b);
    const flyer = el("div", "flyer caw-flyer");
    flyer.dataset.flight = id;
    flyer.style.width = `${B.w}px`;
    flyer.style.height = `${B.h}px`;
    const fromImgs = from.querySelectorAll("img");
    const layer = (imgs) => {
      const wrap = el("div", "caw");
      wrap.style.position = "absolute";
      wrap.style.inset = "0";
      for (const img of imgs) {
        const copy = img.cloneNode();
        copy.removeAttribute("data-slot");
        wrap.append(copy);
      }
      return wrap;
    };
    const src = layer(fromImgs);
    const dst = layer(toImgs);
    flyer.append(src, dst);
    this.root.querySelector(".caw-flyer")?.remove();
    this.root.append(flyer);
    from.setAttribute("data-hidden-for-flight", "");
    to.setAttribute("data-hidden-for-flight", "");
    const t0 = `translate(${A.x}px, ${A.y}px) scale(${A.w / B.w}, ${A.h / B.h})`;
    const t1 = `translate(${B.x}px, ${B.y}px)`;
    const moving = motionOk();
    const flight = run(
      flyer,
      moving
        ? [{ transform: t0 }, { transform: t1 }]
        : [{ transform: t1 }, { transform: t1 }],
      { id, dur: moving ? D.panel : D.fade, ease: E.drawer, fill: "forwards" }
    );
    run(src, [{ opacity: 1 }, { opacity: 0 }], {
      id: `${id}-from`,
      dur: moving ? D.panel : D.fade,
      ease: E.drawer,
      fill: "forwards",
    });
    run(dst, [{ opacity: 0 }, { opacity: 1 }], {
      id: `${id}-to`,
      dur: moving ? D.panel : D.fade,
      ease: E.drawer,
      fill: "forwards",
    });
    return settle(flight).then((done) => {
      if (done) {
        to.removeAttribute("data-hidden-for-flight");
        flyer.remove();
      }
      from.removeAttribute("data-hidden-for-flight");
      return done;
    });
  }

  /** Caw can't start: the block unfolds above the composer and Caw flies from his line into the hero's place. */
  enterCant() {
    this.render();
    this.peek.hidden = false;
    this.peek.style.visibility = "hidden";
    const hero = this.slot("hero");
    const h = this.block.offsetHeight;
    this.hold(S.block === "A" ? "tail" : "anchor");
    const words = [...this.block.querySelectorAll(".block-in > :not(.hero)")];
    if (S.block === "A" && motionOk()) {
      run(this.block, [{ height: "0px" }, { height: `${h}px` }], {
        id: "block-unfold",
        dur: D.pop,
      });
    } else {
      run(this.block, [{ opacity: 0 }, { opacity: 1 }], {
        id: "block-unfold",
        dur: D.fade,
      });
      const kept = [...this.scroller.children];
      for (const node of kept) {
        run(
          node,
          [
            { opacity: 1, visibility: "visible" },
            { opacity: 0, visibility: "visible" },
          ],
          {
            id: "thread-out",
            dur: D.exit,
          }
        );
      }
    }
    for (const w of words) {
      run(w, [{ opacity: 0 }, { opacity: 1 }], {
        id: "block-words",
        dur: D.fade,
      });
    }
    this.fly(this.peek, hero, hero.querySelectorAll("img"), "caw-to-hero").then(
      () => {
        this.peek.style.visibility = "";
        this.peek.hidden = true;
      }
    );
  }

  /** Caw can start again: he flies back to his line, the block folds, the hint and the kept line morph. */
  leaveCant() {
    const hero = this.slot("hero");
    this.peek.hidden = false;
    this.setPeek("idle");
    const fold = () => {
      this.block.hidden = true;
      this.root.removeAttribute("data-blocked");
    };
    this.fly(hero, this.peek, this.peek.querySelectorAll("img"), "hero-to-caw");
    const h = this.block.offsetHeight;
    if (S.block === "A" && motionOk()) {
      this.hold("tail");
      const a = run(this.block, [{ height: `${h}px` }, { height: "0px" }], {
        id: "block-fold",
        dur: D.exit,
        fill: "forwards",
      });
      settle(a).then(fold);
    } else {
      const a = run(this.block, [{ opacity: 1 }, { opacity: 0 }], {
        id: "block-fold",
        dur: D.exit,
        fill: "forwards",
      });
      settle(a).then(() => {
        fold();
        for (const node of this.scroller.children) {
          run(node, [{ opacity: 0 }, { opacity: 1 }], {
            id: "thread-in",
            dur: D.fade,
          });
        }
      });
    }
    morphText(this.slot("hint"), idleHint());
    for (const note of this.root.querySelectorAll('[data-slot="kept-note"]')) {
      morphText(note, "Read · 14:12");
    }
  }

  /** New thread (+): the thread's rows leave, the title's slot folds, the composer keeps its focus; Caw comes to the centre. */
  newThread() {
    const leaving = [...this.thread.children, ...this.rows.children];
    const slot = this.slot("title-slot");
    const moving = motionOk();
    for (const node of leaving) {
      run(node, [{ opacity: 1 }, { opacity: 0 }], {
        id: "thread-leave",
        dur: D.exit,
        fill: "forwards",
      });
    }
    let fold = null;
    if (!slot.hidden) {
      fold = run(
        slot,
        moving
          ? [{ height: `${slot.offsetHeight}px` }, { height: "0px" }]
          : [{ opacity: 1 }, { opacity: 0 }],
        { id: "title-fold", dur: D.exit, fill: "forwards" }
      );
    }
    const wasPeek = !this.peek.hidden;
    const done = () => {
      const peekBox = this.peek;
      render(this);
      const freshCaw = this.slot("fresh-caw");
      if (wasPeek) {
        this.peek.hidden = false;
        this.fly(
          peekBox,
          freshCaw,
          freshCaw.querySelectorAll("img"),
          "caw-to-centre"
        ).then(() => {
          this.peek.hidden = true;
        });
      }
      for (const li of this.slot("fresh").querySelectorAll(".starters li")) {
        run(li, [{ opacity: 0 }, { opacity: 1 }], {
          id: "starters-in",
          dur: D.fade,
        });
      }
      this.field.focus({ preventScroll: true });
    };
    const last = fold ?? this.thread.lastElementChild?.getAnimations()[0];
    if (last) {
      settle(last).then(done);
    } else {
      done();
    }
  }

  /** A starter sent: the row flies into its place as the sent message, the others leave, Caw goes to his line over the composer. */
  startFrom(button) {
    const words = button.textContent.trim();
    const from = button.getBoundingClientRect();
    const others = [...this.slot("fresh").querySelectorAll(".starter")].filter(
      (b) => b !== button
    );
    for (const b of others) {
      run(b, [{ opacity: 1 }, { opacity: 0 }], {
        id: "starters-leave",
        dur: D.exit,
        fill: "forwards",
      });
    }
    const freshCaw = this.slot("fresh-caw");
    const cawFrom = freshCaw.getBoundingClientRect();
    const cawHtml = freshCaw.innerHTML;
    const sent = turnNode(you(words, "14:20"));
    this.thread.replaceChildren(sent);
    this.thread.hidden = false;
    this.slot("fresh").hidden = true;
    this.peek.hidden = false;
    this.working = true;
    this.setPeek("working", true);
    this.paintHint();
    const well = sent.querySelector(".well");
    this.flyRect(button, from, well, "starter-to-message");
    this.flyFromRect(cawHtml, cawFrom, this.peek, "caw-to-line");
    setTimeout(() => this.cawAnswers(words), D.panel + 600);
  }

  /** A FLIP from a rect the source stood at (it is gone from the layout now) onto `to`. */
  flyRect(source, rect, to, id) {
    if (!(this.drawn() && rect.width > 0)) {
      return;
    }
    const pr = this.root.getBoundingClientRect();
    const z = this.zoom();
    const b = to.getBoundingClientRect();
    const copy = source.cloneNode(true);
    copy.classList.add("flyer");
    copy.style.width = `${rect.width / z}px`;
    copy.style.height = `${rect.height / z}px`;
    copy.style.margin = "0";
    this.root.append(copy);
    const t0 = `translate(${(rect.left - pr.left) / z}px, ${(rect.top - pr.top) / z}px)`;
    const t1 = `translate(${(b.left - pr.left) / z}px, ${(b.top - pr.top) / z}px) scale(${b.width / rect.width}, ${b.height / rect.height})`;
    const moving = motionOk();
    const a = run(
      copy,
      moving
        ? [{ transform: t0 }, { transform: t1 }]
        : [{ transform: t0 }, { transform: t0 }],
      { id, dur: moving ? D.panel : D.fade, ease: E.drawer, fill: "forwards" }
    );
    // The copy hands over to the message it became as it lands: the words cross over the flight's last stretch.
    run(copy, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
      id: `${id}-fade`,
      dur: moving ? D.panel : D.fade,
      ease: E.out,
      fill: "forwards",
    });
    run(to, [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], {
      id: `${id}-to`,
      dur: moving ? D.panel : D.fade,
      ease: E.out,
    });
    settle(a).then(() => copy.remove());
  }

  /** Caw's flight from where he stood (gone from the layout now) onto `to`. */
  flyFromRect(html, rect, to, id) {
    if (!(this.drawn() && rect.width > 0)) {
      return;
    }
    const stand = el("div", "caw");
    stand.style.position = "absolute";
    const pr = this.root.getBoundingClientRect();
    const z = this.zoom();
    stand.style.left = `${(rect.left - pr.left) / z}px`;
    stand.style.top = `${(rect.top - pr.top) / z}px`;
    stand.style.width = `${rect.width / z}px`;
    stand.style.height = `${rect.height / z}px`;
    stand.innerHTML = html;
    this.root.append(stand);
    this.fly(stand, to, to.querySelectorAll("img"), id).then(() =>
      stand.remove()
    );
  }

  cawAnswers(words) {
    if (S.state !== "fresh") {
      return;
    }
    const reply = turnNode(
      caw([
        words === "What needs me?"
          ? "Nothing in Cawco-Dev waits on you. The nightly check is ready to tag."
          : "On it. I’ll write them as tasks of kind you, one per step of the plan.",
      ])
    );
    this.thread.append(reply);
    this.arrive(reply, D.pop);
    this.working = false;
    this.setPeek("idle");
    this.paintHint();
    this.nameThread();
  }

  send() {
    const words = this.field.value.trim();
    if (!words) {
      return;
    }
    this.field.value = "";
    const turn = turnNode(
      you(words, "14:21", S.state === "cant" ? { kept: true } : {})
    );
    this.thread.hidden = false;
    this.slot("fresh").hidden = true;
    this.thread.append(turn);
    this.hold("tail");
    this.arrive(turn, D.control);
    this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  /* — the ⋯ menu — */

  toggleMenu(open, instant = false) {
    const button = this.root.querySelector('[data-act="more"]');
    if (open === !this.menu.hidden) {
      return;
    }
    button.setAttribute("aria-expanded", String(open));
    for (const a of this.menu.getAnimations()) {
      a.cancel();
    }
    if (open) {
      this.menu.hidden = false;
      run(
        this.menu,
        motionOk()
          ? [
              { opacity: 0, scale: 0.97, translate: "0 -4px" },
              { opacity: 1, scale: 1, translate: "0 0" },
            ]
          : [{ opacity: 0 }, { opacity: 1 }],
        { id: "menu-in", dur: D.pop }
      );
      this.menu.querySelector("button")?.focus({ preventScroll: true });
      return;
    }
    if (instant) {
      this.menu.hidden = true;
      return;
    }
    const out = run(
      this.menu,
      motionOk()
        ? [
            { opacity: 1, scale: 1 },
            { opacity: 0, scale: 0.97 },
          ]
        : [{ opacity: 1 }, { opacity: 0 }],
      { id: "menu-out", dur: D.exit, fill: "forwards" }
    );
    settle(out).then((done) => {
      if (done) {
        this.menu.hidden = true;
      }
    });
  }

  /* — open and close — */

  close() {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.toggleMenu(false, true);
    const target = this.device === "desk" ? this.root : this.host;
    const gone = this.device === "desk" ? "0 calc(-100% - 64px)" : "0 100%";
    const from = getComputedStyle(target).translate;
    for (const a of target.getAnimations()) {
      a.cancel();
    }
    const moving = motionOk();
    const a = run(
      target,
      moving
        ? [{ translate: from === "none" ? "0 0" : from }, { translate: gone }]
        : [{ opacity: 1 }, { opacity: 0 }],
      {
        id: this.device === "desk" ? "close-desk" : "close-phone",
        dur: moving ? D.exit : D.fade,
        fill: "forwards",
      }
    );
    const door = this.host.closest(".device").querySelector("[data-caw-door]");
    door.setAttribute("aria-expanded", "false");
    door.focus({ preventScroll: true });
    this.host
      .closest(".device")
      .querySelector("[data-glass]")
      ?.removeAttribute("data-joined");
    settle(a).then((done) => {
      if (done) {
        target.inert = true;
      }
    });
  }

  reopen() {
    if (this.open) {
      return;
    }
    this.open = true;
    const target = this.device === "desk" ? this.root : this.host;
    const from = getComputedStyle(target).translate;
    for (const a of target.getAnimations()) {
      a.cancel();
    }
    target.inert = false;
    const moving = motionOk();
    const desk = this.device === "desk";
    // Down out of the glass on a desk, up to its stop on a phone, from where it is drawn.
    const shut = desk ? "0 calc(-100% - 64px)" : "0 100%";
    const enter = desk ? D.pop : D.panel;
    run(
      target,
      moving
        ? [{ translate: from === "none" ? shut : from }, { translate: "0 0" }]
        : [{ opacity: 0 }, { opacity: 1 }],
      {
        id: desk ? "open-desk" : "open-phone",
        dur: moving ? enter : D.fade,
        ease: desk ? E.out : E.drawer,
      }
    );
    const device = this.host.closest(".device");
    device
      .querySelector("[data-caw-door]")
      .setAttribute("aria-expanded", "true");
    device.querySelector("[data-glass]")?.setAttribute("data-joined", "");
    this.field.focus({ preventScroll: true });
  }
}

function render(panel) {
  panel.render();
}

/* ── The phone's sheet under a finger: dragged down past a quarter, or flicked, it closes on the house spring ── */

/** The house spring (DESIGN.md Springs): 0.4s perceptual, bounce 0, integrated at 120Hz into keyframes. */
function springFrames(from, to, velocity) {
  const stiffness = ((2 * Math.PI) / 0.4) ** 2;
  const damping = (4 * Math.PI) / 0.4;
  const dt = 1 / 120;
  let x = from;
  let v = velocity * 1000;
  const frames = [x];
  for (let i = 0; i < 240; i += 1) {
    const a = -stiffness * (x - to) - damping * v;
    v += a * dt;
    x += v * dt;
    frames.push(x);
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 5) {
      break;
    }
  }
  frames.push(to);
  return frames;
}

function wireSheet(panel) {
  const sheet = panel.host;
  const grabber = sheet.querySelector(".grabber");
  let start = null;
  grabber.addEventListener("pointerdown", (event) => {
    grabber.setPointerCapture(event.pointerId);
    for (const a of sheet.getAnimations()) {
      a.cancel();
    }
    start = {
      y: event.clientY,
      t: event.timeStamp,
      last: event.clientY,
      lastT: event.timeStamp,
      v: 0,
    };
  });
  grabber.addEventListener("pointermove", (event) => {
    if (!start) {
      return;
    }
    const z = panel.zoom();
    const dy = Math.max(0, (event.clientY - start.y) / z);
    const dt = event.timeStamp - start.lastT;
    if (dt > 0) {
      start.v = (event.clientY - start.last) / z / dt;
    }
    start.last = event.clientY;
    start.lastT = event.timeStamp;
    sheet.style.translate = `0 ${dy}px`;
  });
  const release = (event) => {
    if (!start) {
      return;
    }
    const z = panel.zoom();
    const dy = Math.max(0, (event.clientY - start.y) / z);
    const moved = Math.abs(event.clientY - start.y) > 3;
    const { v } = start;
    start = null;
    if (!moved) {
      sheet.style.translate = "";
      return;
    }
    const h = sheet.offsetHeight;
    const closes = dy > h / 4 || v > 0.5;
    const frames = springFrames(dy, closes ? h : 0, v);
    sheet.style.translate = "";
    const a = sheet.animate(
      frames.map((y) => ({ translate: `0 ${y}px` })),
      {
        id: closes ? "sheet-spring-close" : "sheet-spring-back",
        duration: frames.length * (1000 / 120),
        easing: "linear",
        fill: "forwards",
      }
    );
    if (closes) {
      panel.open = false;
      sheet
        .closest(".device")
        .querySelector("[data-caw-door]")
        .setAttribute("aria-expanded", "false");
      settle(a).then((done) => {
        if (done) {
          sheet.inert = true;
        }
      });
    } else {
      settle(a).then(() => a.cancel());
    }
  };
  grabber.addEventListener("pointerup", release);
  grabber.addEventListener("pointercancel", release);
  grabber.addEventListener("click", (event) => event.preventDefault());
}

/* ── The switches ─────────────────────────────────────────────────── */

const MOMENTS = {
  rest: [["Caw names the thread", (p) => p.nameThread()]],
  needs: [
    ["Land the card again", (p) => p.landCard()],
    ["A delegate asks", (p) => p.delegateAsks(), true],
  ],
  docked: [["A delegate asks", (p) => p.delegateAsks(), true]],
  cant: [["Caw can start again", (p) => p.leaveCant(), false, "rest"]],
  scrolled: [],
  fresh: [],
};

function paintMoments() {
  const box = document.querySelector(".moments");
  for (const old of box.querySelectorAll(".moment")) {
    old.remove();
  }
  for (const [label, act, counts, next] of MOMENTS[S.state]) {
    const b = el("button", "moment");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      if (counts) {
        S.delegates += 1;
      }
      for (const p of panels) {
        p.reopen();
        act(p);
      }
      if (counts) {
        drawArcs();
      }
      if (next) {
        S.state = next;
        document.querySelector(`input[name="state"][value="${next}"]`).checked =
          true;
        paintMoments();
        drawArcs();
      }
    });
    box.append(b);
  }
}

function setState(next) {
  const prev = S.state;
  if (next === "fresh" && prev !== "fresh") {
    S.state = next;
    document.querySelector('input[name="state"][value="fresh"]').checked = true;
    for (const p of panels) {
      p.reopen();
      p.newThread();
    }
    paintAfterState();
    return;
  }
  S.state = next;
  S.delegates = 0;
  S.answered.clear();
  for (const p of panels) {
    p.working = false;
    p.reopen();
    if (next === "cant" && prev !== "cant") {
      p.enterCant();
    } else {
      p.render();
    }
    if (next === "needs") {
      p.landCard();
    }
    if (next === "docked") {
      const s = p.scroller;
      const distance = s.scrollHeight - s.clientHeight - s.scrollTop;
      p.scrollBy(distance, "scroll-to-tail", D.panel, E.inOut);
    }
  }
  paintAfterState();
}

function paintAfterState() {
  document.querySelector('[data-control="cause"]').hidden = S.state !== "cant";
  paintMoments();
  drawArcs();
}

function fitDevices() {
  const narrow = innerWidth < 900;
  for (const d of document.querySelectorAll(".device")) {
    const w = d.offsetWidth;
    const fit = narrow
      ? Math.min(1, document.documentElement.clientWidth / w)
      : 1;
    d.style.setProperty("--fit", String(fit));
  }
}

/** What each switch does to both panels. */
const SWITCHES = {
  state: (value) => setState(value),
  cause: (value) => {
    S.cause = value;
    for (const p of panels) {
      p.paintBlock(true);
      p.paintHint();
    }
  },
  arcs: (value) => {
    S.arcs = value;
    for (const p of panels) {
      p.resizeStack(() => undefined, { grow: value === "B", id: "signpost" });
      p.onScroll();
    }
    drawArcs();
  },
  block: (value) => {
    S.block = value;
    for (const p of panels) {
      p.root.dataset.block = value;
      p.measureDock();
    }
  },
  theme: (value) => {
    // Drawn at once in the new scheme: no colour transition rides the flip.
    root.dataset.flipping = "";
    root.classList.toggle("dark", value === "dark");
    root.getBoundingClientRect();
    requestAnimationFrame(() => {
      delete root.dataset.flipping;
    });
  },
  motion: (value) => {
    root.dataset.motion = value;
  },
  show: (value) => {
    document.querySelector(".stage").dataset.show = value;
    fitDevices();
  },
};

function init() {
  const deskHost = document.querySelector(".desk [data-panel-host]");
  const phoneHost = document.querySelector(".phone [data-panel-host]");
  panels.push(new Panel(deskHost, "desk"), new Panel(phoneHost, "phone"));
  wireSheet(panels[1]);
  document.querySelector("[data-glass]").setAttribute("data-joined", "");

  for (const door of document.querySelectorAll("[data-caw-door]")) {
    door.addEventListener("click", () => {
      const { device } = door.closest(".device").dataset;
      const panel = panels.find((p) => p.device === device);
      if (panel.open) {
        panel.close();
      } else {
        panel.reopen();
      }
    });
  }

  document.querySelector(".controls").addEventListener("change", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      SWITCHES[input.name]?.(input.value);
    }
  });

  addEventListener("resize", fitDevices);
  fitDevices();
  for (const p of panels) {
    p.render();
  }
  paintAfterState();
}

// The probe and the owner's console reach the same handles.
window.cawPreview = { S, panels, setState, D, E };

if (document.fonts?.ready) {
  document.fonts.ready.then(init);
} else {
  init();
}
