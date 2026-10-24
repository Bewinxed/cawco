/*
 * The list's motion, report 7932615d §7, built from the matching
 * transitions.dev recipes and set on the house tokens (DESIGN.md, Motion
 * grammar): every run is a Web Animation or a CSS transition, so the probe
 * holds it on one clock and seeks it.
 *
 * - A row changing group: the house reflow (FLIP, The Nothing Jumps Rule) on
 *   --dur-panel / --ease-in-out; its fact by Text swap soft; the counts by
 *   Number pop-in.
 * - A group folding: Accordion expand (grid rows 0fr to 1fr, the chevron's
 *   scaleY flip), --dur-reveal open, --dur-exit shut.
 * - Search filtering: departures close while fading (--dur-exit), survivors
 *   slide (--dur-panel), matched card lines grow (Accordion, --dur-reveal).
 * - The done delight: Donut chart's ring morph, Icon swap to the done glyph
 *   and Number pop-in's changed digits, one start, --dur-morph, --ease-out
 *   (The Steady Swap Rule).
 * - The first read: Skeleton loader and reveal (400ms cross-fade, 2px cross-blur).
 * - Opening a page: the title flies into the page's head (The One Object
 *   Rule), --dur-panel on --ease-drawer.
 */
import { CIRC } from "./list.js";
import { ICONS } from "./icons.js";

const ROOT = document.documentElement;
const token = (name) => getComputedStyle(ROOT).getPropertyValue(name).trim();
const ms = (name) => {
  const value = token(name);
  return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
};
const px = (name) => Number.parseFloat(token(name));

export const motionOk = () =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;

/** How much a frame is drawn scaled: its rects are the screen's, its translations its own. */
const scaleOf = (el) => {
  const frame = el.closest(".frame");
  return frame ? frame.getBoundingClientRect().width / frame.offsetWidth : 1;
};

const keyOf = (el) =>
  el.dataset.page ? `row:${el.dataset.page}` : `group:${el.closest("[data-group]")?.dataset.group}`;

/** Slides each element from where it stood to where it stands (FLIP), on one clock. */
function slide(els, before, scale, { dur = "--dur-panel", ease = "--ease-in-out" } = {}) {
  const runs = [];
  for (const el of els) {
    const was = before.get(keyOf(el));
    if (!was) {
      continue;
    }
    const now = el.getBoundingClientRect();
    const dy = (was.top - now.top) / scale;
    if (Math.abs(dy) < 0.5) {
      continue;
    }
    if (!motionOk()) {
      continue;
    }
    runs.push(
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        { duration: ms(dur), easing: token(ease) }
      )
    );
  }
  return runs;
}

const byKey = (root) => {
  const map = new Map();
  for (const el of root.querySelectorAll("[data-row], .ghead")) {
    map.set(keyOf(el), el.getBoundingClientRect());
  }
  return map;
};

/** Text swap soft: the old words blur out while the new blur in, in one cell, both at once. */
export function softSwap(el, html, dur = "--dur-fade") {
  if (!motionOk()) {
    el.innerHTML = html;
    return;
  }
  const out = document.createElement("span");
  out.className = "swap-old";
  out.setAttribute("aria-hidden", "true");
  out.innerHTML = el.innerHTML;
  const inn = document.createElement("span");
  inn.className = "swap-new";
  inn.innerHTML = html;
  el.replaceChildren(out, inn);
  el.style.display = "inline-grid";
  for (const child of [out, inn]) {
    child.style.gridArea = "1 / 1";
    child.style.whiteSpace = "nowrap";
  }
  const blur = token("--skeleton-reveal-blur");
  const timing = { duration: ms(dur), easing: token("--ease-crossfade") };
  out.animate(
    [
      { opacity: 1, filter: "blur(0)" },
      { opacity: 0, filter: `blur(${blur})` },
    ],
    { ...timing, fill: "forwards" }
  );
  const run = inn.animate(
    [
      { opacity: 0, filter: `blur(${blur})` },
      { opacity: 1, filter: "blur(0)" },
    ],
    timing
  );
  run.finished
    .then(() => {
      el.style.removeProperty("display");
      el.innerHTML = html;
    })
    .catch(() => undefined);
}

/** Number pop-in: the changed digits rise in from --space-1 out of a 2px blur. */
export function pop(el, text) {
  const before = el.textContent;
  el.textContent = text;
  if (!motionOk() || before === text) {
    return;
  }
  el.animate(
    [
      {
        transform: `translateY(${px("--space-1")}px)`,
        opacity: 0,
        filter: `blur(${token("--skeleton-reveal-blur")})`,
      },
      { transform: "none", opacity: 1, filter: "blur(0)" },
    ],
    { duration: ms("--dur-morph"), easing: token("--ease-out") }
  );
}

/* ------------------------------------------------- a row changing group */

/** He sends "How CawCo knows you're here": its row slides from Open to the head of Sent. */
export function sendRow(frame) {
  const list = frame.querySelector("[data-list]");
  const row = list?.querySelector('[data-page="owner-presence"]');
  const sent = list?.querySelector('[data-group="sent"]');
  if (!(row && sent)) {
    return;
  }
  const scale = scaleOf(list);
  const before = byKey(list);
  sent.querySelector(".ghead").after(row);
  row.dataset.standing = "sent";
  row.querySelector(".ring").setAttribute("class", "ring sent");
  row.querySelector(".act")?.remove();
  const fact = row.querySelector("[data-fact]");
  softSwap(fact, '<span data-heard-fact="unread">7 of 7 · not read yet</span>');
  softSwap(row.querySelector(".age"), "now");
  const open = list.querySelector('[data-group="open"]');
  const counts = [
    [open, open.querySelectorAll("[data-row]").length],
    [sent, sent.querySelectorAll("[data-row]").length],
  ];
  for (const [group, n] of counts) {
    group.dataset.count = String(n);
    const count = group.querySelector(".ghead .count");
    if (count) {
      pop(count, String(n));
    }
  }
  const badge = frame.querySelector("[data-badge]");
  if (badge) {
    pop(badge, String(counts[0][1]));
  }
  slide(list.querySelectorAll("[data-row], .ghead"), before, scale);
  if (!motionOk()) {
    // Reduced motion: list changes only fade.
    row.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ms("--dur-fade"),
      easing: token("--ease-out"),
    });
  }
}

/* ------------------------------------------------------ a group folding */

export function toggleFold(frame, key) {
  const fold = frame.querySelector(`[data-fold="${key}"]`);
  if (!fold) {
    return;
  }
  const open = !fold.hasAttribute("data-open");
  fold.toggleAttribute("data-open", open);
  fold.toggleAttribute("inert", !open);
  const toggle =
    frame.querySelector(`[data-fold-toggle="${key}"]`) ??
    frame.querySelector(`[data-more="${key}"]`);
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    const words = toggle.querySelector("span");
    if (toggle.dataset.foldToggle) {
      words.textContent = open ? "Hide closed" : "Show closed";
    } else {
      toggle.dataset.words ??= words.textContent;
      words.textContent = open ? "Show fewer" : toggle.dataset.words;
    }
  }
}

/* ---------------------------------------------------- search filtering */

/**
 * The query lands: the pane is drawn for it, survivors slide from where they
 * stood, departures close while fading in ghosts over the list, and the
 * matched card lines grow open.
 */
export function filterTo(frame, drawPane) {
  const pane = frame.querySelector("[data-pane]");
  const list = pane.querySelector("[data-list]");
  if (!list) {
    drawPane();
    return;
  }
  const scale = scaleOf(pane);
  const before = byKey(list);
  const paneBox = pane.getBoundingClientRect();
  const columns = getComputedStyle(list).gridTemplateColumns;
  const gap = getComputedStyle(list).columnGap;
  const leaving = [...list.querySelectorAll("[data-row], .ghead")].map((el) => ({
    el: el.cloneNode(true),
    key: keyOf(el),
    box: el.getBoundingClientRect(),
    shown: el.getBoundingClientRect().height > 0 && !el.closest("[inert]"),
  }));
  drawPane();
  const next = pane.querySelector("[data-list]");
  if (!next) {
    return;
  }
  const kept = new Set(
    [...next.querySelectorAll("[data-row], .ghead")].map((el) => keyOf(el))
  );
  pane.style.position = "relative";
  if (motionOk()) {
    for (const ghost of leaving) {
      if (kept.has(ghost.key) || !ghost.shown) {
        continue;
      }
      const el = ghost.el;
      el.classList.add("ghost-row");
      el.removeAttribute("data-hover");
      el.setAttribute("aria-hidden", "true");
      el.inert = true;
      Object.assign(el.style, {
        top: `${(ghost.box.top - paneBox.top) / scale}px`,
        left: `${(ghost.box.left - paneBox.left) / scale}px`,
        width: `${ghost.box.width / scale}px`,
        height: `${ghost.box.height / scale}px`,
        gridTemplateColumns: columns,
        columnGap: gap,
      });
      pane.append(el);
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: ms("--dur-exit"),
        easing: token("--ease-out"),
        fill: "forwards",
      }).finished.then(() => el.remove(), () => el.remove());
    }
  }
  slide(next.querySelectorAll("[data-row], .ghead"), before, scale);
  for (const hits of next.querySelectorAll("[data-hits]")) {
    if (!motionOk()) {
      break;
    }
    const h = hits.getBoundingClientRect().height / scale;
    hits.style.overflow = "clip";
    hits
      .animate(
        [
          { blockSize: "0px", opacity: 0 },
          { blockSize: `${h}px`, opacity: 1 },
        ],
        { duration: ms("--dur-reveal"), easing: token("--ease-out") }
      )
      .finished.then(
        () => hits.style.removeProperty("overflow"),
        () => undefined
      );
  }
}

/* ------------------------------------------------------- the done delight */

const doneGlyph = `<span class="g-done swap-glyph" role="img" aria-label="Built"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS.done}</svg></span>`;

/**
 * The last task of "Commenting" lands: the ring closes, the mark swaps to the
 * done glyph and "4 of 5" gives way to "5", all on one start (--dur-morph).
 */
export function deliver(frame, { prime = false } = {}) {
  const row = frame.querySelector('[data-page="commenting"]');
  if (!row) {
    return;
  }
  const mark = row.querySelector("[data-mark]");
  const tasks = row.querySelector("[data-tasks]");
  if (prime) {
    const arc = mark.querySelector(".arc");
    arc?.setAttribute("stroke-dashoffset", String(CIRC * (1 - 4 / 5)));
    tasks.textContent = "4 of 5 tasks done";
    return;
  }
  const ring = mark.querySelector(".ring");
  const arc = ring?.querySelector(".arc");
  if (!(ring && arc)) {
    return;
  }
  mark.style.display = "grid";
  ring.style.gridArea = "1 / 1";
  mark.insertAdjacentHTML("beforeend", doneGlyph);
  const glyph = mark.querySelector(".swap-glyph");
  glyph.style.gridArea = "1 / 1";
  const timing = { duration: ms("--dur-morph"), easing: token("--ease-out") };
  const blur = token("--skeleton-reveal-blur");
  const settle = () => {
    ring.remove();
    mark.style.removeProperty("display");
    glyph.style.removeProperty("grid-area");
  };
  if (!motionOk()) {
    glyph.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    ring.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: "forwards" })
      .finished.then(settle, () => undefined);
    softSwap(tasks, "5 tasks done", "--dur-morph");
    return;
  }
  const from = Number(arc.getAttribute("stroke-dashoffset"));
  arc.animate([{ strokeDashoffset: from }, { strokeDashoffset: 0 }], {
    ...timing,
    fill: "forwards",
  });
  ring
    .animate(
      [
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: "scale(0.25)", filter: `blur(${blur})` },
      ],
      { ...timing, fill: "forwards" }
    )
    .finished.then(settle, () => undefined);
  glyph.animate(
    [
      { opacity: 0, transform: "scale(0.25)", filter: `blur(${blur})` },
      { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
    ],
    timing
  );
  // The changed digits only: "4 of 5" gives way to "5"; " tasks done" holds still.
  tasks.innerHTML = '<span class="dg"></span><span> tasks done</span>';
  const digits = tasks.querySelector(".dg");
  digits.textContent = "4 of 5";
  pop(digits, "5");
}

/* ------------------------------------------------------ the first read */

/** The skeleton gives way to the list in the recipe's reveal: 400ms, a 2px cross-blur. */
export function reveal(frame, drawPane) {
  const pane = frame.querySelector("[data-pane]");
  const skeleton = pane.querySelector("[data-skeleton]");
  const scale = scaleOf(pane);
  const box = skeleton?.getBoundingClientRect();
  const paneBox = pane.getBoundingClientRect();
  const ghost = skeleton?.cloneNode(true);
  drawPane();
  const list = pane.querySelector("[data-list]");
  if (!(list && ghost && box && motionOk())) {
    return;
  }
  pane.style.position = "relative";
  ghost.removeAttribute("data-skeleton");
  ghost.classList.add("ghost-row");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    top: `${(box.top - paneBox.top) / scale}px`,
    left: `${(box.left - paneBox.left) / scale}px`,
    width: `${box.width / scale}px`,
  });
  pane.append(ghost);
  const blur = token("--skeleton-reveal-blur");
  const timing = {
    duration: ms("--dur-skeleton-reveal"),
    easing: token("--ease-crossfade"),
  };
  ghost
    .animate(
      [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: `blur(${blur})` },
      ],
      { ...timing, fill: "forwards" }
    )
    .finished.then(() => ghost.remove(), () => ghost.remove());
  list.animate(
    [
      { opacity: 0, filter: `blur(${blur})` },
      { opacity: 1, filter: "blur(0)" },
    ],
    timing
  );
}

/* ---------------------------------------------------- opening a page */

/** The row's title flies into the page's head; the rest of the page fades in under it. */
export function openPage(frame, name, drawPane) {
  const from = frame
    .querySelector(`[data-row][data-page="${name}"] [data-title] .t`)
    ?.getBoundingClientRect();
  drawPane();
  const title = frame.querySelector("[data-dtitle]");
  const page = frame.querySelector("[data-dpage]");
  if (!(from && title && page)) {
    return;
  }
  const scale = scaleOf(title);
  const to = title.getBoundingClientRect();
  const fade = { duration: ms("--dur-fade"), easing: token("--ease-out") };
  if (!motionOk()) {
    page.animate([{ opacity: 0 }, { opacity: 1 }], fade);
    return;
  }
  const s = from.height / to.height;
  title.style.transformOrigin = "0 0";
  title.animate(
    [
      {
        transform: `translate(${(from.left - to.left) / scale}px, ${(from.top - to.top) / scale}px) scale(${s})`,
      },
      { transform: "none" },
    ],
    { duration: ms("--dur-panel"), easing: token("--ease-drawer") }
  );
  for (const part of page.querySelectorAll(".dback, .dmeta, .banner, .dcard")) {
    part.animate([{ opacity: 0 }, { opacity: 1 }], fade);
  }
}
